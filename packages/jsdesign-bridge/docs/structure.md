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
| `plugin/dev-receiver.mjs` | 阶段 1.5 极简接收端（dev 工具）：监听 1120、发采集请求、快照落盘 dev-out/；阶段 2 被 server/daemon 替代 | 已验证（真机采集 3 文件落盘） |
| `plugin/src/main.ts` | 沙箱主线程入口：纯装配——ui.onmessage 路由 frames.list / frame.snapshot / probe.export（探针⑨ exportAsync 实测），jsDesign API 只在此文件 | 已验证（真机采集跑通；探针真机结果待回填） |
| `plugin/src/ui/ui.ts` | iframe 侧：WS 连 daemon/断线重连/请求路由/状态面板渲染/探针⑨按钮与结果回显（本地通道，不经 daemon） | 已验证（真机连接+面板状态正确） |
| `plugin/src/ui/template.html` | 面板模板源码（含 `<!--UI_BUNDLE_INJECT-->` 注入占位；构建时生成 ui.html；含探针⑨按钮区） | 已验证（生成+真机显示） |
| `plugin/src/lib/serialize.ts` | 节点树 → 画板级自包含快照（FrameSnapshot）的纯函数序列化器（字段照实测表，不做 CSS 映射；jsDesign API 零调用） | 已验证（node:test 5/5） |
| `plugin/src/lib/serialize.test.ts` | serialize 单测（node:test；经 esbuild 编译到 dist-test 后运行，fixture 照实测节点形状） | 已验证（5/5 过） |
| `plugin/src/lib/asset-bytes.ts` | 资产字节纯函数：bytesToBase64（沙箱无 Buffer/btoa 未实测，自实现标准编码）+ detectImageExt（JPEG SOI / PNG 签名魔数 → 扩展名） | 已验证（node:test 3/3，Buffer 对照 oracle） |
| `plugin/src/lib/asset-bytes.test.ts` | asset-bytes 单测（Buffer 为对照基准；补位边界 0/1/2/3 字节 + bulk 往返） | 已验证（3/3 过） |
| `plugin/src/types.ts` | 消息结构镜像（手抄自 server/src/protocol，注释指向源）+ 探针⑨本地通道类型（ProbeExportRequest/Result，ui↔main 点对点，不镜像 protocol） | 已验证（tsc 过） |
| `plugin/src/env.d.ts` | jsDesign 沙箱全局对象/`__html__` 环境声明（只声明实测过的 API：showUI/root/getNodeByIdAsync/ui） | 已验证（真机跑通） |
| `plugin/dist/` | esbuild 产物 code.js / ui.js（gitignore，不入表统计行数） | 已验证（生成） |
| `plugin/dist-test/` | 测试编译产物（gitignore） | 已验证（生成） |
| `plugin/ui.html` | **构建产物**（build.mjs 由 src/ui/template.html + dist/ui.js 注入生成，勿手改；探针面板源码在 git 历史） | 已验证（真机加载+状态显示正确） |
| `skill/SKILL.md` | 可分发使用技能（触发词：设计稿还原/切图/画板/样式标注；正文=工具链顺序+资产分层+多文件/多会话规则+错误对照） | 已实现（随包分发，拷到客户端技能目录生效） |
| `init-skill.mjs` | 消费侧技能安装脚本：自动检测工程内 .zcode/.claude 目录双拷技能（--dir 指定工程根 / --all 强制 / --list 干跑） | 已验证（三场景实跑） |
| `docs/mcp-setup.md` | 消费侧安装使用文档（MCP 配置/env/五工具表/标准工作流/使用规则/错误对照/分发清单） | 已实现 |

> 已删除：`plugin/code.js`（手写探针主线程，T-007 退役，源码在 git 历史）

## server/（daemon + MCP server）

| 文件 | 职责 | 状态 |
|---|---|---|
| `server/src/index.ts` | 入口：纯装配——startDaemon + startMcpServer(stdio)，stdin 关闭即退出 | 规划中 |
| `server/scripts/build.mjs` | esbuild 打包 src/index.ts → dist/index.js（node 平台单产物 + createRequire banner，供 MCP 配置拉起） | 已验证（构建跑通） |
| `server/scripts/mcp-smoke.mjs` | MCP stdio 握手冒烟：initialize + tools/list 直测产物（不动 AI 客户端的前置自检；JSDESIGN_BRIDGE_PORT 可隔离端口） | 已验证（三工具列表返回） |
| `server/src/daemon/handle.ts` | DaemonHandle 接口（工具层对 daemon 的依赖面：getFrameInfos/getSnapshot/findNode/request，阶段 3 全异步 RPC） | 已验证（tsc 过） |
| `server/src/daemon/server.ts` | daemon 单例服务端：唯一监听 1120，双角色连接（默认 plugin / ?role=client）、工具请求重写 requestId 转发（req:conn:seq）并按前缀路由回客户端、插件断连/超时合成错误结果、空闲自退（无插件无客户端 15min） | 已验证（双 MCP server 并发接入 + 错误穿透冒烟） |
| `server/src/daemon/client.ts` | MCP 侧客户端 DaemonHandle：WS 接入 ?role=client，连接失败自动 spawn dist/daemon.js（detached）+ 重试；cache/tool 请求 RPC 化（30s 超时） | 已验证（自动拉起 + RPC 往返冒烟） |
| `server/src/daemon/main.ts` | daemon 独立进程入口（dist/daemon.js，可手动 node 运行） | 已验证（后台运行冒烟） |
| `server/src/daemon/cache.ts` | 画板快照缓存 Map<frameId, FrameSnapshot> + 画板清单缓存 + 节点索引，随 daemon 单例进程持有（多 MCP server 共享一份） | 已验证 |
| `server/src/mcp/index.ts` | MCP server 装配：stdio 传输 + 工具清单注册 | 规划中 |
| `server/src/mcp/types.ts` | ToolResult（官方 `{ content, isError? }`）与工具 handler 签名等 mcp 层共享类型 | 规划中 |
| `server/src/mcp/css-map.ts` | 原语 → CSS 属性对象的纯函数映射（fills 按节点类型分派：TEXT→color、其余→background-color；effects→box-shadow；lineHeight AUTO 按 1.5×fontSize 实测规律换算 2026-11-17；不输出 position/left/top——定位定案，坐标保真在 raw） | 已验证（单测 7/7 + 真机调用） |
| `server/src/mcp/css-map.test.ts` | css-map 单测（node:test；fixture 照 api-notes 实测字段结构；含 TEXT color / 定位不输出坐标断言） | 已验证（7/7 过） |
| `server/src/mcp/tools/list-frames.ts` | 工具 list_frames：全文档画板清单（id/name/尺寸/页名，编排 agent 分活用） | 规划中 |
| `server/src/mcp/tools/get-structure.ts` | 工具 get_structure(frameId)：单画板轻量结构树（id/name/type/尺寸/层级 + pos 相对坐标 + 容器 layout 推断 + padding/gap 推断——像素级布局参数一次拿全，防绝对定位偷懒） | 已验证（真机回归 + 单测） |
| `server/src/mcp/get-structure.test.ts` | get_structure 单测（inferLayout row/column/mixed/隐藏剔除 + lightTree pos/padding/gap 推断断言） | 已验证（7/7 过） |
| `server/src/mcp/tools/get-node-css.ts` | 工具 get_node_css(nodeId)：css（css-map 映射 + 渐变/阴影弱分支自动走 SVG 提取轨）+ raw 双轨 JSON | 已验证（真机回归） |
| `server/src/mcp/svg-css.ts` | 官方 SVG → 弱分支 CSS 纯函数解析：linearGradient→linear-gradient（方向向量转角度）、filter→box-shadow（stdDeviation×2=blur、feColorMatrix 末列×255=RGB 且跳过 hardAlpha 矩阵、alpha=系数[18]+偏移[19]）；解析失败返回空走 css-map note 兜底 | 已验证（node:test 4/4，真稿样本 fixture） |
| `server/src/mcp/svg-css.test.ts` | svg-css 单测（真稿阴影 filter 样本 + 渐变角度/stops + 多 gradient warning + 畸形输入） | 已验证（4/4 过） |
| `server/src/mcp/asset-scan.ts` | 快照树 → 候选资产清单 纯函数扫描（bitmap=IMAGE 填充；vector=纯图形节点；TEXT/含文字组/装饰矩形排除；命中即停不下钻） | 已验证（node:test 4/4） |
| `server/src/mcp/asset-scan.test.ts` | asset-scan 单测（判定四象限：位图/纯图形/含文字排除/容器下钻） | 已验证（4/4 过） |
| `server/src/mcp/tools/list-assets.ts` | 工具 list_assets(frameId)：规则化枚举候选资产（替代"AI 猜哪些该切图"），bitmap 逐个导出、vector 按需导 SVG（组件库优先） | 已实现（构建+冒烟过；真机枚举待回填） |
| `server/src/mcp/tools/export-asset.ts` | 工具 export_asset(nodeId,{format,scale})：切图导出——auto 决策树（IMAGE 填充→原图字节、其余→SVG）、daemon.request 取 base64、解码落盘 JSDESIGN_BRIDGE_ASSETS_DIR（默认 tmpdir）、8MB 护栏、仅返回 path 不进上下文 | 已实现（构建+冒烟过；真机原图字节路径待探针⑩回填） |
| `server/src/protocol/messages.ts` | 消息 schema 单一事实源（两端共享契约）：frames/snapshot 采集 + asset.export 切图（AssetFormat auto/svg/png/jpg/original，字节 base64 过 WS） | 已验证（tsc 过） |
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
- 2026-11-17 三工具真机首验 + 两项映射定案：真实客户端（ZCode）实测 list_frames/get_structure/get_node_css 全通；**TEXT fills=文字色定案**（真稿对照 #00C7BA 逐位吻合）→ mapFills 按节点类型分派（TEXT→color，其余→background-color），单测同步修正；**css 轨不输出 position/left/top**（画板坐标套文档流会错位，保真在 raw）
