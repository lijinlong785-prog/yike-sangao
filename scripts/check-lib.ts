/**
 * 任务 07 离线校验的共用数据层（check-slides.ts 与 check-pptx.ts 都从这里取结果，
 * 两份脚本因此不会有各自的第二套判断标准）。
 *
 * 本文件只碰纯函数：不生成文件、不发请求；只有主题那一段会读两份 CSS 做对账。
 * 覆盖 TASKS/07 §五 的第 1/2/4/5/7/8 条：
 *   1  课件页数落在 clip 区间（buildDeck 回归；09 §S 起页数由时长驱动，
 *      内置 5 环节 = 12 页，区间真源见 scale.ts）
 *   2  学生版 10 页（§三 页序骨架：10 个页型 + 精读可 2 页，这里四例都是 10）
 *   4  每页正文 ≤ 30 字（bodyCharCount）
 *   5  每页含问句（hasQuestion）+ 备注非空（validateSlides 内含）
 *   7  演示侧页数 == slides.length == countPptxPages(slides)
 *   8  无 API Key 时内置示例与泛化路径都能出完整学生版，且一次请求都不发
 * 以及 TASKS/09 第 9 件的纸面断言（collectThemeChecks）：四条硬约束（明度 80–97%、
 * 彩度 ≤ 8%、正文对比度 ≥ 4.5:1、主纸↔封面纸色差 ≥ 20）与数学/英语的宣纸印章红线，
 * 全部用「构造越界方案必须变红」的反向用例证明；再对墨与朱兜底纸面做与 :root /
 * 与 pptx 原硬编码的逐字回归。
 *
 * 字号（第 6 条）只能在真出片的 .pptx 里取证，见 check-pptx.ts。
 */
import { readFileSync } from 'node:fs'
import type { LessonPlan } from '../src/types'
import { CUBE_FACES, type Track, type TrackNode } from '../src/data/anim'
import { biDaXiao } from '../src/data/bidaxiao'
import { changFangTi } from '../src/data/changfangti'
import { guihuaYu } from '../src/data/guihua'
import { qiLvChangZheng } from '../src/data/changzheng'
import { heTangYueSe } from '../src/data/hetang'
import { chun } from '../src/data/chun'
import { beiYing } from '../src/data/beiying'
import { fenShu } from '../src/data/fenshu'
import { yuanMianJi } from '../src/data/yuanmianji'
import { buildDeck } from '../src/lib/deck'
import { planOfScale } from '../src/lib/scale'
import type { LLMConfig } from '../src/lib/llm'
import { allocate } from '../src/lib/timing'
import { countPptxPages, paletteOf } from '../src/lib/pptx'
import {
  HINT_AUTO_HIDE_MS,
  HINT_TEXT,
  PART_NOTE_MAX,
  COMPARE_HINT_MAX,
  buildScenes,
  comparePairOf,
  hintOnAutoHide,
  hintOnDisableKey,
  hintOnPageEnter,
  initialHintState,
  interactiveModeOf,
  pathStepOf,
  stepsOf,
  type ShowScene,
} from '../src/lib/show'
import { DEFAULT_THEME, gridTexture, themeStyle, themeVars, type DeckTheme } from '../src/lib/theme'
import {
  SCHEME_LIMITS,
  chroma,
  contrastRatio,
  lightness,
  rgbDistance,
  schemeFromJSON,
  schemeIssues,
  schemeProblems,
  subjectProblems,
} from '../src/lib/scheme'
import {
  SLIDE_FORBIDDEN,
  SLIDE_LIMITS,
  SLIDE_POINTS,
  bodyCharCount,
  buildStudentSlides,
  compareDiffProblems,
  findForbidden,
  floatTextProblems,
  genericSlides,
  getBuiltinStudentSlides,
  hasQuestion,
  normalizeSlides,
  validateSlides,
  type StudentSlide,
} from '../src/lib/slides'
import {
  DEFAULT_DENSITY,
  DEFAULT_LIMITS,
  DENSITY,
  DENSITY_ORDER,
  ENVELOPE,
  PAGE_RANGE,
  WORDS_ITEMS_MAX,
  densityFingerprint,
  limitsOf,
  type DensityLimits,
  type DensityLock,
} from '../src/lib/density'

/**
 * 课件页数区间：09 §S 起由时长决定（clip 7+S、lesson 10+2S），区间只在 scale.ts 一处定义。
 * 内置示例都是 5 环节 → clip 12 页，所以下限就是这一叠用例的期望值。
 */
export const DECK_PAGES_RANGE = planOfScale('clip').deckPages
/** 课件期望页数（= clip 区间下沿，内置 5 环节正好 12 页）：只用于文案与表头，断言走 DECK_PAGES_RANGE */
export const DECK_PAGES_EXPECT = DECK_PAGES_RANGE.min
/** 课件页数是否落在 clip 区间 */
export const inDeckBand = (n: number): boolean => n >= DECK_PAGES_RANGE.min && n <= DECK_PAGES_RANGE.max
/**
 * 学生版页数下限参照（= 三档并集下沿）。08 §B 起页数不再是单一数字：
 * 断言一律走 SLIDES_PAGES_RANGE（10–14）+ 三列一致，保留常量只为旧 import 与文案。
 */
export const SLIDES_PAGES_EXPECT = PAGE_RANGE.min
/** 离线页数区间：08 §B 把「必须 10 页」放宽成三档并集 10–14 页 */
export const SLIDES_PAGES_RANGE = PAGE_RANGE
/** 页数是否落在三档并集区间 */
export const inSlidesBand = (n: number): boolean => n >= SLIDES_PAGES_RANGE.min && n <= SLIDES_PAGES_RANGE.max

/** 五个用例：四个内置示例 + 一条「手输课题、没有 Key」的泛化路径。
 * 第六条是超长课题（≥20 字、无《》、不命中任何内置示例），
 * 专门守住任务 #1：长课题拼进 cover/end 问句后仍必须出 10 页合规。
 * 第十五轮内置课扩容后，新增的五篇也在表里，手写学生版不验收等于没写。*/
export const LONG_TOPIC = '描写自然景观与作者思乡情感的散文阅读策略综合复习课'
export const CASES: [string, LessonPlan][] = [
  ['guihua', guihuaYu],
  ['bidaxiao', biDaXiao],
  ['changfangti', changFangTi],
  ['changzheng', qiLvChangZheng],
  ['hetang', heTangYueSe],
  ['chun', chun],
  ['beiying', beiYing],
  ['fenshu', fenShu],
  ['yuanmianji', yuanMianJi],
  [
    'generic(司马光)',
    {
      ...guihuaYu,
      meta: { ...guihuaYu.meta, topic: '司马光', grade: '三年级', subject: '语文' },
    },
  ],
  [
    'generic(超长课题)',
    {
      ...guihuaYu,
      meta: { ...guihuaYu.meta, topic: LONG_TOPIC, grade: '五年级', subject: '语文' },
    },
  ],
]

export interface CaseReport {
  name: string
  topic: string
  /** 教师侧课件页数 */
  deckPages: number
  slides: StudentSlide[]
  /** 学生版页数（slides.length） */
  slidePages: number
  /** 网页演示侧页数（buildScenes 输出） */
  demoPages: number
  /** 导出侧页数（countPptxPages） */
  pptxPages: number
  longestBody: number
  longestBodyPage: number
  /** 该例的「生效档正文上限」：跟生成路径用的同一份 limits（08 §B，见 density.ts） */
  bodyCap: number
  /** 上面那个上限来自哪一档（写进表里免得读数的人猜） */
  bodyCapTier: DensityLock
  emptyNotes: number
  missingQuestion: number
  forbiddenHits: string[]
  problems: string[]
  warnings: string[]
  /** 「1.cover→cover(1步) 2.hook→reveal(4步) …」 */
  sceneLine: string
  ok: boolean
}

/**
 * 跑全部数据层断言。不 throw：把每例结果与失败原因都收进来，由调用方决定何时 exit 1，
 * 这样一次运行能看到所有问题，而不是撞到第一个就停。
 *
 * lock = 本轮离线产物的名义生成档（缺省 standard，与旧口径逐字一致）：
 * 内置 / 泛化那叠页面拿它走 getBuiltinStudentSlides(plan, limits)，「最长正文」这一列
 * 也拿同一个 limits.bodyChars 判。从前这里钉死 SLIDE_LIMITS.bodyChars（凑巧也是 60），
 * 将来产物按 rich 出片（≤90 字）就会假红——上限只从 density.ts 这一处来。
 */
export function collectDataChecks(lock: DensityLock = DEFAULT_DENSITY): {
  reports: CaseReport[]
  failures: string[]
} {
  const reports: CaseReport[] = []
  const failures: string[] = []
  const limits = limitsOf(lock)

  for (const [name, plan] of CASES) {
    const topic = String(plan.meta?.topic ?? '')
    const slides = getBuiltinStudentSlides(plan, limits)
    const check = validateSlides(slides)
    const scenes = buildScenes(slides)
    const pptxPages = countPptxPages(slides)

    let longestBody = 0
    let longestBodyPage = 0
    slides.forEach((s, i) => {
      const n = bodyCharCount(s)
      if (n > longestBody) {
        longestBody = n
        longestBodyPage = i + 1
      }
    })

    /* 封面不要求问句（TASKS/25）：封面是整堂课的门面——课题 + 教材册次 + 班级 + 一张图，
       问句留在备注里让老师上台念。其余每一页仍然必须有问句。 */
    const missingQuestion = slides.filter((s) => s.kind !== 'cover' && !hasQuestion(s)).length
    const forbiddenHits = slides.flatMap((s) => findForbidden(s))
    const emptyNotes = slides.filter((s) => !String(s.notes ?? '').trim()).length

    let deckPages = -1
    try {
      // 与界面同源：课件页由 buildDeck 从教案 + allocate 的时长切出来
      deckPages = buildDeck(plan, allocate(plan.segments, plan.meta.duration)).length
    } catch (e) {
      failures.push(`${name}: buildDeck 抛错 —— ${errMsg(e)}`)
    }

    const sceneLine = scenes
      .map((sc, i) => `${i + 1}.${sc.slide.kind}→${sc.template}(${stepsOf(sc)}步)`)
      .join(' ')

    reports.push({
      name,
      topic,
      deckPages,
      slides,
      slidePages: slides.length,
      demoPages: scenes.length,
      pptxPages,
      longestBody,
      longestBodyPage,
      bodyCap: limits.bodyChars,
      bodyCapTier: lock,
      emptyNotes,
      missingQuestion,
      forbiddenHits,
      problems: check.problems,
      warnings: check.warnings,
      sceneLine,
      ok:
        check.ok &&
        deckPages !== -1 &&
        inDeckBand(deckPages) &&
        inSlidesBand(slides.length) &&
        scenes.length === slides.length &&
        pptxPages === slides.length &&
        longestBody <= limits.bodyChars &&
        missingQuestion === 0 &&
        forbiddenHits.length === 0 &&
        emptyNotes === 0 &&
        check.warnings.length === 0,
    })

    if (deckPages !== -1 && !inDeckBand(deckPages)) {
      failures.push(
        `${name}: 课件 ${deckPages} 页，不在 clip 档的 ${DECK_PAGES_RANGE.min}–${DECK_PAGES_RANGE.max} 页区间（09 §S / scale.ts）`
      )
    }
    if (!inSlidesBand(slides.length)) {
      failures.push(`${name}: 学生版 ${slides.length} 页，应在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页区间（08 §B / §五.2）`)
    }
    if (!(scenes.length === slides.length && pptxPages === slides.length)) {
      failures.push(
        `${name}: 页数分叉 —— 演示 ${scenes.length} / slides ${slides.length} / pptx ${pptxPages}（§五.7）`
      )
    }
    if (longestBody > limits.bodyChars) {
      failures.push(
        `${name}: 第 ${longestBodyPage} 页正文 ${longestBody} 字，超 ${lock} 档的 ${limits.bodyChars} 字上限（§五.4 / 08 §B）`
      )
    }
    if (missingQuestion) failures.push(`${name}: ${missingQuestion} 页没有问句（§三 硬规则 / §五.4）`)
    if (emptyNotes) failures.push(`${name}: ${emptyNotes} 页备注为空（§五.5）`)
    if (forbiddenHits.length) failures.push(`${name}: 页面禁词命中 ${forbiddenHits.join('、')}（§五.3）`)
    for (const p of check.problems) failures.push(`${name}: validateSlides —— ${p}`)
    for (const w of check.warnings) failures.push(`${name}: 备注警告 —— ${w}`)
  }

  // 六例的课件页数必须一致：它们都是 5 环节的 clip 稿，页数不该因课题长短而变
  const deckCounts = [...new Set(reports.map((r) => r.deckPages).filter((n) => n !== -1))]
  if (deckCounts.length > 1) {
    failures.push(`六例课件页数不一致：${deckCounts.join(' / ')}（09 §S：clip 档页数只由环节数决定）`)
  }

  return { reports, failures }
}

/**
 * 无 Key 路径的确定性。
 *
 * TASKS/13 改了口径：没填 key 现在走同源 /api/sf（key 由服务端注入），所以要真发请求。
 * 这里把 fetch 打桩成一调就 throw，验的就不再是「零请求」，而是
 * 「接口/网络全都不可达时仍然交出合规页面」——代理挂了也不能把页面拖垮。
 */
export async function checkNoKeyDeterminism(): Promise<{
  failures: string[]
  lines: string[]
  calls: number
}> {
  const failures: string[] = []
  const lines: string[] = []
  let calls = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    calls++
    throw new Error('离线校验：网络不可达')
  }) as unknown as typeof fetch

  const cfg: LLMConfig = { baseUrl: '', apiKey: '', model: '' }
  // requestChat 的超时用 window.setTimeout；Node 里没有 window，临时垫上，
  // 否则这一路会早在“取请求”之前就抛，fetch 计数恒为 0，断言等于空转。
  const g = globalThis as unknown as { window?: unknown }
  const savedWindow = g.window
  g.window = globalThis
  try {
    for (const [name, plan] of CASES) {
      const slides = await buildStudentSlides(plan, cfg)
      const check = validateSlides(slides)
      lines.push(
        `${name.padEnd(16)} buildStudentSlides(无 Key) → ${slides.length} 页 | ` +
          `fetch 不可达 ${calls} 次 | ${check.ok ? 'validate ok' : 'validate ✗ ' + check.problems.join('；')}`
      )
      if (!inSlidesBand(slides.length)) {
        failures.push(`${name}: 无 Key 时 buildStudentSlides 出了 ${slides.length} 页，不在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 区间`)
      }
      if (!check.ok) failures.push(`${name}: 无 Key 时 validateSlides 不通过`)
    }
    if (calls === 0) failures.push('无 Key 路径一次 fetch 都没发：请求根本没走到网络层，这条断言是空转')
  } finally {
    globalThis.fetch = realFetch
    if (savedWindow === undefined) delete g.window
    else g.window = savedWindow
  }
  return { failures, lines, calls }
}

/**
 * 任务 #1 的回归线：超长课题（无 Key、不命中任何内置示例）必须能自救出 10 页合规。
 * getBuiltinStudentSlides / genericSlides / buildStudentSlides(无 Key) 三条路径全部过
 * validateSlides；只要有一条因为长课题被拼进问句而顶破 30 字，这里就会 exit 1。
 */
export async function checkLongTopic(): Promise<{ failures: string[]; lines: string[] }> {
  const failures: string[] = []
  const lines: string[] = []
  const plan: LessonPlan = {
    ...guihuaYu,
    meta: { ...guihuaYu.meta, topic: LONG_TOPIC, grade: '五年级', subject: '语文' },
  }
  const cfg: LLMConfig = { baseUrl: '', apiKey: '', model: '' }
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    throw new Error('离线校验：网络不可达')
  }) as unknown as typeof fetch
  const g = globalThis as unknown as { window?: unknown }
  const savedWindow = g.window
  g.window = globalThis
  try {
    const paths: [string, StudentSlide[]][] = [
      ['getBuiltinStudentSlides', getBuiltinStudentSlides(plan)],
      ['genericSlides', genericSlides(plan)],
      ['buildStudentSlides(无 Key)', await buildStudentSlides(plan, cfg)],
    ]
    for (const [label, slides] of paths) {
      const check = validateSlides(slides)
      const longest = slides.reduce((m, s) => Math.max(m, bodyCharCount(s)), 0)
      lines.push(
        `超长课题(${[...LONG_TOPIC].length}字) ${label} → ${slides.length} 页 | ` +
          `最长正文 ${longest} 字 | fetch 不可达 ${calls} 次 | ${check.ok ? 'validate ok ✓' : 'validate ✗ ' + check.problems.join('；')}`
      )
      if (!check.ok) failures.push(`超长课题 ${label}：validateSlides 不通过 —— ${check.problems.join('；')}`)
      if (!inSlidesBand(slides.length)) {
        failures.push(`超长课题 ${label}：${slides.length} 页，应在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页区间`)
      }
    }
  } finally {
    globalThis.fetch = realFetch
    if (savedWindow === undefined) delete g.window
    else g.window = savedWindow
  }
  return { failures, lines }
}

/**
 * 三档密度的可静态断言点（TASKS/08 §B）：不开浏览器、不打模型，纯拿 density.ts 的
 * 参数表与 validateSlides 的档位边界对账——各档字数/items/页数上限、字词页恒 ≤4 词、
 * 默认档 = standard、页数区间 = 三档并集 10–14、limitsOf 的锁档/并集语义，
 * 以及 §B 补漏那一条：档位指纹必须与 limitsOf 同源、并且真的接进了 student.ts 的缓存钥匙。
 */
export function collectDensityChecks(): { lines: string[]; failures: string[] } {
  const lines: string[] = []
  const failures: string[] = []
  const eq = (label: string, got: unknown, want: unknown) => {
    if (got !== want) failures.push(`${label}: 实得 ${String(got)}，应为 ${String(want)}`)
  }

  /* ① 默认档 = standard */
  eq('默认档 DEFAULT_DENSITY', DEFAULT_DENSITY, 'standard')
  eq('默认上限 DEFAULT_LIMITS.bodyChars', DEFAULT_LIMITS.bodyChars, DENSITY.standard.bodyChars)

  /* ② 三档逐格参数（任务书 §B.2） */
  const SPEC: Record<string, DensityLimits> = {
    lean: { bodyChars: 30, pagesMin: 10, pagesMax: 10, itemsMax: 4, closeReadMax: 2 },
    standard: { bodyChars: 60, pagesMin: 10, pagesMax: 12, itemsMax: 5, closeReadMax: 3 },
    rich: { bodyChars: 90, pagesMin: 12, pagesMax: 14, itemsMax: 6, closeReadMax: 3 },
  }
  for (const d of DENSITY_ORDER) {
    const got = DENSITY[d]
    const want = SPEC[d]
    for (const k of Object.keys(want) as (keyof DensityLimits)[]) {
      eq(`DENSITY.${d}.${k}`, got[k], want[k])
    }
  }

  /* ③ 字词页恒 ≤4 词（物理裁决，不随档位放宽） */
  eq('WORDS_ITEMS_MAX', WORDS_ITEMS_MAX, 4)

  /* ④ 页数区间 = 三档并集 10–14；ENVELOPE = 三档并集 */
  eq('PAGE_RANGE.min', PAGE_RANGE.min, 10)
  eq('PAGE_RANGE.max', PAGE_RANGE.max, 14)
  eq('ENVELOPE.pagesMin', ENVELOPE.pagesMin, PAGE_RANGE.min)
  eq('ENVELOPE.pagesMax', ENVELOPE.pagesMax, PAGE_RANGE.max)
  eq('ENVELOPE.bodyChars', ENVELOPE.bodyChars, Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].bodyChars)))
  eq('ENVELOPE.itemsMax', ENVELOPE.itemsMax, Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].itemsMax)))
  eq('ENVELOPE.closeReadMax', ENVELOPE.closeReadMax, Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].closeReadMax)))

  /* ⑤ limitsOf：锁档→该档引用，auto/未锁→ENVELOPE 引用 */
  for (const d of DENSITY_ORDER) {
    if (limitsOf(d) !== DENSITY[d]) failures.push(`limitsOf(${d}) 应返回该档上限对象`)
  }
  if (limitsOf('auto') !== ENVELOPE) failures.push(`limitsOf('auto') 应返回 ENVELOPE`)
  if (limitsOf(undefined) !== ENVELOPE) failures.push(`limitsOf(undefined) 应返回 ENVELOPE`)

  /* 合成合法填充页（cover/close-read 交替，都带问句、不踩禁词、notes 非空）。
   * 每页的问句带页号：第二十轮起 validateSlides 硬判「同一句不许上两页」。*/ 
  const filler = (n: number): StudentSlide[] =>
    Array.from({ length: n }, (_, i): StudentSlide => ({
      kind: i === 0 ? 'cover' : 'close-read',
      title: `第${i}页`,
      line: `第${i}页这一句好在哪里？`,
      notes: `第${i}页的讲解够长可以直接念给学生。`,
    }))

  /* ⑥ 页数边界（ENVELOPE 默认）：10/14 合格，9/15 不合格 */
  if (!validateSlides(filler(10)).ok) failures.push('validateSlides(10 页) 竟判不合格')
  if (!validateSlides(filler(14)).ok) failures.push('validateSlides(14 页 / ENVELOPE) 竟判不合格')
  if (validateSlides(filler(15)).ok) failures.push('validateSlides(15 页) 竟判合格（并集上沿应是 14）')
  if (validateSlides(filler(9)).ok) failures.push('validateSlides(9 页) 竟判合格（下沿应是 10）')

  /* ⑦ 字词页 5 词在任何档位都被拒 */
  const fiveWords: StudentSlide[] = [
    ...filler(9),
    { kind: 'words', title: '字词关', items: ['一二', '三四', '五六', '七八', '九十'], line: '谁能读准？', notes: '跟我读一遍这几个词，够了八个字。' },
  ]
  for (const d of DENSITY_ORDER) {
    if (!validateSlides(fiveWords, DENSITY[d]).problems.some((p) => p.includes('字词页')))
      failures.push(`${d} 档没拦住字词页 5 词（物理裁决恒 ≤${WORDS_ITEMS_MAX}）`)
  }

  /* ⑧ 非字词页 items：rich 放行 6 条，standard/lean 拦下 */
  const sixItems: StudentSlide = {
    kind: 'compare',
    title: '比一比',
    items: ['甲乙丙', '丁戊', '己庚', '辛壬', '癸子', '差在哪里？'],
    notes: '两边分开看，先看左边再看右边，够长。',
  }
  if (!validateSlides([...filler(11), sixItems], DENSITY.rich).ok)
    failures.push('rich 档应放行 6 条 items 的 12 页叠')
  if (!validateSlides([...filler(11), sixItems], DENSITY.standard).problems.some((p) => p.includes('items')))
    failures.push('standard 档应拦 6 条 items（上限 5）')
  if (!validateSlides([...filler(9), sixItems], DENSITY.lean).problems.some((p) => p.includes('items')))
    failures.push('lean 档应拦 6 条 items（上限 4）')

  /* ⑧b 正文超精简档、不超标准档：lean 拦正文、standard 放行 */
  const bodyPage: StudentSlide = {
    kind: 'close-read',
    title: '读进去',
    items: ['为什么这个词换成它就活了？', '第0条短语都写得很有画面感', '第1条短语都写得很有画面感', '第2条短语都写得很有画面感'],
    notes: '读这句的时候慢一点，答不上来就再做一遍动作。',
  }
  const bodyN = bodyCharCount(bodyPage)
  if (!(bodyN > DENSITY.lean.bodyChars && bodyN <= DENSITY.standard.bodyChars))
    failures.push(`密度用例正文 ${bodyN} 字未落在 (30,60]，用例失效（请调文本而非放宽判据）`)
  else {
    if (!validateSlides([...filler(9), bodyPage], DENSITY.standard).ok)
      failures.push('standard 应放行正文 ≤60 的一页')
    if (!validateSlides([...filler(9), bodyPage], DENSITY.lean).problems.some((p) => p.includes('正文')))
      failures.push('lean 应拦正文 >30 的一页')
  }

  /* ⑨ 六例内置/泛化产物页数都落在 10–14（standard 对 lean 手稿幂等，仍是 10） */
  for (const [name, plan] of CASES) {
    const n = getBuiltinStudentSlides(plan).length
    if (!inSlidesBand(n)) failures.push(`内置密度段 ${name}: ${n} 页不在 ${PAGE_RANGE.min}–${PAGE_RANGE.max} 区间`)
  }

  /* ⑩ 生成路径（normalizeSlides → harden/ensureQuestion/fitBudget）守住 #3/#5：
     门禁从前只把合成输入喂 validateSlides，没走这条真路径——本次字词页顶破 ≤4 词、
     board/drill/homework 条数就漏在这里。现在拿真 raw 经 normalizeSlides 走一遍再 validate。*/
  {
    const plan = CASES[0][1]
    // 无问句的 4 词字词页 + 非问句的 line：旧 ensureQuestion 会把补的问句 push 进词行撑到 5–6 词
    const rawDeck: unknown[] = [
      { kind: 'words', title: '字词关', line: '跟我读一遍', items: ['箩', '筐', '杭', '州'], notes: '跟我读一遍这四个词，够了八个字。' },
      { kind: 'board', title: '看这儿', line: '哪条最重？', items: ['一条甲', '二条乙', '三条丙', '四条丁', '五条戊'], notes: '黑板上的主线一行一行说，够八个字。' },
      { kind: 'drill', title: '练一练', line: '先读哪一条？', items: ['圈甲词', '圈乙词', '圈丙词', '圈丁词', '圈戊词'], notes: '题干在上口头在下，够八个字。' },
      { kind: 'homework', title: '课后', line: '哪件先做？', items: ['必做甲', '必做乙', '选做丙', '选做丁', '选做戊'], notes: '必做与选做各说一句，够八个字。' },
    ]
    const norm = normalizeSlides(rawDeck, plan, DEFAULT_LIMITS)
    const wordsOut = norm.find((s) => s.kind === 'words')
    if (!wordsOut) failures.push('生成路径 ⑩：normalizeSlides 没吐出字词页')
    else {
      const wc = (wordsOut.items ?? []).length
      if (wc > WORDS_ITEMS_MAX)
        failures.push(`生成路径 ⑩：无问句的 4 词字词页经 ensureQuestion 变 ${wc} 词（应恒 ≤${WORDS_ITEMS_MAX}，任务 #3）`)
      if (!hasQuestion(wordsOut)) failures.push('生成路径 ⑩：字词页经 ensureQuestion 后仍无问句')
    }
    for (const k of ['board', 'drill', 'homework'] as const) {
      const p = norm.find((s) => s.kind === k)
      if (!p) failures.push(`生成路径 ⑩：normalizeSlides 没吐出 ${k} 页`)
      else {
        const n = (p.items ?? []).length
        if (n > DENSITY.standard.itemsMax)
          failures.push(`生成路径 ⑩：${k} 页 items ${n} 条超 standard 上限 ${DENSITY.standard.itemsMax}`)
        if (!hasQuestion(p)) failures.push(`生成路径 ⑩：${k} 页没有问句`)
      }
    }
    const check = validateSlides(norm, DEFAULT_LIMITS)
    if (!check.ok) failures.push(`生成路径 ⑩：整叠经 normalizeSlides 后 validateSlides 不通过 —— ${check.problems.join('；')}`)
    lines.push(
      `生成路径⑩：4 词无问句字词页经 normalizeSlides → ${(wordsOut?.items ?? []).length} 词/有问句=${hasQuestion(wordsOut ?? ({} as StudentSlide))}；board/drill/homework 各 ${(norm.find((s) => s.kind === 'board')?.items ?? []).length} 条；整叠 validate=${check.ok ? 'ok' : '✗'}`
    )
  }

  /* ⑪ 档位指纹必须进缓存钥匙（08 §B 补漏 / 任务 #3 修复 1 的离线证据）：
     切档不重算 = 「standard 档信息量明显变多」这条验收在已经生成过的 plan 上永远复现不出来。
     两层证据：
       a) 纯函数层——densityFingerprint 四个取值两两不同，且与 limitsOf 的分辨力逐字一致（垃圾值归 auto）；
       b) 接线层——student.ts 的 ensure 里，成功缓存命中、in-flight 命中、两处写入都带上这把指纹。
          少任何一处都会退化成「换了档、拿旧页」，而那恰好是浏览器里最难看见的那种错。 */
  {
    const probes: (DensityLock | null | undefined)[] = ['lean', 'standard', 'rich', 'auto', undefined, null]
    const four = (['lean', 'standard', 'rich', 'auto'] as DensityLock[]).map((d) => densityFingerprint(d))
    if (new Set(four).size !== 4)
      failures.push(`档位指纹没把四态区分开：${four.join('/')}（切档会被 ensure 判成命中，§B.3 验收 1 复现不出来）`)
    for (const k of probes) {
      if (limitsOf(densityFingerprint(k)) !== limitsOf(k))
        failures.push(`densityFingerprint(${String(k)}) 与 limitsOf 不同源：钥匙里的档位和生成实际用的上限对不上`)
    }
    for (const junk of ['', 'STANDARD', 'LEAN', 'super', '0']) {
      const got = densityFingerprint(junk as DensityLock)
      if (got !== 'auto') failures.push(`垃圾档位值 ${JSON.stringify(junk)} 的指纹应是 auto，实得 ${got}`)
    }

    const src = readRepoFile('src/lib/student.ts')
    /* 钥匙现在是一整把（plan + 档位指纹 + 课件指纹，TASKS/17 §二.5）：
       四处命中判定统一走 sameDeckKey，两处写入摊整把钥匙——少任何一处都会退化成「换了档 / 改了课件、拿旧页」。 */
    const WIRED: [string, RegExp][] = [
      ['ensure 里的档位取自 densityFingerprint(cfg?.density)', /const\s+density\s*=\s*densityFingerprint\(\s*cfg\?\.density\s*\)/],
      ['钥匙由 deckKeyOf 组出来（plan + 档位 + 课件指纹）', /const\s+key\s*=\s*deckKeyOf\(\s*plan\s*,\s*density\s*,/],
      ['命中判定比 density', /a\.density\s*===\s*b\.density/],
      ['写缓存把整把钥匙摊进去', /cacheRef\.current\s*=\s*\{\s*\.\.\.key\b/],
      ['pendingRef 把整把钥匙摊进去', /pendingRef\.current\s*=\s*\{\s*\.\.\.key\b/],
    ]
    for (const [label, re] of WIRED) {
      if (!re.test(src)) failures.push(`档位指纹进钥匙的接线断了：src/lib/student.ts 里找不到「${label}」`)
    }
    /* sameDeckKey 出现次数 = 1 处定义 + 4 处命中（缓存 / 在飞 / 等待后缓存 / 等待后在飞） */
    const hits = (src.match(/sameDeckKey\(/g) ?? []).length
    if (hits < 5) failures.push(`档位指纹进钥匙的接线断了：sameDeckKey 应有 1 处定义 + 4 处命中，实得 ${hits} 处`)
    lines.push(
      `档位指纹进钥匙：四态 ${four.join('/')} 两两不同 | limitsOf 同源 ${probes.length} 探点 ✓ | 垃圾值归 auto ✓ | student.ts 接线 ${WIRED.length} 处 + 命中 ${hits - 1} 处 ✓`
    )
  }

  lines.push(
    `三档上限（字数/页数/items/精读）：` +
      DENSITY_ORDER.map((d) => `${d} ${DENSITY[d].bodyChars}/${DENSITY[d].pagesMin}-${DENSITY[d].pagesMax}/${DENSITY[d].itemsMax}/${DENSITY[d].closeReadMax}`).join('  ') +
      `  | 字词页恒 ≤${WORDS_ITEMS_MAX}  | 页数区间 ${PAGE_RANGE.min}–${PAGE_RANGE.max}  | 默认档 ${DEFAULT_DENSITY}`
  )
  return { lines, failures }
}

/** 字号下限（.pptx 里写成百分之一磅：40pt → sz="4000"） */
export const POINT_FLOOR = {
  title: SLIDE_POINTS.titleMin * 100,
  body: SLIDE_POINTS.bodyMin * 100,
  words: SLIDE_POINTS.wordsMin * 100,
  coverTitle: SLIDE_POINTS.coverTitle * 100,
}

export const FORBIDDEN_WORDS = SLIDE_FORBIDDEN

/** 两份脚本都按这一组常量判定，不再各自 import 一次 src/lib/slides */
export { SLIDE_LIMITS, SLIDE_POINTS }

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/* ================================================================== *
 * TASKS 09 §十三 第 9 件：AI 现场配色的离线断言
 *
 * 上一版这里是「六套主题表 + pickTheme 映射 26 条」。六套已经砍了，
 * 口径改成：色板由模型读课文现场给，这里只证三件事——
 *   ① 四条硬约束真的能红（用构造出来的越界方案逐条红一遍）；
 *   ② 数学 / 英语课的「宣纸印章」红线真的能红；
 *   ③ 兜底那张纸自己先得合格（否则「打回重配」退回的也是一张坏纸）。
 * 模型的「问 → 判 → 打回 → 兜底」异步链在 scripts/check-scheme.ts（那边能打 fetch 桩）。
 * ================================================================== */

/** 从仓库根读两份 CSS（npm run check 就是根目录跑，兼容上一级候选路径） */
function readRepoFile(rel: string): string {
  for (const p of [rel, `../${rel}`]) {
    try {
      return readFileSync(p, 'utf8')
    } catch {
      /* 下一个候选路径 */
    }
  }
  throw new Error(`读不到 ${rel}：离线校验需要从仓库根跑`)
}

/** pptx.ts 改造前的六个硬编码值：缺省纸面必须逐字对得上，导出零回归 */
const PPTX_BASELINE = {
  PAPER: 'FAF8F3',
  INK: '1E1C19',
  INK2: '56514A',
  CINNABAR: 'B23A2E',
  LINE: 'E2DCCD',
}

export function collectThemeChecks(): { lines: string[]; failures: string[] } {
  const lines: string[] = []
  const failures: string[] = []

  /* --- 1. 兜底那张纸自己先得合格 ---
     它不合格的话，「模型出框 → 退回兜底」退回的就是一张坏纸，界面照样会亮。 */
  const builtinIssues = schemeIssues(DEFAULT_THEME, '语文')
  if (builtinIssues.length) failures.push(`兜底纸面不合格：${builtinIssues.join('；')}`)

  /* --- 2. 四条硬约束的反向用例：构造一个越界方案，判据必须红 ---
     这一段的用意与“校验器自检”一样：正向全绿可能是空转，反向能红才算数。 */
  const bad = (patch: Partial<DeckTheme>): DeckTheme => ({ ...DEFAULT_THEME, ...patch })
  const mustRed = (label: string, theme: DeckTheme, needle: RegExp) => {
    const hits = schemeProblems(theme)
    if (!hits.some((h) => needle.test(h))) {
      failures.push(`反向用例失效：${label} 没被判据抓住（实得 ${JSON.stringify(hits)}）`)
    }
  }
  mustRed('纸太亮（明度 99%）', bad({ paper: '#fffdfa' }), /明度/)
  mustRed('封面纸太亮（明度 100%）', bad({ coverPaper: '#ffffff' }), /明度/)
  mustRed('纸太艳（彩度 66.7%）', bad({ paper: '#8fd42a' }), /彩度/)
  mustRed('正文对比度只有 ~1.2:1', bad({ ink: '#cfcac2' }), /对比度/)
  mustRed('次级字对比度不足', bad({ inkSoft: '#c9c3b9' }), /对比度/)
  mustRed('封面纸与主纸看不出区别（色差 6.2）', bad({ coverPaper: '#f8f5ee' }), /色差/)

  /* --- 3. 学科红线：数学 / 英语课出现宣纸印章直接判错，语文课不误判 --- */
  const sealTheme = bad({ motif: 'seal' })
  if (subjectProblems(sealTheme, '语文').length) failures.push('语文课的帘纹母题被误判成红线')
  for (const s of ['数学', '英语']) {
    if (!subjectProblems(sealTheme, s).some((p) => /宣纸|印章/.test(p))) {
      failures.push(`${s}课用了 seal 母题却没被判错`)
    }
    if (!subjectProblems(bad({ motif: 'silk' }), s).some((p) => /宣纸|帘纹/.test(p))) {
      failures.push(`${s}课用了 silk（宣纸帘纹）却没被判错`)
    }
    if (!subjectProblems(bad({ name: '宣纸册' }), s).some((p) => /宣纸/.test(p))) {
      failures.push(`${s}课的方案名写了「宣纸」却没被判错`)
    }
    if (subjectProblems(DEFAULT_THEME, s).length) {
      failures.push(`兜底纸面在${s}课上被红线误伤：${subjectProblems(DEFAULT_THEME, s).join('；')}`)
    }
  }

  /* --- 4. 四条约束的可读数值（给验收表用）--- */
  const paperLight = lightness(DEFAULT_THEME.paper)
  const paperChrom = chroma(DEFAULT_THEME.paper)
  const coverLight = DEFAULT_THEME.coverPaper ? lightness(DEFAULT_THEME.coverPaper) : paperLight
  const coverChrom = DEFAULT_THEME.coverPaper ? chroma(DEFAULT_THEME.coverPaper) : paperChrom
  const gap = DEFAULT_THEME.coverPaper ? rgbDistance(DEFAULT_THEME.paper, DEFAULT_THEME.coverPaper) : 0
  const inkContrast = contrastRatio(DEFAULT_THEME.ink, DEFAULT_THEME.paper)
  const softContrast = contrastRatio(DEFAULT_THEME.inkSoft, DEFAULT_THEME.paper)
  lines.push(
    `兜底纸面「${DEFAULT_THEME.name}」：主纸明度 ${paperLight.toFixed(1)}% / 彩度 ${paperChrom.toFixed(1)}% · ` +
      `封面纸明度 ${coverLight.toFixed(1)}% / 彩度 ${coverChrom.toFixed(1)}% · 两两底色差 ${gap.toFixed(1)}（≥${SCHEME_LIMITS.surfaceGapMin}）· ` +
      `正文对比度 ${inkContrast.toFixed(2)}:1 / 次级 ${softContrast.toFixed(2)}:1（≥${SCHEME_LIMITS.contrastMin}）`
  )
  lines.push(
    '四条硬约束反向用例：明度 99%/100% · 彩度 9.4% · 对比度 1.2:1 · 两两色差 6.2 全部被抓；' +
      '数学/英语的 seal / silk / 「宣纸」名字三条红线也都红' +
      (builtinIssues.length ? `（但兜底纸面本身 ${builtinIssues.length} 处不合格）` : '，兜底纸面零违规')
  )

  /* --- 8. themeVars：只注入「样式表真的在消费」的名字，不进 :root，不碰 --tool-* --- */
  const vars = themeVars(DEFAULT_THEME) as Record<string, string>
  for (const key of [
    '--paper',
    '--paper-deep',
    '--paper-line',
    '--ink',
    '--ink-2',
    '--cinnabar',
    '--cinnabar-soft',
    '--font-serif',
    '--font-sans',
    '--rule-width',
    '--paper-cover',
    '--deck-theme',
  ]) {
    if (!vars[key]) failures.push(`themeVars 少了 ${key}`)
  }
  if (Object.keys(vars).some((k) => k.startsWith('--tool-'))) failures.push('themeVars 不应覆盖 --tool-* 工具基准')
  if (vars['--paper'] !== DEFAULT_THEME.paper || vars['--cinnabar'] !== DEFAULT_THEME.accent) {
    failures.push('themeVars 的值与色板对不上')
  }
  if (!Object.keys(themeStyle({ ...DEFAULT_THEME, motif: 'lines' })).includes('backgroundImage')) {
    failures.push('themeStyle 没把 lines 纹理带进 style')
  }
  /* 纸色有两套来源，三处产物区必须同源：
     · 有模板（TASKS/20 起是常态）：预览页与 PPT 预览层取 template.paper，导出在 renderPlaced 里取 theme.paper；
     · 无模板（AI 配纸的回退）：预览退回 paperOf(theme, slide.kind)，导出走 paletteOf(t,'cover')。
     两边少一处，同一份纸就会在预览和下载之间对不上。 */
  try {
    const tplUsers = ['src/components/PptPreview.tsx', 'src/lib/pptx.ts', 'src/components/Result.tsx'].filter((f) =>
      /template\.paper|theme\.paper|template=/.test(readRepoFile(f))
    )
    if (tplUsers.length < 3) failures.push(`模板纸只被 ${tplUsers.length} 处消费（预览 / PPT 预览层 / 导出应各一处）`)
    lines.push(`模板纸消费者 ${tplUsers.length}/3：${tplUsers.join(' / ')}`)

    const coverUsers = ['src/styles.css', 'src/lib/pptx.ts', 'src/components/PptPreview.tsx'].filter((f) =>
      /paper-cover|'cover'|paperOf\(/.test(readRepoFile(f))
    )
    if (coverUsers.length < 3) failures.push(`封面纸只被 ${coverUsers.length} 处消费（预览 / 导出 / PPT 预览层应各一处）`)
    lines.push(`封面纸消费者 ${coverUsers.length}/3：${coverUsers.join(' / ')}`)

    /* 「打回重配」不许变静默改色：两次都出框时，问题清单得在界面上露一行。 */
    const pv = readRepoFile('src/components/Result.tsx')
    const css = readRepoFile('src/styles.css')
    if (!/themeReport/.test(pv) || !/pv-theme-note/.test(pv)) {
      failures.push('Result 没有渲染 themeReport：模型两次出框后会静默换成默认纸面')
    }
    if (!/\.pv-theme-note\s*\{/.test(css)) failures.push('styles.css 缺 .pv-theme-note，出框提示没有样式')
  } catch (e) {
    failures.push(`封面纸消费者对账失败 —— ${errMsg(e)}`)
  }
  /* 死别名门卫。上一版额外注入了一套 canonical 别名（--accent / --accent-soft / --ink-soft），
     全仓 var() 消费者实测为 0，只会在 devtools 里好看——那注释就成了骗人。现在反向断言：
     注入的每一个变量都要在两份样式表里有 var() 消费者。
     唯一例外 --deck-theme：它是自检 / ?theme= 调试钩子（值就是主题 id），没样式消费者。 */
  try {
    const cssText = readRepoFile('src/styles.css') + '\n' + readRepoFile('src/styles-show.css')
    const orphan = Object.keys(vars).filter(
      (k) => k.startsWith('--') && k !== '--deck-theme' && !cssText.includes(`var(${k}`)
    )
    if (orphan.length) {
      failures.push(`themeVars 注入了样式表不消费的死别名：${orphan.join(' / ')}（要么让样式真的改用，要么删掉注入）`)
    }
    if (vars['--deck-theme'] !== DEFAULT_THEME.id) {
      failures.push(`--deck-theme 应当是主题 id（自检钩子），实际 ${String(vars['--deck-theme'])}`)
    }
    lines.push(`themeVars 注入 ${Object.keys(vars).length} 个键，样式表消费者全对齐（--deck-theme 为自检钩子）`)
  } catch (e) {
    failures.push(`themeVars 消费者对账失败 —— ${errMsg(e)}`)
  }

  /* --- 9. 正向用例：一份合格的手写方案必须零问题 ---
     只看反向用例会漏掉「所有方案都被打回」这种极端：闸门太严 = 永远用兜底。 */
  const greenScheme: DeckTheme = {
    ...DEFAULT_THEME,
    id: 'ai:#eef1ea',
    name: '雨后苔痕',
    note: '读《爬山虎的脚》顺手配的一张湿绿纸。',
    paper: '#eef1ea',
    coverPaper: '#d5ddd2',
    paperDeep: '#e3e8de',
    paperLine: '#d8ded3',
    ink: '#22261f',
    inkSoft: '#5a6156',
    accent: '#8a4a3a',
    accentSoft: '#efe0da',
    motif: 'dots',
    source: 'ai',
  }
  const greenIssues = schemeIssues(greenScheme, '语文')
  if (greenIssues.length) failures.push(`合格方案被误判：${greenIssues.join('；')}`)
  lines.push(
    `合格方案「${greenScheme.name}」零违规：主纸明度 ${lightness(greenScheme.paper).toFixed(1)}% / 彩度 ${chroma(
      greenScheme.paper
    ).toFixed(1)}% · 正文对比度 ${contrastRatio(greenScheme.ink, greenScheme.paper).toFixed(2)}:1 · ` +
      `封面色差 ${rgbDistance(greenScheme.paper, greenScheme.coverPaper!).toFixed(1)}`
  )

  /* --- 10. 洗模型交回的 JSON：非六位色值 / 版式越界 / 学科红线 / 出框，四种都要退回 ---
     这里只证同步的「判」，异步的「问 → 打回 → 兜底」在 scripts/check-scheme.ts。 */
  const needs = (label: string, raw: unknown, subject: string, needle: RegExp) => {
    const r = schemeFromJSON(raw, subject, 12)
    if (r.theme) failures.push(`洗数据漏判：${label} 被当成合格方案采用了`)
    else if (!r.problems.some((p) => needle.test(p))) {
      failures.push(`洗数据：${label} 退回了，但原因里没有 ${needle}（实得 ${JSON.stringify(r.problems)}）`)
    }
  }
  const full = { name: '苔痕', motif: 'dots', paper: '#eef1ea', coverPaper: '#d5ddd2', paperDeep: '#e3e8de', paperLine: '#d8ded3', ink: '#22261f', inkSoft: '#5a6156', accent: '#8a4a3a', accentSoft: '#efe0da', ruleWidth: 1 }
  needs('纸写成了 red', { ...full, paper: 'red' }, '语文', /不是六位色值/)
  needs('纸写成了渐变', { ...full, paper: 'linear-gradient(#fff,#000)' }, '语文', /不是六位色值/)
  needs('纸太艳（彩度超 55%）', { ...full, paper: '#8fd42a' }, '语文', /彩度/)
  needs('数学课交了 seal 母题', { ...full, motif: 'seal' }, '数学', /印章/)
  if (schemeFromJSON({ ...full }, '语文', 12).theme === null) failures.push('洗数据：一份完全合格的方案被退了')
  const onePaper = schemeFromJSON({ ...full, coverPaper: undefined }, '语文', 12)
  if (!onePaper.theme) failures.push(`洗数据：只给一张纸（没有封面纸）本来合法，却被退：${onePaper.problems.join('；')}`)
  const layoutsCleaned = schemeFromJSON({ ...full, layouts: ['full', 'bogus', 'cards', 'cards', 'cards', 'cards', 'cards'] }, '语文', 3)
  if (layoutsCleaned.theme) {
    const ls = layoutsCleaned.theme.layouts ?? []
    if (ls.length !== 3) failures.push(`洗数据：layouts 应按页数裁到 3 条，实得 ${ls.length}`)
    if (ls[1] !== undefined) failures.push(`洗数据：非法版式 bogus 应被剔成空位，实得 ${String(ls[1])}`)
  }
  const named = schemeFromJSON({ ...full, name: '《苔痕》' }, '语文', 12)
  if (named.theme && /[《》]/.test(named.theme.name)) failures.push('洗数据：方案名里的书名号没洗掉')
  lines.push('洗数据四类退件 + 合格方案/单纸/越界版式/书名号四项清洗全部走查')

  /* --- 11. 无 Key 的确定性在 check-scheme.ts（那里能打 fetch 桩）；这里只钉死「兜底不依赖学科」 --- */
  if (DEFAULT_THEME.source !== 'builtin') failures.push('兜底纸面的 source 应为 builtin')
  for (const [name, plan] of CASES) {
    if (schemeIssues(DEFAULT_THEME, plan.meta.subject).length) {
      failures.push(`${name}（${plan.meta.subject}）落在兜底上却违规：${schemeIssues(DEFAULT_THEME, plan.meta.subject).join('；')}`)
    }
  }
  lines.push(`兜底纸面在 ${CASES.length} 个用例的学科下逐门复核，零违规（无 Key 全走这一张）`)

  /* --- 12. pptx 缺省色板逐字回归 --- */
  const pal = paletteOf(DEFAULT_THEME)
  for (const [k, v] of Object.entries(PPTX_BASELINE)) {
    if (pal[k as keyof typeof pal] !== v) {
      failures.push(`pptx 缺省色板 ${k}=${pal[k as keyof typeof pal]}，应为 ${v}（导出零回归）`)
    }
  }
  lines.push(`pptx paletteOf(墨与朱) = ${Object.values(pal).join('/')}`)

  /* --- 13. 墨与朱与 styles.css :root 逐字相同（§C.5.2 的数值版） --- */
  try {
    const css = readRepoFile('src/styles.css')
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
    const varOf = (name: string) => (rootBlock.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1] ?? '').trim()
    const pairs: [string, string][] = [
      ['paper', varOf('paper')],
      ['paper-deep', varOf('paper-deep')],
      ['paper-line', varOf('paper-line')],
      ['ink', varOf('ink')],
      ['ink-2', varOf('ink-2')],
      ['cinnabar', varOf('cinnabar')],
      ['cinnabar-soft', varOf('cinnabar-soft')],
    ]
    const themeVals: Record<string, string> = {
      paper: DEFAULT_THEME.paper,
      'paper-deep': DEFAULT_THEME.paperDeep,
      'paper-line': DEFAULT_THEME.paperLine,
      ink: DEFAULT_THEME.ink,
      'ink-2': DEFAULT_THEME.inkSoft,
      cinnabar: DEFAULT_THEME.accent,
      'cinnabar-soft': DEFAULT_THEME.accentSoft,
    }
    for (const [name, cssVal] of pairs) {
      // 这里不做任何大小写归一：DEFAULT_THEME 的色值已全部小写，:root 也是小写，「逐字」是字面意义。
      if (cssVal !== themeVals[name]) {
        failures.push(`墨与朱 ${name} 与 :root 逐字不同：:root=${cssVal || '没读到'} vs theme=${themeVals[name]}`)
      }
    }
    lines.push(`墨与朱 == :root（7 个变量逐字相同）：${pairs.map(([, v]) => v).join(' ')}`)
    if (/var\(--accent\)|--cinnabar:\s*#(?!b23a2e)/i.test(rootBlock)) {
      failures.push(':root 里出现了主题值（主题只能挂在容器上）')
    }
  } catch (e) {
    failures.push(`styles.css 对账失败 —— ${errMsg(e)}`)
  }

  /* --- 14. 底线 2/4 静态扇描 --- */
  try {
    const css = readRepoFile('src/styles.css')
    const showCss = readRepoFile('src/styles-show.css')
    for (const [label, text] of [['styles.css', css], ['styles-show.css', showCss]] as const) {
      const hits = ['linear-gradient', 'backdrop-filter'].filter((p) => text.includes(p))
      if (hits.length) failures.push(`${label} 出现禁用项：${hits.join(' / ')}`)
    }
    const showHex = showCss.match(/#[0-9a-fA-F]{3,8}/g) ?? []
    if (showHex.length) failures.push(`styles-show.css 仍有 hex（要求零）：${showHex.join(' ')}`)
    lines.push(`styles.css / styles-show.css 渐变与 backdrop-filter 0 命中 | styles-show.css hex ${showHex.length} 个`)

    /* 演示层里「退出 / 上一步 / 下一步」三颗控件的纸墨基准住在 styles.css 的 --tool-* 常量里，
       而引用方在 styles-show.css——这是一条跨文件依赖。浏览器实测过：一旦某个 --tool-* 改名或缺失，
       那条回写声明会变成 guaranteed-invalid，控件就退回继承 .show 上的主题 ink，被主题染色。
       所以这里把「用到的」和「定义的」两个集合对齐，缺一个就 exit 1。 */
    const toolUsed = [...new Set([...showCss.matchAll(/var\((--tool-[a-z0-9-]+)\)/g)].map((m) => m[1]))]
    const toolDefined = new Set([...css.matchAll(/(^|\n)\s*(--tool-[a-z0-9-]+)\s*:/gm)].map((m) => m[2]))
    const dangling = toolUsed.filter((v) => !toolDefined.has(v))
    if (dangling.length) {
      failures.push(`styles-show.css 引用了 styles.css 里没定义的纸墨基准：${dangling.join(' ')}（演示层控件会被主题染色）`)
    }
    if (toolUsed.length < 8) {
      failures.push(`演示层基准回写只覆盖 ${toolUsed.length} 个变量，应为 8 个（paper / paper-deep / paper-line / ink / ink-2 / ink-3 / cinnabar / cinnabar-soft）`)
    }
    lines.push(`--tool-* 基准：styles-show.css 用 ${toolUsed.length} 个 / styles.css 定义 ${toolDefined.size} 个 / 悬空 ${dangling.length} 个`)

    /* ruleWidth 必须在演示侧真的生效（返工第二轮：上一版这里五处分隔线全硬编码 1px，
       赭褐的 ruleWidth: 2 在网页演示里一点表现都没有）。口径：
       · 分隔线粗细一律 var(--rule-width, 1px)，样式表里不许再出现 border*: 1px；
       · 但工具本体（退出钮 / 底部控制条）不跟主题走，所以基准回写块里必须钉住 --rule-width: 1px，
         否则主题会把按钮边框变成 2px——那是底线 1（工具本体永远纸墨）。 */
    const hardRule = showCss.match(/border(-top|-bottom|-left|-right)?:\s*1px/g) ?? []
    if (hardRule.length) {
      failures.push(`styles-show.css 还有硬编码 1px 的分隔线 ${hardRule.length} 处，ruleWidth 在演示侧不生效：${hardRule.join(' / ')}`)
    }
    const ruleUsed = (showCss.match(/var\(--rule-width/g) ?? []).length
    if (ruleUsed < 6) {
      failures.push(`styles-show.css 只有 ${ruleUsed} 处分隔线消费 var(--rule-width)，应至少 6 处`)
    }
    if (!/\.show-exit,\s*\.show-foot\s*\{[^}]*--rule-width:\s*1px;/.test(showCss)) {
      failures.push('styles-show.css 的工具基准回写块没钉 --rule-width: 1px（赭褐会把退出钮和控制条边框撑到 2px）')
    }
    lines.push(`ruleWidth：styles-show.css ${ruleUsed} 处分隔线吃 var(--rule-width)，工具侧钉 1px，硬编码 1px ${hardRule.length} 处`)

    /* 三处应用必须同源：主题 ink 得同时走到演示页与预览页。上一版 .show 吃了、.pv-page 没吃，
       于是屏幕上的课件正文永远是 :root 的墨色，而导出的 .pptx 已经换成主题 ink。 */
    for (const [label, text, re] of [
      ['styles.css .pv-page', css, /\.pv-page\s*\{[^}]*color:\s*var\(--ink\);/],
      ['styles-show.css .show', showCss, /\.show\s*\{[^}]*color:\s*var\(--ink\);/],
    ] as const) {
      if (!re.test(text)) failures.push(`${label} 没吃主题 ink：预览与演示、导出会用上两种墨`)
    }
    lines.push('主题 ink：.pv-page 与 .show 两侧都已消费（三处应用同源）')

    const pkg = JSON.parse(readRepoFile('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    const anim = deps.filter((d) => /animat|gsap|motion|framer|lottie|anime/i.test(d))
    if (anim.length) failures.push(`引进了动画库（底线 4）：${anim.join(' / ')}`)
    lines.push(`package.json 依赖 ${deps.length} 个，无动画库`)
  } catch (e) {
    failures.push(`底线扇描失败 —— ${errMsg(e)}`)
  }

  return { lines, failures }
}

/* ================================================================== *
 * TASKS/08 §A.4：三页真交互的离线断言
 *
 * 这一轮唯一的可验收办法是把交互逻辑下沉成 show.ts 的纯函数，在这里红掉：
 *  ① stepsOf 四类返回值与 git HEAD 完全一致（函数体快照 + 合成用例 + 逐页节拍快照），
 *     键盘主线被动过就在这里 exit 1；
 *  ② buildScenes 仍 scenes.length === slides.length，交互页判定不改页数；
 *  ③ 六例的交互页分布逐篇打印并钉死：只允许 explode/compare/path 三类命中，
 *     其余页必须 null（A.4.5）；
 *  ④ 零件 noteShort ≤12 / 对比页 compareDiff 条数=对数且每条 ≤12，实际字符串逐条打印；
 *     另配合成反向用例（13 字浮出、条数不齐、越界行号、奇数尾巴、倒退跳站、I 键关闭后不再提示）；
 *  ⑤ 岔路样式存证：.cube-side 补齐、.show-cta 中性基准回写、零强调色占用可查。
 * ================================================================== */

/** git HEAD（a400bac）的 stepsOf 函数体原文；比对前做空白归一，改语义即红，单纯格式化不红 */
const STEPS_OF_HEAD_SRC = `export function stepsOf(scene: ShowScene): number {
  if (scene.template === 'reveal') {
    return Math.max(1, scene.items.length + (scene.question ? 1 : 0))
  }
  if (scene.template === 'explode') return 3
  if (scene.template === 'path') return Math.max(1, scene.track.nodes.length)
  return 1
}`

/** 六例逐页「kind→template(N步)」快照：与上面 stepsOf 快照合起来才是完整的键盘主线证明 */
const SCENE_LINE_HEAD: Record<string, string> = {
  guihua: '1.cover→cover(1步) 2.hook→reveal(3步) 3.goals→reveal(4步) 4.words→reveal(5步) 5.close-read→reveal(2步) 6.compare→reveal(3步) 7.board→path(3步) 8.drill→reveal(2步) 9.homework→reveal(3步) 10.end→reveal(1步)',
  bidaxiao: '1.cover→cover(1步) 2.hook→reveal(3步) 3.goals→reveal(4步) 4.words→reveal(5步) 5.close-read→reveal(2步) 6.compare→reveal(4步) 7.board→reveal(4步) 8.drill→reveal(4步) 9.homework→reveal(3步) 10.end→reveal(1步)',
  changfangti: '1.cover→cover(1步) 2.hook→reveal(3步) 3.goals→reveal(4步) 4.words→reveal(5步) 5.close-read→reveal(2步) 6.compare→explode(3步) 7.board→reveal(4步) 8.drill→reveal(3步) 9.homework→reveal(3步) 10.end→reveal(1步)',
  changzheng: '1.cover→cover(1步) 2.hook→reveal(3步) 3.goals→reveal(4步) 4.words→reveal(5步) 5.close-read→reveal(2步) 6.compare→reveal(3步) 7.board→path(9步) 8.drill→reveal(3步) 9.homework→reveal(3步) 10.end→reveal(1步)',
  /* hook 2 步：封面的问句挑进导入页 items（moveCoverAsk，不许丢字），reveal = items + 问句 */
  'generic(司马光)': '1.cover→cover(1步) 2.hook→reveal(2步) 3.goals→reveal(4步) 4.words→reveal(5步) 5.close-read→reveal(2步) 6.compare→reveal(3步) 7.board→reveal(4步) 8.drill→reveal(3步) 9.homework→reveal(3步) 10.end→reveal(1步)',
  'generic(超长课题)': '1.cover→cover(1步) 2.hook→reveal(1步) 3.goals→reveal(4步) 4.words→reveal(5步) 5.close-read→reveal(2步) 6.compare→reveal(3步) 7.board→reveal(4步) 8.drill→reveal(3步) 9.homework→reveal(3步) 10.end→reveal(1步)',
}

/** 全部用例的交互页分布快照：「页码:模式」；没列出来的页必须 interactiveModeOf === null。
 * 泛化路径的 compare 页没有 compareDiff（generic 兑底不会编造交互文案），
 * 按 §A 数据契约降级为不可点，所以两个 generic 例无交互页。
 * 后补的五篇只给了与 items 行数相等的 compareDiff，点击联动照旧生效。*/
const EXPECT_INTERACTIVE: Record<string, string> = {
  guihua: '6:compare 7:path',
  bidaxiao: '6:compare',
  changfangti: '6:explode',
  changzheng: '6:compare 7:path',
  hetang: '7:compare',
  chun: '7:compare',
  beiying: '7:compare',
  fenshu: '7:compare',
  yuanmianji: '7:compare',
  'generic(司马光)': '',
  'generic(超长课题)': '',
}

const visibleLen = (text: string): number => [...String(text ?? '')].length
const norm = (text: string): string => text.replace(/\s+/g, ' ').trim()

export function collectInteractionChecks(): { lines: string[]; failures: string[] } {
  const lines: string[] = []
  const failures: string[] = []

  /* --- ①a. stepsOf 函数体与 HEAD 逐字（空白归一后）相同 --- */
  try {
    const src = readRepoFile('src/lib/show.ts')
    const fn = src.match(/export function stepsOf[\s\S]*?\n\}/)?.[0] ?? ''
    if (!fn) failures.push('show.ts 里找不到 stepsOf —— 键盘主线的机器证明失效')
    else if (norm(fn) !== norm(STEPS_OF_HEAD_SRC)) {
      failures.push('stepsOf 函数体与 git HEAD 不一致：键盘主线被动了（A.4.4 硬判据）')
    }
  } catch (e) {
    failures.push(`stepsOf 快照比对读文件失败 —— ${errMsg(e)}`)
  }

  /* --- ①b. 四类场景的合成数值用例：cover=1 / reveal=items+问句 / explode=3 / path=节点数 --- */
  const slide0: StudentSlide = { kind: 'hook', title: 't', notes: 'n' }
  const nodes4: TrackNode[] = [0, 1, 2, 3].map((i) => ({ label: `n${i}`, caption: `c${i}`, x: i * 10, y: 0 }))
  const track4: Track = { id: 'synthetic', d: 'M 0 0 L 30 0', nodes: nodes4 }
  const synth: [string, ShowScene, number][] = [
    ['cover', { template: 'cover', slide: { ...slide0, kind: 'cover' } }, 1],
    ['reveal(2条目+问句)', { template: 'reveal', slide: slide0, items: ['a', 'b'], question: 'q？', figure: '', big: false, columns: false }, 3],
    ['reveal(空页)', { template: 'reveal', slide: slide0, items: [], question: '', figure: '', big: false, columns: false }, 1],
    ['explode', { template: 'explode', slide: slide0, items: ['a'], question: '', noteShorts: [] }, 3],
    ['path(4站)', { template: 'path', slide: slide0, track: track4, trail: [], question: '' }, 4],
  ]
  for (const [label, scene, want] of synth) {
    const got = stepsOf(scene)
    if (got !== want) failures.push(`stepsOf(${label}) = ${got}，HEAD 口径应为 ${want}`)
  }
  lines.push(`stepsOf 快照：函数体与 HEAD 逐字相同 + 合成 ${synth.length} 例数值对齐（cover 1 / reveal items+问句 / explode 3 / path 节点数）`)

  /* --- ②③ 逐例：页数不分叉 + 逐页节拍快照 + 交互页分布钉死 --- */
  let interactiveTotal = 0
  for (const [name, plan] of CASES) {
    const slides = getBuiltinStudentSlides(plan)
    const scenes = buildScenes(slides)
    if (scenes.length !== slides.length) {
      failures.push(`${name}: 加了交互判定后 scenes ${scenes.length} 页 ≠ slides ${slides.length} 页（§A 不许改页数）`)
    }

    const sceneLine = scenes
      .map((sc, i) => `${i + 1}.${sc.slide.kind}→${sc.template}(${stepsOf(sc)}步)`)
      .join(' ')
    const wantLine = SCENE_LINE_HEAD[name]
    if (wantLine && sceneLine !== wantLine) {
      failures.push(`${name}: 逐页节拍与 HEAD 快照不一致\n      实得 ${sceneLine}\n      期望 ${wantLine}`)
    }

    const hits: string[] = []
    scenes.forEach((sc, i) => {
      const mode = interactiveModeOf(sc.slide, sc)
      if (mode === null) return
      if (mode !== 'explode' && mode !== 'compare' && mode !== 'path') {
        failures.push(`${name} 第 ${i + 1} 页: 出现第四种交互模式 ${String(mode)}（A.4.5 只允许三类）`)
        return
      }
      // 命中页的交叉验证：compare 只能落在 reveal 两栏的 compare 页，其余两只能落在同名模板页
      const ok =
        (mode === 'explode' && sc.template === 'explode') ||
        (mode === 'path' && sc.template === 'path') ||
        (mode === 'compare' && sc.template === 'reveal' && sc.slide.kind === 'compare')
      if (!ok) failures.push(`${name} 第 ${i + 1} 页: mode=${mode} 与 template=${sc.template}/kind=${sc.slide.kind} 对不上`)
      hits.push(`${i + 1}:${mode}`)
    })
    interactiveTotal += hits.length
    const gotHits = hits.join(' ') || '（无）'
    const wantHits = EXPECT_INTERACTIVE[name] ?? ''
    if (gotHits !== (wantHits || '（无）')) {
      failures.push(`${name}: 交互页分布变了 —— 实得「${gotHits}」，期望「${wantHits || '（无）'}」（非交互页必须为 null）`)
    }
    lines.push(`交互页分布 ${name.padEnd(16)} ${gotHits} | 共 ${scenes.length} 页，其余 ${scenes.length - hits.length} 页 mode=null`)
  }
  if (interactiveTotal < 6) failures.push(`六例合计只有 ${interactiveTotal} 个交互页，期望至少 6（三类页都得在）`)

  /* --- ④ 真实数据：零件 noteShort ≤12 / compare 页 compareDiff 合格，实际字符串逐条打印 --- */
  const modeOfCase = (name: string, want: string) => {
    const plan = CASES.find(([n]) => n === name)?.[1]
    if (!plan) return null
    const scenes = buildScenes(getBuiltinStudentSlides(plan))
    return scenes.find((sc) => interactiveModeOf(sc.slide, sc) === want) ?? null
  }

  const expScene = modeOfCase('changfangti', 'explode')
  if (!expScene || expScene.template !== 'explode') {
    failures.push('changfangti 找不到 explode 交互页，零件 noteShort 无法取证')
  } else {
    const parts: string[] = []
    CUBE_FACES.forEach((face, i) => {
      const text = expScene.noteShorts[i] ?? face.noteShort
      const len = visibleLen(text)
      if (!text) failures.push(`零件 ${face.name}(#${i}) noteShort 为空`)
      if (len > PART_NOTE_MAX) failures.push(`零件 ${face.name}(#${i}) noteShort「${text}」${len} 字，超 ${PART_NOTE_MAX} 字上限`)
      parts.push(`${face.name}「${text}」${len}`)
    })
    lines.push(`拆解页 noteShort（changfangti p6，6 件全 ≤${PART_NOTE_MAX} 字）：${parts.join(' ')}`)
  }

  const diffParts: string[] = []
  for (const [name] of CASES) {
    const cmp = modeOfCase(name, 'compare')
    if (!cmp || cmp.template !== 'reveal') continue
    const diffs = cmp.slide.compareDiff ?? []
    const probs = compareDiffProblems(cmp.slide.compareDiff, cmp.items.length)
    if (probs.length) failures.push(`${name} 对比页 compareDiff 不合格：${probs.join('；')}`)
    if (floatTextProblems(undefined).length === 0) failures.push('floatTextProblems 对 undefined 应判非空')
    diffs.forEach((d, i) => {
      const len = visibleLen(d)
      if (len > COMPARE_HINT_MAX) failures.push(`${name} 对比页第 ${i + 1} 条「${d}」${len} 字，超 ${COMPARE_HINT_MAX} 字上限`)
    })
    diffParts.push(`${name}[${diffs.length}对]「${diffs.join('/')}」`)
  }
  if (diffParts.length < 3) failures.push(`只取证到 ${diffParts.length} 组 compare 交互页，期望至少 3（内置四篇除 changfangti 外三篇的 compare 页都带合格 compareDiff；changfangti 的 compare 页被 explode 征用，其 compareDiff 齐整性由 check-interactive ① 在数据层守）`)
  lines.push(`对比联动 compareDiff（命中 ${diffParts.length} 例，每条 ≤${COMPARE_HINT_MAX} 字）：${diffParts.join(' ')}`)

  for (const name of ['guihua', 'changzheng']) {
    const psc = modeOfCase(name, 'path')
    if (!psc || psc.template !== 'path') {
      failures.push(`${name} 找不到 path 交互页，跳站无法取证`)
      continue
    }
    const nodes = psc.track.nodes
    for (let i = 0; i < nodes.length; i++) {
      if (pathStepOf(i, nodes) !== i + 1) failures.push(`${name}: 跳站 #${i} 不可达（pathStepOf 返回 ${pathStepOf(i, nodes)}）`)
    }
    // 允许倒退：先跳末站再跳回首站，两步都必须成立
    if (pathStepOf(nodes.length - 1, nodes) !== nodes.length) failures.push(`${name}: 末站不可达`)
    if (pathStepOf(0, nodes) !== 1) failures.push(`${name}: 倒退跳站不生效`)
    if (pathStepOf(-5, nodes) !== 1 || pathStepOf(nodes.length + 9, nodes) !== nodes.length)
      failures.push(`${name}: 跳站越界未回落`)
    lines.push(`跳站 ${name}：${nodes.length} 站全可达、可倒退、越界回落 ✓`)
  }

  /* --- ④b. 合成反向用例：13 字浮出、条数不齐、奇数尾巴、越界行号、提示状态机 --- */
  if (PART_NOTE_MAX !== 12) failures.push(`PART_NOTE_MAX=${PART_NOTE_MAX}，§A.2① 硬线是 12`)
  if (COMPARE_HINT_MAX !== 12) failures.push(`COMPARE_HINT_MAX=${COMPARE_HINT_MAX}，§A 数据契约定的是 12`)
  if (floatTextProblems('这是一个很长很长没有标点符号需要裁断的零件说明文字').length === 0)
    failures.push('合成 19 字浮出文本未被校验器判超')
  if (floatTextProblems('').length === 0) failures.push('空浮出文本未被校验器判非空')
  if (floatTextProblems('不是天气，而是心情').length === 0) failures.push('命中语气禁句式（不是……而是……）的浮出文本未被拦下')
  if (compareDiffProblems(['一二三四五六七八九十一二三'], 2).length === 0)
    failures.push('13 字 compareDiff 未被判超')
  if (compareDiffProblems(['只有一条'], 4).length === 0)
    failures.push('两对只给一条 compareDiff 未被判条数不齐')
  if (compareDiffProblems([], 2).length === 0) failures.push('空 compareDiff 未被判缺失')
  if (compareDiffProblems(['两边各几个', '就差1个，谁少？'], 3).length !== 0)
    failures.push('合格的 compareDiff 被误判：' + JSON.stringify(compareDiffProblems(['两边各几个', '就差1个，谁少？'], 3)))

  const pairSrc = { compareDiff: ['一对一对应着看'] }
  const pl = comparePairOf(0, 'left', 2, pairSrc)
  const pr = comparePairOf(0, 'right', 2, pairSrc)
  if (!pl || !pr || pl.left !== 0 || pl.right !== 1 || pr.left !== pl.left || pr.right !== pl.right)
    failures.push('对比联动不对称：点左栏第 0 行与点右栏第 0 行必须命中同一对')
  if (pl && pl.hint !== '一对一对应着看') failures.push(`对比提示取词不符：「${pl.hint}」`)
  const odd = comparePairOf(1, 'left', 3, pairSrc)
  if (!odd || odd.left !== 2 || odd.right !== -1 || odd.active !== 2)
    failures.push('奇数项尾巴：左栏落单行必须 solo 高亮（right=-1），实得 ' + JSON.stringify(odd))
  const oddR = comparePairOf(1, 'right', 3, pairSrc)
  if (!oddR || oddR.left !== 0 || oddR.right !== 1)
    failures.push('点右栏不存在的行必须回落上一整行，实得 ' + JSON.stringify(oddR))
  const oob = comparePairOf(99, 'left', 2, pairSrc)
  if (!oob || oob.left !== 0 || oob.right !== 1) failures.push('行号越界未回落到存在行')
  if (comparePairOf(0, 'left', 0) !== null) failures.push('count=0 应返回 null（无可联动项）')

  let hs = initialHintState
  hs = hintOnPageEnter(hs, 5, true)
  if (hs.showing !== 5 || hs.seen.join(',') !== '5') failures.push('交互页首次进入应亮提示')
  hs = hintOnAutoHide(hs)
  if (hs.showing !== -1) failures.push('自动淡出必须清掉 showing')
  hs = hintOnPageEnter(hs, 5, true)
  if (hs.showing !== -1) failures.push('同一页重复进入不得再提示（只提首次）')
  hs = hintOnPageEnter(hs, 6, false)
  if (hs.showing !== -1) failures.push('非交互页不得提示')
  hs = hintOnPageEnter(hs, 8, true)
  if (hs.showing !== 8) failures.push('新的交互页应再提示一次')
  hs = hintOnDisableKey(hs)
  if (!hs.disabled || hs.showing !== -1) failures.push('I 键应全局关闭并立刻收掉当前提示')
  hs = hintOnPageEnter(hs, 10, true)
  if (hs.showing !== -1) failures.push('I 键关闭后任何页都不得再亮')
  if (HINT_AUTO_HIDE_MS !== 3000) failures.push(`提示停留 ${HINT_AUTO_HIDE_MS}ms，§A.3.3 定的是 3000`)
  if (HINT_TEXT !== '这里可以点') failures.push(`提示文案被改了：「${HINT_TEXT}」`)
  lines.push('合成反向：19 字裁判 / 空文本判非空 / 禁句式拦截 / 条数不齐判缺 / 奇数尾巴 solo / 越界回落 / 对称联动 / 提示只提首次 + I 键全局关 全部命中')

  /* --- ⑤ 岔路样式存证（styles-show.css 仍零 hex 由主题段①5 守，这里只验本次新增） --- */
  try {
    const showCss = readRepoFile('src/styles-show.css')
    for (const cls of ['.cube-side {', '.show-cta {', '.show-tap-hint {', '.ss-compare-hint {', '.cube-part-note {', '.path-hit {', '.cube-face.peak {', '.ss-item.peak']) {
      if (!showCss.includes(cls)) {
        failures.push(`styles-show.css 缺少岔路样式 ${cls}（.cube-side 是本轮补的既存 bug，不得再丢）`)
      }
    }
    if (!/\.show-cta\s*\{[^}]*--cinnabar:\s*var\(--tool-cinnabar\)/.test(showCss)) {
      failures.push('.show-cta 没把 --cinnabar 回写到 --tool-* 基准：拆开按钮会被主题强调色染色（任务书要求中性）')
    }
    if (!/\.show-cta\s*\{[^}]*--rule-width:\s*1px;/.test(showCss)) {
      failures.push('.show-cta 没钉 --rule-width: 1px（赭褐主题会把按钮边框撑到 2px，工具本体不得跟主题）')
    }
    if (!/\.show-tap-hint\s*\{[^}]*pointer-events:\s*none;/.test(showCss)) {
      failures.push('.show-tap-hint 没有 pointer-events: none —— 提示条会挡住根节点的 advance 点击')
    }
    lines.push('岔路样式存证：.cube-side 已补 + .show-cta 中性基准回写钉 1px + 提示条全透点击')
  } catch (e) {
    failures.push(`岔路样式对账读文件失败 —— ${errMsg(e)}`)
  }

  /* --- ①c. 键盘语义源文存证：handler 的键位映射没被重接 --- */
  try {
    const tsx = readRepoFile('src/components/SlideShow.tsx')
    if (!/e\.key === 'Escape'[\s\S]*?onExit\(\)/.test(tsx)) failures.push('SlideShow 的 Esc → onExit 映射丢了')
    if (!/e\.key === 'ArrowRight'[\s\S]*?advance\(\)/.test(tsx)) failures.push('SlideShow 的 → → advance 映射丢了')
    if (!/e\.key === 'ArrowLeft'[\s\S]*?back\(\)/.test(tsx)) failures.push('SlideShow 的 ← → back 映射丢了')
    if (!/className="show"[\s\S]*?onClick=\{advance\}/.test(tsx)) failures.push('根节点 onClick=advance 被改了（主线点击推进不得动）')
    lines.push('键盘映射存证：Esc/→/空格/Enter/← 的接线与主线一致，新增 I 键只关提示不动 step')
  } catch (e) {
    failures.push(`键盘映射存证读文件失败 —— ${errMsg(e)}`)
  }

  return { lines, failures }
}
