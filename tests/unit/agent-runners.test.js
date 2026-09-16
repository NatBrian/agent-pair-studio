import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KiloRunner } from '../../src/runners/kilo-runner.js';
import { ClineRunner } from '../../src/runners/cline-runner.js';

test('KiloRunner constructs command arguments with --pure and --auto', () => {
  const runner = new KiloRunner({ cwd: 'C:/sandbox', model: 'test-model' });
  const args = runner.buildArgs('Test prompt', 'session-123');
  assert.deepEqual(args.slice(0, 2), ['--pure', 'run']);
  assert.ok(args.includes('--auto'));
  assert.ok(args.includes('--dir'));
  assert.ok(args.includes('C:/sandbox'));
  assert.ok(args.includes('--session'));
  assert.ok(args.includes('session-123'));
});

test('ClineRunner constructs command arguments with --json and --auto-approve', () => {
  const runner = new ClineRunner({ cwd: 'C:/sandbox', model: 'cline-free/deepseek-v4.1-flash' });
  const args = runner.buildArgs('Test prompt', 'session-456');
  assert.ok(args.includes('--json'));
  assert.ok(args.includes('--auto-approve'));
  assert.ok(args.includes('-c'));
  assert.ok(args.includes('C:/sandbox'));
  assert.ok(args.includes('--id'));
  assert.ok(args.includes('session-456'));
  assert.equal(args[args.length - 1], 'Test prompt');
});
