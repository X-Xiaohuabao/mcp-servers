/**
 * get-structure 布局推断单测：row/column/mixed/单子节点/隐藏子节点剔除
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RawNode } from '../protocol/messages';
import { inferLayout, lightTree } from './tools/get-structure';

function node(id: string, x: number, y: number, width = 50, height = 30, visible = true): RawNode {
  return {
    id, name: id, type: 'FRAME', visible, x, y, width, height,
    fills: null, strokes: null, strokeWeight: null, strokeAlign: null, dashPattern: null,
    opacity: visible ? 1 : 0, blendMode: 'NORMAL', cornerRadius: null, rectangleCornerRadii: null, effects: [],
    layoutMode: null, itemSpacing: null, paddingLeft: null, paddingRight: null, paddingTop: null, paddingBottom: null,
    primaryAxisAlignItems: null, counterAxisAlignItems: null,
    fontSize: null, fontName: null, lineHeight: null, letterSpacing: null,
    textAlignHorizontal: null, textAlignVertical: null, textCase: null, textDecoration: null,
    characters: null, children: null,
  };
}

test('横向排列（y 中心相近）→ row', () => {
  const children = [node('a', 10, 100, 40, 20), node('b', 60, 102, 40, 16), node('c', 110, 98, 40, 24)];
  assert.equal(inferLayout(children), 'row');
});

test('纵向排列（x 中心相近）→ column', () => {
  const children = [node('a', 100, 10, 60, 20), node('b', 102, 40, 56, 20), node('c', 98, 70, 64, 20)];
  assert.equal(inferLayout(children), 'column');
});

test('既不同行也不同列 → mixed；少于 2 个可见子节点 → undefined', () => {
  assert.equal(inferLayout([node('a', 10, 10), node('b', 200, 200)]), 'mixed');
  assert.equal(inferLayout([node('a', 10, 10)]), undefined);
});

test('隐藏子节点不参与推断（visible=false 或 opacity=0）', () => {
  const children = [
    node('a', 10, 100, 40, 20),
    node('b', 60, 100, 40, 20),
    node('ghost', 300, 300, 50, 50, false), // 隐藏元素不打乱行列判定
    { ...node('fade', 300, 300, 50, 50), opacity: 0 },
  ];
  assert.equal(inferLayout(children), 'row');
});

test('lightTree：pos 记录相对父容器位置', () => {
  const tree = lightTree(node('a', 120, 80, 50, 30));
  assert.deepEqual(tree.pos, [120, 80]);
});

test('lightTree：padding 推断（容器边界 - 子节点包围盒，四向独立）', () => {
  // 容器 375×200；子节点 x=16 y=12 w=343 h=176 → padding 上12 右16 下12 左16
  const tree = lightTree({
    ...node('f', 0, 0, 375, 200),
    children: [node('child', 16, 12, 343, 176)],
  });
  assert.deepEqual(tree.padding, [12, 16, 12, 16]);
});

test('lightTree：row 布局等距 gap 标注；不等距省略', () => {
  const even = lightTree({
    ...node('f', 0, 0, 300, 50),
    children: [node('a', 0, 0, 50, 50), node('b', 66, 0, 50, 50), node('c', 132, 0, 50, 50)], // gap=16
  });
  assert.equal(even.gap, 16);
  const uneven = lightTree({
    ...node('f', 0, 0, 300, 50),
    children: [node('a', 0, 0, 50, 50), node('b', 66, 0, 50, 50), node('c', 200, 0, 50, 50)], // 16 / 84
  });
  assert.equal(uneven.gap, undefined);
});
