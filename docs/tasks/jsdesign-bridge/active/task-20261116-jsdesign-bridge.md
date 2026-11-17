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

## 🗺 阶段 2 实施计划（2026-11-17 定稿，writing-plans 产出）

> 目标：AI 客户端经 stdio MCP 直接调三段式工具。依赖方向（bridge-dev）：protocol ← daemon ← mcp ← index 装配。
> 产物 gitignore：`server/dist/`（根 .gitignore 已覆盖）。server 日志一律 stderr（stdio 协议保护）。
> **进度：T-010~T-014 ✅ 完成并验证（2026-11-17）；T-015 配置已写入 `.zcode/config.json`，待新会话真机联调**

**实现偏差与坑（相对计划，均已在代码注释说明）**：
- 空闲自退取消：daemon 内嵌于 MCP 进程（非参考实现的独立进程），插件空闲自退会误杀仍在服务的 MCP 会话——生命周期改为跟 stdio（客户端断开即整体退出，冒烟实测联动生效）
- zod 锁 v3：SDK 1.32 的 tool 重载按 zod3 类型（ZodRawShapeCompat），v4 类型不兼容
- esbuild ESM 产物需 createRequire banner（依赖包 CJS require Node 内置模块），否则启动即 throw
- 工作区级 MCP 配置：`.zcode/config.json` 嵌套 `mcp.servers` 键（非顶层 mcpServers）；路径用正斜杠规避 shell→JS 双层转义；工作区级 server 会话启动自动连接
- 端口 3848 → **1120（用户指定，最终定案）**：三处常量同步（protocol / types 镜像 / dev-receiver），daemon 侧 PORT 改为从 WS_URL 推导（单一来源）；双侧产物已重建并验证（ui.html/dist 全 1120，daemon 冒烟监听 1120）

### T-010 daemon：WS 服务 + 快照缓存

- 目标：3848 监听、连接管理、`Map<frameId, FrameSnapshot>` 缓存 + 画板清单缓存 + 节点索引（nodeId→{snapshot,node}）、全断开空闲 15min 自退、EADDRINUSE 友好报错、日志全 stderr
- 落点：`server/src/daemon/ws.ts`、`server/src/daemon/cache.ts`（含 devDeps：ws）
- 依赖：无（protocol 已就绪）
- 验证：真机——起 daemon 后插件面板变"已连接"，日志见连接

### T-011 css-map：原语 → CSS 纯函数

- 目标：RawNode → css 属性对象（照实测表）：fills[SOLID]→background-color(+opacity)、strokes+strokeWeight+strokeAlign→border、cornerRadius/rectangleCornerRadii→border-radius、effects[DROP_SHADOW]→box-shadow、fontSize/fontName→font-*（fontWeight 从 style 推导映射表）、lineHeight/letterSpacing（AUTO 不换算，标 note）、layoutMode+itemSpacing+padding*→display:flex+gap+padding、x/y/w/h→position:absolute+left/top、opacity/text-align 系
- 落点：`server/src/mcp/css-map.ts` + `css-map.test.ts`（node:test，实测 fixture）
- 依赖：无（吃 protocol 类型）
- 验证：单测过；不可映射项（GRADIENT/IMAGE/混排等未测分支）按 TODO(实测) 输出 note 不臆造
- 备注：官方 Dev Mode 输出为对照基准（阶段后抽样 diff）

### T-012 MCP 工具：list_frames + get_structure

- 目标：两工具 handler——缓存优先，miss 时经 daemon 向插件实发请求（requestId 路由等待结果），断连返回 isError + 指引
- 落点：`server/src/mcp/tools/list-frames.ts`、`get-structure.ts`（zod schema .describe()）
- 依赖：T-010
- 验证：typecheck；真机在 T-015
- 备注：ToolResult 用官方 `{ content, isError? }`；结果带 hint 给 AI 下一步指引

### T-013 MCP 工具：get_node_css

- 目标：nodeId → 缓存节点索引查找 → `{ css, raw, note? }` 双轨返回；未命中 isError + 指引（先 list_frames）
- 落点：`server/src/mcp/tools/get-node-css.ts`
- 依赖：T-010、T-011
- 验证：typecheck；真机在 T-015
- 备注：不新增插件消息（v1 只查缓存画板，协议零改动）

### T-014 装配 + 构建

- 目标：index.ts 纯装配（拉 daemon + stdio MCP）；stdin 关闭即退出；esbuild 打包单产物 dist/index.js
- 落点：`server/src/index.ts`、`server/src/mcp/index.ts`、`server/scripts/build.mjs`（新文件先入职责表）、package.json 补 build 脚本与依赖（@modelcontextprotocol/sdk/zod/ws）
- 依赖：T-010~T-013
- 验证：构建跑通 + dist/index.js 可被 node22 执行（stdio 挂起等待即正确形态）

### T-015 真机联调（步骤 5 关闭）

- 目标：AI 客户端真实调用三工具
- 步骤：客户端 MCP 配置加 jsdesign-bridge server（**command 用 node22 绝对路径**——默认 node16 跑不动 SDK，参考 [[windows-node-build-path]]）→ 重启客户端 → AI 调 list_frames → get_structure(登录 frameId) → get_node_css(文本节点 id) → 对照画布
- 验证：三工具真实返回数据且与画布一致；插件面板状态"已连接"稳定
- 备注：ZCode MCP 配置落点遵循 zcode-configuration-guide；消费侧（ui-restore）引用后续再对齐

### T-016 文档回填

- 目标：structure.md 状态、README 进度、api-notes（css-map 对照结论）、台账步骤 5 勾选、步骤 4 处置确认（建议跳过，自研已实证）
- 依赖：T-015

### 不确定项（不阻塞）

- lineHeight AUTO 换算公式未知：v1 输出 note + raw 保真，真稿多采样后再定
- 官方 Dev Mode CSS 对照 diff：css-map 就绪后抽 3~5 节点人肉比（用户配合）
- SDK stdio 下 spawn daemon 的进程树清理（客户端断开时 daemon 退出路径）：T-014 用 stdin 关闭联动解决

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

**已完成**: 4 / 6 步骤

**下一步操作**:
1. 步骤 4 降级为可选（自研管线已实证，是否补测由用户定）
2. ~~按「阶段 2 实施计划」开工 T-010（daemon）+ T-011（css-map，可并行）~~ → **2026-11-17 T-010~T-014 完成**：daemon + 三工具代码就绪，dist 构建通过，真实 stdio 握手 tools/list 返回三工具（list_frames / get_structure / get_node_css）
3. ~~待用户重启 ZCode 会话真调三工具~~ → **2026-11-17 步骤 5 关闭**：「测试 js design」会话真实 MCP 链路三工具全过（变更记录第十二次）
4. 下一步候选：「登录」画板 (0:1) 复验一轮 / 步骤 6 真实设计稿（货场管理系统）实测闭环 / Dev Mode 对照抽查（css-map 已就绪可做）

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
- ~~端口冲突预警~~ → **2026-11-17 定案：自研桥改用独立端口，最终定为 1120（用户指定）**，与参考实现/市场插件（3847）永久共存，无需关市场插件。真机首跑曾误连参考 daemon（3847），netstat + 参考 MCP get_connection_status 双证后换端口；daemon 侧 PORT 从 WS_URL 推导（单一来源）。dev-receiver 的 EADDRINUSE 友好报错保留（防再撞车）
- **daemon 单实例 = MCP 工具单会话可用**（2026-11-17 实证）：daemon 内嵌于 MCP server 进程，EADDRINUSE 直接 exit(1)——多个 ZCode 会话都注册了 jsdesign-bridge 时，只有抢到 1120 的那一个有工具，其余会话静默无工具。换会话用工具前先关旧会话（其 MCP server 随 stdio 断开自退，端口自动释放）；插件面板有 scheduleReconnect，daemon 换主后自动重连

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

### 2026-11-17（第十一次）
**变更类型**: 问题诊断 + 修复（MCP 工具在新会话不可见）

**变更内容**:
- 现象：新会话工具列表无任何 `jsdesign-bridge` 工具；用户级 `~/.zcode/cli/config.json` 注册核查无误（stdio schema 合规、`dist/index.js` 在、绝对路径 node 22）
- 诊断链：终端实跑 server 握手 → `[daemon] 端口 1120 被占用`（EADDRINUSE exit(1)，MCP server 起不来所以工具未注册）→ netstat：LISTENING 1120 = node PID 28736，父进程为 ZCode 桌面端，14:42:32 拉起，且 `即时设计.exe` 已与其建立 ESTABLISHED——**另一个 ZCode 会话先启动、其 MCP server 抢到 daemon 端口**（单实例互斥），本会话（14:46 启动）绑定失败被静默淘汰
- 排查中 28736 已自行退出（属主会话关闭），端口释放
- 顺手修复：ws.ts EADDRINUSE 文案硬编码旧端口"3848/3847"，排查时被误导去找 PID 3848 → 改为引用实际 PORT 并写明真实原因（另一会话的 MCP server 持有）；重建 dist
- 端到端复验通过：真实 stdio 握手 initialize 响应 + tools/list 返回三工具（list_frames / get_structure / get_node_css），stdin 断开干净自退、端口二次释放
- 设计约束已写入「注意事项」：daemon 单实例 ⇒ 工具单会话可用；多会话互斥不是 bug 是当前架构的固有行为

**影响范围**: server/src/daemon/ws.ts（日志文案）；dist 重建；待用户重启会话后真调三工具（阶段 2 验收项）

### 2026-11-17（第十二次）
**变更类型**: 里程碑（步骤 5 真机验收通过 ✅，进度 4/6）

**变更内容**:
- 「测试 js design」会话经真实 MCP 客户端链路（ZCode → daemon → 插件 → JSDesign API）三工具全过：list_frames 返回 注册(5:1) / 登录(0:1) 两画板（均 1440×1024）；get_structure 注册画板轻量树含 TEXT「注册页面」(5:4)；get_node_css css + raw 双轨齐全、notes 如实标注未实测项
- 输出质量抽查（节点 5:4）：css 轨可直接还原（left: 484px / top: 460px / background-color: rgb(0,199,186) / font-size: 72px / font-family: SourceHanSansCN）；raw 轨 characters 等原始字段完整；lineHeight AUTO 未换算符合「未实测不输出」铁律，原始值 raw.lineHeight 可查
- 该会话 daemon 抢占成功、未复现「会话无工具」——与第十一次诊断互证：**端口空闲即可用，多会话竞争才有输家**
- 注意：该会话现持有 1120，其他会话要用工具仍受 daemon 单实例约束（见注意事项）

**影响范围**: 步骤 5 关闭（4/6）；阶段 2 验收完成；下一步步骤 6 真实设计稿闭环

### 2026-11-17（第十三次）
**变更类型**: 设计定案 + 实施（get_node_css 去定位）+ 并行编辑事故记录

**变更内容**:
- 用户定案：**css 轨不输出任何定位属性（position/left/top）**——画板坐标套进文档流会错位；坐标保真在 raw.x/raw.y（相对父容器），像素级还原由消费方自行取用；文档流布局（flex/gap/margin）由 AI 结合 get_structure 兄弟节点关系推导
- 实施：css-map.ts `nodeToCss` 移除定位输出（头注释同步定案依据）；get-node-css.ts 工具描述与叶子 hint 改写（明示 css 不含定位、坐标去 raw、布局按结构推导勿用画板坐标）；测试断言反向锁定（position/left/top 必须为 undefined）防回归。node --test 7/7、dist 重建、`JSDESIGN_BRIDGE_PORT=1199` 换端口完整握手三工具齐全（1120 被活会话占用，换端口验证互不干扰）
- ⚠ 事故：本会话与「测试 js design」会话**并行编辑同一 css-map.ts / css-map.test.ts**（对方同期落地 TEXT fills→color 的 mapFills 改进）——交错中间态编译出的 bundle 调用 `mapBackground` 而定义已是 `mapFills`，node --test 首跑 1/7 过 6 崩；重读双方改动确认已自然合流（去定位 + mapFills 共存、双方测试断言共存），重编译后 7/7 全过。**教训：同一集成包源码同时只允许一个会话在改，并行会话动码前先对齐分工**
- ⚠ 消费方契约变更待同步（AGENTS.md 约定）：css 轨不再含 position/left/top；TEXT 文字色由 background-color 改为输出 color——ui-restore 侧文档/还原提示词需同步
- 注：「测试 js design」会话的运行中 server 仍是旧代码（进程启动时加载），需重开其 MCP 开关（或新会话）才能体现「去定位 + TEXT color」新行为

**影响范围**: server/src/mcp/css-map.ts、tools/get-node-css.ts、css-map.test.ts；dist 重建；消费方文档待同步

### 2026-11-17（第十四次）
**变更类型**: 技术突破（探针⑨ exportAsync 实测通过）+ 探针面板化实施

**变更内容**:
- 背景：用户持续担忧自研映射会出错（"为什么不直接用右侧面板的 CSS"），两轮应对——①API 全表面审查（官方类型包 @jsdesigndeveloper/plugin-typings@1.0.12 全 1194 行）：CSS 生成接口彻底不存在（类型层+探针②运行时双证），自研定案维持；②**发现 exportAsync**（PNG/JPG/SVG/PDF，官方渲染引擎输出）→ 探针⑨
- 探针⑨面板化：用户控制台找沙箱上下文失败（top 上下文无 jsDesign 全局）→ 按用户要求做进插件 UI——ui↔main 本地通道 probe.export（types.ts ProbeExportRequest/Result + main.ts onProbeExport + ui.ts 按钮渲染 + template 探针区，面板 320×360），真机两次回跑定案
- **实测结论（真稿 VECTOR「矩形备份 8」）**：`exportAsync = function`，SVG 1545B / PNG×2 33919B 双成功；SVG 值与 Dev Mode 面板逐项一致——fill #F7FAFD=rgba(247,250,253)、描边转 evenodd 路径环（stroke 色在 fill）、feGaussianBlur stdDeviation 7.5×2=blur 15px、feColorMatrix 系数×255=阴影 RGB、**filter id 嵌节点 id（filter_35_279 ← 35:279）→ 节点级关联可行**
- 新铁律三（api-notes）：沙箱节点内部方法不可摘下裸调用（丢 this → `Expected node, got undefined`），必须 `.call(node,…)`——首跑踩坑即此，已修
- **架构意义：对照基准从"人眼抄面板"升级为"程序化 diff 官方 SVG"**——用户"映射会出错"的担忧有了自动化解法；硬分支（渐变/阴影/复杂矢量）可解析官方 SVG 兜底；PNG 切图可用。换算公式沉淀 api-notes「SVG 对照换算公式」节
- 遗留：`svgOutlineText:false` 时 `<text>` 形态未独立验证（本跑节点无文本）；大节点耗时未测；svgIdAttribute 对 path 元素的作用未确认（本跑只见 filter id 嵌 id）

**影响范围**: plugin/src（main/ui/types/template/env 五文件，探针本地通道）；api-notes（类型包审查 + 探针⑨ + 铁律三 + 换算公式）；structure.md 职责表；下一步步骤 6 的对照抽查可升级为 SVG 程序化 diff（是否先建 diff 工具由用户定）

### 2026-11-17（第十五次）
**变更类型**: 新功能实施（export_asset 切图工具，三工具 → 四工具）

**变更内容**:
- 用户提问"切图标/图片怎么弄"→ 设计定案 + 用户拍板"现在就建"
- **格式决策树**（auto 默认）：fills 含可见 IMAGE → original（imageHash → getImageByHash → getBytesAsync 原图字节，类型包实证接口存在、运行时探针⑩ TODO，全守卫失败即提示改用 png）；否则 → svg（矢量图标，fill 可被 CSS 覆盖）；png/jpg 显式指定 + scale 1-4（默认 2）
- 实施：①protocol/messages.ts 加 asset.export 请求/结果（AssetFormat 判别 + base64 过 WS JSON 帧）；②plugin types.ts 镜像同步；③**新文件 lib/asset-bytes.ts**（bytesToBase64 纯 JS 实现——沙箱无 Buffer、btoa 未实测不引入；detectImageExt 魔数 JPEG SOI/PNG 签名）+ 单测 3/3（Node Buffer 对照 oracle，补位边界 0/1/2/3）；④main.ts onAssetExport（getNodeByIdAsync 直查 → 决策树 → exporter.call(node) this 绑定铁律 → base64 回传）；⑤ui.ts 双向路由（面板状态行，字节不进面板）；⑥**新文件 server tools/export-asset.ts**：8MB 护栏、落盘 JSDESIGN_BRIDGE_ASSETS_DIR（默认 tmpdir/jsdesign-bridge-assets，env 可覆盖）、**仅返回 path+元信息不进上下文**（bridge-dev 长产物铁律）、hint 指引拷贝到消费工程
- 验证：双端 tsc 0 错、插件 node:test 8/8（新增 3）、沙箱三件套零残留、双端构建绿、换端口 1199 冒烟 **tools/list 四工具齐全**（list_frames/get_structure/get_node_css/export_asset）
- 职责表新增 3 行（asset-bytes.ts/.test.ts/export-asset.ts）+ protocol/serialize 行职责更新

**影响范围**: protocol 契约扩展（消费方 breaking change 检查：ui-restore 未引用 WS 层，MCP 工具层为新增非破坏）；待真机回填：①用户重载插件后在持有 daemon 会话实测 export_asset 全链路；②探针⑩（original 路径 getImageByHash/getBytesAsync 运行时验证，守卫已内置，失败自动降级提示）

### 2026-11-17（第十六次）
**变更类型**: 里程碑（探针⑩通过 ✅ + export_asset 真实稿全链路验收通过）

**变更内容**:
- 本会话持有 daemon（1120），真实 MCP 链路逐级实测：list_frames 返回 19 画板（货场管理系统真实稿）→ get_structure 两画板（多云图标 43:6 / 车辆管理 8:1）→ export_asset 共 9 次调用
- **探针⑩关闭**：IMAGE fill 节点（7:6 truck png）auto 决策正确走 original，`imageHash→getImageByHash→getBytesAsync` 运行时实证通过，1,088,044 字节原图完整落盘；8:125 显式 original 1,357,569 字节同过；魔数核验 `89504e47+IHDR` = PNG 原图，detectImageExt 正确
- **全格式覆盖**：auto→svg / svg / png(scale 2/4) / jpg 全落盘且魔数正确；画板级（43:6）、布尔运算节点（43:8）、最简 ELLIPSE（43:7）三级节点全过；坏 nodeId → isError 友好提示无堆栈泄漏
- **意外收获**：①1.36MB 字节→base64 约 1.8MB 经 iframe→main→WS→daemon 无截断——遗留 TODO「postMessage 大消息上限」1.8MB 级间接实证；②SVG 尺寸=内容包围盒非画板尺寸（多云 49×49 → SVG 58×49.5，画板未裁剪时子元素溢出）；③渐变 fill SVG 形态（linearGradient + id 嵌节点 id）补 GRADIENT 分支参考
- 结论回填 [api-notes.md「export_asset 真实稿全链路实测」节](../../../packages/jsdesign-bridge/docs/api-notes.md) + 遗留 TODO 清单两条更新（IMAGE 导出路径已通 / postMessage 1.8MB 级已证）

**影响范围**: 第十五次的两项待真机回填全部关闭；切图能力就绪，步骤 6（真实设计稿 ui-restore 闭环）可消费；遗留仅剩 IMAGE paint 原语字段结构 dump（css-map note 分支细化用，不阻塞）

### 2026-11-17（第十七次）
**变更类型**: 架构改造（阶段 3 提前启动：daemon 独立单例化，跨会话并行达成）

**变更内容**:
- 导火索：多会话端口互斥第三次踩坑（15:49 旧会话 server 占 1120，新会话无工具）→ 用户确认真实需求是**跨会话并行**（A 会话处理 B 画板、D 会话处理 D 画板，独立对话同时干活）→ 拍板立即改造（阶段 3 提前）
- **新架构**：daemon 独立单例进程（唯一监听 1120，持缓存与插件连接，空闲自退 15min——无插件且无客户端才退，会话闲置不误杀）；每会话 MCP server 改 WS 客户端（?role=client）接入，不再监听端口——**多会话天然并存，端口抢占从根上消除**
- 实施：①protocol 新增 client↔daemon 通道（cache.getFrameInfos/getSnapshot/findNode RPC + tool.request/tool.result，requestId 内部重写 `req:conn:seq` 按前缀路由回发起客户端）；②daemon 拆四件——handle.ts（接口）/ server.ts（双角色监听+转发路由+30s 超时合成错误）/ client.ts（连接失败自动 spawn dist/daemon.js detached + 重试 ~10s）/ main.ts（独立入口）；③build.mjs 双入口（dist/index.js + dist/daemon.js）；④四工具 cache 进程内读改异步 RPC、index.ts 客户端化；⑤旧 ws.ts 删除
- 插件侧**零改动零重建**（连接无 role 参数默认 plugin；requestId 仅值变化契约不变）
- 验证：双端 tsc 0 错；**单 daemon 双 MCP server 并发接入冒烟**（各自 tools/list 工具齐全，daemon 日志 conn=0/1/2 依次接入）；持久客户端 tools/call 真实 RPC 往返通过；错误穿透修复——daemon 合成的 ok:false 原被 list_frames 吞成"文档中没有画板"（误导），改为穿透 res.error 恢复"插件未连接"明确指引
- 冒烟方法论坑（已绕过）：printf 管道写完即关 stdin → stdin-end exit(0) 与异步 RPC 竞态截断响应；生产无此问题（客户端全程持有 stdin），冒烟改持久客户端脚本

**影响范围**: server/src 全局重构（protocol + handle/server/client/main 四件 + 四工具 + index + build）；structure.md daemon 行重写；**一次性迁移：跑旧代码的会话需关闭（旧内嵌 server 占 1120 会阻止新 daemon 绑定），此后任意多会话永久并存**；用户"多会话画板级并行"愿景的架构障碍清除，与第十六次的切图能力共同解锁步骤 6

### 2026-11-17（第十八次）
**变更类型**: 问题修复（多文件环境正确性）+ 会话启动预连接

**变更内容**:
- 背景：重启后插件"未连接"（懒启动预期行为，首个工具调用才拉起 daemon）+ 新会话测试"车辆管理"时 list_frames 返回测试稿 2 画板——用户客户端同时开着两个设计稿
- **边界澄清（探针⑥固有）**：桥只读**当前激活的设计文件**（jsDesign.root = 当前文档根）；且 JSDesign 每个文件页签有独立插件实例，daemon 单连接 latest-wins——多文件插件同时运行时会互相抢占连接（读到的文件漂移）
- 修复 1（缓存串味）：daemon 单例跨会话存活后缓存可能属于已切走的旧文档 → list_frames **每次强制重新采集**（不再缓存优先）+ frames.list 采集成功时 daemon **清空全量缓存**再入新清单（文档基线刷新语义）；get_structure/get_node_css 缓存被基线清除后自动重采
- 修复 2（连接身份可见）：plugin frames.list 回传 fileName=jsDesign.root.name（守卫读取 TODO 探针实测）→ daemon 缓存随清单存取 → list_frames 返回体带 fileName + hint 指引（"若与目标文件不符，切文件并重跑插件"）；面板状态行显示「文件「xxx」」
- 修复 3（启动预连接）：DaemonClient.ensureConnected() + index.ts 启动即调（不等首个工具调用）——重启 ZCode 后开会话即拉起 daemon，插件面板尽快变绿
- 验证：插件 tsc 0 错 + 8/8 测试 + 沙箱三件套过；server tsc 0 错 + 双入口重建
- **多文件使用规则**：①只有目标文件跑插件（关其它文件页签的插件面板，防抢占）；②切文件后重调 list_frames 刷新基线

**影响范围**: protocol（frames.list.result 加 fileName?）/ plugin（main/ui/types 镜像）/ server（cache clearAll+fileName、server 基线清空、list-frames 强制刷新）/ index 预连接；双端重建；插件需重载一次（用户侧）

### 2026-11-17（第十九次）
**变更类型**: 新功能实施（list_assets 资产枚举工具，四工具 → 五工具）+ 切图工作流定案+ 切图工作流定案

**变更内容**:
- 背景：export_asset 真机验收只落盘 2 张卡车图，用户质疑"智能体分不清哪些图标/图片/背景该下载"，并指出底部 tab 图标与时钟插画也应下载（自绘图形，组件库未必有）→ 定案切图工作流分层规则 + 规则化枚举工具
- **切图工作流定案**：①bitmap（IMAGE 填充）= 必然资产，规则枚举逐个导出；②vector（纯图形：VECTOR/布尔运算/INSTANCE/无文字 GROUP）= 按需导 SVG，组件库图标优先复用；③纯色/渐变背景与文本 = CSS/DOM 还原不切图；人工审查替换保留在流程末端（不退回手动下载）
- 实施：**新文件 mcp/asset-scan.ts**（纯函数扫描：命中候选即停不下钻防图标内部路径刷屏；TEXT/含文字后代排除）+ 单测 4/4（判定四象限）；**新文件 tools/list-assets.ts**（list_assets(frameId)：缓存快照枚举，bitmapCount/vectorCount 汇总 + 分层 hint）；export_asset 语义不变（导出仍按需执行）；协议零改动（走 cache.getSnapshot RPC）；插件零改动
- 验证：server tsc 0 错、node:test 11/11（7 css-map + 4 asset-scan）、双入口重建、换端口冒烟 tools/list 五工具齐全
- 使用方式：get_structure 后调 list_assets(frameId) → 拿候选清单（id/name/type/尺寸/kind）→ bitmap 逐个 export_asset、vector 按需导 SVG，用户可按清单人工增删
- 待真机回填：货场真实稿 list_assets 枚举结果（tab 图标/时钟是否如预期入选）

**影响范围**: server/src/mcp（asset-scan + list-assets 新文件，工具 4→5）；structure.md 3 行登记；插件零改动（无需重载）；会话侧需 MCP 重启拉新 server 才有新工具

### 2026-11-17（第二十次）
**变更类型**: 分发配套（使用技能 + 安装文档）

**变更内容**:
- 用户担忧外部使用者"描述了不会触发"→ 分析：工具描述随 server 分发（明确请求语义可匹配），缺口在模糊请求的工作流指引与前置条件告知 → 定案"建 skill + 安装文档"
- **新文件 skill/SKILL.md**：可分发使用技能（触发词：设计稿还原/切图/画板清单/样式标注；正文=工具链按序图 + 样式/资产/多文件/多会话/顺序依赖五组核心规则 + 常见错误对照表）；分发时拷到客户端技能目录（如 ZCode `.zcode/skills/jsdesign-bridge/`）
- **新文件 docs/mcp-setup.md**：消费侧安装使用文档（前置三条件 / 用户级 MCP 配置 JSON 与 env 变量表 / 五工具表 / 标准工作流 / 使用规则 / 错误对照 / daemon 自动拉起说明）
- 均入 structure.md 职责表；npm 发包决策（台账既有待决策项）不受影响——当前分发形态为"源码/产物包 + 配置文档 + skill 目录"
- 正确性记录：此前台账工具计数笔误修正（export_asset 实为 三→四、list_assets 实为 四→五，合计五工具）

**影响范围**: packages/jsdesign-bridge（skill/SKILL.md + docs/mcp-setup.md 新文件）；分发清单 = dist 产物 + plugin/manifest + skill/ + docs/mcp-setup.md

### 2026-11-17（第二十一次）
**变更类型**: 工程化（内置技能纳入双智能体目录同步逻辑）

**变更内容**:
- 用户提出"初始化时应把内置 skill 拷贝到不同智能体目录，分别完善 claude code 与 zcode 的拷贝逻辑"→ 纳入既有 `pnpm agent:sync` 流程而非新增脚本
- **实施（scripts/sync-agent-config.mjs 新增阶段 0）**：收割 packages/<集成名>/skill/ → .zcode/skills/<集成名>/（识别条件：包内存在 skill/SKILL.md；目录名=集成包名），先于镜像清单构建——收割产物进入 .zcode 单一事实源后由既有镜像逻辑自动带到 .claude/skills/；--check 模式同步校验（包技能缺少/不一致独立报告）
- SKILL.md 源加 YAML 注释标注"分发源、副本勿手改"；mcp-setup.md 技能安装节改为双智能体目录表（.zcode/skills 与 .claude/skills 各拷一份）+ 本仓 agent:sync 自动化说明
- 验证：agent:sync 实跑（收割 1 文件 + 镜像 8 文件）、--check 通过、双侧 jsdesign-bridge/SKILL.md 落地确认
- 边界：删除集成包技能后两侧副本需手动删（脚本无删除逻辑，TODO 若多包演进再补）

**影响范围**: scripts/sync-agent-config.mjs（阶段 0）；packages/jsdesign-bridge/skill/SKILL.md（源注释）；docs/mcp-setup.md（技能安装节）；本仓 .zcode/.claude 双侧新增 jsdesign-bridge 技能（随 sync 生成）

### 2026-11-17（第二十二次）
**变更类型**: 分发配套（消费侧技能自动安装脚本）

**变更内容**:
- 用户问"别人使用这个 MCP 时会自动拷贝技能吗"→ 诚实答案：不会（agent:sync 是本仓开发者侧自动化；MCP 协议只分发工具不带技能）→ 用户拍板方案 A：随包分发初始化脚本
- **新文件 init-skill.mjs**（包根，消费侧运行）：自动检测工程内 .zcode/.claude 目录并双拷 skill/SKILL.md；`--dir` 指定工程根 / `--all` 强制创建 / `--list` 干跑；源缺失与参数错误友好报错；无对应目录时输出两条选择指引而非静默失败
- 实测三场景通过：仅 .zcode（单侧装+另一侧提示）/ --all --list 干跑零写入 / 两目录都无（友好指引 exit 0）
- mcp-setup.md 技能安装节改为"自动安装（推荐）+ 手工安装（兜底）"双轨；structure.md 登记脚本行
- 语义澄清（对用户的回答）：MCP 配置本身永远不带技能——无论哪个方案，"拿到包"必须含 skill 文件，自动化只解决"拷到位"

**影响范围**: packages/jsdesign-bridge/init-skill.mjs（新文件）；mcp-setup.md 技能安装节；分发清单增列 init-skill.mjs
