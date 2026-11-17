/**
 * 工具 list_frames：全文档画板清单（编排 agent 分活用——每画板可由独立 agent 并行处理）
 * 数据流：缓存优先；miss 时经 daemon 向插件实发 frames.list（结果由 daemon 入缓存）
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { fail, jsonOk } from '../types';

export function registerListFrames(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'list_frames',
    '获取当前打开设计文档的全部画板清单（id/名称/尺寸/所在页）。每次调用强制重新采集——切换设计文件后重新调用即可刷新基线（同时清空画板/节点缓存）。画板按功能归类，每个画板可由独立 agent 并行处理',
    {},
    async () => {
      // 强制刷新（不读缓存）：daemon 单例跨会话存活，缓存可能属于已切走的旧文档
      const res = await daemon.request({ type: 'frames.list' });
      if (!res.ok) return fail(res.error);
      const entry = await daemon.getFrameInfos();
      const frames = entry?.frames ?? [];
      if (frames.length === 0) {
        return fail('文档中没有画板（FRAME）。请在即时设计画布上创建画板后重试');
      }
      return jsonOk(
        { fileName: entry?.fileName ?? null, frames },
        '画板按功能归类。用 get_structure(frameId) 查看某个画板的节点树；每个画板可交给独立的 agent 并行还原。fileName 是当前连接的设计文件名——若与目标文件不符，请在即时设计切到目标文件并重跑插件。',
      );
    },
  );
}
