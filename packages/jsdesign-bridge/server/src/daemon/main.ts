/**
 * daemon 独立单例入口（阶段 3）：dist/daemon.js 由 MCP server 首次需要时自动 spawn（detached）
 * 也可手动启动：node dist/daemon.js。监听 1120；空闲自退条件见 server.ts
 * 日志 stderr；stdout 留空（无协议占用，仅为规范一致）
 */
import { startDaemonServer } from './server';

startDaemonServer();
