import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSandboxRoot, redactSecrets } from '../../src/utils/security.js';

test('validateSandboxRoot accepts valid existing directory', () => {
  const testDir = resolve(process.cwd(), 'tests/scratch-sandbox');
  mkdirSync(testDir, { recursive: true });
  const canonical = validateSandboxRoot(testDir);
  assert.equal(typeof canonical, 'string');
  rmSync(testDir, { recursive: true, force: true });
});

test('validateSandboxRoot rejects relative paths, empty paths, and filesystem root', () => {
  assert.throws(() => validateSandboxRoot(''), /sandbox_path is required/);
  assert.throws(() => validateSandboxRoot('./relative'), /must be an absolute path/);
  // Root check
  const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
  assert.throws(() => validateSandboxRoot(rootPath), /cannot be the filesystem root/);
});

test('redactSecrets sanitizes API keys and tokens', () => {
  const sample = 'Key: sk-ant-api03-1234567890abcdef and token tvly-dev-1234567890abcdef with Bearer secret.jwt.token';
  const sanitized = redactSecrets(sample);
  assert.ok(!sanitized.includes('sk-ant-api03'));
  assert.ok(!sanitized.includes('tvly-dev-1234567890abcdef'));
  assert.ok(!sanitized.includes('secret.jwt.token'));
  assert.ok(sanitized.includes('[REDACTED]'));
});
