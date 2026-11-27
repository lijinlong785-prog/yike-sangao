import {
  SLIDE_LABELS,
  SLIDE_POINTS,
  validateSlides,
  type StudentSlide,
  type StudentSlideKind,
} from './slides'
import { DEFAULT_THEME, paperOf, type DeckTheme } from './theme'
import { ENVELOPE, type DensityLimits } from './density'
import type { DeckPage } from './deck'
import { isSceneKind, sceneDataUrl, type SceneKind } from './scene'
import { backdropFor, shapeColor, type Backdrop } from './backdrop'
import { FOOT_SLOT, place, type Placed } from './deck2/place'
import { FONT_FACE, type DeckTheme as TemplateTheme } from './deck2/theme'

export interface DeckPptxOptions {
  /**
   * true（缺省）= 带场景动态：有场景的页插一张循环 GIF；
   * false = 纯静态：一张图都不插，文件与旧版同构。
   * 两份都以同一个 pages / theme 为源，差别只在「插不插 GIF」。
   */
  animated?: boolean
}

/**
 * 学生版导出的开关：除了「插不插 GIF」，还要带**这一叠该按哪一档校验**。
 *
 * 第二十轮修的就是这里的漏：从前 downloadPptx 内部写死 validateSlides(list)，
 * 用的是 clip 的三档并集（10–14 页）。于是一节 40 分钟的课按环节铺出 27 页，
 * 生成侧过了、导出侧却被「有 27 页，超过 14 页上限」原路退回——学生版「一按就炸」。
 * 现在由调用方（usePptxExport.run）把生成时用的同一份 limits 递进来，页数区间跟着档位走。
 */
export interface PptxOptions extends DeckPptxOptions {
  /** 这一叠的校验上限（字数 / 页数区间 / items / 精读页数）；不给 = 三档并集 ENVELOPE */
  limits?: DensityLimits
}

/* ================================================================== *
 * 本文件出两份 pptx，读者不同，不要混：                                  *
 *                                                                    *
 * A. 学生版课堂 PPT —— downloadPptx(StudentSlide[])，投给学生看的那面墙。 *
 *    数据来自 slides.ts，禁词 / 字号 / 问句那一套铁律只管这一份。        *
 * B. 课件导出 —— downloadDeckPptx(DeckPage[])，就是界面正在显示的那一叠。 *
 *    用户改过、插过、删过的页跟界面一模一样；课件本来就带「教学目标」     *
 *    这类词，所以**不走** validateSlides。两套正文摆在下文各自注释里。     *
 * ================================================================== */

/* ================================================================== *
 * A. 学生版课堂 PPT 导出（TASKS/07 §4.2）                              *
 *
 * 这里产出的是**课堂上投给学生看**的那一份，不是课件。                 *
 * 入参只有 StudentSlide[]，一页一张 slide，slides.length 就是页数。    *
 *                                                                    *
 * 三条铁律，改代码前先读：                                            *
 * 1. 字号一律从 SLIDE_POINTS 取（titleMin 40 / bodyMin 24 / wordsMin 54 /  *
 *    coverTitle 48），只允许在这些下限之上放大，不许写死更小的数字。   *
 *    唯一允许的小字是页脚分类字与 imageHint 检索词——它们不是正文。     *
 * 2. 答案与教学提示只进 addNotes()，页面文字里永远不写答案。           *
 * 3. 页面文字永远不许出现「教学目标 / 环节 / 时长」那 7 个禁词。        *
 *    数据层已经保证合规，这里再加一道第二防线：不合规直接 throw。      *
 *                                                                    *
 * 视觉仍是「纸与墨」：纸底、墨字、朱红点缀；无渐变、无模糊、圆角 2px。  *
 * ================================================================== */

/* 纸与墨：六个色值不再写死在这里，一律从 DeckTheme 取（TASKS/08 §C.3）。
 * pptx 里必须写成不带 # 的 6 位大写 HEX，所以 paletteOf 只做一次格式转换。
 * INK3 保留常量：它是纸墨体系的第三档灰（图位框、页脚小字），DeckTheme 里没有这一档，
 * 跟着主题走等于把工具色渗进课件，也守不住「每套只有一个强调色」。
 * 字体仍用「宋体」「黑体」两个通用名，PowerPoint 在本机字体里自己找。 */
const INK3 = '948D82'
const SERIF = '宋体'
const SANS = '黑体'

/** 一张纸的六个色位。字段名沿用本文件原有的大写写法：改动只发生在「值从哪来」 */
export interface DeckPalette {
  PAPER: string
  INK: string
  INK2: string
  CINNABAR: string
  LINE: string
}

/** DeckTheme → pptx 色板：去 #、转 6 位大写。只读主题，不自己造颜色。
 * `kind` 只影响 PAPER 一项：封面有封面纸时用封面纸（与网页/演示同一张纸），其余行用主纸。
 * 不传 kind 就是主纸——离线口径与对照基线吃到的仍是同一个值。 */
export function paletteOf(t: DeckTheme, kind?: string): DeckPalette {
  const hex = (v: string) => String(v).replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase()
  const paper = kind === 'cover' && t.coverPaper ? t.coverPaper : t.paper
  return {
    PAPER: hex(paper),
    INK: hex(t.ink),
    INK2: hex(t.inkSoft),
    CINNABAR: hex(t.accent),
    LINE: hex(t.paperLine),
  }
}

/* 16:9 宽屏（PowerPoint 新建演示文稿的默认纸面）：
 * 同一张 10×5.625 的纸上，54pt 的字词页竖向只容得下 3–4 行；13.333×7.5 才容得下 5 行。
 * 下面尺寸一律英寸，不是字号。 */
const W = 13.333
const H = 7.5
const M = 0.92
const CW = W - M * 2

/* 版式骨架 */
const LABEL_Y = 0.52
const TITLE_Y = 1.02
const TITLE_H = 1.27
const RULE_Y = 2.28
const BODY_TOP = RULE_Y + 0.18
const BODY_BOTTOM = H - 1.25
const COVER_TITLE_Y = 2.1
const COVER_RULE_Y = 3.62
const COVER_BODY_TOP = COVER_RULE_Y + 0.3
const FIGURE_W = CW * 0.3
const FIGURE_X = W - M - FIGURE_W
const FIGURE_Y = BODY_TOP + 0.1
const FIGURE_H = FIGURE_W * 0.75
const FOOT_Y = H - 0.66

/* 插画版式（TASKS/11 §七 + 12 §三）：图与文两栏，图按 artSide 取左或右。
 * 这组数不是随手调的比例，是验收坐标：预览层按同一套数换百分比（PptPreview.tsx）。
 * 16:9 的图 6.30×3.55，图与正文之间留 0.42in，大于要求的 0.35in。
 * 左侧不是另写一套数，是由画布宽反推出来的镜像（见 artBox）。 */
const ART_W = 6.3
const ART_H = 3.55
const ART_Y = 0.62
const ART_TITLE_W = 5.2
const ART_TITLE_Y = 0.7
const ART_TITLE_H = 0.82
const ART_TITLE_PT = 40
const ART_TITLE_FLOOR = 34
const ART_BODY_W = 5.15
const ART_BODY_Y = 1.62
const ART_BODY_H = FOOT_Y - ART_BODY_Y
const ART_BODY_PT = 20
const ART_LINE_SPACING = 32
const ART_LABEL_Y = 0.26

/** 右侧那三条基准（图 / 标题 / 正文的 x） */
const ART_RIGHT = { art: 6.45, title: 0.85, body: 0.88 }

/**
 * 一页的插画坐标：同一套数按 artSide 取左 / 右。
 * 镜像一律由画布宽 W 反推，不许两边各写一份——写两份就一定会有某天对不上。
 * 左：图 13.333−6.45−6.30 = 0.583，标题 13.333−0.85−5.20 = 7.283，正文 13.333−0.88−5.15 = 7.303。
 */
export function artBox(side: 'left' | 'right'): { art: number; title: number; body: number } {
  if (side === 'right') return { ...ART_RIGHT }
  return {
    art: W - ART_RIGHT.art - ART_W,
    title: W - ART_RIGHT.title - ART_TITLE_W,
    body: W - ART_RIGHT.body - ART_BODY_W,
  }
}

/** 只允许在上限之上取值：数值给视觉，floor 给规则，任何一处写小都会被抬回线上 */
function ptFloor(value: number, floor: number): number {
  return Math.max(floor, Math.round(value))
}

/** 页面装饰小字：左上角分类字与页脚，不属于正文，不受 24/40/54 约束 */
const DECOR_PT = 11

/**
 * 一行文字需要的宽度（英寸）。保守估算，宁可估宽：
 * 汉字、全角标点（，。？“”（）《》）、全角空格（　）、带圈数字都按 1 个 em 算，
 * ASCII 字母数与半角空格按 0.5 个 em。估窄了就会在 PowerPoint 里换行、把一页撑成两页。
 */
function textWidthIn(text: string, fontSizePt: number): number {
  let units = 0
  for (const ch of String(text ?? '')) units += /[\x20-\x7E]/.test(ch) ? 0.5 : 1
  return (units * fontSizePt) / 72
}

/** 装不下就按 2pt 一档降，最低不低于下限；下限来自 SLIDE_POINTS */
function fitPt(lines: string[], want: number, floor: number, widthIn: number): number {
  let p = ptFloor(want, floor)
  const longest = lines.reduce((max, t) => Math.max(max, textWidthIn(t, p)), 0)
  return Math.max(floor, p - Math.ceil(Math.max(0, longest - widthIn) / 0.2) * 2)
}

/** pptx 里 XML 1.0 不能出现的控制字符（会直接让文件损坏），全角空格必须原样留着 */
function safe(text: unknown): string {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
}

/** 学生问题：朱红 + 宋体，一眼能看出「这句是要我想的」 */
function isQuestion(text: string): boolean {
  return /[？?]/.test(text)
}

export interface PptxResult {
  pages: number
}

/** 页面文字不合格时抛出——调用方（任务 #11）据此提示失败并给重试，绝不静默出片 */
export class PptxSlidesInvalidError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`学生版页面不合格：${problems.slice(0, 3).join('；')}`)
    this.name = 'PptxSlidesInvalidError'
    this.problems = problems
  }
}

/**
 * 生成学生版课堂 PPT 并触发下载。全程本地排版，不发任何网络请求。
 *
 * @param slides 学生版页面（`buildStudentSlides()` / `getBuiltinStudentSlides()` 的产物）；一页一张 slide
 * @param onProgress 每开始一页回调一次页码（1 起），按钮上显示「正在编排第 N 页」
 * @param fileName 缺省时用封面页课题：`《桂花雨》-课堂PPT.pptx`
 * @param theme 课件主题（缺省 = 墨与朱）。只决定六个色值，版式、字号、fit 策略一律不看它
 * @param opts.animated 缺省 true：这一页有场景就铺一张循环 GIF（在第 12 件之后，学生版与
 *   课件用的是同一套场景）；false = 一个媒体文件都不插，给放不了动图、要打印的场合。
 *   没有场景的页两版完全一样——「没有」就是没有，不补假动作。
 * @throws {PptxSlidesInvalidError} slides 为空，或 `validateSlides()` 查出任何 problems
 *   （禁词、正文超当前密度上限、缺问句、空备注、页数越界、items 超上限）。
 *   校验用 `opts.limits`——调用方必须将「生成这一叠时用的那一档」递进来，否则缺省是三档
 *   并集 ENVELOPE（clip 的 10–14 页），一整节课的 22–28 页会被误拒。这是第二道防线：
 *   数据层已合规，一旦命中说明上游生成坏了。
 *   语义是「必须让人看见并处理」——调用方要显示原因并给重试按钮，不许 catch 后静默降级成教案。
 */
export async function downloadPptx(
  slides: StudentSlide[],
  onProgress?: (page: number) => void,
  fileName?: string,
  theme?: DeckTheme,
  opts?: PptxOptions
): Promise<PptxResult> {
  const list = Array.isArray(slides) ? slides : []
  // 按这一叠自己的档位校验：lesson 的 22–28 页不能被 clip 的 10–14 误拒（第二十轮）
  const check = validateSlides(list, opts?.limits ?? ENVELOPE)
  if (!check.ok) throw new PptxSlidesInvalidError(check.problems)

  // 色板在这一次生成的入口处算定，往下逐页传下去——不挂在模块变量上，
  // 免得两次导出交错时后一次把前一半页的颜色换掉。
  // 封面页吃封面纸（paletteOf 的 kind='cover'），与网页演示 / PPT 预览层三处同源。
  const themeIn = theme ?? DEFAULT_THEME
  const animated = opts?.animated !== false

  const { default: PptxGen } = await import('pptxgenjs')
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = '一课三稿'
  const topic = deckTopic(list)
  pptx.title = `${topic}｜课堂 PPT`

  for (let i = 0; i < list.length; i++) {
    const slide = list[i]
    // 逐页让出主线程，按钮上才能看到「正在编排第 N 页」
    if (onProgress) {
      onProgress(i + 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 30))
    }
    drawSlide(
      pptx,
      slide,
      i,
      list.length,
      topic,
      paletteOf(themeIn, slide.kind),
      animated && isSceneKind(slide.scene) ? slide.scene : '',
      // 底景：每页一层「地方」，按**这张纸的性格**挑、按页序轮换（backdrop.ts）
      // 入参是纸色而不是主题 id：AI 现配的纸 id 是 `ai:#475332`，按 id 查表永远查不到
      backdropFor(paperOf(themeIn, slide.kind), i, slide.kind)
    )
  }

  await pptx.writeFile({ fileName: fileName ?? `《${topic}》-课堂PPT.pptx` })
  return { pages: list.length }
}

/** 给界面用：不生成文件，只算页数，用于按钮上的「共 N 页」 */
export function countPptxPages(slides: StudentSlide[]): number {
  return Array.isArray(slides) ? slides.length : 0
}

/** 封面页课题当页脚与文件名；没有封面页就退到第一页标题 */
function deckTopic(slides: StudentSlide[]): string {
  const cover = slides.find((s) => s.kind === 'cover') ?? slides[0]
  return safe(cover?.title).replace(/[《》\s]/g, '') || '课堂PPT'
}

type Pptx = InstanceType<typeof import('pptxgenjs').default>

/* ------------------------- 单页排版 ------------------------- */

function drawSlide(
  pptx: Pptx,
  s: StudentSlide,
  i: number,
  total: number,
  topic: string,
  pal: DeckPalette,
  /** 这一页的场景：非空就铺一张透明 GIF，铺在文字下面 */
  scene: SceneKind | '' = '',
  /** 这一页的底景（backdrop.ts）：铺在纸色之上、GIF 与文字之下 */
  bg?: Backdrop
): void {
  const slide = pptx.addSlide()
  slide.background = { color: pal.PAPER }
  if (bg) drawBackdrop(pptx, slide, pal, bg)
  if (scene) slide.addImage({ data: sceneDataUrl(scene), x: 0, y: 0, w: W, h: H })

  // 原文页（TASKS/19a）：一句话占一页，没有标题、条目、图位。
  // 放在插画分支之前：这一页永远不画图，插画版式会把句子挤进窄栏。
  if (s.kind === 'quote') {
    cornerLabel(slide, pal, s.kind)
    drawQuotePage(slide, pal, s)
    footer(slide, pal, topic, i, total)
    slide.addNotes(safe(s.notes) || '（本页无备注）')
    return
  }

  // 有插画就走「图 + 文」两栏版式（图在哪边由第二遍定）；没图一个字不改
  const art = typeof s.illustration === 'string' && s.illustration.startsWith('data:image/') ? s.illustration : ''
  if (art) {
    drawIllustrated(slide, pal, s, art, topic, i, total, s.artSide === 'left' ? 'left' : 'right')
    slide.addNotes(safe(s.notes) || '（本页无备注）')
    return
  }

  const cover = s.kind === 'cover'
  const figW = s.imageHint ? FIGURE_W : 0
  const bodyW = figW ? CW - figW - 0.42 : CW

  cornerLabel(slide, pal, s.kind)
  drawTitle(slide, pal, s, cover, bodyW)
  drawRule(slide, pal, cover)
  // 无画的页也必须有一个版式（TASKS/12 §三）：没导演计划时 s.layout 为空，这一行等于没做
  if (s.layout) drawStudentLayout(slide, s.layout, pal)

  switch (s.kind) {
    case 'words':
      drawWords(slide, pal, s, bodyW)
      break
    case 'compare':
      drawCompare(slide, pal, s, bodyW)
      break
    case 'board':
      drawBoard(slide, pal, s, bodyW)
      break
    case 'homework':
      drawHomework(slide, pal, s, bodyW)
      break
    case 'drill':
      drawDrill(slide, pal, s, bodyW)
      break
    case 'end':
      drawEnd(slide, pal, s, bodyW)
      break
    default:
      drawStack(slide, pal, s, bodyW)
      break
  }

  if (s.imageHint) drawFigure(slide, pal)

  footer(slide, pal, topic, i, total)
  slide.addNotes(safe(s.notes) || '（本页无备注）')
}

type Slide = ReturnType<Pptx['addSlide']>

/**
 * 插画页（TASKS/11 §七 + 12 §三）：一张 16:9 的图铺在一侧，标题与正文压在另一侧窄栏。
 * 坐标、字号、行距全部取自 ART_* 常量与 artBox(side)；预览层吃同一套数，两边不许各自估。
 */
function drawIllustrated(
  slide: Slide,
  pal: DeckPalette,
  s: StudentSlide,
  art: string,
  topic: string,
  i: number,
  total: number,
  side: 'left' | 'right'
): void {
  const at = artBox(side)
  slide.addImage({ data: art, x: at.art, y: ART_Y, w: ART_W, h: ART_H })

  // 分类小字让到标题上方，不压标题（§七 标题从 y 0.70 起）
  slide.addText(`${SLIDE_LABELS[s.kind]}　`, {
    x: at.title,
    y: ART_LABEL_Y,
    w: ART_TITLE_W,
    h: 0.3,
    fontFace: SANS,
    fontSize: DECOR_PT,
    color: pal.CINNABAR,
    charSpacing: 3,
    valign: 'middle',
  })

  const title = safe(s.title)
  slide.addText(title, {
    x: at.title,
    y: ART_TITLE_Y,
    w: ART_TITLE_W,
    h: ART_TITLE_H,
    fontFace: SERIF,
    fontSize: fitPt([title], ART_TITLE_PT, ART_TITLE_FLOOR, ART_TITLE_W - 0.1),
    color: pal.INK,
    align: 'left',
    valign: 'middle',
    wrap: true,
    fit: 'shrink',
  })

  const items = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const runs = items.map((t) => ({
    text: t,
    options: { breakLine: true, fontFace: SANS, fontSize: ART_BODY_PT, color: pal.INK },
  }))
  if (line) {
    runs.push({
      text: line,
      options: {
        breakLine: true,
        fontFace: SERIF,
        fontSize: ART_BODY_PT,
        color: isQuestion(line) ? pal.CINNABAR : pal.INK,
      },
    })
  }
  if (runs.length > 0) {
    slide.addText(runs, {
      x: at.body,
      y: ART_BODY_Y,
      w: ART_BODY_W,
      h: ART_BODY_H,
      align: 'left',
      valign: 'top',
      lineSpacing: ART_LINE_SPACING,
      fit: 'shrink',
    })
  }

  footer(slide, pal, topic, i, total)
}

/**
 * 底景落地：一张纸上的「地方」——远山、坡、树、屋、石阶、云。
 *
 * 全是原生形状，不是图片：老师在后改得动、文件只大几 KB、投影上不会糊。
 * 颜色由 shapeColor 从纸色与墨色混出来（6% / 10% / 16%），所以换哪张纸，
 * 底景自动跟着走，不会出现「秋江纸配雪原灰线」。
 */
function drawBackdrop(pptx: Pptx, slide: Slide, pal: DeckPalette, bg: Backdrop): void {
  const paper = `#${pal.PAPER}`
  const ink = `#${pal.INK}`
  const accent = `#${pal.CINNABAR}`
  const fill = (v: string) => v.replace('#', '').toUpperCase()
  for (const s of bg.shapes) {
    const type =
      s.k === 'tri' ? pptx.ShapeType.triangle : s.k === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect
    const color = fill(shapeColor(s, paper, ink, accent))
    slide.addShape(type, {
      x: s.x * W,
      y: s.y * H,
      w: s.w * W,
      h: s.h * H,
      fill: { color },
      line: { color, width: 0 },
    })
  }
}

/** 单行文本框的默认高度（英寸）：字号换算成行高，再加一点呼吸 */
function lineH(pt: number, spacing = 1.5): number {
  return (pt / 72) * spacing + 0.16
}

/**
 * 条目纵向步长反算（任务 #5）：定步长写死后，items 放宽到 5/6 条会把后面的条目
 * 顶到页高之外或压住页脚。这里按条目数把步长压到「(版心下界 − 起始 y) / 条数」以内，
 * 保证每条都落在版心里；下限 0.24in 兜住极端条数不至于挤成 0。自然步长够小时照用自然步长。
 */
function vertStride(start: number, bottom: number, n: number, natural: number): number {
  if (n <= 1) return natural
  return Math.max(0.24, Math.min(natural, (bottom - start) / n))
}

/** 行数越多、行间距越紧，但不会紧到挤成一坑 */
function spacingFor(lineCount: number): number {
  return lineCount <= 3 ? 1.6 : lineCount <= 4 ? 1.4 : 1.25
}

/** 一堆行在给定区域里垂直居中，顶不越线、底不压页脚 */
function layoutBlock(lineCount: number, pt: number, top: number, bottom: number, spacing = 1.5): { y: number; h: number } {
  const h = Math.max(lineH(pt, spacing), lineCount * lineH(pt, spacing))
  const area = Math.max(0, bottom - top)
  return { y: top + Math.max(0, (area - h) / 2), h: Math.min(h, area) }
}

/**
 * 原文页（TASKS/19a §2.6）：一句课文原句，居中偏上，首字前一道朱红竖杠。
 * 不加框、不加底纹、不加图标——这一页只有句子本身。
 * 「」直接写进字符串，不画引号图形；整句同色，不许局部变色。
 * 字号按句长三档，行距 1.6；note 在右下，没有就不画。
 */
const QUOTE_TOP = BODY_TOP + 0.35
const QUOTE_W = CW * 0.86
const QUOTE_BAR_W = 0.06
const QUOTE_GAP = 0.24
const QUOTE_PT = [40, 32, 26] as const

function drawQuotePage(slide: Slide, pal: DeckPalette, s: StudentSlide): void {
  const quote = `「${safe(s.text) || safe(s.title)}」`
  const chars = Array.from(quote).length
  const pt = chars <= 20 ? QUOTE_PT[0] : chars <= 34 ? QUOTE_PT[1] : QUOTE_PT[2]
  const x = M + (CW - QUOTE_W) / 2
  const lineH = (pt * 1.6) / 72
  const barH = (pt * 1.1) / 72

  // 竖杠：高 = 字号 × 1.1，与首行文字垂直居中
  slide.addShape('rect', {
    x: x - QUOTE_GAP - QUOTE_BAR_W,
    y: QUOTE_TOP + (lineH - barH) / 2,
    w: QUOTE_BAR_W,
    h: barH,
    fill: { color: pal.CINNABAR },
    line: { color: pal.CINNABAR, width: 0 },
  })

  slide.addText(quote, {
    x,
    y: QUOTE_TOP,
    w: QUOTE_W,
    h: BODY_BOTTOM - QUOTE_TOP,
    fontFace: SERIF,
    fontSize: pt,
    color: pal.INK,
    align: 'left',
    valign: 'top',
    wrap: true,
    charSpacing: 1,
    lineSpacingMultiple: 1.6,
  })

  const note = safe(s.note)
  if (note) {
    slide.addText(note, {
      x: W - M - 3,
      y: BODY_BOTTOM - 0.34,
      w: 3,
      h: 0.3,
      fontFace: SANS,
      fontSize: 14,
      // DeckPalette 没有 MUTED：纸墨第三档灰就是 INK3，页脚小字同色
      color: INK3,
      align: 'right',
      valign: 'middle',
    })
  }
}

/** 左上角分类小字 + 朱点：页面装饰，字号固定 */
function cornerLabel(slide: Slide, pal: DeckPalette, kind: StudentSlideKind): void {
  slide.addText(`${SLIDE_LABELS[kind]}　`, {
    x: M,
    y: LABEL_Y,
    w: CW,
    h: 0.36,
    fontFace: SANS,
    fontSize: DECOR_PT,
    color: pal.CINNABAR,
    charSpacing: 3,
    valign: 'middle',
  })
}

function drawTitle(slide: Slide, pal: DeckPalette, s: StudentSlide, cover: boolean, bodyW: number): void {
  const title = safe(s.title)
  if (cover) {
    slide.addText(title, {
      x: M,
      y: COVER_TITLE_Y,
      w: CW,
      h: 1.25,
      fontFace: SERIF,
      fontSize: ptFloor(SLIDE_POINTS.coverTitle, SLIDE_POINTS.coverTitle),
      color: pal.INK,
      align: 'left',
      valign: 'middle',
      wrap: true,
      charSpacing: 2,
      fit: 'shrink',
    })
    return
  }
  const size = fitPt([title], SLIDE_POINTS.titleMin + 6, SLIDE_POINTS.titleMin, bodyW - 0.1)
  slide.addText(title, {
    x: M,
    y: TITLE_Y,
    w: bodyW,
    h: TITLE_H,
    fontFace: SERIF,
    fontSize: size,
    color: pal.INK,
    align: 'left',
    valign: 'middle',
    wrap: true,
    fit: 'shrink',
  })
}

/** 标题下的线：封面是朱红短杠，其余是纸线通栏（细实线，不是色块） */
function drawRule(slide: Slide, pal: DeckPalette, cover: boolean): void {
  slide.addShape('rect', {
    x: M,
    y: cover ? COVER_RULE_Y : RULE_Y,
    w: cover ? 2.2 : CW,
    h: 0.028,
    fill: { color: cover ? pal.CINNABAR : pal.LINE },
    line: { color: cover ? pal.CINNABAR : pal.LINE, width: 0 },
  })
}

/** 一行一个文本块的通用落位：问题行自动转朱红宋体 */
type StackLine = { text: string; pt: number; serif?: boolean; accent?: boolean; gap?: number }

function drawLines(slide: Slide, pal: DeckPalette, lines: StackLine[], boxW: number, top: number, boxH: number, spacing = 1.5): void {
  const runs = lines.map((l) => ({
    text: l.text,
    options: {
      breakLine: true,
      fontFace: l.serif ? SERIF : SANS,
      fontSize: l.pt,
      color: l.accent ? pal.CINNABAR : pal.INK,
    },
  }))
  if (runs.length === 0) return
  slide.addText(runs, {
    x: M,
    y: top,
    w: boxW,
    h: boxH,
    color: pal.INK,
    align: 'left',
    valign: 'top',
    lineSpacingMultiple: spacing,
    fit: 'shrink',
  })
}

/** cover / hook / goals / close-read / 兜底：条目在上，问句在下，大片留白。
 * 封面只多一个差别：正文从朱红短杠下方起排，页面上没有任何信息条。 */
function drawStack(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const items = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const bodyPt = fitPt(
    [...items, line],
    SLIDE_POINTS.bodyMin + 4,
    SLIDE_POINTS.bodyMin,
    bodyW - 0.1
  )
  const lines: StackLine[] = items.map((t) => ({
    text: t,
    pt: bodyPt,
    serif: isQuestion(t),
    accent: isQuestion(t),
  }))
  if (line) lines.push({ text: line, pt: bodyPt, serif: true, accent: isQuestion(line) })

  const top = s.kind === 'cover' ? COVER_BODY_TOP : BODY_TOP
  const spacing = spacingFor(lines.length)
  const box = layoutBlock(lines.length, bodyPt, top, BODY_BOTTOM, spacing)
  drawLines(slide, pal, lines, bodyW, box.y, box.h, spacing)
}

/** 字词页 54pt 每行的行盒高（英寸）。取 >0.9in，真机 CJK 行高也落得进，
 * PowerPoint 就不会用 normAutofit 把 54pt 压到线下——声明字号 == 渲染字号。 */
const WORDS_LINE_IN = 0.93
/** 词行整块与下方问句行之间的空隙 */
const WORDS_GAP = 0.06

/**
 * 字词页：一个词一行、54pt 顶格，绝不走 fit:'shrink'（不写 <a:normAutofit/>）。
 * 词数上限已在数据层收成 WORDS_MAX=4，4 词 × 0.93in = 3.72in，落在 BODY_TOP 与页脚之间；
 * 每个 ≥54pt 词行都分到时 ≥0.9in 的行盒高，真机不缩（任务 #4）。
 * 问句是页面提示不是字词，单独一条 24pt 小字行排在词块下方，不占用 54pt 行高预算。
 */
function drawWords(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const words = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const wordPt = ptFloor(SLIDE_POINTS.wordsMin, SLIDE_POINTS.wordsMin) // 恒等于 54，不降
  const wordsH = words.length * WORDS_LINE_IN
  if (words.length) {
    slide.addText(
      words.map((t) => ({
        text: t,
        options: { breakLine: true, fontFace: SANS, fontSize: wordPt, color: pal.INK },
      })),
      {
        x: M,
        y: BODY_TOP,
        w: bodyW,
        h: wordsH,
        align: 'left',
        valign: 'top',
        lineSpacingMultiple: 1.0,
      }
    )
  }
  if (line) {
    const askPt = ptFloor(SLIDE_POINTS.bodyMin, SLIDE_POINTS.bodyMin)
    slide.addText(line, {
      x: M,
      y: BODY_TOP + wordsH + WORDS_GAP,
      w: bodyW,
      h: lineH(askPt, 1.2),
      fontFace: SERIF,
      fontSize: askPt,
      color: pal.CINNABAR,
      align: 'left',
      valign: 'top',
    })
  }
}

/** 对比页：左右两栏，中间一条纸色竖线，绝不让两件事挤成一坨 */
function drawCompare(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const items = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const colGap = 0.5
  const colW = (bodyW - colGap) / 2
  const left = items.filter((_, i) => i % 2 === 0)
  const right = items.filter((_, i) => i % 2 === 1)
  const colPt = fitPt([...left, ...right], SLIDE_POINTS.bodyMin + 6, SLIDE_POINTS.bodyMin, colW - 0.1)

  ;[left, right].forEach((col, ci) => {
    if (col.length === 0) return
    slide.addText(
      col.map((t) => ({ text: t, options: { breakLine: true } })),
      {
        x: M + ci * (colW + colGap),
        y: BODY_TOP + 0.14,
        w: colW,
        h: 2.6,
        fontFace: SANS,
        fontSize: colPt,
        color: pal.INK,
        align: 'center',
        valign: 'top',
        lineSpacingMultiple: 1.5,
        fit: 'shrink',
      }
    )
  })

  slide.addShape('rect', {
    x: M + colW + colGap / 2 - 0.015,
    y: BODY_TOP + 0.24,
    w: 0.03,
    h: 2.3,
    fill: { color: pal.LINE },
    line: { color: pal.LINE, width: 0 },
  })

  if (line) {
    const askPt = ptFloor(SLIDE_POINTS.bodyMin, SLIDE_POINTS.bodyMin)
    slide.addText(line, {
      x: M,
      y: BODY_TOP + 2.98,
      w: bodyW,
      h: 0.9,
      fontFace: SERIF,
      fontSize: askPt,
      color: pal.CINNABAR,
      align: 'center',
      valign: 'middle',
      fit: 'shrink',
    })
  }
}

/** 板书页：只放大字的主线，不把整张板书 ASCII 图搬上屏 */
function drawBoard(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const items = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const boardPt = fitPt(items, SLIDE_POINTS.bodyMin + 12, SLIDE_POINTS.bodyMin, bodyW - 0.2)

  // 步长反算：底部那行问句占了 BODY_BOTTOM−1.0 以下，条目只能在它上方排；无问句时排满到 BODY_BOTTOM。
  const boardTop = BODY_TOP + 0.24
  const boardNatural = lineH(boardPt, 1.35)
  const boardStride = vertStride(boardTop, line ? BODY_BOTTOM - 1.0 : BODY_BOTTOM, items.length, boardNatural + 0.14)

  items.forEach((text, idx) => {
    const parts = text.split(/(→|—|>)/).map((p) => p.trim()).filter(Boolean)
    const runs = parts.flatMap((p, j) => {
      const arrow = /^(→|—|>)$/.test(p)
      return [
        {
          text: j === 0 ? p : arrow ? ` ${p} ` : p,
          options: {
            fontFace: arrow ? SANS : SERIF,
            fontSize: arrow ? Math.max(ptFloor(SLIDE_POINTS.bodyMin, SLIDE_POINTS.bodyMin), boardPt * 0.8) : boardPt,
            color: arrow ? INK3 : pal.INK,
            bold: !arrow,
          },
        },
      ]
    })
    slide.addText(runs, {
      x: M,
      y: boardTop + idx * boardStride,
      w: bodyW,
      h: Math.min(boardNatural, boardStride),
      align: 'center',
      valign: 'middle',
      fit: 'shrink',
    })
  })

  if (line) {
    const askPt = ptFloor(SLIDE_POINTS.bodyMin, SLIDE_POINTS.bodyMin)
    slide.addText(line, {
      x: M,
      y: BODY_BOTTOM - 1.0,
      w: bodyW,
      h: 0.8,
      fontFace: SERIF,
      fontSize: askPt,
      color: pal.CINNABAR,
      align: 'center',
      valign: 'middle',
      fit: 'shrink',
    })
  }
}

/** 练一练：题干在上，下面整片留白给黑板或口头填；全角空格（　）原样保留 */
function drawDrill(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const items = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const stemPt = fitPt(items, SLIDE_POINTS.bodyMin + 4, SLIDE_POINTS.bodyMin, bodyW - 0.2)
  const askPt = ptFloor(SLIDE_POINTS.bodyMin, SLIDE_POINTS.bodyMin)

  if (line) {
    slide.addText(line, {
      x: M,
      y: BODY_TOP + 0.14,
      w: bodyW,
      h: 0.86,
      fontFace: SERIF,
      fontSize: askPt,
      color: pal.CINNABAR,
      align: 'left',
      valign: 'middle',
      fit: 'shrink',
    })
  }
  // 题干在顶部，条目从 BODY_TOP+1.28 往下排；步长反算到 BODY_BOTTOM，防 5/6 条出画。
  const drillTop = BODY_TOP + 1.28
  const drillNatural = lineH(stemPt, 1.4)
  const drillStride = vertStride(drillTop, BODY_BOTTOM, items.length, drillNatural + 0.26)
  items.forEach((text, idx) => {
    slide.addText(text, {
      x: M,
      y: drillTop + idx * drillStride,
      w: bodyW,
      h: Math.min(drillNatural, drillStride),
      fontFace: SANS,
      fontSize: stemPt,
      color: pal.INK,
      align: 'left',
      valign: 'middle',
      wrap: true,
      fit: 'shrink',
    })
  })
}

/** 作业页：必做／选做各一行，标签朱红、内容墨色 */
function drawHomework(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const items = (s.items ?? []).map((t) => safe(t)).filter(Boolean)
  const line = safe(s.line)
  const itemPt = fitPt(items, SLIDE_POINTS.bodyMin + 4, SLIDE_POINTS.bodyMin, bodyW - 0.2)

  // 底部问句占 BODY_BOTTOM−1.12 以下，条目步长反算到它上方；无问句时排满到 BODY_BOTTOM。
  const hwTop = BODY_TOP + 0.24
  const hwNatural = lineH(itemPt, 1.4)
  const hwStride = vertStride(hwTop, line ? BODY_BOTTOM - 1.12 : BODY_BOTTOM, items.length, hwNatural + 0.3)

  items.forEach((raw, idx) => {
    const at = raw.search(/[｜|：:]/)
    const head = at > 0 ? raw.slice(0, at) : ''
    const tail = at > 0 ? raw.slice(at + 1).trim() : raw
    const runs = head
      ? [
          { text: `${head}　`, options: { fontFace: SANS, fontSize: itemPt, color: pal.CINNABAR, bold: true } },
          { text: tail, options: { fontFace: SANS, fontSize: itemPt, color: pal.INK } },
        ]
      : [{ text: tail, options: { fontFace: SANS, fontSize: itemPt, color: pal.INK } }]
    slide.addText(runs, {
      x: M,
      y: hwTop + idx * hwStride,
      w: bodyW,
      h: Math.min(hwNatural, hwStride),
      align: 'left',
      valign: 'middle',
      fit: 'shrink',
    })
  })

  if (line) {
    const askPt = ptFloor(SLIDE_POINTS.bodyMin, SLIDE_POINTS.bodyMin)
    slide.addText(line, {
      x: M,
      y: BODY_BOTTOM - 1.12,
      w: bodyW,
      h: 0.86,
      fontFace: SERIF,
      fontSize: askPt,
      color: pal.CINNABAR,
      align: 'center',
      valign: 'middle',
      fit: 'shrink',
    })
  }
}

/** 收尾页：就一句话，放大居中；永远不写「谢谢观看」那类客套 */
function drawEnd(slide: Slide, pal: DeckPalette, s: StudentSlide, bodyW: number): void {
  const line = safe(s.line) || safe(s.items?.[0])
  const endPt = fitPt([line], SLIDE_POINTS.coverTitle - 12, SLIDE_POINTS.bodyMin, bodyW - 0.4)
  slide.addShape('rect', {
    x: M,
    y: BODY_TOP + 0.74,
    w: 0.06,
    h: 1.55,
    fill: { color: pal.CINNABAR },
    line: { color: pal.CINNABAR, width: 0 },
  })
  slide.addText(line, {
    x: M + 0.42,
    y: BODY_TOP + 0.6,
    w: bodyW - 0.42,
    h: 1.85,
    fontFace: SERIF,
    fontSize: endPt,
    color: pal.INK,
    align: 'left',
    valign: 'middle',
    fit: 'shrink',
  })
}

/** 图位：只留一个空虚线框（TASKS/11 §七：成品里不许出现「图位」「去搜图」） */
function drawFigure(slide: Slide, pal: DeckPalette): void {
  slide.addShape('rect', {
    x: FIGURE_X,
    y: FIGURE_Y,
    w: FIGURE_W,
    h: FIGURE_H,
    fill: { color: pal.PAPER },
    line: { color: INK3, width: 1, dashType: 'dash' },
  })
}

/** 页脚：课题 + 页码，装饰小字 */
function footer(slide: Slide, pal: DeckPalette, topic: string, i: number, total: number): void {
  slide.addText(topic, {
    x: M,
    y: FOOT_Y,
    w: CW * 0.55,
    h: 0.3,
    fontFace: SANS,
    fontSize: DECOR_PT - 2,
    color: INK3,
  })
  slide.addText(`${i + 1} / ${total}`, {
    x: W - M - 1.6,
    y: FOOT_Y,
    w: 1.6,
    h: 0.3,
    fontFace: SANS,
    fontSize: DECOR_PT - 2,
    color: INK3,
    align: 'right',
  })
}

/* ================================================================== *
 * B. 课件导出（10 §七「手改的东西永远算用户的」）                       *
 *
 * 入参就是界面正在显示的那一叠 DeckPage：改过的标题 / 要点 / 提问 / 备注、 *
 * 用户插的页、用户删掉（已经不在数组里）的页，一并跟过去。一页 deck 一张       *
 * slide，页数、页序、文字全部以这份数组为准——不再从 plan 重新算。       *
 *
 * 不走 validateSlides：课件是给评课人读的，出现「教学目标」「设计意图」是     *
 * 对的，学生版那套禁词与密度上限不能拿来卡它。字号只守一条：正文 ≥14pt、    *
 * 标题 ≥20pt，投影上看得清。                                            *
 * ================================================================== */

/** 课件页数（按钮上的「共 N 页」）；不生成文件 */
export function countDeckPages(pages: DeckPage[]): number {
  return Array.isArray(pages) ? pages.length : 0
}

const DECK_TITLE_PT = 30
const DECK_TITLE_FLOOR = 20
const DECK_BODY_PT = 18
const DECK_BODY_FLOOR = 14
const DECK_COVER_TITLE_PT = 40

/**
 * 按当前那一叠课件生成 .pptx 并触发下载。全程本地排版，不联网。
 *
 * @param pages 界面正在显示的 DeckPage[]（含用户手改与插删后的结果）
 * @param fileName 缺省用封面标题：《桂花雨》-课件.pptx
 */
export async function downloadDeckPptx(
  pages: DeckPage[],
  onProgress?: (page: number) => void,
  fileName?: string,
  theme?: DeckTheme,
  opts?: DeckPptxOptions
): Promise<PptxResult> {
  const list = (Array.isArray(pages) ? pages : []).filter(Boolean)
  if (list.length === 0) throw new Error('课件一页都没有，导不出东西。')

  const animated = opts?.animated !== false
  const pal = paletteOf(theme ?? DEFAULT_THEME)
  const { default: PptxGen } = await import('pptxgenjs')
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = '一课三稿'
  const topic = deckTopicOf(list)
  pptx.title = `${topic}｜课件`

  for (let i = 0; i < list.length; i++) {
    if (onProgress) {
      onProgress(i + 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 30))
    }
    // 封面那一页换成封面纸：与纸片区、网页演示、预览层吃的是同一条规则（theme.paperOf）
    // 场景只在「带动态」那版插：静态版必须与旧版一样干净，一个媒体文件都没有。
    const scene: SceneKind | '' = animated && isSceneKind(list[i].scene) ? (list[i].scene as SceneKind) : ''
    drawDeckPage(
      pptx,
      list[i],
      i,
      list.length,
      topic,
      paletteOf(theme ?? DEFAULT_THEME, list[i].kind),
      pal,
      scene,
      backdropFor(paperOf(theme ?? DEFAULT_THEME, list[i].kind), i, list[i].kind)
    )
  }

  await pptx.writeFile({ fileName: fileName ?? `《${topic}》-课件.pptx` })
  return { pages: list.length }
}

function deckTopicOf(pages: DeckPage[]): string {
  const cover = pages.find((p) => p.kind === 'cover') ?? pages[0]
  return safe(cover?.title).replace(/[《》\s]/g, '') || '课件'
}

/** 版式记号（10 §十三 第 8 件）：只在纸面上画一根线 / 一个框，不改字号与正文位置。
 * 目的是「每页至少一个视觉元素」，并且让整份导出和网页预览的五种版式对得上。 */
function drawLayoutMark(slide: Slide, layout: string | undefined, pal: DeckPalette): void {
  const top = BODY_TOP
  const h = BODY_BOTTOM - BODY_TOP
  if (layout === 'full') {
    slide.addShape('rect', {
      x: M, y: top, w: CW, h,
      fill: { color: pal.PAPER },
      line: { color: pal.LINE, width: 1, dashType: 'dash' },
    })
    return
  }
  if (layout === 'split') {
    slide.addShape('line', { x: M + CW / 2, y: top, w: 0, h, line: { color: pal.LINE, width: 1 } })
    return
  }
  if (layout === 'cards') {
    for (let k = 0; k < 2; k++) {
      slide.addShape('rect', {
        x: M + k * (CW / 2 + 0.18),
        y: top,
        w: CW / 2 - 0.18,
        h: Math.min(2.2, h),
        fill: { color: pal.PAPER },
        line: { color: pal.LINE, width: 1 },
      })
    }
    return
  }
  if (layout === 'timeline') {
    slide.addShape('line', { x: M + 0.1, y: top, w: 0, h, line: { color: pal.CINNABAR, width: 1 } })
    for (let k = 0; k < 3; k++) {
      slide.addShape('ellipse', {
        x: M + 0.03,
        y: top + (h / 4) * (k + 1),
        w: 0.14,
        h: 0.14,
        fill: { color: pal.CINNABAR },
        line: { color: pal.CINNABAR, width: 0 },
      })
    }
    return
  }
  if (layout === 'cloze') {
    slide.addShape('rect', {
      x: M, y: BODY_BOTTOM - 1.15, w: CW, h: 0.95,
      fill: { color: pal.PAPER },
      line: { color: pal.CINNABAR, width: 1, dashType: 'dash' },
    })
  }
}

/** 学生版五种版式：只在纸面上加一根线 / 一个框，不改字号与正文位置（与课件同一套做法）。
 * 整页版不加框——标题与通栏正文本身就是它，再加一个框反而像占位符。 */
function drawStudentLayout(slide: Slide, layout: string, pal: DeckPalette): void {
  if (layout === 'full') return
  drawLayoutMark(slide, layout, pal)
}

/** 一页课件 → 一张 slide：左上角分类字+时长、标题、通栏线、正文、问句、页脚，口播进备注 */
function drawDeckPage(
  pptx: Pptx,
  page: DeckPage,
  i: number,
  total: number,
  topic: string,
  pal: DeckPalette,
  /** 正文层用的主纸色板：封面页 pal 已是封面纸，但满幅框、时间轴这些不能跟着变成两张纸 */
  bodyPal: DeckPalette = pal,
  /** 这一页的场景：非空就铺一张透明 GIF（铺在文字下面） */
  scene: SceneKind | '' = '',
  /** 这一页的底景：纸色之上、GIF 与文字之下 */
  bg?: Backdrop
): void {
  const slide = pptx.addSlide()
  slide.background = { color: pal.PAPER }
  if (bg) drawBackdrop(pptx, slide, pal, bg)
  if (scene) {
    // 16:9 满幅铺满，GIF 自带透明背景，只在粒子处上色
    slide.addImage({ data: sceneDataUrl(scene), x: 0, y: 0, w: 13.333, h: 7.5 })
  }
  const cover = page.kind === 'cover'

  const label = safe(page.label) || '课件'
  slide.addText(page.duration ? `${label}　${safe(page.duration)}` : `${label}　`, {
    x: M,
    y: LABEL_Y,
    w: CW,
    h: 0.36,
    fontFace: SANS,
    fontSize: DECOR_PT,
    color: pal.CINNABAR,
    charSpacing: 3,
    valign: 'middle',
  })

  const title = safe(page.title) || '（无标题）'
  const titlePt = cover
    ? DECK_COVER_TITLE_PT
    : fitPt([title], DECK_TITLE_PT, DECK_TITLE_FLOOR, CW - 0.1)
  slide.addText(title, {
    x: M,
    y: cover ? COVER_TITLE_Y : TITLE_Y,
    w: CW,
    h: 1.25,
    fontFace: SERIF,
    fontSize: titlePt,
    color: pal.INK,
    align: 'left',
    valign: 'middle',
    wrap: true,
    fit: 'shrink',
  })

  // 与界面同一条规矩：封面是朱红短杠，其余是纸线通栏
  slide.addShape('rect', {
    x: M,
    y: cover ? COVER_RULE_Y : RULE_Y,
    w: cover ? 2.2 : CW,
    h: 0.028,
    fill: { color: cover ? pal.CINNABAR : pal.LINE },
    line: { color: cover ? pal.CINNABAR : pal.LINE, width: 0 },
  })

  const lines: StackLine[] = []
  for (const b of page.bullets ?? []) {
    const t = safe(b)
    if (t) lines.push({ text: `· ${t}`, pt: DECK_BODY_PT })
  }
  // 版式记号先画：它在正文下层，不抢字
  drawLayoutMark(slide, page.layout, bodyPal)

  // 教学准备页没有 bullets，三组内容按「组名 + 条目」平铺，不丢字段
  for (const g of page.prep ?? []) {
    lines.push({ text: safe(g.heading), pt: DECK_BODY_PT, serif: true })
    if (g.items.length === 0) lines.push({ text: '本课不需要', pt: DECK_BODY_FLOOR })
    for (const it of g.items) {
      const hint = it.searchHint ? `（检索：${safe(it.searchHint)}）` : ''
      lines.push({ text: `· ${safe(it.name)}${safe(it.usage)}${hint}`, pt: DECK_BODY_FLOOR })
    }
  }
  const q = safe(page.question)
  if (q) lines.push({ text: `问：${q}`, pt: DECK_BODY_PT, serif: true, accent: true })

  if (lines.length > 0) {
    const spacing = spacingFor(lines.length)
    const box = layoutBlock(
      lines.length,
      DECK_BODY_PT,
      cover ? COVER_BODY_TOP : BODY_TOP,
      BODY_BOTTOM,
      spacing
    )
    drawLines(slide, pal, lines, CW, box.y, box.h, spacing)
  }

  footer(slide, pal, topic, i, total)
  slide.addNotes(safe(page.notes) || '（本页无备注）')
}

/* ================================================================== *
 * C. 模板渲染（TASKS/20）                                              *
 *                                                                    *
 * 这一段只做一件事：把 place() 算好的 Placed[] 画到一张 pptx 纸上。    *
 * 版面常量全部住在 place.ts，这里一个坐标都不许自己算——预览层        *
 * （PptPreview）读的是同一份 Placed[]，两边差一个像素都算回归。        *
 *                                                                    *
 * 与 A 段（downloadPptx）并存不互相替代：A 段是旧的「按页型现排」，    *
 * 十几道老门禁还在读它；这一条是老师选模板之后真正走的那条路。        *
 * ================================================================== */

/** 模板色值 → pptx 的 6 位大写 HEX（不带 #） */
function tplHex(v: string): string {
  return String(v)
    .replace(/[^0-9a-fA-F]/g, '')
    .slice(0, 6)
    .toUpperCase()
}

/**
 * 一份 Placed[] → 一张 slide。
 *
 * 顺序就是数组顺序（place() 已按「底纹 → 插画 → 字 → 线」排好层），
 * 所以这里不排序、不做二次布局。
 * 字号用 pt 直接给——模板自己的字号已经定死，**不再**过 ptFloor() 那套全局下限；
 * 字体映射 song → 宋体、kai → 楷体、hei → 苹方-简。
 */
export function renderPlaced(slide: Slide, placed: readonly Placed[], theme: TemplateTheme): void {
  slide.background = { color: tplHex(theme.paper) }

  for (const p of placed) {
    const box = { x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H }

    // 细线也用 rect 画：pptx 的 line 形状在零宽 / 零高上不可靠，导出后可能整条消失
    if (p.kind === 'rect' || p.kind === 'line') {
      const color = tplHex(p.fill ?? theme.surface)
      // 圆角块走 roundRect：rectRadius 单位是英寸（1pt = 1/72in），与预览同一个半径
      const rounded = (p.radius ?? 0) > 0
      slide.addShape(rounded ? 'roundRect' : 'rect', {
        ...box,
        ...(rounded ? { rectRadius: (p.radius ?? 0) / 72 } : {}),
        fill: { color, transparency: p.opacity === undefined ? 0 : Math.round((1 - p.opacity) * 100) },
        line: { color, width: 0 },
      })
      continue
    }

    if (p.kind === 'ellipse') {
      /* 椭圆：钢印的叶片、商务蓝封面的圆点。转角度原封不动交给 pptx，与预览同一个值 */
      const color = tplHex(p.fill ?? theme.surface)
      slide.addShape('ellipse', {
        ...box,
        rotate: p.rotate ?? 0,
        fill: { color, transparency: p.opacity === undefined ? 0 : Math.round((1 - p.opacity) * 100) },
        line: { color, width: 0 },
      })
      continue
    }

    if (p.kind === 'image') {
      if (p.data) slide.addImage({ data: p.data, ...box })
      continue
    }

    const body = String(p.text ?? '')
    if (!body) continue
    slide.addText(body, {
      ...box,
      fontFace: FONT_FACE[p.font ?? theme.fontBody],
      fontSize: p.size ?? 18,
      color: tplHex(p.color ?? theme.ink),
      bold: Boolean(p.bold),
      align: p.align ?? 'left',
      valign: p.valign ?? 'top',
      lineSpacingMultiple: p.lineHeight ?? 1.3,
      // 预览的文本框没有内边距，导出也不留：pptxgenjs 默认 0.05in 的内缩
      // 会让同一行字在成品里比预览里往右挪一点，「预览 = 成品」就不成立
      inset: 0,
      wrap: true,
    })
  }
}

/**
 * 按老师选的那套模板出片：全程本地排版，不发任何网络请求、不看时间。
 *
 * @param slides 学生版页面（与预览、网页演示是同一个数组）
 * @param template 四套模板之一（`templateOf(id)` 的产物）
 * @param opts.limits 按这一叠自己的档校验，缺省三档并集（与 downloadPptx 同口径）
 * @param opts.animated 有场景的页插一张循环 GIF；false = 一个媒体文件都不插
 */
export async function downloadTemplatedPptx(
  slides: StudentSlide[],
  template: TemplateTheme,
  onProgress?: (page: number) => void,
  fileName?: string,
  opts?: PptxOptions
): Promise<PptxResult> {
  const list = Array.isArray(slides) ? slides : []
  const check = validateSlides(list, opts?.limits ?? ENVELOPE)
  if (!check.ok) throw new PptxSlidesInvalidError(check.problems)

  const animated = opts?.animated !== false
  const { default: PptxGen } = await import('pptxgenjs')
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = '一课三稿'
  const topic = deckTopic(list)
  pptx.title = `${topic}｜${template.name}`

  // 底景也要跟着模板的纸走（TASKS/17：底色不许是纯色死块）
  const pal: DeckPalette = {
    PAPER: tplHex(template.paper),
    INK: tplHex(template.ink),
    INK2: tplHex(template.muted),
    CINNABAR: tplHex(template.accent),
    LINE: tplHex(template.line),
  }

  for (let i = 0; i < list.length; i++) {
    const page = list[i]
    if (onProgress) {
      onProgress(i + 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 30))
    }
    const slide = pptx.addSlide()
    drawBackdrop(pptx, slide, pal, backdropFor(template.paper, i, page.kind))
    if (animated && isSceneKind(page.scene)) {
      slide.addImage({ data: sceneDataUrl(page.scene), x: 0, y: 0, w: W, h: H })
    }
    renderPlaced(slide, place(page, template), template)

    // 页脚：课题 + 页码。槽位与预览层同一个常量（FOOT_SLOT），装饰小字。
    // 封面例外（TASKS/20b §2.2⑥）：这一页是一整张画，页脚与页码都不许压上去。
    if (page.kind !== 'cover') {
      slide.addText(topic, {
        x: FOOT_SLOT.left.x * W,
        y: FOOT_SLOT.left.y * H,
        w: FOOT_SLOT.left.w * W,
        h: FOOT_SLOT.left.h * H,
        fontFace: FONT_FACE[template.fontBody],
        fontSize: 9,
        color: tplHex(template.muted),
      })
      slide.addText(`${i + 1} / ${list.length}`, {
        x: FOOT_SLOT.right.x * W,
        y: FOOT_SLOT.right.y * H,
        w: FOOT_SLOT.right.w * W,
        h: FOOT_SLOT.right.h * H,
        fontFace: FONT_FACE[template.fontBody],
        fontSize: 9,
        color: tplHex(template.muted),
        align: 'right',
      })
    }
    slide.addNotes(safe(page.notes) || '（本页无备注）')
  }

  await pptx.writeFile({ fileName: fileName ?? `《${topic}》-课堂PPT.pptx` })
  return { pages: list.length }
}
