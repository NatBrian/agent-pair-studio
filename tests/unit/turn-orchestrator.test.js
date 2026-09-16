import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnOrchestrator } from '../../src/orchestrator/turn-orchestrator.js';

test('TurnOrchestrator alternates turns and detects handoff tags', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });

  assert.equal(orchestrator.parseHandoff('I implemented tests. <HANDOFF> over to you'), 'HANDOFF');
  assert.equal(orchestrator.parseHandoff('Everything is finished! <TASK_COMPLETE>'), 'TASK_COMPLETE');
  const needHuman = orchestrator.parseHandoff('Which database? <NEED_HUMAN question="SQLite or Postgres?">');
  assert.equal(needHuman.type, 'NEED_HUMAN');
  assert.equal(needHuman.question, 'SQLite or Postgres?');
});

test('TurnOrchestrator handles whisper and broadcast queues', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.injectHumanMessage('Broadcast to both', 'broadcast');
  orchestrator.injectHumanMessage('Whisper to Kilo', 'whisper_kilo');

  assert.equal(orchestrator.consumeHumanInput('kilo'), '[Human Overseer]: Broadcast to both\n[Human Whisper]: Whisper to Kilo');
  assert.equal(orchestrator.consumeHumanInput('cline'), null);
});
