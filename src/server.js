import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { config } from './config.js';
import { listSessions, loadSession, saveSession } from './storage/session-store.js';
import { TurnOrchestrator } from './orchestrator/turn-orchestrator.js';
import { rollbackToCommit, checkoutSessionBranch, getCurrentBranch } from './git/checkpoint-engine.js';

export function createServerApp({ port = config.PORT, workspaceDir = config.WORKSPACE_DIR } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(resolve(process.cwd(), 'public')));

  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const orchestrator = new TurnOrchestrator({ workspaceDir });

  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  }

  // Forward orchestrator events to WebSocket clients
  orchestrator.on('turn_start', (data) => broadcast('turn_start', data));
  orchestrator.on('agent_event', (data) => broadcast('agent_event', data));
  orchestrator.on('terminal_output', (data) => broadcast('terminal_output', data));
  orchestrator.on('turn_end', async (data) => {
    broadcast('turn_end', data);
    if (orchestrator.session) {
      await saveSession(orchestrator.session);
    }
  });
  orchestrator.on('completed', (data) => broadcast('completed', data));
  orchestrator.on('paused_for_human', (data) => broadcast('paused_for_human', data));
  orchestrator.on('paused', () => broadcast('paused', {}));
  orchestrator.on('resumed', () => broadcast('resumed', {}));
  orchestrator.on('stopped', () => broadcast('stopped', {}));
  orchestrator.on('turn_error', (data) => broadcast('turn_error', data));

  // REST endpoints
  app.get('/api/sessions', async (req, res) => {
    const list = await listSessions();
    res.json(list);
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const data = await loadSession(req.params.id);
      res.json(data);
    } catch {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  async function buildFileTree(dir, baseDir = dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const fullPath = resolve(dir, entry.name);
        const relPath = fullPath.replace(baseDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
        if (entry.isDirectory()) {
          items.push({ name: entry.name, path: relPath, type: 'directory', children: await buildFileTree(fullPath, baseDir) });
        } else {
          items.push({ name: entry.name, path: relPath, type: 'file' });
        }
      }
      return items;
    } catch {
      return [];
    }
  }

  app.get('/api/config', (req, res) => {
    res.json({
      port: config.PORT,
      workspaceDir,
      defaultModels: config.DEFAULT_MODELS,
      availableFreeModels: config.AVAILABLE_FREE_MODELS
    });
  });

  app.get('/api/workspace/files', async (req, res) => {
    try {
      const tree = await buildFileTree(workspaceDir);
      res.json(tree);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/workspace/file', async (req, res) => {
    const rel = req.query.path;
    if (!rel || rel.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    try {
      const content = await readFile(resolve(workspaceDir, rel), 'utf-8');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  app.get('/api/workspace/branch', async (req, res) => {
    try {
      const branch = await getCurrentBranch(workspaceDir);
      res.json({ branch });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const { action, payload } = JSON.parse(message);
        if (action === 'start_session') {
          await orchestrator.startSession(payload);
        } else if (action === 'pause') {
          orchestrator.pause();
        } else if (action === 'resume') {
          orchestrator.resume();
        } else if (action === 'stop') {
          await orchestrator.stop();
        } else if (action === 'human_message') {
          orchestrator.injectHumanMessage(payload.text, payload.mode);
        } else if (action === 'select_session') {
          const sessionData = await loadSession(payload.sessionId);
          if (sessionData) {
            if (sessionData.branch) {
              await checkoutSessionBranch(workspaceDir, sessionData.branch);
            }
            orchestrator.loadSession(sessionData);
            const currentBranch = await getCurrentBranch(workspaceDir);
            broadcast('session_selected', { ...sessionData, currentBranch });
            broadcast('workspace_files_updated', { branch: currentBranch });
          }
        } else if (action === 'terminal_input') {
          const rawCmd = (payload.command || '').trim();
          if (rawCmd) {
            broadcast('terminal_output', {
              userCommand: true,
              command: rawCmd,
              chunk: `\r\n\x1b[1;32m$ ${rawCmd}\x1b[0m\r\n`
            });
            try {
              const child = exec(rawCmd, { cwd: workspaceDir, env: { ...process.env, FORCE_COLOR: '1' }, timeout: 30000 });
              child.stdout?.on('data', (data) => {
                broadcast('terminal_output', { chunk: data.toString(), isStdout: true });
              });
              child.stderr?.on('data', (data) => {
                broadcast('terminal_output', { chunk: `\x1b[31m${data.toString()}\x1b[0m`, isStderr: true });
              });
              child.on('close', async (code) => {
                const currentBranch = await getCurrentBranch(workspaceDir);
                broadcast('terminal_output', {
                  chunk: `\r\n\x1b[90m[exit code ${code ?? 0}]\x1b[0m\r\n`,
                  exitCode: code ?? 0
                });
                broadcast('workspace_files_updated', { branch: currentBranch });
              });
            } catch (cmdErr) {
              broadcast('terminal_output', { chunk: `\r\n\x1b[1;31mError: ${cmdErr.message}\x1b[0m\r\n` });
            }
          }
        } else if (action === 'rollback') {
          await rollbackToCommit(workspaceDir, payload.commitHash);
          broadcast('workspace_rollback', { commitHash: payload.commitHash });
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      }
    });
  });

  return { app, server, wss, orchestrator };
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const { server } = createServerApp();
  server.listen(config.PORT, () => {
    console.log(`\n🐙 Agent Collab Studio is running on http://localhost:${config.PORT}\n`);
  });
}
