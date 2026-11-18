/**
 * svg-css 单测：fixture 照探针⑨真稿样本构造（阴影 filter 照「车辆管理」卡片原样；渐变照官方 linearGradient 形态）
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCssFromSvg } from './svg-css';

/** 探针⑨真稿样本：车辆管理卡片（阴影 0 0 15px rgba(222,233,255,1) 的官方 filter 形态） */
const CARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1235" height="733"><g filter="url(#filter_35_279)"><path fill="#F7FAFD" d="M26 16L1209 16C1214.52 16"></path><path fill-rule="evenodd" fill="rgba(209, 225, 251, 1)" d="M1209 15L26 15"></path></g><defs><filter id="filter_35_279" x="0" y="0" width="1235" height="733" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="feFloodId_35_279"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha_35_279"/><feOffset dx="0" dy="0"/><feGaussianBlur stdDeviation="7.5"/><feComposite in2="hardAlpha_35_279" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.8705882352941177 0 0 0 0 0.9137254901960784 0 0 0 0 1 0 0 0 1 0"/><feBlend mode="normal" in2="feFloodId_35_279" result="dropShadow_1_35_279"/><feBlend mode="normal" in="SourceGraphic" in2="dropShadow_1_35_279" result="shape_35_279"/></filter></defs></svg>`;

test('真稿阴影 filter → box-shadow（stdDeviation×2=blur、系数×255=RGB、feOffset=偏移）', () => {
  const { css, warnings } = extractCssFromSvg(CARD_SVG);
  assert.equal(css['box-shadow'], '0px 0px 15px rgba(222, 233, 255, 1)');
  assert.equal(css['background-image'], undefined); // 该卡无渐变
  assert.equal(warnings.length, 0);
});

test('linearGradient → background-image（方向向量转 CSS 角度 + stops 百分比）', () => {
  const svg = `<svg><defs><linearGradient id="g_1_2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF7A00"/><stop offset="1" stop-color="#00C7BA"/></linearGradient></defs><rect fill="url(#g_1_2)"/></svg>`;
  const { css } = extractCssFromSvg(svg);
  assert.equal(css['background-image'], 'linear-gradient(90deg, #FF7A00 0%, #00C7BA 100%)');
});

test('纵向渐变 → 180deg；多 gradient 取首个并出 warning', () => {
  const svg = `<svg><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF"/><stop offset="0.5" stop-color="#888"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#111"/></linearGradient></defs></svg>`;
  const { css, warnings } = extractCssFromSvg(svg);
  assert.equal(css['background-image'], 'linear-gradient(180deg, #FFF 0%, #888 50%)');
  assert.ok(warnings.some((w) => w.includes('2 个 linearGradient')));
});

test('无 gradient/filter 的 SVG → 空结果不抛错；畸形 values 出 warning 不产 box-shadow', () => {
  assert.deepEqual(extractCssFromSvg('<svg><rect/></svg>'), { css: {}, warnings: [] });
  const broken = `<svg><defs><filter id="f"><feGaussianBlur stdDeviation="abc"/><feColorMatrix values="bad"/></filter></defs></svg>`;
  const { css, warnings } = extractCssFromSvg(broken);
  assert.equal(css['box-shadow'], undefined);
  assert.ok(warnings.length > 0);
});
