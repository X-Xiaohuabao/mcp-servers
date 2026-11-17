/**
 * MCP server 装配：stdio 传输 + 工具清单注册（一工具一文件，此处只登记）
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DaemonHandle } from '../daemon/handle';
import { registerListFrames } from './tools/list-frames';
import { registerGetStructure } from './tools/get-structure';
import { registerGetNodeCss } from './tools/get-node-css';
import { registerExportAsset } from './tools/export-asset';
import { registerListAssets } from './tools/list-assets';

export function startMcpServer(daemon: DaemonHandle): void {
  const server = new McpServer({ name: 'jsdesign-bridge', version: '0.1.0' });
  registerListFrames(server, daemon);
  registerGetStructure(server, daemon);
  registerGetNodeCss(server, daemon);
  registerExportAsset(server, daemon);
  registerListAssets(server, daemon);
  void server.connect(new StdioServerTransport()).then(() => {
    console.error('[mcp] stdio 通道已就绪，等待 AI 客户端调用');
  });
}
