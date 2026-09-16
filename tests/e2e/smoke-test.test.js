import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initWorkspace, createSessionBranch, commitTurn, getTurnDiff } from '../../src/git/checkpoint-engine.js';
import { saveSession, loadSession } from '../../src/storage/session-store.js';

const smokeWorkspace = resolve(process.cwd(), 'tests/scratch-smoke-workspace');
const smokeData = resolve(process.cwd(), 'tests/scratch-smoke-data');

test('End-to-End smoke test: full session lifecycle and git checkpoints', async () => {
  rmSync(smokeWorkspace, { recursive: true, force: true });
  rmSync(smokeData, { recursive: true, force: true });
  mkdirSync(smokeWorkspace, { recursive: true });

  // 1. Init workspace
  await initWorkspace(smokeWorkspace);
  const branch = await createSessionBranch(smokeWorkspace, 'smoke-1', 'math-utils');
  assert.ok(branch.includes('math-utils'));

  // 2. Turn 1 (Kilo creates math.js)
  writeFileSync(resolve(smokeWorkspace, 'math.js'), 'export function add(a, b) { return a + b; }\n');
  const commit1 = await commitTurn(smokeWorkspace, 1, 'kilo', 'created math.js');
  const diff1 = await getTurnDiff(smokeWorkspace);
  assert.ok(diff1.diff.includes('export function add'));

  // 3. Turn 2 (Cline creates math.test.js)
  writeFileSync(
    resolve(smokeWorkspace, 'math.test.js'),
    'import { add } from "./math.js";\nif (add(2, 3) !== 5) throw new Error("fail");\nconsole.log("PASS");\n'
  );
  const commit2 = await commitTurn(smokeWorkspace, 2, 'cline', 'added math.test.js');
  const diff2 = await getTurnDiff(smokeWorkspace);
  assert.ok(diff2.diff.includes('math.test.js'));

  // 4. Save and verify session
  const session = {
    id: 'smoke-1',
    topic: 'Math Utils',
    branch,
    history: [
      { turn: 1, agent: 'kilo', commitHash: commit1 },
      { turn: 2, agent: 'cline', commitHash: commit2 }
    ]
  };
  await saveSession(session, smokeData);
  const loaded = await loadSession('smoke-1', smokeData);
  assert.equal(loaded.history.length, 2);

  // Clean up
  rmSync(smokeWorkspace, { recursive: true, force: true });
  rmSync(smokeData, { recursive: true, force: true });
});
