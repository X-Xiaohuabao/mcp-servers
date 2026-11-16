# 即时设计插件 API 笔记

> 来源：官方文档 https://js.design/developer-doc/plugin/api/reference/intro（纯 SPA，机器不可抓取，本文为人工阅读沉淀）+ 参考实现 [nothing-sy/js.design](https://github.com/nothing-sy/js.design)（MIT）。
> 更新时间：2026-11-16

## 核心事实

- **全局变量 `jsDesign`**：插件内访问大多数 API 的入口，支持节点增删改查、访问当前选中（`jsDesign.currentPage.selection`）、打开模态、`jsDesign.closePlugin()` 等
- **兼容 Figma 插件**：官方原文「即时设计同时兼容 Figma 插件，可以直接导入 Figma 插件代码运行」——Figma 生态教程与开源实现可直接参考。区分运行环境的惯用写法：
  ```js
  // Code 侧
  let isJsDesign = false;
  try { if (jsDesign) { isJsDesign = true; } } catch { isJsDesign = false; }
  ```
- **调试**：即时设计客户端 →「插件 → 开发者 → 控制台」打开开发者工具，可直接用 `jsDesign` 全局对象试 API（阶段 1 的控制台验证走这条路径）
- **插件构成**：`manifest.json`（声明）+ `code.js`（画布侧逻辑）+ `ui.html`（可选面板）；manifest 支持多 UI 文件（`ui: { main, secondary }`），代码里经 `jsDesign.showUI(__uiFiles__.main)` 打开

## 节点类型（与 Figma 节点模型一致）

DocumentNode / PageNode / FrameNode / GroupNode / RectangleNode / EllipseNode / LineNode / PolygonNode / StarNode / TextNode / SliceNode / VectorNode / BooleanOperationNode / ComponentNode / InstanceNode / ComponentSetNode

## 样式相关 API（设计 token 提取所需）

| API | 用途 | 对应 token 字段 |
|---|---|---|
| `Paint`（填充） | 颜色（RGB/RGBA） | `colors.*` |
| `TextStyle` / `FontName` | 字号、字重、字体族 | `typography.*` / `font.*` |
| `LineHeight` / `LetterSpacing` | 行高、字间距 | 行高（tokens 缺，待设计确认项） |
| `Effect` | 阴影/模糊 | 双端映射表（rn↔harmony） |
| `ExportSettings` | 切图导出 | 图标/图片资产 |

## 参考实现（nothing-sy/js.design，MIT）规模

| 组件 | 文件 | 体量 |
|---|---|---|
| 画布插件 | manifest.json（147B）+ code.js（26.6KB）+ ui.html（5.8KB） | ~33KB |
| daemon + MCP | bridge.js / tools.js / index.js / agent-client.js / schema.js | ~34KB |

工具清单（可对照自研）：`get_connection_status`、`list_top_frames`、`export_selection`（含切图）、`export_node`、`export_assets`、`get_design_tokens`

## MCP 插件市场备选（2026-11-16 截图普查）

| 插件 | 开发者 | 安装量 | 备注 |
|---|---|---|---|
| JsDesign MCP Bridge | nothing | 393 | 本笔记主参考（源码已审计） |
| 九匠即时MCP | TONE-LYLE | 1655 | 安装量最高，未审计 |
| MCP Bridge — AI 设计助手 | wang | 406 | 读写画板，未审计 |
| jsdesign-mcp | DG | 920 | 未审计 |
| Refore Talk to Design MCP | ReforeAI | 364 | 设计稿→代码全家桶，与我们 ui-restore 定位重叠 |

## 已知限制

- 官方文档站为纯客户端渲染 SPA：WebFetch / web reader / 搜索引擎缓存均拿不到正文，只能浏览器阅读
- npm 全局包的 CLI 命令名与包名不同：包 `jsdesign-mcp-server`，命令 `jsdesign-mcp`（直接运行会以 stdio 模式挂起等输入，不是 bug）
