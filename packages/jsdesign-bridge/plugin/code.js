// JsDesign Token Bridge - 画布侧主逻辑（骨架）
// 目标：读取当前选中节点树 → 序列化为 token 对齐 JSON → 经 WebSocket 发往本地 daemon（阶段 2）
// 阶段 1 现状：仅实现「遍历选中节点 → 控制台输出 JSON」，字段抽取逻辑待控制台实测后补齐
// ⚠️ 本文件为未验证骨架：API 调用需先在「插件 → 开发者 → 控制台」用 jsDesign 全局对象实测
// 参考：https://js.design/developer-doc/plugin/api/reference/intro

// 数据 schema（与消费方 ui-restore 的 token-alignment 约定对齐，两阶段共用）
// 节点字段：name / type / x / y / width / height / fills / fontSize / fontName /
//           lineHeight / letterSpacing / cornerRadius / effects / children

const WS_URL = 'ws://127.0.0.1:3847';

/** 遍历节点树，抽取 token 相关字段（骨架：字段名待控制台实测校正） */
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
  // TODO(阶段1a): 控制台实测以下字段的实际结构后启用
  // fills: node.fills（Paint，含 color RGBA）
  // fontSize / fontName: node.fontSize / node.fontName（TextNode）
  // lineHeight / letterSpacing: node.lineHeight / node.letterSpacing
  // cornerRadius: node.cornerRadius
  // effects: node.effects（Effect，阴影）
  if (depth < MAX_DEPTH && node.children) {
    data.children = node.children.map((child) => serializeNode(child, depth + 1));
  }
  return data;
}

function main() {
  const selection = jsDesign.currentPage.selection;
  if (!selection || selection.length === 0) {
    console.log('未选中节点：请先在画布选中目标画板');
    jsDesign.closePlugin();
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'jsdesign-token-bridge',
    nodes: selection.map((node) => serializeNode(node, 0)),
  };
  console.log(JSON.stringify(payload, null, 2));
  // 阶段 2 接入点：此处替换为 WebSocket 发送（ws://127.0.0.1:3847）
  // 阶段 1 验证方式：控制台人工复制输出
  jsDesign.closePlugin();
}

main();
