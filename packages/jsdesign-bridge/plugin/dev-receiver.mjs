// 阶段 1.5 极简接收端（dev 工具，非正式 daemon——阶段 2 被 server/src/daemon 替代）
// 用途：本地起 WS 服务（ws://127.0.0.1:3848）→ 等插件连接 → 发 frames.list + 逐画板 frame.snapshot → 响应落盘 dev-out/
// 用法：PATH 前缀 node22 后 `node dev-receiver.mjs`
import { mkdirSync, writeFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';

const PORT = 3848; // 3848：避开参考实现/市场 MCP Bridge 的 3847，可共存（协议定稿见 server/src/protocol/messages.ts）
const OUT_DIR = 'dev-out';
mkdirSync(OUT_DIR, { recursive: true });

let seq = 0;

function safeName(s) {
  return s.replace(/[\\/:*?"<>|]/g, '_');
}

/** 发请求并等匹配 requestId 的结果（超时保护） */
function request(ws, payload, timeoutMs = 30000) {
  seq += 1;
  const requestId = `req-${seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时（${timeoutMs}ms）：${payload.type}`)), timeoutMs);
    const onMessage = (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || msg.requestId !== requestId) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(msg);
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ ...payload, requestId }));
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', async (ws) => {
  console.log('[dev-receiver] 插件已连接，开始采集…');
  try {
    const list = await request(ws, { type: 'frames.list' });
    if (!list.ok) throw new Error(`画板清单失败：${list.error}`);
    writeFileSync(`${OUT_DIR}/frames.json`, JSON.stringify(list.frames, null, 2));
    console.log(`[dev-receiver] 画板清单 ${list.frames.length} 个 → ${OUT_DIR}/frames.json`);

    for (const f of list.frames) {
      const snap = await request(ws, { type: 'frame.snapshot', frameId: f.frameId });
      if (!snap.ok) {
        console.warn(`[dev-receiver] ✗ 画板「${f.name}」：${snap.error}`);
        continue;
      }
      const file = `${OUT_DIR}/snapshot-${safeName(f.name)}-${safeName(f.frameId)}.json`;
      writeFileSync(file, JSON.stringify(snap.snapshot, null, 2));
      console.log(`[dev-receiver] ✓ 画板「${f.name}」 ${snap.snapshot.nodeCount} 节点 → ${file}`);
    }
    console.log('[dev-receiver] 采集完成，退出');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('[dev-receiver] 采集失败：', e instanceof Error ? e.message : e);
    process.exit(1);
  }
});

wss.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[dev-receiver] 端口 ${PORT} 被占用——多半是参考实现 daemon（市场 MCP Bridge 插件）仍在运行，请先关闭后重试。`);
    process.exit(1);
  }
  throw e;
});

console.log(`[dev-receiver] 监听 ws://127.0.0.1:${PORT} ，等待插件连接…`);
