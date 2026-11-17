/**
 * mcp 层共享类型与 ToolResult 助手（官方约定：工具错误在 result 内上报而非协议级错误，LLM 才能看到）
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolResult = CallToolResult;

export const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });

export const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** 数据结果：JSON + hint（AI 下一步指引） */
export const jsonOk = (data: unknown, hint: string): ToolResult =>
  ok(`${JSON.stringify(data, null, 2)}\n\n💡 ${hint}`);

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
