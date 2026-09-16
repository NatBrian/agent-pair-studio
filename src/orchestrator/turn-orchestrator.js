import { EventEmitter } from 'node:events';
import { KiloRunner } from '../runners/kilo-runner.js';
import { ClineRunner } from '../runners/cline-runner.js';
import { commitTurn, createSessionBranch, getTurnDiff, initWorkspace } from '../git/checkpoint-engine.js';
import { classifyError } from '../utils/error-classifier.js';
import { config } from '../config.js';

export class TurnOrchestrator extends EventEmitter {
  constructor({ workspaceDir } = {}) {
    super();
    this.workspaceDir = workspaceDir || config.WORKSPACE_DIR;
    this.state = 'IDLE'; // IDLE, RUNNING, PAUSED, COMPLETED, ERROR
    this.currentTurn = 0;
    this.activeAgent = 'kilo'; // Kilo starts, then Cline
    this.session = null;
    this.whisperQueues = { kilo: [], cline: [] };
    this.broadcastQueue = [];
    this.runnerInstance = null;
  }

  parseHandoff(text = '') {
    if (/<TASK_COMPLETE>/i.test(text)) return 'TASK_COMPLETE';
    const match = text.match(/<NEED_HUMAN\s+question=["']([^"']+)["']\s*\/?>/i);
    if (match) {
      return { type: 'NEED_HUMAN', question: match[1] };
    }
    return 'HANDOFF';
  }

  injectHumanMessage(text, mode = 'broadcast') {
    if (mode === 'whisper_kilo') {
      this.whisperQueues.kilo.push(text);
    } else if (mode === 'whisper_cline') {
      this.whisperQueues.cline.push(text);
    } else {
      this.broadcastQueue.push(text);
    }
  }

  consumeHumanInput(agent) {
    const parts = [];
    if (this.broadcastQueue.length > 0) {
      parts.push(`[Human Overseer]: ${this.broadcastQueue.join('\n')}`);
      this.broadcastQueue = [];
    }
    if (this.whisperQueues[agent] && this.whisperQueues[agent].length > 0) {
      parts.push(`[Human Whisper]: ${this.whisperQueues[agent].join('\n')}`);
      this.whisperQueues[agent] = [];
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }

  async startSession({ topic, isIdeation = false, kiloModel, clineModel }) {
    await initWorkspace(this.workspaceDir);
    const sessionId = `sess-${Date.now()}`;
    const slug = isIdeation ? 'agent-ideation' : (topic || 'session').slice(0, 20);
    const branch = await createSessionBranch(this.workspaceDir, sessionId, slug);

    this.session = {
      id: sessionId,
      topic: topic || (isIdeation ? 'Agent-Initiated Ideation' : 'Collaborative Task'),
      branch,
      kiloSessionId: `kilo-${sessionId}`,
      clineSessionId: `cline-${sessionId}`,
      kiloModel: kiloModel || config.DEFAULT_MODELS.kilo,
      clineModel: clineModel || config.DEFAULT_MODELS.cline,
      history: []
    };

    this.currentTurn = 0;
    this.activeAgent = 'kilo';
    this.state = 'RUNNING';

    // Kickoff prompt
    let kickoff;
    if (isIdeation) {
      kickoff = `[Human Overseer]: You and your colleague Cline are an equal pair-programming team. Invent a creative coding tool or challenge, outline your plan in BLACKBOARD.md, implement the initial scaffold, and pass to Cline.`;
    } else {
      kickoff = `[Human Overseer]: You and your colleague Cline are an equal pair-programming team. Task: "${this.session.topic}". Review the workspace, coordinate in BLACKBOARD.md, implement the first step, and pass to Cline.`;
    }

    return this.executeTurnStep(kickoff);
  }

  async executeTurnStep(overridePrompt = null) {
    if (this.currentTurn >= config.LOOP_LIMITS.MAX_TURNS) {
      this.state = 'COMPLETED';
      this.emit('completed', { reason: 'max_turns_reached' });
      return;
    }

    this.currentTurn++;
    const agent = this.activeAgent;
    const peer = agent === 'kilo' ? 'cline' : 'kilo';

    let prompt = overridePrompt;
    if (!prompt) {
      const lastTurn = this.session.history[this.session.history.length - 1];
      prompt = `[${peer.toUpperCase()}]: ${lastTurn ? lastTurn.text : 'Over to you.'}`;
    }

    const humanNote = this.consumeHumanInput(agent);
    if (humanNote) {
      prompt = `${humanNote}\n\n${prompt}`;
    }

    const runner = agent === 'kilo'
      ? new KiloRunner({ cwd: this.workspaceDir, model: this.session.kiloModel })
      : new ClineRunner({ cwd: this.workspaceDir, model: this.session.clineModel });

    this.runnerInstance = runner;
    this.emit('turn_start', { turn: this.currentTurn, agent, prompt });

    let result;
    try {
      result = await runner.executeTurn(
        prompt,
        agent === 'kilo' ? this.session.kiloSessionId : this.session.clineSessionId,
        (ev) => this.emit('agent_event', { turn: this.currentTurn, agent, event: ev }),
        (chunk) => this.emit('terminal_output', { turn: this.currentTurn, agent, chunk })
      );
    } catch (err) {
      const classification = classifyError(1, err.message);
      this.emit('turn_error', { turn: this.currentTurn, agent, error: err.message, classification });
      return;
    }

    if (result.exitCode !== 0 && !result.text) {
      const errMsg = (result.rawStderr || '').trim() || `Process exited with code ${result.exitCode}`;
      const classification = classifyError(result.exitCode, errMsg);
      this.emit('turn_error', { turn: this.currentTurn, agent, error: errMsg, classification });
      return;
    }

    const summary = (result.text || 'turn execution').slice(0, 50);
    const commitHash = await commitTurn(this.workspaceDir, this.currentTurn, agent, summary);
    const diff = await getTurnDiff(this.workspaceDir);

    const turnRecord = {
      turn: this.currentTurn,
      agent,
      prompt,
      text: result.text,
      commitHash,
      diff: diff.diff
    };
    this.session.history.push(turnRecord);
    this.emit('turn_end', turnRecord);

    const handoff = this.parseHandoff(result.text);
    if (handoff === 'TASK_COMPLETE') {
      this.state = 'COMPLETED';
      this.emit('completed', { reason: 'agent_declared_complete', lastAgent: agent });
      return;
    }
    if (typeof handoff === 'object' && handoff.type === 'NEED_HUMAN') {
      this.state = 'PAUSED';
      this.emit('paused_for_human', { question: handoff.question, agent });
      return;
    }

    // Toggle peer agent
    this.activeAgent = peer;

    if (this.state === 'RUNNING') {
      setImmediate(() => this.executeTurnStep());
    }
  }

  async stop() {
    this.state = 'IDLE';
    if (this.runnerInstance) {
      await this.runnerInstance.cancel();
    }
    this.emit('stopped');
  }

  pause() {
    this.state = 'PAUSED';
    this.emit('paused');
  }

  resume() {
    if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.executeTurnStep();
    }
  }
}
