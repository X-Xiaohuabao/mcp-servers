/**
 * daemon 服务端（阶段 3 独立单例）：唯一监听 1120 的进程，持缓存与插件连接
 * 双角色连接：?role=client 为 MCP server 客户端；无参数/默认为插件（协议零改动，插件无需重建）
 * 生命周期：独立进程，空闲自退——无插件且无客户端持续 DAEMON_IDLE_EXIT_MS 后 exit(0)
 * 约束（bridge-dev）：日志一律 stderr；副作用（缓存）只允许在本层与 mcp 层
 */
import { WebSocket, WebSocketServer } from 'ws';
import {
  ClientToDaemon,
  DaemonRequestIntent,
  DaemonToClient,
  DAEMON_IDLE_EXIT_MS,
  PluginToDaemon,
  WS_URL,
} from '../protocol/messages';
import { SnapshotCache } from './cache';

/** 端口单一来源：protocol 的 WS_URL；可用环境变量 JSDESIGN_BRIDGE_PORT 覆盖（部署/联调隔离用） */
const PORT = Number(process.env.JSDESIGN_BRIDGE_PORT || new URL(WS_URL).port);
const PLUGIN_REQUEST_TIMEOUT_MS = 30_000;

interface ClientConn {
  id: number;
  socket: WebSocket;
  seq: number;
}

interface PendingForward {
  client: ClientConn;
  /** 客户端原始 requestId（tool.result 回传时还原） */
  originRequestId: string;
  /** 客户端原始意图（插件断连时合成对应类型的错误结果） */
  intent: DaemonRequestIntent;
  /** 30s 插件响应超时守卫（结果或断连时清除） */
  timeout?: NodeJS.Timeout;
}

export function startDaemonServer(): void {
  const cache = new SnapshotCache();
  let pluginSocket: WebSocket | null = null;
  let nextConnId = 0;
  let nextForwardSeq = 0;
  /** 内部 requestId（req:<connId>:<seq>）→ 转发元数据；插件结果按此路由回客户端 */
  const forwards = new Map<string, PendingForward>();

  const armIdleExit = (): void => {
    setTimeout(() => {
      if (!pluginSocket && wss.clients.size === 0) {
        console.error('[daemon] 无插件且无客户端，空闲自退');
        process.exit(0);
      }
      armIdleExit();
    }, DAEMON_IDLE_EXIT_MS).unref();
  };

  const wss = new WebSocketServer({ port: PORT });
  wss.on('listening', () => console.error(`[daemon] 单例监听 ws://127.0.0.1:${PORT}（插件直连；MCP server 带 ?role=client 接入）`));
  armIdleExit();

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[daemon] 端口 ${PORT} 已有单例在跑（本进程退出，不影响在跑单例）`);
      process.exit(0);
    }
    throw err;
  });

  /** 插件未连接/响应超时时，按意图类型合成对应结构的错误结果（客户端可见、不空等） */
  const pluginMissingPayload = (intent: DaemonRequestIntent, requestId: string, why: string): PluginToDaemon => {
    const error = `${why}：请在即时设计客户端打开并运行 huabao-design-bridge 插件`;
    switch (intent.type) {
      case 'frames.list':
        return { type: 'frames.list.result', requestId, ok: false, error };
      case 'frame.snapshot':
        return { type: 'frame.snapshot.result', requestId, ok: false, error };
      case 'asset.export':
        return { type: 'asset.export.result', requestId, ok: false, error };
    }
  };

  const sendToClient = (conn: ClientConn, message: DaemonToClient): void => {
    if (conn.socket.readyState === WebSocket.OPEN) conn.socket.send(JSON.stringify(message));
  };

  /** 客户端 tool.request → 转发插件（重写 requestId），插件断连/超时时合成错误即时回 */
  const forwardToPlugin = (conn: ClientConn, requestId: string, intent: DaemonRequestIntent): void => {
    if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
      sendToClient(conn, { type: 'tool.result', requestId, payload: pluginMissingPayload(intent, requestId, '插件未连接') });
      return;
    }
    const internalId = `req:${conn.id}:${conn.seq++}`;
    const pending: PendingForward = { client: conn, originRequestId: requestId, intent };
    pending.timeout = setTimeout(() => {
      if (!forwards.has(internalId)) return;
      forwards.delete(internalId);
      sendToClient(conn, {
        type: 'tool.result',
        requestId,
        payload: pluginMissingPayload(intent, requestId, `插件响应超时（${PLUGIN_REQUEST_TIMEOUT_MS / 1000}s）`),
      });
    }, PLUGIN_REQUEST_TIMEOUT_MS).unref();
    forwards.set(internalId, pending);
    pluginSocket.send(JSON.stringify({ ...intent, requestId: internalId }));
  };

  wss.on('connection', (ws: WebSocket, request: { url?: string }) => {
    const isClient = new URL(request.url ?? '', WS_URL).searchParams.get('role') === 'client';
    if (isClient) {
      const conn: ClientConn = { id: nextConnId++, socket: ws, seq: 0 };
      console.error(`[daemon] MCP 客户端接入（conn=${conn.id}）`);
      ws.on('message', (data: unknown) => {
        let msg: ClientToDaemon | null = null;
        try {
          msg = JSON.parse(String(data)) as ClientToDaemon;
        } catch {
          return;
        }
        if (typeof msg !== 'object' || msg === null || msg.type === 'client.hello') return;
        if (typeof msg.requestId !== 'string') return;
        if (msg.type === 'cache.getFrameInfos') {
          const entry = cache.getFrameInfos();
          sendToClient(conn, {
            type: 'cache.frameInfos',
            requestId: msg.requestId,
            frames: entry ? entry.frames : null,
            fileName: entry ? entry.fileName : null,
          });
        } else if (msg.type === 'cache.getSnapshot') {
          sendToClient(conn, { type: 'cache.snapshot', requestId: msg.requestId, snapshot: cache.getSnapshot(msg.frameId) });
        } else if (msg.type === 'cache.findNode') {
          sendToClient(conn, { type: 'cache.node', requestId: msg.requestId, hit: cache.findNode(msg.nodeId) });
        } else if (msg.type === 'tool.request') {
          forwardToPlugin(conn, msg.requestId, msg.intent);
        }
      });
      ws.on('close', () => console.error(`[daemon] MCP 客户端断开（conn=${conn.id}）`));
      ws.on('error', () => { /* 断开由 close 统一处理 */ });
      return;
    }

    // 插件连接（默认角色）：单连接 latest-wins，结果入缓存并按内部 requestId 路由回客户端
    if (pluginSocket) console.error('[daemon] 旧插件连接被替换（最新连接生效）');
    pluginSocket = ws;
    console.error('[daemon] 插件已连接');
    ws.on('message', (data: unknown) => {
      let msg: PluginToDaemon | null = null;
      try {
        msg = JSON.parse(String(data)) as PluginToDaemon;
      } catch {
        return;
      }
      if (typeof msg !== 'object' || msg === null || typeof msg.requestId !== 'string') return;

      // frames.list 成功 = 文档基线刷新：清空全量缓存（防切文件后跨文档串数据），再入新清单
      if (msg.type === 'frames.list.result') {
        if (msg.ok) {
          cache.clearAll();
          cache.setFrameInfos(msg.frames, msg.fileName ?? null);
        }
      }
      if (msg.type === 'frame.snapshot.result' && msg.ok) cache.setSnapshot(msg.snapshot);

      const forward = forwards.get(msg.requestId);
      if (!forward) return;
      forwards.delete(msg.requestId);
      if (forward.timeout) clearTimeout(forward.timeout);
      sendToClient(forward.client, {
        type: 'tool.result',
        requestId: forward.originRequestId,
        payload: { ...msg, requestId: forward.originRequestId },
      });
    });
    ws.on('close', () => {
      if (pluginSocket === ws) pluginSocket = null;
      console.error('[daemon] 插件断开');
    });
    ws.on('error', () => { /* 断开由 close 统一处理 */ });
  });
}
