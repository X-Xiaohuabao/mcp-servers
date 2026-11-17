/**
 * serialize 单测：fixture 照 api-notes「实测字段结构」节的节点形状构造（普通对象，无需 jsDesign）
 * 运行：pnpm/npm test（build-test.mjs 编译到 dist-test 后 node --test）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectFrameInfos, serializeFrame, SourceNode } from './serialize';
import { MAX_SNAPSHOT_DEPTH, RawNode, SolidPaint } from '../types';

/** 实测"注册"画板形状：FRAME 白底 + TEXT 子节点 */
function measuredSignupFrame(): SourceNode {
  return {
    id: '5:1', name: '注册', type: 'FRAME', visible: true,
    x: -733, y: 674, width: 1440, height: 1024,
    fills: [{ type: 'SOLID', visible: true, opacity: 1, blendMode: 'NORMAL', color: { r: 1, g: 1, b: 1 } }],
    strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE', dashPattern: [],
    opacity: 1, blendMode: 'PASS_THROUGH', cornerRadius: 0, rectangleCornerRadii: null, effects: [],
    layoutMode: 'NONE', itemSpacing: 0, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN',
    fontSize: null, fontName: null, lineHeight: null, letterSpacing: null,
    textAlignHorizontal: null, textAlignVertical: null, textCase: null, textDecoration: null, characters: null,
    children: [{
      id: '5:4', name: '注册页面', type: 'TEXT', visible: true,
      x: 484, y: 460, width: 288, height: 105,
      fills: [{ type: 'SOLID', visible: true, opacity: 1, blendMode: 'NORMAL', color: { r: 0, g: 0.78, b: 0.73 } }],
      strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE', dashPattern: [],
      opacity: 1, blendMode: 'PASS_THROUGH', cornerRadius: null, rectangleCornerRadii: null, effects: [],
      layoutMode: null, itemSpacing: null, paddingLeft: null, paddingRight: null, paddingTop: null, paddingBottom: null,
      primaryAxisAlignItems: null, counterAxisAlignItems: null,
      fontSize: 72, fontName: { family: 'SourceHanSansCN', style: 'Regular' },
      lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 },
      textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP', textCase: 'ORIGINAL', textDecoration: 'NONE',
      characters: '注册页面',
    }],
  };
}

test('实测画板 → 自包含快照：字段保真 + 计数', () => {
  const snap = serializeFrame(measuredSignupFrame(), '页面 1');
  assert.equal(snap.frameId, '5:1');
  assert.equal(snap.name, '注册');
  assert.equal(snap.pageName, '页面 1');
  assert.equal(snap.nodeCount, 2);
  assert.equal(snap.truncated, false);
  assert.equal(snap.root.type, 'FRAME');
  assert.ok(typeof snap.exportedAt === 'string' && !Number.isNaN(Date.parse(snap.exportedAt)));

  const text = snap.root.children![0] as RawNode;
  assert.equal(text.fontSize, 72);
  assert.deepEqual(text.fontName, { family: 'SourceHanSansCN', style: 'Regular' });
  assert.deepEqual(text.lineHeight, { unit: 'AUTO' });
  assert.deepEqual(text.letterSpacing, { unit: 'PIXELS', value: 0 });
  assert.equal(text.characters, '注册页面');
  // SOLID 颜色 0-1 浮点保真（alpha 在 paint.opacity，不在 color 内）
  const paint = text.fills![0] as SolidPaint;
  assert.equal(paint.type, 'SOLID');
  assert.equal(paint.color.g, 0.78);
});

test('未提供字段 → null 归一（schema 约定空值 null 非 undefined）', () => {
  const frame = measuredSignupFrame();
  delete (frame as unknown as Record<string, unknown>).dashPattern;
  delete (frame as unknown as Record<string, unknown>).cornerRadius;
  const snap = serializeFrame(frame, '页面 1');
  assert.equal(snap.root.dashPattern, null);
  assert.equal(snap.root.cornerRadius, null);
});

test('异常形态守卫：非数 fills → null、非数 fontSize → null，不抛错', () => {
  const frame = measuredSignupFrame();
  (frame as unknown as Record<string, unknown>).fills = '不是数组';
  const text = (frame.children as SourceNode[])[0] as unknown as Record<string, unknown>;
  text.fontSize = { mixed: true };
  const snap = serializeFrame(frame, '页面 1');
  assert.equal(snap.root.fills, null);
  assert.equal(snap.root.children![0].fontSize, null);
});

test('深度截断：超 MAX_SNAPSHOT_DEPTH 标记 truncated 且停止展开', () => {
  let node: SourceNode | null = null;
  for (let i = 0; i < MAX_SNAPSHOT_DEPTH + 5; i++) {
    node = { id: `n${i}`, name: `L${i}`, type: 'FRAME', visible: true, children: node ? [node] : [] } as SourceNode;
  }
  const snap = serializeFrame(node!, '页面 1');
  assert.equal(snap.truncated, true);
  assert.equal(snap.nodeCount, MAX_SNAPSHOT_DEPTH + 1); // 根到深度 MAX 的节点各 1 个
  // 找到被截断的节点（深度 MAX 处）
  let cursor: RawNode = snap.root;
  for (let i = 0; i < MAX_SNAPSHOT_DEPTH; i++) cursor = cursor.children![0];
  assert.equal(cursor.truncated, true);
  assert.equal(cursor.children, null);
});

test('collectFrameInfos：跨页过滤 FRAME 且带页名', () => {
  const pages = [
    {
      name: '页面 1',
      children: [
        { id: '0:1', name: '登录', type: 'FRAME', width: 1440, height: 1024 },
        { id: '5:1', name: '注册', type: 'FRAME', width: 1440, height: 1024 },
        { id: '9:9', name: '说明文字', type: 'TEXT', width: 10, height: 10 },
      ],
    },
    { name: '页面 2', children: [] },
    { name: '空页' },
  ];
  const frames = collectFrameInfos(pages);
  assert.deepEqual(frames, [
    { frameId: '0:1', name: '登录', width: 1440, height: 1024, pageName: '页面 1' },
    { frameId: '5:1', name: '注册', width: 1440, height: 1024, pageName: '页面 1' },
  ]);
});
