import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveSession, loadSession, listSessions } from '../../src/storage/session-store.js';

const testDataDir = resolve(process.cwd(), 'tests/test-data-store');

test('session store saves, loads, and lists sessions', async () => {
  rmSync(testDataDir, { recursive: true, force: true });

  const sampleSession = {
    id: 'test-123',
    topic: 'Build Markdown Parser',
    branch: 'session/test-123-build',
    history: [{ turn: 1, agent: 'kilo', text: 'Scaffolded parser' }]
  };

  await saveSession(sampleSession, testDataDir);
  const loaded = await loadSession('test-123', testDataDir);
  assert.equal(loaded.id, 'test-123');
  assert.equal(loaded.topic, 'Build Markdown Parser');

  const list = await listSessions(testDataDir);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'test-123');

  rmSync(testDataDir, { recursive: true, force: true });
});
