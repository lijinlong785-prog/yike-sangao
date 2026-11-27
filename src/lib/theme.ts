import type { CSSProperties } from 'react'
import type { PageLayout } from './deck'
import type { SceneSlot } from './scene'

/* ================================================================== *
 * 课件纸面（TASKS 09 §十三 第 9 件）
 *
 * 上一版这里是一张写死的六套主题表，按学科分死：语文→墨与朱、数学→方格、
 * 英语→松绿……「同一套主题」本身不等于「配得对」，而且六个学科之外的课
 * 永远落不到合身的纸。现在色板由 AI 读完课文现场给（src/lib/scheme.ts 负责
 * 问、判、打回），本文件只负责两件老实事：
 *   1. 定义一份视觉方案的数据形状（DeckTheme）；
 *   2. 把它变成 CSS 变量与纸面纹理，落在真正那张纸上。
 *
 * 三条边界，改这个文件前先读：
 * · 工具本体永远纸墨：Home / Settings / 顶栏 / 按钮 / 输入框吃 :root，
 *   这份 DeckTheme 只被三处产物区消费——Preview 的纸片区、SlideShow 的 .show、
 *   导出的 .pptx（src/lib/pptx.ts）。主题值一律不写进 :root。
 * · 色值的硬约束不在这里判，在 scheme.ts（明度 80–97%、彩度 ≤8%、
 *   正文对比度 ≥4.5:1、两两底色色差 ≥20、数学英语不许宣纸印章）。
 *   这里只消费、不裁决：裁决漏了会出现荧光紫，消费漏了会出现两套墨。
 * · 兜底永远在：没有 Key、模型交不出合格方案，都用 DEFAULT_THEME（纸与墨）。
 *   它的七个色值与 styles.css :root 逐字相同（含大小写），《桂花雨》零回归。
 * ================================================================== */

/**
 * 纸面母题。它同时是纹理选择器与「学科禁忌」的判据：
 * 数学、英语课出现 seal / silk（宣纸帘纹、印章）直接判错——这是这一轮写死的红线。
 *
 * seal 落成「密帘纹」而不是画一枚假印章：课件上盖一枚假印，正是这条红线要防的俗套，
 * 而且印章在投影上只是一个红方块，认不出字，反而抢标题。
 */
export type Motif = 'plain' | 'lines' | 'dots' | 'silk' | 'seal'

export const MOTIFS: readonly Motif[] = ['plain', 'lines', 'dots', 'silk', 'seal'] as const

export interface DeckTheme {
  /** 方案标识（AI 方案用 'ai:' + 主纸色值，自检与调试只认这一个字符串） */
  id: string
  /** 纸的名字，界面上显示「本文纸面 · 秋江」 */
  name: string
  /** 主纸：所有页的底色 */
  paper: string
  /** 封面纸：与主纸不同时才有；「两两底色色差 ≥20」管的就是这一对 */
  coverPaper?: string
  /** 次级纸底（卡片 / 侧栏），必须比主纸暗一档 */
  paperDeep: string
  /** 分隔线 */
  paperLine: string
  /** 主字色 */
  ink: string
  /** 次级字色 */
  inkSoft: string
  /** 唯一强调色 */
  accent: string
  /** 强调色淡底，只用于圈重点底纹与选中态 */
  accentSoft: string
  /** 大标题字体栈：任何方案都必须是衬线，不许换成无衬线 */
  serif: string
  /** 正文字体栈 */
  sans: string
  /** 纸面母题 */
  motif: Motif
  /** 分隔线粗细 px */
  ruleWidth: number
  /** AI 按课文排的每页版式（缺省 / 长度不够时由 deck.ts 按页型兜底） */
  layouts?: PageLayout[]
  /**
   * AI 按课文挑的每页场景（TASKS 09 第 10 件）：花瓣 / 雪 / 雨 / 留白。
   * 只给「带动态」那一版导出用；缺省、长度不够、全部留白都是合法状态。
   */
  scenes?: SceneSlot[]
  /** 为什么这样配——给老师看的一句话，不是给评委看的 */
  note?: string
  /** 这份纸面从哪来：模型现场配的，还是兜底 */
  source: 'ai' | 'builtin'
}

/** 全站正文字体栈：与 :root 的 --font-sans 同一串 */
const SANS = '"PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif'
/** 衬线栈：AI 只许在衬线里挑，不许交无衬线大标题 */
const SERIF = '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif'

/**
 * 兜底纸面 = 现有纸墨（DESIGN.md 第二节）+ 一张封面纸。
 * 七个色值一个数字都不许动：check-lib 里有「与 styles.css :root 逐字相同」的断言。
 * 封面纸比主纸深一档（RGB 欧氏距离 50.8 ≥ 20），所以「两两底色」这条红线
 * 在断网、无 Key 的默认路径上也是真的被行使一次，而不是空转。
 */
export const DEFAULT_THEME: DeckTheme = {
  id: 'builtin-ink',
  name: '纸与墨',
  paper: '#faf8f3',
  coverPaper: '#e2dcd0',
  paperDeep: '#f3efe6',
  paperLine: '#e2dccd',
  ink: '#1e1c19',
  inkSoft: '#56514a',
  accent: '#b23a2e',
  accentSoft: '#f0e0dc',
  serif: SERIF,
  sans: SANS,
  motif: 'plain',
  ruleWidth: 1,
  source: 'builtin',
  note: '纸与墨：没填 Key 或模型没交出合格方案时的默认纸面。',
}

/** 这一页该用哪张纸：封面且有封面纸时用封面纸，其余用主纸 */
export function paperOf(t: DeckTheme, kind?: string): string {
  return kind === 'cover' && t.coverPaper ? t.coverPaper : t.paper
}

/**
 * 主题变量注入。挂在一个容器上（.pv-stage / .show / .ppt-panel），只影响它包住的那张纸。
 *
 * 只注入样式表里真的在消费的名字（--cinnabar / --ink-2 / --paper-line …）。
 * --paper-cover 只在方案真的有封面纸时注入，样式侧写的是
 * `background: var(--paper-cover, var(--paper))`，缺了就退回主纸，不会出现空档。
 * 唯一没有样式消费者的例外是 --deck-theme：它给自检脚本与调试用（值就是方案 id）。
 * --ink-3 / --indigo / --moss 不覆盖：它们不是 DeckTheme 的字段，
 * 保持 :root 原样，才守得住「每份方案只有一个强调色」。
 */
export function themeVars(t: DeckTheme): CSSProperties {
  const vars: Record<string, string> = {
    '--paper': t.paper,
    '--paper-deep': t.paperDeep,
    '--paper-line': t.paperLine,
    '--ink': t.ink,
    '--ink-2': t.inkSoft,
    '--cinnabar': t.accent,
    '--cinnabar-soft': t.accentSoft,
    '--font-serif': t.serif,
    '--font-sans': t.sans,
    '--rule-width': `${t.ruleWidth}px`,
    '--deck-theme': t.id,
  }
  if (t.coverPaper) vars['--paper-cover'] = t.coverPaper
  return vars as CSSProperties
}

/** SVG data-URI 要塞进 CSS url()，整串编码掉 < > # " 才不会被解析器咬到 */
function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * 纸面纹理。线条用内联 SVG 画，描边色取该方案的 paperLine；
 * 禁用渐变（底线 2），所以这里只可能出现 stroke / fill，绝不出现 gradient。
 *
 * 帘纹（silk / seal）用横向细线：宣纸的帘纹本来就是横的，竖线就成了稿纸。
 * seal 只是把帘纹压密一档——见上面 Motif 的注释：不画假印章。
 */
export function gridTexture(t: DeckTheme): CSSProperties | undefined {
  const line = t.paperLine
  const tiled = (size: number, body: string) => ({
    backgroundImage: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body}</svg>`),
    backgroundRepeat: 'repeat',
    backgroundSize: `${size}px ${size}px`,
  })

  if (t.motif === 'lines') {
    return tiled(24, `<path d="M24 0V24M0 24H24" fill="none" stroke="${line}" stroke-width="1"/>`)
  }
  if (t.motif === 'dots') {
    return tiled(16, `<circle cx="1" cy="1" r="1" fill="${line}"/>`)
  }
  if (t.motif === 'silk') {
    return tiled(28, `<path d="M0 27.5H24" fill="none" stroke="${line}" stroke-width="1"/>`)
  }
  if (t.motif === 'seal') {
    return tiled(14, `<path d="M0 13.5H24" fill="none" stroke="${line}" stroke-width="1"/>`)
  }
  return undefined
}

/** 主题变量 + 纹理，一次给全（SlideShow 根节点用的就是这个组合） */
export function themeStyle(t: DeckTheme): CSSProperties {
  return { ...themeVars(t), ...(gridTexture(t) ?? {}) }
}