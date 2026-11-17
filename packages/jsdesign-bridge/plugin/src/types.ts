/**
 * ⚠️ 手抄镜像 —— 单一事实源：`server/src/protocol/messages.ts`
 * 规则（bridge-dev）：本文件禁止独立演化；protocol 变更时必须同步手抄（含常量与注释要点）。
 * 字段实测依据与类型说明见 protocol 源文件与 docs/api-notes.md「实测字段结构」节。
 */

// ---------- 协议常量 ----------

export const WS_URL = 'ws://127.0.0.1:3848';

/** 全部连接断开后 daemon 空闲自退时长（当前插件侧不消费，镜像保同步） */
export const DAEMON_IDLE_EXIT_MS = 15 * 60 * 1000;

/** 快照序列化最大深度 */
export const MAX_SNAPSHOT_DEPTH = 30;

// ---------- 设计原语 ----------

/** 0-1 浮点 RGB（实测：alpha 由 Paint.opacity 单独承载） */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** 实测形态：SOLID 填充/描边 */
export interface SolidPaint {
  type: 'SOLID';
  visible: boolean;
  opacity: number;
  blendMode: string;
  color: RgbColor;
}

/** 未实测 Paint（GRADIENT_* / IMAGE 等）：TODO(实测) 步骤 6 真稿补齐后细化 */
export interface OtherPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  [key: string]: unknown;
}

export type RawPaint = SolidPaint | OtherPaint;

/** 未实测 Effect：TODO(实测) */
export interface RawEffect {
  type: string;
  [key: string]: unknown;
}

export type RawLineHeight = { unit: 'AUTO' } | { unit: 'PIXELS' | 'PERCENT'; value: number };

export interface RawLetterSpacing {
  unit: 'PIXELS' | 'PERCENT';
  value: number;
}

export interface RawFontName {
  family: string;
  style: string;
}

/** 序列化节点原语（不存在的字段为 null，实测不抛错） */
export interface RawNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: RawPaint[] | null;
  strokes: RawPaint[] | null;
  strokeWeight: number | null;
  strokeAlign: string | null;
  dashPattern: number[] | null;
  opacity: number;
  blendMode: string;
  cornerRadius: number | null;
  rectangleCornerRadii: number[] | null;
  effects: RawEffect[] | null;
  layoutMode: string | null;
  itemSpacing: number | null;
  paddingLeft: number | null;
  paddingRight: number | null;
  paddingTop: number | null;
  paddingBottom: number | null;
  primaryAxisAlignItems: string | null;
  counterAxisAlignItems: string | null;
  fontSize: number | null;
  fontName: RawFontName | null;
  lineHeight: RawLineHeight | null;
  letterSpacing: RawLetterSpacing | null;
  textAlignHorizontal: string | null;
  textAlignVertical: string | null;
  textCase: string | null;
  textDecoration: string | null;
  characters: string | null;
  truncated?: boolean;
  children: RawNode[] | null;
}

// ---------- 快照 ----------

export interface FrameInfo {
  frameId: string;
  name: string;
  width: number;
  height: number;
  pageName: string;
}

export interface FrameSnapshot {
  frameId: string;
  name: string;
  width: number;
  height: number;
  pageName: string;
  exportedAt: string;
  nodeCount: number;
  truncated: boolean;
  root: RawNode;
}

// ---------- 消息 ----------

export interface RequestBase {
  requestId: string;
}

export type DaemonToPlugin =
  | ({ type: 'frames.list' } & RequestBase)
  | ({ type: 'frame.snapshot'; frameId: string } & RequestBase);

export type PluginToDaemon =
  | { type: 'frames.list.result'; requestId: string; ok: true; frames: FrameInfo[] }
  | { type: 'frames.list.result'; requestId: string; ok: false; error: string }
  | { type: 'frame.snapshot.result'; requestId: string; ok: true; snapshot: FrameSnapshot }
  | { type: 'frame.snapshot.result'; requestId: string; ok: false; error: string };
