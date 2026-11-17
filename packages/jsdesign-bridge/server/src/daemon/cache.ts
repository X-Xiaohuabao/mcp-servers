/**
 * 快照缓存：daemon 持有的画板数据，MCP 工具的读取源（领域概念见 bridge-dev / structure.md）
 * 结构：画板清单 + Map<frameId, FrameSnapshot> + 节点索引（nodeId → 节点及其所属画板）
 */
import { FrameInfo, FrameSnapshot, RawNode } from '../protocol/messages';

export class SnapshotCache {
  private frameInfos: FrameInfo[] | null = null;
  /** 当前缓存清单所属的文档名（root.name，多文件环境辨析连接身份用；TODO 探针实测字段） */
  private fileName: string | null = null;
  private readonly snapshots = new Map<string, FrameSnapshot>();
  /** nodeId → 节点与所属画板（get_node_css 直查用） */
  private readonly nodeIndex = new Map<string, { node: RawNode; frameId: string }>();

  /** 全量失效（文档基线刷新用）：daemon 单例跨会话存活，切设计文件后旧 nodeId 可能与新文档撞 id */
  clearAll(): void {
    this.frameInfos = null;
    this.fileName = null;
    this.snapshots.clear();
    this.nodeIndex.clear();
  }

  setFrameInfos(frames: FrameInfo[], fileName: string | null): void {
    this.frameInfos = frames;
    this.fileName = fileName;
  }

  /** 返回清单 + 所属文档名（null=未采集过） */
  getFrameInfos(): { frames: FrameInfo[]; fileName: string | null } | null {
    if (this.frameInfos === null) return null;
    return { frames: this.frameInfos, fileName: this.fileName };
  }

  setSnapshot(snapshot: FrameSnapshot): void {
    // 先清该画板旧索引，防改稿后残留失效 nodeId（重新序列化后 id 可能变化）
    for (const [nodeId, hit] of this.nodeIndex) {
      if (hit.frameId === snapshot.frameId) this.nodeIndex.delete(nodeId);
    }
    const index = (node: RawNode): void => {
      this.nodeIndex.set(node.id, { node, frameId: snapshot.frameId });
      if (node.children) node.children.forEach(index);
    };
    index(snapshot.root);
    this.snapshots.set(snapshot.frameId, snapshot);
  }

  getSnapshot(frameId: string): FrameSnapshot | null {
    return this.snapshots.get(frameId) ?? null;
  }

  findNode(nodeId: string): { node: RawNode; snapshot: FrameSnapshot } | null {
    const hit = this.nodeIndex.get(nodeId);
    if (!hit) return null;
    const snapshot = this.snapshots.get(hit.frameId);
    return snapshot ? { node: hit.node, snapshot } : null;
  }
}
