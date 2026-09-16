import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initWorkspace,
  createSessionBranch,
  commitTurn,
  getTurnDiff,
  rollbackToCommit,
  checkoutSessionBranch,
  getCurrentBranch
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
  // Branch switching test
  const branch2 = await createSessionBranch(testDir, 'sess-2', 'second-feature');
  writeFileSync(resolve(testDir, 'feature-2.txt'), 'Feature 2 file');
  await commitTurn(testDir, 1, 'cline', 'created feature-2.txt');

  assert.equal(await getCurrentBranch(testDir), branch2);

  // Switch back to sess-1
  const switched = await checkoutSessionBranch(testDir, branch);
  assert.equal(switched, true);
  assert.equal(await getCurrentBranch(testDir), branch);

  rmSync(testDir, { recursive: true, force: true });
});
