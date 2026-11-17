# jsdesign-bridge 安装与使用（消费侧）

把即时设计（JSDesign）设计稿桥接为 MCP 工具：读取画板/节点/样式、规则化枚举资产、按需切图。

## 前置条件

1. **JSDesign 桌面端**，并在其中导入 `plugin/manifest.json` 开发插件（huabao-design-bridge）
2. **Node.js ≥ 18**（推荐 22）：`node -v` 验证
3. 构建产物已生成：`server/dist/index.js` + `server/dist/daemon.js` + `plugin/dist/*`（源码包需先在各目录 `npm install && npm run build`；二进制分发包已含）

## 安装（MCP 配置）

写入用户级配置 `~/.zcode/cli/config.json`（ZCode）或对应客户端的 MCP 配置：

```json
{
  "mcp": {
    "servers": {
      "jsdesign-bridge": {
        "type": "stdio",
        "command": "<node 绝对路径>",
        "args": ["<本包绝对路径>/server/dist/index.js"],
        "timeoutMs": 60000
      }
    }
  }
}
```

可选环境变量（加在节点内 `env` 字段）：

| 变量 | 作用 | 默认 |
|---|---|---|
| `JSDESIGN_BRIDGE_PORT` | daemon WS 端口 | 1120（协议常量，多环境隔离用） |
| `JSDESIGN_BRIDGE_ASSETS_DIR` | 切图默认落盘目录 | `<工作目录>/jsdesign-assets`（建议调用时传 `dir` 指向应用工程内临时目录） |

配置后重启客户端/新开会话即生效。daemon 为独立单例进程，**首次使用时自动拉起**，空闲 15 分钟自动回收，无需手动管理。

## 技能（触发词）安装

**自动安装（推荐）**：在目标工程根目录运行包内自带脚本——自动检测 `.zcode/` / `.claude/` 并拷贝技能：

```bash
node init-skill.mjs                # 自动检测（无目录则提示）
node init-skill.mjs --all          # 强制安装到两个目录
node init-skill.mjs --dir D:/my-app  # 指定目标工程根
```

**手工安装**（脚本不可用时）：拷贝本包 `skill/SKILL.md` 到**各智能体的技能目录**（两边都拷，双工具环境才都能触发）：

| 智能体 | 项目级技能目录 |
|---|---|
| ZCode | `<工程根>/.zcode/skills/jsdesign-bridge/` |
| Claude Code | `<工程根>/.claude/skills/jsdesign-bridge/` |

安装后"设计稿还原 / 切图 / 画板清单 / 样式标注"等说法会稳定命中工作流指引。

> 本仓开发者无需任何手工操作：`pnpm agent:sync` 会自动把 `packages/*/skill/` 收割到 `.zcode/skills/` 并镜像到 `.claude/skills/`（`.zcode` 侧副本为生成物勿手改，改 `packages/*/skill/` 源）。

## 五个工具

| 工具 | 用途 |
|---|---|
| `list_frames` | 画板清单。**每次调用强制重新采集 = 文档基线刷新**（切换设计文件后必须重调） |
| `get_structure(frameId)` | 单画板轻量结构树（id/名称/类型/尺寸），定位节点 id |
| `get_node_css(nodeId)` | 单节点样式双轨：`css`（可直接套用，**不含定位**）+ `raw`（原语保真） |
| `list_assets(frameId)` | 规则化枚举候选资产（bitmap / vector 分类，含 id/名称/尺寸） |
| `export_asset(nodeId, {format, scale, dir})` | 按需切图：原图字节 / 位图 / SVG，落盘返回路径 |

## 标准工作流

```
list_frames（基线刷新）
  → get_structure(画板)          定位节点 id
    → get_node_css(节点)          样式还原（css 轨直接套用；布局按结构树推导，画板坐标勿入文档流）
    → list_assets(画板)           资产清单人工过目
      → 位图：人工从设计稿下载放工程目录，AI 写占位引用
      → 缺失图标/复杂矢量：export_asset 按需切图（dir 指向工程内临时目录）
```

## 使用规则

- 桥只读**当前激活的设计文件**；**只让目标文件运行插件**（其它文件页签的插件面板关掉，防连接抢占）
- **切换设计文件后重调一次 `list_frames`**（基线刷新，防旧文档缓存串数据）
- 多会话可并行使用（daemon 单例 + 客户端接入）；样式还原主流程图片走"人工下载 + AI 引用替换"，自动切图为按需兜底

## 常见错误对照

| 错误信息 | 处理 |
|---|---|
| 插件未连接：请打开并运行… | JSDesign 打开目标文件并运行插件，等面板绿点 |
| 文档中没有画板 | 当前文件无画板，或目标文件未激活——切到目标文件重调 list_frames |
| 画板 xxx 不在缓存 | 先 get_structure(frameId) 建缓存 |
| 超 8MB 上限 | 调低 export_asset 的 scale，或改选更小子节点 |
| 返回的 fileName 与目标文件不符 | 连接的是另一个文件的插件——切到目标文件重跑插件后再试 |
| daemon 连接失败（已尝试自动拉起） | 手动运行 `node server/dist/daemon.js` 后重试；或检查端口 1120 占用 |
