#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - 强制技能评估 (双端工程版, ZCode 版)
 * 功能: 开发场景下，将 Skills 激活率从约 25% 提升到 90% 以上
 * 适配说明:
 * - ZCode 通过 stdout JSON 的 additionalContext 键把内容注入对话
 * - 技能清单不再硬编码，运行时扫描 .zcode/skills 下各 SKILL.md 的
 *   frontmatter（name + 触发词 行）动态生成，新增技能自动进入清单
 */

const fs = require('fs');
const path = require('path');

let inputData = '';
try {
  inputData = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(inputData);
} catch {
  process.exit(0);
}

const prompt = (input.prompt || '').trim();

// 恢复会话时跳过，防止上下文溢出死循环
const skipPatterns = [
  'continued from a previous conversation',
  'ran out of context',
  'No code restore',
  'Conversation compacted',
  'commands restored',
  'context window',
  'session is being continued'
];

if (skipPatterns.some(p => prompt.toLowerCase().includes(p.toLowerCase()))) {
  process.exit(0);
}

// 斜杠命令已是明确意图，跳过二次激活
const isSlashCommand = /^\/[^\/\s]+$/.test(prompt.split(/\s/)[0]);
const isExpandedCommand = /<command-name>/.test(prompt);

if (isSlashCommand || isExpandedCommand) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 动态扫描技能清单
// 项目根优先取 hook 注入的项目目录环境变量，回退到当前工作目录
// ---------------------------------------------------------------------------
const projectRoot =
  process.env.ZCODE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const skillsRoot = path.join(projectRoot, '.zcode', 'skills');

// 从 SKILL.md frontmatter 提取 name 与触发词（无触发词行时回退到描述首行）
const extractSkill = (skillMdPath) => {
  try {
    const text = fs.readFileSync(skillMdPath, 'utf8');
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return null;
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const triggerMatch = fm.match(/^\s*触发词[：:]\s*(.+)$/m);
    let trigger = triggerMatch ? triggerMatch[1].trim() : '';
    if (!trigger) {
      // 单行 description 格式（description: Use when ...）
      const inlineDesc = fm.match(/^description:\s*(.+)$/m);
      if (inlineDesc && inlineDesc[1].trim() && !/^\|/.test(inlineDesc[1].trim())) {
        trigger = inlineDesc[1].trim();
      } else {
        // 多行块格式回退：取首个内容行
        const descLine = fm
          .split(/\r?\n/)
          .map(l => l.trim())
          .find(l => l && !/^(name|description):/.test(l) && !l.startsWith('|') && !l.startsWith('-'));
        trigger = descLine || '';
      }
    }
    if (trigger.length > 80) trigger = trigger.slice(0, 80) + '…';
    if (!nameMatch || !trigger) return null;
    return { name: nameMatch[1].trim(), trigger };
  } catch {
    return null;
  }
};

let skillLines = [];
try {
  skillLines = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => extractSkill(path.join(skillsRoot, e.name, 'SKILL.md')))
    .filter(Boolean)
    .map(s => `- ${s.name}: ${s.trigger}`);
} catch {
  // skills 目录不存在时静默跳过，不注入
}
if (skillLines.length === 0) {
  process.exit(0);
}

const instructions = `## 强制技能激活流程（必须执行）

### 步骤 1 - 评估（必须在响应中明确展示）

针对用户问题，列出匹配的技能：\`技能名: 理由\`，无匹配则写"无匹配技能"

可用技能（共 ${skillLines.length} 个，自动扫描自 .zcode/skills/）：
${skillLines.join('\n')}

### 步骤 2 - 激活

对每个匹配的技能逐个激活：一次激活一个，等它返回后再激活下一个。无匹配则跳过本步。

### 步骤 3 - 实现

所有匹配技能激活完成后，再开始动手实现。

要点：先评估 → 再激活 → 后实现；不要跳过激活直接实现，也不要漏掉匹配的技能。`;

// ZCode: stdout 必须是合法 JSON，additionalContext 键的内容会注入对话
console.log(JSON.stringify({ additionalContext: instructions }));
process.exit(0);
