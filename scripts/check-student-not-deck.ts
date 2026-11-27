/**
 * TASKS/22：学生版不是课件的翻版（六条）。
 *
 *   ① 逐页对照：不许「一页课件搬一页」——标题与条目同时逐字照搬的页 = 0；
 *      标题重合率只如实打出来作参考（课件环节页的标题本来就是学生要做的那一句，
 *      而且「老师改的标题原样上屏」是 TASKS/22 的另一条硬约束，不能拿标题重合率判翻版）
 *   ② 教师话术零命中：学生版所有页 title / line / items / notes，命中话术表 = 0
 *   ③ 问号率：非封面页里带「？」的 ≤ 1 页
 *   ④ 一一对应检测：slidesFromDeck 的函数体里不许出现 pages.map（结构断言）
 *   ⑤ 页数仍合规：桂花雨 lesson 16–24 页、clip 10–14 页（区间取自 scale.ts，不写死）
 *   ⑥ 兜底不塌：模型断掉（只走内置/骨架那一叠）时，①② 照样成立
 *
 * 跑法：npm run check:student-not-deck
 */
import { readFileSync } from 'node:fs'
import { guihuaYu } from '../src/data/guihua'
import { findText } from '../src/data/texts'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'
import { buildDeck } from '../src/lib/deck'
import { limitsFor, slideRangeFor } from '../src/lib/scale'
import { skeletonPlan } from '../src/lib/skeleton'
import {
  getBuiltinStudentSlides,
  slidesFromDeck,
  slidesFromDeckProblems,
  type StudentSlide,
} from '../src/lib/slides'
import type { LessonInput } from '../src/types'

const errs: string[] = []
const fail = (msg: string): void => {
  errs.push(msg)
}
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

/** ② 的话术表：教师视角、点名式、备课腔，一律不许上学生版 */
const TEACHER_VOICE = /我准备|我打算|先给什么|然后再问|卡在哪|谁读给大家听|谁来说|全班对答案|同桌互查/

const bare = (text: unknown): string => String(text ?? '').replace(/[\s，。、；：：「」『』（）《》“”‘’,.!?—…·]/g, '')
const pageText = (s: StudentSlide): string =>
  [s.title ?? '', s.line ?? '', ...(s.items ?? []), s.notes ?? ''].join(' ')
/** 上屏的字（不含备注）：问号率只量学生看得见的这三处 */
const visibleText = (s: StudentSlide): string => [s.title ?? '', s.line ?? '', ...(s.items ?? [])].join(' ')

function lessonInput(o: Partial<LessonInput> & { topic: string; duration: number }): LessonInput {
  return {
    topic: o.topic,
    subject: o.subject ?? '语文',
    stage: o.stage ?? '小学',
    grade: o.grade ?? '四年级',
    period: o.period ?? '第一课时',
    textbook: o.textbook ?? '部编版',
    duration: o.duration,
    text: o.text,
  }
}

/* ------------------------------ 夹具：观潮 40 分钟 ------------------------------ */

const guanchao = findText('观潮')
if (!guanchao) {
  console.error('内置《观潮》引句找不到，门禁无法运行')
  process.exit(1)
}
const plan = skeletonPlan(lessonInput({ topic: '观潮', duration: 2400, text: guanchao.quotes.join('\n') }))
const limits = limitsFor(undefined, 'lesson', 2400)
const deck = buildDeck(plan, allocate(plan.segments, plan.meta.duration))
const slides = slidesFromDeck(deck, plan, limits)
const problems = slidesFromDeckProblems()

console.log(`\n夹具：《观潮》40 分钟 · 课件 ${deck.length} 页 → 学生版 ${slides.length} 页（lesson 档 ${limits.pagesMin}–${limits.pagesMax}）`)
console.log(`  课件：${deck.map((p, i) => `${i + 1}·${p.title}`).join(' ')}`)
console.log(`  学生：${slides.map((s, i) => `${i + 1}·${s.title}`).join(' ')}`)

/* ------------------------------ ① 逐页对照 ------------------------------ */

{
  const deckTitles = new Set(deck.map((p) => bare(p.title)))
  const titleSame = slides.filter((s) => deckTitles.has(bare(s.title)))
  /* 真正的翻版 = 整页照搬：标题一字不差，而且至少一条条目也是课件那一页的原句。
     只看标题会误伤——skeleton 的环节页标题就是学生要做的动作（"圈出不认识的字词"）。 */
  const clones = slides.filter((s) => {
    const title = bare(s.title)
    const items = (s.items ?? []).map(bare).filter(Boolean)
    if (!items.length) return false
    return deck.some(
      (p) => bare(p.title) === title && (p.bullets ?? []).map(bare).some((b) => b && items.includes(b))
    )
  })
  const rate = slides.length ? titleSame.length / slides.length : 1
  if (clones.length) {
    fail(
      `① 逐页对照：有 ${clones.length} 页整页照搬课件（标题 + 条目均逐字相同）—— ${clones.map((s) => s.title).join(' / ')}`
    )
  } else {
    ok(
      '① 逐页对照',
      `整页照搬 0 页；标题逐字相同 ${titleSame.length}/${slides.length} = ${(rate * 100).toFixed(0)}%（仅供参看）${titleSame.length ? `｜${titleSame.map((s) => s.title).join(' / ')}` : ''}`
    )
  }
}

/* ------------------------------ ② 教师话术零命中 ------------------------------ */

function teacherHits(list: readonly StudentSlide[]): string[] {
  const hits: string[] = []
  for (const s of list) {
    const m = pageText(s).match(TEACHER_VOICE)
    if (m) hits.push(`「${s.title}」→ ${m[0]}`)
  }
  return hits
}

{
  const hits = teacherHits(slides)
  if (hits.length) fail(`② 教师话术：学生版还有 ${hits.length} 页带着老师的话 —— ${hits.slice(0, 4).join('；')}`)
  else ok('② 教师话术零命中', `扫描 ${slides.length} 页 title / line / items / notes，命中 0`)
}

/* ------------------------------ ③ 问号率 ------------------------------ */

{
  const asked = slides.filter((s) => s.kind !== 'cover' && s.kind !== 'quote' && /[？?]/.test(visibleText(s)))
  if (asked.length > 1) {
    fail(`③ 问号率：${asked.length} 页带问号（上限 1 页）—— ${asked.map((s) => s.title).slice(0, 5).join(' / ')}`)
  } else {
    ok('③ 问号率', `非封面 / 非原文页里带问号的 ${asked.length} 页（上限 1）${asked.length ? `｜${asked[0].title}` : ''}`)
  }
}

/* ------------------------------ ④ 结构断言 ------------------------------ */

{
  const src = readFileSync('src/lib/slides.ts', 'utf8')
  const at = src.indexOf('export function slidesFromDeck(')
  const body = at >= 0 ? src.slice(at, src.indexOf('\n}', src.indexOf('return check.ok', at)) + 2) : ''
  if (!body) fail('④ 结构断言：src/lib/slides.ts 里找不到 slidesFromDeck 的函数体')
  if (/pages\s*\.\s*map\s*\(/.test(body)) {
    fail('④ 结构断言：slidesFromDeck 里还在 pages.map —— 一页课件搬一页学生版')
  }
  for (const fn of ['deckMaterial(', 'rebuildFromDeck(', 'splitToFill(']) {
    if (!body.includes(fn)) fail(`④ 结构断言：slidesFromDeck 没走 ${fn}，三步重建被绕开了`)
  }
  if (!errs.length) ok('④ 结构断言', 'slidesFromDeck 无 pages.map，走 deckMaterial → rebuildFromDeck → splitToFill')
}

/* ------------------------------ ⑤ 页数仍合规 ------------------------------ */

{
  const clip = planForScale(guihuaYu, 240)
  const clipDeck = buildDeck(clip, allocate(clip.segments, clip.meta.duration))
  const clipLimits = limitsFor(undefined, 'clip', 240)
  const clipSlides = slidesFromDeck(clipDeck, clip, clipLimits)
  const lesson = planForScale(guihuaYu, 2400)
  const lessonDeck = buildDeck(lesson, allocate(lesson.segments, lesson.meta.duration))
  const lessonLimits = limitsFor(undefined, 'lesson', 2400)
  const lessonSlides = slidesFromDeck(lessonDeck, lesson, lessonLimits)
  const clipRange = slideRangeFor(240)
  const lessonRange = slideRangeFor(2400)
  if (clipSlides.length < clipRange.min || clipSlides.length > clipRange.max) {
    fail(`⑤ 页数：clip 档 ${clipSlides.length} 页，应在 ${clipRange.min}–${clipRange.max}`)
  }
  if (lessonSlides.length < lessonRange.min || lessonSlides.length > lessonRange.max) {
    fail(`⑤ 页数：lesson 档 ${lessonSlides.length} 页，应在 ${lessonRange.min}–${lessonRange.max}`)
  }
  ok(
    '⑤ 页数仍合规',
    `clip ${clipDeck.length} 页课件 → ${clipSlides.length} 页学生版（${clipRange.min}–${clipRange.max}）｜lesson ${lessonDeck.length} 页课件 → ${lessonSlides.length} 页学生版（${lessonRange.min}–${lessonRange.max}）`
  )
}

/* ------------------------------ ⑥ 兜底不塌 ------------------------------ */

{
  const clip = planForScale(guihuaYu, 240)
  const clipDeck = buildDeck(clip, allocate(clip.segments, clip.meta.duration))
  const clipLimits = limitsFor(undefined, 'clip', 240)
  /* 模型断掉 = 走内置那一叠（buildStudentSlides 的 catch 分支就是这一份） */
  const offline = getBuiltinStudentSlides(clip, clipLimits)
  if (offline.length < 10 || offline.length > 14) {
    fail(`⑥ 兜底：模型断掉时学生版 ${offline.length} 页，应在 10–14`)
  }
  const deckTitles = new Set(clipDeck.map((p) => bare(p.title)))
  const same = offline.filter((s) => deckTitles.has(bare(s.title)))
  const rate = offline.length ? same.length / offline.length : 1
  if (rate > 0.2) fail(`⑥ 兜底：断网这一疊与课件标题重合 ${(rate * 100).toFixed(0)}%（应 ≤20%）`)
  const hits = teacherHits(offline)
  if (hits.length) fail(`⑥ 兜底：断网这一叠还有教师话术 —— ${hits.slice(0, 3).join('；')}`)
  ok(
    '⑥ 兜底不塌',
    `断网 → 内置 ${offline.length} 页（10–14）｜与课件重合 ${same.length}/${offline.length}｜教师话术 0`
  )
}

/* ------------------------------ 收尾 ------------------------------ */

if (problems.length) {
  console.log(`\n  提示：观潮 40 分钟的派生路径记下了 ${problems.length} 条问题 —— ${problems.slice(0, 3).join('；')}`)
}

console.log('')
if (errs.length) {
  console.error(`✗ check:student-not-deck 不合格 ${errs.length} 处：`)
  for (const e of errs) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('✓ check:student-not-deck 六条全过：逐页对照 / 教师话术 / 问号率 / 结构断言 / 页数 / 兜底')
