# Discussion, Research & Planning Draft

**Status**: In Brainstorming / Planning  
**Last Updated**: 2026-09-16  

---

## 1. Project Motivation & Goals

The goal is to provide a dedicated, safe environment where two state-of-the-art terminal coding agents—**Kilo CLI** and **Cline CLI**—can interact autonomously like a pair-programming team on:
1. **User-Provided Topics**: Tasks, features, bug hunts, architecture designs, or open research prompts provided by the user.
2. **Agent-Initiated Ideation**: The starting agent comes up with an interesting coding challenge, tool idea, benchmark, or discussion topic autonomously.

### Core Requirements
* **Full Tool Access**: Both agents can execute bash commands, create/edit files, read directories, and run tests.
* **YOLO / Skip-Permission Mode**: Both agents run with automatic tool approvals (`--auto` for Kilo, `--auto-approve true` / `--yolo` for Cline).
* **Strict Workspace Containment**: Despite running in auto-approve mode, their modifications must be strictly confined to a single dedicated folder (`agent-sandbox/`).
* **Multi-Tab Studio Dashboard**:
  * **Unified Chat Thread**: Shows both agents' messages, thoughts, and collapsible tool calls chronologically.
  * **Workspace Explorer**: Live file tree and viewer for files created/edited in the sandbox.
  * **Terminal Output**: Live raw terminal stdout/stderr stream from both CLI runs.
  * **Session History**: Browse and load previous conversation runs.
  * **Model Selection**: Choose free models for each agent from the dashboard.

---

## 2. Technical Research & CLI Investigation

Both CLIs were investigated on the host system:
* **Kilo CLI**:
  * Binary: `@kilocode/cli` (v7.6.2), installed via npm (`kilo.ps1`).
  * Non-interactive execution: `kilo run [message] --dir <path> --auto --format json`
  * Session continuity: `--session <sessionID>` / `-c, --continue`
  * Protocol modes: `kilo acp` (starts ACP server), `kilo serve` (starts headless HTTP server).
* **Cline CLI**:
  * Binary: `cline` (v3.0.62), installed via npm (`cline.ps1`).
  * Non-interactive execution: `cline [prompt] -c <path> --auto-approve true --yolo --json`
  * Custom system prompt: `-s "<system_prompt>"`
  * Session continuity: `--id <session-id>`
  * Context compaction: `--compaction <agentic|basic|off>`
  * Protocol modes: `--acp` (Agent Client Protocol for editor integration), `--zen` (background daemon).

### 2.1 Communication Protocol: ACP vs. CLI Subprocess (NDJSON)

* **What is ACP?**
  * ACP (Agent Client Protocol) is an open JSON-RPC 2.0 standard designed specifically for **Editor-to-Agent** communication (e.g., embedding Cline or Kilo into editors like Zed or JetBrains).
  * In ACP, the Editor is the *client* and the Agent CLI is the *server*.
* **Evaluation for Multi-Agent Orchestration**:
  * *Why CLI Subprocess with NDJSON is Preferred*:
    1. Both CLIs natively support `--json` (which streams NDJSON events: assistant thoughts, text chunks, tool executions, and file edits).
    2. Subprocess execution preserves the **raw ANSI terminal stdout/stderr**, which is required to populate the "Live Terminal" tab in the dashboard.
    3. Simpler and significantly more stable on Windows than maintaining two long-running JSON-RPC stdio daemon connections.
    4. Clean process-level lifecycle (spawn -> stream events -> turn finishes -> process exits cleanly).

---

## 3. Architecture & Containment Design

### 3.1 Workspace Containment
* **Dedicated Sandbox Root**: e.g., `agent-sandbox-workspace/` (isolated from other repositories).
* **CWD Enforcement**: Child processes are spawned strictly with `cwd` set to the sandbox path, plus explicit CLI flags (`--dir` for Kilo, `-c` for Cline).
* **System Prompt Guardrails**: Both agents receive an explicit instruction:
  > *"CRITICAL SAFETY BOUNDARY: You are strictly confined to this workspace directory. All file reads, writes, edits, and terminal commands must operate within this directory. Never access, modify, or run commands targeting parent directories or absolute paths outside this folder."*

### 3.2 Git Checkpoint Engine ("Time Machine")
* The sandbox folder is initialized with `git init`.
* At the conclusion of every turn, the orchestrator automatically executes:
  ```bash
  git add -A
  git commit -m "[Turn N] <Agent>: <Summary>" --allow-empty
  ```
* **Benefits**:
  * Live diff inspection: View file changes made during each turn.
  * Turn rollback: Rewind workspace state to any turn (`git reset --hard`) if an agent makes an unintended modification.

---

## 4. Memory Management & Collaboration Mechanics

### 4.1 Dual-Layer Memory Architecture
1. **Layer 1: Conversational Memory (Thread Continuity)**
   * Kilo and Cline retain their individual session IDs (`--session` and `--id`).
   * When Kilo responds, its message is passed to Cline as the next user turn prefixed with `[Kilo]: ...`.
   * When Cline responds, its message is passed to Kilo prefixed with `[Cline]: ...`.
   * When context limits are reached, each agent’s native context compaction triggers safely without corrupting the peer agent's context.
2. **Layer 2: Shared Workspace Memory (`BLACKBOARD.md`)**
   * Located directly in the workspace root.
   * Serves as a persistent anchor for project goals, architecture decisions, and task checklists that survive context compaction.
3. **Layer 3: Orchestrator History Store**
   * Stored in `sessions/<session_id>.json`.
   * Preserves full multi-agent transcripts, raw logs, tool events, and diffs for viewing in the dashboard.

### 4.2 Autonomous Collaboration & Handoff Signals
* **Pair Programming Flow**:
  * Agent 1 starts with the topic (or pitches one).
  * Agent 2 inspects the workspace, tests or reviews the code, extends functionality, and hands back.
* **Control Tags**:
  * `<HANDOFF>`: Normal completion of turn; control passes to peer agent.
  * `<TASK_COMPLETE>`: Either agent marks the goal accomplished; loop pauses and dashboard notifies user.
  * `<NEED_HUMAN question="...">`: Agents request human input on ambiguous decisions; loop pauses until user submits feedback.
* **Loop Controls**:
  * Auto-run vs Step Mode (single-step execution).
  * Max turn safety cap (e.g. 10–20 turns) to prevent runaway costs/credit depletion.

---

## 5. Free Model Integration

* **Cline**: Configured to use free models, such as `cline-free/deepseek-v4.1-flash` or OpenRouter free tiers.
* **Kilo**: Configured to use free models / free tiers (e.g., OpenRouter `:free` models or Kilo free options).
* **Dashboard Control**:
  * Dropdown selector in the dashboard header to pick or override the model used by each agent for that session.

---

## 6. Further Discussion Topics & Questions

This section catalogs detailed discussion questions for our upcoming alignment sessions.

---

### Topic A: Human Steering & Intervention Mechanics
* **Context**: When watching the live conversation, the human user may notice the agents heading in the wrong direction or may want to give guidance.
* **Questions**:
  1. **Broadcast vs. Whisper**:
     * *Option 1 (Broadcast)*: User inputs a message into the chat, and it is injected into the conversation thread as `[User / Human Overseer]: ...`, visible to both agents.
     * *Option 2 (Whisper / Private Directive)*: User can choose to either broadcast OR privately direct a specific agent (e.g. sending a hidden hint to Cline: *"Ask Kilo to add benchmark numbers before merging"*).
  2. **Interruption Mode**:
     * Should typing a message queue it for the *next* turn, or immediately send an abort signal to cancel the current running turn and inject the user instruction right away?

---

### Topic B: Workspace Lifecycle & Multi-Session Isolation
* **Context**: The user creates multiple conversation sessions over time.
* **Questions**:
  1. **Session-to-Workspace Mapping**:
     * *Option 1 (Shared Cumulative Workspace)*: All sessions operate in `workspace/`. New sessions see what previous sessions built.
     * *Option 2 (Git Branch Isolation)*: Every new session creates and checks out a new git branch (`session/<session-id>`) from `master`. Users can merge or review branches independently.
     * *Option 3 (Dedicated Workspace Per Session)*: Every session creates its own folder (`workspace/sessions/<session-id>/`).
  2. **Reset & Clean Controls**:
     * Should the dashboard include a "Factory Reset Workspace" button (wipes untracked files and resets to initial commit)?

---

### Topic C: Handling Free Model Rate Limits & Network Glitches
* **Context**: Free models (DeepSeek, OpenRouter free tiers, Gemini free tiers) have rate limits (e.g., requests per minute) and occasional timeouts.
* **Questions**:
  1. **Retry Strategy**:
     * Automatic retry with exponential backoff (e.g., 3 attempts, 10s -> 20s -> 30s) before alerting the user?
  2. **Fallback Model**:
     * If a free model hits quota exhaustion, should the dashboard allow switching models mid-session without losing context?

---

### Topic D: Pair-Programming Dynamic & Turn Roles
* **Context**: Two agents can either be completely symmetric peers, or assigned complementary personas.
* **Questions**:
  1. **Role Customization**:
     * *Symmetric Peers*: Both agents act as general software engineers with equal standing.
     * *Specialized Duo*:
       * Mode 1: **Architect & Implementer** (Agent A designs specs/types/interfaces, Agent B implements and tests).
       * Mode 2: **Author & Reviewer** (Agent A writes code, Agent B performs code review, tests, and security audits).
       * Mode 3: **Debaters** (Agents engage in structured debate or research tradeoffs).
  2. Should the role profile be selectable in the session creation modal?

---

### Topic E: Dashboard Tech Stack & Distribution
* **Context**: How the dashboard and orchestrator are run.
* **Questions**:
  1. **Zero-Build Vanilla SPA (Recommended)**:
     * Built with standard HTML, Tailwind CSS (via CDN or pre-compiled CSS), and modern Vanilla JS with WebSockets.
     * Starts in < 1 second with `npm start` with zero Vite/Webpack bundling steps.
  2. **React + Vite Dashboard**:
     * Richer component library ecosystem, requires running `npm run build` or a Vite dev server.

