import { BaseRunner } from './base-runner.js';
import { config } from '../config.js';

export class KiloRunner extends BaseRunner {
  constructor({ cwd, model = config.DEFAULT_MODELS.kilo, timeoutSeconds = config.LOOP_LIMITS.TURN_TIMEOUT_SECONDS } = {}) {
    super({ cwd, timeoutSeconds });
    this.model = model;
    this.cliCmd = config.KILO_CMD;
  }

  buildArgs(prompt, sessionId) {
    // CRITICAL: --pure MUST precede run to prevent background title hangs
    const args = ['--pure', 'run', prompt, '--dir', this.cwd, '--auto', '--format', 'json'];
    if (this.model) {
      args.push('-m', this.model);
    }
    if (sessionId === true || sessionId === 'continue' || sessionId === '-c') {
      args.push('-c');
    } else if (sessionId && !sessionId.startsWith('kilo-sess-') && !sessionId.startsWith('new:')) {
      args.push('--session', sessionId);
    }
    return args;
  }

  async executeTurn(prompt, sessionId, onEvent, onTerminalOutput) {
    const args = this.buildArgs(prompt, sessionId);
    return this.run(this.cliCmd, args, onEvent, onTerminalOutput);
  }
}
