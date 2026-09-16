let ws;
let terminal;
let activeTab = 'chat';

function initTerminal() {
  const container = document.getElementById('xtermContainer');
  if (!container) return;
  terminal = new Terminal({
    theme: { background: '#020617', foreground: '#cbd5e1' },
    fontFamily: 'Consolas, monospace',
    fontSize: 12,
    convertEol: true
  });
  terminal.open(container);
  terminal.writeln('\x1b[35m🐙 Agent Collab Studio Terminal Ready.\x1b[0m');
}

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
      if (terminal) terminal.write(payload.chunk);
      updateLiveTurnSnippet(payload.chunk);
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

window.onload = () => {
  initTerminal();
  connectWs();
  loadConfig();
  loadSessionsList();
};
