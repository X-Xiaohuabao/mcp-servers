/**
 * 沙箱主线程入口：纯装配（bridge-dev：jsDesign API 只出现在本文件）
 * 拉模式被动响应：ui.ts 转发 daemon 采集请求 → 这里读画布 → lib/serialize 序列化 → postMessage 回 ui.ts
 * 消息契约：types.ts（镜像 server/src/protocol/messages.ts）
 */
import { DaemonToPlugin, PluginToDaemon, ProbeExportRequest, ProbeExportResult } from './types';
import { collectFrameInfos, serializeFrame, PageLike, SourceNode } from './lib/serialize';
import { bytesToBase64, detectImageExt } from './lib/asset-bytes';

type FrameListRequest = Extract<DaemonToPlugin, { type: 'frames.list' }>;
type FrameSnapshotRequest = Extract<DaemonToPlugin, { type: 'frame.snapshot' }>;
type AssetExportRequest = Extract<DaemonToPlugin, { type: 'asset.export' }>;

jsDesign.showUI(__html__, { width: 320, height: 360 });

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function reply(message: PluginToDaemon): void {
  jsDesign.ui.postMessage(message);
}

/** frames.list：实测路径 jsDesign.root.children → 页面过滤 FRAME（api-notes 探针⑥）；fileName=root.name（多文件辨析连接身份，TODO(实测) 守卫读取） */
function onFramesList(request: FrameListRequest): void {
  try {
    const pages = Array.isArray(jsDesign.root?.children) ? (jsDesign.root.children as PageLike[]) : [];
    const rootName = (jsDesign.root as { name?: unknown }).name;
    const fileName = typeof rootName === 'string' ? rootName : undefined;
    reply({ type: 'frames.list.result', requestId: request.requestId, ok: true, frames: collectFrameInfos(pages), fileName });
  } catch (e) {
    reply({ type: 'frames.list.result', requestId: request.requestId, ok: false, error: '画板清单读取失败：' + errText(e) });
  }
}

/** frame.snapshot：实测 getNodeByIdAsync 直查（api-notes 探针⑤），FRAME 类型校验后整树序列化 */
function onFrameSnapshot(request: FrameSnapshotRequest): void {
  jsDesign.getNodeByIdAsync(request.frameId)
    .then((found) => {
      if (!found) {
        reply({ type: 'frame.snapshot.result', requestId: request.requestId, ok: false, error: `未找到画板 ${request.frameId}（可能已被删除）` });
        return;
      }
      const node = found as SourceNode;
      if (node.type !== 'FRAME') {
        reply({ type: 'frame.snapshot.result', requestId: request.requestId, ok: false, error: `节点 "${node.name}" 类型为 ${node.type}，不是画板（FRAME）` });
        return;
      }
      // 页名取父节点（PageNode）name：parent 读取未专项实测 TODO(实测)，守卫兜底空串
      let pageName = '';
      try {
        const parent = (found as { parent?: unknown }).parent as PageLike | undefined;
        pageName = typeof parent?.name === 'string' ? parent.name : '';
      } catch { pageName = ''; }
      reply({ type: 'frame.snapshot.result', requestId: request.requestId, ok: true, snapshot: serializeFrame(node, pageName) });
    })
    .catch((e: unknown) => {
      reply({ type: 'frame.snapshot.result', requestId: request.requestId, ok: false, error: '节点读取失败：' + errText(e) });
    });
}

/** ui→main 消息路由（探针面板已实测该通道全链路可用） */
jsDesign.ui.onmessage = (raw: unknown) => {
  if (typeof raw !== 'object' || raw === null) return;
  const msg = raw as { type?: unknown; requestId?: unknown; frameId?: unknown };
  if (typeof msg.type !== 'string' || typeof msg.requestId !== 'string') return;
  if (msg.type === 'frames.list') {
    onFramesList({ type: 'frames.list', requestId: msg.requestId });
  } else if (msg.type === 'frame.snapshot' && typeof msg.frameId === 'string') {
    onFrameSnapshot({ type: 'frame.snapshot', requestId: msg.requestId, frameId: msg.frameId });
  } else if (msg.type === 'probe.export') {
    onProbeExport(msg.requestId);
  } else if (msg.type === 'asset.export') {
    onAssetExport(msg as AssetExportRequest);
  }
};

// ---------- 切图导出（asset.export）：矢量 SVG / IMAGE 原图字节 / 位图 PNG@scale ----------

type Exporter = (this: unknown, settings: Record<string, unknown>) => Promise<Uint8Array>;

function postAsset(requestId: string, payload: PluginToDaemon): void {
  jsDesign.ui.postMessage(payload);
}

/** auto 决策：fills 含可见 IMAGE → original（原图字节）；否则 svg（矢量图标首选） */
function resolveAssetFormat(node: SourceNode, requested: AssetExportRequest['format']): AssetExportRequest['format'] {
  if (requested !== 'auto') return requested;
  const paints = Array.isArray(node.fills) ? node.fills : [];
  const hasImage = paints.some((p) => p.type === 'IMAGE' && p.visible !== false);
  return hasImage ? 'original' : 'svg';
}

function onAssetExport(request: AssetExportRequest): void {
  const failReply = (error: string): void => {
    postAsset(request.requestId, { type: 'asset.export.result', requestId: request.requestId, ok: false, error });
  };
  jsDesign.getNodeByIdAsync(request.nodeId)
    .then((found) => {
      if (!found) {
        failReply(`未找到节点 ${request.nodeId}（可能已被删除）`);
        return;
      }
      const node = found as SourceNode;
      const nodeName = typeof node.name === 'string' ? node.name : '';
      const nodeType = typeof node.type === 'string' ? node.type : '';
      const exporter = (node as { exportAsync?: Exporter }).exportAsync;
      if (typeof exporter !== 'function') {
        failReply(`节点 "${nodeName}" 无 exportAsync 接口`);
        return;
      }
      const format = resolveAssetFormat(node, request.format);

      const replyBytes = (ext: 'svg' | 'png' | 'jpg' | 'bin', bytes: Uint8Array, usedFormat: string): void => {
        postAsset(request.requestId, {
          type: 'asset.export.result',
          requestId: request.requestId,
          ok: true,
          base64: bytesToBase64(bytes),
          ext,
          nodeName,
          nodeType,
          format: usedFormat as 'svg' | 'png' | 'jpg' | 'bin',
        });
      };

      if (format === 'svg') {
        exporter.call(node, { format: 'SVG', svgIdAttribute: true, svgOutlineText: false })
          .then((bytes) => replyBytes('svg', bytes, 'svg'))
          .catch((e: unknown) => failReply('SVG 导出失败：' + errText(e)));
        return;
      }
      if (format === 'png' || format === 'jpg') {
        exporter.call(node, { format: format.toUpperCase(), constraint: { type: 'SCALE', value: request.scale } })
          .then((bytes) => replyBytes(format, bytes, format))
          .catch((e: unknown) => failReply(`${format.toUpperCase()} 导出失败：` + errText(e)));
        return;
      }
      // original：IMAGE 填充 → imageHash → getImageByHash → getBytesAsync（探针⑩：运行时未验，全守卫）
      const paints = Array.isArray(node.fills) ? node.fills : [];
      const imagePaint = paints.find((p) => p.type === 'IMAGE' && p.visible !== false) as
        | { imageHash?: unknown }
        | undefined;
      const hash = imagePaint?.imageHash;
      if (typeof hash !== 'string' || hash === '') {
        failReply('节点无 IMAGE 填充（imageHash 为空），无法取原图字节；可用 format:png 改走位图导出');
        return;
      }
      const api = jsDesign as { getImageByHash?: unknown };
      if (typeof api.getImageByHash !== 'function') {
        failReply('沙箱无 getImageByHash（TODO 探针⑩实测）——请改用 format:png 走位图导出');
        return;
      }
      const image = (api.getImageByHash as (this: unknown, h: string) => unknown).call(jsDesign, hash) as
        | { getBytesAsync?: unknown }
        | null;
      if (!image || typeof image.getBytesAsync !== 'function') {
        failReply('getImageByHash 未返回有效 Image 对象——请改用 format:png');
        return;
      }
      (image.getBytesAsync as (this: unknown) => Promise<Uint8Array>)
        .call(image)
        .then((bytes) => replyBytes(detectImageExt(bytes), bytes, 'original'))
        .catch((e: unknown) => failReply('原图字节读取失败：' + errText(e)));
    })
    .catch((e: unknown) => failReply('节点读取失败：' + errText(e)));
}

// ---------- 探针⑨：exportAsync 可用性与产物形态（api-notes「Dev Mode」节 TODO(实测)） ----------

function postProbe(requestId: string, payload: Omit<ProbeExportResult, 'type' | 'requestId'>): void {
  const result: ProbeExportResult = { type: 'probe.export.result', requestId, ...payload };
  jsDesign.ui.postMessage(result);
}

/** 字节 → 拉丁串：仅看结构（标签/属性名 ASCII）；TextDecoder 主线程未实测，不引入 */
function bytesToLatin(bytes: Uint8Array, max: number): string {
  let text = '';
  const end = Math.min(bytes.length, max);
  for (let i = 0; i < end; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

function onProbeExport(requestId: string): void {
  try {
    const selection = jsDesign.currentPage?.selection;
    const node = (Array.isArray(selection) ? selection : [])[0] as SourceNode | undefined;
    if (!node) {
      postProbe(requestId, { ok: false, exportAsyncType: 'n/a', error: '画布无选中节点：请先选中一个节点（真实稿优先选带渐变/阴影的）' });
      return;
    }
    const nodeName = typeof node.name === 'string' ? node.name : '';
    const nodeType = typeof node.type === 'string' ? node.type : '';
    const base = { nodeName, nodeType };
    // 结构化收窄（探针⑤同款守卫思路）：typeof 实测后才调
    const candidate = node as { exportAsync?: (settings: Record<string, unknown>) => Promise<Uint8Array> };
    const exportAsyncType = typeof candidate.exportAsync;
    if (exportAsyncType !== 'function') {
      postProbe(requestId, { ...base, ok: false, exportAsyncType, error: 'exportAsync 不可用——维持纯文档模型自研路线（对照基准仍是 Dev Mode 面板）' });
      return;
    }
    const exporter = candidate.exportAsync as (this: unknown, settings: Record<string, unknown>) => Promise<Uint8Array>;
    postProbe(requestId, { ...base, ok: true, exportAsyncType, error: '探针执行中…' });
    (async () => {
      const out: Omit<ProbeExportResult, 'type' | 'requestId'> = { ...base, ok: true, exportAsyncType };
      try {
        // this 显式绑回节点（裸调用丢 this → 沙箱内部 "Expected node, got undefined"）
        const svg = await exporter.call(node, { format: 'SVG', svgIdAttribute: true, svgOutlineText: false });
        out.svgPreview = bytesToLatin(svg, 4000);
        out.svgBytes = svg.length;
      } catch (e) {
        out.error = 'SVG 失败：' + errText(e);
      }
      try {
        const png = await exporter.call(node, { format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
        out.pngBytes = png.length;
      } catch (e) {
        out.error = (out.error ? out.error + '；' : '') + 'PNG 失败：' + errText(e);
      }
      postProbe(requestId, out);
    })().catch((e: unknown) => {
      postProbe(requestId, { ...base, ok: false, exportAsyncType, error: '探针执行失败：' + errText(e) });
    });
  } catch (e) {
    postProbe(requestId, { ok: false, exportAsyncType: 'n/a', error: '探针启动失败：' + errText(e) });
  }
}
