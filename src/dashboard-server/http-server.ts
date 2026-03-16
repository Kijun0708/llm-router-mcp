// src/dashboard-server/http-server.ts

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { getDashboardState, injectExternalEvent } from './event-collector.js';
import type { DashboardEvent } from './types.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// dashboard/dist 경로 계산
function getDashboardDistPath(): string {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  // dist/dashboard-server/ → 프로젝트 루트의 dashboard/dist/
  return join(currentDir, '..', '..', 'dashboard', 'dist');
}

export function createHttpServer(): Server {
  const distPath = getDashboardDistPath();
  const hasDistFiles = existsSync(join(distPath, 'index.html'));

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // POST /api/events — 다른 MCP 인스턴스에서 이벤트 수신
    if (req.method === 'POST' && url === '/api/events') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const event = JSON.parse(body) as DashboardEvent;
          injectExternalEvent(event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end('{"error":"invalid json"}');
        }
      });
      return;
    }

    // REST API: 현재 상태
    if (url === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(getDashboardState()));
      return;
    }

    // React 빌드 파일 서빙
    if (hasDistFiles) {
      let filePath = join(distPath, url === '/' ? 'index.html' : url);

      // SPA 라우팅: 파일이 없으면 index.html로 폴백
      if (!existsSync(filePath)) {
        filePath = join(distPath, 'index.html');
      }

      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      } catch {
        // 파일 읽기 실패 시 fallback
      }
    }

    // React 빌드가 없을 때 내장 HTML 제공
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getFallbackHtml());
  });

  return server;
}

/**
 * React 빌드가 없을 때 표시할 기본 HTML
 */
function getFallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM Router Dashboard</title>
  <style>
    :root {
      --bg-base: #0a0a0c;
      --bg-panel: #141418;
      --border-subtle: #2a2a35;
      --text-main: #f0f0f5;
      --text-muted: #8a8a9e;
      --accent-cyan: #00e5ff;
      --accent-green: #00ff66;
      --accent-amber: #ffb300;
      --accent-red: #ff3366;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-mono);
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    h1 { color: var(--accent-cyan); font-size: 18px; margin-bottom: 8px; }
    .status { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.connected { background: var(--accent-green); animation: pulse 2s infinite; }
    .dot.disconnected { background: var(--accent-red); }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,102,0.7); }
      50% { box-shadow: 0 0 0 6px rgba(0,255,102,0); }
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 16px; }
    .panel {
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 16px;
    }
    .panel h2 { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .call-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px; border-bottom: 1px solid var(--border-subtle);
    }
    .call-item:last-child { border-bottom: none; }
    .expert-name { color: var(--accent-cyan); font-weight: bold; }
    .timer { color: var(--accent-green); font-variant-numeric: tabular-nums; }
    .badge {
      font-size: 10px; padding: 2px 6px; border-radius: 3px;
      text-transform: uppercase;
    }
    .badge.openai { background: rgba(0,229,255,0.15); color: var(--accent-cyan); }
    .badge.google { background: rgba(255,179,0,0.15); color: var(--accent-amber); }
    .metric { display: flex; justify-content: space-between; padding: 4px 0; }
    .metric-value { color: var(--accent-green); font-weight: bold; }
    .empty { color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center; }
    .history-item { font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--border-subtle); }
    .history-item .time { color: var(--text-muted); }
    .history-item .duration { color: var(--accent-amber); }
    .history-item.error .expert-name { color: var(--accent-red); }
    .rl-item { padding: 6px 8px; }
    .rl-item.limited { color: var(--accent-red); }
    .rl-item.ok { color: var(--accent-green); }
    .flash { animation: flash-update 0.5s ease-out; }
    @keyframes flash-update {
      0% { background-color: rgba(0,229,255,0.3); }
      100% { background-color: transparent; }
    }
  </style>
</head>
<body>
  <h1>LLM ROUTER DASHBOARD</h1>
  <div class="status">
    <div class="dot disconnected" id="ws-dot"></div>
    <span id="ws-status" style="color: var(--text-muted); font-size: 12px;">Connecting...</span>
  </div>

  <div class="grid">
    <div class="panel">
      <h2>Active Expert Calls</h2>
      <div id="active-calls"><div class="empty">No active calls</div></div>
    </div>

    <div class="panel">
      <h2>Stats</h2>
      <div id="stats">
        <div class="metric"><span>Total Calls</span><span class="metric-value" id="total-calls">0</span></div>
        <div class="metric"><span>Cache Hit Rate</span><span class="metric-value" id="cache-rate">0%</span></div>
        <div class="metric"><span>Cache Size</span><span class="metric-value" id="cache-size">0/100</span></div>
        <div class="metric"><span>BG Running</span><span class="metric-value" id="bg-running">0</span></div>
        <div class="metric"><span>BG Pending</span><span class="metric-value" id="bg-pending">0</span></div>
      </div>
    </div>

    <div class="panel">
      <h2>Rate Limits</h2>
      <div id="rate-limits"><div class="empty">No rate limits active</div></div>
    </div>

    <div class="panel" style="grid-column: 1 / -1;">
      <h2>Call History</h2>
      <div id="call-history"><div class="empty">No calls yet</div></div>
    </div>
  </div>

  <script>
    let ws = null;
    let state = { activeCalls: {}, callHistory: [], rateLimits: {}, cacheStats: {}, backgroundTasks: {}, totalCalls: 0 };
    const timers = new Map();

    function connect() {
      const port = location.port;
      ws = new WebSocket('ws://localhost:' + port);

      ws.onopen = () => {
        document.getElementById('ws-dot').className = 'dot connected';
        document.getElementById('ws-status').textContent = 'Connected';
      };

      ws.onclose = () => {
        document.getElementById('ws-dot').className = 'dot disconnected';
        document.getElementById('ws-status').textContent = 'Reconnecting...';
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        handleEvent(event);
      };
    }

    function handleEvent(event) {
      switch (event.type) {
        case 'state_snapshot':
          state = event.data;
          renderAll();
          break;
        case 'expert_call_start':
          state.activeCalls[event.data.id] = event.data;
          state.totalCalls = (state.totalCalls || 0) + 1;
          renderActiveCalls();
          renderStats();
          break;
        case 'expert_call_end':
          delete state.activeCalls[event.data.id];
          if (!state.callHistory) state.callHistory = [];
          state.callHistory.unshift(event.data);
          if (state.callHistory.length > 200) state.callHistory.length = 200;
          renderActiveCalls();
          renderHistory();
          break;
        case 'expert_call_error':
          renderActiveCalls();
          break;
        case 'rate_limit':
          if (!state.rateLimits) state.rateLimits = {};
          state.rateLimits[event.data.model] = { limited: true };
          renderRateLimits();
          break;
        case 'background_update':
          state.rateLimits = event.data.rateLimits || {};
          state.cacheStats = event.data.cacheStats || {};
          state.backgroundTasks = event.data.backgroundTasks || {};
          state.totalCalls = event.data.totalCalls || state.totalCalls;
          renderStats();
          renderRateLimits();
          break;
      }
    }

    function formatDuration(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m > 0 ? m + '분 ' + sec + '초' : sec + '초';
    }

    function renderAll() {
      renderActiveCalls();
      renderStats();
      renderRateLimits();
      renderHistory();
    }

    function renderActiveCalls() {
      const el = document.getElementById('active-calls');
      const calls = Object.values(state.activeCalls || {});
      if (calls.length === 0) {
        el.innerHTML = '<div class="empty">No active calls</div>';
        return;
      }
      el.innerHTML = calls.map(c => {
        const elapsed = Date.now() - new Date(c.startedAt).getTime();
        return '<div class="call-item flash">' +
          '<div><span class="expert-name">' + c.expertId + '</span> ' +
          '<span class="badge ' + c.provider + '">' + c.provider + '</span></div>' +
          '<span class="timer" data-started="' + c.startedAt + '">' + formatDuration(elapsed) + '</span>' +
          '</div>';
      }).join('');
    }

    function renderStats() {
      document.getElementById('total-calls').textContent = state.totalCalls || 0;
      const cs = state.cacheStats || {};
      document.getElementById('cache-rate').textContent = (cs.hitRate || 0) + '%';
      document.getElementById('cache-size').textContent = (cs.size || 0) + '/' + (cs.maxSize || 100);
      const bg = state.backgroundTasks || {};
      document.getElementById('bg-running').textContent = bg.running || 0;
      document.getElementById('bg-pending').textContent = bg.pending || 0;
    }

    function renderRateLimits() {
      const el = document.getElementById('rate-limits');
      const limits = Object.entries(state.rateLimits || {});
      if (limits.length === 0) {
        el.innerHTML = '<div class="empty">No rate limits active</div>';
        return;
      }
      el.innerHTML = limits.map(([model, s]) =>
        '<div class="rl-item ' + (s.limited ? 'limited' : 'ok') + '">' +
        model + ': ' + (s.limited ? 'BLOCKED' : 'OK') +
        '</div>'
      ).join('');
    }

    function renderHistory() {
      const el = document.getElementById('call-history');
      const history = (state.callHistory || []).slice(0, 50);
      if (history.length === 0) {
        el.innerHTML = '<div class="empty">No calls yet</div>';
        return;
      }
      el.innerHTML = history.map(h => {
        const time = new Date(h.completedAt || h.startedAt).toLocaleTimeString();
        const cls = h.success ? '' : ' error';
        return '<div class="history-item' + cls + '">' +
          '<span class="time">' + time + '</span> ' +
          '<span class="expert-name">' + h.expertId + '</span> ' +
          '<span class="badge ' + h.provider + '">' + h.provider + '</span> ' +
          '<span class="duration">' + formatDuration(h.durationMs) + '</span>' +
          (h.fromCache ? ' <span style="color:var(--text-muted)">[cached]</span>' : '') +
          (h.usedFallback ? ' <span style="color:var(--accent-amber)">[fallback]</span>' : '') +
          '</div>';
      }).join('');
    }

    // 실시간 타이머 업데이트
    setInterval(() => {
      document.querySelectorAll('.timer[data-started]').forEach(el => {
        const started = new Date(el.dataset.started).getTime();
        el.textContent = formatDuration(Date.now() - started);
      });
    }, 1000);

    connect();
  </script>
</body>
</html>`;
}
