#!/usr/bin/env node
/**
 * SessionStart Hook - 会话启动时注入项目状态 (ZCode 版)
 * 触发: startup（新会话）/ resume（恢复会话），matcher 在 config.json 中配置
 * 功能: 自动注入 git 状态与活动任务清单，省去手动"继续任务/看进度"
 * 适配说明: stdout JSON 的 additionalContext 键把内容注入对话
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 项目根：优先取 hook 注入的项目目录环境变量，回退到当前工作目录
const projectRoot =
  process.env.ZCODE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();

const run = (cmd) => {
  try {
    return execSync(cmd, {
      cwd: projectRoot,
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
};

const sections = [];

// --- Git 状态 ---
const branch = run('git rev-parse --abbrev-ref HEAD');
if (branch) {
  const dirty = run('git status --porcelain');
  const dirtyLines = dirty ? dirty.split('\n').filter(Boolean) : [];
  const commits = run('git log --oneline -3');
  sections.push(
    `## 当前 Git 状态\n` +
    `- 分支: \`${branch}\`\n` +
    `- 未提交改动: ${dirtyLines.length} 个文件${dirtyLines.length ? `（${dirtyLines.slice(0, 8).map(l => l.slice(7)).join('、')}${dirtyLines.length > 8 ? ' 等' : ''}）` : ''}\n` +
    (commits ? `- 最近提交:\n${commits.split('\n').map(c => `  - ${c}`).join('\n')}` : '')
  );
}

// --- 活动任务（按集成：docs/tasks/<集成名>/active/，目录与 packages/<集成名> 对齐）---
const MAX_PER_INTEGRATION = 4;
try {
  const tasksRoot = path.join(projectRoot, 'docs', 'tasks');
  const integrations = fs
    .readdirSync(tasksRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'archive');
  for (const entry of integrations) {
    let tasks = [];
    try {
      tasks = fs
        .readdirSync(path.join(tasksRoot, entry.name, 'active'))
        .filter(f => f.endsWith('.md'))
        .slice(0, MAX_PER_INTEGRATION);
    } catch {
      // 该集成无 active 目录则跳过
    }
    if (tasks.length > 0) {
      const taskLines = tasks.map(f => `- ${f}`).join('\n');
      const head = '## 活动任务（按集成）';
      const line = `- ${entry.name}: ${tasks.join('、')}`;
      const tail = '\n继续未完成任务前，先读取对应任务文件恢复上下文。';
      sections.push(head + '\n' + line + tail);
    }
  }
} catch {
  // tasks 目录不存在则跳过
}

if (sections.length === 0) {
  process.exit(0);
}

console.log(JSON.stringify({ additionalContext: sections.join('\n\n') }));
process.exit(0);
