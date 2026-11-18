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

test('嵌套坐标系归一化：子 frame 内 bitmap 与画板根 TEXT 真重叠 → 标注（8:125 vs 8:128 真值）', () => {
  const tree = node({
    id: '8:1', name: '车辆管理', type: 'FRAME',
    children: [
      // 横幅容器 frame {12,652}，位图嵌在其中局部 {0,0,351,85}——绝对位 {12,652,351,85}
      node({
        id: '8:126', name: '画板 6', type: 'FRAME', x: 12, y: 652, width: 351, height: 85,
        children: [
          node({ id: '8:125', name: '我的车辆智能管理界面.png', type: 'RECTANGLE', width: 351, height: 85, fills: IMAGE_FILL as RawNode['fills'] }),
        ],
      }),
      // 活文字挂画板根 {154,674,76,58}——与横幅绝对位真重叠；旧实现按局部坐标判不出
      node({ id: '8:128', name: '45 分钟', type: 'TEXT', x: 154, y: 674, width: 76, height: 58, fontSize: 38, characters: '45 分钟' }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.equal(list.length, 1);
  assert.equal(list[0].nodeId, '8:125');
  assert.equal(list[0].overlapText, true);
});

test('跨子树局部坐标巧合不误报：状态栏时间文字不应命中车辆卡内小图标（三十五次假阳性回归）', () => {
  const tree = node({
    id: '8:1', name: '车辆管理', type: 'FRAME',
    children: [
      // 状态栏：时间文字嵌多层容器，局部 {0,1,54,20}——绝对位 {25,15,54,20}
      node({
        id: '8:2', name: 'StatusBar', type: 'INSTANCE', width: 375, height: 44,
        children: [
          node({
            id: 'left-side', name: 'Left Side', type: 'GROUP', x: 25, y: 14, width: 54, height: 21,
            children: [
              node({
                id: 'time-frame', name: '_StatusBar-time', type: 'FRAME', width: 54, height: 21,
                children: [
                  node({ id: 'time', name: '✏️ Time', type: 'TEXT', y: 1, width: 54, height: 20, fontSize: 12, characters: '9:41' }),
                ],
              }),
            ],
          }),
        ],
      }),
      // 卡车位图嵌图标 frame，局部 {7,13,37,25}——绝对位 {39,165,37,25}，与时间文字不重叠；
      // 旧实现拿两组局部坐标硬比 {7,13,37,25} vs {0,1,54,20} 误判重叠
      node({
        id: '8:64', name: '画板 2', type: 'FRAME', x: 32, y: 152, width: 50, height: 50,
        children: [
          node({ id: '7:6', name: 'truck_container.png', type: 'RECTANGLE', x: 7, y: 13, width: 37, height: 25, fills: IMAGE_FILL as RawNode['fills'] }),
        ],
      }),
    ],
  });
  const list = scanGraphicAssets(tree);
  assert.equal(list.length, 1);
  assert.equal(list[0].nodeId, '7:6');
  assert.equal(list[0].overlapText, undefined);
});
