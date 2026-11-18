/**
 * 工具 get_node_css(nodeId)：单节点样式双轨返回
 * css：原语映射（css-map）+ SVG 提取增强（渐变/阴影弱分支，来源标注进 notes）
 * raw：原语保真（css 表达不了的字段兜底）；依赖缓存画板，未命中时指引先 list_frames + get_structure
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { nodeToCss } from '../css-map';
import { extractCssFromSvg } from '../svg-css';
import { errText, fail, jsonOk } from '../types';

/** 节点自绘填充含渐变时，css-map 不产出背景（已知弱分支）→ 走官方 SVG 提取轨补齐 */
function hasGradientFill(node: { fills?: unknown }): boolean {
  const paints = Array.isArray(node.fills) ? node.fills : [];
  return paints.some(
    (p: { type?: unknown; visible?: unknown }) =>
      typeof p.type === 'string' && p.type.startsWith('GRADIENT') && p.visible !== false,
  );
}

/** 拉节点官方 SVG 并解析弱分支 CSS；任何失败返回 null（调用方保留 css-map 原结果 + 提示） */
async function extractSvgCss(daemon: DaemonHandle, nodeId: string): Promise<{ css: Record<string, string>; notes: string[] } | null> {
  let payload;
  try {
    payload = await daemon.request({ type: 'asset.export', nodeId, format: 'svg', scale: 1 });
  } catch (e) {
    return { css: {}, notes: [`SVG 提取轨请求失败（${errText(e)}），渐变等弱分支请参考 raw.fills 手工还原`] };
  }
  if (payload.type !== 'asset.export.result') {
    return { css: {}, notes: [`SVG 提取轨意外响应：${payload.type}`] };
  }
  if (!payload.ok) {
    return { css: {}, notes: [`SVG 提取轨失败：${payload.error}`] };
  }
  const svg = Buffer.from(payload.base64, 'base64').toString('utf8');
  const extraction = extractCssFromSvg(svg);
  const notes = [...extraction.warnings.map((w) => `SVG 提取轨：${w}`)];
  if (Object.keys(extraction.css).length > 0) {
    notes.push('渐变/阴影弱分支来自官方 SVG 解析（探针⑨换算公式），非自研映射');
  }
  return { css: extraction.css, notes };
}

export function registerGetNodeCss(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'get_node_css',
    '按 nodeId 查单节点精确样式：css 为映射后的 CSS 属性（不含定位，可直接用于还原；画板坐标在 raw.x/raw.y，相对父容器；渐变等弱分支自动经官方 SVG 提取轨补齐），raw 为设计原语保真，notes 列出未映射项',
    { nodeId: z.string().describe('节点 id（来自 get_structure 返回的树）') },
    async ({ nodeId }) => {
      const hit = await daemon.findNode(nodeId);
      if (!hit) {
        return fail(
          `缓存中未找到节点 ${nodeId}。请先 list_frames 拿画板清单，再 get_structure(frameId) 拉取画板结构（nodeId 从结构树中取）。`,
        );
      }
      const view = nodeToCss(hit.node);
      const notes = [...view.notes];

      // SVG 提取轨：渐变填充时自动补 background-image 等 css-map 弱分支（失败降级为 note）
      let svgCss: Record<string, string> = {};
      if (hasGradientFill(hit.node)) {
        const extraction = await extractSvgCss(daemon, hit.node.id);
        if (extraction) {
          svgCss = extraction.css;
          notes.push(...extraction.notes);
        }
      }

      const childCount = hit.node.children?.length ?? 0;
      const payload = {
        nodeId: hit.node.id,
        frame: { frameId: hit.snapshot.frameId, name: hit.snapshot.name },
        css: { ...view.css, ...svgCss },
        notes,
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
