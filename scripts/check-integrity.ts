/**
 * check:integrity —— 内容完整性：篇幅可变，内容不可丢（用户铁底线）
 *
 * 老师没有逐页手改这一步，PPT 跟着课件与课文走。这一份门禁只查一件事：
 * **该上屏的字，一个都不许少。**
 *
 * 五条：
 *   1 chunkQuote 逐字不变式：拆完接起来与原文逐字一致（只许空白差异），每块 ≤ 60 字
 *   2 长句不再整句丢弃：150 字的课文原句进 withQuotes 后，拆成的原文页合起来盖住整句
 *   3 十九族 × 超量夹具：paginate + place 之后，每一条条目 / 每一块原文都逐字在屏上
 *   4 paginate 是纯函数且幂等：两遍逐字节相同；拆完再拆不变；没超量的原引用返回
 *   5 内置整叠端到端：《桂花雨》整节课 / 《观潮》片段 × 十九族，条目与原文零丢失
 *
 * 跑法：npm run check:integrity
 */
import { findText, splitQuotes } from '../src/data/texts'
import {
  chunkQuote,
  countVisibleChars,
  expandQuotePages,
  getBuiltinStudentSlides,
  QUOTE_BODY_MAX,
  type StudentSlide,
} from '../src/lib/slides'
import { FAMILIES, FAMILY_REPS, TEMPLATES } from '../src/lib/deck2/theme'
import { place, ITEM_CAP, archetypeOf } from '../src/lib/deck2/place'
import { paginate } from '../src/lib/deck2/paginate'
import { skeletonPlan } from '../src/lib/skeleton'
import { limitsFor } from '../src/lib/scale'
import type { LessonInput } from '../src/types'

const FAIL: string[] = []
const fail = (m: string) => FAIL.push(m)
const ok = (name: string, note: string) => console.log(`✓ ${name} — ${note}`)

/** 逐字比对只许空白差异：空白是排版产物，标点与字一个不动 */
const norm = (s: string) => String(s ?? '').replace(/\s+/g, '')

const ids = Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]
const themeOf = (id: keyof typeof FAMILIES) => TEMPLATES[FAMILY_REPS[id]]

/** 一叠页排完以后，屏上所有的字（place 出来的 text 块拼起来） */
function onScreen(slides: readonly StudentSlide[], id: keyof typeof FAMILIES): string {
  const theme = themeOf(id)
  return norm(
    slides
      .flatMap((s) => place(s, theme))
      .filter((p) => p.kind === 'text')
      .map((p) => String(p.text ?? ''))
      .join('\n')
  )
}

/* ------------------------ 1 · chunkQuote 逐字不变式 ------------------------ */

console.log('=== 1. 长原文逐字拆页：接起来还是原文 ===')
{
  const cases: string[] = []
  for (const topic of ['观潮', '桂花雨']) {
    const text = (findText(topic)?.quotes ?? []).join('\n')
    for (const q of splitQuotes(text)) cases.push(q)
  }
  /* 合成两句：一句带标点 150 字、一句 150 字没有任何标点（硬切兜底） */
  const clause = '潮来之前江面很平静，'
  cases.push(clause.repeat(15))
  cases.push('鑫'.repeat(150))
  let bad = 0
  for (const c of cases) {
    const chunks = chunkQuote(c)
    if (norm(chunks.join('')) !== norm(c)) {
      bad += 1
      fail(`1 拆完接不回原文：「${c.slice(0, 16)}…」`)
    }
    for (const ch of chunks) {
      if (countVisibleChars(ch) > QUOTE_BODY_MAX) {
        bad += 1
        fail(`1 拆出来的块超 ${QUOTE_BODY_MAX} 字：「${ch.slice(0, 16)}…」`)
      }
    }
  }
  if (bad === 0) ok('1 逐字不变式', `${cases.length} 句（含 150 字无标点硬切），块块 ≤ ${QUOTE_BODY_MAX} 字`)
}

/* ------------------------ 2 · 长句不再整句丢弃 ------------------------ */

console.log('=== 2. 150 字原句进课件：拆页上屏，不整句丢 ===')
{
  const long = '那条白线很快地向我们移来，逐渐拉长，变粗，横贯江面，再近些，只见白浪翻滚，形成一堵两丈多高的水墙，浪潮越来越近，犹如千万匹白色战马齐头并进，浩浩荡荡地飞奔而来，那声音如同山崩地裂，好像大地都被震得颤动起来。'
  const input: LessonInput = {
    topic: '观潮',
    subject: '语文',
    stage: '小学',
    grade: '四年级',
    period: '第一课时',
    textbook: '部编版',
    duration: 240,
    text: long,
  }
  const plan = skeletonPlan(input)
  const limits = limitsFor('auto', 'clip', input.duration)
  const slides = getBuiltinStudentSlides(plan, limits)
  const quotes = slides.filter((s) => s.kind === 'quote').map((s) => String(s.text ?? ''))
  const joined = norm(quotes.join(''))
  /* 2026-11-22 口径：≤120 字的长句整段上一页（用户拍板「原文页印整段」）；
     超 120 才拆页。两种都要逐字盖住整句，一个字不许丢。 */
  if (quotes.length === 1 && joined === norm(long))
    ok('2 ≤120 字长句整段上屏', `${countVisibleChars(long)} 字 → 1 张原文页，逐字不变`)
  else fail(`2 ≤120 字长句没整段上屏：${quotes.length} 页 / 合起来${joined === norm(long) ? '盖住' : '盖不住'}整句`)
  for (const q of quotes) {
    if (!norm(long).includes(norm(q))) fail(`2 原文页不是原句子串：「${q.slice(0, 16)}…」`)
  }
  const over = long + '霎时，潮头奔腾西去，可是余波还在漫天卷地般涌来，江面上依旧风号浪吼。'
  const plan2 = skeletonPlan({ ...input, text: over })
  const quotes2 = getBuiltinStudentSlides(plan2, limits)
    .filter((s) => s.kind === 'quote')
    .map((s) => String(s.text ?? ''))
  const joined2 = norm(quotes2.join(''))
  if (quotes2.length >= 2 && joined2.includes(norm(over)))
    ok('2 >120 字拆页上屏', `${countVisibleChars(over)} 字 → ${quotes2.length} 张原文页，逐字盖住整句`)
  else fail(`2 超 120 字没有拆页：只有 ${quotes2.length} 张原文页`)
  for (const q of quotes2) {
    if (!norm(over).includes(norm(q))) fail(`2 拆出来的原文页不是原句子串：「${q.slice(0, 16)}…」`)
  }
  /* expandQuotePages 本身也要幂等：拆过的再拆不变 */
  const once = expandQuotePages(slides)
  if (JSON.stringify(expandQuotePages(once)) !== JSON.stringify(once)) fail('2 expandQuotePages 不幂等')
}

/* ------------------------ 3 · 十九族超量夹具零丢失 ------------------------ */

console.log('=== 3. 十九族 × 超量夹具：条目与原文逐字在屏 ===')
{
  const items8 = Array.from({ length: 8 }, (_, i) => `第${i + 1}件事要做完`)
  const words6 = ['桂花', '箩筐', '杭州', '浸润', '糕饼', '茶叶']
  const longQuote = '这里的桂花再香，也比不上家乡院子里的桂花，可是母亲说，外地的桂花再香，还是比不得家乡旧宅院子里的金桂，于是我又想起了在故乡童年时代的摇花乐，和那阵阵的桂花雨。'
  const stack: StudentSlide[] = [
    { kind: 'board', title: '板书这八条', line: '这八条你记住了吗', items: items8, notes: '' },
    { kind: 'compare', title: '左右比一比', line: '两边哪里不一样', items: items8, notes: '' },
    { kind: 'words', title: '字词关', line: '这四个词读得准吗', items: words6, notes: '' },
    { kind: 'close-read', title: '细读这一段', line: '你圈出了哪个词', items: items8, notes: '' },
    { kind: 'end', title: '下课之前', line: '今天你学会了什么', items: ['把生字写一遍', '把课文读一遍', '把问题想一想'], notes: '' },
    { kind: 'quote', title: longQuote, text: longQuote, note: '《桂花雨》', notes: '' },
  ] as StudentSlide[]
  let lost = 0
  for (const id of ids) {
    const theme = themeOf(id)
    const pages = paginate(stack, theme)
    const screen = onScreen(pages, id)
    for (const it of [...items8, ...words6]) {
      if (!screen.includes(norm(it))) {
        lost += 1
        fail(`3 ${id} 条目丢了：「${it}」`)
      }
    }
    /* 收尾那三条 + 问句，原文每一块 */
    for (const it of ['把生字写一遍', '把课文读一遍', '把问题想一想', '今天你学会了什么']) {
      if (!screen.includes(norm(it))) {
        lost += 1
        fail(`3 ${id} 收尾丢了：「${it}」`)
      }
    }
    for (const ch of chunkQuote(longQuote)) {
      if (!screen.includes(norm(ch))) {
        lost += 1
        fail(`3 ${id} 原文块丢了：「${ch.slice(0, 12)}…」`)
      }
    }
    /* 编号页每页不许超这一族的容量（超了就是 layout 与 ITEM_CAP 脱节） */
    for (const p of pages) {
      const arch = archetypeOf(p.kind)
      if (arch === 'numbered' && (p.items ?? []).length > ITEM_CAP[id].numbered)
        fail(`3 ${id} 编号页 ${p.items?.length} 条，超容量 ${ITEM_CAP[id].numbered}`)
    }
  }
  if (lost === 0) ok('3 超量零丢失', `${ids.length} 族 × 8 条编号/对比/正文 + 6 词 + 收尾三条 + ${countVisibleChars(longQuote)} 字原文`)
}

/* ------------------------ 4 · 纯函数与幂等 ------------------------ */

console.log('=== 4. paginate 纯函数 / 幂等 / 短页原引用 ===')
{
  const stack: StudentSlide[] = [
    { kind: 'board', title: '板书', line: '记住了吗', items: Array.from({ length: 9 }, (_, i) => `条目${i}`), notes: '' },
    { kind: 'quote', title: '短句子', text: '短句子', notes: '' },
  ] as StudentSlide[]
  let bad = 0
  for (const id of ids) {
    const theme = themeOf(id)
    const a = paginate(stack, theme)
    const b = paginate(stack, theme)
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      bad += 1
      fail(`4 ${id} 两遍输出不同（不纯）`)
    }
    if (JSON.stringify(paginate(a, theme)) !== JSON.stringify(a)) {
      bad += 1
      fail(`4 ${id} 拆完再拆变了（不幂等）`)
    }
  }
  const short = [{ kind: 'board', title: '板书', line: '记住了吗', items: ['一条', '两条'], notes: '' }] as StudentSlide[]
  for (const id of ids) {
    if (paginate(short, themeOf(id)) !== short) {
      bad += 1
      fail(`4 ${id} 没超量也换了引用`)
    }
  }
  if (bad === 0) ok('4 纯 / 幂等 / 原引用', `${ids.length} 族两遍逐字节相同，短页原样返回`)
}

/* ------------------------ 5 · 内置整叠端到端 ------------------------ */

console.log('=== 5. 内置整叠 × 十九族：课件里的字一个不少 ===')
{
  const cases: { topic: string; duration: number; scale: 'clip' | 'lesson' }[] = [
    { topic: '桂花雨', duration: 2400, scale: 'lesson' },
    { topic: '观潮', duration: 240, scale: 'clip' },
  ]
  let lost = 0
  let pagesTotal = 0
  for (const c of cases) {
    const input: LessonInput = {
      topic: c.topic,
      subject: '语文',
      stage: '小学',
      grade: c.topic === '观潮' ? '四年级' : '五年级',
      period: '第一课时',
      textbook: '部编版',
      duration: c.duration,
      text: (findText(c.topic)?.quotes ?? []).join('\n'),
    }
    const plan = skeletonPlan(input)
    const limits = limitsFor('auto', c.scale, c.duration)
    const base = getBuiltinStudentSlides(plan, limits)
    /* 该上屏的字：每一条条目、每一句原文（标题与问句由 check:fit / check:template 管） */
    const want: string[] = []
    for (const s of base) {
      for (const it of s.items ?? []) if (norm(it)) want.push(it)
      if (s.kind === 'quote') {
        const t = String(s.text ?? '')
        if (norm(t)) want.push(t)
      }
      if (s.kind === 'end') {
        if (norm(String(s.line ?? ''))) want.push(String(s.line))
        for (const it of s.items ?? []) if (norm(it)) want.push(it)
      }
    }
    for (const id of ids) {
      const pages = paginate(base, themeOf(id))
      pagesTotal += pages.length
      const screen = onScreen(pages, id)
      for (const w of want) {
        if (!screen.includes(norm(w))) {
          lost += 1
          fail(`5 ${c.topic}/${id} 丢了：「${w.slice(0, 16)}」`)
        }
      }
    }
  }
  if (lost === 0) ok('5 端到端零丢失', `两课 × ${ids.length} 族共 ${pagesTotal} 页，条目与原文逐字在屏`)
}

/* ------------------------ 汇总 ------------------------ */

if (FAIL.length > 0) {
  console.error(`\n✗ check:integrity ${FAIL.length} 条不过：`)
  for (const m of FAIL.slice(0, 30)) console.error(`  · ${m}`)
  process.exit(1)
}
console.log('\n✓ check:integrity 五条全过：篇幅可变，内容不可丢。')