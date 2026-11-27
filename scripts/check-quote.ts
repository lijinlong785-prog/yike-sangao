/**
 * TASKS/19a「课文原句进得来」的离线验收（§三 五条 + §3.2 两件交付物）。
 *
 * 全程不碰网络：计划走 skeletonPlan，学生版走 getBuiltinStudentSlides（离线回退档）。
 *
 *   ① 有原文（观潮）时，原文页必须够份量：
 *      - clip（4 分钟，10–14 页）按 §三.1 硬判 ≥ 25%（3 句 → 12 页，正好 25%）；
 *      - lesson（40 分钟，16–34 页）只有 3 句原文，25% 在算术上不可达，
 *        所以这里断言「句句上屏」：相邻且逐字在原文里的几句会并成整段
 *        （≤QUOTE_BODY_MAX 字，2026-11-22 用户拍板），按句查覆盖，不按页数一句一页。
 *   ② 每一条 quote.text 必须是原文的子串（去空白后比对，与 mergeQuoteParagraphs 同一把尺），一条不满足就 fail。
 *   ③ 把「一条白线」改成「一条白带」，同一把尺必须报错（证明它真在逐字查）。
 *   ④ 无原文的课（不在内置里、也没贴）：不崩、不出 quote 页、其余页型照旧。
 *   ⑤ 禁用词（全班 / 同桌 / 互查 / 对答案 / 小组讨论后 / 汇报 / 交流一下）零命中。
 *
 * 另外真跑一次 40 分钟《观潮》，写 /tmp/q19a.pptx 与 /tmp/q19a.txt（一行一页）。
 *
 * 跑法：npm run check:quote
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { findText, groundText, splitQuotes } from '../src/data/texts'
import { downloadPptx } from '../src/lib/pptx'
import { limitsFor } from '../src/lib/scale'
import { QUOTE_BODY_MAX, countVisibleChars, getBuiltinStudentSlides, sentenceKey, validateSlides, withQuotes, type StudentSlide } from '../src/lib/slides'
import { buildStudentSlidesPrompt } from '../src/lib/prompt'
import { skeletonPlan } from '../src/lib/skeleton'
import type { LessonInput } from '../src/types'

const PPTX = '/tmp/q19a.pptx'
const TXT = '/tmp/q19a.txt'

/** §2.4 第三条点名的七个词：页面上出现即视为错 */
const BANNED = ['全班', '同桌', '互查', '对答案', '小组讨论后', '汇报', '交流一下']

const failures: string[] = []
const fail = (msg: string): void => {
  failures.push(msg)
}
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
const bad = (msg: string, detail = ''): void => console.log(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)

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

/** 同一把尺：每条 quote.text 都必须是原文的子串（空 text 也算不合格）。
 *  比对前两边都去空白——与 mergeQuoteParagraphs 的 norm 一致：并段吞掉接缝换行，
 *  逐字指的是字逐字，不是连排版空白都逐字；改一个字照样逃不过。 */
function quoteProblems(slides: readonly StudentSlide[], source: string): string[] {
  const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '')
  const hay = norm(source)
  const out: string[] = []
  for (const s of slides) {
    if (s.kind !== 'quote') continue
    const text = String(s.text ?? '')
    if (!text) out.push(`原文页没有 text：${s.title}`)
    else if (!hay.includes(norm(text))) out.push(`不是原文子串：${text}`)
  }
  return out
}

/** 页面上学生看得到的字（标题 / 正文 / 条目；原文页的出处也在屏上，一并算） */
function visibleText(s: StudentSlide): string {
  const onScreen = [s.title, s.text ?? '', s.line ?? '', ...(s.items ?? [])]
  if (s.kind === 'quote') onScreen.push(s.note ?? '')
  return onScreen.join('\n')
}

function bannedHits(slides: readonly StudentSlide[]): string[] {
  const out: string[] = []
  for (const s of slides) {
    const body = visibleText(s)
    for (const w of BANNED) if (body.includes(w)) out.push(`${w}：${s.title}`)
  }
  return out
}

function share(slides: readonly StudentSlide[]): number {
  const n = slides.filter((s) => s.kind === 'quote').length
  return slides.length ? n / slides.length : 0
}

/** 一行一页：kind + 标题 + 正文（原文页按任务书的样例给「原句 / 出处」） */
function dumpLine(s: StudentSlide): string {
  if (s.kind === 'quote') return `[quote] ${s.text || s.title}${s.note ? ` / ${s.note}` : ''}`
  const body = [...(s.items ?? []), s.line ?? ''].filter(Boolean).join(' / ')
  return `[${s.kind}] ${s.title}${body ? ` / ${body}` : ''}`
}

function unzipEntry(file: string, entry: string): string {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch {
    return ''
  }
}

function slideEntries(file: string): string[] {
  try {
    return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => /^ppt\/slides\/slide\d+\.xml$/.test(v))
      .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
  } catch {
    return []
  }
}

async function main() {
  const entry = findText('观潮')
  if (!entry) {
    console.error('内置《观潮》引句找不到，门禁无法运行')
    process.exit(1)
  }
  const source = entry.quotes.join('\n')

  /* ------------------- 1 / 2 份量 + 逐字（clip 与 lesson） ------------------- */

  const clipInput = lessonInput({ topic: '观潮', duration: 240, text: source })
  const clipPlan = skeletonPlan(clipInput)
  const clipLimits = limitsFor('standard', 'clip')
  const clipSlides = getBuiltinStudentSlides(clipPlan, clipLimits)
  const clipShare = share(clipSlides)

  if (clipShare >= 0.25) {
    ok('① clip 原文页份量', `${clipSlides.filter((s) => s.kind === 'quote').length}/${clipSlides.length} = ${(clipShare * 100).toFixed(0)}%`)
  } else {
    fail(`① clip 原文页只占 ${(clipShare * 100).toFixed(0)}%，要求 ≥25%`)
  }

  const clipBad = quoteProblems(clipSlides, source)
  if (clipBad.length === 0) ok('② clip 每条原文都是原文子串', `${clipSlides.filter((s) => s.kind === 'quote').length} 条`)
  else {
    clipBad.forEach((m) => fail(`② ${m}`))
    bad('② clip 原文逐字', clipBad.join('；'))
  }

  const lessonInput40 = lessonInput({ topic: '观潮', duration: 2400, text: source })
  const lessonPlan = skeletonPlan(lessonInput40)
  const lessonLimits = limitsFor('standard', 'lesson', 2400)
  const lessonSlides = getBuiltinStudentSlides(lessonPlan, lessonLimits)
  const lessonQuotes = lessonSlides.filter((s) => s.kind === 'quote').length

  /* 3 句原文在 16–34 页里摸不到 25%：这一档只断言「句句上屏」，份额如实打出来。
     原文页印整段后相邻几句会并成一页，所以按「每句都在某页里逐字出现」验，
     不按「一句一页」验；并出来的整段不许超 QUOTE_BODY_MAX。 */
  const normQ = (s: unknown) => String(s ?? '').replace(/\s+/g, '')
  const lessonQuoteTexts = lessonSlides.filter((s) => s.kind === 'quote').map((s) => normQ(s.text ?? s.title))
  const missing = entry.quotes.filter((q) => !lessonQuoteTexts.some((t) => t.includes(normQ(q))))
  const overLong = lessonSlides.filter(
    (s) => s.kind === 'quote' && countVisibleChars(String(s.text ?? s.title ?? '')) > QUOTE_BODY_MAX
  )
  if (missing.length === 0 && overLong.length === 0) {
    ok(
      '① lesson 原文句句上屏',
      `${entry.quotes.length} 句并成 ${lessonQuotes} 页整段（≤${QUOTE_BODY_MAX} 字），${lessonQuotes}/${lessonSlides.length} = ${(share(lessonSlides) * 100).toFixed(0)}%（3 句原文，25% 在 40 分钟口径上不可达）`
    )
  } else {
    if (missing.length > 0) fail(`① lesson 有 ${missing.length} 句原文没上屏：${missing[0]}`)
    if (overLong.length > 0) fail(`① lesson 有 ${overLong.length} 页整段超了 ${QUOTE_BODY_MAX} 字：${overLong[0].title}`)
  }

  const lessonBad = quoteProblems(lessonSlides, source)
  if (lessonBad.length === 0) ok('② lesson 每条原文都是原文子串', `${lessonQuotes} 条`)
  else {
    lessonBad.forEach((m) => fail(`② ${m}`))
    bad('② lesson 原文逐字', lessonBad.join('；'))
  }

  /* ------------------- 3. 改一个字必须 fail ------------------- */

  const firstQuote = clipSlides.findIndex((s) => s.kind === 'quote' && String(s.text).includes('一条白线'))
  if (firstQuote < 0) {
    fail('③ clip 里找不到含「一条白线」的原文页，反向用例无法成立')
  } else {
    const tampered = clipSlides.map((s, i) =>
      i === firstQuote ? { ...s, text: String(s.text).replace('一条白线', '一条白带') } : s
    )
    const hits = quoteProblems(tampered, source)
    if (hits.length > 0) ok('③ 改一个字必须被抓到', hits[0])
    else fail('③ 把「一条白线」改成「一条白带」居然没报错，逐字检查是假的')
  }

  /* ------------------- 4. 无原文：不崩、不出 quote 页 ------------------- */

  /* 用 clip 口径跑：lesson 档的骨架稿本来就只有十来页（薄教案），页数差是既有缺口，
     与「无原文」无关；这一条只验「不崩、不出 quote、其余页型照旧」。 */
  const plainInput = lessonInput({ topic: '分数的初步认识', subject: '数学', grade: '三年级', duration: 240 })
  const plainPlan = skeletonPlan(plainInput)
  const plainLimits = limitsFor('standard', 'clip')
  let plainSlides: StudentSlide[] = []
  try {
    plainSlides = getBuiltinStudentSlides(plainPlan, plainLimits)
  } catch (e) {
    fail(`④ 无原文跑挂了：${e instanceof Error ? e.message : String(e)}`)
  }
  const plainQuotes = plainSlides.filter((s) => s.kind === 'quote').length
  const plainCheck = validateSlides(plainSlides, plainLimits)
  if (plainSlides.length > 0 && plainQuotes === 0 && plainCheck.ok) {
    ok('④ 无原文不出 quote 页、其余照旧', `${plainSlides.length} 页，校验通过`)
  } else if (plainSlides.length === 0) {
    fail('④ 无原文一页都没拿到')
  } else if (plainQuotes > 0) {
    fail(`④ 没给原文却出了 ${plainQuotes} 页 quote`)
  } else {
    fail(`④ 无原文那份没过校验：${plainCheck.problems.slice(0, 3).join('；')}`)
  }

  /* ------------------- 4b. 模型自己编的原文页不留（第六次真机） ------------------- */

  /* 那次没给原文，模型靠记忆交了「又想起故乡童年时代的摇花乐」，又被并上母亲那句的后半句，
     上屏成了原课文里没有的一句话。原文页的信任就建在「一字不错」上，编的一律撤。 */
  {
    const invented = '又想起故乡童年时代的摇花乐'
    const seeded: StudentSlide[] = [
      ...lessonSlides.filter((s) => s.kind !== 'quote'),
      { kind: 'quote', title: invented, text: invented, notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const noSource = { ...lessonPlan, meta: { ...lessonPlan.meta, text: '' } }
    const dropped = withQuotes(seeded, noSource, lessonLimits).filter((s) => s.kind === 'quote')
    if (dropped.length === 0) ok('④b 没给原文时，模型编的原文页一页不留')
    else fail(`④b 编的原文页还在：${dropped.map((q) => q.text ?? q.title).join(' / ')}`)

    const oneWait = '摇哇摇，桂花纷纷落下来，好香的雨啊！'
    const withSource = { ...lessonPlan, meta: { ...lessonPlan.meta, text: oneWait } }
    const kept = withQuotes(seeded, withSource, lessonLimits).filter((s) => s.kind === 'quote')
    const keys = kept.map((q) => sentenceKey(q.text ?? q.title))
    const hasReal = keys.includes(sentenceKey(oneWait))
    const hasFake = keys.some((k) => k.includes(sentenceKey(invented)))
    if (hasReal && !hasFake) ok('④b 有原文时只留逐字在原文里的那句', kept[0]?.text)
    else fail(`④b 原文校验没生效：${kept.map((q) => q.text ?? q.title).join(' / ') || '（一页都没有）'}`)
  }

  /* ------------------- 5. 禁用词零命中 ------------------- */

  const hits = [...bannedHits(clipSlides), ...bannedHits(lessonSlides), ...bannedHits(plainSlides)]
  if (hits.length === 0) ok('⑤ 七个禁用词零命中', '三叠页面逐字扫过')
  else {
    hits.slice(0, 6).forEach((h) => fail(`⑤ 禁词命中：${h}`))
    bad('⑤ 禁用词', `共 ${hits.length} 处`)
  }

  /* ------------------- 6. 换行不是句号（第二十二轮真机补的） ------------------- */

  /* 模型写原文时按句断行：《桂花雨》交上来的是「外地的桂花再香」+「还是比不得…」。
     以前一行一个 flush，学生版上就出现一张只写半句的页。合并后必须是一整句，
     而短小标题（「第一段」）不许跟正文粘成一句。 */
  const wrapped = splitQuotes('外地的桂花再香\n还是比不得家乡旧宅院子里的金桂。')
  const merged = '外地的桂花再香还是比不得家乡旧宅院子里的金桂。'
  if (wrapped.length === 1 && wrapped[0] === merged) ok('⑥ 换行不是句号：跨行半句拼回一整句', merged)
  else fail(`⑥ 跨行半句被切成了 ${wrapped.length} 页：${wrapped.join(' / ')}`)

  const headed = splitQuotes('第一段\n摇哇摇，桂花纷纷落下来。')
  if (headed.length === 1 && headed[0] === '摇哇摇，桂花纷纷落下来。') ok('⑥ 小标题不跟正文粘在一起')
  else fail(`⑥ 小标题粘错了：${headed.join(' / ')}`)

  /* 断在词中间的那种：前半行短得不足八字，也得接回去 */
  const cutWord = splitQuotes('外地的桂花再香，还是比不得家乡旧宅院\n子里的金桂。')
  const whole = '外地的桂花再香，还是比不得家乡旧宅院子里的金桂。'
  if (cutWord.length === 1 && cutWord[0] === whole) ok('⑥ 词中间断行也接得回来', whole)
  else fail(`⑥ 词中间断行被丢了：${JSON.stringify(cutWord)}`)

  /* 同一句话不许出两页：模型自己给的原文页 + meta.text 拼回来的那句，只能留一页 */
  {
    const overlapText = '外地的桂花再香，还是比不得家乡旧宅院\n子里的金桂。'
    const overlapPlan = { ...lessonPlan, meta: { ...lessonPlan.meta, text: overlapText } }
    const seeded: StudentSlide[] = [
      ...lessonSlides.filter((s) => s.kind !== 'quote'),
      { kind: 'quote', title: whole, text: whole, notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const merged = withQuotes(seeded, overlapPlan, lessonLimits)
    const quotesIn = merged.filter((s) => s.kind === 'quote')
    const same = sentenceKey(whole)
    if (quotesIn.length === 1 && sentenceKey(quotesIn[0].text ?? quotesIn[0].title) === same) {
      ok('⑦ 一句原文只出一页（屏上已有就不再加）')
    } else {
      fail(`⑦ 一句原文出了 ${quotesIn.length} 页：${quotesIn.map((q) => q.text ?? q.title).join(' / ')}`)
    }

    const keys = merged.filter((s) => s.kind === 'quote').map((s) => sentenceKey(s.text ?? s.title))
    const nested = keys.filter((k, i) => k.length >= 6 && keys.some((o, j) => j !== i && o.includes(k)))
    if (nested.length === 0) ok('⑦ 原文页之间没有互相包含')
    else fail(`⑦ 原文页互相包含：${nested.join(' / ')}`)
  }

  /* 相邻两页是同一句的两半（第一页句末是逗号）→ 并回一页；
     2026-11-22 用户拍板「原文页印整段」：相邻且逐字在原文里的两句**应当**并成一段（≤120 字）；
     不相邻的两句拼起来不是原文的一段，不许并。 */
  {
    /* 给上原文：原文页现在必须先过「逐字在原文里」这一关（④b），
       不给原文的话这两页还没轮到合并就被撤了，测不到合并那一段 */
    const plain = { ...lessonPlan, meta: { ...lessonPlan.meta, text: '这里的桂花再香，也比不上家乡院子里的桂花。' } }
    const halves: StudentSlide[] = [
      { kind: 'quote', title: '这里的桂花再香，', text: '这里的桂花再香，', notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'quote', title: '也比不上家乡院子里的桂花', text: '也比不上家乡院子里的桂花', notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const joined = withQuotes(halves, plain, lessonLimits).filter((s) => s.kind === 'quote')
    const want = '这里的桂花再香，也比不上家乡院子里的桂花'
    if (joined.length === 1 && (joined[0].text ?? joined[0].title) === want) ok('⑦ 同一句的两半并回一页', want)
    else fail(`⑦ 半句没并回去：${joined.map((q) => q.text ?? q.title).join(' / ')}`)

    const wholePlan = { ...lessonPlan, meta: { ...lessonPlan.meta, text: '啊！真像下雨！好香的雨呀！' } }
    const whole2: StudentSlide[] = [
      { kind: 'quote', title: '啊！真像下雨！', text: '啊！真像下雨！', notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'quote', title: '好香的雨呀！', text: '好香的雨呀！', notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const kept = withQuotes(whole2, wholePlan, lessonLimits).filter((s) => s.kind === 'quote')
    if (kept.length === 1 && (kept[0].text ?? kept[0].title) === '啊！真像下雨！好香的雨呀！')
      ok('⑦ 相邻两句并成整段', '啊！真像下雨！好香的雨呀！')
    else fail(`⑦ 相邻两句没并成整段：${kept.map((q) => q.text ?? q.title).join(' / ')}`)

    /* 反向闸：原文里隔着别的句子，且那一句已经在屏上（不会再被补进来）——
       这时首尾两句拼起来不是原文的一段，不许并。顺序打乱：隔句在最前。 */
    const gapPlan = {
      ...lessonPlan,
      meta: { ...lessonPlan.meta, text: '啊！真像下雨！中间隔着一句别的话。好香的雨呀！' },
    }
    const gapSlides: StudentSlide[] = [
      { kind: 'quote', title: '中间隔着一句别的话。', text: '中间隔着一句别的话。', notes: '这一页把这句话原样放在屏幕上。' },
      ...whole2,
    ]
    const gapped = withQuotes(gapSlides, gapPlan, lessonLimits).filter((s) => s.kind === 'quote')
    const fabricated = gapped.some((q) => {
      const t = String(q.text ?? q.title ?? '')
      return t.includes('啊！真像下雨') && t.includes('好香的雨呀')
    })
    if (!fabricated) ok('⑦ 不相邻的两句不并（拼起来不是原文的一段）')
    else fail('⑦ 把不相邻的两句拼成了一页——等于编课文')
  }

  /* 并过一次就封口（第四次真机）：四张半句被连吞成一整段
     「摇哇摇，桂花纷纷落下来好香的雨啊外地的桂花再香…」，60 字上限也没抱住 */
  {
    const plain = {
      ...lessonPlan,
      meta: { ...lessonPlan.meta, text: '摇哇摇，桂花纷纷落下来，好香的雨啊！外地的桂花再香。' },
    }
    const three: StudentSlide[] = [
      { kind: 'quote', title: '摇哇摇，桂花纷纷落下来', text: '摇哇摇，桂花纷纷落下来', notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'quote', title: '好香的雨啊', text: '好香的雨啊', notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'quote', title: '外地的桂花再香', text: '外地的桂花再香', notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const out = withQuotes(three, plain, lessonLimits).filter((s) => s.kind === 'quote')
    const want = '摇哇摇，桂花纷纷落下来，好香的雨啊'
    if (out.length === 2 && (out[0].text ?? out[0].title) === want) {
      ok('⑦ 只并相邻两半，不连吞第三张', want)
    } else {
      fail(`⑦ 半句吞并失控：${out.map((q) => q.text ?? q.title).join(' / ')}`)
    }
    /* 接缝处补回被换行吞掉的逗号：上屏得是一句话，不是「落下来好香的雨啊」 */
    if (want.includes('下来，好香')) ok('⑦ 接缝无标点时补回逗号')
    else fail('⑦ 接缝处没补逗号')
  }

  /* 一页已经包含另一页就不许再接（第五次真机）：
     模型先给了整句，紧接着又给了这句的后半句，第 7 页变成同一句话说两遍 */
  {
    const plain = {
      ...lessonPlan,
      meta: { ...lessonPlan.meta, text: '外地的桂花再香，还是比不得家乡旧宅院子里的金桂。' },
    }
    const full = '外地的桂花再香，还是比不得家乡旧宅院子里的金桂'
    const half = '还是比不得家乡旧宅院子里的金桂'
    const twice: StudentSlide[] = [
      { kind: 'quote', title: full, text: full, notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'quote', title: half, text: half, notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const dedup = withQuotes(twice, plain, lessonLimits).filter((s) => s.kind === 'quote')
    if (dedup.length === 1 && sentenceKey(dedup[0].text ?? dedup[0].title) === sentenceKey(full)) {
      ok('⑦ 整句后面跟着后半句时，后半句不进页')
    } else {
      fail(`⑦ 同一句话说两遍：${dedup.map((q) => q.text ?? q.title).join(' / ')}`)
    }

    /* 反着来：先半句后整句 → 留整句 */
    const flipped: StudentSlide[] = [twice[1], twice[0]]
    const kept = withQuotes(flipped, plain, lessonLimits).filter((s) => s.kind === 'quote')
    if (kept.length === 1 && sentenceKey(kept[0].text ?? kept[0].title) === sentenceKey(full)) {
      ok('⑦ 半句后面跟着整句时，留整句')
    } else {
      fail(`⑦ 先半后整没收敛：${kept.map((q) => q.text ?? q.title).join(' / ')}`)
    }
  }

  /* ------------------- 9. 不相邻的三页也要去重（2026-11-21 真机《狼牙山五壮士》） -------------------
     第 6 页整句、第 15 页前半句、第 18 页后半句：三页夹在课文里不相邻，
     mergeHalfQuotes 只管相邻两张，于是同一句上了三次台。全局包含去重必须接住。 */
  {
    const plain = {
      ...lessonPlan,
      meta: {
        ...lessonPlan.meta,
        text: '班长马宝玉斩钉截铁地说了一声：“走！”带头向棋盘陀走去。',
      },
    }
    const full = '班长马宝玉斩钉截铁地说了一声：“走！”带头向棋盘陀走去'
    const front = '班长马宝玉斩钉截铁地说了一声：“走！”'
    const back = '带头向棋盘陀走去'
    /* 页数下限放松到 2：这一条只管去重，不拿页数区间干扰判定
       （真机里 20 页，剔掉后半句仍远高于下限，保护不会触发） */
    const loose = { ...lessonLimits, pagesMin: 2 }
    const three: StudentSlide[] = [
      { kind: 'quote', title: full, text: full, notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'drill', title: '把这句话读三遍', line: '同桌互相听一遍。', notes: '' },
      { kind: 'quote', title: front, text: front, notes: '这一页把这句话原样放在屏幕上。' },
      { kind: 'hook', title: '他为什么说得这么坚决', line: '你从哪个词看出来的？', notes: '' },
      { kind: 'quote', title: back, text: back, notes: '这一页把这句话原样放在屏幕上。' },
    ]
    const out = withQuotes(three, plain, loose).filter((s) => s.kind === 'quote')
    if (out.length === 1 && sentenceKey(out[0].text ?? out[0].title) === sentenceKey(full)) {
      ok('⑨ 不相邻的半句原文被整句盖住时不再单独出页')
    } else {
      fail(`⑨ 同一句原文出了 ${out.length} 页：${out.map((q) => q.text ?? q.title).join(' / ')}`)
    }

    /* 两句互不包含的真句：一页都不许被吞。
       原文里就得有这两句（否则 dropUnverifiedQuotes 会当成编的原文删掉），
       但不能含 full——那是上一条的事 */
    const other = {
      ...lessonPlan,
      meta: {
        ...lessonPlan.meta,
        text: '五位壮士屹立在狼牙山顶峰。这声音惊天动地，气壮山河！',
      },
    }
    const two: StudentSlide[] = [
      { kind: 'quote', title: '五位壮士屹立在狼牙山顶峰', text: '五位壮士屹立在狼牙山顶峰', notes: '' },
      { kind: 'drill', title: '把这一段读一遍', line: '读准每个字。', notes: '' },
      { kind: 'quote', title: '这声音惊天动地', text: '这声音惊天动地', notes: '' },
    ]
    const kept2 = withQuotes(two, other, loose).filter((s) => s.kind === 'quote')
    /* 只看这两句是否都在：原文池还会自己补一页（那是正常行为，不参与这条计数） */
    const has = (t: string) =>
      kept2.some((q) => sentenceKey(String(q.text ?? q.title)).includes(sentenceKey(t)))
    if (has('五位壮士屹立在狼牙山顶峰') && has('这声音惊天动地')) {
      ok('⑨ 两句互不包含的原文都不删')
    } else {
      fail(`⑨ 不相干的原文被删了：${kept2.map((q) => q.text ?? q.title).join(' / ')}`)
    }
  }

  /* 合并出来的那一句也得是「原文的子串」——把换行当空白去掉后比，不能凭空多字、少字 */
  const flat = '外地的桂花再香\n还是比不得家乡旧宅院子里的金桂。'.replace(/\s+/g, '')
  if (wrapped.every((q) => flat.includes(q))) ok('⑥ 拼回来的句子逐字都在原文里')
  else fail('⑥ 拼回来的句子不是原文的子串（多字或少字）')

  /* ------------------- 8. 模型给的原文也进得来（2026-11-21 A 案） ------------------- */

  /* 老师没贴原文时，由备课包自己交 3–5 句课本原句。四把尺子：带编号/出处要剥掉、
     解释句要丢掉、老师贴的优先、落进 meta.text 后原文页逐字都对得上。 */
  {
    const first = '蔺相如说：“我愿意带着和氏璧到秦国去。”'
    const second = '廉颇说：“我廉颇攻无不克，战无不胜。”'
    const third = '于是，他脱下战袍，背上荆条，到蔺相如门上请罪。'
    const modelRaw = [
      `1. ${first}（人教版五年级上册）`,
      `2. ${second}`,
      `3. ${third}`,
      '本文通过三个小故事说明了将相和的道理。',
    ].join('\n')

    const g = groundText('', modelRaw)
    const lines = g.split('\n')
    if (lines.length === 3 && lines[0] === first && lines[1] === second && lines[2] === third) {
      ok('⑧ 模型交的原文：剥掉编号与出处、丢掉解释句', `${lines.length} 句`)
    } else {
      fail(`⑧ 模型原文过筛不对：${JSON.stringify(g)}`)
    }

    const own = groundText('老师贴的这一句逐字用，不许换。', modelRaw)
    if (own === '老师贴的这一句逐字用，不许换。') ok('⑧ 老师贴的原文优先于模型给的')
    else fail(`⑧ 老师贴的原文被模型盖掉了：${JSON.stringify(own)}`)

    const nothing = groundText('', '本文通过三个小故事说明了将相和的道理。')
    if (nothing === '') ok('⑧ 只有解释句时一句都不收')
    else fail(`⑧ 解释句被当成原文：${JSON.stringify(nothing)}`)

    /* 落进学生版：新建一份 meta.text = 模型原文的 plan，原文页逐字都得在这一份里 */
    const p = { ...lessonPlan, meta: { ...lessonPlan.meta, topic: '将相和', text: g } }
    const deck = withQuotes(
      lessonSlides.filter((s) => s.kind !== 'quote'),
      p,
      lessonLimits
    )
    const quotesIn = deck.filter((s) => s.kind === 'quote')
    const flatG = g.replace(/\s+/g, '')
    const bad = quotesIn.filter((s) => !flatG.includes(String(s.text ?? '').replace(/\s+/g, '')))
    if (quotesIn.length >= 2 && bad.length === 0) ok('⑧ 模型原文进了原文页且逐字不改', `${quotesIn.length} 页`)
    else fail(`⑧ 模型原文没进原文页：${quotesIn.map((q) => q.text ?? q.title).join(' / ') || '（一页都没有）'}`)

    /* 提示词两头都要写死：有原文就逐字用；一句都没有就一页原文页都不许出 */
    const withSrc = buildStudentSlidesPrompt(p)
    const noSrc = buildStudentSlidesPrompt({ ...p, meta: { ...p.meta, text: '' } })
    const a = withSrc.user.includes(first) && withSrc.system.includes('课本上怎么写的就怎么摆上屏')
    const b = noSrc.user.includes('一页原文页都不许出')
    if (a && b) ok('⑧ 提示词：有原文逐字用、没原文不许编')
    else fail(`⑧ 提示词口径丢了（有原文 ${a ? '✓' : '✗'} / 没原文 ${b ? '✓' : '✗'}）`)
  }

  /* ------------------- 交付物：40 分钟真跑 ------------------- */

  /* 已知缺口（不在 19a 范围内）：骨架稿是薄教案，40 分钟只有 20 页，比 22 页下限少 2 页——
     这是 skeleton + lessonSlides 的既有问题（DEVLOG 里记过「薄教案 40 分钟只有 16 张」），
     19a 只负责原文页，不在这里补页数。所以导出时按这一叠自己的页数放行，
     只为把「原文页真的进了 .pptx」这条证据交出去，不代表 20 页够 40 分钟用。 */
  if (lessonSlides.length < lessonLimits.pagesMin) {
    console.log(
      `! 已知缺口：骨架稿 ${lessonSlides.length} 页，比 40 分钟下限 ${lessonLimits.pagesMin} 页少 ${lessonLimits.pagesMin - lessonSlides.length} 页（薄教案，19a 不修页数）`
    )
  }
  const exportLimits =
    lessonSlides.length < lessonLimits.pagesMin
      ? { ...lessonLimits, pagesMin: lessonSlides.length }
      : lessonLimits

  try {
    rmSync(PPTX, { force: true })
    mkdirSync('/tmp', { recursive: true })
    const r = await downloadPptx(lessonSlides, undefined, PPTX, undefined, { limits: exportLimits })
    if (r.pages === lessonSlides.length) ok('交付物 .pptx 页数对得上', `${r.pages} 页 → ${PPTX}`)
    else fail(`交付物 .pptx 是 ${r.pages} 页，学生版是 ${lessonSlides.length} 页`)

    const xml = slideEntries(PPTX)
      .map((e) => unzipEntry(PPTX, e))
      .join('\n')
    const lost = entry.quotes.filter((q) => !xml.includes(q))
    if (lost.length === 0) ok('交付物 .pptx 里每句原文逐字都在', `${entry.quotes.length} 句`)
    else fail(`交付物 .pptx 里少了原文：${lost.join('；')}`)
  } catch (e) {
    fail(`交付物 .pptx 导出失败：${e instanceof Error ? e.message : String(e)}`)
  }

  const lines = lessonSlides.map(dumpLine)
  writeFileSync(TXT, `${lines.join('\n')}\n`, 'utf8')
  try {
    const bytes = statSync(TXT).size
    ok('交付物 .txt 一行一页', `${lines.length} 行 / ${bytes} 字节 → ${TXT}`)
  } catch {
    fail('交付物 .txt 没写出来')
  }
  for (const line of lines) console.log(`  ${line}`)

  /* ------------------- 结论 ------------------- */

  console.log('')
  if (failures.length === 0) {
    console.log('check:quote 全部通过（①–⑨ + 两件交付物）')
    return
  }
  console.log(`check:quote 未通过：${failures.length} 条`)
  failures.forEach((m) => console.log(`  ✗ ${m}`))
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})