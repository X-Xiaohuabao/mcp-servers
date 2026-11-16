#!/usr/bin/env node
/**
 * SessionStart Hook - 会话启动时注入项目状态（Claude Code 版）
 * 触发: startup / resume
 * 与 ZCode 版的差异：Claude 协议下 stdout 纯文本直接注入上下文
 * 功能: 自动注入 git 状态与活动任务清单（按端分组）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
    `- 未提交改动: ${dirtyLines.length} 个文件\n` +
    (commits ? `- 最近提交:\n${commits.split('\n').map(c => `  - ${c}`).join('\n')}` : '')
  );
}

// --- 活动任务（task-tracker 约定：docs/tasks/{rn,harmony,shared}/active/）---
const ENDS = ['rn', 'harmony', 'shared'];
const MAX_PER_END = 4;
const endSections = [];
for (const key of ENDS) {
  try {
    const tasks = fs
      .readdirSync(path.join(projectRoot, 'docs', 'tasks', key, 'active'))
      .filter(f => f.endsWith('.md'))
      .slice(0, MAX_PER_END);
    if (tasks.length > 0) {
      endSections.push(`- ${key}: ${tasks.join('、')}`);
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

// Claude Code: SessionStart 的 stdout 直接注入上下文（纯文本）
console.log(sections.join('\n\n'));
process.exit(0);
