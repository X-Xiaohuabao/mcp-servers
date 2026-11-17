# 任务：jsdesign-bridge 设计稿桥接（插件 → MCP）

**状态**: 🟢 进行中
**集成**: jsdesign-bridge
**创建时间**: 2026-11-16
**更新时间**: 2026-11-17
**仓库**: github.com/X-Xiaohuabao/mcp-servers

---

## 📋 需求描述

把即时设计（js.design）画布数据桥接为 MCP 工具，供 AI 客户端在 UI 还原流程（ui-restore 技能「标注档」）中获取精确的设计 token（颜色/字号/间距/圆角）与节点树，替代纯 PNG 目测。

背景： 做像素级 UI 还原时缺结构化数据源（官方无 MCP，js.design 文档为纯 SPA）；社区方案 jsdesign-mcp-server（nothing-sy/js.design，MIT）已审计可用，本仓库做自研实现。

---

## 🎨 方案设计

### 架构（三件套，进程隔离决定不可合并）

```
即时设计插件（画布沙箱，唯一能看见图层树的组件）
  │ WebSocket ws://127.0.0.1:3847
  ▼
daemon（本地 Node，桥接 WS ↔ stdio）
  │ stdio JSON-RPC
  ▼
MCP server（AI 客户端拉起，暴露 get_design_tokens / export_selection 等工具）
```

### 关键决策

- **阶段 1 出口直接用 WebSocket**（不是剪贴板）：阶段 2 接 MCP 时插件零改动
- **先跑通现成方案再自研**：npm `jsdesign-mcp-server@2.0.0` + 插件市场 `JsDesign MCP Bridge`（已装 npm 包与 ZCode 配置），对照数据质量
- **兼容性红利**：即时设计官方兼容 Figma 插件代码，Figma 生态参考实现可直接用
- **开发规范（2026-11-16 定稿）**：痛点是智能体开发单文件膨胀，规范以技能 `bridge-dev` 承载（`.claude/skills/bridge-dev/SKILL.md`），核心为「职责边界为主 + 行数熔断为辅」混合方案：
  - 结构：TS 多文件 + esbuild 打包（插件沙箱无模块系统，多文件只能构建期合并）；server 内 `protocol/ ← daemon/ ← mcp/` 单向依赖；一工具一文件；入口只装配
  - 熔断线：单文件 300 行 / 单函数 50 行，触发"停下提拆分方案"而非硬拆
  - 文件职责表制度：每集成维护 `docs/structure.md`，新建文件先入表再写码
- **技术选型（2026-11-16 用户拍板）**：插件侧 TS + esbuild；server 侧 TypeScript；规范用 skills 定义（不走纯 markdown 文档）
- **样式查询设计（2026-11-16 需求分析拍板）**：
  - 表达形式：**原语 + CSS 视图双轨**——每节点 `css`（映射后 CSS 属性对象，AI 直接读用）+ `raw`（jsDesign 原语保真；vector/image fill 等 CSS 表达不了的回退兜底）
  - 查询粒度：**三段式（2026-11-17 由两段式演进，画板独立输出定稿）**——`list_frames()` 返回全文档画板清单（id/name/尺寸/页名，编排 agent 分活用）；`get_structure(frameId)` 返回单画板轻量结构树（id/name/type/尺寸/层级）；`get_node_css(nodeId)` 按 id 查单块完整样式。防单画板全量 JSON（十万字符级）撑爆 LLM 上下文；后续可选便捷档 `get_frame(frameId)` 单画板整树（超长落盘返回 path+preview）
  - 映射层位置：**server 侧**——插件只发原语快照（DesignSnapshot），MCP 工具层派生 CSS 视图；一次采集多视图按需生成，schema 演进不动插件（参考实现同路）
  - schema 归属：由本仓设计，单一事实源定稿于 `server/src/protocol/messages.ts`，消费方 ui-restore 后续对齐
  - CSS 映射规则（server 侧纯函数）：fills[SOLID]→background-color / fills[GRADIENT_*]→linear-gradient / strokes+strokeWeight→border / cornerRadius→border-radius / effects[DROP_SHADOW]→box-shadow / fontSize·fontName→font-* / lineHeight·letterSpacing→line-height·letter-spacing / layoutMode+itemSpacing+padding*→display:flex+gap+padding；不可映射项（vector path / image fill / constraints）在 css 视图给提示并依赖 raw 兜底
- **插件本体需求（2026-11-17 用户拍板，经 arch-design 流程；同日二次澄清「画板独立输出」后修订）**：
  - 触发模式 = **拉模式**（AI 请求驱动）：daemon 收 MCP 工具调用后查缓存，miss/过期才经 WS 请求插件现场采集；插件纯被动响应，全程无人工操作（用户明确否掉手动同步——「MCP 来调用，为什么还要手动」）
  - 采集与输出粒度 = **画板独立**（推翻首版「整文档全量单快照」草案）：插件响应两类采集请求——`frames.list`（遍历 `jsDesign.pages` 读画板清单，轻）与 `frame.snapshot(frameId)`（单画板整树序列化为**自包含 FrameSnapshot**，重）；**不存在整文档揉成一坨的大 JSON**，daemon 按 frameId 缓存（Map<frameId, FrameSnapshot>）
  - 消费模式 = **画板级 fan-out**（用户原话「每个画板应该是独立的输出…每个画板后续应该由独立的 agent 去处理」）：编排 agent 调 list_frames 分活，**每画板一个 subagent** 独立做 ui-restore；工具设计须**并发安全**（多 subagent 同时调用不互斥阻塞）、**画板数据自包含**（subagent 不依赖整文档上下文）
  - 面板 = **纯状态显示**（WS 连接状态 + 最近采集时间/节点数，无操作按钮）：拉模式下操作入口在 AI 侧
  - 性能风险与预案 ⚠️ TODO(实测)：单画板序列化耗时/体积未实测；画板独立采集已把风险从「整文档一次」降为「单画板一次」，剩余风险=超大单画板，预案=daemon 落盘单画板 JSON 文件返回 path+preview（参考实现实践）

---

## 🗺 阶段 1b + 1.5 实施计划（2026-11-17 定稿，writing-plans 产出）

> 依据：api-notes 实测字段结构节/实测结果表 + structure.md 职责表 + bridge-dev 规范。
> 依赖序：protocol → 构建脚手架/类型镜像 → (serialize ‖ ui ‖ 极简接收端) → main → 退役探针 → 端到端验收。
> 产物 gitignore：`plugin/dist/`。
> **进度：T-001~T-008 ✅ 全部完成并验证（2026-11-17）；T-009 待真机验收**

### T-001 定稿协议消息 schema（单一事实源）

- 目标：定义 daemon↔插件 双向消息判别联合 + FrameSnapshot/RawNode/FrameInfo 类型
- 落点：`server/src/protocol/messages.ts`（连带 server 最小脚手架：package.json + tsconfig strict）
- 依赖：无
- 要点：请求 `{type:'frames.list'|'frame.snapshot', requestId, frameId?}`；结果 `{type:'*.result', requestId, ok, frames|snapshot|error}`；RawNode 字段表照 api-notes 实测节，未测分支标 TODO(实测)；快照深度上限常量 MAX_DEPTH
- 验证：`tsc --noEmit` 通过

### T-002 plugin 构建脚手架（TS + esbuild + ui 注入）

- 目标：源码多文件 → 单产物构建链
- 落点：`plugin/package.json`（devDeps: esbuild/typescript）、`plugin/tsconfig.json`、`plugin/scripts/build.mjs`（esbuild main.ts→dist/code.js + ui.ts→dist/ui.js + 注入 ui 模板生成 ui.html）、根 .gitignore 补 dist/
- 依赖：无（与 T-001 并行）
- 要点：**ui 交付用「构建期注入内联 script」**——ui.html 引相对 js 未实测（TODO(实测)），内联 script 已实测可靠（探针面板即证）；沙箱无模块系统 → iife 格式
- 验证：`pnpm build` 产出 dist/code.js + 生成 ui.html（含内联 bundle）

### T-003 plugin 类型镜像

- 目标：插件侧消息/快照类型，与 protocol 同构
- 落点：`plugin/src/types.ts`（手抄镜像 + 注释指向 server/src/protocol/messages.ts）
- 依赖：T-001
- 验证：tsc 通过；注释含源文件路径

### T-004 serialize 纯函数 + 单测

- 目标：画板 → 自包含 FrameSnapshot 序列化器（可脱离 jsDesign 单测）
- 落点：`plugin/src/lib/serialize.ts` + `serialize.test.ts`
- 依赖：T-003
- 要点：jsDesign API 零调用（收普通对象）；字段表照实测节；undefined→null 归一；visible 节点保留但带标记；未测分支 unknown+守卫+TODO(实测)；MAX_DEPTH 截断计数
- 验证：`node --test` 过（fixture 用实测的 FRAME/TEXT/RECTANGLE 形状）

### T-005 main.ts 沙箱入口装配

- 目标：唯一 jsDesign API 边界——响应两类采集请求
- 落点：`plugin/src/main.ts`
- 依赖：T-003、T-004
- 要点：showUI + ui.onmessage 路由；frames.list 走 `jsDesign.root.children`（实测定案路径）；frame.snapshot 走 `getNodeByIdAsync(frameId)`（实测可用）+ FRAME 类型校验；错误经 postMessage 回 ui 不抛出
- 验证：构建通过；真机运行面板显示状态（暂未连 daemon 显示「未连接」）

### T-006 ui.ts + 模板（WS + 状态面板）

- 目标：iframe 侧 WS 连接/重连/请求路由 + 纯状态显示面板
- 落点：`plugin/src/ui/ui.ts` + `plugin/src/ui/template.html`
- 依赖：T-003（与 T-004/T-005 并行）
- 要点：常量集中（WS 地址、重连间隔/上限）；路由 daemon请求→main（parent.postMessage pluginMessage）、main结果→daemon（ws.send）；面板显示连接状态/最近采集帧名+节点数+时间/最近错误，无操作按钮
- 验证：构建通过（端到端在 T-009）

### T-007 探针面板退役

- 目标：手写骨架替换为构建产物
- 落点：删 `plugin/code.js`（手写）与旧探针 ui.html；manifest `main` → `dist/code.js`；structure.md 状态同步
- 依赖：T-002、T-005、T-006
- 验证：目录无手写入口残留；structure.md 与文件一致；探针源码可在 git 历史找回

### T-008 阶段 1.5 极简接收端（开发期 dev 工具）

- 目标：本地 WS 服务验证插件全链路——发请求、收快照、落盘
- 落点：`plugin/dev-receiver.mjs`（`ws` 依赖；非正式 daemon，阶段 2 被 daemon/ 替代）
- 依赖：T-001（可与 T-004 并行）
- 要点：监听 3847（占用时 EADDRINUSE 明确报错+指引关市场插件）；连接后发 frames.list → 逐画板发 frame.snapshot → 响应 JSON 写 `dev-out/`（gitignore）
- 验证：真机联调后 dev-out/ 有合法 JSON（`node -e "JSON.parse(...)"`）

### T-009 端到端验收 + 文档回填

- 目标：真实客户端全链路跑通 = 步骤 2+3 关闭
- 落点：无新码；回填 api-notes/structure.md/本台账
- 依赖：T-001~T-008
- 步骤：**先关市场 MCP Bridge 插件（3847 冲突）** → 导入新插件 → 跑 dev-receiver → 面板状态变化确认 → dev-out 快照抽查：任选 1 节点对照 Dev Mode CSS 面板人肉核（颜色/字号/位置）
- 验证：snapshot 文件节点数与画布一致；抽查节点样式无 diff；台账勾步骤 2/3

### 不确定项（不阻塞开工）

- ui.html 相对 `<script src>` 是否可用：T-002 用注入方案绕开，阶段 2 可实测后简化
- 超大画板快照的 postMessage 上限：T-009 真稿顺带观测，异常再落盘方案
- pnpm workspace 是否已含 packages/*：T-002 开工时查根 package.json，缺则补

---

## 🔍 技术调研

结论沉淀在 [api-notes.md](../../packages/jsdesign-bridge/docs/api-notes.md)：jsDesign 全局变量 / 16 种节点类型 / Paint+TextStyle+FontName+LineHeight+Effect 覆盖 token 全字段 / 开发者控制台调试 / 官方文档为纯 SPA 需人工阅读。

---

## 🎯 实现步骤

- [x] 1. 阶段 1a：开发者控制台验证 API 字段 ✅ 2026-11-17 完成（经探针面板，三批共 8 探针）
  - **结果**: 架构级探针全过，结论回填 [api-notes.md 实测结果表 + 实测字段结构节 + 遗留 TODO 清单](../../../packages/jsdesign-bridge/docs/api-notes.md)。要点：①字段表定案（颜色 0-1 浮点、null 兜底、fontWeight 不暴露）②getCSSAsync 无 → css-map 自研 ③主线程无 WebSocket → WS 落 iframe 侧 ⑥list_frames 路径定案（jsDesign.root.children）⑧iframe 三网络 API 全可用且实测连上 3847（传输实锤）
  - **遗留 → 步骤 6 闭环**: 渐变/阴影/图片/自动布局/混排文本/INSTANCE/真实画板性能等映射分支与性能项（api-notes 遗留 TODO 清单），编码走 unknown+守卫+TODO(实测)
  - **意外发现**: 3847 被参考实现 daemon 占用（联调前须关市场 MCP 插件；自研 daemon 处理 EADDRINUSE）
- [x] 2. 阶段 1b：插件本体 ✅ 2026-11-17 完成（T-001~T-007+T-009）
  - **结果**: plugin/src/ TS 五文件 + esbuild 构建链（es2017 + ui 内联注入）；serialize 单测 5/5；真机端到端验收通过（3848 端口，快照落盘内容与画布一致）
- [x] 3. 阶段 1.5：极简接收端 ✅ 2026-11-17 完成（T-008~T-009）
  - **结果**: dev-receiver.mjs 后台监听 3848 → 插件连上 → frames.json + 2 份画板快照自动落盘 dev-out/，进程正常退出
- [ ] 4. 对照现成方案数据质量（jsdesign-mcp-server 的 get_design_tokens 输出）
- [ ] 5. 阶段 2：daemon + MCP server（@modelcontextprotocol/sdk），注册 list_frames / get_structure(frameId) / get_node_css(nodeId)，daemon 按 frameId 缓存画板快照
- [ ] 6. ZCode 实测：选中画板 → AI 调工具拿 token → 对照 tokens.ts 出差异清单

---

## 🔄 当前进度

**已完成**: 3 / 6 步骤

**下一步操作**:
1. 步骤 4（可选快测）：对照现成方案数据质量——自研管线已跑通，此步降级为"可跳过"，由用户决定
2. 步骤 5：阶段 2 daemon + MCP server（三段式工具 list_frames / get_structure(frameId) / get_node_css(nodeId)，css-map 自研映射表）——先走 writing-plans 拆计划

**待决策事项**:
- [ ] npm 发包与否（自用可只留 GitHub）
- [ ] 现成方案数据质量若达标，是否推迟自研阶段 2

---

## 📁 相关文件

- `packages/jsdesign-bridge/plugin/` - 画布插件（骨架已建）
- `packages/jsdesign-bridge/docs/api-notes.md` - API 知识库（人工沉淀，持续更新）
- `packages/jsdesign-bridge/docs/structure.md` - 文件职责表（新建文件先入表再写码）
- `.zcode/skills/bridge-dev/SKILL.md` - 开发规范技能（结构约束 + 防膨胀熔断线；权威源在 .zcode，`pnpm agent:sync` 镜像到 .claude）

---

## ⚠️ 注意事项

- 官方文档为纯 SPA，机器抓不到正文；API 细节写入 api-notes.md 而非对话
- npm 包名 `jsdesign-mcp-server` 与 CLI 命令名 `jsdesign-mcp` 不同（直接运行会挂起等 stdio）
- 使用现成方案期间保持插件面板打开，全部断开空闲 15 分钟后 daemon 自动退出
- ~~沙箱主线程大概率无网络 API~~ → **2026-11-17 实测确认**：主线程 `WebSocket = undefined`（`fetch` 反而有），WS 定案落 ui.html iframe 侧；iframe 侧三 API 全可用且实测连上 3847（传输方案实锤）
- ~~端口冲突预警~~ → **2026-11-17 定案：自研桥改用 3848**，与参考实现/市场插件（3847）永久共存，无需关市场插件。真机首跑曾误连参考 daemon（3847），netstat + 参考 MCP get_connection_status 双证后换端口。dev-receiver 的 EADDRINUSE 友好报错保留（防再撞车）

---

## 💬 变更记录

### 2026-11-16
**变更类型**: 方案调整

**变更内容**:
- 编写开发规范前置：分析单文件膨胀根因（智能体最小阻力路径 + 无预声明结构 + 参考实现传染）
- 用户拍板三项：插件 TS + esbuild / server TypeScript / 规范以 skill 承载
- 产出技能 `bridge-dev`（结构约束、300/50 熔断线、职责表制度）与 `docs/structure.md` 职责表初始版
- 步骤 1b 更新为按新规范 TS 结构迁移

**影响范围**: plugin/ 后续开发走 src/ + 构建产物；server/ 骨架按职责表搭建

### 2026-11-16（第二次）
**变更类型**: 方案调整 + 仓库维护

**变更内容**:
- bridge-dev 技能扩充「TS 代码规范」：领域概念表（PluginMessage/DesignSnapshot/SnapshotCache/ToolResult）、类型设计（判别联合、禁 any、unknown+守卫收窄未实测字段）、命名、函数设计（jsDesign API 只在 main.ts）、错误处理（ToolResult 包错误、stdio 下日志必须走 stderr）、测试（node:test + 真实路径验证）
- 修正三处业务仓库残留过时项：writing-plans（任务目录按集成对齐）、exp-sediment（适用仓库/范围）、add-skill 与 exp-sediment（hook 已动态扫描，无需手动维护清单）；task-tracker 场景5 示例换为本仓语境
- 修复 scripts/sync-agent-config.mjs check 模式崩溃 bug（extra.map 把对象传 path.relative）

**影响范围**: 后续编码遵循 TS 规范；structure.md 补 mcp/types.ts

### 2026-11-16（第三次）
**变更类型**: 问题修复（规范对齐权威文档）

**变更内容**:
- 用户质询"是否参考了插件/MCP 官方文档"后核实：MCP 官方文档（concepts/tools、concepts/transports）+ 参考实现源码（dist/tools.js、schema.js、index.js）
- **修正自造错误结构**：ToolResult `{ ok, data?, error? }` → 官方约定 `{ content: TextContent[], isError?: true }`（工具错误在 result 内上报，LLM 可见可处理；参考实现 errResult 同构印证）
- 技术栈节补已验证 SDK 用法：`server.tool(name, description, zodSchema, handler)`、zod + `.describe()` 定义参数、`McpServer`/`StdioServerTransport` 导入路径、protocol/ 集中定义 WS 常量（3847 端口、空闲 15min 自退）
- 吸收参考实现实践：超长导出落盘临时文件返回 path+preview；结果带 hint 字段给 AI 下一步指引
- stderr 日志规范获官方文档与参考实现双重印证，保留

**影响范围**: bridge-dev SKILL.md（错误处理节/技术栈节/概念表）、structure.md mcp/types.ts 职责；已 pnpm agent:sync 同步镜像

### 2026-11-16（第四次）
**变更类型**: 仓库维护（新增技能）

**变更内容**:
- 新建技能 `arch-design`：需求结构化（背景/目标/约束三要素）→ 架构文档（落点：集成级 `packages/<集成名>-bridge/docs/architecture.md` / 仓库级 `docs/architecture.md` / 任务草稿）→ mermaid 架构图
- 图规则核心：文字即源码（图只存在于 ```mermaid 代码块，不提交图片文件）、一图一用途（flowchart/sequenceDiagram/stateDiagram-v2 各司其职）、图必须配紧邻文字、未实测路径虚线+TODO(实测)
- 选型 mermaid（GitHub 原生渲染 + AI 生成最稳），否决 PlantUML/D2（渲染依赖）
- 技能链路定稿：arch-design（想清楚）→ writing-plans（拆步骤）→ task-tracker（盯执行）→ bridge-dev（写代码）
- bridge-dev 的 ASCII 架构图迁为 mermaid（与新技能图规则统一）

**影响范围**: .zcode/skills/arch-design/（新增）、bridge-dev SKILL.md 架构图；已 pnpm agent:sync（7 个文件）

### 2026-11-16（第五次）
**变更类型**: 方案调整（样式查询需求分析定稿）

**变更内容**:
- 用户提出需求「读取设计稿每个块的 CSS 样式 → 特殊 JSON 格式化 → MCP → AI」，经 arch-design 流程结构化分析后澄清三决策：
  1. 表达形式 = 原语 + CSS 视图双轨（css 给 AI 直接读、raw 保真兜底）
  2. 查询粒度 = 两段式（get_structure 轻量树 + get_node_css(nodeId) 单块查询）
  3. JSON 格式由本仓设计，定稿于 protocol/messages.ts
- 关键技术事实入档：即时设计节点模型无 CSS，只有设计原语；CSS 必为派生映射（映射规则表见方案设计节），且映射有损（vector/image fill/constraints 不可映射 → raw 兜底）
- 映射层定 server 侧（插件只发原语快照），MCP 工具层派生视图
- 步骤 5 工具注册名同步更新为 get_structure / get_node_css

**影响范围**: 方案设计节、实现步骤 5、structure.md 工具文件清单（export-selection/get-design-tokens → get-structure/get-node-css + 新增 css-map）

### 2026-11-17
**变更类型**: 需求分析定稿（插件本体）

**变更内容**:
- 前置进展：manifest id 铁律实测成功（17 位纯数字），插件加载通路打通；manifest 定名 huabao-design-bridge（待提交）
- 经 arch-design 流程对插件本体做需求三要素分析，用户拍板三决策：
  1. 触发模式 = 拉模式（AI 请求驱动，插件被动响应，无手动环节）
  2. 采集范围 = 整文档全量（jsDesign.pages 所有画板；用户场景：画板按功能归类——登录/注册…，AI 按画板名自主定位）
  3. 面板 = 纯状态显示（无操作按钮）
- 记录性能风险与懒采集预案；步骤 1b 说明按三决策更新

**影响范围**: 方案设计节、实现步骤 1b；后续 writing-plans 依此拆插件开发计划

### 2026-11-17（第二次）
**变更类型**: 需求修订（画板独立输出 + agent fan-out）

**变更内容**:
- 用户二次澄清：「每个画板应该是独立的输出，不是设计稿数据集合在一起；每个画板后续由独立的 agent 处理」
- 推翻首版「整文档全量单快照」：插件改为响应两类请求——frames.list（画板清单，轻）/ frame.snapshot(frameId)（单画板自包含 FrameSnapshot，重）；不存在整文档大 JSON
- 新增消费模式决策：画板级 fan-out——编排 agent 调 list_frames 分活，每画板一个 subagent 做 ui-restore；工具须并发安全、画板数据自包含
- 工具从两段式演进为三段式：list_frames / get_structure(frameId) / get_node_css(nodeId)；get_frame(frameId) 整树便捷档列为后续可选
- 性能风险重估：从「整文档一次」降为「单画板一次」，剩余风险=超大单画板，预案=落盘 JSON 返回 path+preview
- daemon 缓存结构定为 Map<frameId, FrameSnapshot>

**影响范围**: 方案设计（查询粒度/插件本体需求）、实现步骤 1b/5；structure.md 文件职责表同步更新

### 2026-11-17（第三次）
**变更类型**: 实测进展 + 工具改进（探针面板化）

**变更内容**:
- 用户控制台实测（截图判读）：探针② `getCSSAsync = 'undefined'` → **定案 css-map 走自研映射表**；探针① 多行 IIFE 粘贴控制台失败（丢首行，仅回显 undefined）
- 应用户要求探针面板化：`plugin/code.js` + `plugin/ui.html` 升级为**探针面板**（5 按钮 + 全部执行 + 结果 textarea + 一键复制）——顺带首次实测 ui↔main 消息通道（`jsDesign.ui.onmessage` / `parent.postMessage({pluginMessage})`，即正式架构的通道模式）
- 执行方式变更：步骤 1a 首选插件面板点击执行，控制台脚本降为备用；探针② 结论回填 api-notes.md 实测结果表

**影响范围**: plugin/code.js、plugin/ui.html（重写）、structure.md 职责表、api-notes.md 探针清单节与实测结果表；步骤 1a 预期结果不变

### 2026-11-17（第四次）
**变更类型**: 里程碑（步骤 1a 完成 ✅）

**变更内容**:
- 探针面板在真实客户端全过（5/5），步骤 1a 关闭
- 关键定案：css-map 自研映射表（getCSSAsync 不存在）；WS 落 iframe 侧（主线程无 WebSocket）；get_node_css 可经 getNodeByIdAsync 直查节点；serialize 字段表以实测为准（api-notes「实测字段结构」节）
- ui↔main 消息通道（ui.onmessage / parent.postMessage pluginMessage）全链路实测通过——1b 最大未知项消除
- 遗留：探针④为极简画布数据，真实设计稿耗时/体积待复测（画板独立输出方案已定，风险仅超大单画板）

**影响范围**: 步骤 1 关闭；1b/2 的实现依据全部实测化；阶段 2 css-map 实现方式定案自研

### 2026-11-17（第五次）
**变更类型**: 里程碑（1a 正式收官，8 探针三批完成）

**变更内容**:
- 探针面板升级 v2.1（7 按钮+自动自检，⑧支持重跑）；三批实测全部完成
- 新增定案：⑥ `jsDesign.pages` 不存在，list_frames 走 `jsDesign.root.children`；⑧ iframe 三网络 API 全可用 + 实测连上 3847（WS 传输实锤）；⑦ RECTANGLE 描边最简形态实测
- **1a 关闭决策**：剩余未测项（渐变/阴影/图片填充/自动布局/混排文本/INSTANCE/真实性能）均为 css-map 映射分支细节，非架构风险——按 bridge-dev 规范 unknown+守卫+TODO(实测) 编码，转入步骤 6 真实设计稿实测闭环（api-notes 遗留 TODO 清单承载）
- 意外发现入档：3847 被参考实现 daemon 占用（端口冲突预警 + 联调前清理动作）

**影响范围**: 步骤 1 关闭（1/6）；下一步步骤 1b writing-plans 拆计划

### 2026-11-17（第六次）
**变更类型**: 计划定稿（1b+1.5 实施计划，writing-plans 产出）

**变更内容**:
- 新增「阶段 1b+1.5 实施计划」节：T-001~T-009 九任务，依赖序 protocol → 脚手架/镜像 → (serialize‖ui‖接收端) → main → 退役探针 → 端到端验收
- 关键构建决策：ui 交付用**构建期注入内联 script**（ui.html 相对 script src 未实测，内联已被探针面板实测可靠）；沙箱无模块系统 → iife
- T-008 接收端定位为 dev 工具（plugin/dev-receiver.mjs），阶段 2 被 server/daemon 替代
- 三个不确定项入档（不阻塞）：ui 相对 script / postMessage 大消息上限 / pnpm workspace 覆盖

**影响范围**: 实现步骤 2/3 改为引用 T-任务；structure.md 状态随 T-任务推进更新

### 2026-11-17（第七次）
**变更类型**: 实施进展（T-001~T-008 完成并验证）

**变更内容**:
- T-001 protocol/messages.ts + server 脚手架（strict/NodeNext，tsc 过）；T-002 构建链（esbuild iife ×2 + ui 模板内联注入生成 ui.html，构建跑通）；T-003 types.ts 镜像；T-004 serialize.ts + node:test 5/5（实测 fixture）；T-005 main.ts（root.children / getNodeByIdAsync 实测路径，pageName 经 parent 守卫读取标 TODO(实测)）；T-006 ui.ts + 模板（WS 重连退避 + 纯状态面板）；T-007 手写 code.js 退役、manifest main→dist/code.js；T-008 dev-receiver.mjs（监听跑通 + EADDRINUSE 友好报错）
- 环境事实：默认 Node 16 跑不动 pnpm/现代构建 → 全程 `PATH=/d/ProgramFiles/nvm/v22.23.3` 前缀（已入记忆）；npm install 正常
- 意外好消息：3847 空闲（参考实现 daemon 15 分钟自退已生效），T-009 无需清理
- node --test 传目录名在 win 下异常 → 改 glob 参数 `node --test "dist-test/*.test.js"`

**影响范围**: 步骤 2/3 的编码部分全部就绪；剩 T-009 真机验收（用户操作）→ 关闭步骤 2/3

### 2026-11-17（第八次）
**变更类型**: 问题修复（T-009 首导报错）

**变更内容**:
- 用户重导插件报 `Syntax error on line 13: Unexpected token {`——定位：产物第 13 行 `} catch {`（可选 catch 绑定）；**jsDesign 沙箱解析器不支持 ES2019+ 语法**（`?.`/`??` 同理，入档 api-notes「实测铁律二」）
- 修复：esbuild target es2020→**es2017**（三类语法全转译），重建后 grep 零残留 + node --check + Function 构造双重验证
- 流程教训：构建产物上沙箱前先做本地解析三件套（node --check / grep 新语法 / Function 构造），已写入铁律

**影响范围**: build.mjs target 参数；后续所有产物构建沿用 es2017

### 2026-11-17（第九次）
**变更类型**: 问题修复（误连参考 daemon）+ 端口定案

**变更内容**:
- 语法修复后用户重导插件：面板显示"已连接 daemon(3847)"但 dev-receiver 未启动——诊断：3847 被参考实现 daemon 占用（netstat LISTENING PID 4536 + 本会话 ZCode 配置的 jsdesign MCP get_connection_status 报 clientCount=1，其 client 即我们的插件），协议不匹配但 WS 握手成功导致面板误报
- **定案：WS_URL 改 ws://127.0.0.1:3848**（protocol/types/dev-receiver 三处同步），与参考实现永久共存，"联调前关市场插件"的临时方案作废
- dev-receiver 已后台监听 3848 等待插件；待用户重跑插件（加载新 ui.html）自动完成采集

**影响范围**: WS 端口常量（三处）；api-notes 探针⑧结论行、注意事项端口条目同步修订

### 2026-11-17（第十次）
**变更类型**: 里程碑（T-009 端到端验收通过 ✅，步骤 2/3 关闭）

**变更内容**:
- 用户重跑插件（3848）→ dev-receiver 自动完成采集并正常退出：frames.json（2 画板带页名/尺寸）+ 注册快照（2 节点）+ 登录快照（3 节点，含新增带描边矩形）
- 快照质量抽查通过：schema 全字段保真（0-1 浮点/null 归一/fontName/lineHeight unit/characters 完整）、nodeCount 与画布一致、truncated=false
- 新增实测：RECTANGLE 描边 strokeAlign='CENTER'（此前 FRAME 为 'INSIDE'）→ api-notes 字段结构节
- 步骤 2/3 关闭（3/6）；步骤 4（对照现成方案）降级为可选——自研管线已实证，是否跳过由用户定
- Dev Mode 对照抽查留到阶段 2 css-map 就绪后做（当前无 CSS 生产者可对照）

**影响范围**: 步骤 2/3 关闭；下一步阶段 2（daemon+MCP，writing-plans 拆计划）

### 2026-11-16（第六次）
**变更类型**: 技术调研（用户观察带来的新线索）

**变更内容**:
- 用户实测观察：客户端「开发模式」点击组件，右侧按平台显示样式代码（web/h5 为 CSS）——证实官方已内置原语→CSS 映射引擎
- 影响 1：css 视图方向获官方印证；官方面板输出可作为 css-map.ts 的对照基准（同节点 diff 即映射 bug）
- 影响 2：新增待实测捷径——Figma 有 `node.getCSSAsync()`，即时设计兼容体系下是否可用未知；若可用 css-map 可改调官方引擎
- 步骤 1a 实测清单追加 getCSSAsync 探针；api-notes.md 新增「开发模式（Dev Mode）」节

**影响范围**: api-notes.md、实现步骤 1a；阶段 2 css-map.ts 实现方式二选一（官方引擎 / 自研映射表）待实测后定
