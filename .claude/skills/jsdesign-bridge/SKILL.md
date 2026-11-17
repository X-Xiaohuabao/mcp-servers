---
name: jsdesign-bridge
# 本文件为分发源：scripts/sync-agent-config.mjs 会把它收割到 .claude/skills/ 与 .claude/skills/（生成物勿手改，改这里）
description: |
  即时设计（JSDesign）设计稿还原与切图工作流：通过 jsdesign-bridge MCP 工具链读取画板结构、
  精确样式标注、规则化枚举资产、按需切图导出，产出还原代码。

  触发场景：
  - 设计稿还原 / 按设计稿写页面样式 / ui-restore
  - 从即时设计导出图标、图片素材（切图）
  - 查询设计稿的画板清单、节点结构、样式标注
  - 用户提到"画板 / 设计稿 / 即时设计 / 切图 / 样式标注"且需要程序化读取设计数据时
---

# jsdesign-bridge 使用工作流

前置条件（详见集成包 docs/mcp-setup.md）：JSDesign 桌面端已打开**目标设计文件**；huabao-design-bridge 插件在目标文件中运行（面板绿点 = 连接正常）。

## 工具链（按序）

```
list_frames                 画板清单（每次强制重新采集 = 文档基线刷新）
  → get_structure(frameId)  单画板轻量结构树（id/名称/类型/尺寸，定位节点用）
    → get_node_css(nodeId)  单节点精确样式：css 轨可直接套用（不含定位）+ raw 轨原语保真
    → list_assets(frameId)  规则化枚举候选资产（bitmap / vector 分类）
      → export_asset(nodeId) 按需切图：IMAGE 填充走原图字节，纯图形走 SVG（落盘返路径）
```

## 核心规则

- **样式**：css 轨不含 left/top（画板坐标套文档流会错位）；文档流布局按结构树的兄弟关系推导 flex/gap/margin；坐标在 raw.x/raw.y 仅作参考
- **资产分层**：bitmap（IMAGE 填充）逐个导原图；vector 图标优先组件库复用，库中没有的才切 SVG；纯色/渐变背景与文本用 CSS 还原，不切图
- **多文件**：桥只读当前激活的设计文件；切换文件后**重调 list_frames 刷新基线**；只让目标文件运行插件（其它页签的插件面板关掉，防连接抢占）
- **多会话**：daemon 单例自动拉起/复用，多个会话可同时使用；空闲 15 分钟自动回收
- **顺序依赖**：list_assets / get_node_css 依赖缓存，对同一画板先 get_structure 建缓存

## 常见错误对照

| 错误信息 | 处理 |
|---|---|
| 插件未连接：请打开并运行… | JSDesign 打开目标文件并运行插件，等面板绿点 |
| 文档中没有画板 | 当前文件无画板，或目标文件未激活——切到目标文件重调 list_frames |
| 画板 xxx 不在缓存 | 先 get_structure(frameId) 建缓存 |
| 超 8MB 上限 | 调低 export_asset 的 scale，或改选更小子节点 |
| 返回的 fileName 与目标文件不符 | 连接的是另一个文件的插件——切到目标文件重跑插件后再试 |
