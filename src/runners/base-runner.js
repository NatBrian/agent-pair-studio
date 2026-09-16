import { spawn } from 'node:child_process';
import { terminateProcessTree } from '../utils/process-supervisor.js';
import { redactSecrets } from '../utils/security.js';

export function escapeCmdArg(arg) {
  if (typeof arg !== 'string') return String(arg);
  if (/[\s"^&|<>]/.test(arg) || arg.includes('\n')) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
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

      const safeArgs = args.map(escapeCmdArg);
      const child = spawn(command, safeArgs, {
        cwd: this.cwd,
        windowsHide: true,
        shell: true,
        env: {
          ...process.env,
          CI: '1',
          FORCE_COLOR: '1'
        }
      });

      this.currentPid = child.pid;

      const timer = setTimeout(async () => {
        timedOut = true;
        await terminateProcessTree(child.pid);
        reject(new Error(`Process timed out after ${this.timeoutSeconds} seconds`));
      }, this.timeoutSeconds * 1000);

      child.stdout.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString('utf-8'));
        rawStdout += text;
        onTerminalOutput(text);
        this.parseNdjsonChunk(text, onEvent);
      });

      child.stderr.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString('utf-8'));
        rawStderr += text;
        onTerminalOutput(text);
      });

      child.on('error', async (err) => {
        clearTimeout(timer);
        this.currentPid = null;
        reject(err);
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        this.currentPid = null;
        if (!timedOut) {
          resolve({
            exitCode: exitCode ?? 0,
            rawStdout,
            rawStderr,
            text: this.extractAssistantText(rawStdout, rawStderr)
          });
        }
      });
    });
  }

  async cancel() {
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
          if (parsed.text) textParts.push(parsed.text);
          if (parsed.content) textParts.push(parsed.content);
          if (parsed.message) textParts.push(parsed.message);
          if (parsed.response) textParts.push(parsed.response);
        } catch {}
      }
    }
    if (textParts.length > 0) return textParts.join('\n');
    const cleanOut = stdout.trim();
    if (cleanOut) return cleanOut;
    const cleanErr = stderr.trim();
    if (cleanErr) return cleanErr;
    return '';
  }
}
