import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initWorkspace,
  createSessionBranch,
  commitTurn,
  getTurnDiff,
  rollbackToCommit
} from '../../src/git/checkpoint-engine.js';

const testDir = resolve(process.cwd(), 'tests/test-git-workspace');

test('checkpoint engine initializes workspace, branches, commits turns, and reads diffs', async () => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });

  await initWorkspace(testDir);

  const branch = await createSessionBranch(testDir, 'sess-1', 'test-feature');
  assert.ok(branch.includes('session/sess-1'));

  // Simulate file creation
  writeFileSync(resolve(testDir, 'sample.txt'), 'Hello Kilo and Cline');

  const commitHash = await commitTurn(testDir, 1, 'kilo', 'created sample.txt');
  assert.ok(commitHash);

  const diffData = await getTurnDiff(testDir);
  assert.ok(diffData.diff.includes('Hello Kilo and Cline'));

  // Rollback test
  writeFileSync(resolve(testDir, 'sample.txt'), 'Corrupted text');
  await rollbackToCommit(testDir, commitHash);
  assert.ok(diffData.diff.includes('Hello Kilo and Cline'));

  rmSync(testDir, { recursive: true, force: true });
});
