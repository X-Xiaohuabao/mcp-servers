// 测试编译：src/**/*.test.ts → dist-test/*.js（bundle 打入被测模块），供 node --test 运行
import { build } from 'esbuild';
import { readdirSync, mkdirSync } from 'node:fs';

function findTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) findTests(full, out);
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const tests = findTests('src');
if (tests.length === 0) throw new Error('src 下未找到 *.test.ts');

mkdirSync('dist-test', { recursive: true });
for (const t of tests) {
  const outfile = `dist-test/${t.split('/').pop().replace(/\.ts$/, '.js')}`;
  await build({
    entryPoints: [t],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    outfile,
  });
}
console.log(`[build-test] ${tests.length} 个测试文件编译到 dist-test/`);
