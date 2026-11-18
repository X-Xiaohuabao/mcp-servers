/**
 * css-map：设计原语（RawNode）→ CSS 属性对象 的纯函数映射（css 视图）
 * 约束（bridge-dev）：零副作用、零 jsDesign API、显式传参（并发安全，fan-out 场景多工具并行调用）
 * 映射依据：docs/api-notes.md「实测字段结构」节；官方 Dev Mode CSS 面板为对照基准
 * 定位定案（2026-11-17）：css 轨不输出 position/left/top——画板坐标套进文档流会错位，
 * 坐标保真在 raw.x/raw.y（相对父容器），像素级还原由消费方自行取用
 * 不可映射/未实测项不臆造：写入 notes，原始值始终可在 raw 视图兜底
 */
import { RawNode, RawPaint, SolidPaint } from '../protocol/messages';

export interface NodeCss {
  /** CSS 属性 → 值（属性名 kebab-case，AI 直接读用） */
  css: Record<string, string>;
  /** 不可映射/未实测/需注意项（人话提示，指向 raw 视图） */
  notes: string[];
}

type Css = Record<string, string>;

const to255 = (v: number): number => Math.round(Math.min(Math.max(v, 0), 1) * 255);

/** SOLID 颜色：0-1 浮点 + alpha 单独在 paint.opacity（实测）→ rgb()/rgba() */
function solidColor(paint: SolidPaint): string {
  const r = to255(paint.color.r);
  const g = to255(paint.color.g);
  const b = to255(paint.color.b);
  return paint.opacity < 1 ? `rgba(${r}, ${g}, ${b}, ${paint.opacity})` : `rgb(${r}, ${g}, ${b})`;
}

/** fontWeight 从 fontName.style 推导（fontWeight 字段不暴露——实测） */
const WEIGHT_TABLE: Array<[RegExp, string]> = [
  [/thin/i, '100'], [/extralight/i, '200'], [/light/i, '300'], [/medium/i, '500'],
  [/semibold/i, '600'], [/bold/i, '700'], [/heavy|extrabold/i, '800'], [/black/i, '900'],
];
function deriveWeight(style: string): string {
  const numeric = style.match(/(\d{3})/);
  if (numeric) return numeric[1];
  for (const [re, weight] of WEIGHT_TABLE) {
    if (re.test(style)) return weight;
  }
  return '400';
}

/**
 * 填充分派：TEXT 节点 fills = 文字填充色 → color（实测铁律：2026-11-17 真稿对照，
 * 「注册页面」fills rgb(0,199,186)=#00C7BA 即 UI 稿文字色，TEXT 无独立背景属性）；
 * 其余节点 fills = 背景填充 → background-color。取最后一个可见 SOLID；非 SOLID 分支出 note。
 */
function mapFills(node: RawNode, css: Css, notes: string[]): void {
  const paints = node.fills ?? [];
  const visible = paints.filter((p) => p.visible !== false);
  const solids = visible.filter((p): p is SolidPaint => p.type === 'SOLID');
  const fillProp = node.type === 'TEXT' ? 'color' : 'background-color';
  if (solids.length > 0) css[fillProp] = solidColor(solids[solids.length - 1]);
  const others = visible.filter((p) => p.type !== 'SOLID');
  if (others.length > 0) {
    notes.push(`存在非 SOLID 填充（${others.map((p) => p.type).join('/')}）暂未映射（TODO 实测），原始结构见 raw.fills`);
  }
}

const isSolid = (p: RawPaint): p is SolidPaint => p.type === 'SOLID';

/** 描边 → border（样式由 dashPattern 推断；strokeAlign 非 INSIDE 出 note） */
function mapBorder(node: RawNode, css: Css, notes: string[]): void {
  const paint = (node.strokes ?? []).find((p) => p.visible !== false);
  if (!paint || !node.strokeWeight) return;
  if (!isSolid(paint)) {
    notes.push(`描边为非 SOLID 填充（${paint.type}）暂未映射，原始结构见 raw.strokes`);
    return;
  }
  const style = node.dashPattern && node.dashPattern.length > 0 ? 'dashed' : 'solid';
  css.border = `${node.strokeWeight}px ${style} ${solidColor(paint)}`;
  if (node.strokeAlign && node.strokeAlign !== 'INSIDE') {
    notes.push(`strokeAlign=${node.strokeAlign}（CSS border 恒为内侧，像素还原时注意）`);
  }
}

/** 阴影 → box-shadow（Effect 形态未实测：字段守卫收窄，形态不符出 note 不臆造） */
function mapShadows(node: RawNode, css: Css, notes: string[]): void {
  const effects = node.effects ?? [];
  const shadows: string[] = [];
  const unknownKinds: string[] = [];
  for (const effect of effects) {
    if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW') {
      unknownKinds.push(effect.type);
      continue;
    }
    const e = effect as Record<string, unknown>;
    const offset = e.offset as Record<string, unknown> | undefined;
    const color = e.color as Record<string, unknown> | undefined;
    if (
      typeof offset?.x !== 'number' || typeof offset?.y !== 'number' || typeof e.radius !== 'number' ||
      typeof color?.r !== 'number' || typeof color?.g !== 'number' || typeof color?.b !== 'number'
    ) {
      notes.push(`阴影（${effect.type}）结构超出已实测形态，原始结构见 raw.effects`);
      continue;
    }
    const a = typeof color.a === 'number' ? color.a : 1;
    const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
    shadows.push(`${inset}${offset.x}px ${offset.y}px ${e.radius}px rgba(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)}, ${a})`);
  }
  if (unknownKinds.length > 0) {
    notes.push(`存在未实测效果（${unknownKinds.join('/')}）暂未映射，见 raw.effects`);
  }
  if (shadows.length > 0) css['box-shadow'] = shadows.join(', ');
}

/** 自动布局 → flex（子元素仍以绝对定位还原；SPACE_BETWEEN 仅主轴存在） */
function mapAutoLayout(node: RawNode, css: Css): void {
  if (node.layoutMode !== 'HORIZONTAL' && node.layoutMode !== 'VERTICAL') return;
  css.display = 'flex';
  css['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
  if (node.itemSpacing) css.gap = `${node.itemSpacing}px`;
  const pad = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
  if (pad.some((v) => v !== null && v !== 0)) {
    css.padding = pad.map((v) => `${v ?? 0}px`).join(' ');
  }
  const alignMap: Record<string, string> = {
    MIN: 'flex-start', MAX: 'flex-end', CENTER: 'center', SPACE_BETWEEN: 'space-between',
  };
  if (node.primaryAxisAlignItems && alignMap[node.primaryAxisAlignItems]) {
    css['justify-content'] = alignMap[node.primaryAxisAlignItems];
  }
  if (node.counterAxisAlignItems && alignMap[node.counterAxisAlignItems]) {
    css['align-items'] = alignMap[node.counterAxisAlignItems];
  }
}

/** 文本样式（仅 TEXT 节点产出有效值；其它节点这些字段实测为 null 自动跳过） */
function mapText(node: RawNode, css: Css, notes: string[]): void {
  if (node.fontSize !== null) css['font-size'] = `${node.fontSize}px`;
  if (node.fontName !== null) {
    css['font-family'] = node.fontName.family;
    css['font-weight'] = deriveWeight(node.fontName.style);
    if (node.fontName.style !== 'Regular') {
      notes.push(`字体 style="${node.fontName.style}"（font-weight 已按推导表输出）`);
    }
  }
  if (node.lineHeight !== null) {
    if (node.lineHeight.unit === 'PIXELS') css['line-height'] = `${node.lineHeight.value}px`;
    else if (node.lineHeight.unit === 'PERCENT') css['line-height'] = `${node.lineHeight.value}%`;
    else if (node.fontSize !== null && node.fontSize > 0) {
      // AUTO 行高：真稿实测规律 1.5×fontSize（车辆管理对照；单点实测，TODO 多字体/多字号样本验证）
      css['line-height'] = `${Math.round(node.fontSize * 1.5 * 100) / 100}px`;
      notes.push('line-height 为 AUTO：按实测规律 1.5×fontSize 换算（TODO 多样本验证），原始值见 raw.lineHeight');
    } else {
      notes.push('line-height 为 AUTO 且无有效 fontSize（未换算；原始结构见 raw.lineHeight）');
    }
  }
  if (node.letterSpacing !== null && node.letterSpacing.value !== 0) {
    css['letter-spacing'] = node.letterSpacing.unit === 'PIXELS' ? `${node.letterSpacing.value}px` : `${node.letterSpacing.value}%`;
  }
  if (node.textAlignHorizontal && node.textAlignHorizontal !== 'LEFT') {
    css['text-align'] = node.textAlignHorizontal.toLowerCase();
  }
  const caseMap: Record<string, string> = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };
  if (node.textCase && caseMap[node.textCase]) css['text-transform'] = caseMap[node.textCase];
  if (node.textDecoration === 'UNDERLINE') css['text-decoration'] = 'underline';
  if (node.textDecoration === 'STRIKETHROUGH') css['text-decoration'] = 'line-through';
}

/** 单节点 → css 视图。不含定位属性（画板坐标见 raw.x/raw.y），只产出可直接套用的样式 */
export function nodeToCss(node: RawNode): NodeCss {
  const notes: string[] = [];
  const css: Css = {};

  if (!node.visible) {
    css.display = 'none';
    return { css, notes };
  }
  css.width = `${node.width}px`;
  css.height = `${node.height}px`;
  if (node.opacity < 1) css.opacity = String(node.opacity);
  if (node.cornerRadius) css['border-radius'] = `${node.cornerRadius}px`;
  if (node.rectangleCornerRadii) {
    css['border-radius'] = node.rectangleCornerRadii.map((v) => `${v}px`).join(' ');
  }

  mapFills(node, css, notes);
  mapBorder(node, css, notes);
  mapShadows(node, css, notes);
  mapAutoLayout(node, css);
  mapText(node, css, notes);

  return { css, notes };
}
