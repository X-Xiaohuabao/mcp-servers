/**
 * 沙箱主线程入口：纯装配（bridge-dev：jsDesign API 只出现在本文件）
 * 拉模式被动响应：ui.ts 转发 daemon 采集请求 → 这里读画布 → lib/serialize 序列化 → postMessage 回 ui.ts
 * 消息契约：types.ts（镜像 server/src/protocol/messages.ts）
 */
import { DaemonToPlugin, PluginToDaemon } from './types';
import { collectFrameInfos, serializeFrame, PageLike, SourceNode } from './lib/serialize';

type FrameListRequest = Extract<DaemonToPlugin, { type: 'frames.list' }>;
type FrameSnapshotRequest = Extract<DaemonToPlugin, { type: 'frame.snapshot' }>;

jsDesign.showUI(__html__, { width: 320, height: 180 });

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function reply(message: PluginToDaemon): void {
  jsDesign.ui.postMessage(message);
}

/** frames.list：实测路径 jsDesign.root.children → 页面过滤 FRAME（api-notes 探针⑥） */
function onFramesList(request: FrameListRequest): void {
  try {
    const pages = Array.isArray(jsDesign.root?.children) ? (jsDesign.root.children as PageLike[]) : [];
    reply({ type: 'frames.list.result', requestId: request.requestId, ok: true, frames: collectFrameInfos(pages) });
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
  }
};
