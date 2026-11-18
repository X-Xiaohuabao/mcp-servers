/**
 * 工具 list_assets(frameId)：规则化枚举画板候选资产（位图/纯图形），替代"AI 猜哪些该切图"
 * 判定规则见 asset-scan.ts（IMAGE 填充→bitmap；纯图形节点→vector；TEXT/含文字组/装饰矩形排除）
 * 数据源：缓存快照（get_structure 先行即有）；纯枚举不导出——导出仍由 export_asset 按需执行
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { scanGraphicAssets } from '../asset-scan';
import { fail, jsonOk } from '../types';

export function registerListAssets(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'list_assets',
    '规则化枚举画板候选资产（位图图片 + 纯图形图标/插画），替代人工翻树猜哪些该切图。' +
      'bitmap 类（IMAGE 填充）用 export_asset 导原图/位图；vector 类按需导 SVG（优先组件库图标复用，库中没有的才切）；' +
      '纯色/渐变背景与文本不在清单（CSS 可还原）',
    { frameId: z.string().describe('画板 id（来自 list_frames 返回的 frameId）') },
    async ({ frameId }) => {
      const snapshot = await daemon.getSnapshot(frameId);
      if (!snapshot) {
        return fail(`画板 ${frameId} 不在缓存。请先 list_frames + get_structure(frameId) 采集后再枚举资产。`);
      }
      const assets = scanGraphicAssets(snapshot.root);
      if (assets.length === 0) {
        return fail(`画板「${snapshot.name}」未枚举到图形资产（全是文本/背景/容器）——此类元素由 CSS/DOM 直接还原，无需切图`);
      }
      const bitmapCount = assets.filter((a) => a.kind === 'bitmap').length;
      const overlapCount = assets.filter((a) => a.overlapText).length;
      return jsonOk(
        { frame: { frameId, name: snapshot.name }, total: assets.length, bitmapCount, vectorCount: assets.length - bitmapCount, assets },
        'bitmap 类逐个 export_asset（走原图字节/位图）；vector 类先用组件库图标语义匹配，库中没有的再 export_asset（SVG）；' +
          '纯色/渐变背景用 CSS 还原不切图。产物落盘路径以 export_asset 返回为准。' +
          (overlapCount > 0
            ? ` ⚠ ${overlapCount} 个 bitmap 与文本节点空间重叠（overlapText）——可能含烧死文字，勿直接当背景：改切图形子节点、文字用 HTML。`
            : ''),
      );
    },
  );
}
