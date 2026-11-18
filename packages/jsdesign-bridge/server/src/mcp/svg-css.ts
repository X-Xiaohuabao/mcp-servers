/**
 * svg-css：官方 SVG → CSS 属性 的纯函数解析（svg 提取轨，补 css-map 的渐变/阴影弱分支）
 * 依据：探针⑨换算公式（api-notes「SVG 对照换算公式」节）——官方引擎已算好的最终视觉属性：
 *   linearGradient stops/坐标 → linear-gradient(角度, stops…)；feGaussianBlur stdDeviation×2=blur；
 *   feColorMatrix 末列系数×255=RGB；feOffset dx/dy=偏移
 * 边界：只解析官方生成的已知形态；多 gradient/filter 取首个并出 warning；解析失败返回空不抛错（调用方走 css-map note 兜底）
 */

export interface SvgCssExtraction {
  css: Record<string, string>;
  /** 解析过程中的取舍说明（进 get_node_css 的 notes） */
  warnings: string[];
}

const DEG = 180 / Math.PI;

/** linearGradient 向量 → CSS 角度（0deg=向上，顺时针；与 boundingBox/用户坐标无关，只取方向向量） */
function gradientAngle(x1: number, y1: number, x2: number, y2: number): number {
  const angle = Math.atan2(x2 - x1, -(y2 - y1)) * DEG;
  return Math.round(((angle % 360) + 360) % 360);
}

interface Stop {
  offset: number;
  color: string;
}

/** stop-color（hex/rgb）+ offset → CSS stop 片段 */
function parseStops(gradientBlock: string): Stop[] {
  const stops: Stop[] = [];
  const stopRe = /<stop[^>]*>/g;
  for (const tag of gradientBlock.match(stopRe) ?? []) {
    const offsetMatch = tag.match(/offset="([^"]+)"/);
    const colorMatch = tag.match(/stop-color="([^"]+)"/);
    if (!offsetMatch || !colorMatch) continue;
    const rawOffset = offsetMatch[1].endsWith('%') ? parseFloat(offsetMatch[1]) / 100 : parseFloat(offsetMatch[1]);
    stops.push({ offset: rawOffset, color: colorMatch[1] });
  }
  return stops;
}

function parseLinearGradient(svg: string, warnings: string[]): string | null {
  const blocks = svg.match(/<linearGradient[^>]*>[\s\S]*?<\/linearGradient>/g) ?? [];
  const block = blocks[0];
  if (!block) return null;
  if (blocks.length > 1) warnings.push(`SVG 含 ${blocks.length} 个 linearGradient，取首个（其余未解析）`);
  const attrs = block.match(/<linearGradient[^>]*>/)?.[0] ?? '';
  const num = (name: string, fallback: number): number => {
    const m = attrs.match(new RegExp(`${name}="([\\d.+-]+)"`));
    return m ? parseFloat(m[1]) : fallback;
  };
  const x1 = num('x1', 0);
  const y1 = num('y1', 0);
  const x2 = num('x2', 1);
  const y2 = num('y2', 0);
  const stops = parseStops(block);
  if (stops.length < 2) {
    warnings.push('linearGradient 的 stop 不足 2 个，未解析');
    return null;
  }
  const angle = gradientAngle(x1, y1, x2, y2);
  const stopText = stops
    .map((s) => `${s.color} ${Math.round(s.offset * 1000) / 10}%`)
    .join(', ');
  return `linear-gradient(${angle}deg, ${stopText})`;
}

interface ShadowParts {
  dx: number;
  dy: number;
  blur: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** filter 块 → box-shadow 参数（stdDeviation×2=blur；feColorMatrix 末列×255=RGB；feOffset=偏移） */
function parseDropShadow(svg: string, warnings: string[]): ShadowParts | null {
  const blocks = svg.match(/<filter[^>]*>[\s\S]*?<\/filter>/g) ?? [];
  const block = blocks[0];
  if (!block) return null;
  if (blocks.length > 1) warnings.push(`SVG 含 ${blocks.length} 个 filter，取首个`);
  const numAttr = (tag: string, name: string): number | null => {
    const m = tag.match(new RegExp(`${name}="(-?[\\d.]+)"`));
    return m ? parseFloat(m[1]) : null;
  };
  const blurTag = block.match(/<feGaussianBlur[^>]*>/)?.[0];
  const offsetTag = block.match(/<feOffset[^>]*>/)?.[0];
  if (!blurTag) return null;
  const stdDeviation = numAttr(blurTag, 'stdDeviation');
  if (stdDeviation === null) {
    warnings.push('feGaussianBlur 无 stdDeviation（TODO 实测形态），未生成 box-shadow');
    return null;
  }
  const dx = offsetTag ? (numAttr(offsetTag, 'dx') ?? 0) : 0;
  const dy = offsetTag ? (numAttr(offsetTag, 'dy') ?? 0) : 0;
  // 官方 filter 链含多个 feColorMatrix（首个是 hardAlpha 全零 RGB 矩阵）——取第一个带颜色系数的
  const matrixTags = block.match(/<feColorMatrix[^>]*values="[^"]*"[^>]*>/g) ?? [];
  for (const tag of matrixTags) {
    const valuesStr = tag.match(/values="([^"]*)"/)?.[1];
    if (!valuesStr) continue;
    const values = valuesStr.trim().split(/[\s,]+/).map(parseFloat);
    if (values.length < 20 || values.some((v) => Number.isNaN(v))) continue;
    if (!(values[4] > 0 || values[9] > 0 || values[14] > 0)) continue; // 跳过纯 alpha 矩阵
    const r = Math.round(values[4] * 255);
    const g = Math.round(values[9] * 255);
    const b = Math.round(values[14] * 255);
    // alpha 行（[15..19]）：系数 [18] + 偏移 [19]；官方形态 "0 0 0 1 0" → 1（半透明阴影的 flood-opacity 链路 TODO 实测）
    const a = Math.min(Math.max(values[18] + values[19], 0), 1);
    return { dx, dy, blur: stdDeviation * 2, r, g, b, a };
  }
  warnings.push('filter 未找到带颜色系数的 feColorMatrix（TODO 实测形态），未生成 box-shadow');
  return null;
}

/** SVG 字符串 → 渐变背景与阴影 CSS（只产出 css-map 未覆盖的弱分支，纯色/字体仍以 css-map 为准） */
export function extractCssFromSvg(svg: string): SvgCssExtraction {
  const warnings: string[] = [];
  const css: Record<string, string> = {};

  const gradient = parseLinearGradient(svg, warnings);
  if (gradient) css['background-image'] = gradient;

  const shadow = parseDropShadow(svg, warnings);
  if (shadow) {
    const { dx, dy, blur, r, g, b, a } = shadow;
    css['box-shadow'] = `${dx}px ${dy}px ${blur}px rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return { css, warnings };
}
