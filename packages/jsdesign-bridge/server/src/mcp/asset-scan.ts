/**
 * asset-scan：快照树 → 候选资产清单 的纯函数扫描（list_assets 工具的枚举内核）
 * 判定规则（2026-11-17 与用户定案）：
 * - bitmap：fills 含可见 IMAGE 填充 → 位图资产（原图字节/位图导出）
 * - vector：纯图形节点（VECTOR/布尔运算/线/星/多边形/椭圆/组件实例/不含文字的 GROUP）→ SVG 导出候选
 * - 排除：TEXT、含文字后代（徽章/行卡片）、不可见节点；命中即停（不深入其子树，防同图标内部路径刷屏）
 */
import { RawNode } from '../protocol/messages';

export interface AssetCandidate {
  nodeId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  /** bitmap=IMAGE 填充（原图字节/位图导出）；vector=纯图形节点（SVG 导出候选） */
  kind: 'bitmap' | 'vector';
}

/** 纯图形节点类型：整棵子树通常都是图形，适合整体导出为 SVG */
const GRAPHIC_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'REGULAR_POLYGON', 'ELLIPSE', 'INSTANCE', 'GROUP']);

function hasVisibleImageFill(node: RawNode): boolean {
  const paints = Array.isArray(node.fills) ? node.fills : [];
  return paints.some((p) => p.type === 'IMAGE' && p.visible !== false);
}

function hasTextDescendant(node: RawNode): boolean {
  if (node.type === 'TEXT') return true;
  const children = Array.isArray(node.children) ? node.children : [];
  return children.some(hasTextDescendant);
}

function isVisible(node: RawNode): boolean {
  return node.visible !== false && node.opacity !== 0;
}

/** 深度优先扫描：命中候选即收录并停止下钻（图标内部的路径不逐个列出） */
export function scanGraphicAssets(root: RawNode): AssetCandidate[] {
  const out: AssetCandidate[] = [];
  const walk = (node: RawNode): void => {
    if (!isVisible(node)) return;
    const isBitmap = hasVisibleImageFill(node);
    const isGraphic = GRAPHIC_TYPES.has(node.type) && !hasTextDescendant(node);
    if (isBitmap || isGraphic) {
      out.push({
        nodeId: node.id,
        name: typeof node.name === 'string' ? node.name : '',
        type: typeof node.type === 'string' ? node.type : '',
        width: node.width,
        height: node.height,
        kind: isBitmap ? 'bitmap' : 'vector',
      });
      return;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach(walk);
  };
  walk(root);
  return out;
}
