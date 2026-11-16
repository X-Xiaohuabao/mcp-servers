# mcp-servers

**X-Xiaohuabao** 的 MCP 集成仓库：把各类工具（设计工具、内部系统）桥接为 MCP server，供 AI 客户端（ZCode / Claude / Cursor）作为工具调用。

## 仓库定位

- 每个集成 = `packages/<name>-bridge/` 一个自洽目录
- 一个集成的典型组成：**工具侧插件**（采集数据）+ **本地 daemon**（桥接）+ **MCP server**（stdio，暴露工具）

## 集成清单

| 集成 | 状态 | 说明 |
|---|---|---|
| [jsdesign-bridge](packages/jsdesign-bridge/) | 🟢 开发中 | 即时设计（js.design）画布插件 → MCP：导出设计稿节点树与设计 token，供 UI 还原工作流使用 |

## 使用方式（消费侧）

以 jsdesign-bridge 为例，在 AI 客户端的用户作用域配置 MCP 后即可使用，完整步骤见 [packages/jsdesign-bridge/README.md](packages/jsdesign-bridge/README.md)。

