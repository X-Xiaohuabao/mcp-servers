/**
 * asset-scan 单测：覆盖判定规则四象限（位图/纯图形/含文字排除/容器下钻）
 * fixture 照 api-notes 实测字段形状构造
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RawNode } from '../protocol/messages';
import { scanGraphicAssets } from './asset-scan';

function node(partial: Partial<RawNode> & { id: string; name: string; type: string }): RawNode {
  return {
    visible: true, x: 0, y: 0, width: 24, height: 24,
    fills: null, strokes: null, strokeWeight: null, strokeAlign: null, dashPattern: null,
    opacity: 1, blendMode: 'NORMAL', cornerRadius: null, rectangleCornerRadii: null, effects: [],
    layoutMode: null, itemSpacing: null, paddingLeft: null, paddingRight: null, paddingTop: null, paddingBottom: null,
    primaryAxisAlignItems: null, counterAxisAlignItems: null,
    fontSize: null, fontName: null, lineHeight: null, letterSpacing: null,
    textAlignHorizontal: null, textAlignVertical: null, textCase: null, textDecoration: null,
    characters: null, children: null,
    ...partial,
  };
}

const IMAGE_FILL = [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: 'hash-1' }];

test('IMAGE 填充 → bitmap 候选（含不可见排除）', () => {
  const tree = node({
    id: 'f', name: '画板', type: 'FRAME',
    children: [
      node({ id: '1', name: '卡车', type: 'RECTANGLE', fills: IMAGE_FILL as RawNode['fills'], width: 40, height: 30 }),
      node({ id: '2', name: '隐藏图', type: 'RECTANGLE', visible: false, fills: IMAGE_FILL as RawNode['fills'] }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { nodeId: '1', name: '卡车', type: 'RECTANGLE', width: 40, height: 30, kind: 'bitmap' });
});

test('纯图形节点 → vector 候选；命中即停（图标内部路径不重复列出）', () => {
  const tree = node({
    id: 'f', name: '画板', type: 'FRAME',
    children: [
      node({
        id: 'clock', name: '时钟', type: 'GROUP',
        children: [
          node({ id: 'clock-path', name: '表盘', type: 'VECTOR' }),
          node({ id: 'clock-hand', name: '指针', type: 'LINE' }),
        ],
      }),
      node({ id: 'tab-icon', name: '首页图标', type: 'INSTANCE' }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.deepEqual(list.map((a) => a.nodeId), ['clock', 'tab-icon']);
  assert.ok(list.every((a) => a.kind === 'vector'));
});

test('含文字后代的 GROUP 排除，但下钻其内部独立图形', () => {
  const tree = node({
    id: 'f', name: '画板', type: 'FRAME',
    children: [
      node({
        id: 'card', name: '行卡片', type: 'GROUP',
        children: [
          node({ id: 'badge', name: '角标', type: 'TEXT', fontSize: 12, characters: '27' }),
          node({ id: 'divider', name: '装饰线', type: 'VECTOR' }),
        ],
      }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.deepEqual(list.map((a) => a.nodeId), ['divider']); // card 含文字被排除，下钻后仅独立图形入选
});

test('TEXT 与纯色矩形背景不入选；渐变背景矩形（无文字）按容器下钻', () => {
  const tree = node({
    id: 'f', name: '画板', type: 'FRAME',
    children: [
      node({ id: 'txt', name: '标题', type: 'TEXT', fontSize: 16, characters: '车辆管理' }),
      node({
        id: 'banner', name: '渐变横幅', type: 'RECTANGLE', width: 300, height: 100,
        fills: [{ type: 'GRADIENT_LINEAR', visible: true }] as RawNode['fills'],
      }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.equal(list.length, 0); // 渐变背景矩形属于 CSS 可还原，不作为图形候选
});

test('bitmap 与文本空间重叠 → overlapText 警示（烧死文字嫌疑）；无重叠不标', () => {
  const tree = node({
    id: 'f', name: '画板', type: 'FRAME',
    children: [
      node({ id: 'banner-bitmap', name: '成品横幅', type: 'RECTANGLE', width: 200, height: 60, fills: IMAGE_FILL as RawNode['fills'] }),
      node({ id: 'burned-text', name: '旧文字', type: 'TEXT', x: 20, y: 10, fontSize: 12, characters: '40分钟' }),
      node({ id: 'clean-bitmap', name: '干净大图', type: 'RECTANGLE', x: 0, y: 200, width: 200, height: 60, fills: IMAGE_FILL as RawNode['fills'] }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.equal(list.length, 2);
  assert.equal(list[0].kind, 'bitmap');
  assert.equal(list[0].overlapText, true); // 与 TEXT 空间重叠 → 烧死文字嫌疑
  assert.equal(list[1].overlapText, undefined); // 无文本重叠
});
