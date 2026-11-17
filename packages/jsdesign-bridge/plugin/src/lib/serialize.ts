/**
 * 序列化器：画布节点对象 → 画板级自包含 FrameSnapshot（协议见 server/src/protocol/messages.ts 镜像 types.ts）
 * 规则（bridge-dev）：
 * - 纯函数，jsDesign API 零调用——输入是"鸭子类型"节点对象（运行时来自 jsDesign，单测用同形状普通对象）
 * - 只产原语快照，不做 CSS 映射（css 视图在 server 侧派生）
 * - 字段实测依据：docs/api-notes.md「实测字段结构」节；未实测分支以守卫收窄 + TODO(实测)
 */
import {
  FrameInfo,
  FrameSnapshot,
  MAX_SNAPSHOT_DEPTH,
  RawFontName,
  RawLineHeight,
  RawLetterSpacing,
  RawNode,
  RawPaint,
  RawEffect,
} from '../types';

/** serialize 输入节点（运行时为 jsDesign 节点；字段实测多为已知形状，未实测处一律 unknown） */
export interface SourceNode {
  id: unknown;
  name: unknown;
  type: unknown;
  visible: unknown;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  fills: unknown;
  strokes: unknown;
  strokeWeight: unknown;
  strokeAlign: unknown;
  dashPattern: unknown;
  opacity: unknown;
  blendMode: unknown;
  cornerRadius: unknown;
  rectangleCornerRadii: unknown;
  effects: unknown;
  layoutMode: unknown;
  itemSpacing: unknown;
  paddingLeft: unknown;
  paddingRight: unknown;
  paddingTop: unknown;
  paddingBottom: unknown;
  primaryAxisAlignItems: unknown;
  counterAxisAlignItems: unknown;
  fontSize: unknown;
  fontName: unknown;
  lineHeight: unknown;
  letterSpacing: unknown;
  textAlignHorizontal: unknown;
  textAlignVertical: unknown;
  textCase: unknown;
  textDecoration: unknown;
  characters: unknown;
  children?: unknown;
}

/** 页面对象（jsDesign.root.children 的成员，实测：name + children） */
export interface PageLike {
  name: unknown;
  children?: unknown;
}

/** 读字段：undefined → null（schema 约定空值为 null）；读取抛错兜底 null（实测常态不抛错，防未测节点类型） */
function readField(src: SourceNode, key: string): unknown {
  try {
    const v = (src as unknown as Record<string, unknown>)[key];
    return v === undefined ? null : v;
  } catch {
    return null;
  }
}

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const asNumber = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const asStringOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumberOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asArrayOrNull = <T>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);

function asFontNameOrNull(v: unknown): RawFontName | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  return typeof o.family === 'string' && typeof o.style === 'string' ? { family: o.family, style: o.style } : null;
}

function asUnitValueOrNull(v: unknown): RawLineHeight | RawLetterSpacing | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.unit === 'AUTO') return { unit: 'AUTO' };
  if ((o.unit === 'PIXELS' || o.unit === 'PERCENT') && typeof o.value === 'number') {
    return { unit: o.unit, value: o.value };
  }
  return null;
}

/** 单节点归一化（不含 children 展开） */
function normalizeNode(src: SourceNode): RawNode {
  return {
    id: asString(src.id),
    name: asString(src.name),
    type: asString(src.type),
    visible: src.visible === undefined ? true : src.visible === true,
    x: asNumber(src.x, 0),
    y: asNumber(src.y, 0),
    width: asNumber(src.width, 0),
    height: asNumber(src.height, 0),
    fills: asArrayOrNull<RawPaint>(readField(src, 'fills')),
    strokes: asArrayOrNull<RawPaint>(readField(src, 'strokes')),
    strokeWeight: asNumberOrNull(readField(src, 'strokeWeight')),
    strokeAlign: asStringOrNull(readField(src, 'strokeAlign')),
    dashPattern: asArrayOrNull<number>(readField(src, 'dashPattern')),
    opacity: asNumber(src.opacity, 1),
    blendMode: asString(src.blendMode, 'PASS_THROUGH'),
    cornerRadius: asNumberOrNull(readField(src, 'cornerRadius')),
    rectangleCornerRadii: asArrayOrNull<number>(readField(src, 'rectangleCornerRadii')),
    effects: asArrayOrNull<RawEffect>(readField(src, 'effects')),
    layoutMode: asStringOrNull(readField(src, 'layoutMode')),
    itemSpacing: asNumberOrNull(readField(src, 'itemSpacing')),
    paddingLeft: asNumberOrNull(readField(src, 'paddingLeft')),
    paddingRight: asNumberOrNull(readField(src, 'paddingRight')),
    paddingTop: asNumberOrNull(readField(src, 'paddingTop')),
    paddingBottom: asNumberOrNull(readField(src, 'paddingBottom')),
    primaryAxisAlignItems: asStringOrNull(readField(src, 'primaryAxisAlignItems')),
    counterAxisAlignItems: asStringOrNull(readField(src, 'counterAxisAlignItems')),
    fontSize: asNumberOrNull(readField(src, 'fontSize')),
    fontName: asFontNameOrNull(readField(src, 'fontName')),
    lineHeight: asUnitValueOrNull(readField(src, 'lineHeight')) as RawLineHeight | null,
    letterSpacing: asUnitValueOrNull(readField(src, 'letterSpacing')) as RawLetterSpacing | null,
    textAlignHorizontal: asStringOrNull(readField(src, 'textAlignHorizontal')),
    textAlignVertical: asStringOrNull(readField(src, 'textAlignVertical')),
    textCase: asStringOrNull(readField(src, 'textCase')),
    textDecoration: asStringOrNull(readField(src, 'textDecoration')),
    characters: asStringOrNull(readField(src, 'characters')),
    children: null,
  };
}

interface WalkResult {
  node: RawNode;
  count: number;
  truncatedAny: boolean;
}

/** 深度优先展开 children，超 MAX_SNAPSHOT_DEPTH 截断并标记 */
function walkNode(src: SourceNode, depth: number): WalkResult {
  const node = normalizeNode(src);
  let count = 1;
  let truncatedAny = false;
  const kids = Array.isArray(src.children) ? (src.children as SourceNode[]) : null;
  if (kids === null) {
    node.children = null;
  } else if (depth >= MAX_SNAPSHOT_DEPTH) {
    node.truncated = true;
    node.children = null;
    truncatedAny = true;
  } else {
    node.children = [];
    for (const kid of kids) {
      const r = walkNode(kid, depth + 1);
      count += r.count;
      truncatedAny = truncatedAny || r.truncatedAny;
      node.children.push(r.node);
    }
  }
  return { node, count, truncatedAny };
}

/** 序列化单个画板为自包含快照（画板独立输出：一画板一条） */
export function serializeFrame(frame: SourceNode, pageName: string): FrameSnapshot {
  const { node, count, truncatedAny } = walkNode(frame, 0);
  return {
    frameId: asString(frame.id),
    name: asString(frame.name),
    width: asNumber(frame.width, 0),
    height: asNumber(frame.height, 0),
    pageName,
    exportedAt: new Date().toISOString(),
    nodeCount: count,
    truncated: truncatedAny,
    root: node,
  };
}

/** 遍历页面集合产出画板清单（实测路径：jsDesign.root.children → page.children 过滤 type==='FRAME'） */
export function collectFrameInfos(pages: PageLike[]): FrameInfo[] {
  const frames: FrameInfo[] = [];
  for (const page of pages) {
    const pageName = asString(page.name);
    if (!Array.isArray(page.children)) continue;
    for (const kid of page.children as SourceNode[]) {
      if (kid === null || typeof kid !== 'object') continue;
      if (kid.type !== 'FRAME') continue;
      const frameId = asString(kid.id);
      if (!frameId) continue;
      frames.push({
        frameId,
        name: asString(kid.name),
        width: asNumber(kid.width, 0),
        height: asNumber(kid.height, 0),
        pageName,
      });
    }
  }
  return frames;
}
