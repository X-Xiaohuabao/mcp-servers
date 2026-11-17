# 即时设计插件 API 笔记

> 来源：官方文档 https://js.design/developer-doc/plugin/api/reference/intro（纯 SPA，机器不可抓取，本文为人工阅读沉淀）+ 参考实现 [nothing-sy/js.design](https://github.com/nothing-sy/js.design)（MIT）。
> 更新时间：2026-11-17

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
- 潜在捷径 ⚠️ ~~TODO(实测)~~ → **已实测否决（2026-11-17 探针②）**：`node.getCSSAsync` 为 `undefined`，插件 API 层无官方引擎入口。Dev Mode 面板是客户端内置 UI，插件沙箱摸不到；自动化劫持面板 DOM 属 RPA 方案（脆弱、Dev Mode 与插件运行态互斥），均不可取。**自研 css-map 是唯一可编程路径**（市场五个 MCP 插件亦全自研）
- **官方面板的正确用法 = 对照基准**：css-map 写完后选 3~5 个代表节点，Dev Mode 复制官方 CSS 与自研输出 diff，差异即映射 bug
- **官方输出风格情报（2026-11-17 用户截图，"货场管理系统"节点）**：
  - 绝对定位风格：`left/top/width/height` 直接给 px 值（非 flex/transform）——css-map 同样输出 x/y→left/top（ui-restore 像素还原直接可用）
  - `font-weight: 700`：官方同样从字体 style 推导数值（印证 fontWeight 字段不暴露的实测）
  - `line-height: 26.06px`：`lineHeight:{unit:'AUTO'}` 被官方换算为具体 px——css-map 处理 AUTO 时用 font-size×比例反推公式或保真 raw，探针⑦拿到 AUTO 样本后与官方面板同节点对照定标
  - 另输出 `letter-spacing`/`vertical-align`/`text-align`/`opacity`；面板带 CSS/iOS/Android 三平台切换与切图（规范预设）区

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

## ⚠️ 实测铁律二：沙箱解析器不支持 ES2019+ 语法（2026-11-17）

**插件主线程的代码解析器较老（Figma 兼容体系 eval 解析），ES2019+ 语法直接报 Syntax error**：

- `} catch {`（可选 catch 绑定，ES2019）→ `Syntax error on line N: Unexpected token {`
- `?.`（可选链）/ `??`（空值合并，ES2020）→ 同类报错
- ES6 基础语法（箭头函数/const/模板串/解构）实测可用（探针面板验证过）

**对策**：esbuild `target: 'es2017'`——`?.`/`??`/`catch {}` 全部转译为等价形式（重建后 grep 验证零残留 + node --check 双重验证）。**任何新构建产物上沙箱前先跑 `node --check dist/code.js` + grep 三件套**。ui.html iframe 侧是完整浏览器环境无此限制，但统一同 target 免分歧。

## 步骤 1a 探针清单（2026-11-17，控制台粘贴执行）

> **首选执行方式（2026-11-17 起）：插件探针面板**——探针已内置到 `plugin/code.js` + `plugin/ui.html`，客户端重新导入插件后面板点击执行（支持"全部执行"与一键复制结果）；下述控制台脚本为备用（多行 IIFE 粘贴控制台易丢首行失败，实测踩过）。
> 控制台打开方式：客户端「插件 → 开发者 → 控制台」。`jsDesign` 全局对象直接可用。
> 执行前先在画布**选中目标节点/画板**（各探针有说明）。结果判读标准随附，执行后回填本节下方的「实测结果」。

### 探针 1：节点字段真实结构（决定 serialize 字段表）

选中**一个画板**（内部含文字最好），执行：

```js
(function () {
  const s = jsDesign.currentPage.selection;
  if (!s.length) return console.warn('请先选中一个画板');
  const FIELDS = ['id','name','type','visible','x','y','width','height',
    'fills','strokes','strokeWeight','strokeAlign','dashPattern','opacity','blendMode',
    'cornerRadius','rectangleCornerRadii','effects',
    'layoutMode','itemSpacing','paddingLeft','paddingRight','paddingTop','paddingBottom',
    'primaryAxisAlignItems','counterAxisAlignItems','layoutGrow','layoutAlign',
    'fontSize','fontName','fontWeight','lineHeight','letterSpacing',
    'textAlignHorizontal','textAlignVertical','textCase','textDecoration','characters'];
  const dump = (n, tag) => {
    const out = {};
    for (const k of FIELDS) { try { out[k] = n[k]; } catch (e) { out[k] = '<不可读>'; } }
    console.log('=== ' + tag + '：' + n.type + ' "' + n.name + '" ===');
    console.log(JSON.stringify(out, null, 2));
  };
  dump(s[0], '选中节点');
  let text = null;
  (function walk(n) { if (text || !n.children) return; for (const c of n.children) { if (c.type === 'TEXT') { text = c; return; } walk(c); } })(s[0]);
  if (text) dump(text, '第一个 TEXT 子节点');
  else console.warn('（画板内未找到 TEXT 节点，建议换一个含文字的画板再跑一次）');
})();
```

判读：记录每个字段的实际类型/结构（Paint 是 `{type:'SOLID', color:{r,g,b}, opacity}` 还是别的）、哪些字段在该节点类型上为空、TEXT 节点 characters 是否含完整文案。

### 探针 2：getCSSAsync 可用性（决定 css-map 走官方引擎还是自研）

选中任一节点，执行：

```js
(function () {
  const n = jsDesign.currentPage.selection[0];
  if (!n) return console.warn('请先选中节点');
  console.log('typeof n.getCSSAsync =', typeof n.getCSSAsync);
  if (typeof n.getCSSAsync === 'function') {
    n.getCSSAsync().then(css => console.log('✓ CSS 输出：', css))
      .catch(e => console.warn('存在但调用失败：', e.message));
  }
})();
```

判读：`'function'` → 存在官方引擎捷径，css-map 评估直接调用；`'undefined'` → 走自研映射表。**注意：即使可用也要对比字段取舍是否适合 LLM 消费（见上文 Dev Mode 节）。**

### 探针 3：沙箱主线程网络 API（决定 WS 位置）

不需选中，直接执行：

```js
(function () {
  console.log('WebSocket =', typeof WebSocket, '| fetch =', typeof fetch);
  try {
    const ws = new WebSocket('ws://127.0.0.1:3847');
    ws.onopen = () => { console.log('✓ 能连 3847（当前有 daemon 在监听）'); ws.close(); };
    ws.onerror = () => console.log('onerror 触发：构造器可用，端口无监听（预期，daemon 未启动）');
    ws.onclose = (e) => console.log('onclose code =', e.code);
    console.log('✓ WebSocket 构造成功（API 存在）');
  } catch (e) { console.log('✗ 构造抛错（主线程无网络 API）：', e.message); }
})();
```

判读：`typeof WebSocket === 'function'` 且构造不抛错 → 主线程**可能**可用（仍按计划落 iframe 侧，参考实现同路，主线程留作备份路径）；`undefined` 或抛错 → 实锤 WS 必须落 ui.html iframe。

### 探针 4：单画板序列化耗时与体积（验证画板独立输出方案可行性）

选中**一个有代表性的真实画板**（中等复杂度），执行：

```js
(function () {
  const s = jsDesign.currentPage.selection;
  if (!s.length) return console.warn('请先选中一个画板');
  const f = s[0];
  let count = 0;
  const t0 = Date.now();
  (function walk(n) { count++; if (n.children) n.children.forEach(walk); })(f);
  const walkMs = Date.now() - t0;
  let jsonLen = 0, fail = 0;
  const t1 = Date.now();
  (function walk2(n) {
    try { jsonLen += JSON.stringify({ id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, w: n.width, h: n.height, fills: n.fills }).length; }
    catch (e) { fail++; }
    if (n.children) n.children.forEach(walk2);
  })(f);
  const serMs = Date.now() - t1;
  console.log('画板 "' + f.name + '" | 节点数:', count,
    '| 遍历:', walkMs + 'ms', '| 轻量序列化:', serMs + 'ms',
    '| 估算 JSON:', (jsonLen / 1024).toFixed(1) + 'KB', fail ? ('| stringify 失败节点: ' + fail) : '');
})();
```

判读：节点数 × 耗时 × 体积三件套回填。若单画板 >5000 节点或 >2s，触发懒采集预案评估；轻量字段尚且超大则完整 FrameSnapshot 落盘方案升级为必选。

### 探针 5：getNodeByIdAsync 可用性（get_node_css 高效直查路径）

选中任一节点，执行：

```js
(function () {
  console.log('typeof jsDesign.getNodeByIdAsync =', typeof jsDesign.getNodeByIdAsync);
  const n = jsDesign.currentPage.selection[0];
  if (typeof jsDesign.getNodeByIdAsync === 'function' && n) {
    jsDesign.getNodeByIdAsync(n.id)
      .then(found => console.log(found ? '✓ 找回：' + found.name + ' (' + found.type + ')' : '✗ 返回 null'))
      .catch(e => console.warn('调用失败：', e.message));
  }
})();
```

判读：可用 → get_node_css 可按 nodeId 直查（不必先有画板快照）；不可用 → get_node_css 必须依赖已缓存的 FrameSnapshot 树内查找。

### 实测结果回填区（执行后填写）

| 探针 | 结果 | 结论/影响 | 日期 |
|---|---|---|---|
| 1 字段结构 | ✓ 面板执行成功（FRAME"注册"+TEXT"注册页面"全字段 dump） | 字段表定案，详见下方「实测字段结构」节 | 2026-11-17 |
| 2 getCSSAsync | `undefined`（FRAME 与 TEXT 均测） | **定案：css-map 走自研映射表**；Dev Mode 面板输出仅作对照基准 | 2026-11-17 |
| 3 主线程网络 | `WebSocket = undefined`，`fetch = function`，`XMLHttpRequest = undefined` | **实锤：WS 必须落 ui.html iframe 侧**（fetch 存在但不采用，参考实现同路） | 2026-11-17 |
| 4 画板耗时/体积 | 2 节点 / 0ms / 0.4KB（测试画布极简） | 机制跑通；真实设计稿耗时/体积待真实画板复测 | 2026-11-17 |
| 5 getNodeByIdAsync | `function`，按 id 找回 FRAME 成功 | **get_node_css 可按 nodeId 直查节点**，不强依赖快照树 | 2026-11-17 |
| 6 全文档画板清单 | `jsDesign.pages = undefined`；**`jsDesign.root.children` ✓**（实测 1 页"页面 1"→ 2 画板带 id/尺寸） | **list_frames 实现路径定案**：`jsDesign.root.children` → `page.children` 过滤 `type==='FRAME'` | 2026-11-17 |
| 7 样本画板全检（渐变/阴影/图片/描边/自动布局/混排文本/实例） | 三跑覆盖 FRAME/TEXT/RECTANGLE；**描边最简形态实测**：`strokes[solid black] + strokeWeight:1 + dashPattern:[]`（border 映射输入确认） | **1a 关闭，不阻塞 1b**：渐变/阴影/图片/自动布局/混排/实例等映射分支按 bridge-dev 规范以 unknown+守卫+TODO(实测) 编码，步骤 6 真实设计稿实测一并验证（探针面板保留随时抽查） | 2026-11-17 |
| 8 iframe 网络自检（面板加载自动） | `WebSocket/fetch/XMLHttpRequest` 全为 function；**对 3847 连接 onopen 成功** | **架构基石通过**：iframe 可建 WS，传输方案实锤。⚠ 3847 是参考实现 daemon（jsdesign-mcp-server/市场插件）端口：真机首跑插件面板"已连接"实为误连参考 daemon（netstat LISTENING + 参考 MCP get_connection_status clientCount=1 双证）→ **已定案：自研桥改用 3848 与参考实现永久共存**，无需关市场插件 | 2026-11-17 |

### 遗留 TODO(实测) 清单（1a 关闭时转入步骤 6 真实稿验证）

- GRADIENT_* paint 结构（gradientStops/gradientTransform）→ css-map linear-gradient 分支
- Effect 实值（DROP_SHADOW 的 color/offset/radius）→ box-shadow 分支
- IMAGE paint 结构（imageHash/scaleMode）→ serialize raw 兜底 + 切图
- dashPattern 实值（虚线边框）
- 自动布局 HORIZONTAL/VERTICAL 实值组（itemSpacing/padding 实数）→ display:flex 分支
- 混排文本 mixed 形态（fontSize 等返回特殊值时的样子）
- INSTANCE 可读性（componentId/mainComponent/children 权限）
- lineHeight PERCENT 形态（已见 AUTO/PIXELS）
- 真实画板性能（节点数/遍历与序列化耗时/JSON 体积——画板独立方案的最终验收）
- postMessage 大消息上限（1.5 阶段 daemon 联调时测）

### 第二批探针（⑥⑦⑧，2026-11-17 面板 v2 加入）

- **⑥ 全文档画板清单**：探测页面列表入口（`jsDesign.pages` / `jsDesign.root.children` / `jsDesign.rootDocument.pages` 多路径）+ 页内 FRAME 枚举——`list_frames` 工具的实现路径，未测前不许写实现
- **⑦ 样本画板全检**：选中含丰富样式的"样本画板"一键全检——dump 每个节点的非空 fills/effects/strokes（渐变、阴影、图片填充、描边、虚线的实测形态）、TEXT（混排文本 mixed 形态）、自动布局 FRAME 实值、INSTANCE 可读性；输出节点类型统计
- **⑧ iframe 网络自检**（面板加载自动跑）：iframe 里 `typeof WebSocket` + 对 3847 真实发起构造连接——WS 落 iframe 是架构基石，CSP/沙箱是否拦截必须实测

### 实测字段结构（2026-11-17，serialize 字段表的事实依据）

> 来源：探针面板①，画布 FRAME"注册"（1440×1024）+ TEXT"注册页面"。对 serialize.ts / css-map.ts 的直接约束：

- **颜色 = 0-1 浮点**：`Paint.color = {r,g,b}` 各分量 0-1，**alpha 不在 color 里**，单独为 `Paint.opacity`；CSS 映射需 `rgba(r*255, g*255, b*255, paint.opacity)`
- **不存在字段返回 `null` 而非 undefined、不抛错**：FRAME 上读 fontSize 等文本字段得 null——序列化器可对任意节点统一读全字段表，无需按类型分支防错
- **`fontWeight` 不暴露（TEXT 上也是 null）**：字重只能从 `fontName.style`（'Regular'/'Bold'/…）推导，css-map 的 font-weight 映射以此为准
- **`fontName = {family, style}`**：如 `{family:'SourceHanSansCN', style:'Regular'}`
- **`lineHeight` / `letterSpacing` 是 unit 判别联合**：`{unit:'AUTO'}` / `{unit:'PIXELS', value}` / `{unit:'PERCENT', value}`（lineHeight 实测 AUTO 形态、letterSpacing 实测 PIXELS 形态）
- **`rectangleCornerRadii` 常态 null**（仅四角各自设置时才有值）；`cornerRadius` 单数值
- **`blendMode` 两层含义**：节点级实测 `PASS_THROUGH`，Paint 级实测 `NORMAL`
- **`fills`/`strokes`/`effects` 均为数组**（空即 `[]`，不省略）
- **`strokeAlign` 实测两态**：FRAME 白板 'INSIDE'、RECTANGLE 描边 'CENTER'（端到端验收快照确认，css-map border 映射需带上）
- **节点 id 形如 `"5:1"`**（Figma 风格 server:uid）
- 自动布局字段组（layoutMode/itemSpacing/padding*/primaryAxisAlignItems/counterAxisAlignItems）在非自动布局 FRAME 上返回 `NONE`/0/`MIN` 默认值
- 文本字段实测值：`textAlignHorizontal:'LEFT'`、`textAlignVertical:'TOP'`、`textCase:'ORIGINAL'`、`textDecoration:'NONE'`、`characters` 含完整文案

### ui↔main 消息通道（2026-11-17 实测通过）

- `jsDesign.ui.onmessage = (msg) => {}` 收面板消息、`jsDesign.ui.postMessage(obj)` 回传、面板侧 `parent.postMessage({pluginMessage: obj}, '*')` 发送 / `event.data.pluginMessage` 接收——**全链路实测跑通**（探针面板即证明）
- `jsDesign.showUI(__html__, {width, height})` 面板尺寸实测生效
- 正式插件 TS 迁移时消息类型镜像自 `server/src/protocol/messages.ts`，通道 API 无需再探
