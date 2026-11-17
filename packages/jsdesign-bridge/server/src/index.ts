/**
 * 入口：纯装配——MCP server（stdio）+ daemon 客户端（阶段 3：daemon 为独立单例进程，
 * 首次请求时自动 spawn dist/daemon.js 并以 WS 客户端接入，本进程不再监听端口）
 * 生命周期：AI 客户端断开 stdio 即本进程退出（只断客户端连接，daemon 空闲自退回收）
 */
import { DaemonClient } from './daemon/client';
import { startMcpServer } from './mcp/index';

const daemon = new DaemonClient();
startMcpServer(daemon);
void daemon.ensureConnected();

process.stdin.on('end', () => {
  console.error('[index] stdio 已断开（MCP 客户端退出），进程收尾');
  process.exit(0);
});
