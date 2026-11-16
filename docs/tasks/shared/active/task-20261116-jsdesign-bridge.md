# 任务：jsdesign-bridge 设计稿桥接（插件 → MCP）

**状态**: 🟢 进行中
**端**: shared（跨端工具链，服务 RN/鸿蒙 双端 UI 还原）
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

---

## 🔍 技术调研

结论沉淀在 [api-notes.md](../../packages/jsdesign-bridge/docs/api-notes.md)：jsDesign 全局变量 / 16 种节点类型 / Paint+TextStyle+FontName+LineHeight+Effect 覆盖 token 全字段 / 开发者控制台调试 / 官方文档为纯 SPA 需人工阅读。

---

## 🎯 实现步骤

- [ ] 1. 阶段 1a：开发者控制台验证 API 字段
  - **说明**: 客户端「插件 → 开发者 → 控制台」，`jsDesign.currentPage.selection` 遍历选中节点，确认 fills/fontSize/fontName/lineHeight/cornerRadius/effects 的真实数据结构
  - **预期结果**: 字段清单回填到 plugin/code.js 的 TODO 注释处
- [ ] 2. 阶段 1b：插件本体（骨架已建：plugin/manifest.json + code.js）
  - **文件**: `packages/jsdesign-bridge/plugin/`
  - **说明**: 选中节点 → 序列化 JSON（WebSocket 出口预留）；ui.html 面板显示导出状态
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

---

## ⚠️ 注意事项

- 官方文档为纯 SPA，机器抓不到正文；API 细节写入 api-notes.md 而非对话
- npm 包名 `jsdesign-mcp-server` 与 CLI 命令名 `jsdesign-mcp` 不同（直接运行会挂起等 stdio）
- 使用现成方案期间保持插件面板打开，全部断开空闲 15 分钟后 daemon 自动退出
