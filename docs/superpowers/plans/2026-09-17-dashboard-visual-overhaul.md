# Dashboard & Chat Thread Visual Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the barebone Agent Collab Studio dashboard and chat thread into a visually stunning, deeply satisfying, developer-grade interface (Linear/Raycast inspired) without over-engineering or introducing heavy frameworks.

**Architecture:** Vanilla HTML5/CSS/JavaScript with Tailwind CSS, augmented by lightweight CDNs (`marked.js` for markdown, `highlight.js` with GitHub Dark theme for syntax highlighting). Enhances visual hierarchy, distinct agent themes (Kilo Violet vs Cline Emerald), collapsible reasoning blocks, quick steering action chips, and polished code viewers.

**Tech Stack:** Tailwind CSS, `marked.js` (CDN), `highlight.js` (CDN), Vanilla JS, WebSocket.

---

## Global Constraints
- **Zero build step**: Everything must run in the browser using HTML/CSS/JS and lightweight CDN assets.
- **Zero regression**: All existing capabilities (WebSocket communication, terminal streaming, branch checkout, turn orchestration, intervention whisper/broadcast) must remain 100% functional.
- **Test suite**: `node --test tests/unit/*.test.js` must continue passing 100%.
- **Clean and satisfying**: Smooth transitions, high-contrast readable typography, subtle borders, distinct agent styling, and intuitive micro-interactions.

---

### Task 1: Asset Setup & Modern Theme Architecture (`styles.css` & `index.html`)

**Files:**
- Modify: `public/index.html:1-30` (Add Marked.js and Highlight.js CDN scripts & CSS)
- Modify: `public/styles.css:1-65` (Define agent color variables, thinking drawer, code block headers, custom scrollbars, and card glassmorphism)

**Interfaces:**
- Consumes: `marked.parse(text)`, `hljs.highlightAuto(code)`
- Produces: CSS utility classes (`.agent-card-kilo`, `.agent-card-cline`, `.code-block-wrapper`, `.thinking-accordion`, `.tag-badge`)

- [ ] **Step 1: Add Marked.js and Highlight.js to `public/index.html`**
  - Add `https://cdn.jsdelivr.net/npm/marked/marked.min.js`
  - Add `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js`
  - Add `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css`
  - Add Inter font stylesheet for clean modern typography: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`

- [ ] **Step 2: Update `public/styles.css` with sleek dark theme styles**
  - Configure `font-family: 'Inter', sans-serif;` for body.
  - Distinct agent card themes:
    - Kilo: Violet border glow (`border-purple-500/40`), subtle gradient header (`from-purple-950/30 to-slate-900/60`).
    - Cline: Emerald border glow (`border-emerald-500/40`), subtle gradient header (`from-emerald-950/30 to-slate-900/60`).
    - Human: Amber border glow (`border-amber-500/40`), subtle gradient header (`from-amber-950/30 to-slate-900/60`).
  - Style `<details class="thinking-accordion">` with custom animated arrow, muted violet text, and subtle dark background.
  - Style `.code-block-wrapper` with dark top header bar showing language badge and a sleek "Copy" button.
  - Style sleek scrollbars and smooth hover transitions.

- [ ] **Step 3: Verify style file syntax & check browser loads without console errors**

---

### Task 2: Chat Thread Markdown Engine & Agent Card Polish (`app.js`)

**Files:**
- Modify: `public/app.js` (Rewrite `appendChatMessage` and markdown rendering pipeline)

**Interfaces:**
- Consumes: Turn event or history turn `{ agent, text, turn, diff, timestamp, duration }`
- Produces: Polished DOM turn card with agent avatar, turn pill, thinking drawer, syntax-highlighted code, diff pill, and copy buttons.

- [ ] **Step 1: Implement `renderMarkdown(rawText)` in `public/app.js`**
  - Extract `<thinking>...</thinking>` tags or `Thinking:...` prefixes into collapsible `<details class="thinking-accordion">` blocks.
  - Configure `marked.setOptions` to integrate `hljs.highlightAuto` on code blocks with custom renderer.
  - Wrap code blocks in `.code-block-wrapper` with a header containing the language name and a functional `Copy` button.

- [ ] **Step 2: Overhaul `appendChatMessage(agent, text, turnNumber, diff, meta)`**
  - Distinct agent avatar icon & colored glow badge:
    - Kilo: `🟣 KILO` robot avatar badge with violet accents.
    - Cline: `🟢 CLINE` terminal avatar badge with emerald accents.
    - Human: `👤 USER` badge with amber accents.
  - Header actions:
    - Turn number pill (`Turn #`).
    - Execution time if available (e.g. `⏱️ 8.2s`).
    - "📋 Copy Message" button that copies the clean text to clipboard with temporary "✅ Copied" tooltip.
  - If `diff` exists, render a clean "View Git Diff" pill showing modified lines summary (`+X -Y`).

- [ ] **Step 3: Test markdown rendering and code block copy actions**
  - Verify bold, lists, tables, inline code, and fenced code blocks highlight correctly with syntax colors.

---

### Task 3: Quick Steering Action Chips & Chat Input Bar (`index.html` & `app.js`)

**Files:**
- Modify: `public/index.html` (Add quick suggestion chips row above human input)
- Modify: `public/app.js` (Wire click handlers for steering chips and enhance input UX)

**Interfaces:**
- Consumes: Quick chip clicks (`#chipRunTests`, `#chipUpdateBlackboard`, `#chipHandoff`, `#chipWrapUp`)
- Produces: Pre-fills or submits steered message to `txtHumanInput` and triggers WebSocket dispatch.

- [ ] **Step 1: Add quick steering suggestion chips markup above `#txtHumanInput`**
  - `🧪 Run tests & verify`
  - `📋 Check & update blackboard`
  - `🤝 Handoff to partner`
  - `🏁 Wrap up & summarize`
  - Styled as subtle glassmorphism pills (`bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 text-[11px] px-2.5 py-1 rounded-full cursor-pointer transition`).

- [ ] **Step 2: Wire click handlers in `public/app.js`**
  - Clicking a chip populates `txtHumanInput` and sets focus, allowing instant sending with one keypress or click.

- [ ] **Step 3: Enhance the input container aesthetics**
  - Give the input container rounded-xl borders, glowing focus ring, and clear mode indicator (`Broadcast` vs `Whisper`).

---

### Task 4: Sidebar & Header Polish (`index.html` & `app.js`)

**Files:**
- Modify: `public/index.html` (Add session search bar in sidebar, improve header session title, branch pill, and connection beacon)
- Modify: `public/app.js` (Implement session search filtering and active session card styling)

**Interfaces:**
- Consumes: Sessions array `/api/sessions`, search query input
- Produces: Polished session cards with active border glow, starting agent badge, and filtered list.

- [ ] **Step 1: Add search input to sidebar in `public/index.html`**
  - Add `#txtSearchSessions` input with search icon.

- [ ] **Step 2: Update `loadSessionsList()` in `public/app.js`**
  - Filter sessions on input.
  - Render session cards with:
    - Active session left-border glow & highlight.
    - Starting agent icon/badge (🟣 Kilo / 🟢 Cline).
    - Session topic as clear primary title.
    - Turn count badge and timestamp.

- [ ] **Step 3: Polish Header Bar**
  - Modern pulsating beacon for connection status (`bg-emerald-400` with ring ping).
  - Session title with active branch pill (`session/<name>`) and copy button.
  - Sleek tab buttons with smooth active transition and pill indicators.

---

### Task 5: Workspace Explorer & Live Terminal Visual Harmony

**Files:**
- Modify: `public/index.html` & `public/app.js` (Enhance file tree with icons and code viewer toolbar)

- [ ] **Step 1: Add file type icons in Workspace Explorer**
  - JavaScript files: `⚡` (yellow/cyan).
  - Test files: `🧪` (green).
  - Markdown files: `📝` (blue).
  - Config / JSON: `⚙️` (slate).

- [ ] **Step 2: Add File Viewer top toolbar**
  - Show active file name with icon.
  - Add "📋 Copy File" button.
  - Add line count badge.

- [ ] **Step 3: Harmonize Live Terminal with new dark aesthetic**
  - Ensure toolbar buttons match the new button styling.

---

### Task 6: End-to-End Verification & Playwright Visual Testing

- [ ] **Step 1: Run all unit tests (`node --test tests/unit/*.test.js`)**
  - Ensure 20/20 pass.
- [ ] **Step 2: Restart server and navigate Playwright browser**
  - Reload `http://localhost:3000/`.
  - Check console logs for any syntax or loading errors.
- [ ] **Step 3: Visual check across sessions**
  - Select `pick random number from 1-30`: verify rich markdown, code blocks with copy buttons, agent avatar badges, and thinking blocks.
  - Test quick steering chips.
  - Test session search in sidebar.
  - Test file explorer icons and copy button.
- [ ] **Step 4: Capture screenshots of the polished dashboard**
- [ ] **Step 5: Commit changes cleanly to git**
