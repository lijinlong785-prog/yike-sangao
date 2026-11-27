/**
 * check:capacity —— 「按这套模板能写多少字」是量出来的，不是猜的（TASKS/20 第 3 步）
 *
 * 四条：
 *   1. 各族 × 七项容量全部量得出来（没有 0、没有空）
 *   2. 公共安全线不宽于内容层上限（生成端不会比校验端更松）
 *   3. 按公共安全线写满一页，换到各族里任何一族都不越界
 *   4. 同一页写满时，两块字也不压在一起；正文字号没被缩到不可读
 *   5. 生成端的提示词里写的就是这一份容量（不是另写一份硬编码）
 */
import { CAP_MARK, LEGIBLE_PT, capacityOf, capacityTable, extentOf, tightCapacity, type ArchFit } from '../src/lib/deck2/capacity'
import { FAMILIES, FAMILY_REPS, TEMPLATES } from '../src/lib/deck2/theme'
import { place, type Placed } from '../src/lib/deck2/place'
import { ENVELOPE, WORDS_ITEMS_MAX } from '../src/lib/density'
import { buildStudentSlidesPrompt } from '../src/lib/prompt'
import type { StudentSlide } from '../src/lib/slides'
import type { LessonPlan } from '../src/types'

const FAIL: string[] = []
const fail = (m: string) => FAIL.push(m)
const ok = (name: string, note: string) => console.log(`✓ ${name} — ${note}`)

/** 与 capacity.fits() 同一口径：被 settle 缩过的块才算「被挤」，缩到 18pt 以下才算不可读 */
const MIN_PT = LEGIBLE_PT

/* --------------------------- 1 · 容量表 --------------------------- */

console.log('=== 1. 各族 × 七项容量（从 place() 反算） ===')
{
  const table = capacityTable()
  const cell = (f: ArchFit) => `${f.chars}字/${f.items}条×${f.each}字`
  console.log(
    ['族'.padEnd(8), '标题', '问句', '正文', '编号', '对比', '字词', '原文', '收尾'].join(' | '),
  )
  for (const c of table) {
    console.log(
      [
        (FAMILIES[c.family].name + c.family).padEnd(8),
        String(c.title),
        String(c.line),
        cell(c.body),
        cell(c.numbered),
        cell(c.compare),
        cell(c.words),
        String(c.quote),
        cell(c.end),
      ].join(' | '),
    )
  }
  const zero = table.filter(
    (c) =>
      c.title <= 0 ||
      c.line <= 0 ||
      c.quote <= 0 ||
      [c.body, c.numbered, c.compare, c.words, c.end].some((f) => f.chars <= 0 || f.items <= 0),
  )
  if (zero.length) fail(`1 ${zero.map((c) => c.family).join(' / ')} 有量不出来的项`)
  else ok('1 各族容量', `${table.length} 族 × 7 项，全部量得出来`)
}

const t = tightCapacity()

/* ---------------------- 2 · 安全线不宽于内容层 ---------------------- */

console.log('\n=== 2. 公共安全线 vs 内容层上限 ===')
{
  console.log(
    `  公共安全线（各族取 min）：标题 ${t.title} / 问句 ${t.line} / 正文 ${t.body.chars}字·${t.body.items}条 / 编号 ${t.numbered.chars}字·${t.numbered.items}条 / 对比 ${t.compare.chars}字·${t.compare.items}条 / 字词 ${t.words.chars}字·${t.words.items}词 / 原文 ${t.quote}字 / 收尾 ${t.end.chars}字`,
  )
  const bad: string[] = []
  if (t.body.chars > ENVELOPE.bodyChars) bad.push(`正文 ${t.body.chars} > ${ENVELOPE.bodyChars}`)
  if (t.body.items > ENVELOPE.itemsMax) bad.push(`正文条数 ${t.body.items} > ${ENVELOPE.itemsMax}`)
  if (t.numbered.items > ENVELOPE.itemsMax) bad.push(`编号条数 ${t.numbered.items} > ${ENVELOPE.itemsMax}`)
  if (t.compare.items > ENVELOPE.itemsMax) bad.push(`对比条数 ${t.compare.items} > ${ENVELOPE.itemsMax}`)
  if (t.words.items > WORDS_ITEMS_MAX) bad.push(`字词 ${t.words.items} 词 > ${WORDS_ITEMS_MAX}`)
  if (bad.length) fail(`2 安全线宽于内容层：${bad.join(' / ')}`)
  /* 太紧也是错：连 lean 档（30 字 / 4 条）都放不下，提示词会把所有稿子压成 20 字 */
  const narrow: string[] = []
  if (t.body.chars < 30) narrow.push(`正文 ${t.body.chars} < 30`)
  if (t.body.items < 4) narrow.push(`正文条数 ${t.body.items} < 4`)
  if (t.quote < 20) narrow.push(`原文 ${t.quote} < 20`)
  if (narrow.length) fail(`2 安全线过紧（各族里有一族的框连 lean 档都放不下）：${narrow.join(' / ')}`)
  if (!bad.length && !narrow.length) ok('2 安全线', `不宽于内容层（${ENVELOPE.bodyChars}字/${ENVELOPE.itemsMax}条），也不紧于 lean 档`)
}

/* ------------------ 3 · 按安全线写满，各族不越界 ------------------ */

/** 按上限造一页：items 条，每条 each 字，每行每字都用同一个字（便于定位） */
function filled(each: number, items: number, ch: string): string[] {
  return Array.from({ length: Math.max(1, items) }, () => ch.repeat(Math.max(1, each)))
}

const FIXTURES: [string, StudentSlide, string][] = [
  [
    '正文写满',
    {
      kind: 'close-read',
      title: CAP_MARK.title.repeat(t.title),
      line: CAP_MARK.line.repeat(t.line),
      items: filled(t.body.each, t.body.items, CAP_MARK.body),
      notes: '',
    } as StudentSlide,
    CAP_MARK.body,
  ],
  [
    '编号写满',
    {
      kind: 'board',
      title: CAP_MARK.title.repeat(t.title),
      line: CAP_MARK.line.repeat(t.line),
      items: filled(t.numbered.each, t.numbered.items, CAP_MARK.body),
      notes: '',
    } as StudentSlide,
    CAP_MARK.body,
  ],
  [
    '对比写满',
    {
      kind: 'compare',
      title: CAP_MARK.title.repeat(t.title),
      line: CAP_MARK.line.repeat(t.line),
      items: filled(t.compare.each, t.compare.items, CAP_MARK.body),
      notes: '',
    } as StudentSlide,
    CAP_MARK.body,
  ],
  [
    '字词写满',
    {
      kind: 'words',
      title: CAP_MARK.title.repeat(t.title),
      line: CAP_MARK.line.repeat(t.line),
      items: Array.from({ length: t.words.items }, () => CAP_MARK.body.repeat(t.words.chars)),
      notes: '',
    } as StudentSlide,
    CAP_MARK.body,
  ],
  [
    '原文写满',
    {
      kind: 'quote',
      title: CAP_MARK.title.repeat(t.title),
      text: CAP_MARK.quote.repeat(t.quote),
      /* 真页有出处：原文写满时出处也在，不能置空（置空就测不出原文压出处） */
      note: CAP_MARK.note.repeat(10),
      items: [],
      notes: '',
    } as StudentSlide,
    CAP_MARK.quote,
  ],
  [
    '收尾写满',
    {
      kind: 'end',
      title: CAP_MARK.title.repeat(t.title),
      line: CAP_MARK.end.repeat(Math.min(t.end.chars, t.line)),
      items: [],
      notes: '',
    } as StudentSlide,
    CAP_MARK.end,
  ],
]

console.log('\n=== 3. 按安全线写满，各族都不越界 ===')
let over = 0
let outOfPaper = 0
for (const id of Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]) {
  const theme = TEMPLATES[FAMILY_REPS[id]]
  for (const [label, slide] of FIXTURES) {
    let out: Placed[] = []
    try {
      out = place(slide, theme)
    } catch (e) {
      over++
      fail(`3 ${id}/${label}：place() 抛错（${(e as Error).message}）`)
      continue
    }
    for (const p of out) {
      if (p.x < -1e-6 || p.y < -1e-6 || p.x + p.w > 1 + 1e-6 || p.y + p.h > 1 + 1e-6) {
        outOfPaper++
        fail(`3 ${id}/${label}：${p.kind} 越界 (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.w.toFixed(3)}, ${p.h.toFixed(3)})`)
      }
    }
  }
}
if (!over && !outOfPaper) ok('3 安全线排版', `${Object.keys(FAMILIES).length} 族 × ${FIXTURES.length} 页写满，零抛错、零越界`)

/* ------------------- 4 · 写满时字不压字、字号不塌 ------------------- */

console.log('\n=== 4. 写满时：字不压字、字号不被缩到不可读 ===')
{
  let hit = 0
  let small = 0
  for (const id of Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]) {
    const theme = TEMPLATES[FAMILY_REPS[id]]
    for (const [label, slide, mark] of FIXTURES) {
      const texts = place(slide, theme).filter((p) => p.kind === 'text' && String(p.text ?? '').trim())
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = extentOf(texts[i])
          const b = extentOf(texts[j])
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          const s = w > 0 && h > 0 ? w * h : 0
          const smallBox = Math.min(a.w * a.h, b.w * b.h)
          if (smallBox > 0 && s / smallBox > 0.12) {
            hit++
            fail(`4 ${id}/${label}：「${String(texts[i].text ?? '').slice(0, 6)}」压「${String(texts[j].text ?? '').slice(0, 6)}」`)
          }
        }
      }
      /* 字被安全网缩到 18pt 以下：说明容量表比这一族的框松，模型照它写会被缩字。
         判据与 capacity.fits() 完全一致：只有 settle 真缩过（size0 存在）的块才算
         「被挤」；12pt 页名与 9pt 页脚本来就这么小，不用 size0 冤枉它们。
         只查正文块（按标记字认），装饰件不在这一条里 */
      for (const p of texts) {
        if (!String(p.text ?? '').includes(mark)) continue
        if (p.size0 !== undefined && (p.size ?? 0) < MIN_PT) {
          small++
          fail(`4 ${id}/${label}：被从 ${p.size0}pt 缩到 ${p.size}pt（低于 ${MIN_PT}pt 不可读），容量表偏松`)
        }
      }
    }
  }
  if (!hit) ok('4 不压字', `${Object.keys(FAMILIES).length} 族 × ${FIXTURES.length} 页写满，字块互压 0 处`)
  if (!small) ok('4 字号不塌', `写满时没有一块字被缩到 ${MIN_PT}pt 以下`)
}

/* ------------------- 5 · 提示词与模板同源 ------------------- */

console.log('\n=== 5. 提示词里的容量 = 现量的那一份（生成端同源） ===')
{
  const plan = {
    meta: {
      topic: '桂花雨',
      subject: '语文',
      stage: '小学',
      grade: '五年级',
      period: '第一课时',
      textbook: '',
      duration: 2400,
      text: '',
    },
    objectives: { knowledge: '', process: '', emotion: '' },
    keyPoint: '',
    hardPoint: '',
    preparation: '',
    segments: [],
    homework: { must: '', optional: '' },
    blackboard: { layout: '', order: [] },
    prep: { courseware: [], physical: [], media: [] },
    speech: [],
    defense: [],
  } as unknown as LessonPlan
  const { system } = buildStudentSlidesPrompt(plan, 'standard', 'lesson')
  const want = [
    '本套模板的页面容量',
    `标题 ≤ ${t.title} 字`,
    `问句行 ≤ ${t.line} 字`,
    `普通正文页：≤ ${t.body.items} 条，每条 ≤ ${t.body.each} 字`,
    `编号页（板书 / 练一练 / 作业）：≤ ${t.numbered.items} 条，每条 ≤ ${t.numbered.each} 字`,
    `对比页：≤ ${t.compare.items} 条，每条 ≤ ${t.compare.each} 字`,
    `原文页：整句逐字照抄，不许改字；长句会自动拆成多页原文页`,
  ]
  const miss = want.filter((s) => !system.includes(s))
  if (miss.length) fail(`5 提示词里缺：${miss.join(' / ')}`)
  else ok('5 生成端同源', `提示词里 7 项容量（含每条字数）与现量的数字逐字相同`)
}

/* ------------------------- 6 · 纯函数 + 缓存 ------------------------- */

console.log('\n=== 6. 同一族量两遍一致，且算得起 ===')
{
  const t0 = Date.now()
  const first = capacityOf('suke')
  const second = capacityOf('suke')
  const ms = Date.now() - t0
  if (first !== second) fail('6 capacityOf 同一族两次返回不同对象——缓存没生效')
  const a = JSON.stringify(first)
  const b = JSON.stringify(second)
  if (a !== b) fail('6 同一族两次量出来的数字不同——不纯')
  let total = 0
  const t1 = Date.now()
  for (const id of Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]) {
    const c = capacityOf(id)
    total += c.body.chars
  }
  const msAll = Date.now() - t1
  if (msAll > 300) fail(`6 各族算容量 ${msAll}ms，太慢（提示词构建会卡）`)
  if (!FAIL.some((f) => f.startsWith('6 '))) {
    ok('6 纯函数 + 缓存', `同一族两次逐字节相同；各族合计 ${msAll}ms（缓存命中 ${ms}ms）`)
    void total
  }
}

/* ------------------------------ 汇总 ------------------------------ */

console.log('')
if (FAIL.length) {
  console.error(`check:capacity 未通过：${FAIL.length} 条`)
  for (const f of FAIL.slice(0, 30)) console.error(`  ✗ ${f}`)
  if (FAIL.length > 30) console.error(`  …另有 ${FAIL.length - 30} 条`)
  process.exit(1)
}
console.log('✓ check:capacity 六条全过：容量可量 / 安全线不宽不紧 / 写满不越界 / 字不压字 / 提示词同源 / 纯函数')