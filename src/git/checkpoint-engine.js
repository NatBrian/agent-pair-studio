import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export async function initWorkspace(workspacePath) {
  const gitDir = resolve(workspacePath, '.git');
  if (!existsSync(gitDir)) {
    try {
      await execFileAsync('git', ['init', '-b', 'master'], { cwd: workspacePath });
    } catch {
      await execFileAsync('git', ['init'], { cwd: workspacePath });
    }
    await execFileAsync('git', ['config', 'user.name', 'Agent Pair Studio'], { cwd: workspacePath });
    await execFileAsync('git', ['config', 'user.email', 'pair@local.studio'], { cwd: workspacePath });

    const blackboardPath = resolve(workspacePath, 'BLACKBOARD.md');
    if (!existsSync(blackboardPath)) {
      writeFileSync(
        blackboardPath,
        '# Shared Workspace Blackboard\n\n## High-Level Architecture & Decisions\n\n## Completed Tasks\n\n## Current Goal\n'
      );
    }
    await execFileAsync('git', ['add', '-A'], { cwd: workspacePath });
    await execFileAsync('git', ['commit', '-m', 'chore: initialize agent workspace', '--allow-empty'], { cwd: workspacePath });
    try {
      await execFileAsync('git', ['tag', '-f', 'workspace-base'], { cwd: workspacePath });
    } catch {}
  }
}

export async function getBaseReference(workspacePath) {
  // 1. Pristine tag if initialized
  try {
    await execFileAsync('git', ['rev-parse', '--verify', 'workspace-base'], { cwd: workspacePath });
    return 'workspace-base';
  } catch {}

  // 2. Default branch 'master'
  try {
    await execFileAsync('git', ['rev-parse', '--verify', 'master'], { cwd: workspacePath });
    return 'master';
  } catch {}

  // 3. Default branch 'main'
  try {
    await execFileAsync('git', ['rev-parse', '--verify', 'main'], { cwd: workspacePath });
    return 'main';
  } catch {}

  // 4. Fallback to initial root commit of the repository
  try {
    const { stdout } = await execFileAsync('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd: workspacePath });
    const root = stdout.trim().split(/\s+/)[0];
    if (root) return root;
  } catch {}

  return null;
}

export async function createSessionBranch(workspacePath, sessionId, slug = 'collab') {
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const branchName = `session/${sessionId}-${cleanSlug}`;

  // 1. Reset and clean current workspace to avoid uncommitted file carryover
  try {
    await execFileAsync('git', ['reset', '--hard'], { cwd: workspacePath });
    await execFileAsync('git', ['clean', '-fd'], { cwd: workspacePath });
  } catch {}

  // 2. Resolve clean base reference (workspace-base tag, master, main, or root commit)
  const baseRef = await getBaseReference(workspacePath);

  // 3. Branch from clean base
  if (baseRef) {
    await execFileAsync('git', ['checkout', '-B', branchName, baseRef], { cwd: workspacePath });
  } else {
    await execFileAsync('git', ['checkout', '-B', branchName], { cwd: workspacePath });
  }

  // 4. Force clean any untracked debris so workspace starts completely empty
  try {
    await execFileAsync('git', ['clean', '-fd'], { cwd: workspacePath });
  } catch {}

  // 5. Ensure pristine BLACKBOARD.md template is in place
  const blackboardPath = resolve(workspacePath, 'BLACKBOARD.md');
  writeFileSync(
    blackboardPath,
    '# Shared Workspace Blackboard\n\n## High-Level Architecture & Decisions\n\n## Completed Tasks\n\n## Current Goal\n'
  );

  return branchName;
}

export async function checkoutSessionBranch(workspacePath, branchName) {
  if (!branchName) return false;
  try {
    await execFileAsync('git', ['checkout', branchName], { cwd: workspacePath });
    return true;
  } catch (err) {
    try {
      await execFileAsync('git', ['stash'], { cwd: workspacePath });
      await execFileAsync('git', ['checkout', branchName], { cwd: workspacePath });
      return true;
    } catch (fallbackErr) {
      console.warn(`Failed to checkout branch ${branchName}:`, fallbackErr.message);
      return false;
    }
  }
}

export async function getCurrentBranch(workspacePath) {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: workspacePath });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function commitTurn(workspacePath, turnNum, agent, summary = 'turn update') {
  const cleanSummary = summary.replace(/["\r\n]/g, ' ').slice(0, 80);
  const commitMsg = `[Turn ${turnNum}] ${agent}: ${cleanSummary}`;
  await execFileAsync('git', ['add', '-A'], { cwd: workspacePath });
  await execFileAsync('git', ['commit', '-m', commitMsg, '--allow-empty'], { cwd: workspacePath });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspacePath });
  return stdout.trim();
}

export async function getTurnDiff(workspacePath) {
  try {
    const { stdout: diff } = await execFileAsync('git', ['diff', 'HEAD~1', 'HEAD'], { cwd: workspacePath });
    const { stdout: summary } = await execFileAsync('git', ['diff', 'HEAD~1', 'HEAD', '--stat'], { cwd: workspacePath });
    return { summary: summary.trim(), diff: diff.trim() };
  } catch {
    return { summary: '', diff: '' };
  }
}

export async function rollbackToCommit(workspacePath, commitHash) {
  await execFileAsync('git', ['reset', '--hard', commitHash], { cwd: workspacePath });
  await execFileAsync('git', ['clean', '-fd'], { cwd: workspacePath });
}
