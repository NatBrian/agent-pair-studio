# Live Terminal Upgrade & Session Branch Switching Implementation Plan

Upgrade the Live Terminal from raw NDJSON output to a feature-rich, colorized developer console with human-readable event formatting, interactive workspace command execution, filtering, auto-scroll control, and split-screen chat drawer, and fix session branch switching so workspace files properly reflect the active session.

## User Review Checkpoints
> [!IMPORTANT]
> User review required after:
> 1. Task 1 (Session branch switching & test verification)
> 2. Task 3 (Frontend terminal controls & smart streaming formatter)
> 3. Task 5 (Interactive command runner & split console drawer in Playwright)

---

## Proposed Changes

### 1. Git Engine & Session Switching
#### [`src/git/checkpoint-engine.js`](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/src/git/checkpoint-engine.js)
- Add `checkoutSessionBranch(workspacePath, branchName)`:
  - Validates `branchName` matches `session/*` or git branch pattern.
  - Runs `git checkout <branchName>` in `workspacePath`.
  - Handles dirty working trees cleanly if needed (`git stash` or clean switch).

#### [`src/server.js`](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/src/server.js)
- In `select_session` WebSocket message handler:
  - If `sessionData.branch` exists, call `await checkoutSessionBranch(workspaceDir, sessionData.branch)`.
  - Broadcast `session_selected` and notify frontend to re-fetch `/api/workspace/files`.
- Add `terminal_input` WebSocket message handler:
  - Receives `{ command }` from user.
  - Executes command in `workspaceDir` with 30s timeout and output streaming.
  - Broadcasts output via `terminal_output` with ANSI styling.

### 2. Frontend Terminal UI & Components
#### [`public/index.html`](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/public/index.html)
- Upgrade `#panelTerminal` layout:
  - Top Toolbar:
    - View Mode Switch: `[🎨 Formatted Activity]` vs `[📄 Raw NDJSON]`.
    - Agent Filter Pills: `[All]`, `[🟣 Kilo]`, `[🟢 Cline]`, `[⚠️ Errors]`.
    - Auto-Scroll Toggle: `[⬇️ Auto-Scroll: ON]`.
    - Actions: `[🧹 Clear]`, `[📋 Copy]`, `[💾 Export]`.
  - Main Body: `#xtermContainer` with fit addon.
  - Bottom Bar: Interactive command prompt:
    - Current branch badge: `kilo-cline-workspace (branch) $`
    - Input box with history navigation (Arrow Up / Down) and Enter to run.
- Chat Tab Live Console Drawer:
  - Add `⚡ Live Console` toggle button in header.
  - Add collapsible bottom drawer in `#panelChat` with live streaming terminal mirror.

#### [`public/app.js`](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/public/app.js)
- Implement `TerminalStreamManager`:
  - Maintains `mode`: `'formatted'` vs `'raw'`.
  - Maintains `filter`: `'all'` | `'kilo'` | `'cline'` | `'error'`.
  - Maintains `autoScroll`: boolean.
  - Formats agent NDJSON into high-contrast ANSI colors:
    - Headers: `\x1b[1;36m[CLINE Turn X]\x1b[0m`
    - Tool Calls: `\x1b[33m⚡ Tool Call: <name>\x1b[0m`
    - Command output: crisp indented text
    - Agent Thoughts: dim purple stream
    - Errors: bright red
  - Manages session-specific terminal history buffer so switching sessions loads that session's logs.
  - Handles command submission from the interactive prompt.

---

## Verification Plan

### Automated Tests
1. **Unit Tests**:
   - `tests/unit/checkpoint-engine.test.js`: test `checkoutSessionBranch` switches branches cleanly.
   - `tests/unit/server.test.js`: test `terminal_input` WebSocket handler executes commands in workspace.
   - Run: `node --test tests/unit/*.test.js`

### Browser / Playwright E2E Tests
1. **Session Branch Switching**:
   - Click "what is 2+2" in sidebar -> verify files in Workspace Explorer switch to "what is 2+2" files.
   - Click "pick random number from 1-30" in sidebar -> verify files switch back to `random-number.js` and `random-number.test.js`.
2. **Interactive Terminal Input**:
   - Run `git status` in the terminal prompt -> verify output displays active branch.
   - Run `node random-number.js 1 30` -> verify random number output streams into xterm.
3. **Stream Formatter Toggle**:
   - Toggle between `Formatted Activity` and `Raw NDJSON` modes.
4. **Split Console Drawer**:
   - Toggle `⚡ Live Console` in Chat tab -> verify drawer opens and mirrors live stream.
5. Take screenshots of all new UI states.
