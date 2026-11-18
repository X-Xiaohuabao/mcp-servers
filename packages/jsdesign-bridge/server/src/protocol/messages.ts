/**
 * 消息 schema 单一事实源（daemon ↔ 插件 WS 契约）
 *
 * 规则（bridge-dev）：
 * - 插件侧同构类型手抄镜像至 plugin/src/types.ts，注释指向本文件，禁止两处独立演化
 * - 变更本文件 = 消费方 breaking change：同步检查 plugin/src/types.ts 与消费方（ui-restore）引用
 * - 字段实测依据：packages/jsdesign-bridge/docs/api-notes.md「实测字段结构」节（2026-11-17 探针面板三批）
 */

// ---------- 协议常量 ----------

/** daemon WS 监听地址（插件 ui 侧连接目标）。1120：用户指定，避开参考实现/市场 MCP Bridge 的 3847，可共存 */
export const WS_URL = 'ws://127.0.0.1:1120';

/** 全部连接断开后 daemon 空闲自退时长（参考实现实践） */
export const DAEMON_IDLE_EXIT_MS = 15 * 60 * 1000;

/** 快照序列化最大深度（防超深树；超出截断并以 truncated 标记） */
export const MAX_SNAPSHOT_DEPTH = 30;

// ---------- 设计原语 ----------

/** 0-1 浮点 RGB（实测：alpha 不在 color 内，由 Paint.opacity 单独承载） */
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

/**
 * 未实测 Paint（GRADIENT_* / IMAGE 等）：TODO(实测) 步骤 6 真稿补齐后细化为判别联合
 */
export interface OtherPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  [key: string]: unknown;
}

export type RawPaint = SolidPaint | OtherPaint;

/** 未实测 Effect（DROP_SHADOW 等）：TODO(实测) —— 结构以真稿实测为准 */
export interface RawEffect {
  type: string;
  [key: string]: unknown;
}

/** 实测：{unit:'AUTO'} / {unit:'PIXELS', value}；PERCENT 形态 TODO(实测) */
export type RawLineHeight = { unit: 'AUTO' } | { unit: 'PIXELS' | 'PERCENT'; value: number };

/** 实测：{unit:'PIXELS', value:0}；PERCENT 形态 TODO(实测) */
export interface RawLetterSpacing {
  unit: 'PIXELS' | 'PERCENT';
  value: number;
}

/** 实测：{family, style}；fontWeight 字段不暴露，字重由 style 推导 */
export interface RawFontName {
  family: string;
  style: string;
}

/**
 * 序列化节点原语（css 视图的映射输入、raw 视图的保真载体）。
 * 实测：读不存在的字段返回 null 不抛错，故可空字段一律 null 而非 undefined。
 */
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
  /** 子树被 MAX_SNAPSHOT_DEPTH 截断时为 true，该层 children 不再展开 */
  truncated?: boolean;
  children: RawNode[] | null;
}

// ---------- 快照 ----------

/** 画板清单项（list_frames 工具返回；编排 agent 分活用） */
export interface FrameInfo {
  frameId: string;
  name: string;
  width: number;
  height: number;
  pageName: string;
}

/** 单画板自包含快照（画板独立输出：一画板一条，不存在整文档大 JSON） */
export interface FrameSnapshot {
  frameId: string;
  name: string;
  width: number;
  height: number;
  pageName: string;
  /** ISO 8601 导出时间 */
  exportedAt: string;
  nodeCount: number;
  /** 任一子树被深度截断时为 true */
  truncated: boolean;
  root: RawNode;
}

// ---------- 消息：daemon → 插件（采集请求） ----------

export interface RequestBase {
  /** daemon 生成，插件结果消息原样回填 */
  requestId: string;
}

/** daemon.request 的入参意图（requestId 由 daemon 统一生成附加） */
export type DaemonRequestIntent =
  | { type: 'frames.list' }
  | { type: 'frame.snapshot'; frameId: string }
  | { type: 'asset.export'; nodeId: string; format: AssetFormat; scale: number };

export type DaemonToPlugin =
  | ({ type: 'frames.list' } & RequestBase)
  | ({ type: 'frame.snapshot'; frameId: string } & RequestBase)
  | ({ type: 'asset.export'; nodeId: string; format: AssetFormat; scale: number } & RequestBase);

// ---------- 消息：插件 → daemon（采集结果） ----------

/**
 * 切图导出格式（export_asset 工具；探针⑨实证 exportAsync，探针⑩原图字节 getImageByHash TODO 实测）：
 * - auto：插件按节点决策——fills 含可见 IMAGE → original；否则 svg（矢量图标首选，fill 可被 CSS 覆盖）
 * - original：IMAGE 填充的原图字节（imageHash → getImageByHash → getBytesAsync），实测前 fallback 提示用 png
 * - svg / png / jpg：exportAsync 直出；scale 仅对 png/jpg 生效（1-4，默认 2）
 */
export type AssetFormat = 'auto' | 'svg' | 'png' | 'jpg' | 'original';

export type PluginToDaemon =
  | { type: 'frames.list.result'; requestId: string; ok: true; frames: FrameInfo[]; fileName?: string }
  | { type: 'frames.list.result'; requestId: string; ok: false; error: string }
  | { type: 'frame.snapshot.result'; requestId: string; ok: true; snapshot: FrameSnapshot }
  | { type: 'frame.snapshot.result'; requestId: string; ok: false; error: string }
  | {
      type: 'asset.export.result';
      requestId: string;
      ok: true;
      /** 字节经 base64 编码过 WS（JSON 帧仅文本；工具侧解码落盘，不进 AI 上下文） */
      base64: string;
      ext: 'svg' | 'png' | 'jpg' | 'bin';
      nodeName: string;
      nodeType: string;
      format: Exclude<AssetFormat, 'auto'> | 'bin';
      /** auto 决策说明（如"显示尺寸 ≤128px 改走 PNG@2x"），供 AI/用户了解格式选择原因 */
      note?: string;
    }
  | { type: 'asset.export.result'; requestId: string; ok: false; error: string };

// ---------- 消息：MCP server → daemon（客户端通道，阶段 3 daemon 独立化） ----------
//
// 架构（2026-11-17 用户拍板）：daemon 独立单例进程（唯一监听 1120，持缓存 + 插件连接）；
// 每个会话的 MCP server 作为 WS 客户端接入（?role=client），不再监听端口——多会话天然并存。
// 插件连接无 role 参数（默认 plugin，协议零改动、插件零重建）。
// daemon 对 client 的工具请求重写 requestId（`req:<connId>:<seq>`）转发给插件，
// 结果按前缀路由回发起方并还原原 requestId——多客户端并发安全。

/** 客户端工具请求意图（与 DaemonRequestIntent 同形，独立命名以示通道） */
export type ClientToDaemon =
  | { type: 'client.hello' }
  | { type: 'cache.getFrameInfos'; requestId: string }
  | { type: 'cache.getSnapshot'; requestId: string; frameId: string }
  | { type: 'cache.findNode'; requestId: string; nodeId: string }
  | { type: 'tool.request'; requestId: string; intent: DaemonRequestIntent };

export type DaemonToClient =
  | { type: 'cache.frameInfos'; requestId: string; frames: FrameInfo[] | null; fileName: string | null }
  | { type: 'cache.snapshot'; requestId: string; snapshot: FrameSnapshot | null }
  | { type: 'cache.node'; requestId: string; hit: { node: RawNode; snapshot: FrameSnapshot } | null }
  | { type: 'tool.result'; requestId: string; payload: PluginToDaemon };
