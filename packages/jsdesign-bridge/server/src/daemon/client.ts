/**
 * MCP 侧 daemon 客户端（阶段 3 DaemonHandle 实现）：WS 接入独立 daemon 单例（?role=client），不监听端口
 * 连接策略：直连失败（ECONNREFUSED）→ spawn 独立 daemon 进程（detached，存活期独立于本进程）→ 重试
 * 生命周期：本进程退出只断客户端连接，daemon 由空闲自退回收——多会话互不干扰
 */
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { DaemonRequestIntent, DaemonToClient, FrameInfo, PluginToDaemon } from '../protocol/messages';
import { WS_URL } from '../protocol/messages';
import type { DaemonHandle, NodeHit } from './handle';

const CLIENT_PORT = Number(process.env.JSDESIGN_BRIDGE_PORT || new URL(WS_URL).port);
const CLIENT_URL = `ws://127.0.0.1:${CLIENT_PORT}?role=client`;
const SPAWN_RETRY_MS = 400;
const SPAWN_RETRY_MAX = 25; // ~10s：覆盖 daemon 冷启动
const REQUEST_TIMEOUT_MS = 30_000;

export class DaemonClient implements DaemonHandle {
  private socket: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private seq = 0;
  private readonly pending = new Map<string, (payload: never) => void>();

  /** 连接（含 spawn-on-miss）；成功后长连，断开则下次请求时懒重连 */
  private async ensureSocket(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return this.socket;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectWithSpawn().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  /** 会话启动即预连接（不等首个工具调用）：daemon 及时拉起，插件面板尽快变绿 */
  async ensureConnected(): Promise<void> {
    try {
      await this.ensureSocket();
    } catch (e) {
      console.error(`[mcp-daemon] 预连接失败（首次工具调用将重试）：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private connectOnce(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(CLIENT_URL);
      } catch (e) {
        reject(e);
        return;
      }
      const timer = setTimeout(() => reject(new Error('daemon 连接超时')), 2000).unref();
      ws.on('open', () => {
        clearTimeout(timer);
        this.socket = ws;
        resolve(ws);
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws.on('close', () => {
        if (this.socket === ws) this.socket = null;
      });
      ws.on('message', (data: unknown) => this.onDaemonMessage(String(data)));
    });
  }

  /** 直连 → 失败则 spawn 独立 daemon（仅第一次失败后触发）→ 重试直至成功/上限 */
  private async connectWithSpawn(): Promise<WebSocket> {
    let spawned = false;
    for (let attempt = 0; attempt < SPAWN_RETRY_MAX; attempt += 1) {
      try {
        return await this.connectOnce();
      } catch {
        if (!spawned) {
          this.spawnDetachedDaemon();
          spawned = true;
        }
        await new Promise((r) => setTimeout(r, SPAWN_RETRY_MS));
      }
    }
    throw new Error(`daemon 连接失败（${CLIENT_URL}，已尝试自动拉起）：请手动运行 node dist/daemon.js 后重试`);
  }

  private spawnDetachedDaemon(): void {
    const daemonJs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'daemon.js');
    const child = spawn(process.execPath, [daemonJs], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    console.error(`[mcp-daemon] 已拉起独立 daemon（pid=${child.pid ?? '?'}，${daemonJs}）`);
  }

  private onDaemonMessage(raw: string): void {
    let msg: DaemonToClient | null = null;
    try {
      msg = JSON.parse(raw) as DaemonToClient;
    } catch {
      return;
    }
    if (typeof msg !== 'object' || msg === null || typeof msg.requestId !== 'string') return;
    const resolve = this.pending.get(msg.requestId);
    if (!resolve) return;
    this.pending.delete(msg.requestId);
    resolve(msg as never);
  }

  /** 客户端通道 RPC：发请求等对应响应（requestId 配对） */
  private rpc<T>(message: Record<string, unknown> & { requestId: string }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.ensureSocket()
        .then((socket) => {
          const timer = setTimeout(() => {
            this.pending.delete(message.requestId);
            reject(new Error(`daemon 响应超时（${REQUEST_TIMEOUT_MS / 1000}s）：${String(message.type)}`));
          }, REQUEST_TIMEOUT_MS).unref();
          this.pending.set(message.requestId, ((payload: DaemonToClient) => {
            clearTimeout(timer);
            resolve(payload as T);
          }) as never);
          socket.send(JSON.stringify(message));
        })
        .catch(reject);
    });
  }

  private newRequestId(): string {
    this.seq += 1;
    return `mcp-${this.seq}`;
  }

  async getFrameInfos(): Promise<{ frames: FrameInfo[]; fileName: string | null } | null> {
    const res = await this.rpc<Extract<DaemonToClient, { type: 'cache.frameInfos' }>>({
      type: 'cache.getFrameInfos', requestId: this.newRequestId(),
    });
    return res.frames === null ? null : { frames: res.frames, fileName: res.fileName };
  }

  async getSnapshot(frameId: string) {
    const res = await this.rpc<Extract<DaemonToClient, { type: 'cache.snapshot' }>>({
      type: 'cache.getSnapshot', requestId: this.newRequestId(), frameId,
    });
    return res.snapshot;
  }

  async findNode(nodeId: string): Promise<NodeHit | null> {
    const res = await this.rpc<Extract<DaemonToClient, { type: 'cache.node' }>>({
      type: 'cache.findNode', requestId: this.newRequestId(), nodeId,
    });
    return res.hit;
  }

  async request(payload: DaemonRequestIntent): Promise<PluginToDaemon> {
    const res = await this.rpc<Extract<DaemonToClient, { type: 'tool.result' }>>({
      type: 'tool.request', requestId: this.newRequestId(), intent: payload,
    });
    return res.payload;
  }
}
