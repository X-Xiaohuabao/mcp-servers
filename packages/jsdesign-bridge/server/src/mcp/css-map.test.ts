/**
 * css-map 单测：fixture 照 api-notes「实测字段结构」节 + 探针⑦观察形态构造
 * 运行：npm test（build-test.mjs 编译到 dist-test 后 node --test）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeToCss } from './css-map';
import { RawNode } from '../protocol/messages';

/** 实测"登录页面"TEXT：红字 72px 思源黑体 */
function measuredText(): RawNode {
  return {
    id: '5:3', name: '登录页面', type: 'TEXT', visible: true,
    x: 525, y: 449, width: 288, height: 105,
    fills: [{ type: 'SOLID', visible: true, opacity: 1, blendMode: 'NORMAL', color: { r: 0.9882352941176471, g: 0, b: 0 } }],
    strokes: [], strokeWeight: 0, strokeAlign: 'INSIDE', dashPattern: [],
    opacity: 1, blendMode: 'PASS_THROUGH', cornerRadius: null, rectangleCornerRadii: null, effects: [],
    layoutMode: null, itemSpacing: null, paddingLeft: null, paddingRight: null, paddingTop: null, paddingBottom: null,
    primaryAxisAlignItems: null, counterAxisAlignItems: null,
    fontSize: 72, fontName: { family: 'SourceHanSansCN', style: 'Regular' },
    lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 },
    textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP', textCase: 'ORIGINAL', textDecoration: 'NONE',
    characters: '登录页面', children: null,
  };
}

/** 实测"矩形 1"RECTANGLE：红底黑描边 */
function measuredRectangle(): RawNode {
  return {
    id: '5:5', name: '矩形 1', type: 'RECTANGLE', visible: true,
    x: 406, y: 194, width: 407, height: 141,
    fills: [{ type: 'SOLID', visible: true, opacity: 1, blendMode: 'NORMAL', color: { r: 0.8, g: 0.21568627450980393, b: 0.21568627450980393 } }],
    strokes: [{ type: 'SOLID', visible: true, opacity: 1, blendMode: 'NORMAL', color: { r: 0, g: 0, b: 0 } }],
    strokeWeight: 1, strokeAlign: 'CENTER', dashPattern: [],
    opacity: 1, blendMode: 'PASS_THROUGH', cornerRadius: 0, rectangleCornerRadii: null, effects: [],
    layoutMode: null, itemSpacing: null, paddingLeft: null, paddingRight: null, paddingTop: null, paddingBottom: null,
    primaryAxisAlignItems: null, counterAxisAlignItems: null,
    fontSize: null, fontName: null, lineHeight: null, letterSpacing: null,
    textAlignHorizontal: null, textAlignVertical: null, textCase: null, textDecoration: null,
    characters: null, children: null,
  };
}

test('实测 TEXT → css：颜色 0-1 转 rgb、字号字体、AUTO 行高出 note', () => {
  const { css, notes } = nodeToCss(measuredText());
  // 定位定案（2026-11-17）：css 轨不输出画板坐标，防文档流套用错位；坐标保真在 raw.x/raw.y
  assert.equal(css.position, undefined);
  assert.equal(css.left, undefined);
  assert.equal(css.top, undefined);
  assert.equal(css.width, '288px');
  // 0.988... * 255 = 252（四舍五入）；TEXT fills=文字色（2026-11-17 真稿对照铁律）
  assert.equal(css.color, 'rgb(252, 0, 0)');
  assert.equal(css['background-color'], undefined);
  assert.equal(css['font-size'], '72px');
  assert.equal(css['font-family'], 'SourceHanSansCN');
  assert.equal(css['font-weight'], '400');
  assert.ok(notes.some((n) => n.includes('AUTO')), 'AUTO 行高应出说明 note');
  assert.equal(css['line-height'], '108px'); // AUTO：实测规律 72 × 1.5 = 108（TODO 多样本验证）
});

test('实测 RECTANGLE → css：描边 border + strokeAlign note', () => {
  const { css, notes } = nodeToCss(measuredRectangle());
  assert.equal(css['background-color'], 'rgb(204, 55, 55)');
  assert.equal(css.border, '1px solid rgb(0, 0, 0)');
  assert.ok(notes.some((n) => n.includes('strokeAlign=CENTER')));
});

test('字重推导表：Bold→700、Medium→500、数字 style 直取', () => {
  const base = measuredText();
  const bold = { ...base, fontName: { family: 'F', style: 'Bold' } };
  assert.equal(nodeToCss(bold).css['font-weight'], '700');
  const medium = { ...base, fontName: { family: 'F', style: 'Medium' } };
  assert.equal(nodeToCss(medium).css['font-weight'], '500');
  const numeric = { ...base, fontName: { family: 'F', style: 'Weight 550' } };
  assert.equal(nodeToCss(numeric).css['font-weight'], '550');
});

test('自动布局 FRAME → flex 组', () => {
  const frame: RawNode = {
    ...measuredRectangle(),
    id: '1:1', name: '容器', type: 'FRAME',
    layoutMode: 'HORIZONTAL', itemSpacing: 8,
    paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
    primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER',
  };
  const { css } = nodeToCss(frame);
  assert.equal(css.display, 'flex');
  assert.equal(css['flex-direction'], 'row');
  assert.equal(css.gap, '8px');
  assert.equal(css.padding, '12px 16px 12px 16px');
  assert.equal(css['justify-content'], 'space-between');
  assert.equal(css['align-items'], 'center');
});

test('未实测分支守卫：渐变/图片填充出 note 不臆造；阴影按字段形态输出', () => {
  const node: RawNode = {
    ...measuredRectangle(),
    fills: [
      { type: 'GRADIENT_LINEAR' },
      { type: 'IMAGE' },
    ] as RawNode['fills'],
    effects: [
      {
        type: 'DROP_SHADOW',
        offset: { x: 0, y: 4 },
        radius: 12,
        color: { r: 0, g: 0, b: 0, a: 0.25 },
      },
    ] as RawNode['effects'],
  };
  const { css, notes } = nodeToCss(node);
  assert.equal(css['background-color'], undefined);
  assert.ok(notes.some((n) => n.includes('GRADIENT_LINEAR')));
  assert.ok(notes.some((n) => n.includes('IMAGE')));
  assert.equal(css['box-shadow'], '0px 4px 12px rgba(0, 0, 0, 0.25)');
});

test('不可见节点 → display:none 且跳过其余映射', () => {
  const node = { ...measuredText(), visible: false };
  const { css, notes } = nodeToCss(node);
  assert.equal(css.display, 'none');
  assert.equal(css['font-size'], undefined);
  assert.equal(notes.length, 0);
});

test('圆角：cornerRadius 与 rectangleCornerRadii 两形态', () => {
  const single = { ...measuredRectangle(), cornerRadius: 8 };
  assert.equal(nodeToCss(single).css['border-radius'], '8px');
  const multi = { ...measuredRectangle(), cornerRadius: null, rectangleCornerRadii: [4, 8, 4, 8] };
  assert.equal(nodeToCss(multi).css['border-radius'], '4px 8px 4px 8px');
});
