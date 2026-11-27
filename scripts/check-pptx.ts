/**
 * 任务 07 的总校验入口：把「学生版课堂 PPT 合不合规」变成可重复执行的量化证据。
 *
 * 分四段跑，任何一段不过就非零退出：
 *   A 数据层——直接复用 scripts/check-lib.ts（与 check-slides.ts 同一套标准，不重复实现）
 *   B 无 Key 确定性——fetch 打桩成不可达，断言照样出 10 页（TASKS/13：没 key 走同源代理，不再要求零请求）
 *   C 真出片 + zip 取证——node 下用仓库已装的 pptxgenjs 调 downloadPptx()（.pptx 只写 /tmp），
 *     再用系统 unzip 逐页读 slideN.xml / notesSlideN.xml，量出页数、备注、
 *     字号（sz，百分之一磅）、禁词、纸与墨硬约束
 *   D 校验器自检——拿合成 XML 故意为难它，确认 C 段那些 ✓ 不是空转
 *
 * 字号取证的排除规则（与 src/lib/pptx.ts 的注释一一对应）：
 *   每页文本框按出现顺序，第 1 个是左上角分类字（11pt）、最后 2 个是页脚（9pt）、
 *   含「图位」二字的是检索词框（10.5pt）——这三类是页面装饰，不参与 40/24/54 下限判定；
 *   其余文本框：标题 ≥40pt（封面 =48pt）、正文 ≥24pt、字词页词行 ≥54pt。
 *   取 sz 前先删掉 <a:endParaRPr/>，否则段落末行会把字号统计虚高。
 *
 * 跑法：npm run check——
 *   = tsc 先把 scripts/ 本身编一遍（tsconfig.json 只 include src，
 *     所以这份脚本早先 import 错了路、签名也停在旧版，一直没人发现）→ esbuild 打包 → node 跑 → 删掉仓库里的 .mjs
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { downloadPptx, paletteOf, PptxSlidesInvalidError } from '../src/lib/pptx'
import { DEFAULT_THEME } from '../src/lib/theme'
import { schemeFromJSON } from '../src/lib/scheme'
import {
  DENSITY,
  DENSITY_ORDER,
  WORDS_ITEMS_MAX,
  limitsOf,
  type Density,
  type DensityLimits,
} from '../src/lib/density'
import {
  bodyCharCount,
  countVisibleChars,
  getBuiltinStudentSlides,
  normalizeSlides,
  pageVisibleText,
  validateSlides,
  type StudentSlide,
} from '../src/lib/slides'
import { planForScale } from '../src/data/lesson'
import { chineseOnlyHits, subjectKeyOf } from '../src/lib/subject'
import { limitsFor, slideRangeFor } from '../src/lib/scale'
import { scanVoice } from '../src/lib/voice'
import {
  CASES,
  DECK_PAGES_EXPECT,
  DECK_PAGES_RANGE,
  FORBIDDEN_WORDS,
  POINT_FLOOR,
  SLIDES_PAGES_EXPECT,
  SLIDES_PAGES_RANGE,
  checkLongTopic,
  checkNoKeyDeterminism,
  collectDataChecks,
  collectDensityChecks,
  collectInteractionChecks,
  collectThemeChecks,
  errMsg,
  inSlidesBand,
  type CaseReport,
} from './check-lib'

/** 临时产物只许落这里；仓库内不留 .pptx */
const OUT_DIR = '/tmp/yike-check-pptx'
/**
 * C3 那三份学生版（20 / 30 / 40 分钟）留一份在这里，供人直接用 PowerPoint 打开核对。
 * 同样在仓库外：仓库里只留下能重新生成它们的这一段代码。
 */
const KEEP_DIR = '/tmp/yike-sangao-lesson'
const EXPECT_SLDSZ = 'cx="12192000" cy="6858000"'

/** 装饰小字的额定字号（src/lib/pptx.ts：DECOR_PT 11 / 页脚 DECOR_PT-2 9 / HINT_PT 10.5）。
 * 排除这三类之前先把它们钉死，免得布局一改，“被排除的小字”就能偷承载正文。 */
const DECOR_SZ = { label: 1100, footer: 900, figure: 1050 }

/**
 * 54pt 字词行的最低行盒高（英寸）。任务 #4 的回归线：
 * 字词页那个含 ≥5400 词的文本框，「框高 ÷ 行数」必须 ≥ 这个值，
 * 否则 PowerPoint 会用 normAutofit 把声明的 54pt 压到线下（XML 里 sz 仍是 5400）。
 * src/lib/pptx.ts 取 WORDS_LINE_IN=0.93，这里取 0.9 作为下限（留出真机误差）。
 */
const WORDS_LINE_MIN_IN = 0.9
/** 1 英寸 = 914400 EMU */
const EMU_PER_IN = 914400
/** 页脚上沿（src/lib/pptx.ts：FOOT_Y = H − 0.66 = 6.84in）；正文框不得越过这条线 */
const FOOT_Y_IN = 7.5 - 0.66
/** 页脚越界判定的取整容差（英寸） */
const FOOT_EPS = 0.02
/** D 段新增的字词框高反向用例（N8）之外，原来的反向用例数 */
const SELF_CASES_BASE = 7

/** D 段自检的反向用例条数（N0 是正例，其余每条都必须报错） */
const SELF_CASES = SELF_CASES_BASE + 1

/* ============================ unzip 工具 ============================ */

function unzip(entry: string, file: string): string {
  return execFileSync('/usr/bin/unzip', ['-p', file, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function zipEntryNames(file: string): string[] {
  return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.endsWith('/'))
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 段落末行的隐形属性会把字号统计撑虚，取 sz 之前先整段抹掉 */
function dropEndParaRPr(xml: string): string {
  return xml.replace(/<a:endParaRPr[\s\S]*?(?:\/>|<\/a:endParaRPr>)/g, '')
}

function textsOf(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeEntities(m[1]))
}

interface Run {
  sz: number | null
  text: string
}

/** 一个 <p:sp> 文本框里的所有可见 run（已去 endParaRPr） */
function runsOfShape(sp: string): Run[] {
  return [...dropEndParaRPr(sp).matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map((m) => {
    const body = m[1]
    const sz = body.match(/sz="(\d+)"/)
    const t = body.match(/<a:t>([\s\S]*?)<\/a:t>/)
    return { sz: sz ? Number(sz[1]) : null, text: t ? decodeEntities(t[1]) : '' }
  })
}

interface TextBox {
  runs: Run[]
  text: string
  /** cover / label / footer / figure / title / body */
  role: string
  /** 文本框高（英寸），取自 <a:xfrm><a:ext cy=".."/>；拿不到为 NaN */
  heightIn: number
  /** 文本框上沿 y（英寸），取自 <a:xfrm><a:off y=".."/>；拿不到为 NaN */
  topIn: number
  /** 含 run 的段落数（≈行数） */
  lineCount: number
}

/**
 * 从一个 <p:sp> 内部量出「框高（英寸）」与「行数」——这是 #4 的关键：
 * normAutofit 是 PowerPoint 渲染期行为，XML 只声明 sz，唯有拿框高÷行数才能
 * 反推 54pt 行会不会被压到线下。行高按 EMU 换算（914400 EMU = 1 英寸）。
 */
function spGeom(spInner: string): { heightIn: number; topIn: number; lineCount: number } {
  const ext = spInner.match(/<a:ext\b[^>]*?\bcy="(\d+)"/)
  const heightIn = ext ? Number(ext[1]) / EMU_PER_IN : NaN
  const off = spInner.match(/<a:off\b[^>]*?\by="(-?\d+)"/)
  const topIn = off ? Number(off[1]) / EMU_PER_IN : NaN
  const lineCount = [...spInner.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].filter((p) =>
    /<a:r>/.test(p[1])
  ).length
  return { heightIn, topIn, lineCount }
}

/** 按 pptxgenjs 的写入顺序切出文本框，再按位置定性出装饰框 */
function parseSlide(xml: string, slide: StudentSlide): { boxes: TextBox[]; rectCount: number } {
  const shapes = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)]
  const rectCount = shapes.filter((m) => runsOfShape(m[1]).length === 0).length
  const boxes: TextBox[] = shapes
    .map((m) => ({ runs: runsOfShape(m[1]), geom: spGeom(m[1]) }))
    .filter((x) => x.runs.length > 0)
    .map((x) => ({
      runs: x.runs,
      text: x.runs.map((r) => r.text).join(''),
      role: 'body',
      heightIn: x.geom.heightIn,
      topIn: x.geom.topIn,
      lineCount: x.geom.lineCount,
    }))

  // 1) 位置定性：第 1 个 = 左上角分类字，最后 2 个 = 页脚（课题 + 页码）
  //    封面只有四个框（分类字 / 课题 / 页脚课题 / 页码）——TASKS/25 起封面不放问句，
  //    副题交给插画与两行标注，所以下限从五改成四，其余框型不变。
  const minBoxes = slide.kind === 'cover' ? 4 : 5
  if (boxes.length >= minBoxes) {
    boxes[0].role = 'label'
    boxes[boxes.length - 1].role = 'footer'
    boxes[boxes.length - 2].role = 'footer'
  }
  // 2) 图位检索词框：文本里带「图位」二字
  for (const b of boxes) {
    if (b.role === 'body' && b.text.includes('图位')) b.role = 'figure'
  }
  // 3) 内容框里认标题：文本等于 slide.title 优先，对不上就拿字号最大的那个
  const content = boxes.filter((b) => b.role === 'body')
  let titleBox = content.find((b) => b.text.trim() === slide.title.trim()) ?? null
  if (!titleBox && content.length) {
    titleBox = content.reduce((top, b) =>
      maxSz(b) > maxSz(top) ? b : top
    , content[0])
  }
  if (titleBox) titleBox.role = 'title'
  for (const b of boxes) if (b.text.trim() === '') b.role = 'empty'
  return { boxes, rectCount }
}

function maxSz(box: TextBox): number {
  return Math.max(0, ...box.runs.map((r) => r.sz ?? 0))
}

function forbiddenIn(text: string): string[] {
  return FORBIDDEN_WORDS.filter((w) => text.includes(w))
}

interface SlideStats {
  texts: string[]
  /** 逐条取证：「sz=4600 title 读进去」，CHECK_VERBOSE=1 时逐页打出来 */
  runs: string[]
  decor: Set<number>
  minTitle: number
  minBody: number
  minWords: number
  minContent: number
  coverTitle: number | null
  missingSz: number
  /** 字词页含 ≥5400 词那个框的「框高 ÷ 行数」（英寸），拿不到为 NaN */
  wordsLineIn: number
  /** 经验模型估出的 normAutofit 隐患，只告警不阻断 */
  warnings: string[]
}

/**
 * 单页字号取证。抽成纯函数是为了能拿 synth XML 做反向自检（见下面 D 段）——
 * 不然“全部 ✓”可能只是解析器什么都没看到。
 */
function auditSlideXml(
  xml: string,
  slide: StudentSlide,
  at: string,
  push: (msg: string) => void
): SlideStats {
  const st: SlideStats = {
    texts: [],
    runs: [],
    decor: new Set<number>(),
    minTitle: Infinity,
    minBody: Infinity,
    minWords: Infinity,
    minContent: Infinity,
    coverTitle: null,
    missingSz: 0,
    wordsLineIn: NaN,
    warnings: [],
  }
  const { boxes } = parseSlide(xml, slide)
  if (boxes.length === 0) push(`${at} 页面上一个文本框都没有`)
  /* 封面四个框就够：分类字 / 课题 / 页脚课题 / 页码（TASKS/25 起封面不放问句）。
     其余页仍然要五个：多出来那一个就是正文（条目或问句）。 */
  const minBoxes = slide.kind === 'cover' ? 4 : 5
  if (boxes.length < minBoxes)
    push(`${at} 文本框只有 ${boxes.length} 个，分类字/正文/页脚的位置定性不成立`)

  const isCover = slide.kind === 'cover'
  const itemSet = new Set((slide.items ?? []).map((t) => t.trim()))

  for (const box of boxes) {
    if (box.role === 'label' || box.role === 'footer' || box.role === 'figure') {
      const want = DECOR_SZ[box.role as 'label' | 'footer' | 'figure']
      for (const r of box.runs) {
        if (r.sz === null) {
          st.missingSz++
          push(`${at} 装饰框「${r.text.slice(0, 6)}」没写 sz`)
          continue
        }
        st.runs.push(`sz=${r.sz} ${box.role} ${r.text.trim().slice(0, 14)}`)
        st.decor.add(r.sz)
        // 装饰位上只该出现 1100/900/1050；出了别的字号说明有正文躲在被排除的框里
        if (r.sz !== want) {
          push(`${at} ${box.role} 框字号 ${r.sz}，应为 ${want}（排除规则失效，去看 src/lib/pptx.ts）`)
        }
      }
      continue
    }
    if (box.role === 'empty') continue
    for (const r of box.runs) {
      const t = r.text.trim()
      if (!t) continue
      st.texts.push(r.text)
      if (r.sz === null) {
        st.missingSz++
        push(`${at} 有一个 run 没写 sz（会退到主题默认 18pt）`)
        continue
      }
      st.minContent = Math.min(st.minContent, r.sz)
      st.runs.push(`sz=${r.sz} ${box.role} ${t.slice(0, 14)}`)
      if (box.role === 'title') {
        st.minTitle = Math.min(st.minTitle, r.sz)
        if (isCover) {
          st.coverTitle = r.sz
          if (r.sz !== POINT_FLOOR.coverTitle) {
            push(`${at} 封面标题 ${r.sz}，应等于 ${POINT_FLOOR.coverTitle}（§三 封面 48pt）`)
          }
        } else if (r.sz < POINT_FLOOR.title) {
          push(`${at} 标题 ${r.sz} < ${POINT_FLOOR.title}（§三 标题 ≥40pt）`)
        }
        continue
      }
      // 字词页的词行：单独一条 54pt 下限
      if (slide.kind === 'words' && itemSet.has(t)) {
        st.minWords = Math.min(st.minWords, r.sz)
        if (r.sz < POINT_FLOOR.words) {
          push(`${at} 字词「${t}」${r.sz} < ${POINT_FLOOR.words}（§三 字词 ≥54pt）`)
        }
        continue
      }
      st.minBody = Math.min(st.minBody, r.sz)
      if (r.sz < POINT_FLOOR.body) {
        push(`${at} 正文「${t.slice(0, 10)}」${r.sz} < ${POINT_FLOOR.body}（§三 正文 ≥24pt）`)
      }
    }
  }

  // 认不出标题框 = 字号判定会静默降级成正文下限，必须报
  if (!boxes.some((b) => b.role === 'title')) push(`${at} 没认出标题框（标题字号未被断言）`)
  if (isCover && st.coverTitle === null) push(`${at} 封面页没量到标题字号`)
  const hits = forbiddenIn(st.texts.join(''))
  if (hits.length) push(`${at} 命中禁词 ${hits.join('、')}`)

  /*
   * #4 回归线（硬断言）：字词页里那个含 ≥5400 词的文本框，「框高 ÷ 行数」必须 ≥0.9in。
   * 现有 XML 声明值检查（sz=5400）抓不到 PowerPoint 渲染期的 normAutofit 缩小，这一条补上：
   * 一旦 drawWords 回退到 fit:'shrink' 或词数/行高算错，框高不足就会 exit 1。
   */
  if (slide.kind === 'words') {
    const wordBox = boxes.find(
      (b) => b.role === 'body' && b.runs.some((r) => (r.sz ?? 0) >= POINT_FLOOR.words)
    )
    if (wordBox) {
      const wordRuns = wordBox.runs.filter((r) => (r.sz ?? 0) >= POINT_FLOOR.words).length
      const lines = wordBox.lineCount || wordRuns
      const per = wordBox.heightIn / Math.max(1, lines)
      st.wordsLineIn = per
      const hTxt = Number.isFinite(wordBox.heightIn) ? wordBox.heightIn.toFixed(2) : '?'
      const pTxt = Number.isFinite(per) ? per.toFixed(3) : '?'
      if (!(wordBox.heightIn > 0) || per < WORDS_LINE_MIN_IN) {
        push(
          `${at} 字词框高 ${hTxt}in ÷ ${lines} 行 = ${pTxt}in/行，低于 ${WORDS_LINE_MIN_IN}in/行 —— 54pt 会被 PowerPoint normAutofit 压到线下（声明≠渲染）`
        )
      }
    }
  }

  /*
   * 任务 #5（硬断言）：board/drill/homework 三种定步长版式，每个正文框（含底部问句）
   * 的框底必须落在页脚之上（topIn + heightIn ≤ FOOT_Y）。items 放宽到 5/6 后若步长不反算，
   * 最后几条会掉到页高之外或压住页脚——直接从导出 XML 的 <a:off y> 量，兜住 pptx 侧回归。
   */
  if (slide.kind === 'board' || slide.kind === 'drill' || slide.kind === 'homework') {
    for (const b of boxes) {
      if (b.role !== 'body') continue
      if (!Number.isFinite(b.topIn) || !Number.isFinite(b.heightIn)) continue
      const bottom = b.topIn + b.heightIn
      if (b.topIn >= FOOT_Y_IN || bottom > FOOT_Y_IN + FOOT_EPS) {
        push(
          `${at} ${slide.kind} 正文框「${b.text.slice(0, 8)}」y=${b.topIn.toFixed(2)}..${bottom.toFixed(2)}in 越过页脚 ${FOOT_Y_IN.toFixed(2)}in（步长未反算，任务 #5）`
        )
      }
    }
  }

  /*
   * 可选告警：用保守真实行高（≈字号×1.28）估一遍各内容框会不会撑破框高。
   * 经验模型有误差，只写进 warnings 区，不影响 ok。
   */
  for (const b of boxes) {
    if (b.role !== 'body' && b.role !== 'title') continue
    if (!Number.isFinite(b.heightIn) || b.lineCount <= 0) continue
    const boxMax = maxSz(b)
    if (boxMax < POINT_FLOOR.body) continue
    // 字词页的 54pt 框已由上面硬断言专管，不在这里重复告警
    if (slide.kind === 'words' && boxMax >= POINT_FLOOR.words) continue
    // boxMax 是 sz（百分之一磅），先 ÷100 还原成 pt，再按经验行高系数 1.28 估行盒（英寸）
    const need = b.lineCount * (((boxMax / 100) / 72) * 1.28)
    if (need > b.heightIn * 1.05) {
      st.warnings.push(
        `${at} 估需 ${need.toFixed(2)}in > 框高 ${b.heightIn.toFixed(2)}in（${b.lineCount} 行 @${boxMax}sz），或触发 normAutofit`
      )
    }
  }
  return st
}

/* ============================ 单份 .pptx 取证 ============================ */

interface PptxAudit {
  name: string
  file: string
  bytes: number
  slideCount: number
  notesCount: number
  notesNonEmpty: number
  notesMismatch: string[]
  progressPages: number
  /** 内容框（排除分类字 / 页脚 / 图位检索词）的最小字号 */
  minContentSz: number
  minTitleSz: number
  minBodySz: number
  minWordsSz: number
  coverTitleSz: number | null
  /** 装饰字出现过的字号，例如 1100 / 900 / 1050 */
  decorSizes: number[]
  missingSzRuns: number
  forbiddenHits: string[]
  forbiddenRawHits: number
  gradFill: number
  effectLst: number
  roundRect: number
  /** 页面上引用主题样式池的 <a:style>，必须为 0，否则主题里那份 pptxgenjs 默认渐变会被继承 */
  aStyle: number
  /** pptxgenjs 默认主题自带的 gradFill/effectLst（在 fillStyleLst/effectStyleLst 池里，不渲染） */
  themePool: number
  sldSz: string
  kindOfPage: string[]
  /** 每页的逐条 sz 取证（CHECK_VERBOSE=1 才打印） */
  pageRuns: string[][]
  /** 字词页含 ≥5400 词框的「框高 ÷ 行数」最小值（英寸）；没有字词页为 NaN */
  minWordsLineIn: number
  /** normAutofit 隐患估算（经验模型，只告警不阻断） */
  xmlWarnings: string[]
  violations: string[]
}

function auditPptx(report: Pick<CaseReport, 'name' | 'slides'>, file: string): PptxAudit {
  const { name, slides } = report
  const violations: string[] = []
  const entries = zipEntryNames(file)
  const slideFiles = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort((a, b) => order(a) - order(b))
  const noteFiles = entries
    .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
    .sort((a, b) => order(a) - order(b))

  const push = (msg: string) => violations.push(`${name}: ${msg}`)

  if (!inSlidesBand(slideFiles.length)) {
    push(`slideN.xml 有 ${slideFiles.length} 个，应在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页区间（08 §B / §五.2）`)
  }
  if (noteFiles.length !== slideFiles.length) {
    push(`notesSlideN.xml 有 ${noteFiles.length} 个，与 slide 数 ${slideFiles.length} 不等（§五.5）`)
  }

  let notesNonEmpty = 0
  const notesMismatch: string[] = []
  noteFiles.forEach((e, i) => {
    const xml = unzip(e, file)
    const body = textsOf(xml).filter((t) => !/^\s*\d+\s*$/.test(t)).join('').trim()
    if (body.length > 0) notesNonEmpty++
    const want = (slides[i]?.notes ?? '').replace(/\s+/g, '').trim()
    if (!body) push(`${e} 备注是空的（§五.5）`)
    else if (want && body.replace(/\s+/g, '') !== want) {
      notesMismatch.push(`${e} 备注与 slides[${i + 1}].notes 不一致`)
      push(`${e} 备注与数据不一致：期望「${want.slice(0, 18)}…」实得「${body.slice(0, 18)}…」`)
    }
  })

  const decorSizes = new Set<number>()
  const allText: string[] = []
  let rawXml = ''
  let gradFill = 0
  let effectLst = 0
  let roundRect = 0
  let minContentSz = Infinity
  let minTitleSz = Infinity
  let minBodySz = Infinity
  let minWordsSz = Infinity
  let coverTitleSz: number | null = null
  let missingSzRuns = 0
  let aStyle = 0
  let minWordsLineIn = Infinity
  const xmlWarnings: string[] = []
  const kindOfPage: string[] = []
  const pageRuns: string[][] = []

  slideFiles.forEach((e, i) => {
    const at = `${name} 第 ${i + 1} 页（${slides[i]?.kind ?? '?'}）`
    const xml = unzip(e, file)
    rawXml += xml
    gradFill += countOf(xml, 'gradFill')
    effectLst += countOf(xml, 'effectLst')
    roundRect += countOf(xml, 'roundRect')
    aStyle += countOf(xml, '<a:style>')

    const slide = slides[i]
    if (!slide) return
    kindOfPage.push(slide.kind)
    const st = auditSlideXml(xml, slide, at, push)
    pageRuns.push(st.runs)
    for (const t of st.texts) allText.push(t)
    for (const sz of st.decor) decorSizes.add(sz)
    for (const w of st.warnings) xmlWarnings.push(w)
    if (Number.isFinite(st.wordsLineIn)) minWordsLineIn = Math.min(minWordsLineIn, st.wordsLineIn)
    minTitleSz = Math.min(minTitleSz, st.minTitle)
    minBodySz = Math.min(minBodySz, st.minBody)
    minWordsSz = Math.min(minWordsSz, st.minWords)
    minContentSz = Math.min(minContentSz, st.minContent)
    missingSzRuns += st.missingSz
    if (slide.kind === 'cover' && st.coverTitle !== null) coverTitleSz = st.coverTitle
  })

  const pageText = allText.join('')
  const forbiddenHits = forbiddenIn(pageText)
  if (forbiddenHits.length) push(`.pptx 页面文字命中禁词：${forbiddenHits.join('、')}（§五.3）`)

  const presXml = unzip('ppt/presentation.xml', file)
  const sldSz = (presXml.match(/<p:sldSz([^/]*)\/>/) ?? ['', ''])[1].trim()
  if (sldSz !== EXPECT_SLDSZ) push(`sldSz 是「${sldSz}」，应为「${EXPECT_SLDSZ}」（LAYOUT_WIDE）`)
  gradFill += countOf(presXml, 'gradFill')
  effectLst += countOf(presXml, 'effectLst')
  for (const e of entries.filter((x) => /^ppt\/(slideMasters|slideLayouts|notesMasters|notesSlides)\//.test(x) && x.endsWith('.xml'))) {
    const xml = unzip(e, file)
    gradFill += countOf(xml, 'gradFill')
    effectLst += countOf(xml, 'effectLst')
    roundRect += countOf(xml, 'roundRect')
  }
  if (gradFill) push(`渲染范围内出现 gradFill ${gradFill} 次（纸与墨禁用渐变）`)
  if (effectLst) push(`渲染范围内出现 effectLst ${effectLst} 次（纸与墨禁用阴影/模糊）`)
  if (roundRect) push(`渲染范围内出现 roundRect ${roundRect} 次（全站圆角 2px）`)
  if (aStyle) push(`页面上出现 <a:style> ${aStyle} 次，会继承主题样式池的渐变/阴影（纸与墨禁用）`)
  const themePool = unzip('ppt/theme/theme1.xml', file)
  const themePoolCount = countOf(themePool, 'gradFill') + countOf(themePool, 'effectLst')

  // onProgress 必须逐页回调（§五.10 的「有进度提示」在导出侧的落点）
  let progressPages = 0
  return {
    name,
    file,
    bytes: 0,
    slideCount: slideFiles.length,
    notesCount: noteFiles.length,
    notesNonEmpty,
    notesMismatch,
    progressPages,
    minContentSz: minContentSz === Infinity ? 0 : minContentSz,
    minTitleSz: minTitleSz === Infinity ? 0 : minTitleSz,
    minBodySz: minBodySz === Infinity ? 0 : minBodySz,
    minWordsSz: minWordsSz === Infinity ? 0 : minWordsSz,
    coverTitleSz,
    decorSizes: [...decorSizes].sort((a, b) => b - a),
    missingSzRuns,
    forbiddenHits,
    forbiddenRawHits: FORBIDDEN_WORDS.reduce((n, w) => n + countOf(rawXml, w), 0),
    gradFill,
    effectLst,
    roundRect,
    aStyle,
    themePool: themePoolCount,
    sldSz,
    kindOfPage,
    pageRuns,
    minWordsLineIn: minWordsLineIn === Infinity ? NaN : minWordsLineIn,
    xmlWarnings,
    violations,
  }
}

function order(entry: string): number {
  return Number(entry.match(/(\d+)\.xml$/)?.[1] ?? 0)
}

function countOf(hay: string, needle: string): number {
  return hay.split(needle).length - 1
}

/* ==================== 三档密度真出片（任务 #3 补漏）：夹具 + 版心几何 ==================== */

/**
 * 为什么要有这一段：pptx.ts 根本不消费 density，出片循环又只跑默认档那六例（固定 10 页），
 * 于是 rich 的「≤90 字 + items ≤6 条」这套排版从来没真出过片——正是「视觉判据必须量化
 * 并配硬断言」那条老坑的空白位。这里不拿内置数据凑（它撑不到 12 页），而是按模型返回
 * 形态造一份 raw JSON，喂 normalizeSlides(raw, plan, limitsOf(该档)) 生成该档页数的
 * StudentSlide[]，再交 downloadPptx 真出片——这样压的才是 rich 的版式本身。
 */

/** 夹具拿它当 plan（CASES 第一例 = 桂花雨）；只用来凑泛化补位与取材，不发任何请求 */
const FIX_PLAN = CASES[0][1]

/** 凑字用的安全字池：不含 §D.2 四个句式与五个禁词，也不含 pptx.ts TEACHER_NOISE 那批「教案味」词 */
const FIX_POOL = '想一想谁来读这一句自己找原因写批注说明白'

/** 条目标记，让每页每条都互不相同 */
const FIX_MARK = ['一', '二', '三', '四', '五', '六']

/** 凑出恰好 n 个可见字（标点不计）：贴上限用，多了会被 fitBudget 削、少了就等于没压测 */
function padVisible(seed: string, n: number): string {
  let out = seed
  let i = 0
  while (countVisibleChars(out) < n) {
    out += FIX_POOL.charAt(i % FIX_POOL.length)
    i += 1
  }
  return out
}

/** 该档一条 items 该给几个字：先按条数摊（上限 slides.ts 的 ITEM_MAX=12），剩下的留给问句行 */
function tierItemChars(lim: DensityLimits): number {
  return Math.max(3, Math.min(12, Math.floor((lim.bodyChars - 6) / lim.itemsMax)))
}

/** 中文序号（1–99）：夹具的页号要占一个可见字、又不能太宽 */
function cnNo(n: number): string {
  const D = '零一二三四五六七八九'
  if (n < 10) return D[n]
  if (n < 20) return `十${n % 10 ? D[n % 10] : ''}`
  return `${D[Math.floor(n / 10)]}十${n % 10 ? D[n % 10] : ''}`
}

/** 把一段文字裁/补到恰好 n 个可见字（标点不算）：夹具每页都要贴到上限，又得互不相同 */
function fitVisible(seed: string, n: number): string {
  let out = ''
  let v = 0
  for (const ch of seed) {
    const add = countVisibleChars(ch)
    if (v + add > n) break
    out += ch
    v += add
  }
  let i = 0
  while (v < n) {
    out += FIX_POOL.charAt(i % FIX_POOL.length)
    i += 1
    v += 1
  }
  return out
}

/** 问句行的字数 = 该档 bodyChars 减去 items 摊掉的，保证最重那一页正好贴到上限 */
function tierLineChars(lim: DensityLimits, itemChars: number): number {
  return Math.max(3, lim.bodyChars - itemChars * lim.itemsMax)
}

/** 该档能构造出的精读页数：受 closeReadMax 与「页数 − 其余 9 个单页型」双重封顶 */
function tierCloseReads(lim: DensityLimits): number {
  return 1 + Math.min(lim.closeReadMax - 1, lim.pagesMax - 10)
}

/** 该档自己的页数区间（不是三档并集）：切档重算、出片取证都按这一条判 */
const inTierBand = (n: number, lim: DensityLimits): boolean =>
  n >= lim.pagesMin && n <= lim.pagesMax

/** 三档共用的夹具构造器：只有载荷（条数、字数、精读页数）随档位变。
 * 每页末尾带一个页编号字：第二十轮起 validateSlides 硬判「同一句不许上两页」，
 * 夹具必须自己先合规，否则量到的是 validate 的红，不是版式的红。*/
function tierRaw(tier: Density): Record<string, unknown>[] {
  const lim = DENSITY[tier]
  const ic = tierItemChars(lim)
  const lc = tierLineChars(lim, ic)
  let pageNo = 0
  const nextPage = () => pageNo++
  const items = (n: number, chars: number, p: number) =>
    Array.from({ length: n }, (_, i) => fitVisible(`第${cnNo(p)}页第${FIX_MARK[i] ?? i}，`, chars))
  const line = (chars: number, p: number) => `${fitVisible(`第${cnNo(p)}页谁来读这一句`, chars)}？`
  const note = (tag: string) =>
    `${tag}这一页先自己读一遍，读完同桌互查，谁来说说你发现了什么？（停三秒）等一会儿再请人补充。`
  const bodyPage = (kind: string, title: string, n = lim.itemsMax) => {
    const p = nextPage()
    return { kind, title, items: items(n, ic, p), line: line(lc, p), notes: note(title) }
  }

  const raw: Record<string, unknown>[] = []
  raw.push({ kind: 'cover', title: padVisible('课文', 8), line: line(Math.min(lc, 20), nextPage()), notes: note('封面') })
  raw.push(bodyPage('hook', '想一想'))
  raw.push(bodyPage('goals', '三件事'))
  raw.push({
    kind: 'words',
    title: '字词关',
    // 字词页任何档位都恒 ≤4 词、每条 ≤6 字（density.ts 的物理裁决），不随 rich 放宽
    items: items(WORDS_ITEMS_MAX, Math.min(6, ic), nextPage()),
    line: line(lc, pageNo - 1),
    notes: note('字词'),
  })
  for (let i = 0; i < tierCloseReads(lim); i++) raw.push(bodyPage('close-read', `读进去${FIX_MARK[i] ?? i}`))
  raw.push({
    ...bodyPage('compare', '比一比'),
    compareDiff: Array.from({ length: Math.ceil(lim.itemsMax / 2) }, (_, i) =>
      padVisible(`这儿差${FIX_MARK[i] ?? i}`, 8)
    ),
  })
  raw.push(bodyPage('board', '看这儿'))
  raw.push(bodyPage('drill', '练一练'))
  raw.push(bodyPage('homework', '课后'))
  raw.push({ kind: 'end', title: '一句话', line: line(Math.min(lc, 20), nextPage()), notes: note('收尾') })
  return raw
}

interface ContentBox {
  /** 该框最大的声明字号（百分之一磅） */
  sz: number
  /** XML 自己声明的行距倍数（<a:spcPct val="125000"> = 1.25 倍）；没写按 1.0 倍 */
  pct: number
  heightIn: number
  topIn: number
  lineCount: number
  text: string
}

/**
 * 逐 <p:sp> 量「声明字号 + 声明行距 + 框高 + 行数 + 框底」，不做角色定性：
 * 只留最大字号 ≥ 正文下限的框，分类字 1100 / 页脚 900 / 图位 1050 自然落在门外。
 */
function contentBoxesOf(xml: string): ContentBox[] {
  const out: ContentBox[] = []
  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const inner = m[1]
    const runs = runsOfShape(inner)
    if (runs.length === 0) continue
    const sz = Math.max(...runs.map((r) => r.sz ?? 0))
    if (sz < POINT_FLOOR.body) continue
    const g = spGeom(inner)
    const pcts = [...inner.matchAll(/<a:spcPct val="(\d+)"/g)].map((x) => Number(x[1]))
    out.push({
      sz,
      pct: pcts.length ? Math.max(...pcts) : 100000,
      heightIn: g.heightIn,
      topIn: g.topIn,
      lineCount: g.lineCount || runs.length,
      text: runs.map((r) => r.text).join(''),
    })
  }
  return out
}

/** 框底（英寸）；量不到几何返回 NaN */
function boxBottom(b: ContentBox): number {
  return Number.isFinite(b.topIn) && Number.isFinite(b.heightIn) ? b.topIn + b.heightIn : NaN
}

/** 被 normAutofit 压完之后的实际磅值：框高连自己声明的行距都站不住时，按比例压小 */
function boxEffectivePt(b: ContentBox): number {
  if (!(b.lineCount > 0) || !Number.isFinite(b.heightIn) || b.heightIn <= 0) return b.sz / 100
  const per = b.heightIn / b.lineCount
  const need = (b.sz / 100 / 72) * (b.pct / 100000)
  if (!(need > 0)) return b.sz / 100
  return (b.sz / 100) * Math.min(1, per / need)
}

/**
 * 单框硬判据两条：
 *   1. 框底不得越过页脚（版心 BODY 区只有 3.79in，rich 撑满就顶到边）；
 *   2. 框高 ÷ 行数若连「自身字号 × 自身声明行距」都放不下，PowerPoint 一定会
 *      normAutofit 缩字（pptx.ts 全线 fit:'shrink'），按缩完的磅值算仍须 ≥ 正文下限 24pt。
 */
function contentBoxProblems(at: string, b: ContentBox): string[] {
  const p: string[] = []
  if (!Number.isFinite(b.heightIn) || !Number.isFinite(b.topIn) || !(b.lineCount > 0)) {
    p.push(`${at} 量不到正文框几何（cy / off / 段落数缺失），字号压检失效`)
    return p
  }
  const bottom = boxBottom(b)
  if (bottom > FOOT_Y_IN + FOOT_EPS)
    p.push(
      `${at} 正文框「${b.text.slice(0, 8)}」底 ${bottom.toFixed(2)}in 越过页脚 ${FOOT_Y_IN.toFixed(2)}in（版心 3.79in 溢出）`
    )
  const per = b.heightIn / b.lineCount
  const need = (b.sz / 100 / 72) * (b.pct / 100000)
  const eff = boxEffectivePt(b)
  if (eff < POINT_FLOOR.body / 100)
    p.push(
      `${at} 框高 ${b.heightIn.toFixed(2)}in ÷ ${b.lineCount} 行 = ${per.toFixed(3)}in，站不住自身声明的 ${(b.sz / 100).toFixed(0)}pt @ ${(b.pct / 100000).toFixed(2)} 倍行距（需 ${need.toFixed(3)}in/行），normAutofit 会把字压到 ${eff.toFixed(1)}pt < ${POINT_FLOOR.body / 100}pt（声明≠渲染）`
    )
  return p
}

/** 合成一个带几何与行距的正文框，供反向自检故意把框压矮 */
function bodyBoxSp(cyIn: number, sz: number, pct: number, texts: string[], topIn = 0): string {
  const cy = Math.round(cyIn * EMU_PER_IN)
  const off = Math.round(topIn * EMU_PER_IN)
  const paras = texts
    .map(
      (t) =>
        `<a:p><a:pPr><a:lnSpc><a:spcPct val="${pct}"/></a:lnSpc></a:pPr>` +
        `<a:r><a:rPr lang="zh-CN" sz="${sz}" dirty="0"/><a:t>${t}</a:t></a:r></a:p>`
    )
    .join('')
  return (
    `<p:sp><p:spPr><a:xfrm><a:off x="0" y="${off}"/><a:ext cx="8000000" cy="${cy}"/></a:xfrm></p:spPr>` +
    `<p:txBody>${paras}</p:txBody></p:sp>`
  )
}

/* ============================ 主流程 ============================ */

const failures: string[] = []

console.log('=== A. 数据层（与 check-slides.ts 同源）===')
const data = collectDataChecks()
failures.push(...data.failures)
for (const r of data.reports) {
  console.log(
    `  ${r.name.padEnd(16)} 课件 ${r.deckPages} | 学生 ${r.slidePages} | 演示 ${r.demoPages} | ` +
      `导出 ${r.pptxPages} | 正文最长 ${r.longestBody} 字 | 缺问句 ${r.missingQuestion} | ` +
      `空备注 ${r.emptyNotes} | 禁词 ${r.forbiddenHits.length} | ${r.ok ? '✓' : '✗'}`
  )
}

console.log('\n=== B. 无 Key 确定性（fetch 打桩：一调就 throw 并计数）===')
const noKey = await checkNoKeyDeterminism()
for (const line of noKey.lines) console.log('  ' + line)
console.log(`  fetch 调用合计 ${noKey.calls} 次（应为 0）`)
failures.push(...noKey.failures)

console.log('\n=== B2. 超长课题自救（任务 #1：≥20 字、无《》、不命中内置，三条路径都要 validate ok + 页数在 10–14）===')
const long = await checkLongTopic()
for (const line of long.lines) console.log('  ' + line)
failures.push(...long.failures)

console.log('\n=== B3. 纸面方案（TASKS/09 第 9 件：四条硬约束 / 学科红线 / 洗数据 / 兜底逐字回归）===')
const themeChecks = collectThemeChecks()
for (const line of themeChecks.lines) console.log('  ' + line)
failures.push(...themeChecks.failures)

console.log('\n=== B4. 三页真交互（TASKS/08 §A.4：主线快照 / 交互页分布 / 浮出文本 / 反向用例）===')
const interChecks = collectInteractionChecks()
for (const line of interChecks.lines) console.log('  ' + line)
failures.push(...interChecks.failures)

console.log('\n=== B5. 三档密度（TASKS/08 §B：上限表 / 默认档 / 字词页恒≤4 / 页数区间 / validate 边界 / 档位指纹进钥匙）===')
const densityChecks = collectDensityChecks()
for (const line of densityChecks.lines) console.log('  ' + line)
failures.push(...densityChecks.failures)

console.log('\n=== C. 真出片 + unzip 取证（.pptx 只写 /tmp）===')
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const audits: PptxAudit[] = []
const byName = new Map(data.reports.map((r) => [r.name, r]))
try {
  for (const [name] of CASES) {
    const report = byName.get(name)!
    const file = `${OUT_DIR}/${name}.pptx`
    const pages: number[] = []
    const slides: StudentSlide[] = report.slides
    try {
      const res = await downloadPptx(slides, (p) => pages.push(p), file)
      if (!inSlidesBand(res.pages)) {
        failures.push(`${name}: downloadPptx 回报 ${res.pages} 页，不在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页区间`)
      }
      const seq = pages.join(',')
      const want = Array.from({ length: slides.length }, (_, i) => i + 1).join(',')
      if (seq !== want) failures.push(`${name}: onProgress 回调是 ${seq || '（空）'}，应为 ${want}`)
    } catch (e) {
      failures.push(`${name}: downloadPptx 抛错 —— ${errMsg(e)}`)
      continue
    }
    const audit = auditPptx(report, file)
    audit.progressPages = pages.length
    audit.bytes = statSync(file).size
    audits.push(audit)
    failures.push(...audit.violations)
    console.log(
      `  ${name.padEnd(16)} ${audit.bytes} 字节 | slide ${audit.slideCount} | notes ${audit.notesCount}` +
        `（非空 ${audit.notesNonEmpty}）| 进度 ${audit.progressPages} 次 | ` +
        `sz 标题≥${audit.minTitleSz} 正文≥${audit.minBodySz} 字词≥${audit.minWordsSz} ` +
        `装饰 ${audit.decorSizes.join('/')} | 禁词 ${audit.forbiddenRawHits} | ` +
        `字词行高 ${Number.isFinite(audit.minWordsLineIn) ? audit.minWordsLineIn.toFixed(3) + 'in/行' : '-'} | ` +
        `gradFill ${audit.gradFill} effectLst ${audit.effectLst} roundRect ${audit.roundRect} a:style ${audit.aStyle} | ` +
        `sldSz ${audit.sldSz}`
    )
    if (process.env.CHECK_VERBOSE) {
      audit.pageRuns.forEach((runs, pi) =>
        console.log(`      ${String(pi + 1).padStart(2)} ${audit.kindOfPage[pi] ?? '?'}: ${runs.join(' · ')}`)
      )
    }
  }

  // 主题化导出（TASKS/09 第 9 件）：同一叠页面换一份模型交回的色板，XML 里的色值必须跟着换，
  // 而且仍然无渐变 / 无圆角 / 无阴影。几何、字号、fit 策略一条都不重测。
  const guihua = byName.get('guihua')
  if (guihua) {
    // 用 schemeFromJSON 造一份「合法 AI 方案」而不是手写对象：这样导出那侧吃到的
    // 形状与线上一致（id 带 ai: 前缀、layouts / note 都齐），洗数据那一步也顺带又跑一遍。
    const parsed = schemeFromJSON(
      {
        name: '雨后苔痕',
        note: '读课文配的一张湿绿纸。',
        motif: 'dots',
        paper: '#eef1ea',
        coverPaper: '#d5ddd2',
        paperDeep: '#e3e8de',
        paperLine: '#d8ded3',
        ink: '#22261f',
        inkSoft: '#5a6156',
        accent: '#8a4a3a',
        accentSoft: '#efe0da',
        ruleWidth: 1,
      },
      '语文',
      guihua.slides.length
    )
    if (!parsed.theme) failures.push(`主题化导出前，方案被自己的闸门退了：${parsed.problems.join('；')}`)
    const t = parsed.theme ?? DEFAULT_THEME
    const pal = paletteOf(t)
    const bodyPal = paletteOf(t, 'body')
    const coverPal = paletteOf(t, 'cover')
    const base = paletteOf(DEFAULT_THEME)
    const file = `${OUT_DIR}/theme-ai-scheme.pptx`
    await downloadPptx(guihua.slides, undefined, file, t)
    const xml = ['ppt/slides/slide1.xml', 'ppt/slides/slide3.xml', 'ppt/slides/slide5.xml']
      .map((e) => unzip(e, file))
      .join('')
    const keys = ['PAPER', 'INK', 'CINNABAR', 'LINE'] as const
    const hit = keys.filter((k) => xml.includes(pal[k]))
    const stale = keys.map((k) => base[k]).filter((c) => xml.includes(c))
    const cover = xml.includes(coverPal.PAPER) && coverPal.PAPER !== bodyPal.PAPER
    const grad = (xml.match(/gradFill/g) ?? []).length
    const round = (xml.match(/roundRect/g) ?? []).length
    const effect = (xml.match(/effectLst/g) ?? []).length
    console.log(
      `  主题化导出 ${t.id}：主纸 ${bodyPal.PAPER} / 封面纸 ${coverPal.PAPER}（命中 ${cover ? '是' : '否'}） | ` +
        `色板 ${keys.map((k) => pal[k]).join('/')} | 命中 ${hit.length}/4 | ` +
        `残留墨与朱 ${stale.length} 个 | gradFill ${grad} roundRect ${round} effectLst ${effect} | ` +
        `${statSync(file).size} 字节`
    )
    if (hit.length !== keys.length) failures.push(`主题化导出的 .pptx 只命中 ${hit.length}/4 个该主题色值`)
    if (stale.length) failures.push(`主题化导出的 .pptx 里残留墨与朱色值：${stale.join(' ')}`)
    if (!cover) failures.push('主题化导出的 .pptx 里封面页没用上封面纸（AI 方案的 coverPaper 落空）')
    if (grad || round || effect) failures.push('主题化导出的 .pptx 引入了渐变 / 圆角 / 阴影（底线 2）')
  }

  // 定步长版式的几何回归（任务 #5）：合成一叠把 board/drill/homework 各塞 6 条，
  // 真导出后从 XML 的 <a:off y> 量每个正文框底，必须全部落在页脚之上。
  // 内置四篇这几类页大多 ≤4 条，拿不到自然步长出画的现场，故单独造 6 条用例。
  {
    const six = ['甲一条', '乙二条', '丙三条', '丁四条', '戊五条', '己六条']
    const hwSix = ['必做｜拄三遍', '必做｜读一遍', '选做｜画一画', '选做｜讲给家人', '选做｜背一背', '选做｜找同类']
    const geomSlides: StudentSlide[] = [
      { kind: 'cover', title: '步长几何', line: '开始好吗？', notes: '这一叠专为任务 #5 的步长几何而拼，讲解够八个字。' },
      { kind: 'board', title: '看这儿', items: six, line: '哪一条最重？', notes: '黑板上的主线逐行揭示，讲解够八个字。' },
      { kind: 'drill', title: '练一练', items: six, line: '先读哪一条？', notes: '题干在上口头在下，讲解够八个字。' },
      { kind: 'homework', title: '课后', items: hwSix, line: '哪件你先做？', notes: '必做选做各一行，讲解够八个字。' },
      ...Array.from({ length: 6 }, (_, i): StudentSlide => ({
        kind: 'close-read',
        title: `读进去${i}`,
        line: `第${i + 1}句谁懂？`,
        notes: `第${i}页讲解够长够八个字。`,
      })),
    ]
    const gfile = `${OUT_DIR}/stride-geom.pptx`
    try {
      await downloadPptx(geomSlides, undefined, gfile)
      const labels = ['board', 'drill', 'homework'] as const
      for (let si = 0; si < labels.length; si++) {
        const slide = geomSlides[si + 1]
        const xml = unzip(`ppt/slides/slide${si + 2}.xml`, gfile)
        const { boxes } = parseSlide(xml, slide)
        let maxBottom = 0
        let itemBoxes = 0
        for (const b of boxes) {
          if (b.role !== 'body') continue
          if (!Number.isFinite(b.topIn) || !Number.isFinite(b.heightIn)) continue
          itemBoxes++
          maxBottom = Math.max(maxBottom, b.topIn + b.heightIn)
        }
        console.log(
          `  定步长几何 ${labels[si]} ${labels[si] === 'homework' ? hwSix.length : six.length} 条：量到 ${itemBoxes} 个正文框，最深框底 ${maxBottom.toFixed(2)}in（页脚 ${FOOT_Y_IN.toFixed(2)}in）`
        )
        if (!(itemBoxes > 0)) failures.push(`定步长几何 ${labels[si]}：没量到任何正文框（解析失效）`)
        else if (maxBottom > FOOT_Y_IN + FOOT_EPS)
          failures.push(
            `定步长几何 ${labels[si]}：6 条 items 有正文框底 ${maxBottom.toFixed(2)}in 越过页脚 ${FOOT_Y_IN}in（任务 #5 步长未反算）`
          )
      }
    } catch (e) {
      failures.push(`定步长几何用例出片失败 —— ${errMsg(e)}`)
    }
  }

  /* -------- C2. 三档密度真出片（08 §B 补漏）：每档用自己的 limits 归一化 → 真导出 → 量页数 / 声明字号 / 版心几何 -------- */
  console.log('\n=== C2. 三档密度真出片（raw JSON → normalizeSlides(raw, plan, limitsOf(档)) → downloadPptx）===')
  const tierPages: Record<Density, number> = { lean: 0, standard: 0, rich: 0 }
  const richProbe: { slide: StudentSlide; xml: string; bodySz: number }[] = []
  for (const tier of DENSITY_ORDER) {
    const lim = limitsOf(tier)
    const name = `tier-${tier}`
    const slides = normalizeSlides(tierRaw(tier), FIX_PLAN, lim)
    tierPages[tier] = slides.length
    const v = validateSlides(slides, lim)
    if (!v.ok)
      failures.push(`${name}: 按 ${tier} 档自己的上限自检不合格 —— ${v.problems.join('；')}`)
    if (!inTierBand(slides.length, lim))
      failures.push(
        `${name}: 出了 ${slides.length} 页，不在 ${tier} 档自己的 ${lim.pagesMin}–${lim.pagesMax} 页区间`
      )
    const maxBody = Math.max(...slides.map(bodyCharCount))
    const maxItems = Math.max(
      ...slides.filter((s) => s.kind !== 'words').map((s) => (s.items ?? []).length)
    )
    // 夹具必须真贴到该档容量，否则下面量的是空气（差 1 字内算凑字误差）
    if (maxBody < lim.bodyChars - 1)
      failures.push(
        `${name}: 最重一页只有 ${maxBody} 字，没贴到 ${tier} 档的 ${lim.bodyChars} 字上限（出片等于没压测）`
      )
    if (maxItems !== lim.itemsMax)
      failures.push(`${name}: 最多一页只有 ${maxItems} 条 items，没到 ${tier} 档的 itemsMax ${lim.itemsMax}`)
    // 夹具文案必须过 voice.ts 唯一判定源（§D.2 四类句式 + 五个禁词），不许在门禁里合成一叠「说不得」的页面
    const voiceHits = slides.flatMap((s, i) => [
      ...scanVoice(pageVisibleText(s).join(' ')).hits.map((h) => `第 ${i + 1} 页页面文字「${h.label}」`),
      ...scanVoice(s.notes ?? '').hits.map((h) => `第 ${i + 1} 页备注「${h.label}」`),
    ])
    if (voiceHits.length) failures.push(`${name}: 夹具踩了语气判定源 —— ${voiceHits.join('、')}`)

    const file = `${OUT_DIR}/${name}.pptx`
    try {
      await downloadPptx(slides, undefined, file)
    } catch (e) {
      failures.push(`${name}: downloadPptx 抛错 —— ${errMsg(e)}`)
      continue
    }
    const ta = auditPptx({ name, slides }, file)
    failures.push(...ta.violations)
    // ② XML 声明字号四值下限：标题 / 正文 / 字词 / 封面（rich 的 90 字 + 6 条照样要守住）
    const floors: [string, number, number][] = [
      ['标题', ta.minTitleSz, POINT_FLOOR.title],
      ['正文', ta.minBodySz, POINT_FLOOR.body],
      ['字词', ta.minWordsSz, POINT_FLOOR.words],
    ]
    for (const [what, got, floor] of floors) {
      if (!(got >= floor)) failures.push(`${name}: ${what}最低声明字号 ${got} < ${floor}（§三）`)
    }
    if (ta.coverTitleSz !== POINT_FLOOR.coverTitle)
      failures.push(
        `${name}: 封面标题字号 ${ta.coverTitleSz ?? '-'} ≠ ${POINT_FLOOR.coverTitle}（§三 封面 48pt）`
      )
    // ③ 版心几何：逐框量「框底 ≤ 页脚」与「被 normAutofit 压完仍 ≥24pt」
    const geom: string[] = []
    let minEffPt = Infinity
    let squeezed = 0
    let worstSqueezePt = Infinity
    let maxBottom = 0
    let boxesSeen = 0
    let autofitDecls = 0
    slides.forEach((page, i) => {
      const xml = unzip(`ppt/slides/slide${i + 1}.xml`, file)
      autofitDecls += countOf(xml, '<a:normAutofit')
      for (const b of contentBoxesOf(xml)) {
        boxesSeen++
        const bot = boxBottom(b)
        if (Number.isFinite(bot)) maxBottom = Math.max(maxBottom, bot)
        const eff = boxEffectivePt(b)
        if (Number.isFinite(eff)) minEffPt = Math.min(minEffPt, eff)
        // 只统计真被压了（缩放因子 < 1）的框，才能看出 rich 那一叠是不是在靠缩字换容量
        const per = b.heightIn / Math.max(1, b.lineCount)
        const need = (b.sz / 100 / 72) * (b.pct / 100000)
        if (need > 0 && Number.isFinite(per) && per < need) {
          squeezed++
          worstSqueezePt = Math.min(worstSqueezePt, eff)
        }
        for (const msg of contentBoxProblems(`${name} 第 ${i + 1} 页（${page.kind}）`, b)) geom.push(msg)
      }
      if (tier === 'rich' && page.kind === 'close-read' && /sz="2800"/.test(xml) && richProbe.length === 0)
        richProbe.push({ slide: page, xml, bodySz: 2800 })
    })
    failures.push(...geom)
    if (tier === 'rich' && !richProbe.length)
      failures.push(`${name}: 没拿到带 28pt 正文的 close-read 真 XML，反向自检无从下手`)
    console.log(
      `  ${name.padEnd(12)} ${slides.length} 页（该档区间 ${lim.pagesMin}–${lim.pagesMax}）| ` +
        `正文最长 ${maxBody}/${lim.bodyChars} 字 | items 最多 ${maxItems}/${lim.itemsMax} 条 | ${statSync(file).size} 字节 | ` +
        `sz 实得 标题 ${ta.minTitleSz} 正文 ${ta.minBodySz} 字词 ${ta.minWordsSz} 封面 ${ta.coverTitleSz ?? '-'} | ` +
        `量到 ${boxesSeen} 个正文框，最深框底 ${maxBottom.toFixed(2)}in（页脚 ${FOOT_Y_IN.toFixed(2)}）| ` +
        `真被 normAutofit 压的框 ${squeezed} 个${squeezed ? `，最狠压到 ${worstSqueezePt.toFixed(1)}pt` : ''} | ` +
        `压完最低 ${Number.isFinite(minEffPt) ? minEffPt.toFixed(1) : '-'}pt | normAutofit 声明 ${autofitDecls} 处 | 违规 ${ta.violations.length}`
    )
  }

  /* -------- C2 反向自检：证明上面那三条断言不是空转（照 D 段同一个做法） -------- */
  {
    const rev: string[] = []
    const need = (label: string, msgs: string[], re: RegExp) => {
      if (!msgs.some((m) => re.test(m)))
        rev.push(`${label} 没被抓到（实得 ${msgs.length ? msgs.join(' | ') : '零条——说明 C2 这条断言在空转'}）`)
    }
    const probe = richProbe[0]
    if (probe) {
      // R1 字号下限：拿 rich 真出片的 close-read XML，把正文 2800 全改成 1800，必须报「1800 < 2400」
      const down = probe.xml.replace(/sz="2800"/g, 'sz="1800"')
      need('R1 rich 正文被压到 18pt', collectViolations(down, probe.slide, 'R1'), /1800 < 2400/)
    } else {
      rev.push('R1 没有 rich 真片可拿（上面那一页没入档），字号下限反向自检没做')
    }
    // R2 几何断言：7 行 28pt @1.25 倍行距只给 0.3in 框高 → 缩完远低于 24pt，必须报
    need(
      'R2 框高站不住自身行距',
      contentBoxesOf(
        bodyBoxSp(
          0.3,
          2800,
          125000,
          Array.from({ length: 7 }, (_, i) => `第${FIX_MARK[i] ?? i}，自己读`)
        )
      ).flatMap((b) => contentBoxProblems('R2', b)),
      /normAutofit/
    )
    // R3 溢出断言：同一个框放到页脚线以1.5 倍行距，必须报「越过页脚」（且不能顺带误报字号）
    const r3 = contentBoxesOf(bodyBoxSp(0.6, 2800, 150000, ['一条就够'], FOOT_Y_IN)).flatMap((b) =>
      contentBoxProblems('R3', b)
    )
    need('R3 正文框越页脚', r3, /越过页脚/)
    // R4 页数区间不是真话：lean 那叠（10 页）拿去撞 rich 的 12–14 必须撞不上
    if (inTierBand(tierPages.lean, DENSITY.rich))
      rev.push(`R4 页数区间判定空转：lean 的 ${tierPages.lean} 页居然也算落在 rich 的 12–14 里`)
    if (rev.length) for (const r of rev) failures.push(`C2 反向自检：${r}`)
    else
      console.log(
        `  ✓ C2 反向自检 4 例全部被抓到（18pt 正文 / 矮框 / 越页脚 / lean 的 10 页撞 rich 区间）——上面那些 ✓ 不是空转`
      )
  }
  /* -------- C3. lesson 学生版三档真出片（第二十轮第 1 条）：20 / 30 / 40 都必须过 validate 并真导出 -------- */
  console.log('\n=== C3. lesson 学生版 20 / 30 / 40 三档真导出（生成 → validateSlides → downloadPptx → unzip 数页）===')
  {
    const base = CASES[0][1]
    const tiers: [number, string][] = [
      [1200, 'm20'],
      [1800, 'm30'],
      [2400, 'm40'],
    ]
    const seenPages: number[] = []
    rmSync(KEEP_DIR, { recursive: true, force: true })
    mkdirSync(KEEP_DIR, { recursive: true })
    for (const [duration, tier] of tiers) {
      const plan = planForScale(base, duration)
      const lim = limitsFor('standard', 'lesson', duration)
      const range = slideRangeFor(duration)
      const slides = getBuiltinStudentSlides(plan, lim)
      seenPages.push(slides.length)
      const v = validateSlides(slides, lim)
      if (!v.ok)
        failures.push(`lesson-${tier}: 学生版没通过 validateSlides —— ${v.problems.slice(0, 4).join('；')}`)
      if (!(slides.length >= range.min && slides.length <= range.max))
        failures.push(`lesson-${tier}: 生成 ${slides.length} 页，不在 ${range.min}–${range.max}（slideRangeFor）`)
      // 先把逐页清单打出来（不依赖导出成功）：校验翻红时，人先看到的是哪一页不对
      console.log(
        `  ${tier.padEnd(4)} ${String(duration / 60).padStart(2)} 分钟 | ${slides.length} 页（本档区间 ${range.min}–${range.max}）| validate ${v.ok ? '✓' : '✗'}`
      )
      if (!v.ok) for (const p of v.problems) console.log(`        ✗ ${p}`)
      slides.forEach((s, i) => {
        const items = (s.items ?? []).length ? `｜${(s.items ?? []).join(' / ')}` : ''
        console.log(`      ${String(i + 1).padStart(2)} ${s.kind.padEnd(10)} ${s.title}${s.line ? `｜${s.line}` : ''}${items}`)
      })
      const file = `${OUT_DIR}/lesson-${tier}.pptx`
      try {
        // limits 必须跟着这一叠走：downloadPptx 内部默认是三档并集（clip 的 10–14），
        // 不传就是「学生版一按就炸」本身（第二十轮第 1 条的回归线）
        const res = await downloadPptx(slides, undefined, file, undefined, { limits: lim })
        if (res.pages !== slides.length)
          failures.push(`lesson-${tier}: 导出回报 ${res.pages} 页，应为 ${slides.length}`)
      } catch (e) {
        failures.push(`lesson-${tier}: 真导出抛错（就是「学生版一按就炸」）—— ${errMsg(e)}`)
        continue
      }
      const names = zipEntryNames(file).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      if (names.length !== slides.length)
        failures.push(`lesson-${tier}: 解包只有 ${names.length} 页 slideN.xml，应为 ${slides.length}`)
      const kept = `${KEEP_DIR}/《桂花雨》学生版-${duration / 60}分钟.pptx`
      copyFileSync(file, kept)
      console.log(`       → zip slide ${names.length} | ${statSync(file).size} 字节 | 留一份：${kept}`)
    }
    // 选时长必须真有用：三档页数递增，否则「选 40 分钟也还是那一叠」的 bug 又回来了
    if (!(seenPages[0] < seenPages[1] && seenPages[1] < seenPages[2]))
      failures.push(`lesson 三档页数 ${seenPages.join(' / ')} 不是递增的（选时长又没用了）`)
  }

  /* -------- C4. 学科交叉污染 + 学科词误用（第二十一轮第 4 条） -------- */
  console.log('\n=== C4. 四篇内置交叉扫（A 课不许出现 B 课的专有词）+ 数学/科学扫语文经验词 ===')
  {
    /*
     * 只属于某一课的专有词。通用词（书、读、看、说、写、做）不算——
     * 那种词所有课都有，写进词表只会让这条判据变成噪音。
     */
    const OWN_WORDS: Record<string, string[]> = {
      guihua: ['桂花', '摇', '香'],
      changzheng: ['长征', '雪山', '草地'],
      changfangti: ['长方体', '棱', '顶点'],
      bidaxiao: ['比大小', '香蕉'],
    }
    /* 生成的学生页上不许出现只有页型名、没有内容的标题（第 2 条） */
    const BARE_TITLES = [
      '读进去', '想一想', '说一说', '做一做', '练一练', '看这儿',
      '比一比', '先看这张图', '最后一句', '记住这句话', '最后一问',
      '今天三件事', '课后两件事',
    ]
    const builtin = CASES.filter(([name]) => name in OWN_WORDS)
    const before = failures.length
    let decks = 0
    for (const [name, plan] of builtin) {
      for (const duration of [1200, 1800, 2400]) {
        const slides = getBuiltinStudentSlides(planForScale(plan, duration), limitsFor('standard', 'lesson', duration))
        decks++
        const text = slides
          .map((s) => [s.title, s.line ?? '', ...(s.items ?? []), s.notes].join(' '))
          .join(' ')
        for (const [other, words] of Object.entries(OWN_WORDS)) {
          if (other === name) continue
          /* 扫之前先抹掉这一课自己的专有词：数学课说「香蕉」，那个「香」不是桂花味。
             抹掉只针对单字互相包含的情况，A 课真写了「桂花」一样会被抓到。 */
          let scan = text
          for (const own of OWN_WORDS[name]) scan = scan.split(own).join('　')
          const hit = words.filter((w) => scan.includes(w))
          if (hit.length) failures.push(`C4 ${name} ${duration / 60}分钟： 出现 ${other} 课的专有词 ${hit.join('、')}`)
        }
        const zh = chineseOnlyHits(text, subjectKeyOf(plan.meta?.subject))
        if (zh.length)
          failures.push(`C4 ${name} ${duration / 60}分钟：${plan.meta?.subject}课里出现语文经验词 ${zh.join('、')}`)
        const bare = slides.map((s) => String(s.title ?? '').trim()).filter((t) => BARE_TITLES.includes(t))
        if (bare.length) failures.push(`C4 ${name} ${duration / 60}分钟：标题只是页型名 ${bare.join('、')}`)
      }
    }
    if (failures.length === before)
      console.log(`  ✓ ${decks} 份学生版（4 篇 × 20/30/40 分钟）：零串味、零语文词误用、零页型名标题`)

    // 交付取证：这两篇的 40 分钟前 10 页，逐句打印，供人直接看
    for (const name of ['changfangti', 'changzheng']) {
      const plan = builtin.find(([n]) => n === name)?.[1]
      if (!plan) continue
      const slides = getBuiltinStudentSlides(planForScale(plan, 2400), limitsFor('standard', 'lesson', 2400))
      console.log(`  ${name} 40 分钟：${slides.length} 页，前 10 页——`)
      slides.slice(0, 10).forEach((s, i) => {
        const items = (s.items ?? []).length ? `｜${(s.items ?? []).join(' / ')}` : ''
        console.log(`    ${String(i + 1).padStart(2)} ${s.kind.padEnd(10)} ${s.title}${s.line ? `｜${s.line}` : ''}${items}`)
      })
    }
  }

} finally {
  rmSync(OUT_DIR, { recursive: true, force: true })
}
if (audits.length) {
  console.log(
    `  补充：ppt/theme/theme1.xml（pptxgenjs 默认主题）自带 gradFill/effectLst 共 ${audits[0].themePool} 处，` +
      `它们住在 fillStyleLst/effectStyleLst 备用池里；页面 a:style 引用计数 ${audits.reduce((n, a) => n + a.aStyle, 0)}，`
  )
  console.log('        所以不会被渲染，不计入违规（真正要管的是上面“渲染范围”那一列：slides/masters/layouts/notesSlides/presentation）')
}

/* -------- 汇总表 -------- */
console.log('\n=== 汇总表（任务 07 验收量化证据）===')
const head = [
  '示例',
  '课件页',
  '学生页',
  '演示页',
  'pptx页',
  '最长正文',
  '内容最低sz',
  '标题最低sz',
  '正文最低sz',
  '字词最低sz',
  '字词行高in/行',
  '封面sz',
  '备注数',
  '禁词命中',
]
const rows = data.reports.map((r) => {
  const a = audits.find((x) => x.name === r.name)
  return [
    r.name,
    String(r.deckPages),
    String(r.slidePages),
    String(r.demoPages),
    a ? String(a.slideCount) : '-',
    `${r.longestBody}/${r.bodyCap}（${r.bodyCapTier}）`,
    a ? String(a.minContentSz) : '-',
    a ? String(a.minTitleSz) : '-',
    a ? String(a.minBodySz) : '-',
    a ? String(a.minWordsSz || '-') : '-',
    a && Number.isFinite(a.minWordsLineIn) ? a.minWordsLineIn.toFixed(3) : '-',
    a ? String(a.coverTitleSz ?? '-') : '-',
    a ? `${a.notesNonEmpty}/${a.notesCount}` : '-',
    a ? String(a.forbiddenRawHits) : '-',
  ]
})
const widths = head.map((_, i) =>
  Math.max(...[head, ...rows].map((row) => visualWidth(row[i] ?? '')))
)
const line = (cells: string[]) =>
  cells.map((c, i) => c + ' '.repeat(Math.max(0, widths[i] - visualWidth(c)))).join('  ')
console.log('  ' + line(head))
console.log('  ' + widths.map((w) => '-'.repeat(w)).join('  '))
for (const row of rows) console.log('  ' + line(row))
console.log(
  `\n  期望：课件 ${DECK_PAGES_EXPECT} 页（clip 档 ${DECK_PAGES_RANGE.min}–${DECK_PAGES_RANGE.max}，09 §S）| 学生版 = 演示 = pptx 且页数在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 区间、三列一致（§五.2/7）| ` +
    `正文 ≤ 该例生效档上限（内置 / 泛化这一叠按 ${data.reports[0]?.bodyCapTier ?? 'standard'} 档 = ${data.reports[0]?.bodyCap ?? DENSITY.standard.bodyChars} 字，按档取值见 density.ts；三档真出片取证见上面 C2）| sz 下限 标题 ${POINT_FLOOR.title} 正文 ${POINT_FLOOR.body} 字词 ${POINT_FLOOR.words} 封面 ${POINT_FLOOR.coverTitle}（§三）| ` +
    `字词行高 ≥${WORDS_LINE_MIN_IN}in/行（任务 #4）`
)

/* normAutofit 隐患告警：经验模型有误差，只打印不阻断 */
const warnAll = audits.flatMap((a) => a.xmlWarnings.map((w) => `${a.name} ${w}`))
if (warnAll.length) {
  console.log(`\n  ⚠ normAutofit 隐患估算（warning，不阻断，共 ${warnAll.length} 条）：`)
  warnAll.forEach((w) => console.log('      - ' + w))
} else {
  console.log('\n  ✓ 各内容框高度均无明显 normAutofit 隐患（字词页已由硬断言守定 ≥0.9in/行）')
}

/* -------- D. 校验器自检：拿假 XML 故意为难它，确认上面那些 ✓ 不是空转 -------- */
console.log('\n=== D. 校验器自检（反向用例，证明字号/禁词检查真会报错）===')
const selfFailures = await selfTest()
if (selfFailures.length === 0) {
  console.log(`  ✓ ${SELF_CASES} 条反向用例全部被抓到，合规伪页零误报（也证明了 <a:endParaRPr/> 确实没污染 sz 统计）`)
} else {
  for (const s of selfFailures) console.log('  ✗ ' + s)
}
failures.push(...selfFailures)

if (failures.length) {
  console.error(`\n✗ 校验失败，共 ${failures.length} 处：`)
  failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}
console.log(`\n✓ ${CASES.length} 例全通过：页数三列一致且落在 10–14 区间、正文不超当前档上限、每页含问句、备注非空、字号达标、禁词 0、无渐变/阴影/圆角、网络不可达时仍交出合规页面。`)
console.log(`  清理：${OUT_DIR} 已删除，仓库内不留下 .pptx；打包出的 scripts/.check-pptx.mjs 由 npm script 本身删除。`)

/* -------- 工具 -------- */
function visualWidth(s: string): number {
  let n = 0
  for (const ch of s) n += /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF　-〿＀-￯]/.test(ch) ? 2 : 1
  return n
}

/* -------- 校验器自检 -------- */

/** 造一个文本框；故意带上 <a:endParaRPr sz="9999">，取不到就证明末行隐形属性被剔干净了 */
function sp(sz: number, text: string): string {
  return (
    `<p:sp><p:txBody><a:p><a:r><a:rPr lang="zh-CN" sz="${sz}" dirty="0"/>` +
    `<a:t>${text}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="9999" dirty="0"/></a:p></p:txBody></p:sp>`
  )
}

/** 合成一个带几何的字词框：cy 英寸 + N 个 5400 段落。故意把框压矮，验证框高断言不空转 */
function wordsBoxSp(cyIn: number, texts: string[]): string {
  const cy = Math.round(cyIn * EMU_PER_IN)
  const paras = texts
    .map((t) => `<a:p><a:r><a:rPr lang="zh-CN" sz="5400" dirty="0"/><a:t>${t}</a:t></a:r></a:p>`)
    .join('')
  return (
    `<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="${cy}"/></a:xfrm></p:spPr>` +
    `<p:txBody>${paras}</p:txBody></p:sp>`
  )
}

function collectViolations(xml: string, slide: StudentSlide, at: string): string[] {
  const out: string[] = []
  auditSlideXml(xml, slide, at, (m) => out.push(m))
  return out
}

/**
 * 反向用例：每项都得被拦住，否则说明前面那张汇总表里的 ✓ 是空转。
 * N0 是正例（合规伪页零告警），拦住「检查器见什么报什么」这种反向失效。
 */
async function selfTest(): Promise<string[]> {
  const errs: string[] = []
  const need = (label: string, msgs: string[], re: RegExp) => {
    if (!msgs.some((m) => re.test(m))) {
      errs.push(`${label} 没被抓到（实得 ${msgs.length ? msgs.join(' | ') : '零条违规——说明这项检查在空转'}）`)
    }
  }
  const needNone = (label: string, msgs: string[]) => {
    if (msgs.length) errs.push(`${label} 应该零告警，却报了：${msgs.join(' | ')}`)
  }
  const page = (...boxes: string[]) => boxes.join('')

  // N0 合规封面页
  needNone(
    'N0 合规封面页',
    collectViolations(
      page(sp(1100, '课题　'), sp(4800, '桂花雨'), sp(2800, '雨，也可以是香的？'), sp(900, '桂花雨'), sp(900, '1 / 10')),
      { kind: 'cover', title: '桂花雨', line: '雨，也可以是香的？', notes: 'x' },
      'N0'
    )
  )

  // N1 正文 18pt
  need(
    'N1 正文低于 24pt',
    collectViolations(
      page(sp(1100, '读进去　'), sp(4600, '读进去'), sp(1800, '为什么用“摇”？'), sp(900, '桂花雨'), sp(900, '5 / 10')),
      { kind: 'close-read', title: '读进去', line: '为什么用“摇”？', notes: 'x' },
      'N1'
    ),
    /1800 < 2400/
  )

  // N2 封面标题不到 48pt
  need(
    'N2 封面标题不是 48pt',
    collectViolations(
      page(sp(1100, '课题　'), sp(4000, '桂花雨'), sp(2800, '雨，也可以是香的？'), sp(900, '桂花雨'), sp(900, '1 / 10')),
      { kind: 'cover', title: '桂花雨', line: '雨，也可以是香的？', notes: 'x' },
      'N2'
    ),
    /封面标题 4000/
  )

  // N3 页面禁词
  need(
    'N3 标题里藏禁词',
    collectViolations(
      page(sp(1100, '三件事　'), sp(4600, '教学目标'), sp(2600, '先做哪一件？'), sp(900, '桂花雨'), sp(900, '3 / 10')),
      { kind: 'goals', title: '教学目标', line: '先做哪一件？', notes: 'x' },
      'N3'
    ),
    /命中禁词 教学目标/
  )

  // N4 字词页词行不到 54pt
  need(
    'N4 字词页词行不是 54pt',
    collectViolations(
      page(
        sp(1100, '字词关　'),
        sp(4600, '字词关'),
        `${'<p:sp><p:txBody>'}${
          '<a:p><a:r><a:rPr sz="2800"/><a:t>箩筐</a:t></a:r><a:endParaRPr sz="9999"/></a:p>' +
          '<a:p><a:r><a:rPr sz="2400"/><a:t>谁能读准？</a:t></a:r><a:endParaRPr sz="9999"/></a:p>'
        }${'</p:txBody></p:sp>'}`,
        sp(900, '桂花雨'),
        sp(900, '4 / 10')
      ),
      { kind: 'words', title: '字词关', items: ['箩筐'], line: '谁能读准？', notes: 'x' },
      'N4'
    ),
    /字词「箩筐」2800/
  )

  // N5 被排除的装饰框里偷放正文（字号不再是 9pt）
  need(
    'N5 页脚框字号异常',
    collectViolations(
      page(sp(1100, '读进去　'), sp(4600, '读进去'), sp(2800, '为什么用“摇”？'), sp(2000, '桂花雨'), sp(900, '5 / 10')),
      { kind: 'close-read', title: '读进去', line: '为什么用“摇”？', notes: 'x' },
      'N5'
    ),
    /footer 框字号 2000/
  )

  // N6 标题框认不出来时必须报警，不能静默降级成正文下限
  // （整页只配装饰框：两个图位框 + 分类字 + 两行页脚，内容框为空 → 无标题可断言）
  need(
    'N6 没有标题框',
    collectViolations(
      page(sp(1100, '读进去　'), sp(1050, '图位'), sp(1050, '图位'), sp(900, '桂花雨'), sp(900, '5 / 10')),
      { kind: 'close-read', title: '读进去', line: '为什么用“摇”？', notes: 'x' },
      'N6'
    ),
    /没认出标题框/
  )

  // N7 导出侧第二道防线：不合格就 throw，不许静默出片
  const bad: StudentSlide[] = [
    { kind: 'cover', title: '教学目标', notes: '' },
    { kind: 'hook', title: '想一想', line: '这是一句根本不可能有问号的长正文，专门用来撑破三十字上限的。', notes: '' },
  ]
  let thrown = ''
  try {
    await downloadPptx(bad, undefined, `${OUT_DIR}/selftest-n7.pptx`)
  } catch (e) {
    thrown = e instanceof PptxSlidesInvalidError ? 'PptxSlidesInvalidError' : errMsg(e)
  }
  if (thrown !== 'PptxSlidesInvalidError') {
    errs.push(`N7 不合格页面应当抛 PptxSlidesInvalidError，实得「${thrown || '没报错，静默出片了'}」`)
  }

  // N8 字词页框高不足（#4 回归线）：4 个 54pt 词挤在 1.2in 的框里 → 每行 0.3in < 0.9in，必须被抓
  need(
    'N8 字词框高不足（normAutofit 隐患）',
    collectViolations(
      page(
        sp(1100, '字词关　'),
        sp(4600, '字词关'),
        wordsBoxSp(1.2, ['篣筐', '杭州', '浸润', '缠绕']),
        sp(2400, '谁能读准？'),
        sp(900, '桂花雨'),
        sp(900, '4 / 10')
      ),
      {
        kind: 'words',
        title: '字词关',
        items: ['篣筐', '杭州', '浸润', '缠绕'],
        line: '谁能读准？',
        notes: 'x',
      },
      'N8'
    ),
    /字词框高/
  )

  return errs
}
