/**
 * iframe 侧：WebSocket 连 daemon（拉模式被动响应）、断线重连、请求路由 ui↔main、状态面板
 * 规则（bridge-dev）：DOM / 网络只出现在本文件与模板；ui→main 经 parent.postMessage({pluginMessage})
 */
import { DaemonToPlugin, PluginToDaemon, WS_URL } from '../types';

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15000;

const connEl = document.getElementById('conn');
const lastEl = document.getElementById('last');
const errEl = document.getElementById('err');

function setLine(el: HTMLElement | null, text: string, cls: string): void {
  if (!el) return;
  el.textContent = text;
  el.className = 'line ' + cls;
}

function setConn(state: 'connected' | 'connecting' | 'disconnected', detail: string): void {
  const label = state === 'connected' ? '● 已连接 daemon' : state === 'connecting' ? '○ 连接中…' : '○ 未连接';
  const cls = state === 'connected' ? 'ok' : state === 'connecting' ? 'wait' : 'off';
  setLine(connEl, `${label}（${WS_URL}）${detail}`, cls);
}

function setErr(text: string): void {
  setLine(errEl, text, 'err');
}

// ---------- ui ↔ main 路由（探针面板实测通道） ----------

function sendToMain(request: DaemonToPlugin): void {
  parent.postMessage({ pluginMessage: request }, '*');
}

let ws: WebSocket | null = null;

/** main 回传结果 → daemon（WS 未连接时丢弃并提示，等待下次请求） */
function sendToDaemon(result: PluginToDaemon): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(result));
    return;
  }
  setErr('结果被丢弃：WS 已断开（daemon 重连后会重新请求）');
}

window.onmessage = (event: MessageEvent) => {
  const envelope = event.data as { pluginMessage?: unknown } | null;
  const msg = envelope?.pluginMessage;
  if (typeof msg !== 'object' || msg === null) return;
  const m = msg as PluginToDaemon;
  switch (m.type) {
    case 'frames.list.result':
      if (m.ok) {
        setLine(lastEl, `✓ 画板清单 ${m.frames.length} 个 · ${new Date().toLocaleTimeString()}`, 'info');
        setErr('');
      } else {
        setErr('清单失败：' + m.error);
      }
      sendToDaemon(m);
      break;
    case 'frame.snapshot.result':
      if (m.ok) {
        const s = m.snapshot;
        setLine(lastEl, `✓ 画板「${s.name}」 ${s.nodeCount} 节点${s.truncated ? '（已截断）' : ''} · ${new Date().toLocaleTimeString()}`, 'info');
        setErr('');
      } else {
        setErr('快照失败：' + m.error);
      }
      sendToDaemon(m);
      break;
  }
};

// ---------- WebSocket：连接 / 重连 / daemon 请求接收 ----------

let retryCount = 0;

function scheduleReconnect(): void {
  const delay = Math.min(RETRY_BASE_MS * 2 ** retryCount, RETRY_MAX_MS);
  retryCount += 1;
  setConn('disconnected', `第 ${retryCount} 次重连（${Math.round(delay / 1000)}s 后）`);
  setTimeout(connect, delay);
}

function connect(): void {
  setConn('connecting', '');
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    setErr('WebSocket 构造失败：' + (e instanceof Error ? e.message : String(e)));
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    retryCount = 0;
    setConn('connected', '');
    setErr('');
  };
  ws.onerror = () => { /* 连接失败后紧随 onclose，重连在 onclose 统一处理 */ };
  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };
  ws.onmessage = (ev: MessageEvent) => {
    let request: DaemonToPlugin | null = null;
    try {
      request = JSON.parse(String(ev.data)) as DaemonToPlugin;
    } catch {
      return; // 非 JSON 帧（心跳等）忽略
    }
    if (typeof request !== 'object' || request === null) return;
    if (typeof request.requestId !== 'string') return;
    if (request.type === 'frames.list' || request.type === 'frame.snapshot') sendToMain(request);
  };
}

setConn('connecting', '');
connect();
