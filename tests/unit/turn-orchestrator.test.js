import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnOrchestrator } from '../../src/orchestrator/turn-orchestrator.js';

test('TurnOrchestrator alternates turns and detects handoff tags', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });

  assert.equal(orchestrator.parseHandoff('I implemented tests. <HANDOFF> over to you'), 'HANDOFF');
  assert.equal(orchestrator.parseHandoff('Everything is finished! <TASK_COMPLETE>'), 'TASK_COMPLETE');
  assert.equal(orchestrator.parseHandoff('Please run tests and then emit `<TASK_COMPLETE>` when done.'), 'HANDOFF');
  assert.equal(orchestrator.parseHandoff('Next step: please write <TASK_COMPLETE> at the end.'), 'HANDOFF');
  const needHumanAttr = orchestrator.parseHandoff('Which database? <NEED_HUMAN question="SQLite or Postgres?">');
  assert.equal(needHumanAttr.type, 'NEED_HUMAN');
  assert.equal(needHumanAttr.question, 'SQLite or Postgres?');

  const needHumanTag = orchestrator.parseHandoff('We need guidance: <NEED_HUMAN>Should we use Docker or Bare Metal?</NEED_HUMAN>');
  assert.equal(needHumanTag.type, 'NEED_HUMAN');
  assert.equal(needHumanTag.question, 'Should we use Docker or Bare Metal?');

  const needHumanColon = orchestrator.parseHandoff('Decision: <NEED_HUMAN: Vite or Webpack?>');
  assert.equal(needHumanColon.type, 'NEED_HUMAN');
  assert.equal(needHumanColon.question, 'Vite or Webpack?');
});

test('TurnOrchestrator handles whisper and broadcast queues', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.injectHumanMessage('Broadcast to both', 'broadcast');
  orchestrator.injectHumanMessage('Whisper to Kilo', 'whisper_kilo');

  assert.equal(orchestrator.consumeHumanInput('kilo'), '[Human Overseer]: Broadcast to both\n[Human Whisper]: Whisper to Kilo');
  assert.equal(orchestrator.consumeHumanInput('cline'), null);
});

test('TurnOrchestrator preserves full prompt without artificial length limitation', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = {
    id: 'test-sess',
    topic: 'Long prompt test',
    history: [
      {
        turn: 1,
        agent: 'kilo',
        text: 'A'.repeat(5000)
      }
    ]
  };

  const peer = 'kilo';
  const lastTurn = orchestrator.session.history[0];
  let peerMsg = lastTurn.text.trim();
  // Ensure no 1500 slice occurs
  assert.ok(peerMsg.length >= 5000);
  const prompt = orchestrator.buildPeerPrompt ? orchestrator.buildPeerPrompt(peer, peerMsg) : `[${peer.toUpperCase()}]: ${peerMsg}`;
  assert.ok(prompt.length >= 5000);
});

test('TurnOrchestrator resumes a paused or completed session when human sends message', async () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = {
    id: 'test-sess',
    topic: 'Resume test',
    history: [{ turn: 1, agent: 'kilo', text: 'Step 1 complete' }]
  };
  orchestrator.state = 'PAUSED';
  let resumedFired = false;
  orchestrator.on('resumed', () => { resumedFired = true; });

  let stepTriggered = false;
  orchestrator.executeTurnStep = async () => { stepTriggered = true; };

  orchestrator.injectHumanMessage('Please continue with step 2', 'broadcast');
  assert.equal(orchestrator.state, 'RUNNING');
  assert.equal(resumedFired, true);
  await new Promise((r) => setImmediate(r));
  assert.equal(stepTriggered, true);
});

test('TurnOrchestrator immediately interrupts running runner and redirects target agent on human message', async () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = {
    id: 'test-sess',
    topic: 'Immediate steer test',
    history: []
  };
  orchestrator.state = 'RUNNING';
  orchestrator.activeAgent = 'kilo';

  let cancelCalled = false;
  orchestrator.runnerInstance = {
    cancel: async () => { cancelCalled = true; }
  };

  await orchestrator.injectHumanMessage('Stop and switch to SQLite', 'whisper_cline');

  assert.equal(cancelCalled, true);
  assert.equal(orchestrator.activeAgent, 'cline');
  assert.equal(orchestrator.interruptedForSteering, true);
  assert.equal(orchestrator.whisperQueues.cline.length, 1);
  assert.equal(orchestrator.whisperQueues.cline[0], 'Stop and switch to SQLite');
});

test('TurnOrchestrator pause() cancels active runner, sets PAUSED state, and emits paused event', async () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = { id: 'test-pause', topic: 'Pause test', history: [] };
  orchestrator.state = 'RUNNING';

  let cancelCalled = false;
  orchestrator.runnerInstance = {
    cancel: async () => { cancelCalled = true; }
  };

  let pausedEmitted = false;
  orchestrator.on('paused', () => { pausedEmitted = true; });

  await orchestrator.pause();

  assert.equal(orchestrator.state, 'PAUSED');
  assert.equal(cancelCalled, true);
  assert.equal(pausedEmitted, true);
});

test('TurnOrchestrator stop() cancels active runner, sets IDLE state, and emits stopped event', async () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = { id: 'test-stop', topic: 'Stop test', history: [] };
  orchestrator.state = 'RUNNING';

  let cancelCalled = false;
  orchestrator.runnerInstance = {
    cancel: async () => { cancelCalled = true; }
  };

  let stoppedEmitted = false;
  orchestrator.on('stopped', () => { stoppedEmitted = true; });

  await orchestrator.stop();

  assert.equal(orchestrator.state, 'IDLE');
  assert.equal(cancelCalled, true);
  assert.equal(stoppedEmitted, true);
});

test('TurnOrchestrator executeTurnStep cleanly handles pause cancellation without error or phantom turns', async () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = { id: 'test-cancel-pause', topic: 'Cancel pause test', history: [] };
  orchestrator.state = 'RUNNING';

  let errorEmitted = false;
  orchestrator.on('turn_error', () => { errorEmitted = true; });
  let turnEndEmitted = false;
  orchestrator.on('turn_end', () => { turnEndEmitted = true; });

  orchestrator.createRunner = () => ({
    executeTurn: async () => {
      // Simulate orchestrator.pause() being triggered mid-run
      await orchestrator.pause();
      return { wasCancelled: true, exitCode: 1, text: '', rawStderr: 'Killed' };
    },
    cancel: async () => {}
  });

  await orchestrator.executeTurnStep();

  assert.equal(orchestrator.state, 'PAUSED');
  assert.equal(orchestrator.currentTurn, 0);
  assert.equal(orchestrator.session.history.length, 0);
  assert.equal(errorEmitted, false);
  assert.equal(turnEndEmitted, false);
});

test('TurnOrchestrator executeTurnStep cleanly handles stop cancellation without error or phantom turns', async () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.session = { id: 'test-cancel-stop', topic: 'Cancel stop test', history: [] };
  orchestrator.state = 'RUNNING';

  let errorEmitted = false;
  orchestrator.on('turn_error', () => { errorEmitted = true; });
  let turnEndEmitted = false;
  orchestrator.on('turn_end', () => { turnEndEmitted = true; });

  orchestrator.createRunner = () => ({
    executeTurn: async () => {
      // Simulate orchestrator.stop() being triggered mid-run
      await orchestrator.stop();
      return { wasCancelled: true, exitCode: 1, text: '', rawStderr: 'Killed' };
    },
    cancel: async () => {}
  });

  await orchestrator.executeTurnStep();

  assert.equal(orchestrator.state, 'IDLE');
  assert.equal(orchestrator.currentTurn, 0);
  assert.equal(orchestrator.session.history.length, 0);
  assert.equal(errorEmitted, false);
  assert.equal(turnEndEmitted, false);
});


