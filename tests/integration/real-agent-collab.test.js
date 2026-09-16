import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TurnOrchestrator } from '../../src/orchestrator/turn-orchestrator.js';
import { config } from '../../src/config.js';

const liveWorkspace = resolve(process.cwd(), 'kilo-cline-workspace');

test('Live CLI pair-programming in kilo-cline-workspace', { timeout: 300000 }, async () => {
  if (!existsSync(liveWorkspace)) {
    mkdirSync(liveWorkspace, { recursive: true });
  }

  const orchestrator = new TurnOrchestrator({ workspaceDir: liveWorkspace });
  let turnCount = 0;
  const terminalOutputs = [];

  orchestrator.on('turn_start', (data) => {
    turnCount++;
    console.log(`[LIVE TEST] Starting Turn ${data.turn} with ${data.agent}...`);
  });

  orchestrator.on('terminal_output', (data) => {
    terminalOutputs.push(data.chunk);
    // Preserve user API quota: terminate as soon as live streaming is confirmed
    orchestrator.stop();
  });

  // Start real session with simple, deterministic goal
  await orchestrator.startSession({
    topic: 'Create string-utils.js with a reverseString(str) function and export it',
    kiloModel: config.DEFAULT_MODELS.kilo,
    clineModel: config.DEFAULT_MODELS.cline
  });

  // Allow turn to verify execution or pause
  await new Promise((resolveWait) => {
    orchestrator.on('completed', resolveWait);
    orchestrator.on('paused_for_human', resolveWait);
    orchestrator.on('turn_error', (err) => {
      console.log('[LIVE TEST] Turn error handled:', err);
      resolveWait();
    });
    setTimeout(resolveWait, 20000); // 20-second cap to preserve quota
  });

  // Verification 1: Ensure workspace contains blackboard
  const blackboardPath = resolve(liveWorkspace, 'BLACKBOARD.md');
  assert.ok(existsSync(blackboardPath), 'BLACKBOARD.md must exist in kilo-cline-workspace');

  // Verification 2: Check execution occurred
  assert.ok(turnCount >= 1, 'At least 1 turn must have started');
  assert.ok(terminalOutputs.length > 0, 'Must have received terminal output chunks');

  await orchestrator.stop();
});
