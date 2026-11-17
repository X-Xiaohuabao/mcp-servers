// server 构建：双入口——dist/index.js（MCP 配置拉起，stdio+daemon 客户端）+ dist/daemon.js（独立单例进程）
import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  // ESM 产物内依赖包以 CJS require 引用 Node 内置模块（events 等），需注入 createRequire 桥
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
};

await build({ ...shared, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({ ...shared, entryPoints: ['src/daemon/main.ts'], outfile: 'dist/daemon.js' });
console.log('[build] dist/index.js + dist/daemon.js 生成完毕');
