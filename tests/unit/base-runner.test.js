import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseRunner } from '../../src/runners/base-runner.js';

test('BaseRunner spawns command, streams terminal chunks, and returns output', async () => {
  const runner = new BaseRunner({ cwd: process.cwd(), timeoutSeconds: 5 });
  const terminalChunks = [];
  const events = [];

  const result = await runner.run(
    process.platform === 'win32' ? 'powershell' : 'sh',
    ['-Command', 'Write-Output Line1; Write-Output Line2'],
    (ev) => events.push(ev),
    (chunk) => terminalChunks.push(chunk)
  );

  assert.equal(result.exitCode, 0);
  assert.ok(result.rawStdout.includes('Line1'));
  assert.ok(terminalChunks.length > 0);
});
