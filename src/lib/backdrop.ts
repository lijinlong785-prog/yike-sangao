/**
 * 底景（TASKS 10 §九）：每页纸上那一层「画」，不是纯色板。
 *
 * 为什么单独一个文件：同一份构图要落到三个渲染器上——导出的 .pptx（矢量形状）、
 * 网页演示（SVG）、PPT 预览面板（SVG）。三处各画各的必然走形，所以这里只出
 * 一份**归一化坐标的形状表**，谁渲染谁按自己的单位换算。
 *
 * 四条纪律：
 *   1. 只占版面的边带：上缘 y 0–0.136、下缘 y 0.833–0.95、右缘 x 0.86–1。
 *      正文带（y 0.136–0.833 且 x 0–0.86）永远是空的——
 *      画在字底下就是教学事故，宁可少画。
 *   2. 底景要看得见但不抢字：与纸的混合比 12% / 21% / 36%，
 *      最深一档与纸的对比度 2.0–2.6:1（正文 AA 是 4.5:1，底景远低于它）；强调色只许点一处。
 *   3. 六种构图按页序逐个递增走满（ridge → slope → tree → house → step → cloud），
 *      同一份里相邻两页不许同一种；封面、收尾各有固定构图。
 *   4. 没有意象的课（认不出花/雪/雨）也有底景——底景画的是「地方」，不是「天气」；
 *      天气那层是 scene.ts 的事，两者互不代替。
 */

import { contrastRatio } from './scheme'

export type BgShapeKind = 'tri' | 'rect' | 'ellipse'

export interface BgShape {
  k: BgShapeKind
  /** 归一化坐标与尺寸（0–1，相对整页） */
  x: number
  y: number
  w: number
  h: number
  /** 淡到浓：1 = 12%，2 = 21%，3 = 36%（与纸的混合比） */
  tone: 1 | 2 | 3
  /** 用强调色的那一小块（一间门、一轮月）；最多一处 */
  accent?: boolean
}

export interface Backdrop {
  id: string
  name: string
  /**
   * 这一页的底景是什么性质（TASKS/17 §三.2）：
   *   picture —— 真画了一层「地方」；
   *   blank   —— 排版层**显式**选择留白，不是「忘了画」。
   * 任何纸、任何页都拿得到一份 Backdrop，本函数不许返回 null——
   * 「AI 现配的纸在表里查不到 → 整叠纯色」就是上一版在这里静默退回造成的。
   */
  kind: 'picture' | 'blank'
  shapes: BgShape[]
}

const t = (k: BgShapeKind, x: number, y: number, w: number, h: number, tone: 1 | 2 | 3, accent = false): BgShape => ({
  k,
  x,
  y,
  w,
  h,
  tone,
  ...(accent ? { accent: true } : {}),
})

/**
 * 地平带：所有构图的共同底。从正文下沿（0.833）铺到 0.95，
 * 不是只在最底下留一条 8px 的边。tone 1 = 12%，看得见但不抢字。
 */
const GROUND = t('rect', 0, 0.833, 1, 0.117, 1)

/** 一颗树：右下角，树干让开页码（页码占 x 0.9–0.955） */
const TREE: BgShape[] = [
  GROUND,
  t('rect', 0.958, 0.7, 0.012, 0.25, 3),
  t('ellipse', 0.912, 0.665, 0.07, 0.07, 2),
  t('ellipse', 0.945, 0.63, 0.08, 0.08, 1),
  t('ellipse', 0.975, 0.672, 0.06, 0.06, 2),
]

/**
 * 一座屋：墙 + 顶 + 门（左下偏中，门用强调色，全页唯一一处）。
 * 不贴左边缘：页脚课文名就排在 x 0.05–0.12、y 0.912，屋墙压上去字就糊了。
 */
const HOUSE: BgShape[] = [
  GROUND,
  t('rect', 0.18, 0.86, 0.075, 0.09, 2),
  t('tri', 0.17, 0.833, 0.095, 0.03, 3),
  t('rect', 0.211, 0.9, 0.017, 0.05, 3, true),
]

/** 一道山脊：三层，越远越淡，都坐在 0.833–0.95 的地平带上 */
const RIDGE: BgShape[] = [
  GROUND,
  t('tri', 0.02, 0.833, 0.34, 0.075, 2),
  t('tri', 0.24, 0.852, 0.4, 0.056, 1),
  t('tri', 0.58, 0.838, 0.32, 0.07, 2),
]

/**
 * 一条坡：左侧大三角压下来，中右小三角托住。
 * 右边界停在 0.90：页码占 x 0.91–0.95，坡面盖上去那句「N / 总页」就淡了。
 */
const SLOPE: BgShape[] = [
  GROUND,
  t('tri', -0.06, 0.833, 0.5, 0.117, 2),
  t('tri', 0.46, 0.855, 0.44, 0.095, 3),
]

/**
 * 石阶：左下三级台阶，每级都落到 0.95。
 * 整组左移到 0.16 起：页码与页脚课文名都在 0.9 以上那一行，台阶不许踩到它们。
 */
const STEP: BgShape[] = [
  GROUND,
  t('rect', 0.16, 0.9, 0.24, 0.05, 2),
  t('rect', 0.21, 0.875, 0.19, 0.075, 2),
  t('rect', 0.26, 0.848, 0.14, 0.102, 3),
]

/** 云与月：上缘三条扁云，右上角一轮小月（强调色） */
const CLOUD: BgShape[] = [
  GROUND,
  t('ellipse', 0.06, 0.02, 0.14, 0.035, 1),
  t('ellipse', 0.13, 0.042, 0.12, 0.03, 1),
  t('ellipse', 0.62, 0.016, 0.11, 0.03, 1),
  t('ellipse', 0.932, 0.03, 0.035, 0.035, 2, true),
]

const DIRECTIONS: readonly Backdrop[] = [
  { id: 'ridge', name: '远山', kind: 'picture', shapes: RIDGE },
  { id: 'slope', name: '坡地', kind: 'picture', shapes: SLOPE },
  { id: 'tree', name: '树', kind: 'picture', shapes: TREE },
  { id: 'house', name: '屋', kind: 'picture', shapes: HOUSE },
  { id: 'step', name: '石阶', kind: 'picture', shapes: STEP },
  { id: 'cloud', name: '云与月', kind: 'picture', shapes: CLOUD },
]

/** 六种构图本体：门禁要逐张验「一个形状都没进正文带」，界面不消费这张表 */
export const BACKDROPS: readonly Backdrop[] = DIRECTIONS

/** 横向翻个面：形状还是那条坡，但翻页时看得出换了一页 */
const mirror = (shapes: readonly BgShape[]): BgShape[] => shapes.map((s) => ({ ...s, x: 1 - s.x - s.w }))

/**
 * 「地方」按**纸的性格**挑，不按 theme.id（TASKS/17 §三）。
 *
 * 上一版按 id 查表：内置六张纸有名字，AI 现配的纸 id 是 `ai:#475332` 这种
 * 色值串，表里当然没有——查不到就只能退回一套固定的远山/云，深纸上几乎看不见，
 * 整叠看上去就是一块死色。纸是颜色，不是名字：按明度分三档、按色相分冷暖。
 *
 * 明度用 HSL 亮度 (max+min)/2（与 shapeColor 的深浅判定同一把尺）：
 *   ≥78 浅纸 / 40–78 中间档 / <40 深纸。
 */
export type PaperMood = 'light' | 'mid' | 'dark'

export function paperMoodOf(paper: string): PaperMood {
  const l = lightnessOf(paper)
  if (l >= 78) return 'light'
  if (l >= 40) return 'mid'
  return 'dark'
}

function lightnessOf(hex: string): number {
  const n = parseInt(String(hex).replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100
}

/** 暖 / 冷 / 中性：只看哪一路最亮、三路差多少，不认纸的名字 */
function hueOf(hex: string): 'warm' | 'cool' | 'neutral' {
  const n = parseInt(String(hex).replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) return 'neutral'
  if (b >= g && b > r) return 'cool'
  if (g > r && g >= b) return 'cool'
  return 'warm'
}

/** 三档纸 × 三种色相各一对正/副构图；两张纸的封面就从这一对里取正面 */
const MOOD_DIRECTIONS: Record<PaperMood, Record<'warm' | 'cool' | 'neutral', string[]>> = {
  light: { warm: ['tree', 'house'], cool: ['ridge', 'cloud'], neutral: ['slope', 'step'] },
  mid: { warm: ['house', 'step'], cool: ['cloud', 'ridge'], neutral: ['slope', 'tree'] },
  dark: { warm: ['slope', 'step'], cool: ['ridge', 'tree'], neutral: ['cloud', 'slope'] },
}

/** 显式留白：只有排版层主动要 kind='blank' 时才用它，从不到「纸不认识」里来 */
export const BLANK_BACKDROP: Backdrop = { id: 'blank', name: '留白', kind: 'blank', shapes: [] }

/**
 * 这一页的底景。
 *   · 封面固定这张纸的正面 + 一条地平；
 *   · 收尾固定一条坡（方向与前/后那页错开）；
 *   · 正文页按页序递增走满六种（ridge → slope → tree → house → step → cloud）。
 *     一页一换，24 页一叠里六种都会出现。
 * 入参只认**纸色**：任何纸都一定落进三档之一，因此永远有底景。
 */
export function backdropFor(paper: string, i: number, kind: string): Backdrop {
  if (kind === 'blank') return BLANK_BACKDROP
  const pair = MOOD_DIRECTIONS[paperMoodOf(paper)][hueOf(paper)]
  const find = (id: string) => DIRECTIONS.find((d) => d.id === id) ?? DIRECTIONS[0]
  if (kind === 'cover') {
    // 封面固定一张安静的远景：这张纸的正面 + 一条地平线。
    // 远山 / 坡地自带横穿整页的底，就不重复画——导出的 .pptx 里不叠两个同色矩形。
    const front = find(pair[0])
    const hasGround = front.shapes.some((s) => s.k === 'rect' && s.w > 0.9)
    return {
      id: `${pair[0]}+cover`,
      name: front.name,
      kind: 'picture',
      shapes: hasGround ? [...front.shapes] : [...front.shapes, ...RIDGE.slice(-1)],
    }
  }
  if (kind === 'end' || kind === 'homework') {
    // 收尾是一条坡。方向不能拍脑袋：前一页轮到坡时（六种轮转里完全可能），
    // 收尾页必须换个方向，否则相邻两页长得一模一样。
    const prev = DIRECTIONS[(((i - 2) % DIRECTIONS.length) + DIRECTIONS.length) % DIRECTIONS.length]
    const uphill = prev.id !== 'slope'
    return { id: `slope+${uphill ? 'up' : 'down'}`, name: '坡地', kind: 'picture', shapes: uphill ? SLOPE : mirror(SLOPE) }
  }
  // 六种逐个走：相邻页恒不同，整份里六种都出现。i 从 0 的封面之后开始算第一页。
  const at = (((i - 1) % DIRECTIONS.length) + DIRECTIONS.length) % DIRECTIONS.length
  return DIRECTIONS[at]
}

/**
 * 与纸混合：ratio 是 b 的占比。tone 用 ink 混纸，越混越深；
 * 强调块用 accent 混纸，只到一半，免得那间门/那轮月变成第二块朱红。
 */
export function mixHex(a: string, b: string, ratio: number): string {
  const pa = parseInt(String(a).replace('#', ''), 16)
  const pb = parseInt(String(b).replace('#', ''), 16)
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255
    const vb = (pb >> shift) & 255
    return Math.max(0, Math.min(255, Math.round(va * (1 - ratio) + vb * ratio)))
  }
  const hex2 = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex2(ch(16))}${hex2(ch(8))}${hex2(ch(0))}`
}

export const TONE_MIX: Record<1 | 2 | 3, number> = { 1: 0.12, 2: 0.21, 3: 0.36 }

/**
 * 深纸（墨池 / 黑板）上把混合比收紧到 0.78 倍；中间档 0.88 倍。
 * 浅纸上「往正文色混 36%」正好是 2.1:1；深纸上正文色是浅色，同样 36% 会顶到 2.9:1，
 * 底景就比字还抢眼。0.78 之后最深一档回到 2.0–2.2:1，两种纸的手感一致。
 * 中间档夹在两者之间，取 0.88——比浅纸淡一点，又不至于落进 2.0 以下。
 *
 * 但档位只是一个起点：同一档里两张纸的「纸—墨差」可能差一倍。深绿纸配米色墨，
 * 按 0.78 混出来只有 1.86:1，投影上等于没画。所以基准落在门禁区间之外时，
 * 再按实测对比度把比例解出来（见 deepRatioOf）。
 */
const TONE_SCALE: Record<PaperMood, number> = { light: 1, mid: 0.88, dark: 0.78 }

/** 最深一档的验收区间（与门禁同一条：2.0–2.6:1，留一点浮点余量） */
const DEEP_MIN = 2.02
const DEEP_MAX = 2.55

/** 纸 | 墨 → 已解好的最深一档比例。一页六个形状只解一次。 */
const ratioCache = new Map<string, number>()

/**
 * 「tone 3」这一档该与纸混多少。
 * 先按档位取基准（浅 1 / 中 0.88 / 深 0.78）；只要实测落在 2.02–2.55:1 就照用，
 * 落不进去就二分反解一次——对比度对混合比单调，20 步足够精确到千分位。
 */
function deepRatioOf(paper: string, ink: string): number {
  const key = `${paper}|${ink}`
  const hit = ratioCache.get(key)
  if (hit !== undefined) return hit
  const base = TONE_MIX[3] * TONE_SCALE[paperMoodOf(paper)]
  const at = (r: number) => contrastRatio(mixHex(paper, ink, r), paper)
  let ratio = base
  if (at(base) < DEEP_MIN || at(base) > DEEP_MAX) {
    const goal = at(base) < DEEP_MIN ? 2.1 : 2.3
    let lo = 0.01
    let hi = 0.92
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2
      if (at(mid) < goal) lo = mid
      else hi = mid
    }
    ratio = (lo + hi) / 2
  }
  ratioCache.set(key, ratio)
  return ratio
}

/** 一个形状该是什么色：tone → 与纸的混合；accent → 强调色淡一档 */
export function shapeColor(shape: BgShape, paper: string, ink: string, accent: string): string {
  if (shape.accent) return mixHex(paper, accent, 0.55)
  const deep = deepRatioOf(paper, ink)
  return mixHex(paper, ink, (deep * TONE_MIX[shape.tone]) / TONE_MIX[3])
}

export interface BackdropBox {
  k: BgShapeKind
  /** 百分比坐标（0–100）：就是归一化值 ×100，与 .pptx 的 x×W / y×H 同源 */
  x: number
  y: number
  w: number
  h: number
  color: string
}

/**
 * 网页那一层要的全部形状 + 已经算好的颜色。
 *
 * PPT 预览与网页演示都只调这一个函数，谁都不在组件里另算一遍颜色——
 * 「预览看到的就是导出的」靠的就是这里只有一份取色。
 */
export function backdropShapes(bg: Backdrop, paper: string, ink: string, accent: string): BackdropBox[] {
  return bg.shapes.map((s) => ({
    k: s.k,
    x: s.x * 100,
    y: s.y * 100,
    w: s.w * 100,
    h: s.h * 100,
    color: shapeColor(s, paper, ink, accent),
  }))
}

/** 正文带：标题下沿到正文下沿（1.02in–6.25in），横向到 0.86（右边留给图位与树） */
export const TEXT_BAND = { top: 0.136, bottom: 0.833, right: 0.86 } as const

export function backdropProblems(b: Backdrop): string[] {
  const bad: string[] = []
  const accents = b.shapes.filter((s) => s.accent).length
  if (accents > 1) bad.push(`${b.id} 有 ${accents} 处强调色，一页最多一处`)
  b.shapes.forEach((s, i) => {
    const overlapY = s.y < TEXT_BAND.bottom && s.y + s.h > TEXT_BAND.top
    const overlapX = s.x < TEXT_BAND.right && s.x + s.w > 0
    if (overlapY && overlapX) {
      // 允许压进右缘：正文区最宽到 0.86，右边带是空的
      if (!(s.x >= TEXT_BAND.right)) bad.push(`${b.id} 第 ${i + 1} 个形状压进正文区（y ${s.y.toFixed(2)}–${(s.y + s.h).toFixed(2)}）`)
    }
  })
  return bad
}
