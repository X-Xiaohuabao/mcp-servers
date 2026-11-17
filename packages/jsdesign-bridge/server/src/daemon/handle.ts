/**
 * DaemonHandle：MCP 工具层对 daemon 的依赖接口（阶段 3 起实现于 daemon/client.ts 客户端 RPC）
 * 缓存随 daemon 单例进程走，工具侧一律异步 RPC（不再有进程内读缓存）
 */
import type { FrameInfo, FrameSnapshot, RawNode } from '../protocol/messages';
import type { DaemonRequestIntent, PluginToDaemon } from '../protocol/messages';

export interface NodeHit {
  node: RawNode;
  snapshot: FrameSnapshot;
}

export interface DaemonHandle {
  /** 画板清单缓存 + 所属文档名（null=未采集过；fileName 用于多文件环境辨析连接身份） */
  getFrameInfos(): Promise<{ frames: FrameInfo[]; fileName: string | null } | null>;
  /** 单画板快照缓存（null=未采集过） */
  getSnapshot(frameId: string): Promise<FrameSnapshot | null>;
  /** nodeId 直查（节点 + 所属画板快照；null=缓存无此节点） */
  findNode(nodeId: string): Promise<NodeHit | null>;
  /** 向插件发采集/切图请求（daemon 转发；结果同时入 daemon 缓存） */
  request(payload: DaemonRequestIntent): Promise<PluginToDaemon>;
}
