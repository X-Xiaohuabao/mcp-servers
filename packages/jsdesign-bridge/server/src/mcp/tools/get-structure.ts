/**
 * 工具 get_structure(frameId)：单画板轻量结构树（id/name/type/尺寸/层级 + 容器布局方向推断）
 * 防上下文爆炸设计：不带样式字段——样式用 get_node_css(nodeId) 按 id 精查
 * layout 推断（阶段 3 补强）：子节点中心坐标分析 → row/column/mixed，AI 直接映射 flex 方向，防绝对定位偷懒
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { FrameSnapshot, MAX_SNAPSHOT_DEPTH, RawNode } from '../../protocol/messages';
import { fail, jsonOk, ok } from '../types';

export type LayoutDirection = 'row' | 'column' | 'mixed';

/** 子节点中心坐标推断容器排列方向（可见子节点 <2 个不标注；中心线对齐容差 4px，TODO 实测调优） */
export function inferLayout(children: RawNode[]): LayoutDirection | undefined {
  const visible = children.filter((c) => c.visible !== false && c.opacity !== 0);
  if (visible.length < 2) return undefined;
  const centers = visible.map((c) => ({ cx: c.x + c.width / 2, cy: c.y + c.height / 2 }));
  const TOLERANCE = 4;
  const aligned = (axis: 'cx' | 'cy'): boolean =>
    centers.every((c) => Math.abs(c[axis] - centers[0][axis]) <= TOLERANCE);
  if (aligned('cy')) return 'row';
  if (aligned('cx')) return 'column';
  return 'mixed';
}

interface StructureNode {
  id: string;
  name: string;
  type: string;
  size: [number, number];
  /** 相对父容器的位置（像素级布局的基础数据：兄弟坐标差=间距、子包围盒 vs 容器=内边距） */
  pos?: [number, number];
  hidden?: boolean;
  /** 容器布局方向推断（子节点中心坐标分析；映射 flex-direction，row/column 时配合 gap 间距） */
  layout?: LayoutDirection;
  /** 推断内边距 [上, 右, 下, 左]（容器边界 - 可见子节点包围盒，px 四舍五入） */
  padding?: [number, number, number, number];
  /** 推断主方向等间距（px；不一致时省略） */
  gap?: number;
  children?: StructureNode[];
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function lightTree(node: RawNode): StructureNode {
  const out: StructureNode = { id: node.id, name: node.name, type: node.type, size: [node.width, node.height] };
  out.pos = [node.x, node.y];
  if (!node.visible) out.hidden = true;
  const children = node.children && node.children.length > 0 ? node.children : [];
  const visibleChildren = children.filter((c) => c.visible !== false && c.opacity !== 0);
  if (children.length > 0) {
    const layout = inferLayout(children);
    if (layout) out.layout = layout;
    if (visibleChildren.length > 0) {
      // 内边距推断：容器边界 - 可见子节点包围盒（四向独立，不假设对称）
      const minX = Math.min(...visibleChildren.map((c) => c.x));
      const minY = Math.min(...visibleChildren.map((c) => c.y));
      const maxX = Math.max(...visibleChildren.map((c) => c.x + c.width));
      const maxY = Math.max(...visibleChildren.map((c) => c.y + c.height));
      out.padding = [
        round1(minY),
        round1(node.width - maxX),
        round1(node.height - maxY),
        round1(minX),
      ];
      if (layout === 'row' || layout === 'column') out.gap = inferGap(visibleChildren, layout);
    }
    out.children = children.map(lightTree);
  }
  return out;
}

/** 相邻可见子节点边缘间距；全等距（容差 2px）返回值，否则 undefined（AI 可用 pos 自行计算） */
function inferGap(visible: RawNode[], layout: 'row' | 'column'): number | undefined {
  if (visible.length < 2) return undefined;
  const ordered = [...visible].sort((a, b) => (layout === 'row' ? a.x - b.x : a.y - b.y));
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    gaps.push(layout === 'row' ? cur.x - (prev.x + prev.width) : cur.y - (prev.y + prev.height));
  }
  if (gaps.some((g) => g < -1)) return undefined;
  const avg = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  if (gaps.every((g) => Math.abs(g - avg) <= 2)) return round1(avg);
  return undefined;
}

export function registerGetStructure(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'get_structure',
    '获取单个画板的轻量节点树（id/名称/类型/尺寸/层级/容器布局方向，不含样式）。' +
      'layout 推断容器排列（row/column/mixed）映射 flex 方向；pos=相对父容器位置、padding=推断内边距、gap=推断等间距——' +
      '像素级布局的全部参数，禁止绝对定位。用于定位节点 id；样式用 get_node_css(nodeId) 精查',
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
        '从树中取目标节点的 id，用 get_node_css(nodeId) 查精确样式（css+raw 双轨）。' +
          '布局还原按容器 layout 映射 flex-direction，padding 直接取标注值，子节点间距=相邻 pos 坐标差（gap 已标注等距值），禁止绝对定位；顶部导航/底部 tab 用 fixed。',
      );
    },
  );
}
