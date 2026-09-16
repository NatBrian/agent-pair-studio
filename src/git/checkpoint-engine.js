import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const execAsync = promisify(exec);

export async function initWorkspace(workspacePath) {
  const gitDir = resolve(workspacePath, '.git');
  if (!existsSync(gitDir)) {
    await execAsync('git init', { cwd: workspacePath });
    await execAsync('git config user.name "Agent Collab Studio"', { cwd: workspacePath });
    await execAsync('git config user.email "collab@local.studio"', { cwd: workspacePath });

    const blackboardPath = resolve(workspacePath, 'BLACKBOARD.md');
    if (!existsSync(blackboardPath)) {
      writeFileSync(
        blackboardPath,
        '# Shared Workspace Blackboard\n\n## High-Level Architecture & Decisions\n\n## Completed Tasks\n\n## Current Goal\n'
      );
    }
    await execAsync('git add -A', { cwd: workspacePath });
    await execAsync('git commit -m "chore: initialize agent workspace" --allow-empty', { cwd: workspacePath });
  }
}

export async function createSessionBranch(workspacePath, sessionId, slug = 'collab') {
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const branchName = `session/${sessionId}-${cleanSlug}`;
  await execAsync(`git checkout -B "${branchName}"`, { cwd: workspacePath });
  return branchName;
}

export async function commitTurn(workspacePath, turnNum, agent, summary = 'turn update') {
  const cleanSummary = summary.replace(/["\r\n]/g, ' ').slice(0, 80);
  const commitMsg = `[Turn ${turnNum}] ${agent}: ${cleanSummary}`;
  await execAsync('git add -A', { cwd: workspacePath });
  await execAsync(`git commit -m "${commitMsg}" --allow-empty`, { cwd: workspacePath });
  const { stdout } = await execAsync('git rev-parse HEAD', { cwd: workspacePath });
  return stdout.trim();
}

export async function getTurnDiff(workspacePath) {
  try {
    const { stdout: diff } = await execAsync('git diff HEAD~1 HEAD', { cwd: workspacePath });
    const { stdout: summary } = await execAsync('git diff HEAD~1 HEAD --stat', { cwd: workspacePath });
    return { summary: summary.trim(), diff: diff.trim() };
  } catch {
    return { summary: '', diff: '' };
  }
}

export async function rollbackToCommit(workspacePath, commitHash) {
  await execAsync(`git reset --hard "${commitHash}"`, { cwd: workspacePath });
  await execAsync('git clean -fd', { cwd: workspacePath });
}
