import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
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

  // Simulate file creation in session 1
  writeFileSync(resolve(testDir, 'sample.txt'), 'Hello Kilo and Cline');

  const commitHash = await commitTurn(testDir, 1, 'kilo', 'created sample.txt');
  assert.ok(commitHash);

  const diffData = await getTurnDiff(testDir);
  assert.ok(diffData.diff.includes('Hello Kilo and Cline'));

  // Create session 2 - MUST start with empty workspace without session 1's files!
  const branch2 = await createSessionBranch(testDir, 'sess-2', 'second-feature');
  assert.equal(existsSync(resolve(testDir, 'sample.txt')), false, 'New session branch must start with empty workspace');

  writeFileSync(resolve(testDir, 'feature-2.txt'), 'Feature 2 file');
  await commitTurn(testDir, 1, 'cline', 'created feature-2.txt');

  assert.equal(await getCurrentBranch(testDir), branch2);

  // Switch back to sess-1 - should restore sample.txt and not have feature-2.txt
  const switched = await checkoutSessionBranch(testDir, branch);
  assert.equal(switched, true);
  assert.equal(await getCurrentBranch(testDir), branch);
  assert.equal(existsSync(resolve(testDir, 'sample.txt')), true, 'Session 1 must have its own files restored');
  assert.equal(existsSync(resolve(testDir, 'feature-2.txt')), false, 'Session 1 must not contain session 2 files');

  rmSync(testDir, { recursive: true, force: true });
});
