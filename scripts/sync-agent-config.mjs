#!/usr/bin/env node
/**
 * 把 .zcode/ 的智能体配置同步到 .claude/。
 *
 * .zcode 是单一事实源（hooks 动态扫描、命令发现都以它为准）；
 * .claude 是 Claude Code 侧的镜像。两边协议不同的文件不归本脚本管：
 *   - hooks/        ZCode 用 exit2+stderr / additionalContext，Claude 用 JSON stdout，各自手工维护
 *   - config.json   ZCode hooks 接线；Claude 侧对应 settings.json
 *   - settings*.json 仅 Claude 侧存在，不碰
 *
 * 用法：
 *   node scripts/sync-agent-config.mjs          覆盖写入
 *   node scripts/sync-agent-config.mjs --check  只校验，存在差异时退出码为 1
 *
 * 变换：文本文件（.md/.json/.svg/.txt）内容中的 `.zcode/` 路径引用替换为 `.claude/`；
 *      其余文件（图片、xlsx 等二进制）按字节复制。
 * 映射：项目根 AGENTS.md → 项目根 CLAUDE.md（不在 .claude 目录内）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(rootDir, '.zcode');
const targetRoot = path.join(rootDir, '.claude');
const checkOnly = process.argv.includes('--check');

// 同步的目录（相对 .zcode）
const SYNC_DIRS = ['skills', 'commands', 'agents', 'docs', 'templates'];
// 文本扩展名：做路径替换；其余按二进制字节复制
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.svg', '.txt']);
// 跨目录文件映射：源（相对项目根）→ 目标（相对项目根）
const FILE_MAP = new Map([['AGENTS.md', 'CLAUDE.md']]);

function transform(text) {
  return text.replaceAll('.zcode/', '.claude/');
}

function collectFiles(dir, base, result) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, base, result);
      continue;
    }
    result.push({ absolute, relativeToTargetRoot: path.relative(targetRoot, absolute) });
  }
}

function buildExpectedContent(sourceAbsolute) {
  const extension = path.extname(sourceAbsolute).toLowerCase();
  const raw = fs.readFileSync(sourceAbsolute);
  if (!TEXT_EXTENSIONS.has(extension)) return raw;
  return transform(raw.toString('utf8'));
}

function sameContent(expected, targetAbsolute) {
  if (!fs.existsSync(targetAbsolute)) return false;
  const actual = fs.readFileSync(targetAbsolute);
  if (Buffer.isBuffer(expected)) return expected.equals(actual);
  return expected === actual.toString('utf8');
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`源目录不存在: ${sourceRoot}`);
  process.exit(1);
}

// 构造同步清单：{ sourceAbsolute, targetAbsolute, mirrorRelative }
// mirrorRelative 仅目录内文件需要（用于 --check 的多余文件判定）
const entries = [];
for (const dir of SYNC_DIRS) {
  const sourceDir = path.join(sourceRoot, dir);
  if (!fs.existsSync(sourceDir)) continue;
  const files = [];
  collectFiles(sourceDir, sourceDir, files);
  for (const file of files) {
    entries.push({
      sourceAbsolute: file.absolute,
      targetAbsolute: path.join(targetRoot, dir, path.relative(sourceDir, file.absolute)),
      mirrorRelative: path.relative(targetRoot, path.join(targetRoot, dir, path.relative(sourceDir, file.absolute))),
    });
  }
}
// 项目根 AGENTS.md → 项目根 CLAUDE.md（在 .zcode/.claude 之外）
for (const [source, target] of FILE_MAP) {
  if (fs.existsSync(path.join(rootDir, source))) {
    entries.push({ sourceAbsolute: path.join(rootDir, source), targetAbsolute: path.join(rootDir, target), mirrorRelative: null });
  }
}
entries.sort((a, b) => a.targetAbsolute.localeCompare(b.targetAbsolute));

if (checkOnly) {
  // 目标侧现存文件：仅收集 SYNC_DIRS 对应目录（CLAUDE.md 在项目根，不属于镜像目录）
  const targetFiles = [];
  for (const dir of SYNC_DIRS) {
    const targetDir = path.join(targetRoot, dir);
    if (!fs.existsSync(targetDir)) continue;
    collectFiles(targetDir, targetDir, targetFiles);
  }

  const missing = [];
  const changed = [];
  for (const entry of entries) {
    const expected = buildExpectedContent(entry.sourceAbsolute);
    if (!fs.existsSync(entry.targetAbsolute)) {
      missing.push(toRelativeSafe(entry.targetAbsolute));
    } else if (!sameContent(expected, entry.targetAbsolute)) {
      changed.push(toRelativeSafe(entry.targetAbsolute));
    }
  }
  const expectedSet = new Set(entries.filter((e) => e.mirrorRelative).map((e) => e.mirrorRelative));
  const extra = targetFiles.filter((file) => !expectedSet.has(file.relativeToTargetRoot));

  if (missing.length === 0 && extra.length === 0 && changed.length === 0) {
    console.log(`agent-config 已同步（${entries.length} 个文件）`);
    process.exit(0);
  }

  if (missing.length > 0) console.error(`缺少: ${missing.join(', ')}`);
  if (extra.length > 0) console.error(`多余: ${extra.map((f) => f.relativeToTargetRoot.split(path.sep).join('/')).join(', ')}`);
  if (changed.length > 0) console.error(`不一致: ${changed.join(', ')}`);
  console.error('请运行 node scripts/sync-agent-config.mjs');
  process.exit(1);
}

for (const entry of entries) {
  fs.mkdirSync(path.dirname(entry.targetAbsolute), { recursive: true });
  const expected = buildExpectedContent(entry.sourceAbsolute);
  if (Buffer.isBuffer(expected)) {
    fs.writeFileSync(entry.targetAbsolute, expected);
  } else {
    fs.writeFileSync(entry.targetAbsolute, expected, 'utf8');
  }
}

console.log(`agent-config 同步完成（${entries.length} 个文件，.zcode → .claude）`);

function toRelativeSafe(absolute) {
  return path.relative(rootDir, absolute).split(path.sep).join('/');
}
