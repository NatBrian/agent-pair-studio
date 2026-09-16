import { BaseRunner } from './base-runner.js';
import { config } from '../config.js';

export class ClineRunner extends BaseRunner {
  constructor({ cwd, model = config.DEFAULT_MODELS.cline, timeoutSeconds = config.LOOP_LIMITS.TURN_TIMEOUT_SECONDS } = {}) {
    super({ cwd, timeoutSeconds });
    this.model = model;
    this.cliCmd = config.CLINE_CMD;
  }

  buildArgs(prompt, sessionId) {
    const args = [prompt, '-c', this.cwd, '--auto-approve', 'true', '--yolo', '--json'];
    if (this.model) {
      args.push('-m', this.model);
    }
    if (sessionId && !sessionId.startsWith('cline-sess-') && !sessionId.startsWith('new:')) {
      args.push('--id', sessionId);
    }
    return args;
  }

  async executeTurn(prompt, sessionId, onEvent, onTerminalOutput) {
    const args = this.buildArgs(prompt, sessionId);
    return this.run(this.cliCmd, args, onEvent, onTerminalOutput);
  }
}
