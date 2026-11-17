/**
 * 工具 get_structure(frameId)：单画板轻量结构树（id/name/type/尺寸/层级）
 * 防上下文爆炸设计：不带样式字段——样式用 get_node_css(nodeId) 按 id 精查
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { FrameSnapshot, MAX_SNAPSHOT_DEPTH, RawNode } from '../../protocol/messages';
import { fail, jsonOk, ok } from '../types';

interface StructureNode {
  id: string;
  name: string;
  type: string;
  size: [number, number];
  hidden?: boolean;
  children?: StructureNode[];
}

function lightTree(node: RawNode): StructureNode {
  const out: StructureNode = { id: node.id, name: node.name, type: node.type, size: [node.width, node.height] };
  if (!node.visible) out.hidden = true;
  if (node.children && node.children.length > 0) out.children = node.children.map(lightTree);
  return out;
}

export function registerGetStructure(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'get_structure',
    '获取单个画板的轻量节点树（id/名称/类型/尺寸/层级，不含样式）。用于定位节点 id，样式用 get_node_css(nodeId) 精查',
    { frameId: z.string().describe('画板 id（来自 list_frames 返回的 frameId）') },
    async ({ frameId }) => {
      let snapshot: FrameSnapshot | null = await daemon.getSnapshot(frameId);
      if (!snapshot) {
        const res = await daemon.request({ type: 'frame.snapshot', frameId });
        if (!res.ok) return fail(res.error);
        snapshot = await daemon.getSnapshot(frameId);
        if (!snapshot) return fail(`画板 ${frameId} 采集后仍不在缓存（内部错误），请重试`);
      }
      const tree = lightTree(snapshot.root);
      if (snapshot.truncated) {
        return ok(
          `${JSON.stringify(tree, null, 2)}\n\n⚠️ 该画板超过最大深度 ${MAX_SNAPSHOT_DEPTH} 被截断，深层节点未包含`,
        );
      }
      return jsonOk(
        tree,
        '从树中取目标节点的 id，用 get_node_css(nodeId) 查精确样式（css+raw 双轨）。',
      );
    },
  );
}
