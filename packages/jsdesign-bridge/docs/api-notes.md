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

## 开发模式（Dev Mode）的 CSS 面板（2026-11-16 用户实测观察）

- 客户端「开发模式」下点击组件，右侧面板按目标平台显示样式代码，**web/h5 显示的是 CSS**
- 结论 1：官方已内置「原语 → CSS」映射引擎，本仓 css 视图方向与官方一致
- 结论 2：官方面板输出可作为自研 `css-map.ts` 的**对照基准**——同一节点两边各出一份 CSS，diff 即映射 bug
- 潜在捷径 ⚠️ TODO(实测)：Figma 插件 API 有 `node.getCSSAsync()`（仅 Dev Mode 插件可用，返回 CSS 属性对象）；即时设计兼容 Figma 体系，**是否实现该 API 未知**。控制台探针：
  ```js
  const n = jsDesign.currentPage.selection[0];
  typeof n.getCSSAsync  // 'function' 则存在捷径；'undefined' 则自研映射表
  // 若存在：const css = await n.getCSSAsync(); console.log(css);
  ```
- 即使可用也要评估：官方映射面向人类开发者，字段取舍未必适合 LLM 消费（可能缺 token 语义化、多无关字段）

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

## ⚠️ 实测铁律：manifest 的 id 必须纯数字（2026-11-17 血泪验证）

**本地导入 manifest 时，id 为语义字符串会被客户端【静默拒绝】——无任何报错，导入无反应。**

实测对照（同目录同 code.js/ui.html，仅 manifest 差异）：

| id | 结果 |
|---|---|
| xiaohuabao-design-bridge（语义串） | ✗ 无反应 |
| 2611161715jsd（数字+字母混合） | ✗ 无反应 |
| 2611161715001（13位纯数字） | ✗ 无反应（当时同时改了 api/editorType，变量混杂） |
| 100000000000000001（17位纯数字，用户实测） | ✓ 成功加载 |

其它疑似雷点：name 含空格/大写未单独验证（避免混变量），建议纯小写。
校准参考：市场成熟插件 id 均为平台生成的纯数字串（如 24jy7fqbftu17848840）。

**教训：排除这类问题必须单变量对照测试，一次只改一个字段。**（本次多变量混合改了三轮，根因定位多花了 1 小时）
