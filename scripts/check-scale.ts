/**
 * 时长 → 规模的门禁（TASKS/09 §S 验收第 3 条）。
 *
 * 只看纯数据，不出片、不联网：
 *   1. scaleOf 的边界（600 仍是片段，1200 起才是整节课）
 *   2. planOfScale 的四组参数逐格对齐任务书（12–16 / 10–14 / 22–28 / 16–24 / 4–6 / 6–7 / 2–3 / 3–4）
 *   3. 四篇内置 × 两档：课件页、课堂 PPT 页、环节数全部落在区间内
 *   4. lesson 档硬要求：课件里有「课中活动」页，课堂 PPT 里有「练一练」页
 *   5. 两档产物都过 validateSlides 与 §D.2 语气判定（四类句式 + 五个禁词命中为 0）
 *   6. 反向用例：拿 clip 的 10 页去撞 lesson 的 16 页下限必须被抓到
 *
 * 跑法：
 *   npm run check:scale
 */
import type { LessonPlan } from '../src/types'
import { EXAMPLES } from '../src/data/examples'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'
import { buildDeck } from '../src/lib/deck'
import { getBuiltinStudentSlides, pageVisibleText, validateSlides } from '../src/lib/slides'
import { limitsFor, planOfScale, scaleOf, tierOf, tierPlanOf, deckRangeFor, slideRangeFor, type Scale } from '../src/lib/scale'
import { scanVoice } from '../src/lib/voice'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const inRange = (n: number, r: { min: number; max: number }) => n >= r.min && n <= r.max

/* ------------------------- 1. scaleOf 边界 ------------------------- */

const bounds: [number, Scale][] = [
  [0, 'clip'],
  [180, 'clip'],
  [240, 'clip'],
  [600, 'clip'],
  [601, 'clip'],
  [1199, 'clip'],
  [1200, 'lesson'],
  [2400, 'lesson'],
  [Number.NaN, 'clip'],
]
for (const [d, want] of bounds) {
  const got = scaleOf(d)
  if (got !== want) fail(`scaleOf(${d}) = ${got}，应为 ${want}`)
}

/* ------------------------- 2. 参数表 ------------------------- */

const want = {
  clip: { deck: [12, 16], slide: [10, 14], seg: [4, 6], per: [2, 3] },
  lesson: { deck: [22, 28], slide: [16, 24], seg: [6, 7], per: [3, 4] },
} as const

for (const scale of ['clip', 'lesson'] as Scale[]) {
  const p = planOfScale(scale)
  const w = want[scale]
  const pairs: [string, number, number, number][] = [
    ['课件下限', p.deckPages.min, w.deck[0], w.deck[0]],
    ['课件上限', p.deckPages.max, w.deck[1], w.deck[1]],
    ['课堂 PPT 下限', p.slidePages.min, w.slide[0], w.slide[0]],
    ['课堂 PPT 上限', p.slidePages.max, w.slide[1], w.slide[1]],
    ['环节下限', p.segments.min, w.seg[0], w.seg[0]],
    ['环节上限', p.segments.max, w.seg[1], w.seg[1]],
    ['每环节页数下限', p.pagesPerSegment.min, w.per[0], w.per[0]],
    ['每环节页数上限', p.pagesPerSegment.max, w.per[1], w.per[1]],
  ]
  for (const [label, got, , exp] of pairs) {
    if (got !== exp) fail(`${scale} 的${label}是 ${got}，任务书定的是 ${exp}`)
  }
}

/* ------------------------- 3–5. 四篇 × 两档 ------------------------- */

console.log('-- 四篇内置 × 两档（09 §S 参数：clip 12–16 / 10–14，lesson 22–28 / 16–24）--')

const runs: {
  name: string
  scale: Scale
  deck: number
  slides: number
  segs: number
  deckOk: boolean
  slideOk: boolean
  segOk: boolean
  activity: boolean
  drill: boolean
}[] = []

for (const ex of EXAMPLES) {
  for (const scale of ['clip', 'lesson'] as Scale[]) {
    const duration = scale === 'lesson' ? 2400 : 240
    const plan: LessonPlan = planForScale(ex.plan, duration)
    const p = planOfScale(scale)
    const limits = limitsFor('standard', scale, duration)

    const timed = allocate(plan.segments, duration)
    const deck = buildDeck(plan, timed)
    const slides = getBuiltinStudentSlides(plan, limits)

    const deckOk = inRange(deck.length, p.deckPages)
    // 学生版页数按「本次时长」那一档判：20 / 30 / 40 分钟各自一个区间（第二十轮）
    const slideRange = tierPlanOf(tierOf(duration)).slidePages
    const slideOk = inRange(slides.length, slideRange)
    const segOk = inRange(plan.segments.length, p.segments)
    if (!deckOk) fail(`${ex.label}·${scale}: 课件 ${deck.length} 页，不在 ${p.deckPages.min}–${p.deckPages.max}`)
    if (!slideOk)
      fail(`${ex.label}·${scale}: 课堂 PPT ${slides.length} 页，不在 ${slideRange.min}–${slideRange.max}（${tierOf(duration)} 档）`)
    if (!segOk) fail(`${ex.label}·${scale}: 环节 ${plan.segments.length} 个，不在 ${p.segments.min}–${p.segments.max}`)

    // lesson 档硬要求：课件有「课中活动」，课堂 PPT 有「练一练」
    const activity = deck.some((d) => d.kind === 'activity' || d.kind === 'assessment')
    const drill = slides.some((s) => s.kind === 'drill')
    if (scale === 'lesson' && !activity) fail(`${ex.label}·lesson: 课件里没有「课中活动 / 当堂检测」页`)
    if (scale === 'lesson' && !drill) fail(`${ex.label}·lesson: 课堂 PPT 里没有「练一练」页`)

    // 5. 数据体检：页数区间由各档 limits 给出，其余（字数 / items / 问句 / 禁词 / notes）与 clip 同一套
    const check = validateSlides(slides, limits)
    if (!check.ok) fail(`${ex.label}·${scale}: ${check.problems.slice(0, 3).join(' / ')}`)

    // 语气：页面文字 + notes，与 §D.2 同一判定源
    for (const [i, s] of slides.entries()) {
      const text = [...pageVisibleText(s), s.notes].join(' ')
      const hits = scanVoice(text).hits
      if (hits.length) fail(`${ex.label}·${scale} 第 ${i + 1} 页踩了语气：${hits.map((h) => h.label).join('、')}`)
    }
    for (const [i, d] of deck.entries()) {
      const text = [d.title, ...(d.bullets ?? []), d.question ?? '', d.notes].join(' ')
      const hits = scanVoice(text).hits
      if (hits.length) fail(`${ex.label}·${scale} 课件第 ${i + 1} 页踩了语气：${hits.map((h) => h.label).join('、')}`)
    }

    runs.push({ name: ex.label, scale, deck: deck.length, slides: slides.length, segs: plan.segments.length, deckOk, slideOk, segOk, activity, drill })
  }
}

for (const r of runs) {
  console.log(
    `  ${r.name.padEnd(8)} ${r.scale.padEnd(6)} 环节 ${String(r.segs).padStart(2)} | ` +
      `课件 ${String(r.deck).padStart(2)} 页 ${r.deckOk ? '✓' : '✗'} | ` +
      `课堂 PPT ${String(r.slides).padStart(2)} 页 ${r.slideOk ? '✓' : '✗'} | ` +
      `课中活动 ${r.activity ? '有' : '无'} | 练一练 ${r.drill ? '有' : '无'}`
  )
}

/* ------------------------- 6. 反向用例 ------------------------- */

// 同一篇课文：240 秒（clip）与 2400 秒（lesson）必须给出不同的页数，否则「选 40 分钟没用」这个 bug 没修
const gf = EXAMPLES.find((e) => e.id === 'guihua')
if (!gf) {
  fail('找不到《桂花雨》内置示例')
} else {
  const clipPlan = planForScale(gf.plan, 240)
  const lessonPlan = planForScale(gf.plan, 2400)
  const clipDeck = buildDeck(clipPlan, allocate(clipPlan.segments, 240)).length
  const lessonDeck = buildDeck(lessonPlan, allocate(lessonPlan.segments, 2400)).length
  const clipSlides = getBuiltinStudentSlides(clipPlan, limitsFor('standard', 'clip')).length
  const lessonSlides = getBuiltinStudentSlides(lessonPlan, limitsFor('standard', 'lesson')).length
  if (lessonDeck <= clipDeck) fail(`反向用例未被抓到：《桂花雨》40 分钟课件 ${lessonDeck} 页，并不比 4 分钟 ${clipDeck} 页多`)
  if (lessonSlides <= clipSlides) fail(`反向用例未被抓到：《桂花雨》40 分钟课堂 PPT ${lessonSlides} 页，并不比 4 分钟 ${clipSlides} 页多`)

  // 拿 clip 的页数去撞 lesson 的区间：必须判不合格（证明上面那些 ✓ 不是空转）
  const wrong = validateSlides(
    getBuiltinStudentSlides(clipPlan, limitsFor('standard', 'clip')),
    limitsFor('standard', 'lesson')
  )
  if (wrong.ok) fail('反向用例未被抓到：4 分钟的 10 页撞 16–24 的区间，validateSlides 竟然说合格')

  console.log(
    `\n-- 《桂花雨》两档实测 --\n` +
      `  4 分钟：课件 ${clipDeck} 页 / 课堂 PPT ${clipSlides} 页\n` +
      `  40 分钟：课件 ${lessonDeck} 页 / 课堂 PPT ${lessonSlides} 页\n` +
      `  反向用例：10 页撞 16–24 区间 → ${wrong.ok ? '未抓到 ✗' : '已抓到 ✓'}`
  )
}

/* ---------------- 7. 20 / 30 / 40 三档骨架（10 §十二） ---------------- */

const tierBounds: [number, ReturnType<typeof tierOf>][] = [
  [240, 'clip'],
  [600, 'clip'],
  [1199, 'clip'],
  [1200, 'm20'],
  [1499, 'm20'],
  [1800, 'm30'],
  [2099, 'm30'],
  [2400, 'm40'],
  [Number.NaN, 'clip'],
]
for (const [d, want] of tierBounds) {
  const got = tierOf(d)
  if (got !== want) fail(`tierOf(${d}) = ${got}，应为 ${want}`)
}

const TIER_RUNS: [number, 'm20' | 'm30' | 'm40'][] = [
  [1200, 'm20'],
  [1800, 'm30'],
  [2400, 'm40'],
]

for (const ex of EXAMPLES) {
  const namesByTier: Record<string, string[]> = {}
  for (const [duration, tier] of TIER_RUNS) {
    const plan = planForScale(ex.plan, duration)
    const timed = allocate(plan.segments, duration)
    const deck = buildDeck(plan, timed)
    const tp = tierPlanOf(tier)

    // 学生版也必须跟着这一档走（第二十轮第 1 条）：页数落区间、整叠过 validate。
    // 40 分钟的 27 页曾被 clip 的 10–14 误拒，就是「学生版一按就炸」。
    const lim = limitsFor('standard', 'lesson', duration)
    const slides = getBuiltinStudentSlides(plan, lim)
    const slideRange = slideRangeFor(duration)
    if (!inRange(slides.length, slideRange)) {
      fail(`${ex.label}·${tier}: 学生版 ${slides.length} 页，不在 ${slideRange.min}–${slideRange.max}`)
    }
    const slideCheck = validateSlides(slides, lim)
    if (!slideCheck.ok) fail(`${ex.label}·${tier}: 学生版 ${slideCheck.problems.slice(0, 3).join(' / ')}`)

    if (!inRange(deck.length, deckRangeFor(duration))) {
      fail(`${ex.label}·${tier}: 课件 ${deck.length} 页，不在 ${tp.deckPages.min}–${tp.deckPages.max}`)
    }
    if (!inRange(plan.segments.length, tp.segments)) {
      fail(`${ex.label}·${tier}: 环节 ${plan.segments.length} 个，应为 ${tp.segments.min}${tp.segments.min === tp.segments.max ? '' : `–${tp.segments.max}`}`)
    }

    // 骨架：20 三段（导入 + 核心讲授 + 小结），30 四段；两档都不许带拓展 / 练习 / 检测
    const names = plan.segments.map((s) => String(s.name ?? ''))
    const has = (re: RegExp) => names.some((n) => re.test(n))
    namesByTier[tier] = names
    if (tier === 'm20') {
      if (names.length !== 3) fail(`${ex.label}·m20: 应只留三段，实为 ${names.length} 段`)
      if (!has(/导入|情境|入课|开课/)) fail(`${ex.label}·m20: 骨架里没有导入`)
      if (!has(/小结|总结|收束|作业/)) fail(`${ex.label}·m20: 骨架里没有小结`)
    }
    if (tier === 'm30' && names.length !== 4) {
      fail(`${ex.label}·m30: 应四段，实为 ${names.length} 段`)
    }
    if (tier !== 'm40' && has(/拓展|练习|检测/)) {
      fail(`${ex.label}·${tier}: 短课时不该带拓展 / 练习 / 检测（跑成 ${names.join(' / ')}）`)
    }

    // 分钟数：每个环节页都标了时长，加起来必须恰好等于老师选的时长
    const mins = deck
      .filter((p) => p.kind === 'segment')
      .map((p) => {
        const m = /^(\d+):(\d{2})$/.exec(String(p.duration ?? ''))
        return m ? Number(m[1]) * 60 + Number(m[2]) : -1
      })
    if (mins.some((n) => n < 0)) fail(`${ex.label}·${tier}: 有环节页没标分钟数`)
    const sum = mins.reduce((a, b) => a + b, 0)
    if (sum !== duration) fail(`${ex.label}·${tier}: 环节分钟数合计 ${sum} 秒，应等于 ${duration} 秒`)

    console.log(
      `  ${ex.label.padEnd(8)} ${String(duration / 60).padStart(2)} 分钟 环节 ${plan.segments.length} | ` +
        `课件 ${String(deck.length).padStart(2)} 页 | 学生版 ${String(slides.length).padStart(2)} 页（${slideRange.min}–${slideRange.max}） | ` +
        `分钟合计 ${sum / 60} 分钟 ${sum === duration ? '✓' : '✗'} | ${names.join(' / ')}`
    )
  }

  // 骨架递增：20 分钟的环节必须是 30 分钟的子集，30 的又必须是 40 的子集
  const sub = (a: string[], b: string[]) => a.every((n) => b.includes(n))
  if (namesByTier.m20 && namesByTier.m30 && !sub(namesByTier.m20, namesByTier.m30)) {
    fail(`${ex.label}: 20 分钟骨架不是 30 分钟的子集（${namesByTier.m20.join('/')} ⊄ ${namesByTier.m30.join('/')}）`)
  }
  if (namesByTier.m30 && namesByTier.m40 && !sub(namesByTier.m30, namesByTier.m40)) {
    fail(`${ex.label}: 30 分钟骨架不是 40 分钟的子集（${namesByTier.m30.join('/')} ⊄ ${namesByTier.m40.join('/')}）`)
  }
}

// 反向用例：20 分钟的课件不能比 40 分钟的还多（否则「选时长没用」这个 bug 又回来了）
if (gf) {
  const deckAt = (d: number) => {
    const p = planForScale(gf!.plan, d)
    return buildDeck(p, allocate(p.segments, d)).length
  }
  const [d20, d30, d40] = [deckAt(1200), deckAt(1800), deckAt(2400)]
  if (!(d20 < d30 && d30 < d40)) {
    fail(`反向用例未被抓到：三档课件页数 ${d20} / ${d30} / ${d40} 不是递增的`)
  } else {
    console.log(`\n-- 《桂花雨》三档实测 --\n  20 分钟 ${d20} 页 → 30 分钟 ${d30} 页 → 40 分钟 ${d40} 页（递增 ✓）`)
  }
}

/* ------------------------- 汇总 ------------------------- */

if (failures.length) {
  console.error(`\n✗ 规模门禁 ${failures.length} 处不合格：`)
  failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}

console.log(
  `\n✓ 规模门禁全通过：两档参数逐格对齐、四篇内置 × 两档页数与环节数全部落区间、` +
    `lesson 档有课中活动与练一练、语气命中 0、反向用例被抓到；` +
    `20 / 30 / 40 三档骨架逐篇过（环节数、课件页数、分钟数合计等于所选时长）。`
)