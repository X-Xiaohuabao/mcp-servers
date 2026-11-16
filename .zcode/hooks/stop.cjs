#!/usr/bin/env node
/**
 * Stop Hook - 回答结束时触发（ZCode 版）
 * 功能: 清理 Windows `> nul` 误用产生的 nul 文件
 */

const fs = require('fs');
const path = require('path');

// 项目根：优先取 hook 注入的项目目录环境变量，回退到当前工作目录
const projectRoot =
  process.env.ZCODE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();

// 清理可能误创建的 nul 文件（Windows 下 > nul 可能创建该文件）
// 递归查找并删除项目下所有 nul 文件
const findAndDeleteNul = (dir, depth = 0) => {
  if (depth > 5) return; // 限制递归深度
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'nul') {
        fs.unlinkSync(fullPath);
        console.error(`🧹 已清理: ${fullPath}`);
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        findAndDeleteNul(fullPath, depth + 1);
      }
    }
  } catch {
    // 访问失败时静默忽略
  }
};
findAndDeleteNul(projectRoot);

process.exit(0);
