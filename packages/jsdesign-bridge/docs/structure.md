# jsdesign-bridge 文件职责表

> 制度见技能 `bridge-dev`：新建文件必须先入表再写码；拆分/删除/改职责同步更新。
> 状态：规划中（尚未创建）｜实现中（骨架/未验证）｜已验证（真实路径跑通）

## plugin/（即时设计插件，沙箱）

| 文件 | 职责 | 状态 |
|---|---|---|
| `plugin/manifest.json` | 插件声明（入口、UI）；main=dist/code.js | 已验证（真机加载+采集跑通） |
| `plugin/package.json` / `plugin/tsconfig.json` | 插件构建依赖（esbuild/typescript/@types/node/ws devDeps）与 TS strict 配置 | 已验证（安装+脚本跑通） |
| `plugin/scripts/build.mjs` | 构建脚本：esbuild 打包 main.ts→dist/code.js（iife）+ ui.ts→dist/ui.js，并注入 template.html 生成 ui.html | 已验证（构建跑通，产物生成） |
| `plugin/scripts/build-test.mjs` | 测试编译脚本：src/**/*.test.ts → dist-test/*.js（供 node --test） | 已验证（npm test 跑通） |
| `plugin/dev-receiver.mjs` | 阶段 1.5 极简接收端（dev 工具）：监听 3848、发采集请求、快照落盘 dev-out/；阶段 2 被 server/daemon 替代 | 已验证（真机采集 3 文件落盘） |
| `plugin/src/main.ts` | 沙箱主线程入口：纯装配——ui.onmessage 路由 frames.list / frame.snapshot，jsDesign API 只在此文件 | 已验证（真机采集跑通） |
| `plugin/src/ui/ui.ts` | iframe 侧：WS 连 daemon/断线重连/请求路由/状态面板渲染 | 已验证（真机连接+面板状态正确） |
| `plugin/src/ui/template.html` | 面板模板源码（含 `<!--UI_BUNDLE_INJECT-->` 注入占位；构建时生成 ui.html） | 已验证（生成+真机显示） |
| `plugin/src/lib/serialize.ts` | 节点树 → 画板级自包含快照（FrameSnapshot）的纯函数序列化器（字段照实测表，不做 CSS 映射；jsDesign API 零调用） | 已验证（node:test 5/5） |
| `plugin/src/lib/serialize.test.ts` | serialize 单测（node:test；经 esbuild 编译到 dist-test 后运行，fixture 照实测节点形状） | 已验证（5/5 过） |
| `plugin/src/types.ts` | 消息结构镜像（手抄自 server/src/protocol，注释指向源） | 已验证（tsc 过） |
| `plugin/src/env.d.ts` | jsDesign 沙箱全局对象/`__html__` 环境声明（只声明实测过的 API：showUI/root/getNodeByIdAsync/ui） | 已验证（真机跑通） |
| `plugin/dist/` | esbuild 产物 code.js / ui.js（gitignore，不入表统计行数） | 已验证（生成） |
| `plugin/dist-test/` | 测试编译产物（gitignore） | 已验证（生成） |
| `plugin/ui.html` | **构建产物**（build.mjs 由 src/ui/template.html + dist/ui.js 注入生成，勿手改；探针面板源码在 git 历史） | 已验证（真机加载+状态显示正确） |

> 已删除：`plugin/code.js`（手写探针主线程，T-007 退役，源码在 git 历史）

## server/（daemon + MCP server）

| 文件 | 职责 | 状态 |
|---|---|---|
| `server/src/index.ts` | 入口：纯装配，解析启动参数后拉起 daemon 与 MCP server | 规划中 |
| `server/src/daemon/ws.ts` | WebSocket 服务端（ws://127.0.0.1:3847）：接受插件连接、收发消息 | 规划中 |
| `server/src/daemon/cache.ts` | 画板快照缓存 Map<frameId, FrameSnapshot> + 画板清单缓存，供 MCP 工具并发读取 | 规划中 |
| `server/src/mcp/index.ts` | MCP server 装配：stdio 传输 + 工具清单注册 | 规划中 |
| `server/src/mcp/types.ts` | ToolResult（官方 `{ content, isError? }`）与工具 handler 签名等 mcp 层共享类型 | 规划中 |
| `server/src/mcp/css-map.ts` | 原语 → CSS 属性对象的纯函数映射（fills→background、effects→box-shadow 等；不可映射项给提示） | 规划中 |
| `server/src/mcp/tools/list-frames.ts` | 工具 list_frames：全文档画板清单（id/name/尺寸/页名，编排 agent 分活用） | 规划中 |
| `server/src/mcp/tools/get-structure.ts` | 工具 get_structure(frameId)：单画板轻量结构树（id/name/type/尺寸/层级） | 规划中 |
| `server/src/mcp/tools/get-node-css.ts` | 工具 get_node_css(nodeId)：按 id 返回单节点 `css`（映射视图）+ `raw`（原语）双轨 JSON | 规划中 |
| `server/src/protocol/messages.ts` | 消息 schema 单一事实源（两端共享契约） | 已验证（tsc 过） |
| `server/package.json` / `tsconfig.json` | 依赖与编译配置（strict / NodeNext / noEmit typecheck） | 已验证（tsc 过） |

## docs/

| 文件 | 职责 | 状态 |
|---|---|---|
| `docs/api-notes.md` | 即时设计 API 人工沉淀（CLAUDE.md 约定） | 实现中 |
| `docs/structure.md` | 本表 | 实现中 |

## 变更记录

- 2026-11-16 建表：登记现状（code.js 手写骨架待迁移）与 TS + esbuild 目标结构
- 2026-11-16 样式查询设计定稿：工具改为两段式 get_structure / get_node_css（替代 export-selection / get-design-tokens 草案），新增 mcp/css-map.ts 原语→CSS 纯函数映射；serialize.ts 职责明确为只产原语快照、不做 CSS 映射
- 2026-11-17 画板独立输出定稿：serialize.ts 产出从整文档单快照改为画板级自包含 FrameSnapshot；cache.ts 改 Map<frameId, FrameSnapshot>；工具演进三段式（新增 list-frames.ts，get-structure.ts 加 frameId 参数）；ui.ts 补请求-响应消息路由职责
- 2026-11-17 探针面板真机验证通过：code.js / ui.html / manifest.json 状态 → 已验证；ui↔main 消息通道实测跑通（详见 api-notes.md 实测节）
- 2026-11-17 T-001~T-008 实施：server 脚手架 + protocol/messages.ts（tsc 过）；plugin TS 源码树（main/ui/serialize/types/env/template/build 脚本）+ esbuild 构建链（ui 内联注入方案）+ serialize 单测 5/5；手写 code.js 退役（T-007）、manifest main→dist/code.js；dev-receiver.mjs 监听跑通（3847 当时空闲，参考实现 daemon 已自退）；真机联调统一归 T-009
