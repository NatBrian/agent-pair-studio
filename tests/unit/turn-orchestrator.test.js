import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnOrchestrator } from '../../src/orchestrator/turn-orchestrator.js';

test('TurnOrchestrator alternates turns and detects handoff tags', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });

  assert.equal(orchestrator.parseHandoff('I implemented tests. <HANDOFF> over to you'), 'HANDOFF');
  assert.equal(orchestrator.parseHandoff('Everything is finished! <TASK_COMPLETE>'), 'TASK_COMPLETE');
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

