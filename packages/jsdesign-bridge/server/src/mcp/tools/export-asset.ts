/**
 * 工具 export_asset(nodeId, {format, scale})：切图导出并落盘，返回文件路径（字节不进 AI 上下文）
 * 格式决策：auto=矢量节点→SVG、IMAGE 填充→原图字节（探针⑩ TODO 实测）；svg/png/jpg 直出
 * 产物落 JSDESIGN_BRIDGE_ASSETS_DIR（默认 tmpdir/jsdesign-bridge-assets）；AI 自行拷贝到消费工程
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonHandle } from '../../daemon/handle';
import { fail, jsonOk } from '../types';

/** 单文件落盘上限（base64 解码后字节数）；超限视为误操作（如导出整屏），提示调低 scale/改选子节点 */
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/** 节点名 → 安全文件段（保留中文；去路径敏感字符与空白） */
function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'node';
}

export function registerExportAsset(server: McpServer, daemon: DaemonHandle): void {
  server.tool(
    'export_asset',
    '切图导出：矢量图标默认 SVG（fill 可被 CSS 覆盖）；IMAGE 填充默认原图字节（imageHash 直取，最高保真）；位图 PNG/JPG 按 scale 导出。' +
      '产物落盘后仅返回文件路径（不占上下文），建议传 dir 直接落到应用工程内的临时目录，工程内直接引用',
    {
      nodeId: z.string().describe('节点 id（来自 get_structure 返回的树，图标/图片节点）'),
      format: z.enum(['auto', 'svg', 'png', 'jpg', 'original']).default('auto')
        .describe('auto=按节点自动选（IMAGE 填充→原图字节，其余→SVG）；original=原图字节；png/jpg 可配 scale'),
      scale: z.number().min(1).max(4).default(2).describe('位图导出倍率（仅 png/jpg 生效；默认 2x）'),
      dir: z.string().optional().describe('落盘目录（应用工程内的临时目录，相对当前工程根或绝对路径）。不传依次回退：JSDESIGN_BRIDGE_ASSETS_DIR 环境变量 → <工作目录>/jsdesign-assets。多工程环境建议每次显式传'),
    },
    async ({ nodeId, format, scale, dir }) => {
      let result;
      try {
        result = await daemon.request({ type: 'asset.export', nodeId, format, scale });
      } catch (e) {
        return fail(`${(e instanceof Error ? e.message : String(e))}\n\n💡 请确认即时设计客户端已打开且插件面板运行中（ws 连接在位）`);
      }
      if (result.type !== 'asset.export.result') {
        return fail(`意外响应：${result.type}（预期 asset.export.result）`);
      }
      if (!result.ok) {
        return fail(`${result.error}\n\n💡 format 也可显式指定：svg（矢量图标）/ png（位图，配 scale）/ jpg`);
      }
      const bytes = Buffer.from(result.base64, 'base64');
      if (bytes.length > MAX_ASSET_BYTES) {
        return fail(`产物 ${(bytes.length / 1024 / 1024).toFixed(1)}MB 超上限 8MB——请调低 scale（位图）或改选更小子节点（图标）`);
      }
      const ext = result.ext === 'bin' ? 'bin' : result.ext;
      // 优先级：调用参数 dir（应用工程内临时目录）> 环境变量 > 默认 <工作目录>/jsdesign-assets（不再落用户个人 tmpdir）
      const targetDir = dir
        ? path.resolve(process.cwd(), dir)
        : (process.env.JSDESIGN_BRIDGE_ASSETS_DIR || path.join(process.cwd(), 'jsdesign-assets'));
      fs.mkdirSync(targetDir, { recursive: true });
      const fileName = `${safeName(result.nodeName)}-${nodeId.replace(/[:/]/g, '_')}.${ext}`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, bytes);
      return jsonOk(
        {
          path: filePath,
          bytes: bytes.length,
          ext,
          format: result.format,
          note: result.note,
          node: { nodeId, name: result.nodeName, type: result.nodeType },
        },
        ext === 'svg'
          ? '矢量 SVG：拷贝到消费工程引用；fill 属性可被 CSS 覆盖（hover 变色无需重新切图）。'
          : `位图/原图：拷贝到消费工程 public 目录后以 <img> 引用（${bytes.length} 字节，已落盘不占上下文）。`,
      );
    },
  );
}
