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

test('resolveCliCommand bypasses cmd.exe for kilo and cline on Windows', async () => {
  const { resolveCliCommand } = await import('../../src/runners/base-runner.js');
  const kiloResolved = resolveCliCommand('kilo', ['run', 'hi']);
  assert.equal(kiloResolved.shell, false);
  assert.ok(kiloResolved.executable);

  const clineResolved = resolveCliCommand('cline', ['hi']);
  assert.equal(clineResolved.shell, false);
  assert.ok(clineResolved.executable);
});

test('extractAssistantText extracts assistant text and does not pollute text with stderr', () => {
  const runner = new BaseRunner({ cwd: process.cwd() });
  const ndjson = '{"type":"text","part":{"text":"Hello peer agent!"}}\n';
  assert.equal(runner.extractAssistantText(ndjson), 'Hello peer agent!');

  // When only stderr is present (e.g. error message), assistant text must be empty
  const errOutput = runner.extractAssistantText('', 'The command line is too long.');
  assert.equal(errOutput, '');
});

