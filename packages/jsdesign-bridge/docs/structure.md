# jsdesign-bridge 文件职责表

> 制度见技能 `bridge-dev`：新建文件必须先入表再写码；拆分/删除/改职责同步更新。
> 状态：规划中（尚未创建）｜实现中（骨架/未验证）｜已验证（真实路径跑通）

## plugin/（即时设计插件，沙箱）

| 文件 | 职责 | 状态 |
|---|---|---|
| `plugin/manifest.json` | 插件声明（入口、UI、editorType） | 实现中 |
| `plugin/code.js` | 旧手写骨架：遍历选中节点输出 JSON（**待迁移**：字段实测后迁入 src/，经 esbuild 打包替代） | 实现中 |
| `plugin/src/main.ts` | 沙箱主线程入口：纯装配——读选中 → 调 lib/serialize → postMessage 交 ui.ts | 规划中 |
| `plugin/src/ui.ts` | iframe 侧：WebSocket 连 daemon、断线重连、面板状态上报 | 规划中 |
| `plugin/src/lib/serialize.ts` | 节点树 → token JSON 的纯函数序列化器（字段以控制台实测为准） | 规划中 |
| `plugin/src/types.ts` | 消息结构镜像（手抄自 server/src/protocol，注释指向源） | 规划中 |
| `plugin/ui.html` | 面板壳：显示导出/连接状态，引 ui 打包产物 | 规划中 |
| `plugin/dist/` | esbuild 产物 code.js / ui.js（gitignore，不入表统计行数） | 规划中 |

## server/（daemon + MCP server）

| 文件 | 职责 | 状态 |
|---|---|---|
| `server/src/index.ts` | 入口：纯装配，解析启动参数后拉起 daemon 与 MCP server | 规划中 |
| `server/src/daemon/ws.ts` | WebSocket 服务端（ws://127.0.0.1:3847）：接受插件连接、收发消息 | 规划中 |
| `server/src/daemon/cache.ts` | 最新导出数据的内存缓存，供 MCP 工具读取 | 规划中 |
| `server/src/mcp/index.ts` | MCP server 装配：stdio 传输 + 工具清单注册 | 规划中 |
| `server/src/mcp/types.ts` | ToolResult（官方 `{ content, isError? }`）与工具 handler 签名等 mcp 层共享类型 | 规划中 |
| `server/src/mcp/tools/export-selection.ts` | 工具 export_selection：返回选中节点树 JSON | 规划中 |
| `server/src/mcp/tools/get-design-tokens.ts` | 工具 get_design_tokens：从缓存提取设计 token | 规划中 |
| `server/src/protocol/messages.ts` | 消息 schema 单一事实源（两端共享契约） | 规划中 |
| `server/package.json` / `tsconfig.json` | 依赖与编译配置 | 规划中 |

## docs/

| 文件 | 职责 | 状态 |
|---|---|---|
| `docs/api-notes.md` | 即时设计 API 人工沉淀（CLAUDE.md 约定） | 实现中 |
| `docs/structure.md` | 本表 | 实现中 |

## 变更记录

- 2026-11-16 建表：登记现状（code.js 手写骨架待迁移）与 TS + esbuild 目标结构
