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
    // 1. <NEED_HUMAN question="..." />
    const attrMatch = text.match(/<NEED_HUMAN\s+question=["']([^"']+)["']\s*\/?>/i);
    if (attrMatch) {
      return { type: 'NEED_HUMAN', question: attrMatch[1].trim() };
    }
    // 2. <NEED_HUMAN>...</NEED_HUMAN>
    const tagMatch = text.match(/<NEED_HUMAN>([\s\S]*?)<\/NEED_HUMAN>/i);
    if (tagMatch) {
      return { type: 'NEED_HUMAN', question: tagMatch[1].trim() };
    }
    // 3. <NEED_HUMAN: ...>
    const colonMatch = text.match(/<NEED_HUMAN:\s*([^>]+)>/i);
    if (colonMatch) {
      return { type: 'NEED_HUMAN', question: colonMatch[1].trim() };
    }
    return 'HANDOFF';
  }

  injectHumanMessage(text, mode = 'broadcast') {
    if (mode === 'whisper_kilo') {
      this.whisperQueues.kilo.push(text);
      if (this.state !== 'RUNNING') {
        this.activeAgent = 'kilo';
      }
    } else if (mode === 'whisper_cline') {
      this.whisperQueues.cline.push(text);
      if (this.state !== 'RUNNING') {
        this.activeAgent = 'cline';
      }
    } else {
      this.broadcastQueue.push(text);
    }

    // If there is an existing session and the loop is paused, completed, or idle/stopped,
    // sending a human message automatically resumes the session to continue from that input.
    if (this.session && this.state !== 'RUNNING') {
      this.state = 'RUNNING';
      this.maxTurns = Math.max(this.maxTurns || config.LOOP_LIMITS.MAX_TURNS, this.currentTurn + config.LOOP_LIMITS.MAX_TURNS);
      this.emit('resumed');
      setImmediate(() => this.executeTurnStep());
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

    // Protocol instructions so agents know how to hand off and conclude
    const protocolText = `Pair-programming protocol:
- Coordinate tasks and architectural decisions in BLACKBOARD.md.
- When the objective is completely achieved, include <TASK_COMPLETE> in your final message to conclude and stop the session.
- If you hit ambiguity or require human guidance, include <NEED_HUMAN question="..."> to pause for human input.
- Otherwise, summarize your step and pass to your peer.`;

    // Kickoff prompt
    let kickoff;
    if (isIdeation) {
      kickoff = `[Human Overseer]: You and your colleague Cline are an equal pair-programming team. Invent a creative coding tool or challenge, outline your plan in BLACKBOARD.md, implement the initial scaffold, and pass to Cline.\n\n${protocolText}`;
    } else {
      kickoff = `[Human Overseer]: You and your colleague Cline are an equal pair-programming team. Task: "${this.session.topic}". Review the workspace, coordinate in BLACKBOARD.md, implement the first step, and pass to Cline.\n\n${protocolText}`;
    }

    return this.executeTurnStep(kickoff);
  }

  async executeTurnStep(overridePrompt = null) {
    const maxAllowed = this.maxTurns || config.LOOP_LIMITS.MAX_TURNS;
    if (this.currentTurn >= maxAllowed) {
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
      let peerMsg = (lastTurn && lastTurn.text && lastTurn.text.trim())
        ? lastTurn.text.trim()
        : `I have updated the workspace for "${this.session.topic}". Please inspect BLACKBOARD.md and proceed with your step.`;
      // Coding CLIs handle full context natively; do not apply artificial prompt length limits
      prompt = `[${peer.toUpperCase()}]: ${peerMsg}`;
    }

    const humanNote = this.consumeHumanInput(agent);
    if (humanNote) {
      prompt = `${humanNote}\n\n${prompt}`;
    }

    const runner = agent === 'kilo'
      ? new KiloRunner({ cwd: this.workspaceDir, model: this.session.kiloModel, timeoutSeconds: config.LOOP_LIMITS.TURN_TIMEOUT_SECONDS })
      : new ClineRunner({ cwd: this.workspaceDir, model: this.session.clineModel, timeoutSeconds: config.LOOP_LIMITS.TURN_TIMEOUT_SECONDS });

    this.runnerInstance = runner;
    this.emit('turn_start', { turn: this.currentTurn, agent, prompt });

    const hasKiloRun = this.session.history.some((h) => h.agent === 'kilo');
    const sessionArg = agent === 'kilo'
      ? (hasKiloRun ? 'continue' : null)
      : this.session.clineSessionId;

    let result;
    try {
      result = await runner.executeTurn(
        prompt,
        sessionArg,
        (ev) => {
          if (agent === 'cline' && (ev.session_id || ev.sessionId || ev.id)) {
            this.session.clineSessionId = ev.session_id || ev.sessionId || ev.id;
          }
          this.emit('agent_event', { turn: this.currentTurn, agent, event: ev });
        },
        (chunk) => this.emit('terminal_output', { turn: this.currentTurn, agent, chunk })
      );
    } catch (err) {
      const classification = classifyError(1, err.message);
      this.emit('turn_error', { turn: this.currentTurn, agent, error: err.message, classification });
      return;
    }

    if (result.exitCode !== 0) {
      const errMsg = (result.rawStderr || result.text || '').trim() || `Process exited with code ${result.exitCode}`;
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
      this.emit('resumed');
      this.executeTurnStep();
    }
  }

  loadSession(sessionData) {
    this.session = sessionData;
    this.currentTurn = sessionData.history ? sessionData.history.length : 0;
    this.maxTurns = this.currentTurn + config.LOOP_LIMITS.MAX_TURNS;
    this.activeAgent = (sessionData.history && sessionData.history.length > 0)
      ? (sessionData.history[sessionData.history.length - 1].agent === 'kilo' ? 'cline' : 'kilo')
      : 'kilo';
    this.state = 'IDLE';
    this.emit('session_loaded', sessionData);
  }
}
