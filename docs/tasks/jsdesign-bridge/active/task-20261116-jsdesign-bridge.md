# 任务：jsdesign-bridge 设计稿桥接（插件 → MCP）

**状态**: 🟢 进行中
**集成**: jsdesign-bridge
**创建时间**: 2026-11-16
**更新时间**: 2026-11-16
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

---

## 🔍 技术调研

结论沉淀在 [api-notes.md](../../packages/jsdesign-bridge/docs/api-notes.md)：jsDesign 全局变量 / 16 种节点类型 / Paint+TextStyle+FontName+LineHeight+Effect 覆盖 token 全字段 / 开发者控制台调试 / 官方文档为纯 SPA 需人工阅读。

---

## 🎯 实现步骤

- [ ] 1. 阶段 1a：开发者控制台验证 API 字段
  - **说明**: 客户端「插件 → 开发者 → 控制台」，`jsDesign.currentPage.selection` 遍历选中节点，确认 fills/fontSize/fontName/lineHeight/cornerRadius/effects 的真实数据结构
  - **预期结果**: 字段清单回填到 plugin/code.js 的 TODO 注释处
- [ ] 2. 阶段 1b：插件本体（骨架已建：plugin/manifest.json + code.js，**按 bridge-dev 规范迁移 TS 结构**）
  - **文件**: `packages/jsdesign-bridge/plugin/src/`
  - **说明**: 选中节点 → 序列化 JSON（WebSocket 出口预留，落点大概率在 ui.ts/iframe 侧 ⚠️ TODO(实测)）；ui.html 面板显示导出状态
- [ ] 3. 阶段 1.5：极简接收端（本地 WS 服务收 JSON 落盘验证）
- [ ] 4. 对照现成方案数据质量（jsdesign-mcp-server 的 get_design_tokens 输出）
- [ ] 5. 阶段 2：daemon + MCP server（@modelcontextprotocol/sdk），注册 export_selection / get_design_tokens
- [ ] 6. ZCode 实测：选中画板 → AI 调工具拿 token → 对照 tokens.ts 出差异清单

---

## 🔄 当前进度

**已完成**: 0 / 6 步骤

**下一步操作**:
1. 即时设计客户端（桌面端）打开「插件 → 开发者 → 控制台」，验证选中节点字段（步骤 1）

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
- 沙箱主线程大概率无网络 API（Figma 兼容体系）：WebSocket 应落 ui.html iframe 侧，阶段 1a 实测确认

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
