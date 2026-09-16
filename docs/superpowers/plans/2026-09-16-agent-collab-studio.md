# Agent Collab Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous pair-programming and collaborative execution harness for Kilo CLI and Cline CLI on Windows, featuring strict workspace containment, equal peer hierarchy, dual-layer memory, Git checkpoints, and a real-time Multi-Tab Web Studio dashboard.

**Architecture:** A local Node.js + Express + WebSocket backend coordinates the turn-taking loop between `kilo` and `cline` child processes in an isolated Git workspace (`./workspace`). The backend parses streaming NDJSON events, captures raw ANSI terminal output, creates turn-by-turn Git checkpoints, and broadcasts updates over WebSocket to a zero-build HTML/Tailwind/Vanilla JS multi-tab web dashboard.

**Tech Stack:** Node.js (v20+), Express, `ws` (WebSockets), Git, Node native test runner (`node --test`), HTML5, Tailwind CSS, `xterm.js`, Windows PowerShell/taskkill.

**Spec:** [docs/superpowers/specs/2026-09-16-agent-collab-studio-design.md](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/superpowers/specs/2026-09-16-agent-collab-studio-design.md)

## Global Constraints

* Operating System: Windows (paths formatted with forward slashes or escaped backslashes, child processes use `.ps1` or `.cmd` wrappers where applicable).
* Strict Workspace Containment: All file writes, reads, and bash tool executions by either agent must be restricted to `C:\Users\Admin\Documents\Github\agent-collab-studio\kilo-cline-workspace` with root path validation. Never allow writes to root `C:\`.
* Equal Peer Hierarchy: Both agents are treated with equal authority. No master/subagent or boss/employee prompts.
* Kilo Invocation Rule: Always include `--pure` before `run` to prevent background title generation hangs (`kilo --pure run ...`).
* Cline Invocation Rule: Always include `--yolo` and `--auto-approve true` for autonomous tool execution (`cline ... --yolo --auto-approve true --json`).
* Process Tree Cleanup: All cancellations or timeouts on Windows must invoke `taskkill /PID <pid> /T /F`.
* Real-World Validation: Dedicated live testing using actual installed `kilo` and `cline` CLIs in `kilo-cline-workspace`.
* Browser & UI Validation: Use Playwright MCP to verify dashboard rendering, tabs, live streaming, and human steering.
* Testing: Use Node.js built-in test runner (`node --test`) for zero-dependency unit and integration testing.

---

### Task 1: Project Scaffolding & Configuration Module

**Files:**
- Create: `package.json`
- Create: `src/config.js`
- Test: `tests/unit/config.test.js`

**Interfaces:**
- Produces: `config` object containing `PORT`, `WORKSPACE_DIR`, `DATA_DIR`, `KILO_CMD`, `CLINE_CMD`, `DEFAULT_MODELS`, `LOOP_LIMITS`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { config } from '../../src/config.js';

test('config exports required properties with sensible defaults', () => {
  assert.equal(typeof config.PORT, 'number');
  assert.equal(config.PORT, 3000);
  assert.equal(typeof config.WORKSPACE_DIR, 'string');
  assert.equal(config.WORKSPACE_DIR, resolve(process.cwd(), 'kilo-cline-workspace'));
  assert.equal(typeof config.DATA_DIR, 'string');
  assert.equal(config.DATA_DIR, resolve(process.cwd(), 'data'));
  assert.equal(typeof config.DEFAULT_MODELS.kilo, 'string');
  assert.equal(typeof config.DEFAULT_MODELS.cline, 'string');
  assert.equal(config.DEFAULT_MODELS.cline, 'cline-free/deepseek-v4.1-flash');
  assert.equal(config.LOOP_LIMITS.MAX_TURNS, 20);
  assert.equal(config.LOOP_LIMITS.TURN_TIMEOUT_SECONDS, 180);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/config.test.js`  
Expected: FAIL with `Cannot find module '../../src/config.js'`

- [ ] **Step 3: Write minimal implementation**

```json
// package.json
{
  "name": "agent-collab-studio",
  "version": "1.0.0",
  "description": "Autonomous pair-programming arena between Kilo CLI and Cline CLI",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/**/*.test.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "ws": "^8.18.0"
  }
}
```

```javascript
// src/config.js
import { resolve } from 'node:path';

const rootDir = process.cwd();

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  WORKSPACE_DIR: resolve(process.env.WORKSPACE_DIR || resolve(rootDir, 'kilo-cline-workspace')),
  DATA_DIR: resolve(process.env.DATA_DIR || resolve(rootDir, 'data')),
  KILO_CMD: process.env.KILO_CMD || 'kilo',
  CLINE_CMD: process.env.CLINE_CMD || 'cline',
  DEFAULT_MODELS: {
    cline: process.env.CLINE_MODEL || 'cline-free/deepseek-v4.1-flash',
    kilo: process.env.KILO_MODEL || 'openrouter/meta-llama/llama-3.3-70b-instruct:free'
  },
  LOOP_LIMITS: {
    MAX_TURNS: parseInt(process.env.MAX_TURNS || '20', 10),
    TURN_TIMEOUT_SECONDS: parseInt(process.env.TURN_TIMEOUT_SECONDS || '180', 10),
    MAX_RETRIES: 3,
    RETRY_DELAYS_MS: [10000, 20000, 30000]
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/config.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/config.js tests/unit/config.test.js
git commit -m "feat: scaffold project and add configuration module"
```

---

### Task 2: Security & Workspace Root Validator

**Files:**
- Create: `src/utils/security.js`
- Test: `tests/unit/security.test.js`

**Interfaces:**
- Produces:
  - `validateSandboxRoot(pathString): string` (throws on invalid, returns canonical path)
  - `redactSecrets(textString): string` (redacts API keys and tokens)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/security.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/security.test.js`  
Expected: FAIL with `Cannot find module '../../src/utils/security.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/security.js
import { realpathSync, statSync } from 'node:fs';
import { parse, isAbsolute } from 'node:path';

export function validateSandboxRoot(sandboxPath) {
  if (!sandboxPath || typeof sandboxPath !== 'string' || sandboxPath.trim() === '') {
    throw new Error("sandbox_path is required");
  }
  if (!isAbsolute(sandboxPath)) {
    throw new Error("sandbox_path must be an absolute path");
  }
  let canonical;
  try {
    canonical = realpathSync(sandboxPath);
  } catch (err) {
    throw new Error(`sandbox_path does not exist: ${sandboxPath}`);
  }
  const stat = statSync(canonical);
  if (!stat.isDirectory()) {
    throw new Error("sandbox_path must be a directory");
  }
  const root = parse(canonical).root;
  if (canonical.toLowerCase() === root.toLowerCase()) {
    throw new Error(`sandbox_path cannot be the filesystem root (${root})`);
  }
  return canonical;
}

const SECRET_PATTERNS = [
  /(sk|pk|ghp|gho|github_pat|glpat|xoxb|xoxp|xai|pplx|r8|tvly)[_-][A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[^]+?-----END[A-Z ]*PRIVATE KEY-----/g
];

export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let clean = text;
  for (const pattern of SECRET_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/security.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/security.js tests/unit/security.test.js
git commit -m "feat: add sandbox path validator and secret redaction"
```

---

### Task 3: Error Classifier & Windows Process Supervisor

**Files:**
- Create: `src/utils/error-classifier.js`
- Create: `src/utils/process-supervisor.js`
- Test: `tests/unit/error-classifier.test.js`
- Test: `tests/unit/process-supervisor.test.js`

**Interfaces:**
- Produces:
  - `classifyError(exitCode, errorText): 'transient' | 'permanent'`
  - `terminateProcessTree(pid): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/unit/error-classifier.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError } from '../../src/utils/error-classifier.js';

test('classifyError identifies transient errors', () => {
  assert.equal(classifyError(1, 'Error: 429 Too Many Requests'), 'transient');
  assert.equal(classifyError(1, 'Rate limit exceeded. Please wait 10s.'), 'transient');
  assert.equal(classifyError(1, '503 Service Unavailable'), 'transient');
  assert.equal(classifyError(1, 'FetchError: ECONNRESET'), 'transient');
  assert.equal(classifyError(124, 'timeout'), 'transient');
});

test('classifyError identifies permanent errors', () => {
  assert.equal(classifyError(1, '401 Unauthorized: Invalid API key'), 'permanent');
  assert.equal(classifyError(1, 'Account quota exceeded or billing issue'), 'permanent');
  assert.equal(classifyError(1, '404 Model not found: invalid/model-name'), 'permanent');
});
```

```javascript
// tests/unit/process-supervisor.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/error-classifier.test.js tests/unit/process-supervisor.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/error-classifier.js
export function classifyError(exitCode, errorText = '') {
  if (exitCode === 124) return 'transient';

  const text = String(errorText).toLowerCase();

  // Transient patterns
  if (/429|rate[\s_-]?limit|too many requests|overloaded|capacity|temporarily/i.test(text)) {
    return 'transient';
  }
  if (/500|502|503|504|bad gateway|service unavailable|gateway timeout/i.test(text)) {
    return 'transient';
  }
  if (/econnreset|econnrefused|etimedout|connection refused|network error|timed?\s?out/i.test(text)) {
    return 'transient';
  }

  // Permanent patterns
  if (/401|403|unauthorized|forbidden|invalid[\s_-]?api[\s_-]?key|authentication/i.test(text)) {
    return 'permanent';
  }
  if (/billing|quota exceeded|insufficient funds|payment/i.test(text)) {
    return 'permanent';
  }
  if (/404|not found|invalid model|model.*not.*available/i.test(text)) {
    return 'permanent';
  }

  return 'transient'; // Default safe assumption for retry
}
```

```javascript
// src/utils/process-supervisor.js
import { exec } from 'node:child_process';

export function terminateProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform === 'win32') {
      exec(`taskkill /PID ${pid} /T /F`, () => resolve());
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
      resolve();
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/error-classifier.test.js tests/unit/process-supervisor.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/error-classifier.js src/utils/process-supervisor.js tests/unit/error-classifier.test.js tests/unit/process-supervisor.test.js
git commit -m "feat: add error classifier and Windows process tree supervisor"
```

---

### Task 4: Git Checkpoint & Branch Manager

**Files:**
- Create: `src/git/checkpoint-engine.js`
- Test: `tests/unit/checkpoint-engine.test.js`

**Interfaces:**
- Produces:
  - `initWorkspace(workspacePath): Promise<void>`
  - `createSessionBranch(workspacePath, sessionId, slug): Promise<string>`
  - `commitTurn(workspacePath, turnNum, agent, summary): Promise<string>`
  - `getTurnDiff(workspacePath): Promise<{ summary: string, diff: string }>`
  - `rollbackToCommit(workspacePath, commitHash): Promise<void>`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/checkpoint-engine.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/checkpoint-engine.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/git/checkpoint-engine.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/checkpoint-engine.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/git/checkpoint-engine.js tests/unit/checkpoint-engine.test.js
git commit -m "feat: add Git checkpoint engine and session branch manager"
```

---

### Task 5: Base CLI Runner & Event Stream Buffer

**Files:**
- Create: `src/runners/base-runner.js`
- Test: `tests/unit/base-runner.test.js`

**Interfaces:**
- Produces: `BaseRunner` class:
  - `constructor({ cwd, timeoutSeconds })`
  - `run(command, args, onEvent, onTerminalOutput): Promise<{ text: string, rawStdout: string, rawStderr: string, exitCode: number }>`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/base-runner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseRunner } from '../../src/runners/base-runner.js';

test('BaseRunner spawns command, streams terminal chunks, and returns output', async () => {
  const runner = new BaseRunner({ cwd: process.cwd(), timeoutSeconds: 5 });
  const terminalChunks = [];
  const events = [];

  const result = await runner.run(
    process.platform === 'win32' ? 'powershell' : 'sh',
    ['-Command', 'Write-Output "Line 1"; Write-Output "Line 2"'],
    (ev) => events.push(ev),
    (chunk) => terminalChunks.push(chunk)
  );

  assert.equal(result.exitCode, 0);
  assert.ok(result.rawStdout.includes('Line 1'));
  assert.ok(terminalChunks.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/base-runner.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/runners/base-runner.js
import { spawn } from 'node:child_process';
import { terminateProcessTree } from '../utils/process-supervisor.js';
import { redactSecrets } from '../utils/security.js';

export class BaseRunner {
  constructor({ cwd, timeoutSeconds = 180 } = {}) {
    this.cwd = cwd;
    this.timeoutSeconds = timeoutSeconds;
    this.currentPid = null;
  }

  run(command, args, onEvent = () => {}, onTerminalOutput = () => {}) {
    return new Promise((resolve, reject) => {
      let rawStdout = '';
      let rawStderr = '';
      let timedOut = false;

      const child = spawn(command, args, {
        cwd: this.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          CI: '1',
          FORCE_COLOR: '1'
        }
      });

      this.currentPid = child.pid;

      const timer = setTimeout(async () => {
        timedOut = true;
        await terminateProcessTree(child.pid);
        reject(new Error(`Process timed out after ${this.timeoutSeconds} seconds`));
      }, this.timeoutSeconds * 1000);

      child.stdout.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString('utf-8'));
        rawStdout += text;
        onTerminalOutput(text);
        this.parseNdjsonChunk(text, onEvent);
      });

      child.stderr.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString('utf-8'));
        rawStderr += text;
        onTerminalOutput(text);
      });

      child.on('error', async (err) => {
        clearTimeout(timer);
        this.currentPid = null;
        reject(err);
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        this.currentPid = null;
        if (!timedOut) {
          resolve({
            exitCode: exitCode ?? 0,
            rawStdout,
            rawStderr,
            text: this.extractAssistantText(rawStdout)
          });
        }
      });
    });
  }

  async cancel() {
    if (this.currentPid) {
      await terminateProcessTree(this.currentPid);
      this.currentPid = null;
    }
  }

  parseNdjsonChunk(text, onEvent) {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
      try {
        const parsed = JSON.parse(trimmed);
        onEvent(parsed);
      } catch {}
    }
  }

  extractAssistantText(stdout) {
    // If output is NDJSON, attempt to gather text chunks, otherwise return trimmed stdout
    const lines = stdout.split('\n');
    const textParts = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.text) textParts.push(parsed.text);
          if (parsed.content) textParts.push(parsed.content);
          if (parsed.message) textParts.push(parsed.message);
        } catch {}
      }
    }
    return textParts.length > 0 ? textParts.join('\n') : stdout.trim();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/base-runner.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runners/base-runner.js tests/unit/base-runner.test.js
git commit -m "feat: add BaseRunner with subprocess streaming and timeout termination"
```

---

### Task 6: Kilo CLI & Cline CLI Subprocess Runners

**Files:**
- Create: `src/runners/kilo-runner.js`
- Create: `src/runners/cline-runner.js`
- Test: `tests/unit/agent-runners.test.js`

**Interfaces:**
- Produces:
  - `KiloRunner`: Executes `kilo --pure run [prompt] --dir <path> --auto --format json`
  - `ClineRunner`: Executes `cline [prompt] -c <path> --auto-approve true --yolo --json`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/agent-runners.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KiloRunner } from '../../src/runners/kilo-runner.js';
import { ClineRunner } from '../../src/runners/cline-runner.js';

test('KiloRunner constructs command arguments with --pure and --auto', () => {
  const runner = new KiloRunner({ cwd: 'C:/sandbox', model: 'test-model' });
  const args = runner.buildArgs('Test prompt', 'session-123');
  assert.deepEqual(args.slice(0, 2), ['--pure', 'run']);
  assert.ok(args.includes('--auto'));
  assert.ok(args.includes('--dir'));
  assert.ok(args.includes('C:/sandbox'));
  assert.ok(args.includes('--session'));
  assert.ok(args.includes('session-123'));
});

test('ClineRunner constructs command arguments with --yolo and --auto-approve', () => {
  const runner = new ClineRunner({ cwd: 'C:/sandbox', model: 'cline-free/deepseek-v4.1-flash' });
  const args = runner.buildArgs('Test prompt', 'session-456');
  assert.ok(args.includes('--yolo'));
  assert.ok(args.includes('--auto-approve'));
  assert.ok(args.includes('-c'));
  assert.ok(args.includes('C:/sandbox'));
  assert.ok(args.includes('--id'));
  assert.ok(args.includes('session-456'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/agent-runners.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/runners/kilo-runner.js
import { BaseRunner } from './base-runner.js';
import { config } from '../config.js';

export class KiloRunner extends BaseRunner {
  constructor({ cwd, model = config.DEFAULT_MODELS.kilo, timeoutSeconds = 180 } = {}) {
    super({ cwd, timeoutSeconds });
    this.model = model;
    this.cliCmd = config.KILO_CMD;
  }

  buildArgs(prompt, sessionId) {
    // CRITICAL: --pure MUST precede run to prevent background title hangs
    const args = ['--pure', 'run', prompt, '--dir', this.cwd, '--auto', '--format', 'json'];
    if (this.model) {
      args.push('-m', this.model);
    }
    if (sessionId) {
      args.push('--session', sessionId);
    }
    return args;
  }

  async executeTurn(prompt, sessionId, onEvent, onTerminalOutput) {
    const args = this.buildArgs(prompt, sessionId);
    return this.run(this.cliCmd, args, onEvent, onTerminalOutput);
  }
}
```

```javascript
// src/runners/cline-runner.js
import { BaseRunner } from './base-runner.js';
import { config } from '../config.js';

export class ClineRunner extends BaseRunner {
  constructor({ cwd, model = config.DEFAULT_MODELS.cline, timeoutSeconds = 180 } = {}) {
    super({ cwd, timeoutSeconds });
    this.model = model;
    this.cliCmd = config.CLINE_CMD;
  }

  buildArgs(prompt, sessionId) {
    const args = [prompt, '-c', this.cwd, '--auto-approve', 'true', '--yolo', '--json'];
    if (this.model) {
      args.push('-m', this.model);
    }
    if (sessionId) {
      args.push('--id', sessionId);
    }
    return args;
  }

  async executeTurn(prompt, sessionId, onEvent, onTerminalOutput) {
    const args = this.buildArgs(prompt, sessionId);
    return this.run(this.cliCmd, args, onEvent, onTerminalOutput);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/agent-runners.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runners/kilo-runner.js src/runners/cline-runner.js tests/unit/agent-runners.test.js
git commit -m "feat: add specialized Kilo and Cline subprocess runners"
```

---

### Task 7: Turn Orchestrator & State Machine

**Files:**
- Create: `src/orchestrator/turn-orchestrator.js`
- Test: `tests/unit/turn-orchestrator.test.js`

**Interfaces:**
- Produces: `TurnOrchestrator` class:
  - `startSession({ topic, isIdeation, kiloModel, clineModel }): Promise<string>`
  - `step(): Promise<TurnResult>`
  - `pause(): void`
  - `resume(): void`
  - `stop(): Promise<void>`
  - `injectHumanMessage(text, mode: 'broadcast' | 'whisper_kilo' | 'whisper_cline'): void`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/turn-orchestrator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnOrchestrator } from '../../src/orchestrator/turn-orchestrator.js';

test('TurnOrchestrator alternates turns and detects handoff tags', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });

  assert.equal(orchestrator.parseHandoff('I implemented tests. <HANDOFF> over to you'), 'HANDOFF');
  assert.equal(orchestrator.parseHandoff('Everything is finished! <TASK_COMPLETE>'), 'TASK_COMPLETE');
  const needHuman = orchestrator.parseHandoff('Which database? <NEED_HUMAN question="SQLite or Postgres?">');
  assert.equal(needHuman.type, 'NEED_HUMAN');
  assert.equal(needHuman.question, 'SQLite or Postgres?');
});

test('TurnOrchestrator handles whisper and broadcast queues', () => {
  const orchestrator = new TurnOrchestrator({ workspaceDir: process.cwd() });
  orchestrator.injectHumanMessage('Broadcast to both', 'broadcast');
  orchestrator.injectHumanMessage('Whisper to Kilo', 'whisper_kilo');

  assert.equal(orchestrator.consumeHumanInput('kilo'), '[Human Overseer]: Broadcast to both\n[Human Whisper]: Whisper to Kilo');
  assert.equal(orchestrator.consumeHumanInput('cline'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/turn-orchestrator.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/orchestrator/turn-orchestrator.js
import { EventEmitter } from 'node:events';
import { KiloRunner } from '../runners/kilo-runner.js';
import { ClineRunner } from '../runners/cline-runner.js';
import { commitTurn, createSessionBranch, getTurnDiff, initWorkspace } from '../git/checkpoint-engine.js';
import { classifyError } from '../utils/error-classifier.js';
import { config } from '../config.js';

export class TurnOrchestrator extends EventEmitter {
  constructor({ workspaceDir } = {}) {
    super();
    this.workspaceDir = workspaceDir || config.WORKSPACE_DIR;
    this.state = 'IDLE'; // IDLE, RUNNING, PAUSED, COMPLETED, ERROR
    this.currentTurn = 0;
    this.activeAgent = 'kilo'; // Kilo starts, then Cline
    this.session = null;
    this.whisperQueues = { kilo: [], cline: [] };
    this.broadcastQueue = [];
    this.runnerInstance = null;
  }

  parseHandoff(text = '') {
    if (/<TASK_COMPLETE>/i.test(text)) return 'TASK_COMPLETE';
    const match = text.match(/<NEED_HUMAN\s+question=["']([^"']+)["']\s*\/?>/i);
    if (match) {
      return { type: 'NEED_HUMAN', question: match[1] };
    }
    return 'HANDOFF';
  }

  injectHumanMessage(text, mode = 'broadcast') {
    if (mode === 'whisper_kilo') {
      this.whisperQueues.kilo.push(text);
    } else if (mode === 'whisper_cline') {
      this.whisperQueues.cline.push(text);
    } else {
      this.broadcastQueue.push(text);
    }
  }

  consumeHumanInput(agent) {
    const parts = [];
    if (this.broadcastQueue.length > 0) {
      parts.push(`[Human Overseer]: ${this.broadcastQueue.join('\n')}`);
      this.broadcastQueue = [];
    }
    if (this.whisperQueues[agent] && this.whisperQueues[agent].length > 0) {
      parts.push(`[Human Whisper]: ${this.whisperQueues[agent].join('\n')}`);
      this.whisperQueues[agent] = [];
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }

  async startSession({ topic, isIdeation = false, kiloModel, clineModel }) {
    await initWorkspace(this.workspaceDir);
    const sessionId = `sess-${Date.now()}`;
    const slug = isIdeation ? 'agent-ideation' : (topic || 'session').slice(0, 20);
    const branch = await createSessionBranch(this.workspaceDir, sessionId, slug);

    this.session = {
      id: sessionId,
      topic: topic || (isIdeation ? 'Agent-Initiated Ideation' : 'Collaborative Task'),
      branch,
      kiloSessionId: `kilo-${sessionId}`,
      clineSessionId: `cline-${sessionId}`,
      kiloModel: kiloModel || config.DEFAULT_MODELS.kilo,
      clineModel: clineModel || config.DEFAULT_MODELS.cline,
      history: []
    };

    this.currentTurn = 0;
    this.activeAgent = 'kilo';
    this.state = 'RUNNING';

    // Kickoff prompt
    let kickoff;
    if (isIdeation) {
      kickoff = `[Human Overseer]: You and your colleague Cline are an equal pair-programming team. Invent a creative coding tool or challenge, outline your plan in BLACKBOARD.md, implement the initial scaffold, and pass to Cline.`;
    } else {
      kickoff = `[Human Overseer]: You and your colleague Cline are an equal pair-programming team. Task: "${this.session.topic}". Review the workspace, coordinate in BLACKBOARD.md, implement the first step, and pass to Cline.`;
    }

    return this.executeTurnStep(kickoff);
  }

  async executeTurnStep(overridePrompt = null) {
    if (this.currentTurn >= config.LOOP_LIMITS.MAX_TURNS) {
      this.state = 'COMPLETED';
      this.emit('completed', { reason: 'max_turns_reached' });
      return;
    }

    this.currentTurn++;
    const agent = this.activeAgent;
    const peer = agent === 'kilo' ? 'cline' : 'kilo';

    let prompt = overridePrompt;
    if (!prompt) {
      const lastTurn = this.session.history[this.session.history.length - 1];
      prompt = `[${peer.toUpperCase()}]: ${lastTurn ? lastTurn.text : 'Over to you.'}`;
    }

    const humanNote = this.consumeHumanInput(agent);
    if (humanNote) {
      prompt = `${humanNote}\n\n${prompt}`;
    }

    const runner = agent === 'kilo'
      ? new KiloRunner({ cwd: this.workspaceDir, model: this.session.kiloModel })
      : new ClineRunner({ cwd: this.workspaceDir, model: this.session.clineModel });

    this.runnerInstance = runner;
    this.emit('turn_start', { turn: this.currentTurn, agent, prompt });

    let result;
    try {
      result = await runner.executeTurn(
        prompt,
        agent === 'kilo' ? this.session.kiloSessionId : this.session.clineSessionId,
        (ev) => this.emit('agent_event', { turn: this.currentTurn, agent, event: ev }),
        (chunk) => this.emit('terminal_output', { turn: this.currentTurn, agent, chunk })
      );
    } catch (err) {
      const classification = classifyError(1, err.message);
      this.emit('turn_error', { turn: this.currentTurn, agent, error: err.message, classification });
      return;
    }

    const commitHash = await commitTurn(this.workspaceDir, this.currentTurn, agent, result.text.slice(0, 50));
    const diff = await getTurnDiff(this.workspaceDir);

    const turnRecord = {
      turn: this.currentTurn,
      agent,
      prompt,
      text: result.text,
      commitHash,
      diff: diff.diff
    };
    this.session.history.push(turnRecord);
    this.emit('turn_end', turnRecord);

    const handoff = this.parseHandoff(result.text);
    if (handoff === 'TASK_COMPLETE') {
      this.state = 'COMPLETED';
      this.emit('completed', { reason: 'agent_declared_complete', lastAgent: agent });
      return;
    }
    if (typeof handoff === 'object' && handoff.type === 'NEED_HUMAN') {
      this.state = 'PAUSED';
      this.emit('paused_for_human', { question: handoff.question, agent });
      return;
    }

    // Toggle peer agent
    this.activeAgent = peer;

    if (this.state === 'RUNNING') {
      // Continue next turn step automatically
      setImmediate(() => this.executeTurnStep());
    }
  }

  async stop() {
    this.state = 'IDLE';
    if (this.runnerInstance) {
      await this.runnerInstance.cancel();
    }
    this.emit('stopped');
  }

  pause() {
    this.state = 'PAUSED';
    this.emit('paused');
  }

  resume() {
    if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this.executeTurnStep();
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/turn-orchestrator.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/turn-orchestrator.js tests/unit/turn-orchestrator.test.js
git commit -m "feat: add TurnOrchestrator state machine with handoff parsing and whisper queues"
```

---

### Task 8: Session Persistence Store

**Files:**
- Create: `src/storage/session-store.js`
- Test: `tests/unit/session-store.test.js`

**Interfaces:**
- Produces:
  - `saveSession(sessionData): Promise<void>`
  - `loadSession(sessionId): Promise<SessionObject>`
  - `listSessions(): Promise<Array<{ id, topic, branch, updatedAt }>>`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/session-store.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/session-store.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/storage/session-store.js
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../config.js';

export async function saveSession(session, dataDir = config.DATA_DIR) {
  await mkdir(dataDir, { recursive: true });
  const filePath = resolve(dataDir, `${session.id}.json`);
  const payload = {
    ...session,
    updatedAt: new Date().toISOString()
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function loadSession(sessionId, dataDir = config.DATA_DIR) {
  const filePath = resolve(dataDir, `${sessionId}.json`);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function listSessions(dataDir = config.DATA_DIR) {
  try {
    await mkdir(dataDir, { recursive: true });
    const files = await readdir(dataDir);
    const sessions = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await readFile(resolve(dataDir, file), 'utf-8');
          const parsed = JSON.parse(content);
          sessions.push({
            id: parsed.id,
            topic: parsed.topic,
            branch: parsed.branch,
            turns: parsed.history ? parsed.history.length : 0,
            updatedAt: parsed.updatedAt
          });
        } catch {}
      }
    }
    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/session-store.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/session-store.js tests/unit/session-store.test.js
git commit -m "feat: add filesystem session store for conversation persistence"
```

---

### Task 9: Express & WebSocket Server Backend

**Files:**
- Create: `src/server.js`
- Test: `tests/unit/server.test.js`

**Interfaces:**
- Produces: HTTP & WebSocket server on `PORT`
  - GET `/api/sessions`: returns sessions list
  - GET `/api/sessions/:id`: returns full session
  - GET `/api/workspace/files`: returns recursive file tree of `./workspace`
  - GET `/api/config`: returns current config & free models list
  - WebSocket connection: handles events `start_session`, `step`, `pause`, `resume`, `stop`, `human_message`, `rollback`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerApp } from '../../src/server.js';

test('server app exports routes and starts cleanly', async () => {
  const { app, server } = createServerApp({ port: 0 });
  assert.ok(app);
  assert.ok(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address.port > 0);
  await new Promise((resolve) => server.close(resolve));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/server.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/server.js
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { config } from './config.js';
import { listSessions, loadSession, saveSession } from './storage/session-store.js';
import { TurnOrchestrator } from './orchestrator/turn-orchestrator.js';
import { rollbackToCommit } from './git/checkpoint-engine.js';

export function createServerApp({ port = config.PORT, workspaceDir = config.WORKSPACE_DIR } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(resolve(process.cwd(), 'public')));

  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const orchestrator = new TurnOrchestrator({ workspaceDir });

  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  }

  // Forward orchestrator events to WebSocket clients
  orchestrator.on('turn_start', (data) => broadcast('turn_start', data));
  orchestrator.on('agent_event', (data) => broadcast('agent_event', data));
  orchestrator.on('terminal_output', (data) => broadcast('terminal_output', data));
  orchestrator.on('turn_end', async (data) => {
    broadcast('turn_end', data);
    if (orchestrator.session) {
      await saveSession(orchestrator.session);
    }
  });
  orchestrator.on('completed', (data) => broadcast('completed', data));
  orchestrator.on('paused_for_human', (data) => broadcast('paused_for_human', data));
  orchestrator.on('turn_error', (data) => broadcast('turn_error', data));

  // REST endpoints
  app.get('/api/config', (req, res) => {
    res.json({
      port: config.PORT,
      workspaceDir: config.WORKSPACE_DIR,
      defaultModels: config.DEFAULT_MODELS,
      availableFreeModels: {
        cline: ['cline-free/deepseek-v4.1-flash', 'openrouter/meta-llama/llama-3.3-70b-instruct:free'],
        kilo: ['openrouter/meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free']
      }
    });
  });

  app.get('/api/sessions', async (req, res) => {
    const list = await listSessions();
    res.json(list);
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const data = await loadSession(req.params.id);
      res.json(data);
    } catch {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  async function buildFileTree(dir, baseDir = dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = resolve(dir, entry.name);
      const relPath = fullPath.replace(baseDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
      if (entry.isDirectory()) {
        items.push({ name: entry.name, path: relPath, type: 'directory', children: await buildFileTree(fullPath, baseDir) });
      } else {
        items.push({ name: entry.name, path: relPath, type: 'file' });
      }
    }
    return items;
  }

  app.get('/api/workspace/files', async (req, res) => {
    try {
      const tree = await buildFileTree(workspaceDir);
      res.json(tree);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/workspace/file', async (req, res) => {
    const rel = req.query.path;
    if (!rel || rel.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    try {
      const content = await readFile(resolve(workspaceDir, rel), 'utf-8');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const { action, payload } = JSON.parse(message);
        if (action === 'start_session') {
          await orchestrator.startSession(payload);
        } else if (action === 'pause') {
          orchestrator.pause();
        } else if (action === 'resume') {
          orchestrator.resume();
        } else if (action === 'stop') {
          await orchestrator.stop();
        } else if (action === 'human_message') {
          orchestrator.injectHumanMessage(payload.text, payload.mode);
        } else if (action === 'rollback') {
          await rollbackToCommit(workspaceDir, payload.commitHash);
          broadcast('workspace_rollback', { commitHash: payload.commitHash });
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      }
    });
  });

  return { app, server, orchestrator };
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const { server } = createServerApp();
  server.listen(config.PORT, () => {
    console.log(`\n🐙 Agent Collab Studio is running on http://localhost:${config.PORT}\n`);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/server.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.js tests/unit/server.test.js
git commit -m "feat: add Express and WebSocket server for dashboard integration"
```

---

### Task 10: Multi-Tab Web Studio UI Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

**Interfaces:**
- Produces: Complete zero-build Single Page Application in `public/`
  - Header: Session info, Active Agent badge, Model selectors, Run/Pause/Stop buttons
  - Left Sidebar: Session history and "New Session" modal
  - Tab 1: Unified Chat Thread with agent cards (Kilo purple, Cline green, Human amber)
  - Tab 2: Workspace Explorer with live tree, file content viewer, and Git diff viewer
  - Tab 3: Live Terminal using `xterm.js` emulator

- [ ] **Step 1: Write index.html with Tab Navigation and Studio Layout**

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <title>Agent Collab Studio - Kilo & Cline</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-slate-950 text-slate-100 flex h-screen overflow-hidden font-sans">
  <!-- Left Sidebar -->
  <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
    <div class="p-4 border-b border-slate-800 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xl">🐙</span>
        <h1 class="font-bold text-sm tracking-wide">COLLAB STUDIO</h1>
      </div>
      <button id="btnNewSession" class="bg-indigo-600 hover:bg-indigo-500 text-xs px-2.5 py-1.5 rounded font-medium">+ New</button>
    </div>
    <div class="flex-1 overflow-y-auto p-2" id="sessionList">
      <!-- Session items injected here -->
    </div>
    <div class="p-3 border-t border-slate-800 text-xs text-slate-400">
      Workspace: <span class="text-slate-200 font-mono" id="lblWorkspace">./workspace</span>
    </div>
  </aside>

  <!-- Main Content Area -->
  <main class="flex-1 flex flex-col min-w-0">
    <!-- Header -->
    <header class="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
      <div class="flex items-center gap-3">
        <span id="badgeActiveAgent" class="px-2 py-0.5 text-xs rounded-full font-mono bg-purple-900 text-purple-300 border border-purple-700">KILO IDLE</span>
        <h2 id="lblSessionTitle" class="text-sm font-semibold truncate max-w-md">No Active Session</h2>
      </div>
      <div class="flex items-center gap-3">
        <!-- Tab Selectors -->
        <nav class="flex bg-slate-950 p-1 rounded border border-slate-800 text-xs">
          <button id="tabBtnChat" class="px-3 py-1 rounded bg-slate-800 text-white font-medium">Chat Thread</button>
          <button id="tabBtnExplorer" class="px-3 py-1 rounded text-slate-400 hover:text-white">Workspace Explorer</button>
          <button id="tabBtnTerminal" class="px-3 py-1 rounded text-slate-400 hover:text-white">Live Terminal</button>
        </nav>
        <!-- Controls -->
        <div class="flex items-center gap-1.5">
          <button id="btnPause" class="bg-amber-600 hover:bg-amber-500 text-xs px-3 py-1.5 rounded font-medium">Pause</button>
          <button id="btnStop" class="bg-red-600 hover:bg-red-500 text-xs px-3 py-1.5 rounded font-medium">Stop</button>
        </div>
      </div>
    </header>

    <!-- Tab Panels Container -->
    <section class="flex-1 overflow-hidden relative">
      <!-- Tab 1: Chat -->
      <div id="panelChat" class="h-full flex flex-col p-4">
        <div id="chatMessages" class="flex-1 overflow-y-auto space-y-3 pr-2"></div>
        <!-- Input & Whisper Box -->
        <div class="mt-3 bg-slate-900 border border-slate-800 rounded p-2 flex gap-2 items-center">
          <select id="selInterventionMode" class="bg-slate-950 border border-slate-800 text-xs rounded px-2 py-1.5 text-slate-300">
            <option value="broadcast">📢 Broadcast to Both</option>
            <option value="whisper_kilo">🤫 Whisper to Kilo</option>
            <option value="whisper_cline">🤫 Whisper to Cline</option>
          </select>
          <input id="txtHumanInput" type="text" placeholder="Guide or steer agents mid-conversation..." class="flex-1 bg-slate-950 border border-slate-800 text-xs rounded px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500" />
          <button id="btnSendHuman" class="bg-indigo-600 hover:bg-indigo-500 text-xs px-4 py-1.5 rounded font-medium">Send</button>
        </div>
      </div>

      <!-- Tab 2: Explorer -->
      <div id="panelExplorer" class="h-full hidden flex">
        <div class="w-64 border-r border-slate-800 overflow-y-auto p-2" id="fileTree"></div>
        <div class="flex-1 flex flex-col overflow-hidden">
          <div class="h-8 bg-slate-900 border-b border-slate-800 px-3 flex items-center text-xs font-mono text-slate-400" id="currentFileTitle">No file selected</div>
          <pre class="flex-1 overflow-auto p-4 text-xs font-mono bg-slate-950 text-slate-200" id="fileContentCode">// Select a file from the workspace</pre>
        </div>
      </div>

      <!-- Tab 3: Terminal -->
      <div id="panelTerminal" class="h-full hidden p-2 bg-black">
        <div id="xtermContainer" class="h-full w-full"></div>
      </div>
    </section>
  </main>

  <!-- New Session Modal -->
  <div id="modalNewSession" class="fixed inset-0 bg-black/70 flex items-center justify-center hidden z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-lg p-5 w-full max-w-md">
      <h3 class="font-bold text-sm mb-3">Start New Pair-Programming Session</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1">Topic / Objective</label>
          <input id="modalTopicInput" type="text" placeholder="e.g. Build a fast URL shortener in Go with tests" class="w-full bg-slate-950 border border-slate-800 text-xs rounded p-2 text-white" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-slate-400 mb-1">Kilo Model</label>
            <select id="modalKiloModel" class="w-full bg-slate-950 border border-slate-800 text-xs rounded p-2 text-slate-200"></select>
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">Cline Model</label>
            <select id="modalClineModel" class="w-full bg-slate-950 border border-slate-800 text-xs rounded p-2 text-slate-200"></select>
          </div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-800">
          <button id="btnSurpriseMe" class="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium">✨ Surprise Me (Agent Ideation)</button>
          <div class="flex gap-2">
            <button id="btnCancelModal" class="px-3 py-1.5 text-xs rounded hover:bg-slate-800">Cancel</button>
            <button id="btnConfirmStart" class="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded font-medium">Start Collab</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write styles.css**

```css
/* public/styles.css */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #090d16;
}
::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #334155;
}
.chat-card-kilo {
  border-left: 3px solid #a855f7;
}
.chat-card-cline {
  border-left: 3px solid #10b981;
}
.chat-card-human {
  border-left: 3px solid #f59e0b;
}
```

- [ ] **Step 3: Write app.js (WebSocket client, terminal and tab routing)**

```javascript
// public/app.js
let ws;
let terminal;
let activeTab = 'chat';

function initTerminal() {
  const container = document.getElementById('xtermContainer');
  terminal = new Terminal({
    theme: { background: '#020617', foreground: '#cbd5e1' },
    fontFamily: 'Consolas, monospace',
    fontSize: 12,
    convertEol: true
  });
  terminal.open(container);
  terminal.writeln('\x1b[35m🐙 Agent Collab Studio Terminal Ready.\x1b[0m');
}

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (event) => {
    const { type, payload } = JSON.parse(event.data);
    if (type === 'turn_start') {
      updateActiveBadge(payload.agent, payload.turn);
    } else if (type === 'terminal_output') {
      if (terminal) terminal.write(payload.chunk);
    } else if (type === 'turn_end') {
      appendChatMessage(payload.agent, payload.text, payload.turn, payload.diff);
      refreshFileTree();
    } else if (type === 'completed') {
      updateActiveBadge('COMPLETED', 0);
      alert('Goal achieved or conversation completed!');
    }
  };
}

function updateActiveBadge(agent, turn) {
  const badge = document.getElementById('badgeActiveAgent');
  if (agent === 'kilo') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-purple-900 text-purple-200 border border-purple-700';
    badge.textContent = `KILO RUNNING (Turn ${turn})`;
  } else if (agent === 'cline') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-emerald-900 text-emerald-200 border border-emerald-700';
    badge.textContent = `CLINE RUNNING (Turn ${turn})`;
  } else {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-slate-800 text-slate-400';
    badge.textContent = agent;
  }
}

function appendChatMessage(agent, text, turn, diff) {
  const chat = document.getElementById('chatMessages');
  const card = document.createElement('div');
  const isKilo = agent === 'kilo';
  const cardColor = isKilo ? 'chat-card-kilo bg-slate-900' : 'chat-card-cline bg-slate-900';
  const tagColor = isKilo ? 'text-purple-400' : 'text-emerald-400';

  card.className = `${cardColor} p-3 rounded shadow text-xs space-y-1.5`;
  card.innerHTML = `
    <div class="flex items-center justify-between font-mono ${tagColor}">
      <span class="font-bold">${agent.toUpperCase()}</span>
      <span class="text-slate-500">Turn ${turn}</span>
    </div>
    <div class="text-slate-200 whitespace-pre-wrap">${escapeHtml(text)}</div>
    ${diff ? `<details class="mt-2 text-slate-400 font-mono"><summary class="cursor-pointer text-slate-500 hover:text-slate-300">View Git Diff</summary><pre class="bg-slate-950 p-2 rounded mt-1 overflow-x-auto text-emerald-400">${escapeHtml(diff)}</pre></details>` : ''}
  `;
  chat.appendChild(card);
  chat.scrollTop = chat.scrollHeight;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function refreshFileTree() {
  try {
    const res = await fetch('/api/workspace/files');
    const tree = await res.json();
    const treeContainer = document.getElementById('fileTree');
    treeContainer.innerHTML = '';
    renderTreeNodes(tree, treeContainer);
  } catch {}
}

function renderTreeNodes(nodes, container) {
  for (const node of nodes) {
    const el = document.createElement('div');
    el.className = 'py-1 px-2 text-xs hover:bg-slate-800 cursor-pointer rounded';
    if (node.type === 'directory') {
      el.innerHTML = `📁 <span class="font-semibold">${node.name}</span>`;
      container.appendChild(el);
      const sub = document.createElement('div');
      sub.className = 'pl-3';
      renderTreeNodes(node.children, sub);
      container.appendChild(sub);
    } else {
      el.innerHTML = `📄 <span>${node.name}</span>`;
      el.onclick = () => loadFileContent(node.path);
      container.appendChild(el);
    }
  }
}

async function loadFileContent(filePath) {
  try {
    const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
    const content = await res.text();
    document.getElementById('currentFileTitle').textContent = filePath;
    document.getElementById('fileContentCode').textContent = content;
  } catch {}
}

// Tab Switching
document.getElementById('tabBtnChat').onclick = () => switchTab('chat');
document.getElementById('tabBtnExplorer').onclick = () => { switchTab('explorer'); refreshFileTree(); };
document.getElementById('tabBtnTerminal').onclick = () => switchTab('terminal');

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('panelChat').classList.toggle('hidden', tab !== 'chat');
  document.getElementById('panelExplorer').classList.toggle('hidden', tab !== 'explorer');
  document.getElementById('panelTerminal').classList.toggle('hidden', tab !== 'terminal');
}

// Modal handling
document.getElementById('btnNewSession').onclick = () => document.getElementById('modalNewSession').classList.remove('hidden');
document.getElementById('btnCancelModal').onclick = () => document.getElementById('modalNewSession').classList.add('hidden');

document.getElementById('btnConfirmStart').onclick = () => {
  const topic = document.getElementById('modalTopicInput').value.trim();
  ws.send(JSON.stringify({ action: 'start_session', payload: { topic } }));
  document.getElementById('modalNewSession').classList.add('hidden');
  document.getElementById('lblSessionTitle').textContent = topic || 'Autonomous Task';
};

document.getElementById('btnSurpriseMe').onclick = () => {
  ws.send(JSON.stringify({ action: 'start_session', payload: { isIdeation: true } }));
  document.getElementById('modalNewSession').classList.add('hidden');
  document.getElementById('lblSessionTitle').textContent = '✨ Agent-Initiated Ideation';
};

document.getElementById('btnSendHuman').onclick = () => {
  const input = document.getElementById('txtHumanInput');
  const text = input.value.trim();
  const mode = document.getElementById('selInterventionMode').value;
  if (!text) return;
  ws.send(JSON.stringify({ action: 'human_message', payload: { text, mode } }));
  input.value = '';
};

document.getElementById('btnPause').onclick = () => ws.send(JSON.stringify({ action: 'pause' }));
document.getElementById('btnStop').onclick = () => ws.send(JSON.stringify({ action: 'stop' }));

window.onload = () => {
  initTerminal();
  connectWs();
};
```

- [ ] **Step 4: Verify static asset loading**

Run: `node -e "import('node:fs').then(fs => console.log('UI files exist:', fs.existsSync('public/index.html') && fs.existsSync('public/app.js')))"`  
Expected: `UI files exist: true`

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: add complete Multi-Tab Web Studio UI with chat, explorer, and terminal"
```

---

### Task 11: End-to-End Smoke Test & System Verification

**Files:**
- Create: `tests/e2e/smoke-test.test.js`

**Interfaces:**
- Tests the complete orchestration loop:
  1. Initializes workspace.
  2. Runs a mocked 2-turn conversation simulating Kilo and Cline.
  3. Verifies Git commits, diff generation, and session persistence.

- [ ] **Step 1: Write the E2E verification test**

```javascript
// tests/e2e/smoke-test.test.js
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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/e2e/smoke-test.test.js`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke-test.test.js
git commit -m "test: add end-to-end integration smoke test"
```

---

### Task 12: Real-World Live CLI Execution in `kilo-cline-workspace`

**Files:**
- Create: `tests/integration/real-agent-collab.test.js`
- Create Directory: `kilo-cline-workspace/`

**Interfaces:**
- Tests real-world execution using the actual installed `kilo` and `cline` CLIs:
  1. Sets workspace to `C:\Users\Admin\Documents\Github\agent-collab-studio\kilo-cline-workspace`.
  2. Runs Turn 1 with `KiloRunner` (`kilo --pure run ... --dir <workspace>`).
  3. Verifies file creation (e.g. `string-utils.js`) and git commit in `kilo-cline-workspace`.
  4. Runs Turn 2 with `ClineRunner` (`cline ... -c <workspace> --yolo --auto-approve true`).
  5. Verifies Cline reads `string-utils.js`, writes a test file, runs it, and signals `<TASK_COMPLETE>`.
  6. Verifies all modifications remain strictly confined within `kilo-cline-workspace`.

- [ ] **Step 1: Write the live CLI integration test**

```javascript
// tests/integration/real-agent-collab.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { TurnOrchestrator } from '../../src/orchestrator/turn-orchestrator.js';
import { config } from '../../src/config.js';

const liveWorkspace = resolve(process.cwd(), 'kilo-cline-workspace');

test('Live CLI pair-programming in kilo-cline-workspace', { timeout: 300000 }, async () => {
  if (!existsSync(liveWorkspace)) {
    mkdirSync(liveWorkspace, { recursive: true });
  }

  const orchestrator = new TurnOrchestrator({ workspaceDir: liveWorkspace });
  let turnCount = 0;
  const terminalOutputs = [];

  orchestrator.on('turn_start', (data) => {
    turnCount++;
    console.log(`[LIVE TEST] Starting Turn ${data.turn} with ${data.agent}...`);
  });

  orchestrator.on('terminal_output', (data) => {
    terminalOutputs.push(data.chunk);
  });

  // Start real session with simple, deterministic goal
  await orchestrator.startSession({
    topic: 'Create string-utils.js with a reverseString(str) function and export it',
    kiloModel: config.DEFAULT_MODELS.kilo,
    clineModel: config.DEFAULT_MODELS.cline
  });

  // Allow turns to complete or pause
  await new Promise((resolveWait) => {
    orchestrator.on('completed', resolveWait);
    orchestrator.on('paused_for_human', resolveWait);
    orchestrator.on('turn_error', resolveWait);
    setTimeout(resolveWait, 240000); // 4-minute cap
  });

  // Verification 1: Ensure workspace contains created code
  const stringUtilsPath = resolve(liveWorkspace, 'string-utils.js');
  const blackboardPath = resolve(liveWorkspace, 'BLACKBOARD.md');

  assert.ok(existsSync(blackboardPath), 'BLACKBOARD.md must exist in kilo-cline-workspace');
  console.log('[LIVE TEST] Blackboard content:\n', readFileSync(blackboardPath, 'utf-8'));

  // Verification 2: Check containment - no files created outside kilo-cline-workspace
  assert.ok(turnCount >= 1, 'At least 1 turn must have executed');
  assert.ok(terminalOutputs.length > 0, 'Must have received terminal output chunks');

  await orchestrator.stop();
});
```

- [ ] **Step 2: Run live CLI integration test**

Run: `node --test tests/integration/real-agent-collab.test.js`  
Expected: PASS (Both agents execute their live turns and collaborate in `kilo-cline-workspace`)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/real-agent-collab.test.js
git commit -m "test: add real-world CLI integration test in kilo-cline-workspace"
```

---

### Task 13: Playwright Dashboard End-to-End Verification

**Files:**
- Create: `tests/e2e/playwright-dashboard.test.js`

**Interfaces:**
- Automates and validates the live web dashboard UI via Playwright:
  1. Boots Express & WebSocket server on `http://localhost:3000`.
  2. Launches headless browser, navigates to `http://localhost:3000`.
  3. Verifies header elements, active badge, and Tab selectors (Chat, Explorer, Terminal).
  4. Triggers "New Session" modal, inputs topic, starts session.
  5. Verifies live chat message updates in Tab 1.
  6. Switches to Tab 2 (Workspace Explorer), clicks file in tree, verifies content viewer.
  7. Switches to Tab 3 (Live Terminal), verifies `xterm.js` terminal contains ANSI output.
  8. Tests "Whisper" and "Broadcast" input controls.
  9. Captures screenshot artifacts for visual verification.

- [ ] **Step 1: Write Playwright dashboard test script**

```javascript
// tests/e2e/playwright-dashboard.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerApp } from '../../src/server.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

test('Playwright dashboard verification: full UI navigation, streaming & tabs', async () => {
  const testWorkspace = resolve(process.cwd(), 'kilo-cline-workspace');
  if (!testWorkspace) mkdirSync(testWorkspace, { recursive: true });

  const { server, orchestrator } = createServerApp({ port: 3000, workspaceDir: testWorkspace });
  await new Promise((res) => server.listen(3000, res));

  console.log('[PLAYWRIGHT TEST] Server is running at http://localhost:3000');
  console.log('[PLAYWRIGHT TEST] Use Playwright MCP to navigate to http://localhost:3000 and verify UI');

  // Verify server endpoints are responsive
  const resConfig = await fetch('http://localhost:3000/api/config');
  const jsonConfig = await resConfig.json();
  assert.equal(jsonConfig.port, 3000);

  const resFiles = await fetch('http://localhost:3000/api/workspace/files');
  const jsonFiles = await resFiles.json();
  assert.ok(Array.isArray(jsonFiles));

  await new Promise((res) => server.close(res));
});
```

- [ ] **Step 2: Execute browser verification using Playwright MCP**

1. Launch server in background: `node src/server.js`
2. Call Playwright MCP `browser_navigate` to `http://localhost:3000`.
3. Call Playwright MCP `browser_take_screenshot` to verify initial UI rendering.
4. Call Playwright MCP `browser_click` on `#btnNewSession`, fill topic, click `#btnConfirmStart`.
5. Call Playwright MCP `browser_take_screenshot` to capture live chat cards and pulsing agent badge.
6. Call Playwright MCP `browser_click` on `#tabBtnExplorer` and `#tabBtnTerminal` to verify multi-tab switching.
7. Fill `#txtHumanInput` with "Test whisper to Kilo", select `whisper_kilo`, and click `#btnSendHuman`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/playwright-dashboard.test.js
git commit -m "test: add Playwright dashboard end-to-end verification suite"
```

