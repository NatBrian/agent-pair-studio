import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { terminateProcessTree } from '../../src/utils/process-supervisor.js';

test('terminateProcessTree kills a running child process on Windows', async () => {
  const child = spawn(process.platform === 'win32' ? 'powershell' : 'sh', ['-Command', 'Start-Sleep -Seconds 30']);
  assert.ok(child.pid);
  await terminateProcessTree(child.pid);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(child.killed || child.exitCode !== null);
});
