import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { terminateProcessTree } from '../utils/process-supervisor.js';
import { redactSecrets } from '../utils/security.js';

export function escapeCmdArg(arg) {
  if (typeof arg !== 'string') return String(arg);
  if (/[\s"^&|<>]/.test(arg) || arg.includes('\n')) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

export function resolveCliCommand(command, args = []) {
  const isWindows = process.platform === 'win32';
  const appData = process.env.APPDATA || '';

  if (command === 'kilo') {
    if (process.env.KILO_BIN_PATH && existsSync(process.env.KILO_BIN_PATH)) {
      return { executable: process.env.KILO_BIN_PATH, args, shell: false };
    }
    if (isWindows) {
      const exe = join(appData, 'npm', 'node_modules', '@kilocode', 'cli', 'node_modules', '@kilocode', 'cli-windows-x64', 'bin', 'kilo.exe');
      if (existsSync(exe)) {
        return { executable: exe, args, shell: false };
      }
      const js = join(appData, 'npm', 'node_modules', '@kilocode', 'cli', 'bin', 'kilo');
      if (existsSync(js)) {
        return { executable: process.execPath, args: [js, ...args], shell: false };
      }
    }
  }

  if (command === 'cline') {
    if (process.env.CLINE_BIN_PATH && existsSync(process.env.CLINE_BIN_PATH)) {
      return { executable: process.env.CLINE_BIN_PATH, args, shell: false };
    }
    if (isWindows) {
      const exe = join(appData, 'npm', 'node_modules', 'cline', 'node_modules', '@cline', 'cli-windows-x64', 'bin', 'cline.exe');
      if (existsSync(exe)) {
        return { executable: exe, args, shell: false };
      }
      const js = join(appData, 'npm', 'node_modules', 'cline', 'bin', 'cline');
      if (existsSync(js)) {
        return { executable: process.execPath, args: [js, ...args], shell: false };
      }
    }
  }

  if (existsSync(command)) {
    if (command.endsWith('.js') || command.endsWith('.cjs') || command.endsWith('.mjs')) {
      return { executable: process.execPath, args: [command, ...args], shell: false };
    }
    return { executable: command, args, shell: false };
  }

  return {
    executable: command,
    args,
    shell: isWindows && !command.endsWith('.exe')
  };
}

export class BaseRunner {
  constructor({ cwd, timeoutSeconds = 180 } = {}) {
    this.cwd = cwd;
    this.timeoutSeconds = timeoutSeconds;
    this.currentPid = null;
  }

  run(command, args, onEvent = () => {}, onTerminalOutput = () => {}) {
    return new Promise((resolve, reject) => {
      let rawStdout = '';
      let rawStderr = '';
      let timedOut = false;

      const { executable, args: finalArgs, shell } = resolveCliCommand(command, args);
      const spawnArgs = (shell && process.platform === 'win32') ? finalArgs.map(escapeCmdArg) : finalArgs;
      const child = spawn(executable, spawnArgs, {
        cwd: this.cwd,
        windowsHide: true,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CI: '1',
          FORCE_COLOR: '1'
        }
      });

      this.currentPid = child.pid;

      let activityTimer = null;
      const resetActivityTimer = () => {
        if (activityTimer) clearTimeout(activityTimer);
        activityTimer = setTimeout(async () => {
          timedOut = true;
          await terminateProcessTree(child.pid);
          reject(new Error(`Process timed out after ${this.timeoutSeconds} seconds of inactivity`));
        }, this.timeoutSeconds * 1000);
      };

      resetActivityTimer();

      child.stdout.on('data', (chunk) => {
        resetActivityTimer();
        const text = redactSecrets(chunk.toString('utf-8'));
        rawStdout += text;
        onTerminalOutput(text);
        this.parseNdjsonChunk(text, onEvent);
      });

      child.stderr.on('data', (chunk) => {
        resetActivityTimer();
        const text = redactSecrets(chunk.toString('utf-8'));
        rawStderr += text;
        onTerminalOutput(text);
      });

      child.on('error', async (err) => {
        if (activityTimer) clearTimeout(activityTimer);
        this.currentPid = null;
        reject(err);
      });

      child.on('close', (exitCode) => {
        if (activityTimer) clearTimeout(activityTimer);
        this.currentPid = null;
        if (!timedOut) {
          resolve({
            exitCode: exitCode ?? 0,
            rawStdout,
            rawStderr,
            wasCancelled: !!this.wasCancelled,
            text: this.extractAssistantText(rawStdout, rawStderr)
          });
        }
      });
    });
  }

  async cancel() {
    this.wasCancelled = true;
    if (this.currentPid) {
      await terminateProcessTree(this.currentPid);
      this.currentPid = null;
    }
  }

  parseNdjsonChunk(text, onEvent) {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
      try {
        const parsed = JSON.parse(trimmed);
        onEvent(parsed);
      } catch {}
    }
  }

  extractAssistantText(stdout, stderr = '') {
    const lines = stdout.split('\n');
    const textParts = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          // 0. Cline run_result or final agent done event
          if (parsed.type === 'run_result' && typeof parsed.text === 'string' && parsed.text.trim()) {
            return parsed.text.trim();
          }
          if (parsed.type === 'agent_event' && parsed.event && parsed.event.type === 'done' && typeof parsed.event.text === 'string' && parsed.event.text.trim()) {
            return parsed.event.text.trim();
          }
          // 1. Kilo NDJSON format: { type: 'text', part: { text: '...' } }
          if (parsed.part && typeof parsed.part.text === 'string') {
            const t = parsed.part.text.trim();
            if (t) textParts.push(t);
          }
          // 2. Cline format or standard assistant message
          else if (typeof parsed.text === 'string') {
            const t = parsed.text.trim();
            if (t) textParts.push(t);
          }
          else if (typeof parsed.content === 'string') {
            const t = parsed.content.trim();
            if (t) textParts.push(t);
          }
          else if (typeof parsed.message === 'string') {
            const t = parsed.message.trim();
            if (t) textParts.push(t);
          }
          else if (typeof parsed.response === 'string') {
            const t = parsed.response.trim();
            if (t) textParts.push(t);
          }
        } catch {}
      }
    }
    if (textParts.length > 0) return textParts.join('\n\n');
    const cleanOut = stdout.trim();
    if (cleanOut) return cleanOut;
    return '';
  }
}
