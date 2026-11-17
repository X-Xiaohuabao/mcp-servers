/**
 * 工具 get_node_css(nodeId)：单节点样式双轨返回
 * css：原语映射的 CSS 属性（AI 直接读用）；raw：原语保真（css 表达不了的字段兜底）
 * v1 只查缓存画板（协议零改动）：未命中时指引先 list_frames + get_structure
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { nodeToCss } from '../css-map';
import { fail, jsonOk } from '../types';

export function registerGetNodeCss(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'get_node_css',
    '按 nodeId 查单节点精确样式：css 为映射后的 CSS 属性（不含定位，可直接用于还原；画板坐标在 raw.x/raw.y，相对父容器），raw 为设计原语保真，notes 列出未映射项',
    { nodeId: z.string().describe('节点 id（来自 get_structure 返回的树）') },
    async ({ nodeId }) => {
      const hit = await daemon.findNode(nodeId);
      if (!hit) {
        return fail(
          `缓存中未找到节点 ${nodeId}。请先 list_frames 拿画板清单，再 get_structure(frameId) 拉取画板结构（nodeId 从结构树中取）。`,
        );
      }
      const view = nodeToCss(hit.node);
      const childCount = hit.node.children?.length ?? 0;
      const payload = {
        nodeId: hit.node.id,
        frame: { frameId: hit.snapshot.frameId, name: hit.snapshot.name },
        css: view.css,
        notes: view.notes,
        childCount,
        raw: { ...hit.node, children: undefined },
      };
      const hint = childCount > 0
        ? `该节点含 ${childCount} 个子节点（id 在 get_structure 树中），逐个 get_node_css 还原子元素样式。`
        : '叶子节点：以上 css 即该元素的完整样式起点。文档流布局（flex/gap/margin）请结合 get_structure 的兄弟节点关系推导，勿用画板坐标（raw.x/raw.y）直接定位。';
      return jsonOk(payload, hint);
    },
  );
}
