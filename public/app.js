let ws;
let activeTab = 'chat';

class TerminalManager {
  constructor() {
    this.mode = 'pretty'; // 'pretty' | 'raw'
    this.filter = 'all'; // 'all' | 'kilo' | 'cline' | 'errors'
    this.autoScroll = true;
    this.mainTerminal = null;
    this.drawerTerminal = null;
    this.sessionLogs = new Map(); // sessionId -> Array<{ raw: string, pretty: string, agent?: string, isError?: boolean, userCommand?: boolean }>
    this.currentSessionId = 'live';
    this.currentBranch = 'master';
    this.commandHistory = [];
    this.historyIndex = -1;
  }

  init() {
    const mainContainer = document.getElementById('xtermContainer');
    if (mainContainer && !this.mainTerminal) {
      this.mainTerminal = new Terminal({
        theme: {
          background: '#020617',
          foreground: '#cbd5e1',
          cursor: '#60a5fa',
          selectionBackground: '#334155'
        },
        fontFamily: 'Consolas, "Fira Code", monospace',
        fontSize: 12,
        convertEol: true,
        scrollback: 5000
      });
      this.mainTerminal.open(mainContainer);
      this.mainTerminal.writeln('\x1b[1;35m🐙 Agent Collab Studio Live Terminal Ready.\x1b[0m');
      this.mainTerminal.writeln('\x1b[90mTip: Toggle Formatted/Raw or run workspace commands directly below.\x1b[0m\r\n');

      this.mainTerminal.onScroll(() => {
        const buffer = this.mainTerminal.buffer.active;
        const isAtBottom = buffer.viewportY >= buffer.baseY - 1;
        this.updateAutoScrollState(isAtBottom);
      });
    }

    this.bindControls();
  }

  initDrawer() {
    const drawerContainer = document.getElementById('drawerXtermContainer');
    if (drawerContainer && !this.drawerTerminal) {
      this.drawerTerminal = new Terminal({
        theme: {
          background: '#020617',
          foreground: '#cbd5e1',
          cursor: '#60a5fa'
        },
        fontFamily: 'Consolas, "Fira Code", monospace',
        fontSize: 11,
        convertEol: true,
        scrollback: 2000
      });
      this.drawerTerminal.open(drawerContainer);
      this.drawerTerminal.writeln('\x1b[1;35m⚡ Split Console Active.\x1b[0m\r\n');
    }
  }

  bindControls() {
    // Mode toggles
    const btnPretty = document.getElementById('btnTermModePretty');
    const btnRaw = document.getElementById('btnTermModeRaw');
    if (btnPretty && btnRaw) {
      btnPretty.onclick = () => this.setMode('pretty');
      btnRaw.onclick = () => this.setMode('raw');
    }

    // Filter pills
    const filterBtns = document.querySelectorAll('.term-filter-btn');
    filterBtns.forEach((btn) => {
      btn.onclick = () => {
        const f = btn.getAttribute('data-filter') || 'all';
        this.setFilter(f);
      };
    });

    // Auto-scroll toggle
    const btnAuto = document.getElementById('btnAutoScroll');
    if (btnAuto) {
      btnAuto.onclick = () => {
        this.autoScroll = !this.autoScroll;
        this.updateAutoScrollUI();
        if (this.autoScroll && this.mainTerminal) {
          this.mainTerminal.scrollToBottom();
          const jumpBtn = document.getElementById('btnJumpBottom');
          if (jumpBtn) jumpBtn.classList.add('hidden');
        }
      };
    }

    // Jump to bottom button
    const btnJump = document.getElementById('btnJumpBottom');
    if (btnJump) {
      btnJump.onclick = () => {
        this.autoScroll = true;
        this.updateAutoScrollUI();
        if (this.mainTerminal) {
          this.mainTerminal.scrollToBottom();
          btnJump.classList.add('hidden');
        }
      };
    }

    // Clear
    const btnClear = document.getElementById('btnClearTerminal');
    if (btnClear) {
      btnClear.onclick = () => {
        if (this.mainTerminal) this.mainTerminal.clear();
        if (this.drawerTerminal) this.drawerTerminal.clear();
      };
    }

    // Copy
    const btnCopy = document.getElementById('btnCopyTerminal');
    if (btnCopy) {
      btnCopy.onclick = () => this.copyToClipboard(btnCopy);
    }

    // Export
    const btnExport = document.getElementById('btnExportTerminal');
    if (btnExport) {
      btnExport.onclick = () => this.exportLog();
    }

    // Command runner
    const cmdInput = document.getElementById('termCommandInput');
    const btnRunCmd = document.getElementById('btnRunTerminalCmd');
    if (cmdInput && btnRunCmd) {
      btnRunCmd.onclick = () => this.submitCommand(cmdInput);
      cmdInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.submitCommand(cmdInput);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (this.commandHistory.length > 0) {
            if (this.historyIndex === -1) {
              this.historyIndex = this.commandHistory.length - 1;
            } else if (this.historyIndex > 0) {
              this.historyIndex--;
            }
            cmdInput.value = this.commandHistory[this.historyIndex];
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (this.historyIndex !== -1) {
            if (this.historyIndex < this.commandHistory.length - 1) {
              this.historyIndex++;
              cmdInput.value = this.commandHistory[this.historyIndex];
            } else {
              this.historyIndex = -1;
              cmdInput.value = '';
            }
          }
        }
      };
    }

    // Chat live console drawer
    const btnToggleConsole = document.getElementById('btnToggleLiveConsole');
    const drawer = document.getElementById('chatConsoleDrawer');
    const btnCloseDrawer = document.getElementById('btnCloseConsoleDrawer');
    const btnExpandTab = document.getElementById('btnExpandTerminalTab');

    if (btnToggleConsole && drawer) {
      btnToggleConsole.onclick = () => {
        const isHidden = drawer.classList.contains('hidden');
        drawer.classList.toggle('hidden', !isHidden);
        btnToggleConsole.className = isHidden
          ? 'px-2.5 py-1.5 rounded bg-slate-800 text-amber-300 border border-amber-500/50 text-xs flex items-center gap-1.5 transition font-medium shadow-sm'
          : 'px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs flex items-center gap-1.5 transition font-medium';
        if (isHidden) {
          this.initDrawer();
        }
      };
    }

    if (btnCloseDrawer && drawer && btnToggleConsole) {
      btnCloseDrawer.onclick = () => {
        drawer.classList.add('hidden');
        btnToggleConsole.className = 'px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs flex items-center gap-1.5 transition font-medium';
      };
    }

    if (btnExpandTab) {
      btnExpandTab.onclick = () => {
        if (drawer) drawer.classList.add('hidden');
        if (btnToggleConsole) {
          btnToggleConsole.className = 'px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs flex items-center gap-1.5 transition font-medium';
        }
        switchTab('terminal');
      };
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    const btnPretty = document.getElementById('btnTermModePretty');
    const btnRaw = document.getElementById('btnTermModeRaw');
    if (btnPretty && btnRaw) {
      btnPretty.className = mode === 'pretty'
        ? 'px-2 py-0.5 rounded bg-indigo-600 text-white font-medium transition'
        : 'px-2 py-0.5 rounded text-slate-400 hover:text-white transition';
      btnRaw.className = mode === 'raw'
        ? 'px-2 py-0.5 rounded bg-indigo-600 text-white font-medium transition'
        : 'px-2 py-0.5 rounded text-slate-400 hover:text-white transition';
    }
    this.replayCurrentSession();
  }

  setFilter(filter) {
    this.filter = filter;
    document.querySelectorAll('.term-filter-btn').forEach((btn) => {
      const f = btn.getAttribute('data-filter');
      const isSelected = f === filter;
      if (f === 'all') {
        btn.className = isSelected
          ? 'term-filter-btn px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-medium'
          : 'term-filter-btn px-2 py-0.5 rounded text-slate-400 hover:bg-slate-800 transition';
      } else if (f === 'kilo') {
        btn.className = isSelected
          ? 'term-filter-btn px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700 font-medium'
          : 'term-filter-btn px-2 py-0.5 rounded text-purple-400 hover:bg-slate-800 transition';
      } else if (f === 'cline') {
        btn.className = isSelected
          ? 'term-filter-btn px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700 font-medium'
          : 'term-filter-btn px-2 py-0.5 rounded text-emerald-400 hover:bg-slate-800 transition';
      } else if (f === 'errors') {
        btn.className = isSelected
          ? 'term-filter-btn px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-700 font-medium'
          : 'term-filter-btn px-2 py-0.5 rounded text-rose-400 hover:bg-slate-800 transition';
      }
    });
    this.replayCurrentSession();
  }

  updateAutoScrollState(isAtBottom) {
    const jumpBtn = document.getElementById('btnJumpBottom');
    if (!isAtBottom) {
      this.autoScroll = false;
      this.updateAutoScrollUI();
      if (jumpBtn) jumpBtn.classList.remove('hidden');
    } else {
      this.autoScroll = true;
      this.updateAutoScrollUI();
      if (jumpBtn) jumpBtn.classList.add('hidden');
    }
  }

  updateAutoScrollUI() {
    const dot = document.getElementById('autoScrollDot');
    const text = document.getElementById('autoScrollText');
    if (dot && text) {
      if (this.autoScroll) {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        text.textContent = 'Auto-Scroll: ON';
      } else {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        text.textContent = 'Auto-Scroll: PAUSED';
      }
    }
  }

  submitCommand(inputEl) {
    const cmd = inputEl.value.trim();
    if (!cmd) return;
    this.commandHistory.push(cmd);
    this.historyIndex = -1;
    inputEl.value = '';

    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        action: 'terminal_input',
        payload: { command: cmd }
      }));
    }
  }

  copyToClipboard(btnEl) {
    if (!this.mainTerminal) return;
    let fullText = '';
    const buf = this.mainTerminal.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      fullText += buf.getLine(i).translateToString(true) + '\n';
    }
    navigator.clipboard.writeText(fullText.trimEnd()).then(() => {
      const orig = btnEl.textContent;
      btnEl.textContent = '✅ Copied!';
      setTimeout(() => { btnEl.textContent = orig; }, 1500);
    });
  }

  exportLog() {
    if (!this.mainTerminal) return;
    let fullText = '';
    const buf = this.mainTerminal.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      fullText += buf.getLine(i).translateToString(true) + '\n';
    }
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${this.currentSessionId || 'session'}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  updateBranch(branch) {
    this.currentBranch = branch || 'master';
    const badge = document.getElementById('termCurrentBranch');
    if (badge) badge.textContent = this.currentBranch;
  }

  switchSession(sessionId, branch) {
    this.currentSessionId = sessionId;
    if (branch) this.updateBranch(branch);
    this.replayCurrentSession();
  }

  replayCurrentSession() {
    if (!this.mainTerminal) return;
    this.mainTerminal.clear();
    if (this.drawerTerminal) this.drawerTerminal.clear();

    const logs = this.sessionLogs.get(this.currentSessionId) || [];
    for (const item of logs) {
      if (!this.shouldShow(item)) continue;
      const text = this.mode === 'pretty' ? item.pretty : item.raw;
      if (text) {
        this.writeDirect(text);
      }
    }
  }

  shouldShow(item) {
    if (this.filter === 'all') return true;
    if (this.filter === 'errors') return !!item.isError;
    if (this.filter === 'kilo') return item.agent === 'kilo' || item.userCommand;
    if (this.filter === 'cline') return item.agent === 'cline' || item.userCommand;
    return true;
  }

  writeDirect(text) {
    if (this.mainTerminal) {
      this.mainTerminal.write(text);
      if (this.autoScroll) this.mainTerminal.scrollToBottom();
    }
    if (this.drawerTerminal) {
      this.drawerTerminal.write(text);
      this.drawerTerminal.scrollToBottom();
    }
  }

  handleChunk(payload) {
    const raw = payload.chunk || '';
    const agent = payload.agent || (payload.userCommand ? 'human' : null);
    const isError = !!(payload.isStderr || payload.error || /error|failed|exception/i.test(raw));
    const userCommand = !!payload.userCommand;

    let pretty = raw;
    if (!userCommand) {
      pretty = this.formatChunk(raw, agent);
    }

    const item = { raw, pretty, agent, isError, userCommand };

    const key = this.currentSessionId || 'live';
    if (!this.sessionLogs.has(key)) {
      this.sessionLogs.set(key, []);
    }
    this.sessionLogs.get(key).push(item);

    if (this.shouldShow(item)) {
      const out = this.mode === 'pretty' ? pretty : raw;
      this.writeDirect(out);
    }
  }

  formatChunk(raw, agent) {
    if (!raw.includes('{"') && !raw.includes('{"type"')) {
      return raw;
    }

    const lines = raw.split(/\r?\n/);
    const formatted = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        formatted.push('');
        continue;
      }
      if (!trimmed.startsWith('{')) {
        formatted.push(line);
        continue;
      }

      try {
        const obj = JSON.parse(trimmed);
        const lineText = this.formatJsonObject(obj, agent);
        if (lineText) formatted.push(lineText);
      } catch {
        formatted.push(line);
      }
    }

    return formatted.join('\r\n');
  }

  formatJsonObject(obj, agent) {
    const agentTag = agent
      ? (agent === 'cline' ? '\x1b[1;32m[CLINE]\x1b[0m ' : '\x1b[1;35m[KILO]\x1b[0m ')
      : '';

    // 1. Tool use in Kilo format
    if (obj.type === 'tool_use' || obj.part?.type === 'tool') {
      const tool = obj.part?.tool || obj.tool || 'command';
      const input = obj.part?.state?.input || obj.input || {};
      const desc = input.command || input.filePath || input.description || JSON.stringify(input);
      return `${agentTag}\x1b[1;33m⚡ Tool Call [${tool}]:\x1b[0m \x1b[36m${desc}\x1b[0m`;
    }

    // 2. Tool result / state output
    if (obj.part?.state?.output) {
      const out = String(obj.part.state.output).trim();
      return `\x1b[90m┌─ Output:\x1b[0m\r\n\x1b[37m${out}\x1b[0m\r\n\x1b[90m└─────────\x1b[0m`;
    }

    // 3. Step start / finish
    if (obj.type === 'step_start' || obj.part?.type === 'step-start') {
      return `${agentTag}\x1b[90m▶ Turn Step Started\x1b[0m`;
    }
    if (obj.type === 'step_finish' || obj.part?.type === 'step-finish') {
      const reason = obj.part?.reason || 'complete';
      return `${agentTag}\x1b[90m✔ Step Finished (${reason})\x1b[0m`;
    }

    // 4. Cline agent_event
    if (obj.type === 'agent_event' && obj.event) {
      const ev = obj.event;
      if (ev.type === 'iteration_start') {
        return `${agentTag}\x1b[90m▶ Iteration ${ev.iteration}\x1b[0m`;
      }
      if (ev.type === 'content_start' && ev.contentType === 'tool') {
        const cmd = ev.input?.commands ? ev.input.commands.join(' && ') : (ev.toolName || 'tool');
        return `${agentTag}\x1b[1;33m⚡ Tool Call [${ev.toolName}]:\x1b[0m \x1b[36m${cmd}\x1b[0m`;
      }
      if (ev.type === 'content_update' && ev.update?.chunk) {
        return `\x1b[37m${ev.update.chunk}\x1b[0m`;
      }
      if (ev.type === 'content_start' && ev.contentType === 'reasoning') {
        return `${agentTag}\x1b[38;5;141m🧠 Thinking:\x1b[0m \x1b[38;5;244m${ev.reasoning || ''}\x1b[0m`;
      }
      if (ev.type === 'content_start' && ev.contentType === 'text') {
        return `\x1b[97m${ev.text || ''}\x1b[0m`;
      }
    }

    // 5. General text part
    if (obj.type === 'text' && obj.part?.text) {
      return `\x1b[97m${obj.part.text.trim()}\x1b[0m`;
    }

    return '';
  }
}

const termManager = new TerminalManager();

let isPaused = false;
let reconnectTimer = null;

function updateConnectionStatus(status) {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  const alertEl = document.getElementById('alertConnection');
  const alertText = document.getElementById('alertConnectionText');
  if (!dot || !text) return;

  if (status === 'connected') {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    text.textContent = 'Connected';
    text.className = 'text-emerald-400 font-medium';
    if (alertEl) alertEl.classList.add('hidden');
  } else if (status === 'reconnecting') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
    text.textContent = 'Reconnecting...';
    text.className = 'text-amber-300';
    if (alertEl) {
      alertEl.classList.remove('hidden');
      if (alertText) alertText.textContent = '⚠️ Connection to server lost. Reconnecting to backend...';
    }
  } else if (status === 'disconnected') {
    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    text.textContent = 'Disconnected';
    text.className = 'text-rose-400';
    if (alertEl) {
      alertEl.classList.remove('hidden');
      if (alertText) alertText.textContent = '⚠️ Backend unreachable. Check if server is running on http://localhost:3000.';
    }
  }
}

function updatePauseButton(paused) {
  const btn = document.getElementById('btnPause');
  if (!btn) return;
  isPaused = paused;
  if (paused) {
    btn.textContent = '▶️ Resume';
    btn.className = 'bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded font-medium transition shadow';
    btn.title = 'Resume autonomous turn-taking';
  } else {
    btn.textContent = '⏸️ Pause';
    btn.className = 'bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded font-medium transition';
    btn.title = 'Pause turn progression gracefully between turns';
  }
}

function connectWs() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  updateConnectionStatus('reconnecting');

  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    updateConnectionStatus('connected');
  };

  ws.onclose = () => {
    updateConnectionStatus('reconnecting');
    reconnectTimer = setTimeout(connectWs, 2500);
  };

  ws.onerror = () => {
    updateConnectionStatus('disconnected');
  };

  ws.onmessage = (event) => {
    const { type, payload } = JSON.parse(event.data);
    if (type === 'turn_start') {
      updatePauseButton(false);
      hideSessionBanner();
      updateActiveBadge(payload.agent, payload.turn);
      updateWaitingBadge(payload.agent);
      showLiveTurnCard(payload.agent, payload.turn, 'Analyzing instructions and planning response...');
    } else if (type === 'agent_event') {
      const summary = extractEventSummary(payload.event);
      if (summary) updateLiveTurnStatus(summary);
    } else if (type === 'terminal_output') {
      termManager.handleChunk(payload);
      updateLiveTurnSnippet(payload.chunk);
    } else if (type === 'session_selected') {
      if (payload.currentBranch) termManager.updateBranch(payload.currentBranch);
      refreshFileTree();
    } else if (type === 'workspace_files_updated') {
      refreshFileTree();
      if (payload.branch) termManager.updateBranch(payload.branch);
    } else if (type === 'turn_end') {
      hideLiveTurnCard();
      updateWaitingBadge(null);
      appendChatMessage(payload.agent, payload.text, payload.turn, payload.diff);
      refreshFileTree();
      loadSessionsList();
    } else if (type === 'paused') {
      hideLiveTurnCard();
      updatePauseButton(true);
      updateActiveBadge('PAUSED', 0);
      updateWaitingBadge(null);
      showSessionBanner('paused', 'Session Paused', 'Autonomous handoffs are suspended. Click Resume or send an instruction to continue.', true);
    } else if (type === 'resumed') {
      updatePauseButton(false);
      hideSessionBanner();
    } else if (type === 'stopped') {
      hideLiveTurnCard();
      updatePauseButton(false);
      updateActiveBadge('STOPPED', 0);
      updateWaitingBadge(null);
      showSessionBanner('stopped', 'Session Stopped', 'Agent CLI processes terminated. You can send a new instruction below to continue collaboration.', false);
    } else if (type === 'completed') {
      hideLiveTurnCard();
      updatePauseButton(false);
      updateActiveBadge('COMPLETED', 0);
      updateWaitingBadge(null);
      showSessionBanner('completed', 'Goal Completed', 'Both agents reached consensus that the goal is achieved! Send an instruction if you want follow-up work.', false);
    } else if (type === 'paused_for_human') {
      hideLiveTurnCard();
      updatePauseButton(true);
      updateActiveBadge('AWAITING HUMAN', 0);
      updateWaitingBadge(null);
      showSessionBanner('human', 'Agents Request Decision', payload.question, false);
      appendChatMessage('system', `⚠️ Agents requested your decision: "${payload.question}"`, 0);
    } else if (type === 'turn_error') {
      hideLiveTurnCard();
      updateWaitingBadge(null);
      appendChatMessage('system', `❌ Error: ${payload.error} (${payload.classification})`, payload.turn);
    }
  };
}

function updateActiveBadge(agent, turn) {
  const badge = document.getElementById('badgeActiveAgent');
  if (!badge) return;
  if (agent === 'kilo') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-purple-900 text-purple-200 border border-purple-700 animate-pulse';
    badge.textContent = `KILO RUNNING (Turn ${turn})`;
  } else if (agent === 'cline') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-emerald-900 text-emerald-200 border border-emerald-700 animate-pulse';
    badge.textContent = `CLINE RUNNING (Turn ${turn})`;
  } else if (agent === 'COMPLETED') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-blue-900 text-blue-200 border border-blue-700';
    badge.textContent = '🏁 COMPLETED';
  } else if (agent === 'PAUSED') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-amber-900 text-amber-200 border border-amber-700';
    badge.textContent = '⏸️ PAUSED';
  } else if (agent === 'STOPPED') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-rose-900 text-rose-200 border border-rose-700';
    badge.textContent = '🛑 STOPPED';
  } else if (agent === 'AWAITING HUMAN') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-amber-900 text-amber-200 border border-amber-700 animate-pulse';
    badge.textContent = '⚠️ AWAITING INPUT';
  } else {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700';
    badge.textContent = agent || 'IDLE';
  }
}

function updateWaitingBadge(runningAgent) {
  const badge = document.getElementById('badgeWaitingAgent');
  if (!badge) return;
  if (runningAgent === 'kilo') {
    badge.classList.remove('hidden');
    badge.innerHTML = `<span class="text-emerald-400 font-semibold">Cline</span> is waiting...`;
  } else if (runningAgent === 'cline') {
    badge.classList.remove('hidden');
    badge.innerHTML = `<span class="text-purple-400 font-semibold">Kilo</span> is waiting...`;
  } else {
    badge.classList.add('hidden');
    badge.textContent = '';
  }
}

function showLiveTurnCard(agent, turn, statusText) {
  const card = document.getElementById('liveTurnIndicator');
  const chat = document.getElementById('chatMessages');
  const placeholder = document.getElementById('chatEmptyPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');
  if (!card) return;

  const isKilo = agent === 'kilo';
  card.className = `p-3 rounded text-xs space-y-2 shadow-lg transition ${isKilo ? 'live-card-kilo' : 'live-card-cline'}`;

  const pingDot = document.getElementById('livePingDot');
  const solidDot = document.getElementById('liveSolidDot');
  const agentName = document.getElementById('liveAgentName');
  const turnBadge = document.getElementById('liveTurnBadge');
  const partnerWaiting = document.getElementById('livePartnerWaiting');
  const statusEl = document.getElementById('liveStatusText');
  const snippetBox = document.getElementById('liveSnippetContainer');

  if (pingDot) pingDot.className = `animate-ping absolute inline-flex h-full w-full rounded-full ${isKilo ? 'bg-purple-400' : 'bg-emerald-400'} opacity-75`;
  if (solidDot) solidDot.className = `relative inline-flex rounded-full h-2.5 w-2.5 ${isKilo ? 'bg-purple-500' : 'bg-emerald-500'}`;
  if (agentName) {
    agentName.textContent = isKilo ? 'KILO IS RUNNING' : 'CLINE IS RUNNING';
    agentName.className = `font-bold ${isKilo ? 'text-purple-400' : 'text-emerald-400'}`;
  }
  if (turnBadge) turnBadge.textContent = `Turn ${turn}`;
  if (partnerWaiting) partnerWaiting.textContent = isKilo ? 'Cline is waiting for turn to finish...' : 'Kilo is waiting for turn to finish...';
  if (statusEl) statusEl.textContent = statusText || 'Analyzing instructions and planning response...';
  if (snippetBox) snippetBox.classList.add('hidden');

  card.classList.remove('hidden');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function updateLiveTurnStatus(statusText) {
  const statusEl = document.getElementById('liveStatusText');
  if (statusEl && statusText) {
    statusEl.textContent = statusText;
  }
}

function updateLiveTurnSnippet(chunk) {
  const snippetBox = document.getElementById('liveSnippetContainer');
  const snippetText = document.getElementById('liveSnippetText');
  if (!snippetBox || !snippetText || !chunk) return;
  const clean = chunk.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
  if (!clean) return;
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    snippetText.textContent = lines[lines.length - 1].slice(0, 120);
    snippetBox.classList.remove('hidden');
  }
}

function hideLiveTurnCard() {
  const card = document.getElementById('liveTurnIndicator');
  if (card) card.classList.add('hidden');
}

function showSessionBanner(type, title, message, showResumeBtn) {
  const banner = document.getElementById('sessionStateBanner');
  const icon = document.getElementById('bannerIcon');
  const titleEl = document.getElementById('bannerTitle');
  const msgEl = document.getElementById('bannerMessage');
  const resumeBtn = document.getElementById('btnBannerResume');
  if (!banner) return;

  banner.className = `mb-2 p-3 rounded text-xs flex items-center justify-between transition-all banner-${type}`;

  if (type === 'paused') {
    if (icon) icon.textContent = '⏸️';
  } else if (type === 'stopped') {
    if (icon) icon.textContent = '🛑';
  } else if (type === 'completed') {
    if (icon) icon.textContent = '🎉';
  } else if (type === 'human') {
    if (icon) icon.textContent = '⚠️';
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (resumeBtn) {
    if (showResumeBtn) {
      resumeBtn.classList.remove('hidden');
    } else {
      resumeBtn.classList.add('hidden');
    }
  }

  banner.classList.remove('hidden');
}

function hideSessionBanner() {
  const banner = document.getElementById('sessionStateBanner');
  if (banner) banner.classList.add('hidden');
}

function extractEventSummary(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.say === 'tool' || event.say === 'command') {
    return `Executing command: ${event.text || event.command || 'tool call'}...`;
  }
  if (event.say === 'browser_action') {
    return 'Executing browser action...';
  }
  if (event.say === 'text') {
    return 'Formulating response...';
  }
  if (event.say === 'user_feedback') {
    return 'Requesting user decision...';
  }
  if (event.tool) {
    return `Calling tool: ${event.tool}...`;
  }
  if (event.part && typeof event.part.text === 'string') {
    return 'Writing code / response...';
  }
  if (event.type === 'message') {
    return 'Preparing handoff to peer...';
  }
  return 'Processing step...';
}

let selectedFilePath = null;

function appendChatMessage(agent, text, turn, diff) {
  const chat = document.getElementById('chatMessages');
  const placeholder = document.getElementById('chatEmptyPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');

  const card = document.createElement('div');
  const isKilo = agent === 'kilo';
  const isCline = agent === 'cline';
  const isHuman = agent === 'human';

  let cardColor = 'bg-slate-900 border-l-2 border-indigo-500';
  let tagColor = 'text-indigo-400';

  if (isKilo) {
    cardColor = 'chat-card-kilo bg-slate-900';
    tagColor = 'text-purple-400';
  } else if (isCline) {
    cardColor = 'chat-card-cline bg-slate-900';
    tagColor = 'text-emerald-400';
  } else if (isHuman) {
    cardColor = 'chat-card-human bg-slate-900';
    tagColor = 'text-amber-400';
  }

  card.className = `${cardColor} p-3 rounded shadow text-xs space-y-1.5`;
  card.innerHTML = `
    <div class="flex items-center justify-between font-mono ${tagColor}">
      <span class="font-bold">${escapeHtml(agent.toUpperCase())}</span>
      ${turn ? `<span class="text-slate-500">Turn ${turn}</span>` : ''}
    </div>
    <div class="text-slate-200 leading-relaxed">${formatContent(text)}</div>
    ${formatDiff(diff)}
  `;

  const indicator = document.getElementById('liveTurnIndicator');
  if (indicator && indicator.parentNode === chat) {
    chat.insertBefore(card, indicator);
  } else {
    chat.appendChild(card);
  }
  chat.scrollTop = chat.scrollHeight;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatContent(text) {
  if (!text || !text.trim()) {
    return '<span class="text-slate-500 italic">(No response content)</span>';
  }
  let cleanText = text;
  // If the text starts with a JSON object, unwrap assistant text parts
  if (cleanText.trim().startsWith('{')) {
    try {
      const parts = [];
      const lines = cleanText.split('\n');
      for (const line of lines) {
        const tr = line.trim();
        if (tr.startsWith('{') && tr.endsWith('}')) {
          const p = JSON.parse(tr);
          if (p.part && typeof p.part.text === 'string') {
            const t = p.part.text.trim();
            if (t) parts.push(t);
          } else if (typeof p.text === 'string') {
            const t = p.text.trim();
            if (t) parts.push(t);
          }
        }
      }
      if (parts.length > 0) cleanText = parts.join('\n\n');
    } catch {}
  }
  let safe = escapeHtml(cleanText);
  // Code blocks: ```lang ... ```
  safe = safe.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<div class="my-2 rounded bg-slate-950 border border-slate-800 p-2 font-mono text-[11px] overflow-x-auto"><div class="text-slate-500 text-[10px] mb-1 font-semibold uppercase">${lang || 'code'}</div><pre class="text-emerald-400">${code.trim()}</pre></div>`;
  });
  // Inline code: `code`
  safe = safe.replace(/`([^`]+)`/g, '<code class="bg-slate-950 px-1 py-0.5 rounded text-amber-300 font-mono text-[11px]">$1</code>');
  // Bold: **text**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100 font-bold">$1</strong>');
  return `<div class="whitespace-pre-wrap">${safe}</div>`;
}

function formatDiff(diff) {
  if (!diff || !diff.trim()) return '';
  const lines = escapeHtml(diff).split('\n');
  const colored = lines.map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return `<span class="text-emerald-400">${line}</span>`;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return `<span class="text-rose-400">${line}</span>`;
    }
    if (line.startsWith('@@')) {
      return `<span class="text-cyan-400">${line}</span>`;
    }
    return `<span class="text-slate-400">${line}</span>`;
  }).join('\n');
  return `<details class="mt-2 text-slate-400 font-mono"><summary class="cursor-pointer text-slate-500 hover:text-slate-300">View Git Diff</summary><pre class="bg-slate-950 p-2 rounded mt-1 overflow-x-auto text-[11px]">${colored}</pre></details>`;
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
    if (node.type === 'directory') {
      el.className = 'py-1 px-2 text-xs hover:bg-slate-800 cursor-pointer rounded select-none';
      el.innerHTML = `📁 <span class="font-semibold text-slate-300">${escapeHtml(node.name)}</span>`;
      container.appendChild(el);
      const sub = document.createElement('div');
      sub.className = 'pl-3';
      renderTreeNodes(node.children, sub);
      container.appendChild(sub);
    } else {
      const isSelected = selectedFilePath === node.path;
      el.className = `py-1 px-2 text-xs cursor-pointer rounded select-none file-item transition ${isSelected ? 'bg-slate-800 text-indigo-300 font-medium' : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'}`;
      el.innerHTML = `📄 <span>${escapeHtml(node.name)}</span>`;
      el.onclick = () => {
        selectedFilePath = node.path;
        loadFileContent(node.path);
        refreshFileTree();
      };
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

async function loadSessionsList() {
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();
    const listContainer = document.getElementById('sessionList');
    listContainer.innerHTML = '';
    for (const sess of sessions) {
      const el = document.createElement('div');
      el.className = 'p-2 rounded bg-slate-950/60 hover:bg-slate-800 cursor-pointer border border-slate-800 text-xs transition';
      el.innerHTML = `
        <div class="font-semibold text-slate-200 truncate">${escapeHtml(sess.topic || sess.id)}</div>
        <div class="text-[10px] text-slate-500 font-mono mt-0.5 flex justify-between">
          <span>${sess.turns} turns</span>
          <span>${new Date(sess.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      `;
      el.onclick = () => loadSessionDetails(sess.id);
      listContainer.appendChild(el);
    }
  } catch {}
}

function clearChatMessages() {
  const chat = document.getElementById('chatMessages');
  const placeholder = document.getElementById('chatEmptyPlaceholder');
  const indicator = document.getElementById('liveTurnIndicator');
  if (!chat) return;
  chat.innerHTML = '';
  if (placeholder) {
    placeholder.classList.remove('hidden');
    chat.appendChild(placeholder);
  }
  if (indicator) {
    indicator.classList.add('hidden');
    chat.appendChild(indicator);
  }
}

async function loadSessionDetails(sessionId) {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    const sess = await res.json();
    document.getElementById('lblSessionTitle').textContent = sess.topic || sess.id;
    updateActiveBadge('IDLE', sess.history ? sess.history.length : 0);
    updateWaitingBadge(null);
    hideLiveTurnCard();
    hideSessionBanner();

    termManager.switchSession(sessionId, sess.branch);

    clearChatMessages();

    if (sess.history && sess.history.length > 0) {
      const placeholder = document.getElementById('chatEmptyPlaceholder');
      if (placeholder) placeholder.classList.add('hidden');
      for (const turn of sess.history) {
        appendChatMessage(turn.agent, turn.text, turn.turn, turn.diff);
      }
    }
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'select_session', payload: { sessionId } }));
    }
    refreshFileTree();
  } catch {}
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    const selKilo = document.getElementById('modalKiloModel');
    const selCline = document.getElementById('modalClineModel');

    selKilo.innerHTML = cfg.availableFreeModels.kilo.map(m => `<option value="${m}">${m}</option>`).join('');
    selCline.innerHTML = cfg.availableFreeModels.cline.map(m => `<option value="${m}">${m}</option>`).join('');
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

  document.getElementById('tabBtnChat').className = tab === 'chat' ? 'px-3 py-1 rounded bg-slate-800 text-white font-medium' : 'px-3 py-1 rounded text-slate-400 hover:text-white';
  document.getElementById('tabBtnExplorer').className = tab === 'explorer' ? 'px-3 py-1 rounded bg-slate-800 text-white font-medium' : 'px-3 py-1 rounded text-slate-400 hover:text-white';
  document.getElementById('tabBtnTerminal').className = tab === 'terminal' ? 'px-3 py-1 rounded bg-slate-800 text-white font-medium' : 'px-3 py-1 rounded text-slate-400 hover:text-white';

  if (tab === 'terminal') {
    termManager.init();
    if (termManager.mainFitAddon) {
      setTimeout(() => {
        try { termManager.mainFitAddon.fit(); } catch {}
      }, 50);
    }
  }
}

// Modal handling
document.getElementById('btnNewSession').onclick = () => document.getElementById('modalNewSession').classList.remove('hidden');
document.getElementById('btnCancelModal').onclick = () => document.getElementById('modalNewSession').classList.add('hidden');

document.getElementById('btnConfirmStart').onclick = () => {
  const topic = document.getElementById('modalTopicInput').value.trim();
  const kiloModel = document.getElementById('modalKiloModel').value;
  const clineModel = document.getElementById('modalClineModel').value;
  const startingAgent = document.getElementById('modalStartingAgent').value;

  ws.send(JSON.stringify({ action: 'start_session', payload: { topic, kiloModel, clineModel, startingAgent } }));
  document.getElementById('modalNewSession').classList.add('hidden');
  document.getElementById('lblSessionTitle').textContent = topic || 'Autonomous Task';
  clearChatMessages();
};

document.getElementById('btnSurpriseMe').onclick = () => {
  const kiloModel = document.getElementById('modalKiloModel').value;
  const clineModel = document.getElementById('modalClineModel').value;
  const startingAgent = document.getElementById('modalStartingAgent').value;

  ws.send(JSON.stringify({ action: 'start_session', payload: { isIdeation: true, kiloModel, clineModel, startingAgent } }));
  document.getElementById('modalNewSession').classList.add('hidden');
  document.getElementById('lblSessionTitle').textContent = '✨ Agent-Initiated Ideation';
  clearChatMessages();
};

document.getElementById('btnSendHuman').onclick = () => {
  const input = document.getElementById('txtHumanInput');
  const text = input.value.trim();
  const mode = document.getElementById('selInterventionMode').value;
  if (!text) return;
  ws.send(JSON.stringify({ action: 'human_message', payload: { text, mode } }));
  appendChatMessage('human', `[${mode.toUpperCase()}]: ${text}`, null);
  input.value = '';
};

document.getElementById('btnPause').onclick = () => {
  if (isPaused) {
    ws.send(JSON.stringify({ action: 'resume' }));
  } else {
    ws.send(JSON.stringify({ action: 'pause' }));
  }
};

document.getElementById('btnStop').onclick = () => {
  ws.send(JSON.stringify({ action: 'stop' }));
};

const btnBannerResume = document.getElementById('btnBannerResume');
if (btnBannerResume) {
  btnBannerResume.onclick = () => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'resume' }));
    }
  };
}

const btnRetryConnect = document.getElementById('btnRetryConnect');
if (btnRetryConnect) {
  btnRetryConnect.onclick = () => {
    connectWs();
  };
}

window.onload = async () => {
  termManager.init();
  connectWs();
  loadConfig();
  loadSessionsList();
  try {
    const res = await fetch('/api/workspace/branch');
    const data = await res.json();
    if (data && data.branch) {
      termManager.updateBranch(data.branch);
    }
  } catch {}
};
