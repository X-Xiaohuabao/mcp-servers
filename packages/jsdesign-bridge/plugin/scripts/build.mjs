// 构建脚本：沙箱无模块系统，源码多文件必须打包为单产物（bridge-dev）
// 1) src/main.ts  → dist/code.js （iife，插件沙箱主线程入口，manifest.main 指向）
// 2) src/ui/ui.ts → dist/ui.js   （iife，iframe 侧）
// 3) src/ui/template.html + dist/ui.js → 生成 ui.html（构建期注入内联 script）
//    说明：ui.html 引相对 <script src> 在即时设计沙箱未实测，内联 script 已实测可靠（探针面板即证）
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

// target=es2017：jsDesign 沙箱解析器不认 ES2019+ 语法（实测：可选 catch 绑定 `catch {` 报
// "Unexpected token {"；`?.`/`??` 同理）——esbuild 会把这三类全部转译为 es2017 等价形式
const common = { bundle: true, format: 'iife', target: 'es2017', minify: false, sourcemap: false };

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/code.js' });
await build({ ...common, entryPoints: ['src/ui/ui.ts'], outfile: 'dist/ui.js' });

// 注入（replacer 用函数形式，避免 bundle 内 $ 序列被 String.replace 误解释）
const template = readFileSync('src/ui/template.html', 'utf8');
const uiBundle = readFileSync('dist/ui.js', 'utf8');
if (!template.includes('<!--UI_BUNDLE_INJECT-->')) {
  throw new Error('template.html 缺少 <!--UI_BUNDLE_INJECT--> 占位符');
}
if (uiBundle.includes('</script>')) {
  // 防御：bundle 内出现字面 </script> 会提前终止内联 script 标签
  throw new Error('dist/ui.js 含 "</script>"，内联注入会破坏 HTML，需先转义');
}
const html = template.replace('<!--UI_BUNDLE_INJECT-->', () => `<script>\n${uiBundle}\n</script>`);
writeFileSync('ui.html', html);
console.log('[build] dist/code.js + dist/ui.js + ui.html 生成完毕');
