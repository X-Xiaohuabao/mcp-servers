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

// --- 活动任务（task-tracker 约定：docs/tasks/{rn,harmony,shared}/active/）---
// 按端分组注入，每端最多 4 条，防上下文膨胀
const ENDS = [
  { key: 'rn', label: 'rn（apps/rn-app、apps/expo-spike）' },
  { key: 'harmony', label: 'harmony（apps/harmony-app）' },
  { key: 'shared', label: 'shared（packages/*、Bridge 协议）' }
];
const MAX_PER_END = 4;
const endSections = [];
for (const { key, label } of ENDS) {
  try {
    const tasks = fs
      .readdirSync(path.join(projectRoot, 'docs', 'tasks', key, 'active'))
      .filter(f => f.endsWith('.md'))
      .slice(0, MAX_PER_END);
    if (tasks.length > 0) {
      endSections.push(`- ${label}: ${tasks.join('、')}`);
    }
  } catch {
    // 端目录不存在则跳过
  }
}
if (endSections.length > 0) {
  sections.push(
    `## 活动任务（按端，docs/tasks/<端>/active/）\n` +
    endSections.join('\n') +
    `\n继续未完成任务前，先读取对应任务文件恢复上下文。`
  );
}

if (sections.length === 0) {
  process.exit(0);
}

console.log(JSON.stringify({ additionalContext: sections.join('\n\n') }));
process.exit(0);
