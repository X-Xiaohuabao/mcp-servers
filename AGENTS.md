# mcp-servers 开发规范

## 语言设置

**必须使用中文**与用户对话。代码标识符、命令、路径保持原样。

## 仓库定位

**X-Xiaohuabao** 的个人 MCP 集成仓库：把各类工具桥接为 MCP server，供 AI 客户端（ZCode / Claude / Cursor）调用。

## 结构与改动落点

```
mcp-servers/
├── README.md
├── packages/<name>-bridge/     # 一个集成 = 一个自洽目录
│   ├── plugin/                 # 工具侧插件（采集数据）
│   ├── server/                 # daemon + MCP server（stdio）
│   └── docs/                   # 该集成的知识沉淀（api-notes 等）
└── docs/tasks/<集成名>/active/    # 任务台账（目录与 packages/ 集成包对齐）
```

| 改什么 | 落在哪 |
|---|---|
| 新增/修改某个集成的插件与服务 | `packages/<集成名>-bridge/` 内 |
| 工具侧 API 调研结论 | 对应集成的 `docs/api-notes.md`（官方文档多为 SPA，机器抓不到，**人工阅读后沉淀于此**，不散落在对话里） |
| 跨集成的任务 | `docs/tasks/`（「集成」字段标注归属） |

## 开发规范

- 工具侧插件代码运行在目标工具的沙箱内，**先用控制台/开发者工具实测 API 字段，再写实现**；未实测的 API 调用必须以 `TODO(实测):` 标注
- 外部参考实现引入前查 License 与维护状态，记录在集成目录 README
- MCP server 使用 `@modelcontextprotocol/sdk`，stdio 传输
- 数据 schema 一经消费方（ui-restore）使用，变更需同步消费方文档

## 工作流

1. 接到任务先评估是否匹配技能（task-tracker / writing-plans 等），匹配则先激活。
2. 改动前先读对应集成的 README 与 api-notes，不做猜测式修改。
3. 完成后必须验证：脚本类跑通实际执行路径（非仅语法检查），MCP server 用真实客户端连接验证。
4. 需要跨会话跟踪的任务放入 `docs/tasks/<集成名>/active/`——目录与 packages/ 集成包对齐，新建集成包时同步建任务目录，「集成」字段双保险标注。

## Git 规范

- 只提交当前会话改动的文件；提交信息说明"为什么改"
- 不提交密钥、令牌、`node_modules`、`dist/`
- **默认只 `git add` + `git commit`，不自动 push**；用户明确要求才推送

## 智能体配置

- `.zcode/` 与 `.claude/` 为双工具配置镜像，修改 `.zcode` 后运行 `pnpm agent:sync` 同步（`agent:sync:check` 校验）
- hooks 清单：SessionStart（注入 git 状态与任务）/ UserPromptSubmit（动态技能清单）/ PreToolUse（危险命令拦截）/ Stop（清理）
