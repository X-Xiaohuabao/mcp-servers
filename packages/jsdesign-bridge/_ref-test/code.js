// JsDesign Token Bridge - 画布侧主逻辑
// 架构：code.js（画布沙箱，唯一能读 jsDesign 图层树）⇄ jsDesign.ui.postMessage ⇄ ui.html（浏览器环境，剪贴板/阶段2 WebSocket）
// 数据 schema 与消费方 ui-restore 的 token-alignment 约定对齐，两阶段共用
// ⚠️ 字段抽取部分（标注 TODO(实测) 处）需在开发者控制台实测校正——见任务文档阶段 1a
// 参考：https://js.design/developer-doc/plugin/api/reference/intro

const WS_URL = 'ws://127.0.0.1:3847'; // 阶段 2 接入点：ui.html 直连 daemon，本文件不感知

// 显示常驻面板（manifest 声明了 ui: ui.html，必须 showUI 才会加载）
jsDesign.showUI(__html__, { width: 320, height: 360 });

/** 遍历节点树，抽取 token 相关字段（骨架：字段结构待控制台实测后校正） */
function serializeNode(node, depth) {
  const MAX_DEPTH = 8; // 防御超深树
  const data = {
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
  // TODO(实测): 阶段 1a 在开发者控制台确认以下字段的真实结构后逐项启用
  // fills: node.fills（Paint，含 color RGBA）→ colors
  // fontSize / fontName: node.fontSize / node.fontName（TextNode）→ typography
  // lineHeight / letterSpacing: node.lineHeight / node.letterSpacing
  // cornerRadius: node.cornerRadius → radius
  // effects: node.effects（Effect，阴影）→ 双端映射表输入
  if (depth < MAX_DEPTH && node.children && node.children.length > 0) {
    data.children = node.children.map((child) => serializeNode(child, depth + 1));
  }
  return data;
}

/** 响应面板的导出请求：读选中 → 序列化 → 回传 ui.html */
jsDesign.ui.onmessage = (msg) => {
  if (msg.type !== 'export-selection') return;
  const selection = jsDesign.currentPage.selection;
  if (!selection || selection.length === 0) {
    jsDesign.ui.postMessage({ type: 'export-result', error: '未选中节点：请先在画布选中目标画板' });
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'jsdesign-token-bridge',
    count: selection.length,
    nodes: selection.map((node) => serializeNode(node, 0)),
  };
  // 阶段 2 接入点：ui.html 收到此消息后改为经 WebSocket 发往 daemon（ws://127.0.0.1:3847）
  jsDesign.ui.postMessage({ type: 'export-result', payload, count: payload.count });
};
