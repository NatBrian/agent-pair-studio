# Learnings & Reusable Logic from `claude-octopus`

**Source Repository**: [https://github.com/nyldn/claude-octopus](https://github.com/nyldn/claude-octopus)  
**Analyzed Version**: v11.5.0 (Commit as of September 2026)  
**Analysis Date**: 2026-09-16  

---

## 1. Architectural Summary & Scope

`claude-octopus` is a multi-model orchestration **plugin** built primarily for **Claude Code** (and Cursor / Codex). It serves as a "host-and-spoke" system: Claude Code acts as the central host, and Octopus dispatches prompts to up to 12 external AI CLI providers (Codex, Antigravity CLI, Copilot, Qwen, Ollama, OpenRouter, OpenCode, Cursor CLI, etc.) to gather adversarial reviews, second opinions, and council consensus.

### Why It Cannot Be Used Directly As-Is
1. **POSIX / Bash Heavy**: ~90% of the codebase is composed of shell scripts (`.sh`) using Unix-specific utilities (`flock`, `jq`, `trap`, `stty`). The project's own `PRODUCT.md` notes: *"Windows native support untested — shell scripts assume POSIX"*. Our environment is native **Windows** (PowerShell / Node.js).
2. **Missing Cline CLI Integration**: It supports Claude, Codex, OpenCode, etc., but has no adapter or flags for **Cline CLI**.
3. **No Independent Web Dashboard**: It is controlled via terminal slash-commands inside Claude Code (`/octo:council`, `/octo:debate`) rather than providing a multi-tab web studio (Unified Chat, Live Terminal, Workspace Explorer).
4. **Different Interaction Model**: It performs one-shot dispatch for review/consensus, not a continuous turn-taking pair-programming conversation loop between two independent agents.

---

## 2. Reusable Logic & High-Value Patterns to Adopt

While the full repository cannot be used as our base, several battle-tested mechanisms solve critical problems for `agent-collab-studio`:

---

### Pattern 1: The `--pure` Flag for Kilo / OpenCode (Critical Hang Fix)

* **Source File**: `scripts/lib/dispatch.sh:741`
* **Discovery**:
  > *"`--pure` skips opencode's external-plugin auto-title path, which otherwise resolves an SDK handle for a hardcoded small model before the prompt is even sent — an unresolvable catalog/model there hangs `opencode run` indefinitely with no timeout or error."*
* **Application to Our Project**:
  Because **Kilo CLI is built directly on OpenCode**, running `kilo run` without `--pure` can hang indefinitely in non-interactive/headless environments while trying to auto-generate a session title.
* **Adopted Command Pattern**:
  ```bash
  # ALWAYS include --pure before run:
  kilo --pure run [prompt] --dir <workspacePath> --auto --format json -m <model> --session <id>
  ```

---

### Pattern 2: Strict Workspace Root Validation

* **Source File**: `shared/adapter-runtime.mjs:37`
* **Discovery**: Robust directory validation prevents agents from targeting invalid paths, relative escapes, or the filesystem root.
* **Adopted Node.js Implementation**:
  ```javascript
  import { realpathSync, statSync } from 'node:fs';
  import { parse, isAbsolute } from 'node:path';

  export function validateSandboxRoot(sandboxPath) {
    if (!sandboxPath || typeof sandboxPath !== 'string' || sandboxPath.trim() === '') {
      throw new Error("sandbox_path is required");
    }
    if (!isAbsolute(sandboxPath)) {
      throw new Error("sandbox_path must be an absolute path");
    }
    const canonical = realpathSync(sandboxPath);
    if (!statSync(canonical).isDirectory()) {
      throw new Error("sandbox_path must be a directory");
    }
    if (canonical === parse(canonical).root) {
      throw new Error("sandbox_path cannot be the filesystem root (C:\\)");
    }
    return canonical;
  }
  ```

---

### Pattern 3: Windows Process-Tree Termination

* **Source File**: `shared/process_supervisor.py:64`
* **Discovery**: On Windows, simply calling `child.kill()` only terminates the wrapper process (e.g. `cmd.exe` or `powershell.exe`), leaving child processes (node, python, compilers) orphaned in the background.
* **Adopted Mechanism**:
  Execute native Windows `taskkill` with `/T` (tree) and `/F` (force):
  ```javascript
  import { exec } from 'node:child_process';

  export function terminateProcessTree(pid) {
    if (process.platform === 'win32') {
      exec(`taskkill /PID ${pid} /T /F`, (err) => {
        if (err) console.error(`taskkill error for PID ${pid}:`, err.message);
      });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  }
  ```

---

### Pattern 4: Error Classification (Transient vs. Permanent)

* **Source File**: `scripts/provider-router.sh:39`
* **Discovery**: Free models frequently hit rate limits or server timeouts. Classifying errors into transient (retryable) vs permanent (fatal) allows autonomous resilience.
* **Adopted Classification Logic**:
  * **Transient Errors** (Trigger auto-retry with exponential backoff, e.g. 10s, 20s):
    * Rate Limits: `429`, `"rate limit"`, `"too many requests"`.
    * Server Errors: `500`, `502`, `503`, `504`, `"bad gateway"`, `"service unavailable"`, `"gateway timeout"`.
    * Network / Sockets: `"timeout"`, `"timed out"`, `"connection refused"`, `"ECONNRESET"`, `"ECONNREFUSED"`, `"ETIMEDOUT"`.
    * Capacity: `"overloaded"`, `"capacity"`, `"temporarily"`.
  * **Permanent Errors** (Pause loop and notify the human on the dashboard):
    * Authentication / Quota: `401`, `403`, `"unauthorized"`, `"invalid api key"`, `"quota exceeded"`, `"insufficient"`.
    * Invalid Requests: `404`, `"not found"`, `"invalid model"`, `400`, `"bad request"`.

---

### Pattern 5: Credential Sanitization & Secret Redaction

* **Source File**: `shared/adapter-runtime.mjs` & `scripts/handoff.sh:70`
* **Discovery**: When displaying agent thoughts, tool outputs, or terminal streams in the dashboard, any accidental output containing tokens or keys must be redacted.
* **Adopted Redaction Rules**:
  ```javascript
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

---

### Pattern 6: Structured Handoff Schema

* **Source File**: `scripts/handoff.sh:81`
* **Discovery**: Using a clean schema for handoffs ensures state continuity between agents and tracks blockers/decisions across turns.
* **Adopted Shared State Format (`BLACKBOARD.md` / JSON)**:
  ```json
  {
    "sessionId": "session-123",
    "topic": "Build CLI Markdown Parser",
    "turn": 4,
    "activeAgent": "cline",
    "peerAgent": "kilo",
    "phase": "implementation",
    "status": "in_progress",
    "decisions": [
      "Use TypeScript with strict mode",
      "Store test cases in tests/fixtures/"
    ],
    "completedTasks": [
      "Initialized package.json",
      "Created AST parser in src/parser.ts"
    ],
    "currentGoal": "Add unit tests in tests/parser.test.ts"
  }
  ```
