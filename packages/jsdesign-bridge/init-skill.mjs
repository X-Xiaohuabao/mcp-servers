#!/usr/bin/env node
/**
 * jsdesign-bridge 技能安装脚本（消费侧初始化）
 *
 * 把本包 skill/SKILL.md 拷贝到目标工程的智能体技能目录：
 *   - .zcode/skills/jsdesign-bridge/   （ZCode）
 *   - .claude/skills/jsdesign-bridge/  （Claude Code）
 *
 * 用法（在本包根目录执行）：
 *   node init-skill.mjs                     自动检测：工程根存在 .zcode/ 或 .claude/ 才拷对应侧
 *   node init-skill.mjs --dir D:/my-app     指定目标工程根（默认当前工作目录）
 *   node init-skill.mjs --all               两个目录都不存在时也强制创建并拷贝
 *   node init-skill.mjs --list              只打印将执行的动作，不写文件
 *
 * 退出码：0=成功或无事可做；1=参数错误/源缺失。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const skillSource = path.join(pkgRoot, 'skill', 'SKILL.md');
const AGENTS = [
  { key: 'zcode', dir: '.zcode', label: 'ZCode' },
  { key: 'claude', dir: '.claude', label: 'Claude Code' },
];

const args = process.argv.slice(2);
const dirFlag = args.indexOf('--dir');
const projectRoot = path.resolve(dirFlag >= 0 ? (args[dirFlag + 1] ?? '') : process.cwd());
const forceAll = args.includes('--all');
const listOnly = args.includes('--list');

if (!fs.existsSync(skillSource)) {
  console.error(`源缺失：${skillSource}（请在包根目录运行本脚本）`);
  process.exit(1);
}
if (dirFlag >= 0 && !args[dirFlag + 1]) {
  console.error('--dir 需要一个路径参数，例如：node init-skill.mjs --dir D:/my-app');
  process.exit(1);
}

console.log(`目标工程根：${projectRoot}`);
let done = 0;
const skipped = [];

for (const agent of AGENTS) {
  const agentRoot = path.join(projectRoot, agent.dir);
  const agentPresent = fs.existsSync(agentRoot);
  if (!agentPresent && !forceAll) {
    skipped.push(agent.label);
    continue;
  }
  const targetDir = path.join(agentRoot, 'skills', 'jsdesign-bridge');
  const target = path.join(targetDir, 'SKILL.md');
  const action = `${agent.label}: ${target}`;
  if (listOnly) {
    console.log(`[dry-run] ${action}`);
    continue;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(skillSource, target);
  console.log(`✓ ${agent.label} 技能已安装：${target}`);
  done += 1;
}

if (skipped.length === AGENTS.length) {
  console.log('\n工程根下未发现 .zcode/ 或 .claude/ 目录。');
  console.log('两种选择：①该工程不使用智能体，无需安装；②强制安装到两个目录：node init-skill.mjs --all');
  process.exit(0);
}
if (skipped.length > 0) {
  console.log(`跳过（工程根无对应目录，可用 --all 强制安装）：${skipped.join('、')}`);
}
console.log(done > 0 ? `\n完成。之后"设计稿还原 / 切图 / 画板清单"等说法即可命中工作流指引。` : '\n未写入任何文件。');
