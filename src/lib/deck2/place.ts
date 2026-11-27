/**
 * 模板层 · 槽位计算（TASKS/20 §2.3 → TASKS/23）
 *
 * 内容 → 槽位 → 渲染，三段不许合并。这一份只做中间那段：
 * 吃一页 `StudentSlide`（内容层的东西，一行不动），吐一串 `Placed`（0–1 相对纸面的块）。
 * 预览（PptPreview）与导出（pptx.ts 的 renderPlaced）**只许读这一份**，
 * 谁也不许自己算坐标——不然改一次模板就要改两个地方，两边迟早对不上。
 *
 * 二十四轮之后，「模板」不只是换色：各族各有自己的排法——素课单栏靠左、宣纸居中加印、
 * 例题双栏网格、极简大留白、书页左边栏、提纲顶部标题条。四条硬边界：
 *   · 只有一条 switch 分支在 `LAYOUTS[theme.family][arch]` 上，**没有**「找不到就退回默认」的兜底；
 *     `Record<FamilyId, Record<Arch, Layout>>` 逼着各族 × 七式全部写全，少一个编译就红。
 *   · 一族七种版式各是一个函数，不参数化——参数化就等于没差异（check:layout-distinct 第 1 条）。
 *     族内 3–4 个配色共用同一套几何，只换纸与强调色（同门第 8 条）。
 *   · 任何框溢出纸面在这里就抛，不等出图才发现（check:layout-distinct 第 6 条兜的是同一条）。
 *   · 纯函数：不读时间、不取随机、不问网络。同一页 + 同一套模板，出去的东西永远一样。
 *
 * 封面是唯一跨模板共用几何的一块（TASKS/20b 的三种构图）：一张画铺满整页，
 * 标题压在图上空出来的那一块。各族只在这里调字号、对齐、装饰件，不动构图选择；
 * 没图时按 slide.motif 画这一科的线稿（语文雨丝 / 数学方格 / 英语四线格…，见 lib/motifs.ts）。
 */
import { SLIDE_LABELS, type StudentSlide, type StudentSlideKind } from '../slides'
import { motifOfKey } from '../motifs'
import type { DeckTheme, FamilyId, FontKey } from './theme'
import { isVisualThemeId, placeVisualSlide } from './visualSystem'

export interface Placed {
  kind: 'text' | 'rect' | 'line' | 'image' | 'ellipse'
  /** 0–1 相对纸面，不是英寸 */
  x: number
  y: number
  w: number
  h: number
  text?: string
  /** pt（与 pptx 同一个单位）；预览按纸宽换算成 px */
  size?: number
  align?: 'left' | 'center' | 'right'
  color?: string
  fill?: string
  font?: 'song' | 'kai' | 'hei'
  bold?: boolean
  lineHeight?: number
  /** 0–1：底纹那种「看得见、抢不走字」的块面 */
  opacity?: number
  /** kind='ellipse' 时绕中心转的角度（钢印那枚叶片的斜瓣） */
  rotate?: number
  /** kind='rect' 的圆角半径（pt，与 size 同口径）：三色刊的大圆角卡、商务蓝的圆头蓝条靠它。
   *  预览 borderRadius 按纸宽换算 cqw，导出走 pptx 的 roundRect + rectRadius（pt/72 英寸）。 */
  radius?: number
  /** kind='image' 时的图片本体（`data:image/png;base64,…`，与 pptx 里插的是同一份串） */
  data?: string
  /** 文本框里的纵向对齐；标题居中、正文顶齐 */
  valign?: 'top' | 'middle'
  /**
   * settle 收字之前的原字号——只有真阔过才写。
   * 排版层不靠它干活，留着是给 check:fit 判一件事：
   * 「提示词允许的字数，这族的框到底排不排得下」——正常档一分都不该缩。
   */
  size0?: number
}

/* ------------------------------ 公共槽位 ------------------------------ */

/** 页脚：表里只给了一条细线；课题与页码由渲染侧照这个槽位补（两边同一个常量） */
export const FOOT_SLOT = {
  line: { x: 0.09, y: 0.935, w: 0.82, h: 0.0015 },
  left: { x: 0.09, y: 0.945, w: 0.5, h: 0.04 },
  right: { x: 0.71, y: 0.945, w: 0.2, h: 0.04 },
}

/* ------------------------------ 版式与档位 ------------------------------ */

/** 页型归到模板的七种版式：cover / quote / words / numbered / compare / end / plain */
export type Arch = 'cover' | 'quote' | 'words' | 'numbered' | 'compare' | 'end' | 'plain'

const NUMBERED: StudentSlideKind[] = ['board', 'drill', 'homework']

export function archetypeOf(kind: StudentSlideKind): Arch {
  if (kind === 'cover') return 'cover'
  if (kind === 'quote') return 'quote'
  if (kind === 'words') return 'words'
  if (kind === 'compare') return 'compare'
  if (kind === 'end') return 'end'
  if (NUMBERED.includes(kind)) return 'numbered'
  return 'plain'
}

/**
 * 字号七档，四套共用这一张表（TASKS/23 §2.2）。
 * 各套**选用**哪一档不同：同一页在素课是 h1，在极简就是 h1Big。
 */
export const SIZES = { h1: 46, h1Big: 54, h2: 34, body: 26, small: 18, tiny: 12 } as const

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Style {
  size?: number
  color?: string
  font?: FontKey
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle'
  lineHeight?: number
  bold?: boolean
}

interface Ctx {
  slide: StudentSlide
  theme: DeckTheme
  out: Placed[]
  title: string
  line: string
  items: string[]
  note: string
  quote: string
  art: string
}

type Layout = (ctx: Ctx) => void

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫'
const CN_NUM = '一二三四五六七八九十'

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+$/g, '').trim()
}

function lines(list: readonly string[]): string[] {
  return list.map(clean).filter(Boolean)
}

/** 纸面像素：与离线渲染器、pptx 导出同一口径（1280×720，1pt = 4/3 px） */
const PW = 1280
const PH = 720
const PX = 4 / 3

/**
 * 一块字排出来实际占多少：行长按「每个全角字 1em」估，行高 = 字号 × 行距，
 * 对齐与纵向居中算进去。**只此一份**——排版收字（settle）、容量反算（capacity.ts）、
 * 两道门禁（check:capacity / check:fit）读的都是它，谁也不许另写一套估法。
 */
export function extentOf(p: Placed): { x: number; y: number; w: number; h: number } {
  const fs = (p.size ?? 18) * PX
  const lh = fs * (p.lineHeight ?? 1.5)
  const per = Math.max(1, Math.floor((p.w * PW) / fs))
  const list = String(p.text ?? '').split('\n')
  const rows = list.reduce((n, l) => n + Math.max(1, Math.ceil(Array.from(l).length / per)), 0)
  const hpx = rows * lh
  const longest = Math.min(per, Math.max(...list.map((l) => Array.from(l).length)))
  const wpx = Math.min(p.w * PW, longest * fs)
  const x =
    p.align === 'center' ? p.x * PW + (p.w * PW - wpx) / 2 : p.align === 'right' ? p.x * PW + p.w * PW - wpx : p.x * PW
  const y = p.valign === 'middle' ? p.y * PH + (p.h * PH - hpx) / 2 : p.y * PH
  return { x, y, w: wpx, h: hpx }
}

/** 越界就地抛：早失败，别等导出才发现一页字跑到纸外面 */
function guard(box: Box, what: string): void {
  const okBox =
    box.w > 0 &&
    box.h > 0 &&
    box.x >= -1e-9 &&
    box.y >= -1e-9 &&
    box.x + box.w <= 1.001 &&
    box.y + box.h <= 1.001
  if (!okBox) {
    throw new Error(`place(): ${what} 的框溢出了纸面（x=${box.x} y=${box.y} w=${box.w} h=${box.h}）`)
  }
}

function cText(ctx: Ctx, box: Box, value: string, style: Style & { font: FontKey; color: string }): void {
  const text = clean(value)
  if (!text) return
  guard(box, `文本「${text.slice(0, 8)}」`)
  ctx.out.push({
    kind: 'text',
    ...box,
    text,
    size: style.size ?? SIZES.body,
    color: style.color,
    font: style.font,
    align: style.align ?? 'left',
    valign: style.valign ?? 'top',
    lineHeight: style.lineHeight ?? 1.5,
    bold: style.bold,
  })
}

function cRect(ctx: Ctx, box: Box, fill: string, opacity?: number, radius?: number): void {
  guard(box, '色块')
  ctx.out.push({ kind: 'rect', ...box, fill, opacity, radius })
}

function cLine(ctx: Ctx, box: Box, fill: string, opacity?: number): void {
  guard(box, '细线')
  ctx.out.push({ kind: 'line', ...box, fill, opacity })
}

/** 椭圆：钢印那枚铜青叶片、商务蓝封面右下的小圆点都靠它。
 *  pptx 侧走 addShape('ellipse')，预览侧走 border-radius: 50%——两边同一份几何。 */
function cEllipse(ctx: Ctx, box: Box, fill: string, opacity?: number, rotate?: number): void {
  guard(box, '椭圆')
  ctx.out.push({ kind: 'ellipse', ...box, fill, opacity, rotate })
}

/**
 * 封面铺图：有画就整页铺（画就是这张纸），没画什么都不补。
 * 返回「是否铺了」——各族据此决定色块压不压半透明。
 */
function coverArt(ctx: Ctx): boolean {
  if (!ctx.art) return false
  ctx.out.push({ kind: 'image', x: 0, y: 0, w: 1, h: 1, data: ctx.art })
  return true
}

/** 封面标题字号：中文标题 2 字与 10 字差得远，按字数退档，不硬写一个 pt。
 *  这几档比内页大得多——母版封面的字号是拿页高的五分之一在排的。 */
function coverPt(n: number, tiers: [number, number, number, number] = [96, 76, 52, 38]): number {
  if (n <= 2) return tiers[0]
  if (n <= 4) return tiers[1]
  if (n <= 7) return tiers[2]
  return tiers[3]
}

/** 轴对齐矩形拼一条斜边（商务蓝的斜切三角）：切成 26 条横片，每片按斜线上的 x 起画。
 *  pptx 没有自定义多边形，但在 .02 的片高下阶梯看不出来——比少一整块三角强得多。 */
function slantBand(ctx: Ctx, top: number, bottom: number, x0: number, x1: number, fill: string, opacity?: number): void {
  const slices = 26
  const dy = (bottom - top) / slices
  for (let i = 0; i < slices; i += 1) {
    const y = top + i * dy
    /* i 越往下，斜边越往右：上沿从 x0 起，下沿到 x1 收 */
    const left = x0 + ((x1 - x0) * i) / slices
    /* 片高多给 1 像素压住阶梯缝，但最后一片必须收回纸面内（guard 不许溢） */
    cRect(ctx, { x: left, y, w: 1 - left, h: Math.min(dy + 0.001, 1 - y) }, fill, opacity)
  }
}

/** 圆头胶囊条（商务蓝「圆头蓝条压在灰轨道上」那种）：半径 = 条高的一半。
 *  box.h 是 0–1 纸高，半高换成 pt：h × 720 ÷ 2 ÷ (4/3) = h × 270。 */
function cCapsule(ctx: Ctx, box: Box, fill: string, opacity?: number): void {
  cRect(ctx, box, fill, opacity, box.h * 270)
}

/** 四边细框卡片（长桌宴的空卡）：上框重、下框轻、两侧发丝——靠线立住，不靠底色。 */
function frameCard(ctx: Ctx, box: Box, heavy: string, light: string): void {
  cLine(ctx, { x: box.x, y: box.y, w: box.w, h: 0.0024 }, heavy, 0.9)
  cLine(ctx, { x: box.x, y: box.y + box.h, w: box.w, h: 0.0016 }, heavy, 0.5)
  cLine(ctx, { x: box.x, y: box.y, w: 0.0016, h: box.h }, light, 1)
  cLine(ctx, { x: box.x + box.w, y: box.y, w: 0.0016, h: box.h }, light, 1)
}

/** 双瓣叶片（钢印右上角那枚印）：两枚椭圆一正一斜叠出来。size 是 0–1 纸高口径。 */
function leafPair(ctx: Ctx, x: number, y: number, size: number, fill: string, opacity = 1): void {
  cEllipse(ctx, { x, y, w: size * 0.62, h: size }, fill, opacity)
  cEllipse(ctx, { x: x + size * 0.42, y: y + size * 0.18, w: size * 0.58, h: size * 0.84 }, fill, opacity * 0.72, 32)
}

/** 问句行：表里没给「一句话的问题」的位置，而内容层每页一行问句是硬规则。
 *  各族各自挂在版心下沿，位置不同——它也是「各族不一样」的一部分。 */
const ASK: Record<FamilyId, Box> = {
  watercolor: { x: 0.095, y: 0.822, w: 0.81, h: 0.06 },
  business: { x: 0.095, y: 0.822, w: 0.81, h: 0.06 },
  handdrawn: { x: 0.095, y: 0.822, w: 0.81, h: 0.06 },
  suke: { x: 0.085, y: 0.845, w: 0.76, h: 0.05 },
  xuan: { x: 0.18, y: 0.83, w: 0.64, h: 0.05 },
  liti: { x: 0.06, y: 0.8, w: 0.88, h: 0.05 },
  jijian: { x: 0.1, y: 0.78, w: 0.8, h: 0.05 },
  shuye: { x: 0.26, y: 0.85, w: 0.34, h: 0.05 },
  tigang: { x: 0.09, y: 0.855, w: 0.46, h: 0.05 },
  /* 栏线：问句压在页脚线上方，与条目最后一条让开 0.01 */
  lanxian: { x: 0.075, y: 0.862, w: 0.6, h: 0.05 },
  /* 六栏：问句贴着最后一道横线，左齐 */
  liu: { x: 0.08, y: 0.855, w: 0.62, h: 0.05 },
  /* 长桌：问句落在一张纸卡上，偏右一点（左下的卡片叠到 0.78） */
  chang: { x: 0.1, y: 0.85, w: 0.56, h: 0.05 },
  /* 满篇：问句与正文同一条左边线（无彩色版面上靠对齐区分） */
  man: { x: 0.1, y: 0.855, w: 0.6, h: 0.05 },
  /* 四卡：问句与卡片左边线对齐 */
  ka: { x: 0.08, y: 0.845, w: 0.6, h: 0.05 },
  /* 第二批八族：问句各挂各的（位置本身就是族的一部分） */
  shuangnian: { x: 0.09, y: 0.795, w: 0.5, h: 0.05 },
  gulan: { x: 0.035, y: 0.885, w: 0.5, h: 0.05 },
  /* 商务蓝：问句行抬到 .82——页名在左下 .90，再低就压上去了 */
  shangwu: { x: 0.08, y: 0.82, w: 0.44, h: 0.05 },
  sanse: { x: 0.09, y: 0.84, w: 0.54, h: 0.05 },
  lindi: { x: 0.1, y: 0.845, w: 0.4, h: 0.05 },
  changyan: { x: 0.08, y: 0.852, w: 0.46, h: 0.05 },
  danse: { x: 0.1, y: 0.845, w: 0.56, h: 0.05 },
  gangyin: { x: 0.08, y: 0.865, w: 0.48, h: 0.05 },
}

/** 页眉（标题）：表里对 words / numbered / compare 没给标题框，各族各给一条固定的页眉线 */
const HEAD: Record<FamilyId, Box> = {
  watercolor: { x: 0.1, y: 0.082, w: 0.72, h: 0.095 },
  business: { x: 0.075, y: 0.095, w: 0.72, h: 0.095 },
  handdrawn: { x: 0.075, y: 0.13, w: 0.72, h: 0.095 },
  suke: { x: 0.085, y: 0.185, w: 0.76, h: 0.09 },
  xuan: { x: 0.18, y: 0.145, w: 0.64, h: 0.1 },
  liti: { x: 0.06, y: 0.105, w: 0.7, h: 0.09 },
  jijian: { x: 0.1, y: 0.225, w: 0.8, h: 0.09 },
  shuye: { x: 0.26, y: 0.155, w: 0.34, h: 0.09 },
  tigang: { x: 0.09, y: 0.07, w: 0.8, h: 0.1 },
  /* 栏线：标题只占左 62%，右边那一条留给右上角的页名小标签 */
  lanxian: { x: 0.075, y: 0.085, w: 0.62, h: 0.12 },
  /* 六栏：标题矮一行，底下就是第一道满宽横线 */
  liu: { x: 0.08, y: 0.09, w: 0.66, h: 0.11 },
  /* 长桌：黑体标题，压在左上角第一张卡片的上沿 */
  chang: { x: 0.1, y: 0.1, w: 0.62, h: 0.11 },
  /* 满篇：标题贴到纸顶（Monochrome 的刊头），与任何一族的页眉都不在一条线上 */
  man: { x: 0.1, y: 0.035, w: 0.7, h: 0.11 },
  /* 四卡：标题压得更低，底下就是第一排卡 */
  ka: { x: 0.08, y: 0.145, w: 0.6, h: 0.1 },
  /* 双年展：刊头压到最上，底下一条通栏线 */
  shuangnian: { x: 0.09, y: 0.07, w: 0.8, h: 0.11 },
  /* 钴蓝格：题上就是那条通栏蓝线 */
  gulan: { x: 0.1, y: 0.13, w: 0.8, h: 0.095 },
  /* 商务蓝：标题右边整条浅 panel 让开，框只占左边 */
  shangwu: { x: 0.1, y: 0.125, w: 0.54, h: 0.095 },
  /* 三色刊：标题从栗红竖条右边起（竖条自己画在版式里） */
  sanse: { x: 0.078, y: 0.055, w: 0.72, h: 0.145 },
  /* 林地：衬线大标题只占左半张，右边是图（右边界 .52，与图版的 .53 让开 0.01，否则会判成字压图） */
  lindi: { x: 0.1, y: 0.155, w: 0.42, h: 0.12 },
  /* 长桌宴：黑体标题贴最上，像一桌的桌签 */
  changyan: { x: 0.08, y: 0.085, w: 0.66, h: 0.1 },
  /* 单色刊：标题宽松一行，底下只有一根发丝线 */
  danse: { x: 0.1, y: 0.11, w: 0.76, h: 0.11 },
  /* 钢印：标题在实心块里（反白），框要装得下 16 字 */
  gangyin: { x: 0.1, y: 0.105, w: 0.46, h: 0.075 },
}

/** 页名 + 页脚线的形态（§三 末行）：极简两样都省，宣纸只留中间一小段，书页只画主栏那一段 */
const MARKS: Record<FamilyId, { label: Box | null; line: (Box & { opacity?: number }) | null }> = {
  watercolor: {
    label: { x: 0.8, y: 0.085, w: 0.13, h: 0.045 },
    line: { x: 0.075, y: 0.935, w: 0.85, h: 0.0015 },
  },
  business: {
    label: { x: 0.07, y: 0.04, w: 0.22, h: 0.045 },
    line: { x: 0.07, y: 0.93, w: 0.86, h: 0.0015 },
  },
  handdrawn: {
    label: { x: 0.085, y: 0.072, w: 0.12, h: 0.042 },
    line: null,
  },
  suke: {
    label: { x: 0.085, y: 0.905, w: 0.5, h: 0.04 },
    line: { x: 0.04, y: 0.935, w: 0.92, h: 0.0015 },
  },
  xuan: {
    label: { x: 0.18, y: 0.905, w: 0.64, h: 0.04 },
    line: { x: 0.44, y: 0.935, w: 0.12, h: 0.0015 },
  },
  liti: {
    label: { x: 0.06, y: 0.905, w: 0.5, h: 0.04 },
    line: { x: 0.06, y: 0.935, w: 0.88, h: 0.0008 },
  },
  jijian: {
    label: null,
    line: { x: 0.1, y: 0.935, w: 0.8, h: 0.0015, opacity: 0.5 },
  },
  shuye: {
    label: { x: 0.26, y: 0.905, w: 0.34, h: 0.04 },
    line: { x: 0.26, y: 0.935, w: 0.64, h: 0.0015 },
  },
  tigang: {
    label: { x: 0.09, y: 0.905, w: 0.5, h: 0.04 },
    line: { x: 0.06, y: 0.935, w: 0.88, h: 0.0012 },
  },
  /* 栏线的页名反过来放右上角（像 Biennale 的「OPEN PROGRAMME」），左下留给问句 */
  lanxian: {
    label: { x: 0.705, y: 0.1, w: 0.22, h: 0.04 },
    line: { x: 0.075, y: 0.935, w: 0.85, h: 0.0012 },
  },
  /* 六栏：页名在右下，页脚一道贯穿到底的横线（满页横线是它的身份） */
  liu: {
    label: { x: 0.72, y: 0.905, w: 0.2, h: 0.04 },
    line: { x: 0.08, y: 0.935, w: 0.84, h: 0.0015 },
  },
  /* 长桌：卡片自己就是版面，页脚只留一道很淡的边线 */
  chang: {
    label: { x: 0.1, y: 0.905, w: 0.4, h: 0.04 },
    line: { x: 0.1, y: 0.935, w: 0.8, h: 0.0012, opacity: 0.7 },
  },
  /* 满篇：只有一根发丝线（全屏无彩色，不做块面） */
  man: {
    label: { x: 0.1, y: 0.905, w: 0.4, h: 0.04 },
    line: { x: 0.1, y: 0.935, w: 0.8, h: 0.0008, opacity: 0.55 },
  },
  /* 四卡：页名换到右下（像一页刀版的编号），页脚线还是靠左、与卡片对齐 */
  ka: {
    label: { x: 0.68, y: 0.905, w: 0.22, h: 0.04 },
    line: { x: 0.08, y: 0.935, w: 0.84, h: 0.0015 },
  },
  /* 双年展：页名在右下，页脚线压到 .885（底下还有四栏短横） */
  shuangnian: {
    label: { x: 0.62, y: 0.795, w: 0.3, h: 0.04 },
    line: { x: 0.09, y: 0.885, w: 0.82, h: 0.0022 },
  },
  /* 钴蓝格：页名右下；顶底两道粗蓝线由版式自画（每一页都有，是母版的身份证） */
  gulan: {
    label: { x: 0.8, y: 0.9, w: 0.165, h: 0.04 },
    line: null,
  },
  /* 商务蓝：页名回到左下，页脚线只画左边那段（右边是 panel） */
  shangwu: {
    label: { x: 0.08, y: 0.9, w: 0.28, h: 0.04 },
    line: { x: 0.08, y: 0.932, w: 0.5, h: 0.0012 },
  },
  /* 三色刊：页名压到最下（结束页上半页是两块实色，页名必须落在下那条粉纸上） */
  sanse: {
    label: { x: 0.09, y: 0.895, w: 0.32, h: 0.04 },
    line: { x: 0.09, y: 0.925, w: 0.82, h: 0.002 },
  },
  /* 林地：页名左下，页脚发丝线压到 .93 */
  lindi: {
    label: { x: 0.1, y: 0.895, w: 0.3, h: 0.04 },
    line: { x: 0.1, y: 0.93, w: 0.8, h: 0.0012 },
  },
  /* 长桌宴：页名右下（卡片排到 .84） */
  changyan: {
    label: { x: 0.68, y: 0.852, w: 0.24, h: 0.04 },
    line: { x: 0.08, y: 0.925, w: 0.84, h: 0.0015 },
  },
  /* 单色刊：只有一根发丝线，页名压到最下 */
  danse: {
    label: { x: 0.1, y: 0.895, w: 0.28, h: 0.04 },
    line: { x: 0.1, y: 0.932, w: 0.8, h: 0.0008 },
  },
  /* 钢印：页名右下，页脚就是那道钢印线 */
  gangyin: {
    label: { x: 0.66, y: 0.865, w: 0.26, h: 0.04 },
    line: { x: 0.08, y: 0.93, w: 0.84, h: 0.002 },
  },
}

/** 走纸的底纹（§四）：例题铺 8%（网格感），提纲铺 6%，极简与书页不铺 */
const SURFACE_ALPHA: Record<FamilyId, number> = {
  watercolor: 0, business: 0, handdrawn: 0,
  suke: 0.04, xuan: 0.04, liti: 0.08, jijian: 0, shuye: 0, tigang: 0.06, lanxian: 0, liu: 0, chang: 0, man: 0, ka: 0,
  /* 第二批八族：色块都是排版里明着画的，不铺底纹 */
  shuangnian: 0, gulan: 0, shangwu: 0, sanse: 0, lindi: 0, changyan: 0, danse: 0, gangyin: 0,
}

/** 插画落点（§四）：极简不插图（一幅字就是全部）；书页的图在右栏，提纲的图在右半边。
 *  两处按「图位上不许有字」重定过：宣纸原来 y .56 起压住问句行（.83），素课原来 y .26 起
 *  顶到页眉线（HEAD.suke 到 .275）——现在都收到字框下面。 */
const ART_BOX: Record<FamilyId, Box | null> = {
  watercolor: { x: 0.545, y: 0.22, w: 0.39, h: 0.51 },
  business: { x: 0.545, y: 0.22, w: 0.39, h: 0.51 },
  handdrawn: { x: 0.545, y: 0.22, w: 0.39, h: 0.51 },
  suke: { x: 0.6, y: 0.29, w: 0.34, h: 0.48 },
  xuan: { x: 0.66, y: 0.5, w: 0.26, h: 0.3 },
  liti: { x: 0.5, y: 0.24, w: 0.44, h: 0.56 },
  jijian: null,
  shuye: { x: 0.66, y: 0.28, w: 0.28, h: 0.44 },
  tigang: { x: 0.6, y: 0.24, w: 0.34, h: 0.48 },
  lanxian: { x: 0.685, y: 0.29, w: 0.24, h: 0.4 },
  liu: { x: 0.7, y: 0.3, w: 0.22, h: 0.4 },
  chang: { x: 0.66, y: 0.28, w: 0.26, h: 0.42 },
  man: { x: 0.68, y: 0.32, w: 0.24, h: 0.38 },
  ka: { x: 0.68, y: 0.3, w: 0.24, h: 0.4 },
  shuangnian: { x: 0.62, y: 0.24, w: 0.3, h: 0.46 },
  gulan: { x: 0.68, y: 0.29, w: 0.24, h: 0.42 },
  /* 商务蓝：整条右 panel 就是图位（没画时那块浅色也在） */
  shangwu: { x: 0.76, y: 0, w: 0.24, h: 1 },
  sanse: { x: 0.66, y: 0.24, w: 0.3, h: 0.52 },
  /* 林地：右半张全是图（与 LINDI_PLATE 同坐标，画正好压在那块灰绿版上） */
  lindi: { x: 0.53, y: 0.13, w: 0.4, h: 0.68 },
  changyan: { x: 0.67, y: 0.28, w: 0.28, h: 0.5 },
  danse: { x: 0.66, y: 0.3, w: 0.26, h: 0.4 },
  gangyin: { x: 0.7, y: 0.24, w: 0.22, h: 0.42 },
}

/**
 * 引文块的字号：按「这个框到底放得下几行」算，不许靠三档硬套。
 * 30pt 的句子排三行就顶到框外（真机《狼牙山》复核），所以从大往小试，
 * 试到某一档的「每行字数 × 行数」装得下这一句为止；一档都不行就返回 null。
 * 这一层只算字号，不改字：引文是课文原句，一个字都不许动。
 */
function pullType(box: Box, n: number): { size: number; lineHeight: number } | null {
  const wPx = box.w * 0.72 * 1280
  const hPx = box.h * 0.6 * 720
  for (const size of [30, 26, 22, 19, 17, 15]) {
    const px = (size * 4) / 3
    const lh = size >= 24 ? 1.85 : 1.65
    const perLine = Math.max(4, Math.floor(wPx / px))
    const lines = Math.ceil(n / perLine)
    if (lines * px * lh <= hPx) return { size, lineHeight: lh }
  }
  return null
}

/**
 * 右半张（或右条）到底有没有东西：一张插画，或一句放得下的引文。
 * 两样都没有，那块大色块就不许画（2026-11-23 用户拍板「没有图画就不要那个大方块」），
 * 正文放宽到整页。口径与 place() 末尾压图 / 引文块两个分支一致：
 * 封面与原文页不压侧图，ART_SKIP 的页型也不压——那些页的图位永远是空的。
 */
function rightBusy(ctx: Ctx): boolean {
  const fam = ctx.theme.family
  const box = ART_BOX[fam]
  if (!box) return false
  const arch = archetypeOf(ctx.slide.kind)
  if (arch === 'cover' || arch === 'quote' || ART_SKIP[fam].includes(arch)) return false
  if (ctx.art) return true
  const pull = clean(ctx.slide.pull)
  if (!pull) return false
  return pullType(box, [...`“${pull}”`].length) !== null
}

/**
 * 这几页自己就把纸占满了（对照页左右两栏、字词页满幅），图位再压上去就是字压图。
 * 这一页宁可不压图——画留着不上屏，绝不把字盖住（「版面不许素」不等于「每页塞图」）。
 */
const ART_SKIP: Record<FamilyId, Arch[]> = {
  watercolor: [],
  business: [],
  handdrawn: [],
  suke: ['compare'],
  xuan: ['compare', 'words'],
  liti: ['compare'],
  jijian: [],
  shuye: [],
  tigang: [],
  lanxian: ['compare', 'words'],
  liu: ['compare', 'words'],
  chang: ['compare', 'words'],
  man: ['compare', 'words'],
  ka: ['compare', 'words'],
  shuangnian: ['compare', 'words', 'numbered'],
  /* 钴蓝格 / 商务蓝 / 长桌宴的条目页是满幅网格，图压上去就是字压图 */
  gulan: ['compare', 'words', 'numbered'],
  shangwu: ['compare', 'words', 'numbered'],
  sanse: ['compare', 'words', 'numbered'],
  lindi: ['compare', 'words'],
  changyan: ['compare', 'words', 'numbered'],
  danse: ['compare', 'words'],
  gangyin: ['compare', 'words'],
}

/** 两块框压在一起多大（0–1 的面积，只用来判「图位上有没有字」） */
function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** 这一页有画时，正文让到图的左边；没画就原样。挤不出人样的窄栏就不动（那几页由 ART_SKIP 管）。 */
function besideArt(ctx: Ctx, box: Box): Box {
  const art = ctx.art ? ART_BOX[ctx.theme.family] : null
  if (!art) return box
  const right = art.x - 0.035
  if (box.x + box.w <= right) return box
  if (right - box.x < 0.2) return box
  return { ...box, w: right - box.x }
}

/** 正文只有一两短句：这一页就是一句「重点句」，不该像没排完的稿子 */
function heroBody(ctx: Ctx): boolean {
  const items = ctx.items
  const chars = items.join('').replace(/\s+/g, '').length
  return items.length > 0 && items.length <= 2 && chars <= 32
}

/**
 * 正文块（各族的 plain 共用这一处口径，框与字号各给各的）：
 *   · 条目少 → 字抬一档半、垂直居中、左边一道 accent 竖杠，像一页招贴；
 *   · 条目多 → 照旧左齐顶排。
 * 这是「版面不许素」的底线：一页只有一句话的时候，它也必须有骨头。
 */
function bodyBlock(ctx: Ctx, box: Box, size: number, lh: number): void {
  if (heroBody(ctx)) {
    cRect(ctx, { x: box.x - 0.022, y: box.y + 0.02, w: 0.006, h: Math.min(box.h, 0.24) }, ctx.theme.accent, 0.55)
    cText(ctx, { ...box, x: box.x + 0.02, w: box.w - 0.02 }, bodyOf(ctx), {
      size: Math.round(size * 1.5),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.5,
      valign: 'middle',
    })
    return
  }
  /* 条目多：先算「这么多行 × 这么大字」装不装得进框，装不下就缩字号——
     否则 6 条 24pt / 1.9 倍行距会一路排到问句行上（1 归一 = 540pt） */
  const rows = bodyOf(ctx).split('\n').filter(Boolean).length
  const fit = Math.floor(((box.h - 0.02) * 540) / Math.max(1, rows * lh))
  const s = Math.max(14, Math.min(size, fit))
  cText(ctx, box, bodyOf(ctx), { size: s, color: ctx.theme.ink, font: ctx.theme.fontBody, lineHeight: lh })
}

/** 标题下那道短线（素课 / 宣纸 / 例题）：正文页只有字的时候，这一点墨就是版面的骨头。
 *  极简不放（它的身份就是一根线都不画），书页有边栏线、提纲有标题带，各自已有记号。 */
function tick(ctx: Ctx, title: Box): void {
  cRect(ctx, { x: title.x, y: title.y + title.h + 0.005, w: 0.07, h: 0.006 }, ctx.theme.accent, 0.85)
}

/** 原文页字号四档：≤20 字 / 21–40 字 / 41–80 字 / 81–120 字（整段） */
const QUOTE_PT: Record<FamilyId, [number, number, number, number]> = {
  watercolor: [32, 32, 24, 24],
  business: [32, 32, 24, 24],
  handdrawn: [32, 32, 24, 24],
  suke: [40, 32, 26, 21],
  xuan: [36, 30, 24, 19],
  liti: [32, 28, 24, 19],
  jijian: [48, 48, 44, 35],
  shuye: [42, 32, 26, 21],
  tigang: [38, 30, 26, 21],
  lanxian: [52, 42, 34, 27],
  liu: [46, 36, 30, 24],
  chang: [44, 34, 28, 22],
  man: [50, 40, 32, 26],
  ka: [42, 34, 28, 22],
  shuangnian: [44, 34, 28, 22],
  gulan: [48, 38, 32, 26],
  shangwu: [46, 36, 30, 24],
  sanse: [42, 33, 27, 22],
  lindi: [50, 40, 32, 26],
  changyan: [44, 35, 29, 23],
  danse: [52, 42, 34, 27],
  gangyin: [46, 36, 30, 24],
}

export function quotePointSize(chars: number, id: FamilyId = 'suke'): number {
  const [a, b, c, d] = QUOTE_PT[id]
  /* 四档：≤20 / ≤40 / ≤80 / ≤120（2026-11-22 原文页改印整段后加的第四档） */
  return chars <= 20 ? a : chars <= 40 ? b : chars <= 80 ? c : d
}

/* ------------------------------ 封面 · 满版（TASKS/20b） ------------------------------ */

/**
 * 封面三种构图：一张画铺满整页，标题压在图上空出来的那一块。
 * 选哪一种**不看模板**，看图上量出来的四象限空占比（inspect.ts 的 ArtNumbers.quad）。
 */
export type CoverArch = 'left' | 'bottom' | 'rightTop'

interface CoverPlan {
  title: Box
  bar: Box
  sub: Box
  /** 字底下那层纸色压底：只盖文字块，绝不整页蒙版（整页蒙版会发灰） */
  scrim: Box
}

/** 压底向外扩一圈，字就不会贴着图的硬边走 */
const SCRIM_PAD = 0.035

function scrimOf(...boxes: Box[]): Box {
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - SCRIM_PAD)
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - SCRIM_PAD)
  const x1 = Math.min(1, Math.max(...boxes.map((b) => b.x + b.w)) + SCRIM_PAD)
  const y1 = Math.min(1, Math.max(...boxes.map((b) => b.y + b.h)) + SCRIM_PAD)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 三种构图的基础槽位（§2.3 原表）；短杠与副题永远跟着标题底边走 */
function coverPlan(arch: CoverArch): CoverPlan {
  if (arch === 'bottom') {
    const title = { x: 0.09, y: 0.62, w: 0.72, h: 0.16 }
    const bar = { x: 0.09, y: 0.795, w: 0.045, h: 0.008 }
    const sub = { x: 0.09, y: 0.81, w: 0.6, h: 0.06 }
    return { title, bar, sub, scrim: scrimOf(title, bar, sub) }
  }
  if (arch === 'rightTop') {
    const title = { x: 0.52, y: 0.12, w: 0.4, h: 0.2 }
    const bar = { x: 0.52, y: 0.335, w: 0.045, h: 0.008 }
    const sub = { x: 0.52, y: 0.35, w: 0.38, h: 0.06 }
    return { title, bar, sub, scrim: scrimOf(title, bar, sub) }
  }
  const title = { x: 0.07, y: 0.34, w: 0.44, h: 0.2 }
  const bar = { x: 0.07, y: 0.555, w: 0.045, h: 0.008 }
  const sub = { x: 0.07, y: 0.57, w: 0.42, h: 0.06 }
  return { title, bar, sub, scrim: scrimOf(title, bar, sub) }
}

/** 一张图的四象限空占比（inspect.measureImage 的子集；只取这三个数） */
export interface EmptyQuad {
  tl: number
  tr: number
  bl: number
  br: number
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * 三种构图选哪一种：左空 / 下空 / 右上空，谁最空选谁；
 * 三者差不到 0.08（图上到处都满）→ 走下空，并把压底压得更实。
 */
export function coverLayoutOf(quad?: EmptyQuad | null): { arch: CoverArch; scrim: number } {
  if (!quad) return { arch: 'left', scrim: 0.78 }
  const left = (num(quad.tl) + num(quad.bl)) / 2
  const bottom = (num(quad.bl) + num(quad.br)) / 2
  const corner = num(quad.tr)
  const best = Math.max(left, bottom, corner)
  if (best - Math.min(left, bottom, corner) < 0.08) return { arch: 'bottom', scrim: 0.88 }
  if (best === left) return { arch: 'left', scrim: 0.78 }
  if (best === corner) return { arch: 'rightTop', scrim: 0.78 }
  return { arch: 'bottom', scrim: 0.78 }
}

/** 只要构图（门禁与调试用） */
export function coverArchOf(quad?: EmptyQuad | null): CoverArch {
  return coverLayoutOf(quad).arch
}

/** 这一页记下的构图；老存档没有这个字段就按左空走（左空是三种里最稳的） */
function archOf(slide: StudentSlide): CoverArch {
  const v = String(slide.coverArch ?? '')
  return v === 'bottom' || v === 'rightTop' ? v : 'left'
}

/** 压底透明度：0–1，越接近 1 越实；乱值一律回落到兜底值 */
function clampOpacity(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0.5, n))
}

/**
 * 无图兜底的那条线稿：按学科画（TASKS/24 §三，见 lib/motifs.ts）。
 * 语文是地平线 + 雨丝（与 20b 那一套同值），数学是方格与坐标，英语是四线三格，
 * 科学是坐标与柱，史地是经纬网；认不出学科就画一条地平线 + 五根短笔。
 * 纯常量表，不取随机——place() 的纯函数判据（check:template 第 4 条）不能被它破坏。
 */

/**
 * 各族在封面上能调的只有三件：标题字号、对齐、装饰件（§四）。
 * dy / dw 是「在留白区里再挪一点点」——挪动幅度小于槽位高度，
 * 所以「标题块与主体零重叠」这条判据在任何一族上都成立。
 */
const COVER_TUNE: Record<
  FamilyId,
  {
    dy: number
    /** 在留白区里横着再挪一点：题干位置是靠 x 区分的，光靠字号差门禁不认 */
    dx: number
    dw: number
    dh: number
    size: number
    align: 'left' | 'center'
    font?: FontKey
    sub: number
    /** 副题距标题底边多少：极简贴得最近（它没有短杠隔开） */
    gap: number
    /** 按字数把标题撑满框宽（栏线用：中文标题 3 字与 10 字差得远，固定 pt 必歪） */
    fit?: boolean
  }
> = {
  watercolor: { dy: -0.02, dx: 0.015, dw: 0.02, dh: 0, size: 44, align: 'left', sub: 18, gap: 0.03 },
  business: { dy: -0.01, dx: 0.02, dw: 0.04, dh: 0, size: 44, align: 'left', sub: 18, gap: 0.03 },
  handdrawn: { dy: -0.015, dx: 0.035, dw: 0.03, dh: 0, size: 44, align: 'left', sub: 18, gap: 0.03 },
  suke: { dy: 0, dx: 0, dw: 0, dh: 0, size: SIZES.h1, align: 'left', sub: 18, gap: 0.03 },
  xuan: { dy: -0.04, dx: 0, dw: -0.04, dh: 0, size: 40, align: 'center', font: 'kai', sub: 16, gap: 0.03 },
  liti: { dy: 0.04, dx: 0, dw: 0.02, dh: 0, size: 44, align: 'left', sub: 16, gap: 0.03 },
  jijian: { dy: -0.08, dx: 0, dw: 0, dh: 0.02, size: SIZES.h1Big, align: 'left', sub: 14, gap: 0 },
  /* 书页：标题往右下错一点，左边留出边栏线（与内页同一条） */
  shuye: { dy: 0.02, dx: 0.04, dw: 0.06, dh: 0, size: 48, align: 'left', sub: 16, gap: 0.03 },
  /* 提纲：标题略大、贴得最紧，像一张大纲的表头 */
  tigang: { dy: 0.02, dx: -0.03, dw: 0, dh: 0.02, size: 50, align: 'left', sub: 16, gap: 0.02 },
  /* 栏线：标题最大、压到最下，顶上一道通栏线把整页切出来（与 Biennale 封面同构） */
  lanxian: { dy: 0.09, dx: -0.005, dw: 0.16, dh: 0.02, size: 52, align: 'left', sub: 16, gap: 0.03, fit: true },
  /* 六栏：标题抬高、往右缩，下面留出三道横线（Cobalt Grid 的格子感） */
  liu: { dy: -0.05, dx: 0.04, dw: -0.06, dh: 0, size: 66, align: 'left', sub: 16, gap: 0.04 },
  /* 长桌：标题黑体、压在一张纸卡上，副题紧贴（像一张桌签） */
  chang: { dy: 0.05, dx: 0.075, dw: -0.04, dh: 0, size: 58, align: 'left', font: 'hei', sub: 16, gap: 0.02 },
  /* 满篇：标题提得最高、无装饰，下面一大片空给正文（无彩色的靠字号层级撑页） */
  man: { dy: -0.12, dx: 0, dw: -0.02, dh: 0, size: 56, align: 'left', sub: 15, gap: 0.03 },
  /* 四卡：标题黑体、字最大，整块压到纸面下半（Stencil 的下沉式封），左边空出来给刀版白 */
  ka: { dy: 0.13, dx: 0.06, dw: 0, dh: 0.04, size: 62, align: 'left', font: 'hei', sub: 15, gap: 0.02 },
  /* 第二批八族：字号 41/42/43/45/47/49/51/53 占满剩下的空档（19 族两两不等）；
     标题整体压到下半张：dy 三档（.15/.19/.23）× dx 三档（左/中/右），
     同 dx 组内 dy 差 ≥ .04（标题与教材行两处 y 都拉开），跨组靠 dx 再拉一次。
     每一档的「副题底边」算式是 .698 + dy + dh + gap，一律 ≤ .985，不靠 clamp 往上收——
     一收就会把 .23 拉回到 .19 的位置上，两族又变成一模一样。 */
  shuangnian: { dy: 0.15, dx: 0, dw: 0.04, dh: 0, size: 41, align: 'left', sub: 16, gap: 0.04 },
  gulan: { dy: 0.15, dx: -0.06, dw: 0.06, dh: 0.01, size: 42, align: 'left', sub: 16, gap: 0.04 },
  shangwu: { dy: 0.15, dx: 0.12, dw: 0.08, dh: 0, size: 43, align: 'left', sub: 16, gap: 0.04 },
  sanse: { dy: 0.19, dx: 0, dw: 0.02, dh: 0.02, size: 45, align: 'left', sub: 15, gap: 0.05 },
  lindi: { dy: 0.19, dx: -0.06, dw: 0.06, dh: 0, size: 47, align: 'left', sub: 16, gap: 0.06 },
  changyan: { dy: 0.19, dx: 0.12, dw: 0.06, dh: 0, size: 49, align: 'left', sub: 15, gap: 0.04 },
  danse: { dy: 0.23, dx: 0, dw: -0.04, dh: 0.02, size: 51, align: 'left', sub: 14, gap: 0.03 },
  gangyin: { dy: 0.23, dx: -0.06, dw: 0.1, dh: 0, size: 53, align: 'left', sub: 13, gap: 0.045 },
}

/**
 * 封面的「撑满」字号：中文标题 3 字与 10 字差得远，固定 pt 要么小得像页眉、
 * 要么折行撞副题。按标题框宽与字数反算（中文全角，1pt 宽≈1pt），封顶 96、兜底 36。
 */
function coverFitSize(title: Box, text: string): number {
  const n = Math.max(1, Array.from(clean(text)).length)
  return Math.min(96, Math.max(36, Math.floor((title.w * 1280 * 0.95 * 0.75) / n)))
}

/** 封面：各族共用满版几何，只调字号 / 对齐 / 装饰件 */
function coverLayout(ctx: Ctx, id: FamilyId): void {
  const arch = archOf(ctx.slide)
  const plan = coverPlan(arch)
  const tune = COVER_TUNE[id]
  const title: Box = {
    x: plan.title.x + tune.dx,
    y: plan.title.y + tune.dy,
    /* 右上空构图的标题框贴右沿：再往外扩就出纸，宽一律裁到纸内 */
    w: Math.min(plan.title.w + tune.dw, 1 - (plan.title.x + tune.dx) - 0.02),
    h: plan.title.h + tune.dh,
  }
  /** 副题跟着标题走：同一条左边线，右边不越纸面（右上空构图时标题框可能贴右沿） */
  const subW = Math.min(title.w, 1 - title.x - 0.02)
  /* 教材标注（小学语文 · 五年级上册）站标题下第一行，副题让到它下面：
     顺序是「课题 → 哪本教材 → 这一页的一句」。字只多不少，所以压底要把两块一起盖住。 */
  const meta: Box = { x: title.x, y: title.y + title.h + 0.04, w: subW, h: 0.05 }
  /* 副题跟族走：从 meta 的**底边**起算，gap 只决定多紧——gap 0 也不许让字压字 */
  const sub: Box = { ...plan.sub, x: title.x, y: meta.y + meta.h + 0.008 + tune.gap, w: subW }
  /* 第二批八族的标题压得低（dy 到 .23）：碰上「上图下空 / 右上空」两种构图时整块会挤出下沿，
     这里三块一起往上收——只动 y、不动字号，「19 族封面字号两两不等」不受影响。 */
  const bottom = Math.max(title.y + title.h, meta.y + meta.h, sub.y + sub.h)
  if (bottom > 0.985) {
    const up = bottom - 0.985
    title.y -= up
    meta.y -= up
    sub.y -= up
  }
  /** 署名（几年级几班 · 授课人）：右下角，与页脚位置错开，老师可改 */
  const byline: Box = { x: 0.6, y: 0.905, w: 0.34, h: 0.05 }

  if (ctx.art) {
    ctx.out.push({ kind: 'image', x: 0, y: 0, w: 1, h: 1, data: ctx.art })
    // 压底只用纸色低透明度，绝不用黑色（黑压底会脏），也绝不整页蒙版
    cRect(ctx, scrimOf(title, sub, meta, byline), ctx.theme.paper, clampOpacity(ctx.slide.coverScrim, 0.78))
  } else {
    // 没图不等于白卡：按这一科的线稿画，线色 28%（§2.4）
    const motif = motifOfKey(ctx.slide.motif)
    for (const b of motif.strokes) cLine(ctx, b, ctx.theme.muted, 0.28)
    cLine(ctx, motif.ground, ctx.theme.muted, 0.28)
  }

  const titleSize = tune.fit ? coverFitSize(title, ctx.title) : tune.size
  cText(ctx, title, ctx.title, {
    size: titleSize,
    color: ctx.theme.ink,
    font: tune.font ?? ctx.theme.fontTitle,
    align: tune.align,
    valign: 'middle',
    lineHeight: id === 'jijian' || id === 'lanxian' ? 1.12 : 1.2,
    bold: id !== 'xuan',
  })
  // 极简无短杠（§3.4）；满篇也无——它只靠字与发丝线（族设里就写着「无短线、无块面」）
  if (id !== 'jijian' && id !== 'man') {
    // 居中的那族（宣纸）短杠跟着字走：字居中、杠留在框左沿会像一道浮墨
    const barW = id === 'liti' ? 0.18 : id === 'lanxian' ? 0.26 : 0.045
    const barX = tune.align === 'center' ? title.x + (title.w - barW) / 2 : title.x
    cRect(
      ctx,
      { ...plan.bar, x: barX, y: title.y + title.h + 0.012, w: barW, h: id === 'liti' ? 0.012 : id === 'lanxian' ? 0.014 : 0.008 },
      ctx.theme.accent,
    )
  }
  cText(ctx, sub, ctx.note || ctx.line, {
    size: tune.sub,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: tune.align,
    valign: 'middle',
    lineHeight: 1.3,
  })
  /* 教材标注与署名：这两行是封面跟 WPS 模板对齐的那两行，不是装饰，所以不跟族走 */
  cText(ctx, meta, ctx.slide.meta ?? '', {
    size: 14,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: tune.align,
    valign: 'middle',
    lineHeight: 1.3,
  })
  cText(ctx, byline, ctx.slide.byline ?? '', {
    size: 11,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: 'right',
    valign: 'middle',
    lineHeight: 1.3,
  })
  // 宣纸：朱红方印，只在没图的时候落（有图时整页是画，别再压一块红）
  if (id === 'xuan' && !ctx.art) seal(ctx, { x: 0.82, y: 0.8, w: 0.09, h: 0.09 })
}

/** 宣纸的朱红方印：一个 accent 实心块 + 两个反白小字 */
function seal(ctx: Ctx, box: Box): void {
  cRect(ctx, box, ctx.theme.accent, 0.9)
  cText(ctx, box, '宣纸', {
    size: 10,
    color: ctx.theme.paper,
    font: 'kai',
    align: 'center',
    valign: 'middle',
    lineHeight: 1,
  })
}

/* ------------------------------ 素课 suke ------------------------------ */

const suke: Record<Arch, Layout> = {
  cover: (ctx) => coverLayout(ctx, 'suke'),
  quote: (ctx) => {
    const quote = `「${ctx.quote}」`
    cText(ctx, { x: 0.12, y: 0.22, w: 0.76, h: 0.58 }, quote, {
      size: quotePointSize(Array.from(quote).length, 'suke'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.6, y: 0.72, w: 0.28, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'right',
      valign: 'middle',
    })
  },
  words: (ctx) => {
    cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 单列 ≤5 行，右侧 x .60 留给插画
    cText(ctx, { x: 0.085, y: 0.3, w: 0.5, h: 0.52 }, ctx.items.slice(0, 5).join('\n'), {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.7,
    })
  },
  numbered: (ctx) => {
    const list = takeNumbered(ctx)
    cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    tick(ctx, HEAD.suke)
    // 编号用中文数字，序号单独一框、正文另一框（两框同字号同行距，行就对得上）
    cText(ctx, { x: 0.085, y: 0.3, w: 0.05, h: 0.52 }, list.map((_, i) => CN_NUM[i] ?? '·').join('\n'), {
      size: SIZES.body,
      color: ctx.theme.accent,
      font: ctx.theme.fontTitle,
      lineHeight: 1.75,
    })
    cText(ctx, besideArt(ctx, { x: 0.155, y: 0.3, w: 0.72, h: 0.52 }), list.join('\n'), {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.75,
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    cText(ctx, { x: 0.085, y: 0.34, w: 0.4, h: 0.46 }, left.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.5,
    })
    cText(ctx, { x: 0.525, y: 0.34, w: 0.4, h: 0.46 }, right.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.5,
    })
    // 两栏之间一条竖线：纸线，不抢 accent
    cLine(ctx, { x: 0.505, y: 0.32, w: 0.0015, h: 0.5 }, ctx.theme.line)
  },
  end: (ctx) => {
    cText(ctx, { x: 0.2, y: 0.4, w: 0.6, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
      size: SIZES.h2,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.2, y: 0.58, w: 0.6, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'center',
    })
  },
  plain: (ctx) => {
    const title: Box = { x: 0.085, y: 0.14, w: 0.76, h: 0.1 }
    cText(ctx, title, ctx.title, {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
    })
    tick(ctx, title)
    bodyBlock(ctx, besideArt(ctx, { x: 0.085, y: 0.28, w: 0.76, h: 0.54 }), 22, 1.8)
  },
}

/* ------------------------------ 宣纸 xuan ------------------------------ */

const xuan: Record<Arch, Layout> = {
  cover: (ctx) => coverLayout(ctx, 'xuan'),
  quote: (ctx) => {
    const quote = `「${ctx.quote}」`
    cText(ctx, { x: 0.18, y: 0.2, w: 0.64, h: 0.6 }, quote, {
      size: quotePointSize(Array.from(quote).length, 'xuan'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 2,
    })
    cText(ctx, { x: 0.18, y: 0.8, w: 0.64, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'center',
    })
  },
  words: (ctx) => {
    cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: 'center' })
    // 两列对称，列内居中
    const [left, right] = splitEven(ctx.items)
    cText(ctx, { x: 0.16, y: 0.3, w: 0.32, h: 0.52 }, left.join('\n'), {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.52, y: 0.3, w: 0.32, h: 0.52 }, right.join('\n'), {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.9,
    })
  },
  numbered: (ctx) => {
    cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: 'center' })
    tick(ctx, HEAD.xuan)
    // 「其一　…」：序号与正文同一行，框居中、字左齐
    const body = takeNumbered(ctx).map((t, i) => `其${CN_NUM[i] ?? '一'}　${t}`).join('\n')
    cText(ctx, besideArt(ctx, { x: 0.22, y: 0.3, w: 0.56, h: 0.52 }), body, {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'left',
      lineHeight: 1.9,
    })
  },
  compare: (ctx) => {
    // 上下叠置：不做左右栏
    const [top, bottom] = halves(ctx.items)
    cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: 'center' })
    cText(ctx, { x: 0.18, y: 0.24, w: 0.64, h: 0.24 }, top.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      align: 'center',
      lineHeight: 1.6,
    })
    cLine(ctx, { x: 0.18, y: 0.48, w: 0.64, h: 0.0015 }, ctx.theme.line)
    cText(ctx, { x: 0.18, y: 0.52, w: 0.64, h: 0.26 }, bottom.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      align: 'center',
      lineHeight: 1.6,
    })
  },
  end: (ctx) => {
    cText(ctx, { x: 0.3, y: 0.42, w: 0.4, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 30,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.3, y: 0.6, w: 0.4, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'center',
    })
    seal(ctx, { x: 0.86, y: 0.8, w: 0.07, h: 0.07 })
  },
  plain: (ctx) => {
    const title: Box = { x: 0.18, y: 0.16, w: 0.64, h: 0.1 }
    cText(ctx, title, ctx.title, {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
    })
    tick(ctx, { ...title, x: 0.18 + (0.64 - 0.07) / 2 })
    bodyBlock(ctx, besideArt(ctx, { x: 0.18, y: 0.3, w: 0.64, h: 0.52 }), 22, 2)
  },
}

/* ------------------------------ 例题 liti ------------------------------ */

const liti: Record<Arch, Layout> = {
  cover: (ctx) => coverLayout(ctx, 'liti'),
  quote: (ctx) => {
    const quote = `「${ctx.quote}」`
    cText(ctx, { x: 0.06, y: 0.22, w: 0.66, h: 0.56 }, quote, {
      size: quotePointSize(Array.from(quote).length, 'liti'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.6,
    })
    // 左侧竖标：例题的「题号边线」
    cRect(ctx, { x: 0.02, y: 0.24, w: 0.008, h: 0.52 }, ctx.theme.accent, 0.25)
    cText(ctx, { x: 0.06, y: 0.8, w: 0.4, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 两列网格 × 两行，每个词一张浅底卡；有画时改竖排一列，右半边让给图
    const cells: Box[] = ctx.art
      ? [
          { x: 0.06, y: 0.3, w: 0.38, h: 0.09 },
          { x: 0.06, y: 0.41, w: 0.38, h: 0.09 },
          { x: 0.06, y: 0.52, w: 0.38, h: 0.09 },
          { x: 0.06, y: 0.63, w: 0.38, h: 0.09 },
        ]
      : [
          { x: 0.06, y: 0.32, w: 0.4, h: 0.09 },
          { x: 0.5, y: 0.32, w: 0.44, h: 0.09 },
          { x: 0.06, y: 0.44, w: 0.4, h: 0.09 },
          { x: 0.5, y: 0.44, w: 0.44, h: 0.09 },
        ]
    ctx.items.slice(0, 4).forEach((word, i) => {
      const box = cells[i]
      // 浅底卡：surface 只铺 8%（§3.3），不是一块实心色块
      cRect(ctx, box, ctx.theme.surface, 0.08)
      cText(ctx, { ...box, h: box.h }, word, {
        size: 24,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        align: 'center',
        valign: 'middle',
        lineHeight: 1.2,
      })
    })
  },
  numbered: (ctx) => {
    cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    tick(ctx, HEAD.liti)
    // 阿拉伯数字 + 阶梯缩进，每步下面一条细线；有画时整体收到图的左边
    const list = takeNumbered(ctx)
    const step = Math.min(0.14, 0.5 / Math.max(1, list.length))
    list.forEach((t, n) => {
      const x = 0.06 + n * 0.02
      const w = (ctx.art ? 0.4 : 0.88) - n * 0.02
      const y = 0.3 + n * step
      cText(ctx, { x, y, w, h: step - 0.02 }, `${n + 1}. ${t}`, {
        size: 24,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.5,
      })
      cLine(ctx, { x, y: y + step - 0.02, w, h: 0.001 }, ctx.theme.line)
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 两栏各带一条标题条，中间一条竖线
    cRect(ctx, { x: 0.06, y: 0.22, w: 0.4, h: 0.06 }, ctx.theme.surface, 0.1)
    cRect(ctx, { x: 0.5, y: 0.22, w: 0.44, h: 0.06 }, ctx.theme.surface, 0.1)
    cText(ctx, { x: 0.06, y: 0.27, w: 0.4, h: 0.46 }, left.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.5,
    })
    cText(ctx, { x: 0.5, y: 0.27, w: 0.44, h: 0.46 }, right.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.5,
    })
    cLine(ctx, { x: 0.475, y: 0.22, w: 0.0012, h: 0.6 }, ctx.theme.line)
  },
  end: (ctx) => {
    cText(ctx, { x: 0.2, y: 0.46, w: 0.6, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 32,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.06, y: 0.6, w: 0.6, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    const title: Box = { x: 0.06, y: 0.14, w: 0.7, h: 0.1 }
    cText(ctx, title, ctx.title, {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
    })
    tick(ctx, title)
    // 说明页通栏，不分栏（有画时收到图的左边）
    bodyBlock(ctx, besideArt(ctx, { x: 0.06, y: 0.32, w: 0.88, h: 0.54 }), 22, 1.7)
  },
}

/* ------------------------------ 极简 jijian ------------------------------ */

const jijian: Record<Arch, Layout> = {
  cover: (ctx) => coverLayout(ctx, 'jijian'),
  quote: (ctx) => {
    const quote = `「${ctx.quote}」`
    cText(ctx, { x: 0.1, y: 0.26, w: 0.8, h: 0.48 }, quote, {
      size: quotePointSize(Array.from(quote).length, 'jijian'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.5,
    })
    cText(ctx, { x: 0.1, y: 0.76, w: 0.8, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'center',
    })
  },
  words: (ctx) => {
    cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 横排两列 × 两行
    const cells: Box[] = [
      { x: 0.1, y: 0.32, w: 0.38, h: 0.1 },
      { x: 0.52, y: 0.32, w: 0.38, h: 0.1 },
      { x: 0.1, y: 0.44, w: 0.38, h: 0.1 },
      { x: 0.52, y: 0.44, w: 0.38, h: 0.1 },
    ]
    ctx.items.slice(0, 4).forEach((word, i) => {
      cText(ctx, cells[i], word, {
        size: 28,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        lineHeight: 1.2,
      })
    })
  },
  numbered: (ctx) => {
    cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 小圆点 + 大行距，一根线都不画；条数多就把字号与行距一起收（6 条 24pt / 2 会排到问句行上）
    const list = takeNumbered(ctx)
    const size = list.length <= 3 ? 24 : list.length <= 4 ? 22 : list.length <= 5 ? 20 : 19
    const lh = list.length <= 3 ? 2 : list.length <= 4 ? 1.9 : list.length <= 5 ? 1.85 : 1.8
    cText(ctx, { x: 0.1, y: 0.36, w: 0.02, h: 0.4 }, list.map(() => '·').join('\n'), {
      size,
      color: ctx.theme.accent,
      font: ctx.theme.fontBody,
      lineHeight: lh,
    })
    cText(ctx, { x: 0.135, y: 0.36, w: 0.765, h: 0.4 }, list.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: lh,
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 左右 50/50，没有分隔线，靠间距分开
    cText(ctx, { x: 0.1, y: 0.4, w: 0.38, h: 0.36 }, left.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.7,
    })
    cText(ctx, { x: 0.52, y: 0.4, w: 0.38, h: 0.36 }, right.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.7,
    })
  },
  end: (ctx) => {
    cText(ctx, { x: 0.25, y: 0.42, w: 0.5, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 40,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.25, y: 0.6, w: 0.5, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'center',
    })
  },
  plain: (ctx) => {
    cText(ctx, { x: 0.1, y: 0.14, w: 0.8, h: 0.1 }, ctx.title, {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
    })
    bodyBlock(ctx, { x: 0.1, y: 0.34, w: 0.8, h: 0.46 }, 24, 1.9)
  },
}

/* ------------------------------ 书页 shuye（TASKS/24） ------------------------------ */

/**
 * 书页：一页书的样子——左边一道边栏线（页名、序号、出处），正文压在右栏，
 * 右边缘再留一条放插画的宽栏。与素课的区别不是「往右挪一点」：
 * 素课是整页单栏、图压在文字上方；书页是两条栏线把纸分成三块，
 * 正文永远不越边栏线，对比页也不是左右分栏，而是同一栏里上下两段。
 */
const shuye: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'shuye')
    // 边栏线：封面也有，跟内页同一条 x（这是这一族的记号）
    cLine(ctx, { x: 0.235, y: 0.08, w: 0.0018, h: 0.78 }, ctx.theme.line, 0.6)
  },
  quote: (ctx) => {
    const quote = `「${ctx.quote}」`
    cText(ctx, { x: 0.26, y: 0.22, w: 0.62, h: 0.48 }, quote, {
      size: quotePointSize(Array.from(quote).length, 'shuye'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
    })
    // 出处写在左边栏（书页的页边注），不在句子下面
    cText(ctx, { x: 0.05, y: 0.22, w: 0.15, h: 0.32 }, ctx.note, {
      size: 13,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'right',
      lineHeight: 1.7,
    })
    cLine(ctx, { x: 0.235, y: 0.16, w: 0.0018, h: 0.62 }, ctx.theme.line)
  },
  words: (ctx) => {
    const list = ctx.items.slice(0, 5)
    cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 左边栏放序号，右栏放词：书的旁批与正文
    cText(ctx, { x: 0.05, y: 0.32, w: 0.15, h: 0.44 }, list.map((_, i) => String(i + 1)).join('\n'), {
      size: 14,
      color: ctx.theme.accent,
      font: ctx.theme.fontBody,
      align: 'right',
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.26, y: 0.32, w: 0.34, h: 0.44 }, list.join('\n'), {
      size: 24,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
    })
    cLine(ctx, { x: 0.235, y: 0.26, w: 0.0018, h: 0.5 }, ctx.theme.line)
  },
  numbered: (ctx) => {
    const list = takeNumbered(ctx)
    cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    cText(ctx, { x: 0.05, y: 0.32, w: 0.15, h: 0.46 }, list.map((_, i) => CN_NUM[i] ?? '·').join('\n'), {
      size: 13,
      color: ctx.theme.accent,
      font: ctx.theme.fontBody,
      align: 'right',
      lineHeight: 2,
    })
    cText(ctx, { x: 0.26, y: 0.32, w: 0.34, h: 0.46 }, list.join('\n'), {
      size: 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 2,
    })
    cLine(ctx, { x: 0.235, y: 0.26, w: 0.0018, h: 0.52 }, ctx.theme.line)
  },
  compare: (ctx) => {
    const [top, bottom] = halves(ctx.items)
    cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 同一栏里上下两段，中间一条纸线：像书里前后两段对照着读
    cText(ctx, { x: 0.26, y: 0.3, w: 0.34, h: 0.2 }, top.join('\n'), {
      size: 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.6,
    })
    cLine(ctx, { x: 0.26, y: 0.52, w: 0.34, h: 0.0012 }, ctx.theme.line)
    cText(ctx, { x: 0.26, y: 0.56, w: 0.34, h: 0.2 }, bottom.join('\n'), {
      size: 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.6,
    })
    cLine(ctx, { x: 0.235, y: 0.26, w: 0.0018, h: 0.52 }, ctx.theme.line)
  },
  end: (ctx) => {
    cText(ctx, { x: 0.26, y: 0.38, w: 0.34, h: 0.16 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 30,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.4,
    })
    cText(ctx, { x: 0.26, y: 0.64, w: 0.34, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    cLine(ctx, { x: 0.235, y: 0.16, w: 0.0018, h: 0.72 }, ctx.theme.line)
  },
  plain: (ctx) => {
    cText(ctx, { x: 0.26, y: 0.16, w: 0.34, h: 0.09 }, ctx.title, {
      size: SIZES.body,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
    })
    bodyBlock(ctx, besideArt(ctx, { x: 0.26, y: 0.3, w: 0.34, h: 0.48 }), 22, 1.8)
    cLine(ctx, { x: 0.235, y: 0.12, w: 0.0018, h: 0.72 }, ctx.theme.line)
  },
}

/* ------------------------------ 提纲 tigang（TASKS/24） ------------------------------ */

/**
 * 提纲：顶上一条通栏标题条（纸色深一档 + 一条 accent 细线），下面每一条都顶着一个大序号，
 * 条与条之间一条纸线。适合要背的课（史地 / 道法 / 科学复习）：一页就是一张提纲。
 * 与例题的区别：例题是双栏卡片、序号顶在句子里；提纲是单栏、序号单独占一栏。
 */
const tigangBand = (ctx: Ctx): void => {
  cRect(ctx, { x: 0.06, y: 0.06, w: 0.88, h: 0.13 }, ctx.theme.surface, 0.12)
  cLine(ctx, { x: 0.06, y: 0.19, w: 0.88, h: 0.0018 }, ctx.theme.accent, 0.5)
}

const tigang: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'tigang')
    // 封面也顶一条标题带：这是这一族的记号，跟内页同一条（缩略图上第一眼就该认出来）
    tigangBand(ctx)
  },
  quote: (ctx) => {
    const quote = `「${ctx.quote}」`
    // 标题条只做装饰（一条纸色带 + 一条 accent 线）：标题在这一页是重复的，不许再占一行字
    tigangBand(ctx)
    cText(ctx, { x: 0.09, y: 0.22, w: 0.82, h: 0.48 }, quote, {
      size: quotePointSize(Array.from(quote).length, 'tigang'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.09, y: 0.82, w: 0.5, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    tigangBand(ctx)
    cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    // 四个词各占一格，格前一个小实心方块
    const cells: Box[] = [
      { x: 0.09, y: 0.3, w: 0.2, h: 0.07 },
      { x: 0.33, y: 0.3, w: 0.2, h: 0.07 },
      { x: 0.09, y: 0.41, w: 0.2, h: 0.07 },
      { x: 0.33, y: 0.41, w: 0.2, h: 0.07 },
    ]
    ctx.items.slice(0, 4).forEach((word, i) => {
      const box = cells[i]
      cRect(ctx, { x: box.x - 0.032, y: box.y + 0.026, w: 0.016, h: 0.016 }, ctx.theme.accent, 0.9)
      cText(ctx, box, word, {
        size: 24,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
    })
  },
  numbered: (ctx) => {
    tigangBand(ctx)
    cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    const list = takeNumbered(ctx)
    const step = Math.min(0.115, 0.46 / Math.max(1, list.length))
    list.forEach((t, n) => {
      const y = 0.24 + n * step
      // 大序号单独占一栏，正文在右边——这是提纲与其它五族最不一样的一处
      cText(ctx, { x: 0.09, y, w: 0.08, h: step - 0.015 }, String(n + 1), {
        size: 40,
        color: ctx.theme.accent,
        font: ctx.theme.fontTitle,
        lineHeight: 1.05,
      })
      cText(ctx, { x: 0.2, y: y + 0.01, w: 0.34, h: step - 0.015 }, t, {
        size: 22,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.6,
      })
      cLine(ctx, { x: 0.09, y: y + step - 0.012, w: 0.45, h: 0.001 }, ctx.theme.line)
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    tigangBand(ctx)
    cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    cText(ctx, { x: 0.09, y: 0.32, w: 0.2, h: 0.44 }, left.join('\n'), {
      size: 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.6,
    })
    cText(ctx, { x: 0.34, y: 0.32, w: 0.2, h: 0.44 }, right.join('\n'), {
      size: 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.6,
    })
    cLine(ctx, { x: 0.315, y: 0.3, w: 0.0012, h: 0.48 }, ctx.theme.line)
  },
  end: (ctx) => {
    tigangBand(ctx)
    cText(ctx, { x: 0.09, y: 0.42, w: 0.46, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 32,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.09, y: 0.6, w: 0.46, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    tigangBand(ctx)
    cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle })
    bodyBlock(ctx, besideArt(ctx, { x: 0.09, y: 0.34, w: 0.46, h: 0.44 }), 22, 1.7)
  },
}

/* ------------------------------ 栏线 lanxian ------------------------------ */

/**
 * 栏线：语汇是从 beautiful-html-templates 的 biennale-yellow / cobalt-grid 两张真图里抽的。
 * 三条硬规矩：
 *   ① 标题底下一条**贯穿整版**的横线——各族里只有它把线拉满（其余族的 tick 只有 0.07 宽）；
 *   ② 条目之间有线，不靠留白分家——所以一页装六条也不散；
 *   ③ 左侧一个 accent 大数字当锚点，色块只到 12%，压不动字。
 * 跟提纲的区别：提纲是「顶部色带 + 窄双栏」，栏线是「通栏横线 + 满宽条目 + 条目间线」。
 */
const lanxian: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'lanxian')
    // 色块插在「底」与「字」中间（像 Biennale 右上角那块日期底）：先调完共用几何再 splice
    const firstText = ctx.out.findIndex((p) => p.kind === 'text')
    const at = firstText < 0 ? ctx.out.length : firstText
    ctx.out.splice(at, 0, { kind: 'rect', x: 0.66, y: 0, w: 0.34, h: 0.3, fill: ctx.theme.accent, opacity: 0.1 })
    // 顶上一条通栏线：Biennale 那张「上沿被一条线切过」就是它
    cLine(ctx, { x: 0.04, y: 0.055, w: 0.92, h: 0.0015 }, ctx.theme.accent, 0.5)
    // 底下一条托住署名的线：封面的下沿不能是空白结尾
    cLine(ctx, { x: 0.04, y: 0.878, w: 0.92, h: 0.0012 }, ctx.theme.line)
  },
  quote: (ctx) => {
    // 原文页：上下两条线夹住句子，像从纸上裁下来的一条
    const q = `「${ctx.quote}」`
    cLine(ctx, { x: 0.1, y: 0.19, w: 0.8, h: 0.0015 }, ctx.theme.line)
    cText(ctx, { x: 0.1, y: 0.22, w: 0.8, h: 0.44 }, q, {
      size: quotePointSize(Array.from(q).length, 'lanxian'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      valign: 'middle',
      lineHeight: 1.95,
    })
    cLine(ctx, { x: 0.1, y: 0.68, w: 0.8, h: 0.0015 }, ctx.theme.line)
    cText(ctx, { x: 0.52, y: 0.7, w: 0.38, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'right',
      valign: 'middle',
    })
  },
  words: (ctx) => {
    lanxianHead(ctx)
    // 字词页恒 ≤4 词：两行两列，每格「序号 + 词」，格下一条线
    const list = ctx.items.slice(0, 4)
    const colW = 0.4
    const rowH = 0.22
    list.forEach((w, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = 0.075 + col * (colW + 0.05)
      const y = 0.29 + row * rowH
      cText(ctx, { x, y: y + 0.012, w: 0.06, h: 0.045 }, String(i + 1).padStart(2, '0'), {
        size: 12,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
        lineHeight: 1.2,
      })
      cText(ctx, { x: x + 0.06, y, w: colW - 0.06, h: 0.13 }, w, {
        size: 40,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        lineHeight: 1.35,
        valign: 'middle',
      })
      cLine(ctx, { x, y: y + 0.16, w: colW, h: 0.0012 }, ctx.theme.line)
    })
  },
  numbered: (ctx) => {
    lanxianHead(ctx)
    const list = takeNumbered(ctx)
    const step = Math.min(0.14, 0.46 / Math.max(1, list.length))
    // 条目少时字抬一档：三四个动作的页不该像一页没写完的稿
    const numSize = list.length <= 3 ? 40 : list.length <= 4 ? 34 : 28
    const bodySize = list.length <= 3 ? 26 : list.length <= 4 ? 23 : 20
    list.forEach((t, i) => {
      const y = 0.3 + i * step
      // 左栏大序号（衬线），右栏正文：条目之间一条线，六条也不撞
      cText(ctx, { x: 0.075, y, w: 0.08, h: step - 0.012 }, CN_NUM[i] ?? '·', {
        size: numSize,
        color: ctx.theme.accent,
        font: ctx.theme.fontTitle,
        lineHeight: 1.1,
        valign: 'middle',
      })
      cText(ctx, { x: 0.175, y, w: 0.65, h: step - 0.012 }, t, {
        size: bodySize,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.5,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.075, y: y + step - 0.008, w: 0.75, h: 0.0012 }, ctx.theme.line)
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    lanxianHead(ctx)
    // 两栏顶上各一道实心短条：比色块轻、比细线重，正好当栏目标签的替身
    cRect(ctx, { x: 0.075, y: 0.27, w: 0.38, h: 0.008 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0.545, y: 0.27, w: 0.38, h: 0.008 }, ctx.theme.accent, 0.22)
    // 两条就抬到 32：对照页本来两边条目就少，字再小就散成两行注脚
    const n = Math.max(left.length, right.length)
    const cmpSize = n <= 2 ? 32 : n <= 3 ? 28 : 24
    cText(ctx, { x: 0.075, y: 0.3, w: 0.38, h: 0.5 }, left.join('\n'), {
      size: cmpSize,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.8,
    })
    cText(ctx, { x: 0.545, y: 0.3, w: 0.38, h: 0.5 }, right.join('\n'), {
      size: cmpSize,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.8,
    })
    cLine(ctx, { x: 0.52, y: 0.27, w: 0.0012, h: 0.47 }, ctx.theme.line)
  },
  end: (ctx) => {
    cLine(ctx, { x: 0.3, y: 0.31, w: 0.4, h: 0.0018 }, ctx.theme.accent, 0.6)
    cText(ctx, { x: 0.2, y: 0.34, w: 0.6, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 40,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      align: 'center',
      valign: 'middle',
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.2, y: 0.53, w: 0.6, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'center',
    })
  },
  plain: (ctx) => {
    lanxianHead(ctx)
    // 只有一两短句：这一页就是一句重点句
    if (heroBody(ctx)) {
      bodyBlock(ctx, besideArt(ctx, { x: 0.075, y: 0.3, w: 0.76, h: 0.44 }), 24, 1.7)
      return
    }
    // 条目少：单栏满宽；条目多：两栏（有图时收成一栏），每条下面一条线——满篇文字也不散
    const list = ctx.items.slice(0, 10)
    const box = besideArt(ctx, { x: 0.075, y: 0.3, w: 0.76, h: 0.5 })
    const two = !ctx.art && list.length >= 4
    const colW = two ? 0.4 : box.w
    const perCol = two ? Math.ceil(list.length / 2) : list.length
    const step = Math.min(0.24, 0.5 / Math.max(1, perCol))
    // 条目越少字越大：两条就是两句重点句，不该挤在顶上
    const bodySize = list.length <= 2 ? 30 : list.length <= 4 ? 24 : list.length <= 6 ? 21 : 18
    list.forEach((t, i) => {
      const col = two ? Math.floor(i / perCol) : 0
      const x = box.x + col * (colW + 0.05)
      const y = box.y + (i % perCol) * step
      cText(ctx, { x, y, w: colW, h: step - 0.018 }, t, {
        size: bodySize,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.55,
      })
      cLine(ctx, { x, y: y + step - 0.014, w: colW, h: 0.001 }, ctx.theme.line)
    })
  },
}

/** 栏线的页眉：左侧大字标题 + 底下一条贯穿整版的横线（这一套模板的身份） */
function lanxianHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.lanxian, ctx.title, {
    size: n <= 14 ? 36 : n <= 22 ? 28 : 24,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: 'middle',
  })
  cLine(ctx, { x: 0.075, y: 0.225, w: 0.85, h: 0.0018 }, ctx.theme.accent, 0.5)
}

/* ------------------------------ 六栏 liu（Cobalt Grid） ------------------------------ */

/** 六栏的页眉：一行标题 + 底下一道满宽粗线（横线贯穿是这一族的身份） */
function liuHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.liu, ctx.title, {
    size: n <= 12 ? 30 : n <= 20 ? 25 : 21,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: 'middle',
  })
  cLine(ctx, { x: 0.08, y: 0.212, w: 0.84, h: 0.0035 }, ctx.theme.accent, 0.9)
}

const liu: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'liu')
    // 封面垫一条面纸横带（标题就压在带上）+ 带口一道粗线：Cobalt Grid 的格子感
    const firstText = ctx.out.findIndex((p) => p.kind === 'text')
    const at = firstText < 0 ? ctx.out.length : firstText
    ctx.out.splice(at, 0, { kind: 'rect', x: 0.04, y: 0.255, w: 0.92, h: 0.235, fill: ctx.theme.surface })
    cLine(ctx, { x: 0.04, y: 0.255, w: 0.92, h: 0.0035 }, ctx.theme.accent, 0.85)
    cLine(ctx, { x: 0.04, y: 0.878, w: 0.92, h: 0.0015 }, ctx.theme.accent, 0.75)
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 左边一道通高的 accent 竖线：像格子的左边界
    cRect(ctx, { x: 0.08, y: 0.22, w: 0.004, h: 0.44 }, ctx.theme.accent, 0.9)
    cText(ctx, { x: 0.13, y: 0.22, w: 0.76, h: 0.44 }, q, {
      size: quotePointSize(Array.from(q).length, 'liu'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.95,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.13, y: 0.7, w: 0.75, h: 0.0012 }, ctx.theme.line)
    cText(ctx, { x: 0.5, y: 0.72, w: 0.38, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'right',
      valign: 'middle',
    })
  },
  words: (ctx) => {
    liuHead(ctx)
    // 字词页恒 ≤4 词：一行一个，行者之间一道满宽横线（不摆成格子，格子是另一族的事）
    const list = ctx.items.slice(0, 4)
    const step = 0.135
    list.forEach((w, i) => {
      const y = 0.28 + i * step
      cText(ctx, { x: 0.08, y: y + 0.03, w: 0.05, h: 0.04 }, String(i + 1).padStart(2, '0'), {
        size: 13,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
      })
      cText(ctx, { x: 0.15, y, w: 0.6, h: 0.1 }, w, {
        size: 32,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.08, y: y + 0.105, w: 0.84, h: 0.0012 }, ctx.theme.line)
    })
  },
  numbered: (ctx) => {
    liuHead(ctx)
    const list = takeNumbered(ctx)
    const step = Math.min(0.115, 0.46 / Math.max(1, list.length))
    const size = list.length <= 3 ? 26 : list.length <= 4 ? 23 : 20
    list.forEach((t, i) => {
      const y = 0.27 + i * step
      // 小方块代替大序号：六栏的序号是格线上的刻度，不是标题
      cRect(ctx, { x: 0.08, y: y + step / 2 - 0.008, w: 0.016, h: 0.016 }, ctx.theme.accent, 0.9)
      cText(ctx, { x: 0.12, y, w: 0.72, h: step - 0.01 }, t, {
        size,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.5,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.08, y: y + step - 0.008, w: 0.84, h: 0.0012 }, ctx.theme.line)
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    liuHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 28 : n <= 3 ? 24 : 21
    // 两栏顶各一道刻度线（左实右虚）+ 中间一道竖分隔：整页像一张双栏表格
    cRect(ctx, { x: 0.08, y: 0.26, w: 0.36, h: 0.006 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0.56, y: 0.26, w: 0.36, h: 0.006 }, ctx.theme.accent, 0.22)
    cText(ctx, { x: 0.09, y: 0.33, w: 0.34, h: 0.46 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.57, y: 0.33, w: 0.34, h: 0.46 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cLine(ctx, { x: 0.52, y: 0.26, w: 0.0012, h: 0.5 }, ctx.theme.line)
  },
  end: (ctx) => {
    // 一条粗线开头、一条细线收尾：下课页也只有一个字，不许空得像没写完
    cLine(ctx, { x: 0.08, y: 0.3, w: 0.84, h: 0.0035 }, ctx.theme.accent, 0.9)
    cText(ctx, { x: 0.08, y: 0.38, w: 0.78, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 38,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      valign: 'middle',
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.08, y: 0.56, w: 0.6, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    cLine(ctx, { x: 0.08, y: 0.66, w: 0.84, h: 0.0012 }, ctx.theme.line)
  },
  plain: (ctx) => {
    liuHead(ctx)
    // 正文垫一张面纸卡（有画时卡也跟着收窄，不然图会压在卡上）。
    // 卡高与字号都按条数走：两条是两句重点句，八条是一张密表——一页里不许字撑出卡外
    const words = bodyOf(ctx).split('\n').filter(Boolean)
    const size = words.length <= 2 ? 30 : words.length <= 4 ? 24 : words.length <= 6 ? 20 : 17
    const h = Math.min(0.5, 0.12 + (words.length * size * 1.75) / 540)
    const box = besideArt(ctx, { x: 0.08, y: 0.3, w: 0.8, h })
    cRect(ctx, box, ctx.theme.surface)
    const hero = heroBody(ctx)
    cText(ctx, { x: box.x + 0.08, y: box.y + 0.02, w: box.w - 0.18, h: box.h - 0.04 }, bodyOf(ctx), {
      size: hero ? Math.round(size * 1.3) : size,
      color: ctx.theme.ink,
      font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
      bold: hero,
      lineHeight: 1.75,
      valign: 'middle',
    })
  },
}

/* ------------------------------ 长桌 chang（Long Table） ------------------------------ */

/** 长桌的一张卡片：面纸 + 左边一道 accent 边（叠几张就是这一族的样子） */
function slice(ctx: Ctx, box: Box): void {
  cRect(ctx, box, ctx.theme.surface)
  cRect(ctx, { x: box.x, y: box.y, w: 0.006, h: box.h }, ctx.theme.accent, 0.9)
}

/** 长桌的页眉：黑体标题 + 一道短杠（与栏线的长横线区分开） */
function changHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.chang, ctx.title, {
    size: n <= 12 ? 28 : n <= 20 ? 24 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: 'middle',
  })
  tick(ctx, HEAD.chang)
}

const chang: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'chang')
    // 下沿一道实心短条：像桌沿，也给署名前留一个落点（不是一块空的色块）
    cRect(ctx, { x: 0.06, y: 0.845, w: 0.88, h: 0.012 }, ctx.theme.accent)
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 整句压在一张大卡上：卡外一层纸，卡内一层纸
    slice(ctx, { x: 0.1, y: 0.2, w: 0.78, h: 0.5 })
    cText(ctx, { x: 0.14, y: 0.28, w: 0.7, h: 0.36 }, q, {
      size: quotePointSize(Array.from(q).length, 'chang'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
      valign: 'middle',
    })
    cText(ctx, { x: 0.14, y: 0.74, w: 0.5, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    changHead(ctx)
    // 四个词四张小卡：两行两列，卡与卡之间留一道纸缝
    const list = ctx.items.slice(0, 4)
    list.forEach((w, i) => {
      const box: Box = {
        x: 0.1 + (i % 2) * 0.43,
        y: 0.3 + Math.floor(i / 2) * 0.2,
        w: 0.37,
        h: 0.16,
      }
      slice(ctx, box)
      cText(ctx, { x: box.x + 0.04, y: box.y + 0.03, w: box.w - 0.08, h: box.h - 0.06 }, w, {
        size: 30,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
    })
  },
  numbered: (ctx) => {
    changHead(ctx)
    const list = takeNumbered(ctx)
    const gap = 0.018
    const h = Math.min(0.17, (0.5 - gap * (list.length - 1)) / Math.max(1, list.length))
    list.forEach((t, i) => {
      const y = 0.28 + i * (h + gap)
      slice(ctx, { x: 0.1, y, w: 0.8, h })
      cText(ctx, { x: 0.14, y: y + 0.02, w: 0.05, h: h - 0.04 }, CN_NUM[i] ?? '·', {
        size: 19,
        color: ctx.theme.accent,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
      cText(ctx, { x: 0.22, y: y + 0.02, w: 0.64, h: h - 0.04 }, t, {
        size: 21,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.5,
        valign: 'middle',
      })
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    changHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 27 : n <= 3 ? 23 : 20
    // 两张并排的卡：本族的「对照」是一左一右两块桌面，不是表格
    slice(ctx, { x: 0.08, y: 0.28, w: 0.4, h: 0.48 })
    slice(ctx, { x: 0.52, y: 0.28, w: 0.4, h: 0.48 })
    cText(ctx, { x: 0.12, y: 0.36, w: 0.34, h: 0.36 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.56, y: 0.36, w: 0.34, h: 0.36 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
  },
  end: (ctx) => {
    // 长桌的结尾：一句小字先报下节课的事，再用一张卡托住「下课」——两件东西上下各一层
    cText(ctx, { x: 0.24, y: 0.22, w: 0.5, h: 0.06 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    slice(ctx, { x: 0.18, y: 0.3, w: 0.6, h: 0.26 })
    cText(ctx, { x: 0.24, y: 0.36, w: 0.48, h: 0.15 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 34,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      valign: 'middle',
      lineHeight: 1.35,
    })
  },
  plain: (ctx) => {
    changHead(ctx)
    // 正文压在一张大卡上：条目再多也是「一件事一张纸」；卡高与字号按条数走，绝不让字撑出卡外
    const words = bodyOf(ctx).split('\n').filter(Boolean)
    const size = words.length <= 2 ? 29 : words.length <= 4 ? 23 : words.length <= 6 ? 20 : 17
    const h = Math.min(0.5, 0.12 + (words.length * size * 1.7) / 540)
    const box = besideArt(ctx, { x: 0.1, y: 0.3, w: 0.8, h })
    slice(ctx, box)
    const hero = heroBody(ctx)
    cText(ctx, { x: box.x + 0.1, y: box.y + 0.02, w: box.w - 0.22, h: box.h - 0.04 }, bodyOf(ctx), {
      size: hero ? Math.round(size * 1.3) : size,
      color: ctx.theme.ink,
      font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
      bold: hero,
      lineHeight: 1.7,
      valign: 'middle',
    })
  },
}

/* ------------------------------ 满篇 man（Monochrome） ------------------------------ */

/** 满篇的页眉：只有一行标题——无短线、无块面（字本身就够了） */
function manHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.man, ctx.title, {
    size: n <= 12 ? 28 : n <= 20 ? 24 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: 'middle',
  })
}

const man: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'man')
    // 上下各一根发丝线：这一族全屏无彩色，只靠字与线
    cLine(ctx, { x: 0.1, y: 0.055, w: 0.8, h: 0.0008 }, ctx.theme.accent, 0.6)
    cLine(ctx, { x: 0.1, y: 0.875, w: 0.8, h: 0.0008 }, ctx.theme.accent, 0.5)
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    cText(ctx, { x: 0.08, y: 0.18, w: 0.8, h: 0.5 }, q, {
      size: quotePointSize(Array.from(q).length, 'man'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 2,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.08, y: 0.7, w: 0.8, h: 0.0008 }, ctx.theme.accent, 0.6)
    cText(ctx, { x: 0.08, y: 0.72, w: 0.4, h: 0.06 }, ctx.note, {
      size: 13,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    manHead(ctx)
    // 四个词横着一排，词下挂一个小序号：像索引的一行（不是卡片）
    ctx.items.slice(0, 4).forEach((w, i) => {
      const x = 0.08 + i * 0.21
      cText(ctx, { x, y: 0.34, w: 0.2, h: 0.12 }, w, {
        size: 30,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
      cText(ctx, { x, y: 0.47, w: 0.2, h: 0.04 }, String(i + 1).padStart(2, '0'), {
        size: 12,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
      })
    })
  },
  numbered: (ctx) => {
    manHead(ctx)
    // 小号两位序号 + 密排行距：满篇不画线，靠行距分条
    const list = takeNumbered(ctx)
    const step = Math.min(0.105, 0.46 / Math.max(1, list.length))
    const size = list.length <= 3 ? 24 : list.length <= 4 ? 21 : 18
    list.forEach((t, i) => {
      const y = 0.26 + i * step
      cText(ctx, { x: 0.1, y, w: 0.05, h: step - 0.01 }, String(i + 1).padStart(2, '0'), {
        size: 12,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
        valign: 'middle',
      })
      cText(ctx, { x: 0.16, y, w: 0.74, h: step - 0.01 }, t, {
        size,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.6,
        valign: 'middle',
      })
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    manHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 26 : n <= 3 ? 22 : 19
    cText(ctx, { x: 0.15, y: 0.38, w: 0.34, h: 0.34 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.59, y: 0.38, w: 0.34, h: 0.34 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
  },
  end: (ctx) => {
    cText(ctx, { x: 0.14, y: 0.36, w: 0.74, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 40,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      valign: 'middle',
      lineHeight: 1.35,
    })
    cText(ctx, { x: 0.14, y: 0.56, w: 0.55, h: 0.07 }, ctx.note, {
      size: 18,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    manHead(ctx)
    // 标题下一根发丝线，再一大块密排正文：满篇不靠装饰，靠字撑页
    cLine(ctx, { x: 0.1, y: 0.34, w: 0.8, h: 0.0008 }, ctx.theme.accent, 0.55)
    const hero = heroBody(ctx)
    const rows = bodyOf(ctx).split('\n').filter(Boolean).length
    const size = rows <= 2 ? 28 : rows <= 4 ? 22 : rows <= 6 ? 19 : 17
    /* 行距随条数收：8 条时 1.85 会一路排到问句行上去（这一族没有卡片可收边） */
    const lh = rows <= 4 ? 1.85 : rows <= 6 ? 1.75 : 1.6
    const box = besideArt(ctx, { x: 0.12, y: 0.38, w: 0.74, h: 0.44 })
    cText(ctx, box, bodyOf(ctx), {
      size,
      color: ctx.theme.ink,
      font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
      lineHeight: lh,
      valign: hero ? 'middle' : 'top',
    })
  },
}

/* ------------------------------ 四卡 ka（Stencil） ------------------------------ */

/** 四卡的卡：面纸 + 顶上一道实心 accent（一块一件事，色块就是这份版面的骨） */
function kaCard(ctx: Ctx, box: Box): void {
  cRect(ctx, box, ctx.theme.surface)
  cRect(ctx, { x: box.x, y: box.y, w: box.w, h: 0.014 }, ctx.theme.accent, 0.92)
}

/** 四卡的页眉：黑体标题压得更低，底下一条粗短杠 */
function kaHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.ka, ctx.title, {
    size: n <= 12 ? 28 : n <= 20 ? 23 : 19,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.2,
    valign: 'middle',
  })
  cRect(ctx, { x: 0.08, y: 0.252, w: 0.12, h: 0.01 }, ctx.theme.accent)
}

const ka: Record<Arch, Layout> = {
  cover: (ctx) => {
    coverLayout(ctx, 'ka')
    // 标题直接压在一块实心色块上（字改成纸色）：Stencil 的那一块刀版
    // 色块只包住那一行字（上下各留一点），不是整块标题框——否则块比字高出一倍
    const i = ctx.out.findIndex((p) => p.kind === 'text')
    if (i >= 0) {
      const t = ctx.out[i]
      const pad = 0.022
      const h = Math.min(t.h, ((t.size ?? 62) / 540) * 1.15 + pad * 2)
      const x = Math.max(0, t.x - pad)
      const y = Math.max(0, t.y + (t.h - h) / 2)
      /* 块宽按实际字算（全角 1 字≈size/960 的纸宽），不按标题框——否则右边白出一大截 */
      const n = Math.max(1, Array.from(clean(ctx.title)).length)
      const tw = Math.min(t.w, (n * (t.size ?? 62)) / 960 + pad * 2)
      const w = Math.min(tw, 1 - x)
      ctx.out.splice(i, 0, { kind: 'rect', x, y, w, h: Math.min(h, 1 - y), fill: ctx.theme.accent })
      t.color = ctx.theme.paper
    }
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 整句压在一张卡上：卡的顶边就是那道实心笔划
    kaCard(ctx, { x: 0.08, y: 0.2, w: 0.82, h: 0.5 })
    cText(ctx, { x: 0.18, y: 0.26, w: 0.68, h: 0.38 }, q, {
      size: quotePointSize(Array.from(q).length, 'ka'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
      valign: 'middle',
    })
    cText(ctx, { x: 0.18, y: 0.64, w: 0.5, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    kaHead(ctx)
    // 四词横排，每词头上一方块 accent：像四块印章
    ctx.items.slice(0, 4).forEach((w, i) => {
      const x = 0.08 + i * 0.21
      cRect(ctx, { x, y: 0.3, w: 0.19, h: 0.024 }, ctx.theme.accent, 0.92)
      cText(ctx, { x, y: 0.36, w: 0.19, h: 0.12 }, w, {
        size: 26,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        bold: true,
        lineHeight: 1.3,
      })
    })
  },
  numbered: (ctx) => {
    kaHead(ctx)
    // 两列卡片：条目多就三排，一块一件事
    const list = takeNumbered(ctx)
    const rows = list.length <= 4 ? 2 : 3
    const h = rows === 2 ? 0.17 : 0.13
    const gap = 0.02
    list.forEach((t, i) => {
      const box: Box = {
        x: 0.08 + (i % 2) * 0.44,
        y: 0.3 + Math.floor(i / 2) * (h + gap),
        w: 0.4,
        h,
      }
      kaCard(ctx, box)
      cText(ctx, { x: box.x + 0.04, y: box.y + 0.03, w: box.w - 0.08, h: box.h - 0.05 }, t, {
        size: rows === 2 ? 22 : 19,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.45,
        valign: 'middle',
      })
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    kaHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 26 : n <= 3 ? 22 : 19
    kaCard(ctx, { x: 0.08, y: 0.28, w: 0.4, h: 0.46 })
    kaCard(ctx, { x: 0.52, y: 0.28, w: 0.4, h: 0.46 })
    cText(ctx, { x: 0.12, y: 0.42, w: 0.32, h: 0.28 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.56, y: 0.42, w: 0.32, h: 0.28 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
  },
  end: (ctx) => {
    // 一整块实心色，字反白：四卡的结尾是一块牌（比单行字高一点点，不是整页色带）
    cRect(ctx, { x: 0.16, y: 0.27, w: 0.68, h: 0.19 }, ctx.theme.accent)
    cText(ctx, { x: 0.2, y: 0.31, w: 0.6, h: 0.1 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 38,
      color: ctx.theme.paper,
      font: ctx.theme.fontTitle,
      bold: true,
      valign: 'middle',
      lineHeight: 1.3,
    })
    cText(ctx, { x: 0.2, y: 0.52, w: 0.55, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    kaHead(ctx)
    // 条目多就两栏密排（不画卡）；一两句重点句就一块大字
    const box = besideArt(ctx, { x: 0.08, y: 0.32, w: 0.84, h: 0.46 })
    const list = ctx.items
    if (list.length >= 4) {
      const [a, b] = splitEven(list)
      cText(ctx, { x: box.x, y: box.y, w: box.w / 2 - 0.03, h: box.h }, a.join('\n'), {
        size: 20,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.7,
      })
      cText(ctx, { x: box.x + box.w / 2 + 0.02, y: box.y, w: box.w / 2 - 0.03, h: box.h }, b.join('\n'), {
        size: 20,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.7,
      })
      return
    }
    const hero = heroBody(ctx)
    /* 单句重点：往里收两格（与问句同一条线），不跟素课 / 极简的那一页重合 */
    cText(ctx, { x: box.x + 0.08, y: 0.36, w: box.w - 0.08, h: 0.4 }, bodyOf(ctx), {
      size: hero ? 32 : 22,
      color: ctx.theme.ink,
      font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
      lineHeight: 1.8,
      valign: hero ? 'middle' : 'top',
    })
  },
}

/* ------------------------------ 双年展 shuangnian（Biennale Yellow） ------------------------------ */

/* 母版量出来的版面（biennale-yellow-1）：左竖黄块 x0–.25 / y.25–1、右上日期块 x.75–1 / y0–.375、
   底通栏浅黄带 y.625–.875——三块分开、字压在上面，才是 Biennale；平铺一整块黄只会变成色卡。 */
const BN_LEFT: Box = { x: 0, y: 0.25, w: 0.25, h: 0.75 }
const BN_BAND: Box = { x: 0, y: 0.625, w: 1, h: 0.25 }
const BN_DATE: Box = { x: 0.75, y: 0, w: 0.25, h: 0.375 }

/** 内页刊头（biennale-yellow-5）：左上衬线标题 + 题下通栏细线 + 右上大写宽字距小字 */
function bnHead(ctx: Ctx): void {
  /* 原文页 / 结束页的 title 只是取题用的标签（不上屏）——刊头也不许印，
     否则同一句话在一页上出现两遍（十九族实测就是这里露的） */
  if (!labelOnly(ctx)) {
    const n = Array.from(ctx.title).length
    cText(ctx, { x: 0.037, y: 0.055, w: 0.62, h: 0.085 }, ctx.title, {
      size: n <= 10 ? 28 : n <= 16 ? 23 : 19,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.15,
      valign: 'middle',
    })
  }
  cLine(ctx, { x: 0.037, y: 0.152, w: 0.926, h: 0.0018 }, ctx.theme.ink, 0.85)
  cText(ctx, { x: 0.70, y: 0.108, w: 0.263, h: 0.04 }, ctx.slide.meta ?? '', {
    size: 10,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: 'right',
  })
}

/** 这一页的 title 是不是「只用来取题的标签」（原文页 / 结束页）：
 *  这类页上屏的是课文原句 / 那一句话，title 不许当正文印出去。 */
function labelOnly(ctx: Ctx): boolean {
  return ctx.slide.kind === 'quote' || ctx.slide.kind === 'end'
}

/** 页脚四栏（封面）：母版把页脚切成四格，每格一条帽线 + 一行小字 */
function bnFoot(ctx: Ctx): void {
  const cols = [ctx.slide.meta ?? '', ctx.title, ctx.note || ctx.line, ctx.slide.byline ?? '']
  const xs = [0.037, 0.23, 0.41, 0.65]
  const ws = [0.17, 0.16, 0.22, 0.3]
  for (let k = 0; k < 4; k += 1) {
    cLine(ctx, { x: xs[k], y: 0.905, w: ws[k], h: 0.0018 }, ctx.theme.ink, 0.6)
    cText(ctx, { x: xs[k], y: 0.918, w: ws[k], h: 0.05 }, cols[k], {
      size: 9,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      lineHeight: 1.25,
    })
  }
}

/** 实心横条（母版的图表语言）：前 n-1 根墨实心，末根黄底墨框——那根黄条是这份稿子的记号 */
function bnBar(ctx: Ctx, box: Box, last: boolean): void {
  if (last) {
    cRect(ctx, { x: box.x - 0.002, y: box.y - 0.002, w: box.w + 0.004, h: box.h + 0.004 }, ctx.theme.ink, 0.9)
    cRect(ctx, box, ctx.theme.surface, 1)
  } else {
    cRect(ctx, box, ctx.theme.ink, 0.92)
  }
}

const shuangnian: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    cRect(ctx, BN_LEFT, ctx.theme.surface, art ? 0.92 : 1)
    cRect(ctx, BN_BAND, ctx.theme.surface, art ? 0.85 : 0.55)
    cRect(ctx, BN_DATE, ctx.theme.surface, art ? 0.92 : 0.7)
    const n = Array.from(ctx.title).length
    /* 标题第一个画（门禁取第一个 text 当封面字号）：88pt 衬线压左竖块、跨到纸上——母版就是这样跨出去的 */
    cText(ctx, { x: 0.037, y: 0.28, w: 0.6, h: 0.34 }, ctx.title, {
      size: coverPt(n, [108, 88, 64, 46]),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.06,
      valign: 'middle',
    })
    /* 右上日期块：母版那里写展期，这里放教材册次 */
    cText(ctx, { x: 0.77, y: 0.05, w: 0.2, h: 0.28 }, ctx.slide.meta ?? '', {
      size: 20,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      align: 'right',
      valign: 'middle',
      lineHeight: 1.3,
    })
    cText(ctx, { x: 0.037, y: 0.83, w: 0.5, h: 0.05 }, ctx.note || ctx.line, {
      size: 12,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.35,
    })
    bnFoot(ctx)
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    bnHead(ctx)
    cText(ctx, { x: 0.09, y: 0.24, w: 0.82, h: 0.42 }, q, {
      size: quotePointSize(Array.from(q).length, 'shuangnian'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.7,
      valign: 'middle',
    })
    cText(ctx, { x: 0.09, y: 0.72, w: 0.5, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    bnBar(ctx, { x: 0.09, y: 0.8, w: 0.4, h: 0.03 }, true)
  },
  words: (ctx) => {
    bnHead(ctx)
    /* 四个词就是四根横条：词在条外左侧（母版的标签位），条长递增，末根黄底墨框 */
    const last = Math.min(3, ctx.items.length - 1)
    ctx.items.slice(0, 4).forEach((w, i) => {
      const y = 0.26 + i * 0.13
      const bw = 0.3 + i * 0.09
      cText(ctx, { x: 0.037, y, w: 0.24, h: 0.05 }, w, {
        size: 28,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        bold: true,
        valign: 'middle',
      })
      bnBar(ctx, { x: 0.3, y: y + 0.008, w: bw, h: 0.034 }, i === last)
      cText(ctx, { x: 0.3 + bw + 0.015, y, w: 0.06, h: 0.05 }, String(i + 1).padStart(2, '0'), {
        size: 12,
        color: ctx.theme.muted,
        font: ctx.theme.fontBody,
        valign: 'middle',
      })
    })
  },
  numbered: (ctx) => {
    bnHead(ctx)
    /* 母版 biennale-yellow-5 的布局：左栏条目（编号 + 文字 + 细线），右半横条与条目行对齐 */
    const list = takeNumbered(ctx)
    const n = list.length
    const step = Math.min(0.095, 0.52 / Math.max(1, n))
    list.forEach((t, i) => {
      const y = 0.24 + i * step
      cText(ctx, { x: 0.037, y, w: 0.05, h: step - 0.012 }, String(i + 1).padStart(2, '0'), {
        size: 12,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
        valign: 'middle',
      })
      cText(ctx, { x: 0.095, y, w: 0.365, h: step - 0.012 }, t, {
        size: n <= 3 ? 22 : 18,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.4,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.037, y: y + step - 0.014, w: 0.423, h: 0.0012 }, ctx.theme.line)
      const bw = 0.15 + i * 0.04
      bnBar(ctx, { x: 0.52, y: y + (step - 0.03) / 2, w: bw, h: 0.03 }, i === n - 1)
      cText(ctx, { x: 0.52 + bw + 0.012, y, w: 0.05, h: step - 0.012 }, String(i + 1).padStart(2, '0'), {
        size: 11,
        color: ctx.theme.muted,
        font: ctx.theme.fontBody,
        valign: 'middle',
      })
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    const n = Array.from(ctx.title).length
    /* 对比页刊头不画右上小字：texts[1]/[2] 必须是左右两栏（门禁第 3 条） */
    cText(ctx, { x: 0.037, y: 0.055, w: 0.62, h: 0.085 }, ctx.title, {
      size: n <= 10 ? 28 : n <= 16 ? 23 : 19,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.15,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.037, y: 0.152, w: 0.926, h: 0.0018 }, ctx.theme.ink, 0.85)
    const m = Math.max(left.length, right.length)
    const size = m <= 2 ? 26 : m <= 3 ? 22 : 19
    /* 两栏各一根栏标横条：左墨右黄，还是那根黄条的记号 */
    cRect(ctx, { x: 0.037, y: 0.22, w: 0.18, h: 0.012 }, ctx.theme.ink, 0.9)
    cRect(ctx, { x: 0.52, y: 0.22, w: 0.18, h: 0.012 }, ctx.theme.surface, 1)
    cText(ctx, { x: 0.037, y: 0.28, w: 0.42, h: 0.44 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.85,
    })
    cText(ctx, { x: 0.52, y: 0.28, w: 0.42, h: 0.44 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.85,
    })
    cLine(ctx, { x: 0.4975, y: 0.26, w: 0.0015, h: 0.48 }, ctx.theme.line)
  },
  end: (ctx) => {
    /* 底通栏黄带回放封面：大字衬线压带，首尾呼应 */
    cRect(ctx, { x: 0, y: 0.55, w: 1, h: 0.3 }, ctx.theme.surface, 0.92)
    bnHead(ctx)
    cText(ctx, { x: 0.09, y: 0.58, w: 0.82, h: 0.22 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 44,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      valign: 'middle',
      lineHeight: 1.2,
    })
    cText(ctx, { x: 0.09, y: 0.82, w: 0.6, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    bnHead(ctx)
    bodyBlock(ctx, besideArt(ctx, { x: 0.037, y: 0.24, w: 0.88, h: 0.46 }), 22, 1.8)
    cRect(ctx, { x: 0.037, y: 0.74, w: 0.25, h: 0.03 }, ctx.theme.surface, 0.9)
  },
}

/* ------------------------------ 钴蓝格 gulan（Cobalt Grid） ------------------------------ */

/** 页眉（cobalt-grid-3）：顶上一道通栏粗蓝线 + 超大衬线标题 + 右上大写小字压在第二条细线上 */
function gulanHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 0.004 }, ctx.theme.accent, 0.9)
  /* 与 bnHead 同一条规矩：标签页的 title 不上屏 */
  if (!labelOnly(ctx)) {
    cText(ctx, { x: 0.035, y: 0.06, w: 0.7, h: 0.12 }, ctx.title, {
      size: n <= 10 ? 34 : n <= 16 ? 27 : 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.15,
      valign: 'middle',
    })
  }
  cText(ctx, { x: 0.6, y: 0.155, w: 0.365, h: 0.04 }, ctx.slide.meta ?? '', {
    size: 10,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: 'right',
  })
  cLine(ctx, { x: 0.035, y: 0.19, w: 0.93, h: 0.0018 }, ctx.theme.accent, 0.6)
}

/** 页脚：底上一道通栏粗蓝线（母版每一页都有顶底两条粗线） */
function gulanFoot(ctx: Ctx): void {
  cLine(ctx, { x: 0.035, y: 0.955, w: 0.93, h: 0.004 }, ctx.theme.accent, 0.9)
}

const gulan: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    const n = Array.from(ctx.title).length
    cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 0.004 }, ctx.theme.accent, 0.9)
    /* 标题第一个画：80pt 超大衬线（母版封面就是内容页刊头放大） */
    cText(ctx, { x: 0.035, y: 0.1, w: 0.8, h: 0.24 }, ctx.title, {
      size: coverPt(n, [96, 80, 60, 44]),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.1,
      valign: 'middle',
    })
    cText(ctx, { x: 0.6, y: 0.36, w: 0.365, h: 0.04 }, ctx.slide.meta ?? '', {
      size: 11,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      align: 'right',
    })
    cLine(ctx, { x: 0.035, y: 0.4, w: 0.93, h: 0.0018 }, ctx.theme.accent, 0.6)
    cText(ctx, { x: 0.035, y: 0.46, w: 0.6, h: 0.06 }, ctx.note || ctx.line, {
      size: 16,
      color: ctx.theme.accent,
      font: ctx.theme.fontBody,
      lineHeight: 1.4,
    })
    /* 下半张 2×3 格上细线阵：格子是这份母版的身份证，封面先摆出来 */
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 2; c += 1) {
        cLine(ctx, { x: 0.035 + c * 0.48, y: 0.55 + r * 0.17, w: 0.45, h: 0.0012 }, ctx.theme.accent, 0.25)
      }
    }
    gulanFoot(ctx)
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    gulanHead(ctx)
    cText(ctx, { x: 0.035, y: 0.24, w: 0.8, h: 0.46 }, q, {
      size: quotePointSize(Array.from(q).length, 'gulan'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.75,
      valign: 'middle',
    })
    cText(ctx, { x: 0.035, y: 0.76, w: 0.6, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    gulanFoot(ctx)
  },
  words: (ctx) => {
    gulanHead(ctx)
    /* 四个词 = 2×2 格子：格上细线 + 等宽编号 + 衬线大词（母版的格子语言） */
    ctx.items.slice(0, 4).forEach((w, i) => {
      const x = i % 2 === 0 ? 0.035 : 0.515
      const y = 0.26 + Math.floor(i / 2) * 0.26
      cLine(ctx, { x, y, w: 0.45, h: 0.0015 }, ctx.theme.accent, 0.4)
      cText(ctx, { x, y: y + 0.015, w: 0.05, h: 0.04 }, `${String(i + 1).padStart(2, '0')}.`, {
        size: 11,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
      })
      cText(ctx, { x: x + 0.055, y: y + 0.01, w: 0.38, h: 0.12 }, w, {
        size: tilePt(w, 32, 0.12),
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        bold: true,
        valign: 'middle',
      })
    })
    gulanFoot(ctx)
  },
  numbered: (ctx) => {
    gulanHead(ctx)
    /* 母版原图就是 2×3 格子：编号 + 条目 + 格上细线。条数不足按实际分两栏 */
    const list = takeNumbered(ctx)
    const rows = Math.max(1, Math.ceil(list.length / 2))
    /* 行高铺满正文区（不再封顶 .22）：母版的六宫格是均分整页的，三条就两行铺满，
       封顶会让下半页空着一块（对照样张实测露的） */
    const step = 0.6 / rows
    list.forEach((t, i) => {
      const x = i % 2 === 0 ? 0.035 : 0.515
      const y = 0.24 + Math.floor(i / 2) * step
      cLine(ctx, { x, y, w: 0.45, h: 0.0015 }, ctx.theme.accent, 0.4)
      cText(ctx, { x, y: y + 0.012, w: 0.05, h: 0.04 }, `${String(i + 1).padStart(2, '0')}.`, {
        size: 11,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
      })
      cText(ctx, { x: x + 0.055, y: y + 0.008, w: 0.385, h: step - 0.03 }, t, {
        size: tilePt(t, list.length <= 3 ? 22 : 18, step - 0.03),
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.4,
        valign: 'middle',
      })
    })
    gulanFoot(ctx)
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    const n = Array.from(ctx.title).length
    /* 刊头不画右上小字：texts[1]/[2] 必须是左右两栏（门禁第 3 条） */
    cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 0.004 }, ctx.theme.accent, 0.9)
    cText(ctx, { x: 0.035, y: 0.06, w: 0.7, h: 0.12 }, ctx.title, {
      size: n <= 10 ? 34 : n <= 16 ? 27 : 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.15,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.035, y: 0.19, w: 0.93, h: 0.0018 }, ctx.theme.accent, 0.6)
    const m = Math.max(left.length, right.length)
    const size = m <= 2 ? 26 : m <= 3 ? 22 : 19
    cLine(ctx, { x: 0.035, y: 0.245, w: 0.43, h: 0.0038 }, ctx.theme.accent, 0.9)
    cLine(ctx, { x: 0.515, y: 0.245, w: 0.43, h: 0.0038 }, ctx.theme.accent, 0.35)
    cText(ctx, { x: 0.035, y: 0.3, w: 0.43, h: 0.44 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.85,
    })
    cText(ctx, { x: 0.515, y: 0.3, w: 0.43, h: 0.44 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.85,
    })
    cLine(ctx, { x: 0.4975, y: 0.26, w: 0.0015, h: 0.48 }, ctx.theme.accent, 0.3)
    gulanFoot(ctx)
  },
  end: (ctx) => {
    cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 0.004 }, ctx.theme.accent, 0.9)
    cText(ctx, { x: 0.035, y: 0.06, w: 0.7, h: 0.09 }, ctx.title, {
      size: 26,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      valign: 'middle',
    })
    cText(ctx, { x: 0.035, y: 0.32, w: 0.85, h: 0.22 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 46,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      valign: 'middle',
      lineHeight: 1.25,
    })
    cText(ctx, { x: 0.035, y: 0.6, w: 0.6, h: 0.06 }, ctx.note, {
      size: 15,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    gulanFoot(ctx)
  },
  plain: (ctx) => {
    gulanHead(ctx)
    bodyBlock(ctx, besideArt(ctx, { x: 0.035, y: 0.24, w: 0.88, h: 0.5 }), 24, 1.8)
    cLine(ctx, { x: 0.035, y: 0.78, w: 0.45, h: 0.0015 }, ctx.theme.accent, 0.3)
    gulanFoot(ctx)
  },
}

/* ------------------------------ 商务蓝 shangwu（Blue Professional） ------------------------------ */

/** 右侧整条 panel：有画时被画盖住，有引文时是引文块的底。
 *  两样都没有就不画（2026-11-23 用户拍板「没有图画就不要那个大方块」）——
 *  一条 24% 宽、通顶通底的空浅色带，正是用户指着骂的那种空占位。 */
function shangwuPanel(ctx: Ctx): void {
  if (!rightBusy(ctx)) return
  cRect(ctx, { x: 0.76, y: 0, w: 0.24, h: 1 }, ctx.theme.surface, 0.9)
  cLine(ctx, { x: 0.76, y: 0, w: 0.0018, h: 1 }, ctx.theme.accent, 0.4)
}

/** 页眉：标题左边一道竖蓝杠（母版的章节标记），标题比原来大一档 */
function shangwuHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cRect(ctx, { x: 0.062, y: 0.12, w: 0.009, h: 0.1 }, ctx.theme.accent, 0.95)
  cText(ctx, { x: 0.098, y: 0.115, w: 0.6, h: 0.11 }, ctx.title, {
    size: n <= 12 ? 30 : n <= 20 ? 25 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.2,
    valign: 'middle',
  })
}

const shangwu: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    /* 右下那片斜切：母版封面的身份证。上沿 x .60 起、下沿 x .74，铺到纸边 */
    slantBand(ctx, 0, 1, 0.6, 0.74, ctx.theme.surface, art ? 0.82 : 0.92)
    const n = Array.from(ctx.title).length
    /* 左上一道短蓝杠：母版把「章节」这件事用一道杠标出来 */
    cRect(ctx, { x: 0.075, y: 0.335, w: 0.05, h: 0.007 }, ctx.theme.accent, 0.95)
    cText(ctx, { x: 0.075, y: 0.37, w: 0.42, h: 0.2 }, ctx.title, {
      size: coverPt(n, [66, 52, 37, 30]),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.16,
      valign: 'middle',
    })
    /* 落款紧跟标题底边（母版的副题就贴在标题下）：原来 .585 与标题字之间空出一大段。
       x 仍留在右侧竖列（.30），与老十一族的左下落款拉开 */
    cText(ctx, { x: 0.3, y: 0.53, w: 0.26, h: 0.1 }, ctx.note || ctx.line, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      lineHeight: 1.45,
    })
    cText(ctx, { x: 0.075, y: 0.645, w: 0.4, h: 0.05 }, ctx.slide.meta ?? '', {
      size: 10,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    /* 右下三个小圆点：母版那排装饰点 */
    for (let k = 0; k < 3; k += 1) {
      cEllipse(ctx, { x: 0.845 + k * 0.019, y: 0.86, w: 0.01, h: 0.018 }, ctx.theme.accent, 0.75)
    }
    cEllipse(ctx, { x: 0.918, y: 0.852, w: 0.03, h: 0.053 }, ctx.theme.accent, 0.12)
  },
  quote: (ctx) => {
    shangwuPanel(ctx)
    const q = `「${ctx.quote}」`
    /* 原文页永不压侧图：panel 不画，句子放宽到整页 */
    cText(ctx, { x: 0.075, y: 0.2, w: 0.85, h: 0.46 }, q, {
      size: quotePointSize(Array.from(q).length, 'shangwu'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.8,
      valign: 'middle',
    })
    cText(ctx, { x: 0.075, y: 0.72, w: 0.7, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    shangwuPanel(ctx)
    shangwuHead(ctx)
    ctx.items.slice(0, 4).forEach((w, i) => {
      const y = 0.3 + i * 0.14
      cText(ctx, { x: 0.1, y, w: 0.56, h: 0.1 }, w, {
        size: 32,
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        bold: true,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.1, y: y + 0.115, w: 0.56, h: 0.001 }, ctx.theme.line)
    })
  },
  numbered: (ctx) => {
    shangwuPanel(ctx)
    shangwuHead(ctx)
    const list = takeNumbered(ctx)
    const step = Math.min(0.1, 0.46 / Math.max(1, list.length))
    list.forEach((t, i) => {
      const y = 0.28 + i * step
      cText(ctx, { x: 0.075, y, w: 0.06, h: step - 0.012 }, String(i + 1).padStart(2, '0'), {
        size: 12,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
        valign: 'middle',
      })
      cText(ctx, { x: 0.15, y, w: 0.56, h: step - 0.012 }, t, {
        size: list.length <= 3 ? 24 : 20,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.45,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.075, y: y + step - 0.018, w: 0.63, h: 0.001 }, ctx.theme.line, 0.9)
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    shangwuPanel(ctx)
    shangwuHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 25 : n <= 3 ? 21 : 18
    cRect(ctx, { x: 0.075, y: 0.26, w: 0.32, h: 0.008 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0.43, y: 0.26, w: 0.32, h: 0.008 }, ctx.theme.accent, 0.3)
    cText(ctx, { x: 0.075, y: 0.32, w: 0.32, h: 0.42 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.43, y: 0.32, w: 0.32, h: 0.42 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
  },
  end: (ctx) => {
    shangwuPanel(ctx)
    cText(ctx, { x: 0.28, y: 0.3, w: 0.46, h: 0.16 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 38,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      valign: 'middle',
      lineHeight: 1.3,
    })
    cText(ctx, { x: 0.28, y: 0.54, w: 0.42, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    shangwuPanel(ctx)
    shangwuHead(ctx)
    bodyBlock(ctx, besideArt(ctx, { x: 0.075, y: 0.27, w: 0.64, h: 0.5 }), 23, 1.8)
  },
}

/* ------------------------------ 三色刊 sanse（Editorial Tri-Tone） ------------------------------ */

/** 页眉：一道栗红竖条 + 黑体标题 + 底下一小段鹅黄实条。
 *  母版的三色就是「粉纸 / 鹅黄块 / 栗红块」，页眉先把这三样摆在同一行上。 */
function sanseHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cRect(ctx, { x: 0.042, y: 0.055, w: 0.014, h: 0.145 }, ctx.theme.accent, 1)
  cText(ctx, HEAD.sanse, ctx.title, {
    size: n <= 10 ? 30 : n <= 18 ? 24 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.2,
    valign: 'middle',
  })
  cRect(ctx, { x: 0.078, y: 0.212, w: 0.14, h: 0.013 }, ctx.theme.surface, 1)
}

/** 卡里字少就把字放大：母版的卡是「编号 + 标题 + 一段说明」三层，我们的条目有时只有一
 *  个字（字词页），小字顶在卡左上角会让整张卡变成一块纯色死块（TASKS/17 不许）。
 *  字少就当字卡排：放大、居中，卡面被字撑住才像样张上的图版。
 *  maxH 是卡内文字框的高（页高占比），放大后的行高不许超出它。 */
function tilePt(text: string, base: number, maxH = 1): number {
  const n = Array.from(text).length
  const want = n <= 2 ? base * 2.2 : n <= 4 ? base * 1.7 : n <= 8 ? base * 1.3 : base
  const cap = Math.floor((maxH * 720) / 1.5)
  return Math.max(base, Math.min(Math.round(want), cap))
}

/** 一块卡：鹅黄实底写栗红字，栗红实底写鹅黄字——两色交替就是这个母版的节奏。
 *  左上角压一枚「/01」，卡片才像样张上的图版；编号颜色取对底色，保证在两种底上都读得出来。 */
function sanseTile(ctx: Ctx, box: Box, text: string, index: number, size: number): void {
  const filled = index % 2 === 0
  cRect(ctx, box, filled ? ctx.theme.surface : ctx.theme.accent, 1)
  cText(ctx, { x: box.x + 0.022, y: box.y + 0.014, w: 0.1, h: 0.036 }, `/${String(index + 1).padStart(2, '0')}`, {
    size: 11,
    color: filled ? ctx.theme.accent : ctx.theme.surface,
    font: ctx.theme.fontBody,
    bold: true,
  })
  const inner: Box = { x: box.x + 0.022, y: box.y + 0.052, w: box.w - 0.044, h: box.h - 0.07 }
  const short = Array.from(text).length <= 4
  cText(ctx, inner, text, {
    size: tilePt(text, size, inner.h),
    color: filled ? ctx.theme.ink : ctx.theme.surface,
    font: ctx.theme.fontBody,
    lineHeight: 1.45,
    align: short ? 'center' : 'left',
    valign: short ? 'middle' : 'top',
  })
}

/** 卡片栅格：2–3 条并排、4–6 条三列、7 条以上四列。
 *  列宽与行高都按**实际条数**均分（不留空卡、不留空行）——AI 给 4 条就铺满 4 张，给 6 条就是 3×2，
 *  换到哪一族都不会出现「一页排了一半」的残局（TASKS/23 的换模板保文字）。 */
function sanseGrid(ctx: Ctx, list: string[], top: number, bottom: number, size: number): void {
  const n = list.length
  if (!n) return
  const cols = n <= 3 ? n : n <= 6 ? 3 : 4
  const rows = Math.ceil(n / cols)
  const gap = 0.014
  const left = 0.042
  const total = 0.916
  const cw = (total - gap * (cols - 1)) / cols
  const ch = (bottom - top - gap * (rows - 1)) / rows
  list.forEach((t, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const box: Box = { x: left + col * (cw + gap), y: top + row * (ch + gap), w: cw, h: ch }
    sanseTile(ctx, box, t, i, ch < 0.24 ? Math.min(size, 20) : size)
  })
}

const sanse: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    const n = Array.from(ctx.title).length
    // 顶部五小块栗红 / 鹅黄交替：一眼就是这份母版的三色样本条
    for (let k = 0; k < 5; k += 1) {
      cRect(
        ctx,
        { x: 0.042 + k * 0.08, y: 0.07, w: 0.068, h: 0.03 },
        k % 2 === 0 ? ctx.theme.accent : ctx.theme.surface,
        1,
      )
    }
    cText(ctx, { x: 0.716, y: 0.068, w: 0.24, h: 0.04 }, ctx.slide.meta ?? '', {
      size: 13,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      align: 'right',
    })
    // 标题压在整块鹅黄上（占页高 36%），三色里最重的那一块留给课题
    cRect(ctx, { x: 0, y: 0.46, w: 0.94, h: 0.36 }, ctx.theme.surface, art ? 0.94 : 1)
    cText(ctx, { x: 0.055, y: 0.47, w: 0.83, h: 0.34 }, ctx.title, {
      size: coverPt(n, [84, 68, 50, 38]),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.16,
      valign: 'middle',
    })
    cText(ctx, { x: 0.34, y: 0.845, w: 0.3, h: 0.05 }, ctx.note || ctx.line, {
      size: 15,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
    })
    // 右上三枚栗红小方：母版封面右下那排印记
    for (let k = 0; k < 3; k += 1) {
      cRect(ctx, { x: 0.845 + k * 0.038, y: 0.16, w: 0.026, h: 0.026 }, ctx.theme.accent, 1)
    }
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 整页鹅黄版 + 左侧栗红书脊：原文页在这个母版里就是一张插页
    cRect(ctx, { x: 0.042, y: 0.1, w: 0.916, h: 0.76 }, ctx.theme.surface, 1)
    cRect(ctx, { x: 0.042, y: 0.1, w: 0.016, h: 0.76 }, ctx.theme.accent, 1)
    cText(ctx, { x: 0.09, y: 0.18, w: 0.82, h: 0.56 }, q, {
      size: quotePointSize(Array.from(q).length, 'sanse'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
      valign: 'middle',
    })
    cText(ctx, { x: 0.09, y: 0.775, w: 0.6, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.accent,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    sanseHead(ctx)
    sanseGrid(ctx, ctx.items.slice(0, 4), 0.28, 0.78, 30)
  },
  numbered: (ctx) => {
    sanseHead(ctx)
    sanseGrid(ctx, takeNumbered(ctx), 0.28, 0.8, 20)
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    sanseHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 25 : n <= 3 ? 21 : 18
    // 左鹅黄右栗红：两栏各是一大块实色，不是两条线（母版靠块面分栏）
    cRect(ctx, { x: 0.042, y: 0.27, w: 0.44, h: 0.53 }, ctx.theme.surface, 1)
    cRect(ctx, { x: 0.518, y: 0.27, w: 0.44, h: 0.53 }, ctx.theme.accent, 1)
    cText(ctx, { x: 0.075, y: 0.33, w: 0.37, h: 0.41 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.8,
    })
    cText(ctx, { x: 0.551, y: 0.33, w: 0.37, h: 0.41 }, right.join('\n'), {
      size,
      color: ctx.theme.surface,
      font: ctx.theme.fontBody,
      lineHeight: 1.8,
    })
  },
  end: (ctx) => {
    // 左栗红右鹅黄两块拼满上半页，底下留一条粉纸给页名与页脚线（三色在一页里全出现）
    cRect(ctx, { x: 0, y: 0, w: 0.5, h: 0.86 }, ctx.theme.accent, 1)
    cRect(ctx, { x: 0.5, y: 0, w: 0.5, h: 0.86 }, ctx.theme.surface, 1)
    cText(ctx, { x: 0.06, y: 0.18, w: 0.38, h: 0.5 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 38,
      color: ctx.theme.surface,
      font: ctx.theme.fontTitle,
      bold: true,
      valign: 'middle',
      lineHeight: 1.3,
    })
    cText(ctx, { x: 0.56, y: 0.24, w: 0.38, h: 0.38 }, ctx.note, {
      size: 18,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.7,
      valign: 'middle',
    })
  },
  plain: (ctx) => {
    sanseHead(ctx)
    // 正文落在鹅黄大卡上；有画时卡收窄到画的左边（besideArt），字不会压图
    const card = besideArt(ctx, { x: 0.042, y: 0.27, w: 0.916, h: 0.53 })
    cRect(ctx, card, ctx.theme.surface, 1)
    bodyBlock(ctx, { x: card.x + 0.04, y: card.y + 0.035, w: card.w - 0.08, h: card.h - 0.07 }, 22, 1.7)
  },
}


/* ------------------------------ 林地 lindi（Grove） ------------------------------ */

/**
 * 右半张的实心图版：母版的图不是「虚框留白」，是一块压满的灰绿版（占纸面近三成）。
 * 有画时 place() 把画压在这块上（ART_BOX.lindi 与它同坐标）；有引文时它是引文块的底。
 * 两样都没有就不画（2026-11-23 用户拍板），正文放宽到整页——绝不退回白空框，也不留空色块。
 */
const LINDI_PLATE: Box = { x: 0.53, y: 0.13, w: 0.4, h: 0.68 }

/** 页眉：衬线大标题只占左半，底下一条红发丝线（右半留给图版）。
 *  右半没东西时标题放宽到整页——没有图版就不必给它让位。 */
function lindiHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  const head = rightBusy(ctx) ? HEAD.lindi : { ...HEAD.lindi, w: 0.83 }
  cText(ctx, head, ctx.title, {
    size: n <= 10 ? 34 : n <= 16 ? 27 : 22,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.18,
    valign: 'middle',
  })
  cLine(ctx, { x: 0.1, y: 0.292, w: 0.3, h: 0.002 }, ctx.theme.accent, 0.85)
}

/** 图版：一块灰绿实底 + 右下角一行 9pt 图注（母版那行小字是版面的一半）。
 *  2026-11-23 用户拍板：没图也没引文时这块 27% 的大色块不画——
 *  它不是「版面的一部分」，是一块空占位；正文那时已放宽到整页。 */
function lindiPlate(ctx: Ctx): void {
  if (!rightBusy(ctx)) return
  cRect(ctx, LINDI_PLATE, ctx.theme.muted, 0.22)
  cText(ctx, { x: 0.53, y: 0.822, w: 0.4, h: 0.028 }, ctx.slide.meta ?? '', {
    size: 9,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: 'right',
  })
}

const lindi: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    // 整页墨绿底片：母版封面不是白纸，是把整张压深的照片（没画时就是一块纯墨绿）
    cRect(ctx, { x: 0, y: 0, w: 1, h: 1 }, ctx.theme.ink, art ? 0.7 : 1)
    const n = Array.from(ctx.title).length
    cText(ctx, { x: 0.075, y: 0.075, w: 0.5, h: 0.04 }, ctx.slide.meta ?? '', {
      size: 12,
      color: ctx.theme.paper,
      font: ctx.theme.fontBody,
    })
    cText(ctx, { x: 0.075, y: 0.36, w: 0.74, h: 0.34 }, ctx.title, {
      size: coverPt(n, [72, 60, 46, 36]),
      color: ctx.theme.paper,
      font: ctx.theme.fontTitle,
      lineHeight: 1.2,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.078, y: 0.732, w: 0.14, h: 0.0025 }, ctx.theme.accent, 1)
    cText(ctx, { x: 0.38, y: 0.755, w: 0.3, h: 0.05 }, ctx.note || ctx.line, {
      size: 15,
      color: ctx.theme.paper,
      font: ctx.theme.fontBody,
    })
    // 右下那枚大号期号：母版用超大字号压住下半张
    cText(ctx, { x: 0.6, y: 0.79, w: 0.34, h: 0.13 }, '01', {
      size: 64,
      color: ctx.theme.accent,
      font: ctx.theme.fontTitle,
      align: 'right',
      valign: 'middle',
      lineHeight: 1,
    })
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    /* 原文页永不压侧图（place() 的 cover/quote 豁免）：句子放宽到整页，不再缩在左半。
       y 落在 .24：与单色（danse）的宽框原文页（.2 起）错开一档，族与族仍一眼可辨 */
    cText(ctx, { x: 0.1, y: 0.24, w: 0.8, h: 0.44 }, q, {
      size: quotePointSize(Array.from(q).length, 'lindi'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 2,
      valign: 'middle',
    })
    cText(ctx, { x: 0.1, y: 0.7, w: 0.76, h: 0.06 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    lindiPlate(ctx)
  },
  words: (ctx) => {
    lindiHead(ctx)
    /* 字词页在 ART_SKIP 里（满幅条目不压图）：行宽放到整页 */
    ctx.items.slice(0, 4).forEach((w, i) => {
      const y = 0.34 + i * 0.115
      cText(ctx, { x: 0.1, y, w: 0.8, h: 0.1 }, w, {
        size: n0(32, 26, w),
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.1, y: y + 0.105, w: 0.74, h: 0.0012 }, ctx.theme.line)
    })
    lindiPlate(ctx)
  },
  numbered: (ctx) => {
    lindiHead(ctx)
    const list = takeNumbered(ctx)
    const step = Math.min(0.085, 0.44 / Math.max(1, list.length))
    const tw = rightBusy(ctx) ? 0.32 : 0.72
    list.forEach((t, i) => {
      const y = 0.34 + i * step
      cText(ctx, { x: 0.1, y, w: 0.06, h: step - 0.01 }, String(i + 1).padStart(2, '0'), {
        size: 11,
        color: ctx.theme.accent,
        font: ctx.theme.fontBody,
        valign: 'middle',
      })
      cText(ctx, { x: 0.165, y, w: tw, h: step - 0.01 }, t, {
        size: list.length <= 3 ? 22 : list.length <= 4 ? 20 : 17,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.45,
        valign: 'middle',
      })
    })
    lindiPlate(ctx)
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    lindiHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 26 : n <= 3 ? 22 : 19
    // 对比页把图版让出来：左栏落在浅色块上，右栏直接上纸，中间一条红发丝线
    cRect(ctx, { x: 0.1, y: 0.33, w: 0.38, h: 0.44 }, ctx.theme.surface, 0.55)
    cText(ctx, { x: 0.13, y: 0.37, w: 0.32, h: 0.36 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.85,
    })
    cText(ctx, { x: 0.56, y: 0.37, w: 0.34, h: 0.36 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.85,
    })
    cLine(ctx, { x: 0.53, y: 0.3, w: 0.0015, h: 0.5 }, ctx.theme.accent, 0.7)
  },
  end: (ctx) => {
    // 下半页一条墨绿底片，与封面首尾呼应；那一句反白字压在上半页
    cRect(ctx, { x: 0, y: 0.62, w: 1, h: 0.38 }, ctx.theme.ink, 1)
    cText(ctx, { x: 0.1, y: 0.2, w: 0.72, h: 0.3 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 40,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.3,
      valign: 'middle',
    })
    cText(ctx, { x: 0.1, y: 0.7, w: 0.6, h: 0.08 }, ctx.note, {
      size: 16,
      color: ctx.theme.paper,
      font: ctx.theme.fontBody,
      valign: 'middle',
    })
  },
  plain: (ctx) => {
    lindiHead(ctx)
    bodyBlock(ctx, { x: 0.1, y: 0.33, w: rightBusy(ctx) ? 0.38 : 0.8, h: 0.44 }, 22, 1.75)
    lindiPlate(ctx)
  },
}

/* ------------------------------ 长桌宴 changyan（Long Table） ------------------------------ */

/** 一张卡：四面细框，靠线立住，不靠底色（母版的长桌卡就是空卡 + 一道重上框）。
 *  序号不在这里画：原文页那张卡片不该长出一个「No.01」。 */
function changyanCard(ctx: Ctx, box: Box): void {
  frameCard(ctx, box, ctx.theme.accent, ctx.theme.line)
}

/** 桌位号：卡左上角的 No.03（母版每张卡都带，编号本身是版式的一部分） */
function changyanNo(ctx: Ctx, box: Box, index: number): void {
  cText(ctx, { x: box.x + 0.024, y: box.y + 0.016, w: 0.16, h: 0.038 }, `No.${String(index + 1).padStart(2, '0')}`, {
    size: 10,
    color: ctx.theme.accent,
    font: ctx.theme.fontBody,
  })
}

/** 一溜卡：2–3 条并排、4–6 条三列；卡宽、行高都按**实际条数**均分，不留空位（换模板保文字） */
function changyanGrid(ctx: Ctx, list: string[], top: number, bottom: number, size: number): void {
  const n = list.length
  if (!n) return
  const cols = n <= 3 ? n : 3
  const rows = Math.ceil(n / cols)
  const gap = 0.03
  const left = 0.042
  const total = 0.916
  const cw = (total - gap * (cols - 1)) / cols
  const ch = (bottom - top - gap * (rows - 1)) / rows
  list.forEach((t, i) => {
    const box: Box = {
      x: left + (i % cols) * (cw + gap),
      y: top + Math.floor(i / cols) * (ch + gap),
      w: cw,
      h: ch,
    }
    changyanCard(ctx, box)
    changyanNo(ctx, box, i)
    const inner: Box = { x: box.x + 0.024, y: box.y + 0.062, w: box.w - 0.048, h: box.h - 0.09 }
    const short = Array.from(t).length <= 4
    cText(ctx, inner, t, {
      size: tilePt(t, size, inner.h),
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.5,
      align: short ? 'center' : 'left',
      valign: 'middle',
    })
  })
}

/** 页眉：黑体粗标题贴最上 + 一道锈红短杠（那道短杠是这份母版的记号） */
function changyanHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.changyan, ctx.title, {
    size: n <= 10 ? 32 : n <= 18 ? 26 : 21,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.18,
    valign: 'middle',
  })
  cRect(ctx, { x: 0.08, y: 0.212, w: 0.11, h: 0.012 }, ctx.theme.accent)
}

const changyan: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    const n = Array.from(ctx.title).length
    cText(ctx, { x: 0.062, y: 0.075, w: 0.5, h: 0.04 }, ctx.slide.meta ?? '', {
      size: 12,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    // 锈红粗标题压左上半：长桌宴的封面不是衬线体，是招牌上的字
    cText(ctx, { x: 0.06, y: 0.26, w: 0.66, h: 0.36 }, ctx.title, {
      size: coverPt(n, [76, 70, 46, 36]),
      color: ctx.theme.accent,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.14,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.062, y: 0.655, w: 0.46, h: 0.0028 }, ctx.theme.accent, 0.9)
    cText(ctx, { x: 0.42, y: 0.672, w: 0.3, h: 0.06 }, ctx.note || ctx.line, {
      size: 15,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
    })
    // 右侧大号期号：长桌宴的位次牌
    cText(ctx, { x: 0.68, y: 0.1, w: 0.28, h: 0.24 }, '01', {
      size: 92,
      color: ctx.theme.accent,
      font: ctx.theme.fontTitle,
      align: 'right',
      lineHeight: 1,
    })
    // 底上三栏：一张长桌摆开的三个位子
    for (let k = 0; k < 3; k += 1) {
      cLine(ctx, { x: 0.042 + k * 0.312, y: 0.9, w: 0.28, h: 0.0024 }, ctx.theme.accent, 0.5)
    }
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 原文页就是一张桌卡：整块细框 + 桌位号，字压在卡里
    const card: Box = { x: 0.042, y: 0.12, w: 0.916, h: 0.66 }
    changyanCard(ctx, card)
    changyanNo(ctx, card, 0)
    cText(ctx, { x: 0.09, y: 0.19, w: 0.82, h: 0.5 }, q, {
      size: quotePointSize(Array.from(q).length, 'changyan'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
      valign: 'middle',
    })
    cText(ctx, { x: 0.09, y: 0.8, w: 0.6, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    changyanHead(ctx)
    // 字词页也是一溜卡：四个词就是四个位子
    const list = ctx.items.slice(0, 4)
    const gap = 0.03
    const cw = (0.916 - gap * (list.length - 1)) / Math.max(1, list.length)
    list.forEach((w, i) => {
      const box: Box = { x: 0.042 + i * (cw + gap), y: 0.3, w: cw, h: 0.32 }
      changyanCard(ctx, box)
      changyanNo(ctx, box, i)
      cText(ctx, { x: box.x + 0.024, y: box.y + 0.07, w: box.w - 0.048, h: box.h - 0.1 }, w, {
        size: n0(30, 22, w),
        color: ctx.theme.ink,
        font: ctx.theme.fontTitle,
        valign: 'middle',
      })
    })
  },
  numbered: (ctx) => {
    changyanHead(ctx)
    changyanGrid(ctx, takeNumbered(ctx), 0.3, 0.82, 18)
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    changyanHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 24 : n <= 3 ? 21 : 18
    const lc: Box = { x: 0.042, y: 0.28, w: 0.44, h: 0.52 }
    const rc: Box = { x: 0.518, y: 0.28, w: 0.44, h: 0.52 }
    changyanCard(ctx, lc)
    changyanCard(ctx, rc)
    changyanNo(ctx, lc, 0)
    changyanNo(ctx, rc, 1)
    cText(ctx, { x: lc.x + 0.03, y: lc.y + 0.075, w: lc.w - 0.06, h: lc.h - 0.11 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.75,
    })
    cText(ctx, { x: rc.x + 0.03, y: rc.y + 0.075, w: rc.w - 0.06, h: rc.h - 0.11 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.75,
    })
  },
  end: (ctx) => {
    // 收尾页是一张大桌卡：整页只有这一张卡与一句字
    const card: Box = { x: 0.14, y: 0.22, w: 0.72, h: 0.36 }
    changyanCard(ctx, card)
    cText(ctx, { x: 0.18, y: 0.27, w: 0.64, h: 0.26 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 36,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      valign: 'middle',
      lineHeight: 1.3,
    })
    cText(ctx, { x: 0.18, y: 0.64, w: 0.6, h: 0.06 }, ctx.note, {
      size: 16,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    changyanHead(ctx)
    const box = besideArt(ctx, { x: 0.042, y: 0.28, w: 0.916, h: 0.52 })
    changyanCard(ctx, box)
    changyanNo(ctx, box, 0)
    bodyBlock(ctx, { x: box.x + 0.04, y: box.y + 0.09, w: box.w - 0.08, h: box.h - 0.13 }, 22, 1.75)
  },
}

/* ------------------------------ 单色刊 danse（Monochrome） ------------------------------ */

/** 页眉：大标题 + 底下一条发丝线（单色刊没有色块，全篇靠字号与线分层） */
function danseHead(ctx: Ctx): void {
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.danse, ctx.title, {
    size: n <= 8 ? 36 : n <= 14 ? 28 : n <= 20 ? 23 : 19,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.1,
    valign: 'middle',
  })
  cLine(ctx, { x: 0.1, y: 0.238, w: 0.8, h: 0.001 }, ctx.theme.accent, 0.85)
}

/** 一格：01 编号 + 内容 + 底下一条发丝线；单色刊没有底色，分层全靠字号与编号 */
function danseCell(ctx: Ctx, box: Box, text: string, index: number, size: number): void {
  cText(ctx, { x: box.x, y: box.y, w: box.w, h: 0.03 }, String(index + 1).padStart(2, '0'), {
    size: 10,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
  })
  cText(ctx, { x: box.x, y: box.y + 0.036, w: box.w, h: box.h - 0.045 }, text, {
    size,
    color: ctx.theme.ink,
    font: ctx.theme.fontBody,
    lineHeight: 1.55,
    valign: 'middle',
  })
  cLine(ctx, { x: box.x, y: box.y + box.h, w: box.w, h: 0.001 }, ctx.theme.accent, 0.4)
}

/** 编号格：2–3 条并排、4 条 2×2、5 条以上 3 列；格宽与行高按实际条数均分 */
function danseGrid(ctx: Ctx, list: string[], top: number, bottom: number, size: number): void {
  const n = list.length
  if (!n) return
  const cols = n <= 3 ? n : n <= 4 ? 2 : 3
  const rows = Math.ceil(n / cols)
  const gapX = 0.05
  const gapY = 0.055
  const left = 0.1
  const total = 0.8
  const cw = (total - gapX * (cols - 1)) / cols
  const ch = (bottom - top - gapY * (rows - 1)) / rows
  list.forEach((t, i) => {
    const box: Box = {
      x: left + (i % cols) * (cw + gapX),
      y: top + Math.floor(i / cols) * (ch + gapY),
      w: cw,
      h: ch,
    }
    danseCell(ctx, box, t, i, size)
  })
}

const danse: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    const n = Array.from(ctx.title).length
    // 单色刊封面是一张印得极淡的照片：有画就压一层纸（86%），没画就是纯纸
    if (art) cRect(ctx, { x: 0, y: 0, w: 1, h: 1 }, ctx.theme.paper, 0.86)
    cLine(ctx, { x: 0.06, y: 0.075, w: 0.88, h: 0.0012 }, ctx.theme.ink, 0.9)
    cText(ctx, { x: 0.06, y: 0.09, w: 0.6, h: 0.04 }, ctx.slide.meta ?? '', {
      size: 11,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    // 超大细字标题（母版封面就是靠这一个字号立住）
    cText(ctx, { x: 0.06, y: 0.22, w: 0.88, h: 0.44 }, ctx.title, {
      size: coverPt(n, [78, 72, 52, 40]),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.08,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.06, y: 0.7, w: 0.88, h: 0.0012 }, ctx.theme.ink, 0.9)
    cText(ctx, { x: 0.46, y: 0.72, w: 0.3, h: 0.06 }, ctx.note || ctx.line, {
      size: 15,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    // 右下那排小圆点：母版唯一的「装饰」
    for (let k = 0; k < 3; k += 1) {
      cEllipse(ctx, { x: 0.856 + k * 0.03, y: 0.848, w: 0.014, h: 0.014 }, ctx.theme.ink, 0.85)
    }
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 上下各一根发丝线把句子夹住：原文页不靠底色，靠这两道线
    cLine(ctx, { x: 0.1, y: 0.16, w: 0.8, h: 0.0012 }, ctx.theme.ink, 0.8)
    cText(ctx, { x: 0.1, y: 0.2, w: 0.8, h: 0.5 }, q, {
      size: quotePointSize(Array.from(q).length, 'danse'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.95,
      valign: 'middle',
    })
    cLine(ctx, { x: 0.1, y: 0.75, w: 0.8, h: 0.0012 }, ctx.theme.ink, 0.8)
    cText(ctx, { x: 0.1, y: 0.78, w: 0.4, h: 0.05 }, ctx.note, {
      size: 13,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  words: (ctx) => {
    danseHead(ctx)
    danseGrid(ctx, ctx.items.slice(0, 4), 0.3, 0.78, 30)
  },
  numbered: (ctx) => {
    danseHead(ctx)
    danseGrid(ctx, takeNumbered(ctx), 0.3, 0.8, 19)
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    danseHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 25 : n <= 3 ? 21 : 18
    cLine(ctx, { x: 0.1, y: 0.3, w: 0.8, h: 0.0012 }, ctx.theme.ink, 0.7)
    cText(ctx, { x: 0.13, y: 0.34, w: 0.36, h: 0.42 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.57, y: 0.34, w: 0.36, h: 0.42 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cLine(ctx, { x: 0.535, y: 0.3, w: 0.0008, h: 0.46 }, ctx.theme.accent, 0.5)
  },
  end: (ctx) => {
    cLine(ctx, { x: 0.15, y: 0.34, w: 0.7, h: 0.0012 }, ctx.theme.ink, 0.8)
    cText(ctx, { x: 0.15, y: 0.38, w: 0.7, h: 0.18 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 40,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      valign: 'middle',
      lineHeight: 1.28,
    })
    cText(ctx, { x: 0.15, y: 0.6, w: 0.5, h: 0.07 }, ctx.note, {
      size: SIZES.small,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    cLine(ctx, { x: 0.15, y: 0.7, w: 0.7, h: 0.0012 }, ctx.theme.ink, 0.5)
  },
  plain: (ctx) => {
    danseHead(ctx)
    bodyBlock(ctx, besideArt(ctx, { x: 0.1, y: 0.3, w: 0.8, h: 0.48 }), 24, 1.85)
  },
}

/* ------------------------------ 钢印 gangyin（Stencil & Tablet） ------------------------------ */

/** 铜青的双瓣叶片（母版右上角那枚印）：两枚椭圆一正一斜叠出来，是这份稿子唯一认得出的图形 */
function gangyinLeaf(ctx: Ctx, x: number, y: number, size: number, opacity = 1): void {
  leafPair(ctx, x, y, size, ctx.theme.accent, opacity)
}

/** 页眉：铜青实心块 + 块里反白标题（像盖了一枚钢印）+ 右侧小叶片 + 底下一道钢印线 */
function gangyinHead(ctx: Ctx): void {
  cRect(ctx, { x: 0.08, y: 0.09, w: 0.56, h: 0.095 }, ctx.theme.accent)
  const n = Array.from(ctx.title).length
  cText(ctx, HEAD.gangyin, ctx.title, {
    size: n <= 10 ? 24 : n <= 16 ? 19 : 16,
    color: ctx.theme.paper,
    font: ctx.theme.fontTitle,
    valign: 'middle',
  })
  gangyinLeaf(ctx, 0.86, 0.078, 0.075, 0.9)
  cLine(ctx, { x: 0.08, y: 0.198, w: 0.84, h: 0.0024 }, ctx.theme.accent, 0.85)
}

const gangyin: Record<Arch, Layout> = {
  cover: (ctx) => {
    const art = coverArt(ctx)
    const n = Array.from(ctx.title).length
    // 左上小字标签 + 右上那枚叶片
    cText(ctx, { x: 0.052, y: 0.06, w: 0.42, h: 0.04 }, ctx.slide.meta ?? '', {
      size: 11,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
    })
    gangyinLeaf(ctx, 0.812, 0.074, 0.16, 0.95)
    // 铜青小标签：像印完随手拍在纸上的一枚章
    cRect(ctx, { x: 0.052, y: 0.44, w: 0.09, h: 0.028 }, ctx.theme.accent, 1)
    // 左下 stencil 粗黑巨字（母版封面就是这几个大字）
    cText(ctx, { x: 0.05, y: 0.5, w: 0.78, h: 0.38 }, ctx.title, {
      size: coverPt(n, [80, 76, 48, 36]),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.06,
      valign: 'middle',
    })
    cText(ctx, { x: 0.5, y: 0.895, w: 0.3, h: 0.05 }, ctx.note || ctx.line, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  quote: (ctx) => {
    const q = `「${ctx.quote}」`
    // 左侧一道铜青书脊 + 右侧大字，右上小叶片收角
    cRect(ctx, { x: 0.14, y: 0.24, w: 0.008, h: 0.4 }, ctx.theme.accent, 0.95)
    cText(ctx, { x: 0.2, y: 0.24, w: 0.66, h: 0.4 }, q, {
      size: quotePointSize(Array.from(q).length, 'gangyin'),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.9,
      valign: 'middle',
    })
    cText(ctx, { x: 0.2, y: 0.76, w: 0.5, h: 0.05 }, ctx.note, {
      size: 14,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
    gangyinLeaf(ctx, 0.85, 0.78, 0.1, 0.85)
  },
  words: (ctx) => {
    gangyinHead(ctx)
    // 四个词就是四块铜青牌，浓淡依次递减（母版那种印了四次的报頭）
    const list = ctx.items.slice(0, 4)
    const gap = 0.022
    const cw = (0.88 - gap * (list.length - 1)) / Math.max(1, list.length)
    const alphas = [1, 0.78, 0.55, 0.34]
    list.forEach((w, i) => {
      const box: Box = { x: 0.06 + i * (cw + gap), y: 0.28, w: cw, h: 0.34 }
      cRect(ctx, box, ctx.theme.accent, alphas[i % 4])
      cText(ctx, { x: box.x + 0.02, y: box.y + 0.03, w: box.w - 0.04, h: box.h - 0.06 }, w, {
        size: n0(30, 22, w),
        color: ctx.theme.paper,
        font: ctx.theme.fontTitle,
        bold: true,
        align: 'center',
        valign: 'middle',
      })
    })
  },
  numbered: (ctx) => {
    gangyinHead(ctx)
    const list = takeNumbered(ctx)
    const step = Math.min(0.1, 0.5 / Math.max(1, list.length))
    list.forEach((t, i) => {
      const y = 0.26 + i * step
      // 序号放进一块实心铜青小方，反白数字——钢印母版的编号是印上去的，不是排上去的
      cRect(ctx, { x: 0.08, y, w: 0.05, h: step - 0.02 }, ctx.theme.accent, 0.92)
      cText(ctx, { x: 0.08, y, w: 0.05, h: step - 0.02 }, String(i + 1).padStart(2, '0'), {
        size: 15,
        color: ctx.theme.paper,
        font: ctx.theme.fontTitle,
        align: 'center',
        valign: 'middle',
      })
      cText(ctx, { x: 0.155, y, w: 0.69, h: step - 0.02 }, t, {
        size: list.length <= 3 ? 22 : list.length <= 4 ? 20 : 18,
        color: ctx.theme.ink,
        font: ctx.theme.fontBody,
        lineHeight: 1.5,
        valign: 'middle',
      })
      cLine(ctx, { x: 0.155, y: y + step - 0.022, w: 0.69, h: 0.0012 }, ctx.theme.line, 1)
    })
  },
  compare: (ctx) => {
    const [left, right] = halves(ctx.items)
    gangyinHead(ctx)
    const n = Math.max(left.length, right.length)
    const size = n <= 2 ? 25 : n <= 3 ? 21 : 18
    cLine(ctx, { x: 0.1, y: 0.28, w: 0.35, h: 0.004 }, ctx.theme.accent, 0.95)
    cLine(ctx, { x: 0.53, y: 0.28, w: 0.35, h: 0.004 }, ctx.theme.accent, 0.35)
    cText(ctx, { x: 0.1, y: 0.34, w: 0.35, h: 0.42 }, left.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
    cText(ctx, { x: 0.53, y: 0.34, w: 0.35, h: 0.42 }, right.join('\n'), {
      size,
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.9,
    })
  },
  end: (ctx) => {
    gangyinLeaf(ctx, 0.78, 0.16, 0.19, 0.9)
    cRect(ctx, { x: 0.08, y: 0.36, w: 0.07, h: 0.028 }, ctx.theme.accent, 1)
    cText(ctx, { x: 0.08, y: 0.42, w: 0.72, h: 0.2 }, ctx.line || ctx.items[0] || ctx.title, {
      size: 40,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      valign: 'middle',
      lineHeight: 1.25,
    })
    cText(ctx, { x: 0.08, y: 0.66, w: 0.6, h: 0.06 }, ctx.note, {
      size: 16,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
    })
  },
  plain: (ctx) => {
    gangyinHead(ctx)
    bodyBlock(ctx, besideArt(ctx, { x: 0.1, y: 0.24, w: 0.78, h: 0.54 }), 24, 1.8)
    if (!ctx.art) gangyinLeaf(ctx, 0.8, 0.68, 0.13, 0.55)
  },
}

const visualStubLayout: Record<Arch, Layout> = {
  cover: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
  quote: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
  words: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
  numbered: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
  compare: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
  end: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
  plain: (ctx) => ctx.out.push(...placeVisualSlide(ctx.slide, ctx.theme)),
}

/** 一族一套排法，七种版式各自实现——少一个编译就红，没有「退回默认」这条路 */
const LAYOUTS: Record<FamilyId, Record<Arch, Layout>> = {
  watercolor: visualStubLayout,
  business: visualStubLayout,
  handdrawn: visualStubLayout,
  suke,
  xuan,
  liti,
  jijian,
  shuye,
  tigang,
  lanxian,
  liu,
  chang,
  man,
  ka,
  shuangnian,
  gulan,
  shangwu,
  sanse,
  lindi,
  changyan,
  danse,
  gangyin,
}

/* ------------------------------ 小工具 ------------------------------ */

/**
 * 各族各版式一页画几条（唯一真源，paginate.ts 拿它分页）。
 * 以前这些数字散在各族 layout 的 slice(0, N) 里：内容层交 6 条、这一族只画 5 条，
 * 第 6 条就静默丢了——用户铁底线「不许漏」正是栽在这种地方。
 * 现在编号页一律走 takeNumbered()，超量的由 paginate() 拆成续页，一条不丢。
 * words 恒 4（内容层 WORDS_ITEMS_MAX 锁死）；素课 / 书页画得下 5 个词，宽一点不亏。
 */
export const ITEM_CAP: Record<FamilyId, { numbered: number; words: number }> = {
  watercolor: { numbered: 6, words: 4 },
  business: { numbered: 6, words: 4 },
  handdrawn: { numbered: 6, words: 4 },
  suke: { numbered: 6, words: 5 },
  xuan: { numbered: 6, words: 4 },
  liti: { numbered: 5, words: 4 },
  jijian: { numbered: 6, words: 4 },
  shuye: { numbered: 5, words: 5 },
  tigang: { numbered: 5, words: 4 },
  lanxian: { numbered: 6, words: 4 },
  liu: { numbered: 6, words: 4 },
  chang: { numbered: 6, words: 4 },
  man: { numbered: 6, words: 4 },
  ka: { numbered: 6, words: 4 },
  shuangnian: { numbered: 6, words: 4 },
  gulan: { numbered: 6, words: 4 },
  shangwu: { numbered: 6, words: 4 },
  sanse: { numbered: 6, words: 4 },
  lindi: { numbered: 6, words: 4 },
  changyan: { numbered: 6, words: 4 },
  danse: { numbered: 6, words: 4 },
  gangyin: { numbered: 6, words: 4 },
}

/** 编号页取条目：只取这一族画得下的那几条，剩下的由 paginate() 拆续页 */
function takeNumbered(ctx: Ctx): string[] {
  return ctx.items.slice(0, ITEM_CAP[ctx.theme.family].numbered)
}

/** items 前半 / 后半各一栏（与 show.ts 的 comparePairOf 同一种切法：按下标奇偶） */
function halves(items: readonly string[]): [string[], string[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)]
}

/** 对半切（宣纸字词页的两列对称）：前一半左、后一半右 */
function splitEven(items: readonly string[]): [string[], string[]] {
  const cut = Math.ceil(items.length / 2)
  return [items.slice(0, cut), items.slice(cut)]
}

/** 字词长度自适应：一个词很长时退一档字号，免得撑出卡外 */
function n0(big: number, small: number, word: string): number {
  return Array.from(word).length <= 5 ? big : small
}

/** 正文 = 条目（问句另有下方的问句行，不再重复一次） */
function bodyOf(ctx: Ctx): string {
  return ctx.items.join('\n')
}

/**
 * 字落在框里：排完一页逐块量字，超出本框半行以上就降一档字号，降到 50%（不低于 8pt）为止。
 *
 * 这是「AI 写多长都不崩」的唯一落点：母版槽位是死的（框宽、框高、字号都按原图钉住），
 * 模型写出来的字是活的。提示词里的容量（capacity.ts）管「该写多少」，这里管
 * 「万一写多了也不把字挤出框、不压到下一块」——两件事分开，谁也不替谁。
 *
 * 半行容差是故意留的：一行小标签（页名、编号、图注）装在略矮的槽里，多出来的那几像素
 * 肉眼看不出来（下一块离得远）；要缩那一类字，等于把全站的小字都缩一档，反而伤了版式。
 * 只收「多排了一行以上」的那一类——那才是真的把下一块顶开。
 *
 * 不增不删：只改 size，text 一个字不动（换模板保文字靠的就是这条）；
 * 降不到就到底，剩下的由 check:fit 报红——那是布局的错，不该由字来承担。
 */
function settle(ctx: Ctx): void {
  for (const p of ctx.out) {
    if (p.kind !== 'text' || !String(p.text ?? '').trim()) continue
    const start = p.size ?? SIZES.body
    /* 地板取 40%：正常的框 50% 就够，但收尾页那种「一个大字一块矮框」
       （40pt 装 55 字）50% 时仍剩一半装不下，40% 才能真收住 */
    const floor = Math.max(8, Math.round(start * 0.4))
    let size = start
    while (size > floor) {
      const lineH = size * PX * (p.lineHeight ?? 1.5)
      const e = extentOf({ ...p, size })
      const rows = Math.max(1, Math.round(e.h / lineH))
      /* 单行小标签常装在略矮的槽里，留半行容差（多出一行才算溢）；
         多行正文溢出半行就会顶进下一块（宣纸编号页 6 条正是如此：溢出 21px
         刚好小于半行 26px，settle 不缩，却把下面只有 7px 的问句行吞了），
         所以多行只留 1px 取整容差。 */
      const tol = rows <= 1 ? lineH * 0.5 + 0.5 : 1
      if (e.h <= p.h * PH + tol) break
      size -= 1
    }
    if (size < start) {
      p.size = size
      p.size0 = start
    }
  }
}

/* ------------------------------ 家具层 ------------------------------ */

/**
 * 每族的「家具」：色带 / 浅底卡 / 角章 / 点阵 / 书脊。在版式之前画，压在字底下。
 *
 * 为什么要有这一层（2026-11-22 用户验收原话：「不要这么素…只需要横线啊什么一类的
 * 就做出来的，很恶心」）：前十一族的版式骨架是「页眉 + 一段字 + 几条线」，纸面上
 * 没有块面，十九族看起来就像同一张白纸换了颜色。家具层给每族一个认得出的块面签名，
 * 每一式（含 plain / quote / end）都带，族与族的差别不再只靠几条线。
 *
 * 两条红线：① 实色块只落在页边 / 角上，正文底下只铺浅底（surface 半透明），
 * 墨字压在上面对比度不掉；② 家具先画、插画后压，图永远在家具上面。
 */
const FURNITURE: Record<FamilyId, (ctx: Ctx) => void> = {
  suke: (ctx) => {
    cRect(ctx, { x: 0, y: 0, w: 1, h: 0.14 }, ctx.theme.surface, 0.5)
    cRect(ctx, { x: 0.045, y: 0.2, w: 0.01, h: 0.62 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0.905, y: 0.885, w: 0.04, h: 0.07 }, ctx.theme.accent, 0.9)
    cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.6)
  },
  xuan: (ctx) => {
    const m = 0.028
    cLine(ctx, { x: m, y: m, w: 1 - m * 2, h: 0.002 }, ctx.theme.line, 0.7)
    cLine(ctx, { x: m, y: 1 - m, w: 1 - m * 2, h: 0.002 }, ctx.theme.line, 0.7)
    cLine(ctx, { x: m, y: m, w: 0.0015, h: 1 - m * 2 }, ctx.theme.line, 0.7)
    cLine(ctx, { x: 1 - m, y: m, w: 0.0015, h: 1 - m * 2 }, ctx.theme.line, 0.7)
    cRect(ctx, { x: 0.9, y: 0.06, w: 0.035, h: 0.062 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0, y: 0.95, w: 1, h: 0.05 }, ctx.theme.surface, 0.5)
  },
  liti: (ctx) => {
    cRect(ctx, { x: 0, y: 0, w: 0.13, h: 1 }, ctx.theme.surface, 0.5)
    /* 栏顶一块实色当签名：点阵曾放在栏中，压住标题与编号（对照图人眼复核抓出） */
    cRect(ctx, { x: 0, y: 0, w: 0.13, h: 0.06 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0.13, y: 0.92, w: 0.42, h: 0.012 }, ctx.theme.accent, 0.9)
  },
  jijian: (ctx) => {
    /* 极简的封面是「一幅字就是全部」（check:cover ⑤：封面零色块）——家具只进正文式 */
    if (archetypeOf(ctx.slide.kind) === 'cover') return
    cRect(ctx, { x: 0.66, y: 0, w: 0.34, h: 0.3 }, ctx.theme.surface, 0.55)
    cRect(ctx, { x: 0.06, y: 0.88, w: 0.18, h: 0.014 }, ctx.theme.accent, 0.9)
    cEllipse(ctx, { x: 0.92, y: 0.9, w: 0.03, h: 0.053 }, ctx.theme.accent, 0.25)
  },
  shuye: (ctx) => {
    cRect(ctx, { x: 0.055, y: 0, w: 0.016, h: 1 }, ctx.theme.accent, 0.8)
    for (let i = 0; i < 3; i++) cLine(ctx, { x: 0.94, y: 0.2 + i * 0.04, w: 0.03, h: 0.002 }, ctx.theme.line, 0.6)
    cRect(ctx, { x: 0, y: 0.9, w: 1, h: 0.1 }, ctx.theme.surface, 0.5)
  },
  tigang: (ctx) => {
    cRect(ctx, { x: 0, y: 0, w: 1, h: 0.045 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0.05, y: 0.22, w: 0.09, h: 0.56 }, ctx.theme.surface, 0.5)
    cRect(ctx, { x: 0.9, y: 0.88, w: 0.04, h: 0.07 }, ctx.theme.accent, 0.85)
  },
  lanxian: (ctx) => {
    cRect(ctx, { x: 0, y: 0, w: 1, h: 0.1 }, ctx.theme.surface, 0.55)
    for (let i = 0; i < 3; i++) cRect(ctx, { x: 0.08 + i * 0.3, y: 0.16, w: 0.05, h: 0.012 }, ctx.theme.accent, 0.8)
    cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.5)
  },
  liu: (ctx) => {
    cRect(ctx, { x: 0, y: 0, w: 1, h: 0.035 }, ctx.theme.accent, 0.8)
    for (let i = 0; i < 6; i++) cEllipse(ctx, { x: 0.07 + i * 0.15, y: 0.18, w: 0.012, h: 0.021 }, ctx.theme.accent, 0.6)
    cRect(ctx, { x: 0, y: 0.95, w: 1, h: 0.05 }, ctx.theme.surface, 0.5)
  },
  chang: (ctx) => {
    cRect(ctx, { x: 0, y: 0.88, w: 1, h: 0.12 }, ctx.theme.surface, 0.5)
    cRect(ctx, { x: 0.045, y: 0.05, w: 0.035, h: 0.062 }, ctx.theme.accent, 0.85)
    cRect(ctx, { x: 0, y: 0.002, w: 1, h: 0.004 }, ctx.theme.accent, 0.7)
  },
  man: (ctx) => {
    cRect(ctx, { x: 0, y: 0, w: 1, h: 0.12 }, ctx.theme.surface, 0.5)
    cRect(ctx, { x: 0.04, y: 0.16, w: 0.008, h: 0.66 }, ctx.theme.accent, 0.8)
    cRect(ctx, { x: 0.91, y: 0.89, w: 0.035, h: 0.062 }, ctx.theme.accent, 0.85)
  },
  ka: (ctx) => {
    for (const [x, y] of [[0.03, 0.03], [0.948, 0.03], [0.03, 0.93], [0.948, 0.93]] as const)
      cRect(ctx, { x, y, w: 0.022, h: 0.039 }, ctx.theme.accent, 0.7)
    cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.5)
  },
  /* 后八族自己的版式里已经明着画了大色块，家具只补页脚色带与右上角章，
     让 plain / end 这些「字少」的式也不至于回到白纸。章放右上：左上 / 左下都是字。 */
  shuangnian: (ctx) => { furn8(ctx) },
  gulan: (ctx) => { furn8(ctx) },
  shangwu: (ctx) => { furn8(ctx) },
  sanse: (ctx) => { furn8(ctx) },
  lindi: (ctx) => { furn8(ctx) },
  changyan: (ctx) => { furn8(ctx) },
  danse: (ctx) => { furn8(ctx) },
  gangyin: (ctx) => { furn8(ctx) },
  watercolor: () => {},
  business: () => {},
  handdrawn: () => {},
}

function furn8(ctx: Ctx): void {
  cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.7)
  cRect(ctx, { x: 0.945, y: 0.03, w: 0.02, h: 0.035 }, ctx.theme.accent, 0.8)
}

/* ------------------------------ 入口 ------------------------------ */

/** 一页的槽位。纯：同输入同输出。 */
export function place(slide: StudentSlide, theme: DeckTheme): Placed[] {
  const arch = archetypeOf(slide.kind)
  const fam = theme.family
  const art =
    typeof slide.illustration === 'string' && slide.illustration.startsWith('data:image/') ? slide.illustration : ''
  const ctx: Ctx = {
    slide,
    theme,
    out: [],
    title: clean(slide.title),
    line: clean(slide.line),
    items: lines(slide.items ?? []),
    note: clean(slide.note),
    quote: clean(slide.text) || clean(slide.title),
    art,
  }

  // 2026 公开课三大视觉主题（清新水彩 / 简洁商务 / 童趣手绘）：走统一视觉系统，44/32/24/18pt 四档字阶
  if (isVisualThemeId(fam)) {
    ctx.out = placeVisualSlide(slide, theme)
    // 封面兜底（无条件）：只要有画就满版贴在字下面（字压图上），已铺过整页图则去重
    if (arch === 'cover' && art && !ctx.out.some((q) => q.kind === 'image' && q.w > 0.99 && q.h > 0.99)) {
      ctx.out.unshift({ kind: 'image', x: 0, y: 0, w: 1, h: 1, data: art })
    }
    settle(ctx)
    return ctx.out
  }

  // 家具先画：每族的块面签名压在字底下（见 FURNITURE），再铺底纹、再排版、最后压图
  FURNITURE[fam](ctx)
  // 底纹先画：它在字下面，抢不走字（各族各一个浓度，极简与书页不铺）
  const alpha = SURFACE_ALPHA[fam]
  if (alpha > 0 && (arch === 'words' || arch === 'numbered' || arch === 'compare')) {
    cRect(ctx, { x: 0.085, y: 0.3, w: 0.83, h: 0.54 }, theme.surface, alpha)
  }
  // 插画：有画才压，没画就只排字，绝不补空框。
  // 封面与原文页不压侧图：封面整页就是画（cover 自己排），原文页句子占整页。
  // 先排字再压图：图位上只要已经有字，这一页就不压——宁可不压，不许字压图。
  const artBox = ART_BOX[fam]

  LAYOUTS[fam][arch](ctx)
  // 封面兜底（2026-11-27）：任何族的封面只要有画就整页铺，画在字下面。
  // 各族的 coverArt() 已铺过的不重复；内联封面（shuye 等没调 coverArt 的）在这里补。
  if (arch === 'cover' && art && !ctx.out.some((q) => q.kind === 'image' && q.w > 0.99 && q.h > 0.99)) {
    ctx.out.unshift({ kind: 'image', x: 0, y: 0, w: 1, h: 1, data: art })
  }

  if (artBox && art && arch !== 'cover' && arch !== 'quote' && !ART_SKIP[fam].includes(arch)) {
    guard(artBox, '插画')
    const label = MARKS[fam].label
    const clash =
      ctx.out.some((p) => p.kind === 'text' && overlapArea(p, artBox) > 0.0004) ||
      overlapArea(ASK[fam], artBox) > 0.0004 ||
      (label ? overlapArea(label, artBox) > 0.0004 : false)
    if (!clash) ctx.out.push({ kind: 'image', ...artBox, data: ctx.art })
  } else if (
    artBox &&
    !art &&
    clean(ctx.slide.pull) &&
    arch !== 'cover' &&
    arch !== 'quote' &&
    !ART_SKIP[fam].includes(arch)
  ) {
    /* 引文块（2026-11-22 用户拍板）：没图的活动页，把本页那句课文原句摆进图位，
       别让右半张只留一块空色。这一句是 slides.ts 逐字比对课文之后才写的，
       place() 只管排版——它不认字，也不许自己造句子。 */
    const pull = clean(ctx.slide.pull)
    const label = MARKS[fam].label
    const clash =
      ctx.out.some((p) => p.kind === 'text' && overlapArea(p, artBox) > 0.0004) ||
      overlapArea(ASK[fam], artBox) > 0.0004 ||
      (label ? overlapArea(label, artBox) > 0.0004 : false)
    if (!clash) {
      const body = `“${pull}”`
      const fit = pullType(artBox, [...body].length)
      /* 放不下就不画：半个字顶到框外，比空着难看。这一句原样留给别的页，
         withPulls 那边按同一把尺（≤56 字）预筛过，能走到这里的极少数。 */
      if (fit) {
        cText(
          ctx,
          {
            x: artBox.x + artBox.w * 0.14,
            y: artBox.y + artBox.h * 0.2,
            w: artBox.w * 0.72,
            h: artBox.h * 0.6,
          },
          body,
          {
            size: fit.size,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            align: 'center',
            valign: 'middle',
            lineHeight: fit.lineHeight,
          }
        )
      }
    }
  }

  // 正文页的问句行：各族各挂一处（封面自己带副题、原文页整页就是句子、结束页自己就是那一句）
  if (arch !== 'cover' && arch !== 'quote' && arch !== 'end' && ctx.line) {
    cText(ctx, ASK[fam], ctx.line, {
      size: 16,
      color: theme.accent,
      font: theme.fontBody,
      align: fam === 'xuan' ? 'center' : 'left',
      valign: 'middle',
    })
  }

  // 页名 + 页脚线：极简两样都不画（§3.4）；封面整页就是画，两样也不画（20b）
  const marks = MARKS[fam]
  if (marks.label && arch !== 'cover') {
    cText(ctx, marks.label, SLIDE_LABELS[slide.kind], {
      size: SIZES.tiny,
      color: theme.accent,
      font: theme.fontBody,
      align: fam === 'xuan' ? 'center' : 'left',
      valign: 'middle',
    })
  }
  if (marks.line && arch !== 'cover') cLine(ctx, marks.line, theme.line, marks.line.opacity)

  settle(ctx)

  return ctx.out
}
