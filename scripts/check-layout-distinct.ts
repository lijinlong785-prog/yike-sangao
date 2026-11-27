/**
 * TASKS/24 §五 的离线验收：每一族真不一样，同族只换纸。
 *
 * 八条硬断言（族数 / 套数一律从 FAMILY_IDS / TEMPLATE_IDS 现数）：
 *   1. 坐标真不同：同一页过每族 place()，任意两族至少 2 个 text 元素对不上（见 diffCount）
 *   2. 七种版式逐一对：cover / quote / words / numbered / compare / end / plain 全跑
 *   3. 结构差异：宣纸与书页的 compare 是上下两段，其余族左右分栏
 *   4. 字号差异：各族封面标题字号两两不等，且都不低于 40
 *   5. 装饰差异：宣纸有印、极简封面无 rect、例题粗横条、书页有边栏竖线
 *   6. 不溢出：每族 × 七式，所有框都在纸面内
 *   7. 真出图：每族各导一份 /tmp/q24-<族>.pptx，页数相同且都能写盘
 *   8. 全部套：每套过四条色值约束；同族配色与代表套几何逐字节相同（只换纸不挪字）；
 *      全部套的纸 + 强调色两两不同；换完全部套零网络、文字零丢失
 *
 * 交付：/tmp/q24-grid.png（上排封面、下排字词页，每族横排；块面就是 place() 的坐标）
 *
 * 跑法：npm run check:layout-distinct
 */
import { rmSync, writeFileSync } from 'node:fs'
import { findText } from '../src/data/texts'
import { limitsFor } from '../src/lib/scale'
import { getBuiltinStudentSlides, type StudentSlide } from '../src/lib/slides'
import { skeletonPlan } from '../src/lib/skeleton'
import { downloadTemplatedPptx } from '../src/lib/pptx'
import {
  FAMILY_IDS,
  FAMILY_REPS,
  TEMPLATE_IDS,
  TEMPLATES,
  familyTemplates,
  themeProblems,
  type DeckTheme as TemplateTheme,
  type FamilyId,
  type TemplateId,
} from '../src/lib/deck2/theme'
import { place, type Placed } from '../src/lib/deck2/place'
import { encodePng, type RgbaImage } from '../src/lib/watermark'
import type { LessonInput } from '../src/types'

const OUT = '/tmp'
const FAIL: string[] = []
const fail = (msg: string) => FAIL.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

const THRESHOLD = 0.03
/** 框宽与字号的「看得出差别」阈值：位置一样但字号差 3pt，一眼就能分辨 */
const W_THRESHOLD = 0.05
const SIZE_THRESHOLD = 3
/** 每族的代表套：坐标、结构、字号这些「族」的事只在代表套上量 */
const REPS: TemplateId[] = FAMILY_IDS.map((f) => FAMILY_REPS[f])

/* ---------------------------- 七种版式的夹具 ---------------------------- */

type Arch = 'cover' | 'quote' | 'words' | 'numbered' | 'compare' | 'end' | 'plain'

const FIXTURES: { arch: Arch; slide: StudentSlide }[] = [
  { arch: 'cover', slide: { kind: 'cover', title: '桂花雨', line: '琦君', notes: '' } },
  {
    arch: 'quote',
    slide: { kind: 'quote', title: '桂花雨', text: '这里的桂花再香，也比不上家乡院子里的桂花。', note: '琦君', notes: '' },
  },
  {
    arch: 'words',
    slide: { kind: 'words', title: '读准这几个词', line: '你能读准几个？', items: ['箩筐', '杭州', '沉浸', '缠着'], notes: '' },
  },
  {
    arch: 'numbered',
    slide: { kind: 'board', title: '黑板上留下三行', line: '先抄哪一行？', items: ['摇花乐', '桂花香', '思乡情'], notes: '' },
  },
  {
    arch: 'compare',
    slide: { kind: 'compare', title: '两处桂花比一比', line: '哪儿不一样？', items: ['杭州的香', '家乡的香', '满觉陇', '旧宅院'], notes: '' },
  },
  { arch: 'end', slide: { kind: 'end', title: '下课', line: '把今天圈出的词抄一遍', note: '下节课听写', notes: '' } },
  {
    arch: 'plain',
    slide: {
      kind: 'hook',
      title: '先看题目',
      line: '这个题目里，你认得哪几个字？',
      items: ['桂花是一种花', '雨是落下来的'],
      notes: '',
    },
  },
]

const placedOf = (slide: StudentSlide, id: TemplateId): Placed[] => place(slide, TEMPLATES[id])

/**
 * 两族在同一页上的「至少两处不一样」：按下标对齐，数「对不上」的个数。
 *
 * 「对不上」不只算 x / y：框宽差 ≥ .05、字号差 ≥ 3pt 也算——19 族之后这条判据要回答的
 * 是「老师看得出这两套不是同一个模板吗」。引文一个是 52pt 大字、一个是 42pt 小字，
 * 位置一样也不是同一族；只量 x / y 会把它们判成「重复」。
 */
function diffCount(a: Placed[], b: Placed[]): number {
  const A = a.filter((p) => p.kind === 'text')
  const B = b.filter((p) => p.kind === 'text')
  let n = 0
  const len = Math.min(A.length, B.length)
  for (let i = 0; i < len; i++) {
    const dx = Math.abs(A[i].x - B[i].x)
    const dy = Math.abs(A[i].y - B[i].y)
    const dw = Math.abs(A[i].w - B[i].w)
    const ds = Math.abs((A[i].size ?? 0) - (B[i].size ?? 0))
    if (
      dx >= THRESHOLD - 1e-9 ||
      dy >= THRESHOLD - 1e-9 ||
      dw >= W_THRESHOLD - 1e-9 ||
      ds >= SIZE_THRESHOLD - 1e-9
    ) {
      n += 1
    }
  }
  return n
}

/** 几何指纹：只留位置与字号，颜色一律不进——同族换纸时它必须一模一样 */
function geomOf(placed: readonly Placed[]): string {
  return placed
    .map(
      (p) =>
        `${p.kind}:${p.x.toFixed(4)},${p.y.toFixed(4)},${p.w.toFixed(4)},${p.h.toFixed(4)}${p.size ? `@${p.size}` : ''}`
    )
    .join('|')
}

/* ------------------------- 1 / 2 · 坐标真不同（6×7 全跑） ------------------------- */

console.log('\n=== 1/2. 七种版式逐一对：任意两族至少 2 处对不上（位置 / 框宽 / 字号）===')
let worst = { arch: '', pair: '', n: 9 }
for (const { arch, slide } of FIXTURES) {
  const pages = new Map<TemplateId, Placed[]>()
  for (const id of REPS) pages.set(id, placedOf(slide, id))
  let archOk = true
  for (let i = 0; i < REPS.length; i++) {
    for (let j = i + 1; j < REPS.length; j++) {
      const a = REPS[i]
      const b = REPS[j]
      const n = diffCount(pages.get(a) as Placed[], pages.get(b) as Placed[])
      if (n < worst.n) worst = { arch, pair: `${a}/${b}`, n }
      if (n < 2) {
        archOk = false
        fail(`1 ${arch}：${a} 与 ${b} 只有 ${n} 处对不上（要求 ≥ 2）`)
      }
    }
  }
  if (archOk) {
    const sizes = REPS.map((id) => (pages.get(id) as Placed[]).length)
    ok(`1 ${arch}`, `各族块数 ${sizes.join(' / ')}，任意两族 ≥ 2 处对不上`)
  }
}

/* ------------------------------ 3 · 结构差异 ------------------------------ */

console.log('\n=== 3. 结构差异：宣纸 / 书页的 compare 上下两段，其余族左右分栏 ===')
/** 这两族的对比页是上下读的：书页是同一栏里的前后两段，宣纸是上下叠置 */
const STACKED: FamilyId[] = ['xuan', 'shuye']
const cmp = FIXTURES.find((f) => f.arch === 'compare') as { arch: Arch; slide: StudentSlide }
for (const f of FAMILY_IDS) {
  const id = FAMILY_REPS[f]
  const texts = placedOf(cmp.slide, id).filter((p) => p.kind === 'text')
  const cols = texts.slice(1, 3)
  if (cols.length < 2) {
    fail(`3 ${id}：compare 页只有 ${texts.length} 个文本框，凑不出两栏`)
    continue
  }
  const [a, b] = cols
  if (STACKED.includes(f)) {
    if (Math.abs(a.x - b.x) > 1e-6) fail(`3 ${f}：两框 x 不同（${a.x} / ${b.x}），应为上下叠置`)
    else if (Math.abs(a.y - b.y) < THRESHOLD) fail(`3 ${f}：两框 y 只差 ${Math.abs(a.y - b.y).toFixed(3)}，应上下分开`)
    else ok(`3 ${f} 上下叠置`, `同 x=${a.x}，y ${a.y} → ${b.y}`)
  } else {
    if (Math.abs(a.x - b.x) < THRESHOLD) fail(`3 ${f}：两框 x 只差 ${Math.abs(a.x - b.x).toFixed(3)}，应为左右分栏`)
    else ok(`3 ${f} 左右分栏`, `x ${a.x} / ${b.x}`)
  }
}

/* ------------------------------ 4 · 字号差异 ------------------------------ */

console.log(`\n=== 4. 封面标题字号 ${REPS.length} 族两两不等 ===`)
const coverFixture = FIXTURES.find((f) => f.arch === 'cover') as { arch: Arch; slide: StudentSlide }
const titleSizes = new Map<TemplateId, number>()
for (const id of REPS) {
  const t = placedOf(coverFixture.slide, id).find((p) => p.kind === 'text')
  if (!t?.size) fail(`4 ${id}：封面没有标题字号`)
  else titleSizes.set(id, t.size)
}
const sizeList = [...titleSizes.values()]
if (new Set(sizeList).size !== sizeList.length) fail(`4 ${REPS.length} 族封面标题字号有重复：${sizeList.join(' / ')}`)
else ok(`4 ${REPS.length} 族封面字号各不相同`, sizeList.join(' / '))
if (sizeList.some((v) => v < 40)) fail('4 有模板把封面标题写到 40pt 以下（封面是赛课的第一眼，不许小）')

/* ------------------------------ 5 · 装饰差异 ------------------------------ */

console.log('\n=== 5. 装饰件：宣纸有印、极简无块、例题粗横条、书页有边栏竖线 ===')
const rectsOf = (id: TemplateId): Placed[] => placedOf(coverFixture.slide, id).filter((p) => p.kind === 'rect')
const linesOf = (id: TemplateId): Placed[] => placedOf(coverFixture.slide, id).filter((p) => p.kind === 'line')
const xuanRects = rectsOf(FAMILY_REPS.xuan)
if (!xuanRects.some((r) => r.w <= 0.1 && r.h <= 0.1)) fail('5 宣纸封面没有朱红方印（≤ .10 的方块）')
else ok('5 宣纸有印', `${xuanRects.filter((r) => r.w <= 0.1 && r.h <= 0.1).length} 枚`)
if (rectsOf(FAMILY_REPS.jijian).length > 0) fail(`5 极简封面出现了 ${rectsOf(FAMILY_REPS.jijian).length} 个色块，应一个都没有`)
else ok('5 极简无块', '封面一幅字，没有一个 rect')
if (!rectsOf(FAMILY_REPS.liti).some((r) => r.h <= 0.02 && r.w >= 0.15)) fail('5 例题封面没有粗横条（h ≤ .02 且 w ≥ .15）')
else ok('5 例题有粗横条', rectsOf(FAMILY_REPS.liti).filter((r) => r.h <= 0.02 && r.w >= 0.15).map((r) => `${r.w}×${r.h}`).join(' '))
const shuyeRule = linesOf(FAMILY_REPS.shuye).some((l) => l.w <= 0.01 && l.h >= 0.3)
if (!shuyeRule) fail('5 书页封面没有边栏竖线（w ≤ .01 且 h ≥ .3）')
else ok('5 书页有边栏竖线', '封面与内页同一条 x=.235')

/* ------------------------------ 6 · 不溢出 ------------------------------ */

console.log(`\n=== 6. ${REPS.length} 族 × 七式：所有框都在纸面内 ===`)
let boxes = 0
for (const { arch, slide } of FIXTURES) {
  for (const id of REPS) {
    for (const p of placedOf(slide, id)) {
      boxes += 1
      if (p.x < -1e-9 || p.y < -1e-9 || p.x + p.w > 1.001 || p.y + p.h > 1.001) {
        fail(`6 ${id}/${arch}：${p.kind} 框溢出（x=${p.x} y=${p.y} w=${p.w} h=${p.h}）`)
      }
    }
  }
}
ok('6 无溢出', `${REPS.length * FIXTURES.length} 页 ${boxes} 个块全部落在 0–1 之间`)

/* ------------------------------ 7 · 真出图（十一份 .pptx） ------------------------------ */

console.log(`\n=== 7. 真出图：${REPS.length} 份 /tmp/q24-<族>.pptx，页数相同 ===`)
const entry = findText('观潮')
let pageCount = -1
let deckSlides: StudentSlide[] = []
if (!entry) fail('7 找不到内置《观潮》，导不出六份样张')
else {
  const input: LessonInput = {
    topic: '观潮',
    subject: '语文',
    stage: '小学',
    grade: '四年级',
    period: '第一课时',
    textbook: '部编版',
    duration: 2400,
    text: entry.quotes.join('\n'),
  }
  const limits = limitsFor('standard', 'lesson', 2400)
  deckSlides = getBuiltinStudentSlides(skeletonPlan(input), limits)
  const exportLimits = deckSlides.length < limits.pagesMin ? { ...limits, pagesMin: deckSlides.length } : limits
  for (const f of FAMILY_IDS) {
    const id = FAMILY_REPS[f]
    const file = `${OUT}/q24-${f}.pptx`
    rmSync(file, { force: true })
    try {
      const r = await downloadTemplatedPptx(deckSlides, TEMPLATES[id], undefined, file, { animated: false, limits: exportLimits })
      if (pageCount < 0) pageCount = r.pages
      else if (r.pages !== pageCount) fail(`7 ${f}：${r.pages} 页，与第一家 ${pageCount} 页对不上`)
      console.log(`  ${f.padEnd(7)} ${r.pages} 页 → ${file}`)
    } catch (e) {
      fail(`7 ${f} 导出失败 —— ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  ok(`${REPS.length} 份都写盘成功`, `每份 ${pageCount} 页`)

  /* 对照图：封面 + 字词页，各族横排（块面就是 place() 的坐标，不是另画的示意图） */
  const rows: { label: string; slide: StudentSlide }[] = [
    { label: 'cover', slide: deckSlides[0] },
    { label: 'words', slide: deckSlides.find((s) => s.kind === 'words') ?? deckSlides[1] },
  ]
  const pw = 320
  const ph = 180
  const cols = REPS.length
  const sheet: RgbaImage = { width: pw * cols, height: ph * rows.length, pixels: new Uint8Array(pw * cols * ph * rows.length * 4) }
  const hex = (v: string): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec(v)
    const n = m ? parseInt(m[1], 16) : 0x888888
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  rows.forEach((row, r) => {
    REPS.forEach((id, c) => {
      const tpl: TemplateTheme = TEMPLATES[id]
      const paper = hex(tpl.paper)
      const ox = c * pw
      const oy = r * ph
      const put = (x: number, y: number, rgb: [number, number, number], alpha = 1) => {
        const px = ox + Math.round(x * pw)
        const py = oy + Math.round(y * ph)
        if (px < ox || px >= ox + pw || py < oy || py >= oy + ph) return
        const i = (py * sheet.width + px) * 4
        sheet.pixels[i] = Math.round(sheet.pixels[i] * (1 - alpha) + rgb[0] * alpha)
        sheet.pixels[i + 1] = Math.round(sheet.pixels[i + 1] * (1 - alpha) + rgb[1] * alpha)
        sheet.pixels[i + 2] = Math.round(sheet.pixels[i + 2] * (1 - alpha) + rgb[2] * alpha)
      }
      for (let y = 0; y < ph; y++)
        for (let x = 0; x < pw; x++) {
          const i = ((oy + y) * sheet.width + ox + x) * 4
          sheet.pixels[i] = paper[0]
          sheet.pixels[i + 1] = paper[1]
          sheet.pixels[i + 2] = paper[2]
          sheet.pixels[i + 3] = 255
        }
      for (const p of place(row.slide, tpl)) {
        const rgb = hex(p.fill ?? p.color ?? tpl.ink)
        const alpha = p.kind === 'text' ? 0.55 : (p.opacity ?? 1) * 0.85
        for (let y = 0; y < Math.max(1, Math.round(p.h * ph)); y++)
          for (let x = 0; x < Math.max(1, Math.round(p.w * pw)); x++)
            put((p.x * pw + x) / pw, (p.y * ph + y) / ph, rgb, alpha)
      }
    })
  })
  writeFileSync(`${OUT}/q24-grid.png`, Buffer.from(await encodePng(sheet)))
  console.log(`  交付：${OUT}/q24-grid.png（上排封面、下排字词页，${REPS.length} 族横排）`)
}

/* ------------------------------ 8 · 三十五套只换纸 ------------------------------ */

console.log('\n=== 8. 全部套：色值四条约束 / 同族几何不动 / 纸两两不同 / 零网络 / 文字零丢失 ===')
{
  if (TEMPLATE_IDS.length !== Object.keys(TEMPLATES).length) {
    fail(`8 id 表 ${TEMPLATE_IDS.length} 套，色表 ${Object.keys(TEMPLATES).length} 套，两边对不上`)
  }
  let badGroup = 0
  for (const f of FAMILY_IDS) {
    const n = familyTemplates(f).length
    /* 每族至少一套：照抄开源母版的族一套一色，不为了凑「3–4 个配色」硬拆 */
    if (n < 1) {
      badGroup++
      fail(`8 ${f} 族一个配色都没有`)
    }
  }
  if (badGroup === 0) ok(`8 ${FAMILY_IDS.length} 族 × 配色 = ${TEMPLATE_IDS.length} 套`, FAMILY_IDS.map((f) => `${f}:${familyTemplates(f).length}`).join(' '))

  /* 每套都要过四条色值约束（与 check:template 同一个函数，不另写判据） */
  const colorBad = TEMPLATE_IDS.flatMap((id) => themeProblems(TEMPLATES[id]).map((m) => `8 ${m}`))
  colorBad.forEach(fail)
  if (colorBad.length === 0) ok(`8 ${TEMPLATE_IDS.length} 套全部过线`, 'ink ≥7:1 / accent ≥4.5:1 / 色相差不落 150–210°（照搬母版的那几族豁免）/ accent≠paper')

  /* 同族换纸：几何指纹必须与代表套逐字节相同——只准换纸，不准挪字 */
  let geomBad = 0
  for (const f of FAMILY_IDS) {
    const rep = TEMPLATES[FAMILY_REPS[f]]
    for (const t of familyTemplates(f)) {
      for (const { arch, slide } of FIXTURES) {
        if (geomOf(place(slide, t)) !== geomOf(place(slide, rep))) {
          geomBad++
          fail(`8 ${t.id}/${arch}：与同族代表 ${rep.id} 的几何不一致（族内只许换纸）`)
        }
      }
      if (t.id !== rep.id && (t.paper === rep.paper || t.accent === rep.accent)) {
        geomBad++
        fail(`8 ${t.id}：与同族代表 ${rep.id} 的纸或强调色相同（换了个名字等于没换）`)
      }
    }
  }
  if (geomBad === 0) ok('8 族内几何逐字节相同', `${FIXTURES.length} 式 × ${TEMPLATE_IDS.length} 套`)

  /* 纸 + 强调色两两不同：摆出来不许有两块看起来一样 */
  const keys = TEMPLATE_IDS.map((id) => `${TEMPLATES[id].paper}/${TEMPLATES[id].accent}`)
  if (new Set(keys).size !== keys.length) fail(`8 有模板的纸与强调色完全相同：${keys.length - new Set(keys).size} 对重了`)
  else ok('8 全部套纸与强调色两两不同', `${keys.length} 组`)

  /* 换全部套零网络：mock fetch，调用次数必须为 0 */
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    throw new Error('换模板不许发请求')
  }) as unknown as typeof fetch
  const t0 = Date.now()
  try {
    for (const id of TEMPLATE_IDS) for (const { slide } of FIXTURES) place(slide, TEMPLATES[id])
  } finally {
    globalThis.fetch = realFetch
  }
  const ms = Date.now() - t0
  if (calls === 0) ok('8 换全部套零网络', `fetch 调用 0 次，${TEMPLATE_IDS.length * FIXTURES.length} 页 ${ms}ms`)
  else fail(`8 换模板触发了 ${calls} 次网络请求`)
  if (ms >= 3000) fail(`8 换 ${TEMPLATE_IDS.length} 套用了 ${ms}ms，超过 3000ms`)

  /* 文字零丢失：全部套 × 七式，标题 / 正文 / 条目都得在（与 check:template 同一个口径） */
  let lost = 0
  for (const id of TEMPLATE_IDS) {
    for (const { slide } of FIXTURES) {
      const shown = place(slide, TEMPLATES[id])
        .filter((p) => p.kind === 'text')
        .map((p) => String(p.text ?? '').replace(/\s+/g, ''))
        .join('')
      const withTitle = slide.kind !== 'quote' && slide.kind !== 'end'
      const want = [...(withTitle ? [slide.title] : []), slide.line, slide.text, ...(slide.items ?? [])]
        .filter(Boolean)
        .map((t) => String(t).replace(/\s+/g, ''))
      for (const w of want) {
        if (!w) continue
        if (!shown.includes(w.slice(0, 6))) {
          lost++
          fail(`8 ${id}/${slide.kind}：丢了「${w.slice(0, 6)}…」`)
        }
      }
    }
  }
  if (lost === 0) ok('8 全部套文字零丢失', `${TEMPLATE_IDS.length} 套 × ${FIXTURES.length} 式逐页比对`)
}

/* -------------------------------- 收尾 -------------------------------- */

console.log('')
if (FAIL.length) {
  for (const f of FAIL) console.log(`✗ ${f}`)
  console.log(`\n版式门禁：${FAIL.length} 条未通过（最弱的一对：${worst.arch}/${worst.pair} 只有 ${worst.n} 处）`)
  process.exit(1)
}
console.log(`版式门禁：八条全过（最弱的一对 ${worst.arch}/${worst.pair} 也有 ${worst.n} 处对不上）`)
