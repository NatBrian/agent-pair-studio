# Agent Collab Studio Design Specification

**Status**: Approved  
**Author**: Antigravity & Human Pair-Programming Partner  
**Date**: 2026-09-16  
**Repository**: `agent-collab-studio`  

---

## 1. Overview & System Goal

**Agent Collab Studio** is an autonomous pair-programming and collaborative execution harness for **Kilo CLI** and **Cline CLI** on Windows. It enables both agents to converse continuously, collaborate on tasks, run terminal commands, and create/edit code within a strictly contained workspace. The user can monitor and steer the dialogue in real-time through a multi-tab web dashboard.

---

## 2. Core Architectural Pillars

### 2.1 Equal Peer Hierarchy
* **No Master/Subordinate**: Neither Kilo nor Cline acts as an orchestrator or delegator. Both have identical authority, tools, and equal status.
* **Collaboration Dynamic**: Two senior engineers working on a shared repository. Each turn reviews peer work, tests code, adds functionality, or contributes to research/discussion.

### 2.2 Strict Workspace Containment
* **Dedicated Sandbox Root**: Path locked to `C:\Users\Admin\Documents\Github\agent-collab-studio\kilo-cline-workspace` (absolute canonical path verified via `realpathSync`).
* **Root Validation**: The orchestrator verifies that the directory exists, is a valid folder, and is NOT the filesystem root (`C:\` or `\` ).
* **CWD Enforcement**: Every CLI invocation explicitly passes `--dir <abs_path>` (Kilo) or `-c <abs_path>` (Cline) and runs with child process `cwd` set to this directory.
* **Safety Prompt Guardrails**: Both agents are injected with non-negotiable instructions forbidding path escapes or access to parent directories.

### 2.3 Git Branch Isolation & Time Machine
* **Branch per Session**: Every new conversation creates and checks out a new branch (`session/<id>-<slug>`).
* **Turn Checkpoints**: At the conclusion of every agent turn, the orchestrator automatically executes:
  ```bash
  git add -A
  git commit -m "[Turn N] <Agent>: <Summary>" --allow-empty
  ```
* **Diff Tracking & Rollback**: Turn-by-turn git diffs (`git diff HEAD~1 HEAD`) are extracted for the dashboard, and a one-click rollback (`git reset --hard <hash>`) is supported.

### 2.4 CLI Execution Engines & Windows Quirks
* **Kilo CLI Invocation**:
  ```powershell
  kilo --pure run "<prompt>" --dir "<workspacePath>" --auto --format json -m "<model>" --session "<kiloSessionId>"
  ```
  * *Critical Discovery*: Must include `--pure` to prevent Kilo from freezing on background plugin auto-title generation.
* **Cline CLI Invocation**:
  ```powershell
  cline "<prompt>" -c "<workspacePath>" --auto-approve true --yolo --json -m "<model>" --id "<clineSessionId>"
  ```
  * Uses `--yolo` / `--auto-approve true` for non-interactive autonomous execution.
* **Process Tree Termination**: On Windows, timeouts or user cancellations trigger native `taskkill /PID <pid> /T /F` to ensure no orphan processes remain.

### 2.5 Dual-Layer Memory & Handoff Protocols
1. **Conversational Memory**: Native CLI session continuity (`--session` for Kilo, `--id` for Cline). Kilo's output is fed to Cline as `[Kilo]: ...`, and Cline's output to Kilo as `[Cline]: ...`.
2. **Shared Workspace Memory**: Persistent `BLACKBOARD.md` file in the workspace root for high-level architecture decisions, schemas, and task checklists that survive context compaction.
3. **Control Tags**:
   * `<HANDOFF>`: Turn complete, pass control to peer.
   * `<TASK_COMPLETE>`: Goal accomplished, pause loop and alert dashboard.
   * `<NEED_HUMAN question="...">`: Ambiguity encountered, pause loop and request user input.

### 2.6 Free Model Support & Transient Error Backoff
* **Model Selection**: Dashboard provides dropdown selectors populated with popular free models (e.g. `cline-free/deepseek-v4.1-flash`, OpenRouter free tiers, Gemini free tiers).
* **Smart Retry & Backoff**:
  * Transient errors (HTTP 429, `rate limit`, `too many requests`, `502`, `503`, timeouts, `ECONNRESET`) automatically retry up to 3 times (10s, 20s, 30s delays).
  * Permanent errors (401, quota exceeded, invalid model) immediately pause the loop and alert the dashboard.

### 2.7 Human Steering (Dual Mode)
* **Public Broadcast**: Message injected into the shared thread as `[Human Overseer]: ...`, visible to both agents.
* **Private Whisper**: Message injected exclusively into Kilo's or Cline's next prompt without being shown to the peer.

### 2.8 Multi-Tab Web Studio
* **Tech Stack**: Single-server Node.js + Express + WebSocket (`ws`) backend, serving a zero-build HTML5/Tailwind/Vanilla JS frontend.
* **Interface Tabs**:
  * **Tab 1: Unified Chat Thread**: Chronological cards for Kilo, Cline, and Human with collapsible tool-call bubbles and markdown rendering.
  * **Tab 2: Workspace Explorer**: Interactive tree view of `./kilo-cline-workspace`, file viewer with syntax highlighting, and turn git diff inspector.
  * **Tab 3: Live Terminal**: Streaming ANSI terminal emulator using `xterm.js` capturing raw CLI stdout/stderr.
  * **Sidebar**: Session history list, "New Session" modal (Custom Topic vs. "Agent Ideation / Surprise Me"), Model selectors, and control buttons (**Run / Step / Pause / Stop / Rollback**).

### 2.9 Real-World CLI Validation & Playwright MCP Testing
* **Dedicated Execution Directory**: All live multi-agent tests and operations execute inside `C:\Users\Admin\Documents\Github\agent-collab-studio\kilo-cline-workspace`.
* **Live CLI Multi-Agent Testing**: Validates that actual `kilo` CLI and `cline` CLI processes run, collaborate, generate code, and commit turns in the dedicated directory.
* **Playwright MCP UI Testing**: Automates testing of the live dashboard via Playwright:
  * Verifies page load and WebSocket handshake at `http://localhost:3000`.
  * Tests session initiation and verifies real-time streaming to the Unified Chat thread.
  * Tests switching to the Workspace Explorer tab and inspecting files and git diffs.
  * Tests switching to the Live Terminal tab and inspecting ANSI terminal output.
  * Tests human steering input (Whisper and Broadcast modes).
  * Captures browser screenshot artifacts for visual verification.

