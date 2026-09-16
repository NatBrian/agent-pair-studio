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
      this.mainTerminal.writeln('\x1b[1;35m⚡ Agent Pair Studio Live Terminal Ready.\x1b[0m');
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
  const ping = document.getElementById('connPingDot');
  const text = document.getElementById('connText');
  const alertEl = document.getElementById('alertConnection');
  const alertText = document.getElementById('alertConnectionText');
  if (!dot || !text) return;

  if (status === 'connected') {
    dot.className = 'relative inline-flex rounded-full h-2 w-2 bg-emerald-500';
    if (ping) {
      ping.classList.remove('hidden');
      ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
    }
    text.textContent = 'Connected';
    text.className = 'text-emerald-400 font-medium';
    if (alertEl) alertEl.classList.add('hidden');
  } else if (status === 'reconnecting') {
    dot.className = 'relative inline-flex rounded-full h-2 w-2 bg-amber-400 animate-pulse';
    if (ping) ping.classList.add('hidden');
    text.textContent = 'Reconnecting...';
    text.className = 'text-amber-300';
    if (alertEl) {
      alertEl.classList.remove('hidden');
      if (alertText) alertText.textContent = '⚠️ Connection to server lost. Reconnecting to backend...';
    }
  } else if (status === 'disconnected') {
    dot.className = 'relative inline-flex rounded-full h-2 w-2 bg-rose-500';
    if (ping) ping.classList.add('hidden');
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
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-purple-950 text-purple-300 border border-purple-800 shadow-sm shrink-0 whitespace-nowrap animate-pulse';
    badge.textContent = `KILO (Turn ${turn})`;
  } else if (agent === 'cline') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm shrink-0 whitespace-nowrap animate-pulse';
    badge.textContent = `CLINE (Turn ${turn})`;
  } else if (agent === 'COMPLETED') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-blue-950 text-blue-300 border border-blue-800 shadow-sm shrink-0 whitespace-nowrap';
    badge.textContent = '🏁 COMPLETED';
  } else if (agent === 'PAUSED') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-amber-950 text-amber-300 border border-amber-800 shadow-sm shrink-0 whitespace-nowrap';
    badge.textContent = '⏸️ PAUSED';
  } else if (agent === 'STOPPED') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-rose-950 text-rose-300 border border-rose-800 shadow-sm shrink-0 whitespace-nowrap';
    badge.textContent = '🛑 STOPPED';
  } else if (agent === 'AWAITING HUMAN') {
    badge.className = 'px-2 py-0.5 text-xs rounded-full font-mono bg-amber-950 text-amber-300 border border-amber-800 shadow-sm shrink-0 whitespace-nowrap animate-pulse';
    badge.textContent = '⚠️ INPUT REQ';
  } else {
    badge.className = 'px-2.5 py-0.5 text-xs rounded-full font-mono bg-purple-950 text-purple-300 border border-purple-800 shadow-sm shrink-0 whitespace-nowrap';
    badge.textContent = agent || 'IDLE';
  }
}

function updateWaitingBadge(runningAgent) {
  const badge = document.getElementById('badgeWaitingAgent');
  if (!badge) return;
  if (runningAgent === 'kilo') {
    badge.className = 'px-2 py-0.5 text-[11px] rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700 shrink-0 whitespace-nowrap hidden lg:inline-flex';
    badge.innerHTML = `<span class="text-emerald-400 font-semibold">Cline</span> waiting`;
  } else if (runningAgent === 'cline') {
    badge.className = 'px-2 py-0.5 text-[11px] rounded-full font-mono bg-slate-800 text-slate-400 border border-slate-700 shrink-0 whitespace-nowrap hidden lg:inline-flex';
    badge.innerHTML = `<span class="text-purple-400 font-semibold">Kilo</span> waiting`;
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

let messageCounter = 0;
let allSessionsCache = [];

window.copySnippet = function(btn) {
  const wrapper = btn.closest('.code-block-wrapper');
  if (!wrapper) return;
  const codeEl = wrapper.querySelector('pre code');
  if (!codeEl) return;
  const code = codeEl.innerText || codeEl.textContent;
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Copied!';
    btn.classList.add('text-emerald-400', 'border-emerald-500/50');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.remove('text-emerald-400', 'border-emerald-500/50');
    }, 1500);
  });
};

window.copyTurnMessage = function(btn, cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const content = card.querySelector('.prose-chat');
  const text = content ? (content.innerText || content.textContent) : '';
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Copied';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });
};

function configureMarked() {
  if (typeof marked === 'undefined') return;
  const renderer = new marked.Renderer();
  renderer.code = function(tokenOrCode, maybeLang) {
    const rawCode = typeof tokenOrCode === 'object' ? (tokenOrCode.text || '') : (tokenOrCode || '');
    const rawLang = (typeof tokenOrCode === 'object' ? tokenOrCode.lang : maybeLang) || '';
    let highlighted;
    const validLang = rawLang && typeof hljs !== 'undefined' && hljs.getLanguage(rawLang) ? rawLang : '';
    try {
      if (typeof hljs !== 'undefined') {
        highlighted = validLang ? hljs.highlight(rawCode, { language: validLang }).value : hljs.highlightAuto(rawCode).value;
      } else {
        highlighted = escapeHtml(rawCode);
      }
    } catch {
      highlighted = escapeHtml(rawCode);
    }
    const displayLang = (validLang || rawLang || 'code').toUpperCase();
    return `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span>${displayLang}</span>
          <button type="button" class="code-copy-btn" onclick="copySnippet(this)">📋 Copy</button>
        </div>
        <pre><code class="hljs ${validLang ? 'language-' + validLang : ''}">${highlighted}</code></pre>
      </div>
    `;
  };

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true
  });
}

function appendChatMessage(agent, text, turn, diff) {
  const chat = document.getElementById('chatMessages');
  const placeholder = document.getElementById('chatEmptyPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');

  messageCounter++;
  const cardId = `msg-card-${messageCounter}`;
  const card = document.createElement('div');
  card.id = cardId;

  const isKilo = agent === 'kilo';
  const isCline = agent === 'cline';
  const isHuman = agent === 'human';

  let cardTheme = 'chat-card';
  let avatarBadge = '';
  if (isKilo) {
    cardTheme = 'chat-card chat-card-kilo';
    avatarBadge = `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-md bg-purple-950 border border-purple-600/50 flex items-center justify-center text-xs shadow-inner">🟣</span>
        <span class="font-bold text-xs tracking-wider text-purple-300 font-mono">KILO</span>
      </div>
    `;
  } else if (isCline) {
    cardTheme = 'chat-card chat-card-cline';
    avatarBadge = `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-md bg-emerald-950 border border-emerald-600/50 flex items-center justify-center text-xs shadow-inner">🟢</span>
        <span class="font-bold text-xs tracking-wider text-emerald-300 font-mono">CLINE</span>
      </div>
    `;
  } else {
    cardTheme = 'chat-card chat-card-human';
    avatarBadge = `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-md bg-amber-950 border border-amber-600/50 flex items-center justify-center text-xs shadow-inner">👤</span>
        <span class="font-bold text-xs tracking-wider text-amber-300 font-mono">YOU</span>
      </div>
    `;
  }

  card.className = `${cardTheme} p-3.5 rounded-xl shadow-md space-y-2 group transition`;
  card.innerHTML = `
    <div class="flex items-center justify-between pb-1.5 border-b border-slate-800/60">
      ${avatarBadge}
      <div class="flex items-center gap-2">
        ${turn ? `<span class="px-2 py-0.5 rounded-full bg-slate-800/90 border border-slate-700/80 text-slate-400 text-[10px] font-mono">Turn ${turn}</span>` : ''}
        <button type="button" onclick="copyTurnMessage(this, '${cardId}')" class="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 transition flex items-center gap-1 cursor-pointer">
          📋 Copy
        </button>
      </div>
    </div>
    <div class="text-slate-200">${formatContent(text)}</div>
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

  // Extract <thinking> tags if present
  let thinkingHtml = '';
  const thinkingMatch = cleanText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch) {
    const rawThinking = thinkingMatch[1].trim();
    cleanText = cleanText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    thinkingHtml = `
      <details class="thinking-accordion">
        <summary class="thinking-summary">
          <span>🧠 Thought Process</span>
          <span class="text-[10px] text-purple-400 font-mono">click to toggle</span>
        </summary>
        <div class="thinking-content">${escapeHtml(rawThinking)}</div>
      </details>
    `;
  }

  // Parse markdown
  let rendered = '';
  if (typeof marked !== 'undefined') {
    try {
      rendered = marked.parse(cleanText);
    } catch {
      rendered = escapeHtml(cleanText);
    }
  } else {
    rendered = escapeHtml(cleanText);
  }

  return `${thinkingHtml}<div class="prose-chat text-xs leading-relaxed">${rendered}</div>`;
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
  return `<details class="mt-2 text-slate-400 font-mono"><summary class="cursor-pointer text-slate-500 hover:text-slate-300 text-[11px]">View Git Diff</summary><pre class="bg-slate-950 p-2 rounded mt-1 overflow-x-auto text-[11px] border border-slate-800/80">${colored}</pre></details>`;
}

function getFileIcon(name) {
  if (name.endsWith('.test.js') || name.endsWith('.spec.js')) return '🧪';
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.ts')) return '⚡';
  if (name.endsWith('.md')) return '📝';
  if (name.endsWith('.json')) return '⚙️';
  if (name.endsWith('.html')) return '🌐';
  if (name.endsWith('.css')) return '🎨';
  return '📄';
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
      el.className = 'py-1 px-2 text-xs hover:bg-slate-800/60 cursor-pointer rounded select-none';
      el.innerHTML = `📁 <span class="font-semibold text-slate-300">${escapeHtml(node.name)}</span>`;
      container.appendChild(el);
      const sub = document.createElement('div');
      sub.className = 'pl-3 border-l border-slate-800/60 ml-1.5';
      renderTreeNodes(node.children, sub);
      container.appendChild(sub);
    } else {
      const isSelected = selectedFilePath === node.path;
      const icon = getFileIcon(node.name);
      el.className = `py-1 px-2 text-xs cursor-pointer rounded-md select-none file-item transition ${isSelected ? 'bg-indigo-950/60 text-indigo-300 font-medium border border-indigo-700/50' : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'}`;
      el.innerHTML = `${icon} <span>${escapeHtml(node.name)}</span>`;
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
    const titleEl = document.getElementById('currentFileTitle');
    const copyBtn = document.getElementById('btnCopyCurrentFile');
    const codeEl = document.getElementById('fileContentCode');
    if (titleEl) titleEl.textContent = `${getFileIcon(filePath)} ${filePath}`;
    if (copyBtn) {
      copyBtn.classList.remove('hidden');
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(content).then(() => {
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✅ Copied!';
          setTimeout(() => { copyBtn.textContent = orig; }, 1500);
        });
      };
    }
    if (codeEl) codeEl.textContent = content;
  } catch {}
}

async function loadSessionsList() {
  try {
    const res = await fetch('/api/sessions');
    allSessionsCache = await res.json();
    renderFilteredSessions();
  } catch {}
}

function renderFilteredSessions() {
  const searchInput = document.getElementById('txtSearchSessions');
  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const listContainer = document.getElementById('sessionList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const filtered = allSessionsCache.filter(sess => {
    if (!query) return true;
    const topic = (sess.topic || sess.id).toLowerCase();
    return topic.includes(query);
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `<div class="p-4 text-center text-slate-500 text-xs">No matching sessions</div>`;
    return;
  }

  for (const sess of filtered) {
    const isActive = termManager && termManager.currentSessionId === sess.id;
    const el = document.createElement('div');
    el.className = `session-item ${isActive ? 'active' : ''} min-w-0 overflow-hidden`;

    const firstAgent = sess.history && sess.history[0] ? sess.history[0].agent : null;
    const agentBadge = firstAgent === 'kilo' ? '🟣' : (firstAgent === 'cline' ? '🟢' : '⚡');

    el.innerHTML = `
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 text-xs">${agentBadge}</span>
        <span class="font-semibold text-slate-200 truncate min-w-0 text-xs flex-1">${escapeHtml(sess.topic || sess.id)}</span>
      </div>
      <div class="text-[10px] text-slate-500 font-mono mt-1 flex justify-between items-center min-w-0">
        <span class="px-1.5 py-0.2 rounded bg-slate-950 border border-slate-800 text-slate-400 shrink-0">${sess.turns} turns</span>
        <span class="shrink-0 text-slate-500 text-[10px]">${new Date(sess.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `;
    el.onclick = () => {
      loadSessionDetails(sess.id);
    };
    listContainer.appendChild(el);
  }
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
    const branchBadge = document.getElementById('headerBranchBadge');
    if (branchBadge) {
      if (sess.branch) {
        branchBadge.textContent = sess.branch;
        branchBadge.classList.remove('hidden');
        branchBadge.onclick = () => {
          navigator.clipboard.writeText(sess.branch).then(() => {
            const orig = branchBadge.textContent;
            branchBadge.textContent = '✅ Copied!';
            setTimeout(() => { branchBadge.textContent = orig; }, 1200);
          });
        };
      } else {
        branchBadge.classList.add('hidden');
      }
    }

    renderFilteredSessions();
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

  document.getElementById('tabBtnChat').className = tab === 'chat' ? 'px-3 py-1 rounded-md bg-slate-800 text-white font-medium transition' : 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition';
  document.getElementById('tabBtnExplorer').className = tab === 'explorer' ? 'px-3 py-1 rounded-md bg-slate-800 text-white font-medium transition' : 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition';
  document.getElementById('tabBtnTerminal').className = tab === 'terminal' ? 'px-3 py-1 rounded-md bg-slate-800 text-white font-medium transition' : 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition';

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

// Enter key to send human input
document.getElementById('txtHumanInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('btnSendHuman').click();
  }
});

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
  configureMarked();
  termManager.init();
  connectWs();
  loadConfig();
  loadSessionsList();

  // Wire search sessions
  const searchInput = document.getElementById('txtSearchSessions');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderFilteredSessions();
    });
  }

  // Wire quick steering chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.onclick = () => {
      const input = document.getElementById('txtHumanInput');
      if (input) {
        input.value = chip.dataset.text || chip.textContent;
        input.focus();
      }
    };
  });

  try {
    const res = await fetch('/api/workspace/branch');
    const data = await res.json();
    if (data && data.branch) {
      termManager.updateBranch(data.branch);
      const branchBadge = document.getElementById('headerBranchBadge');
      if (branchBadge) {
        branchBadge.textContent = data.branch;
        branchBadge.classList.remove('hidden');
      }
    }
  } catch {}
};
