# JsDesign Bridge 接入指南

把即时设计（js.design）画布数据桥接为 MCP 工具，供 AI 客户端（ZCode / Cursor / Claude）调用。

## 组件

```
即时设计插件（plugin/）──WebSocket ws://127.0.0.1:3847──► daemon ──stdio──► MCP server（server/）
```

## 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1a | 开发者控制台验证 API 字段（`jsDesign.currentPage.selection` 等） | 🔲 |
| 1b | 插件本体：选中节点 → 序列化 JSON（WebSocket 出口预留） | 🔲 骨架已建 |
| 1.5 | 极简接收端：WS 收到的 JSON 落盘验证 | 🔲 |
| 2 | daemon + MCP server（stdio），插件零改动 | 🔲 |

先跑通**现成方案**对照数据质量：npm 全局装 `jsdesign-mcp-server@2.0.0` + 插件市场装 `JsDesign MCP Bridge`（开发者 nothing），见主仓库外 [mcp-setup 文档](../../../README.md)。

## 插件加载（开发者模式）

1. 即时设计客户端 →「插件 → 开发者 → 导入插件」
2. 选择 `plugin/manifest.json`
3. 运行；调试用「插件 → 开发者 → 控制台」（`jsDesign` 全局对象可用）

## API 知识库

见 [api-notes.md](api-notes.md)——官方文档为 SPA 机器不可抓取，此文件为人工阅读沉淀，**更新它**而不是散落在对话里。
