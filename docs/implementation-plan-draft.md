# Implementation Plan Draft: Agent Collab Studio

**Target**: Autonomous Pair-Programming Arena between `kilo` CLI and `cline` CLI  
**Environment**: Windows, Node.js, Git  
**Status**: Draft for Review  

---

## 1. System Overview & Directory Structure

```
agent-collab-studio/
├── .git/
├── README.md
├── docs/
│   ├── discussion-and-planning.md      # Background research, design trade-offs & questions
│   └── implementation-plan-draft.md    # This step-by-step implementation blueprint
├── package.json                        # Orchestrator dependencies (express, ws, tree-kill, etc.)
├── config.js                           # Global configuration (ports, paths, models, flags)
├── src/
│   ├── server.js                       # Express & WebSocket server entrypoint
│   ├── orchestrator.js                 # Turn-taking state machine & loop controller
│   ├── runners/
│   │   ├── base-runner.js              # Base CLI process management interface
│   │   ├── kilo-runner.js              # Kilo CLI execution, flags & NDJSON parsing
│   │   └── cline-runner.js             # Cline CLI execution, flags & NDJSON parsing
│   ├── git/
│   │   └── checkpoint-engine.js        # Post-turn git commits, diff extraction & rollback
│   ├── storage/
│   │   └── session-store.js            # JSON/filesystem persistence for session history
│   └── prompts/
│       ├── system-directives.js        # Containment safety rules & pair-programming prompts
│       └── ideation-prompts.js         # Agent-initiated autonomous brainstorming seeds
├── public/                             # Multi-Tab Web Studio UI
│   ├── index.html                      # Studio interface markup
│   ├── styles.css                      # Modern dark theme styles (Tailwind CDN / custom CSS)
│   └── app.js                          # WebSocket client, tab routing & state management
└── workspace/                          # Default contained sandbox repository
    ├── .git/                           # Initialized sandbox git repository
    └── BLACKBOARD.md                   # Shared long-term agent memory & task tracking
```

---

## 2. Phased Implementation Breakdown

### Phase 1: Project Scaffolding & Configuration
* **Objective**: Initialize Node.js dependencies and establish global configuration.
* **Tasks**:
  1. Define `package.json` with dependencies:
     * `express`: Serves API and static dashboard files.
     * `ws`: Low-latency real-time bidirectional event streaming.
     * `tree-kill`: Reliable cross-platform process tree termination for Windows.
     * `cors`: Cross-origin request support.
  2. Implement `config.js`:
     * Set `WORKSPACE_DIR` defaulting to `./workspace` (absolute path resolved).
     * Configure CLI executable paths (`kilo.ps1`, `cline.ps1`) resolved via Windows environment.
     * Define default free models:
       * Cline: `cline-free/deepseek-v4.1-flash`
       * Kilo: OpenRouter free tiers or default free provider.
     * Set default loop constraints (e.g. `MAX_TURNS: 20`, `TURN_TIMEOUT_SECONDS: 180`).
  3. Ensure sandbox directory initialization:
     * Automatically create `workspace/` and initialize a fresh Git repository if not present.
     * Create baseline `BLACKBOARD.md` template.

---

### Phase 2: CLI Subprocess Runners & Streaming Event Parsers
* **Objective**: Build robust subprocess adapters for `kilo` and `cline` with strict containment and live event streaming.
* **Tasks**:
  1. **Base Runner (`src/runners/base-runner.js`)**:
     * Process spawning with `child_process.spawn`.
     * Stream both stdout and stderr chunks in real time.
     * Clean process tree termination on timeout or user cancellation via `tree-kill`.
  2. **Kilo Runner (`src/runners/kilo-runner.js`)**:
     * Execute: `kilo run [prompt] --dir <workspacePath> --auto --format json -m <model> --session <kiloSessionId>`.
     * Parse NDJSON event stream: extract assistant responses, thinking blocks, and tool executions.
     * Preserve raw ANSI terminal output stream.
  3. **Cline Runner (`src/runners/cline-runner.js`)**:
     * Execute: `cline [prompt] -c <workspacePath> --auto-approve true --yolo --json -m <model> --id <clineSessionId> -s <systemPrompt>`.
     * Parse NDJSON event stream: extract assistant text, tool calls, and bash command results.
     * Preserve raw ANSI terminal output stream.

---

### Phase 3: Turn Orchestrator & State Machine
* **Objective**: Coordinate autonomous dialogue, memory persistence, handoff protocols, and Git checkpoints.
* **Tasks**:
  1. **Orchestration Loop (`src/orchestrator.js`)**:
     * Maintain state: `IDLE`, `RUNNING_KILO`, `RUNNING_CLINE`, `PAUSED_FOR_HUMAN`, `COMPLETED`.
     * Alternate turns sequentially between agents to prevent file write collisions.
  2. **Dual-Layer Memory Handling**:
     * Format peer turn message: `[Kilo]: <content>` -> input to Cline; `[Cline]: <content>` -> input to Kilo.
     * Manage persistent session IDs (`kiloSessionId`, `clineSessionId`).
     * Ensure `BLACKBOARD.md` is initialized in the workspace for architectural decisions.
  3. **Handoff Parser**:
     * Detect `<HANDOFF>`: Pass control to peer agent.
     * Detect `<TASK_COMPLETE>`: Transition loop to `COMPLETED`, emit completion event.
     * Detect `<NEED_HUMAN question="...">`: Transition loop to `PAUSED_FOR_HUMAN`, broadcast question to dashboard.
  4. **Git Checkpoint Engine (`src/git/checkpoint-engine.js`)**:
     * Execute `git add -A && git commit -m "[Turn N] <Agent>: <Summary>"` after each turn.
     * Extract `git diff HEAD~1 HEAD --stat` and per-file diffs.
     * Provide `rollback(commitHash)` method to rewind workspace state.
  5. **Session Persistence (`src/storage/session-store.js`)**:
     * Save conversation turns, diffs, and metadata to `data/sessions/<sessionId>.json`.
     * Provide list, load, and export endpoints.

---

### Phase 4: Multi-Tab Web Studio Dashboard
* **Objective**: Build a responsive dark-themed dashboard connecting over WebSocket.
* **Tasks**:
  1. **Navigation & Controls Header**:
     * Session title & turn counter.
     * Active Agent indicator badge with pulsing live status.
     * Model selection dropdowns (Kilo free model & Cline free model).
     * Action buttons: **Start**, **Next Step**, **Pause**, **Stop**, **Rollback**, **Reset Workspace**.
  2. **Sidebar**:
     * Session history list with timestamps and message counts.
     * "New Session" button opening setup modal (Custom Topic input vs. "Agent Ideation / Surprise Me" button).
  3. **Tab 1: Unified Chat Thread**:
     * Single chronological timeline.
     * Distinct avatar cards for Kilo (purple/cyan) and Cline (green/blue) and Human (amber).
     * Expandable tool-call bubbles showing file reads, code edits, and command outputs.
     * Interjection input box allowing human to broadcast or inject instructions into the next turn.
  4. **Tab 2: Workspace Explorer**:
     * Live tree view of files in `workspace/`.
     * File viewer showing file contents with syntax highlighting.
     * Turn-by-turn Git diff inspector highlighting exact line additions/deletions.
  5. **Tab 3: Live Terminal**:
     * Real-time scrolling terminal output from CLI subprocesses with ANSI color support (`xterm.js` or styled ANSI renderer).

---

### Phase 5: Verification & End-to-End Testing
* **Objective**: Validate the full pipeline safely without risking host file modifications.
* **Tasks**:
  1. **Containment Verification Test**:
     * Run a test turn instructing the agent to attempt creating a file outside the workspace.
     * Confirm process fails or is blocked, and that files only exist inside `workspace/`.
  2. **Checkpointer Test**:
     * Verify Git commits are created automatically after each turn and that `git reset` cleanly restores previous state.
  3. **Free Model Two-Turn Smoke Test**:
     * Launch a 2-turn task: "Create a simple math module in JavaScript with an add function and write a test file".
     * Turn 1 (Kilo): Generates `math.js` and updates `BLACKBOARD.md`.
     * Turn 2 (Cline): Reviews `math.js`, generates `math.test.js`, executes `node math.test.js`, and signals `<TASK_COMPLETE>`.
     * Verify dashboard renders the full thread, workspace files, diffs, and terminal logs.
