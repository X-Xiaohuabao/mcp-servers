/**
 * asset-bytes 单测：base64 以 Node Buffer 为对照基准（oracle），魔数探测用真实文件头
 * 运行：npm test（build-test.mjs 编译到 dist-test 后 node --test）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToBase64, detectImageExt } from './asset-bytes';

test('base64：与 Buffer 对照（空/1/2/3 字节补位边界 + 随机bulk）', () => {
  const cases: Uint8Array[] = [
    new Uint8Array(0),
    new Uint8Array([0xff]),
    new Uint8Array([0xff, 0xd8]),
    new Uint8Array([0xff, 0xd8, 0xff]),
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    new Uint8Array(Array.from({ length: 767 }, (_, i) => (i * 31 + 7) % 256)),
  ];
  for (const bytes of cases) {
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'), `长度 ${bytes.length} 不一致`);
  }
});

test('base64：SVG 文本字节往返（工具侧 Buffer 解码还原一致）', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
  const encoded = bytesToBase64(new TextEncoder().encode(svg));
  assert.equal(Buffer.from(encoded, 'base64').toString('utf-8'), svg);
});

test('魔数探测：JPEG SOI / PNG 签名 / 未知 bin', () => {
  assert.equal(detectImageExt(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])), 'jpg');
  assert.equal(detectImageExt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'png');
  assert.equal(detectImageExt(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), 'bin'); // "<svg"
  assert.equal(detectImageExt(new Uint8Array([0xff, 0xd8])), 'bin'); // 长度不足
});
