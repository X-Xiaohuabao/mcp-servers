// MCP stdio 握手冒烟：spawn dist/index.js → initialize → tools/list，打印客户端视角的工具清单
// 用途：不动 AI 客户端就能验证产物是否为合法 MCP server（T-015 类联调的前置自检）
// 用法：JSDESIGN_BRIDGE_PORT=1199 node scripts/mcp-smoke.mjs （换端口避免与运行中的实例撞车）
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});

let stderrBuf = '';
child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

const rpc = (id, method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');

const waitMessage = (matchId, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时等待 id=${matchId}`)), timeoutMs);
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === matchId) { clearTimeout(timer); resolve(msg); return; }
        } catch { /* 非整行 JSON 忽略 */ }
      }
    });
  });

try {
  rpc(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '0.0.1' },
  });
  const init = await waitMessage(1);
  console.log('[smoke] initialize ✓ serverInfo:', JSON.stringify(init.result?.serverInfo));
  rpc(2, 'notifications/initialized');
  rpc(3, 'tools/list');
  const tools = await waitMessage(3);
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  console.log('[smoke] tools/list ✓ 工具:', names.length ? names.join(', ') : '（空！）');
  if (names.length === 0) process.exitCode = 1;
} catch (e) {
  console.error('[smoke] 握手失败：', e.message);
  console.error('[smoke] server stderr 尾部：', stderrBuf.slice(-500));
  process.exitCode = 1;
} finally {
  child.kill();
}
