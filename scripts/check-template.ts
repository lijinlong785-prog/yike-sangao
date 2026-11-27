/**
 * TASKS/20 §五 的离线验收：模板引擎（TASKS/24 起按「各族」量，全部套的颜色另由 check:layout-distinct 第 8 条管）。
 *
 * 八条判据（缺一条不算完成）+ 两件交付物 + 一条耗时线：
 *   1. 各族模板渲染同一份 deck：页数完全一致，正文行数差 ≤ 15%
 *   2. 每套：ink 对 paper ≥ 7:1；accent 对 paper ≥ 4.5:1
 *   3. 每套：accent 与 paper 的色相差不在 150–210°
 *   4. place() 纯函数：连跑两次，JSON.stringify 完全相等
 *   5. 所有 Placed：x ≥ 0 && x+w ≤ 1 && y ≥ 0 && y+h ≤ 1
 *   6. 换模板零网络：mock fetch，切换四次，调用次数必须为 0
 *   7. 补 check:quote 的漏洞：除 quote 页外，title / line / items 不许命中教师话术词表
 *   8. 版面不许素（第二十三轮）：有插画的页图位与任何文字框零重叠；正文页五族有图、三族有墨
 *
 * 5.2 交四份 .pptx（/tmp/t-<id>.pptx）+ 每套一份 dump（封面 / quote / words 的 Placed 文本）
 * 5.3 四次切换的总毫秒数必须 < 500ms
 *
 * 跑法：npm run check:template
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { findText } from '../src/data/texts'
import { limitsFor } from '../src/lib/scale'
import { getBuiltinStudentSlides, type StudentSlide } from '../src/lib/slides'
import { skeletonPlan } from '../src/lib/skeleton'
import { downloadTemplatedPptx } from '../src/lib/pptx'
import { FOOT_SLOT, place, type Placed } from '../src/lib/deck2/place'
import {
  FAMILY_IDS,
  FAMILY_REPS,
  FONT_FACE,
  TEMPLATES,
  defaultTemplateId,
  hueGap,
  isSourceTemplate,
  themeProblems,
  type DeckTheme as TemplateTheme,
  type FontKey,
  type TemplateId,
} from '../src/lib/deck2/theme'
import { contrastRatio } from '../src/lib/scheme'
import type { LessonInput } from '../src/types'

const PPTX_DIR = '/tmp'
const DUMP_DIR = '/tmp'
const SVG_DIR = '/tmp/yike-template-svg'
const FAIL: string[] = []
/** 坐标 / 字数 / 出片这些「族」的事只在各族的代表套上量；同族配色只换纸（check:layout-distinct 第 8 条） */
const REPS: TemplateId[] = FAMILY_IDS.map((f) => FAMILY_REPS[f])
const fail = (msg: string) => FAIL.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
const bad = (msg: string, detail = '') => console.log(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)

/** §五.7 的话术词表：原文页不限（那一页本来就是课文原句），其余页一字不许有。
 *  TASKS/22 §3.3：词表补全——上几轮只扫「先动哪一件」这几句，
 *  自己要命的「谁读准 / 你能圈出几个 / 谁来说」全漏了，所以门禁才一直绿。 */
const TEACHER_PHRASE =
  /说完再收|留两次发言|从左到右排开|先请两名|不要急着替|替他总结|先动哪一件|谁读准|你能圈出几个|谁读给大家听|谁来说|我准备|我打算|先给什么|然后再问|卡在哪|全班对答案|同桌互查|学情|预设/

/** 话术判定（单独抽出来，供反自检直接喂句） */
const phraseHit = (text: string): string | null => String(text ?? '').match(TEACHER_PHRASE)?.[0] ?? null

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

function unzip(file: string, entry: string): string {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return ''
  }
}

function entries(file: string): string[] {
  try {
    return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/* ------------------------------ 夹具：观潮 40 分钟 ------------------------------ */

const entry = findText('观潮')
if (!entry) {
  console.error('内置《观潮》引句找不到，门禁无法运行')
  process.exit(1)
}
const plan = skeletonPlan(lessonInput({ topic: '观潮', duration: 2400, text: entry.quotes.join('\n') }))
const limits = limitsFor('standard', 'lesson', 2400)
const slides: StudentSlide[] = getBuiltinStudentSlides(plan, limits)

// 骨架稿是薄教案（20 页 < 22 页下限）：这一份只验版面，导出时按这一叠自己的页数放行
const exportLimits = slides.length < limits.pagesMin ? { ...limits, pagesMin: slides.length } : limits

console.log(`\n夹具：《观潮》40 分钟 · ${slides.length} 页（lesson 档 ${limits.pagesMin}–${limits.pagesMax}，导出按 ${exportLimits.pagesMin} 起算）`)
console.log(`  页型：${slides.map((s) => s.kind).join(' ')}`)

const placedOf = (tpl: TemplateTheme): Placed[][] => slides.map((s) => place(s, tpl))

/* --------------------------- 1 · 页数一致 / 块数差 --------------------------- */

console.log('\n=== 1. 各族模板渲染同一份 deck（页数一致 / 文字块数量差 ≤ 15% / 内容一个字不丢）===')
const perTemplate = new Map<string, Placed[][]>()
const counts: number[] = []
/* 这一页该上的内容（标题 / 问句 / 原文 / 条目），去空白后逐条列出 */
const contentOf = (s: StudentSlide): string[] =>
  [s.title, s.line, s.text, ...(s.items ?? [])].map((t) => String(t ?? '').replace(/\s+/g, '')).filter(Boolean)
/** 真上屏的内容行数：一行字只要能在本页该上的内容里找到（整行是内容的一截，
 *  或行里裹着某一整条内容，如「其一　初读」）就算一行；编号件（中文序号 一/二、
 *  桌位号 No.03、卡片号 /01）不是内容，不计数。第二批八族每张卡都带编号，
 *  按块或按行硬数，会把「编号多的一族」判成「多写了字」。 */
const contentRows = (out: Placed[], s: StudentSlide): number => {
  const list = contentOf(s)
  const blob = list.join('')
  return out
    .filter((x) => x.kind === 'text' && x.size !== 12)
    .reduce((n, x) => {
      const rows = String(x.text ?? '').split('\n').filter((r) => {
        const t = r.replace(/\s+/g, '')
        if (t.length === 0) return false
        /* 整行就是某条内容（一个字的词也算） */
        if (list.includes(t)) return true
        /* 行是内容的一截 / 行里裹着一整条内容：两边都要求 ≥2 字。
           二十轮实测：单字的编号件（一 / 二 / 三）会靠“blob 里有这个字”混进来，
           素课那页的「一\n二\n三」被算成 2 行，凭空多出 21.7% 的差。 */
        return t.length >= 2 && (blob.includes(t) || list.some((c) => c.length >= 2 && t.includes(c)))
      })
      return n + rows.length
    }, 0)
}
for (const id of REPS) {
  const tpl = TEMPLATES[id]
  const pages = placedOf(tpl)
  perTemplate.set(id, pages)
  /*
   * 数「正文行数」而不是「所有块」：TASKS/23 起各族的装饰件本来就不一样
   * （宣纸一枚印、例题一层网格底、极简连页名都不画），拿装饰去比数量，
   * 会把「各族必须不一样」判成「各族丢了东西」。
   * 24 轮又改成按行数：素课把五个词排成一个文本块，提纲是五个块——
   * 块数差并不等于行数差，按块比会把「一行一个」的排法算成丢内容。
   * 12pt 那档是页名（SIZES.tiny），属于版面装饰，不算正文。
   * 25 轮再收一道：只数「本页该上的内容」，编号件与装饰件不入账（见 contentRows）。
   * 内容丢没丢由下面那条逐页断言管：每一页的标题 / 正文 / 条目都必须在。
   */
  const total = pages.reduce((n, p, i) => n + contentRows(p, slides[i]), 0)
  counts.push(total)
  const pageOk = pages.length === slides.length
  if (!pageOk) fail(`1 ${id}：铺出 ${pages.length} 页，内容层是 ${slides.length} 页`)
  console.log(
    `  ${id.padEnd(7)} 页数 ${pages.length} | 正文行数 ${total} | 总块数 ${pages.reduce((n, p) => n + p.length, 0)} | 单页 ${Math.min(...pages.map((p) => p.length))}–${Math.max(...pages.map((p) => p.length))} 块`
  )
}
const minCount = Math.min(...counts)
const maxCount = Math.max(...counts)
const spread = minCount === 0 ? 1 : (maxCount - minCount) / minCount
if (spread > 0.15) fail(`1 各族模板的正文行数差 ${(spread * 100).toFixed(1)}%，超过 15%（版式不同但不许丢内容）`)
else ok('1 页数完全一致，正文行数差在 15% 以内', `${minCount}–${maxCount} 行，差 ${(spread * 100).toFixed(1)}%`)

/* 内容一个字都不许丢：逐页把这一页该上的字全部捞出来比对 */
for (const id of REPS) {
  const pages = perTemplate.get(id) as Placed[][]
  slides.forEach((s, i) => {
    const shown = (pages[i] ?? [])
      .filter((p) => p.kind === 'text')
      .map((p) => String(p.text ?? '').replace(/\s+/g, ''))
      .join('')
    /* 原文页与结束页的 title 是取题用的标签，不上屏（上屏的是课文原句 / 那一句话） */
    const withTitle = s.kind !== 'quote' && s.kind !== 'end'
    const want = [...(withTitle ? [s.title] : []), s.line, s.text, ...(s.items ?? [])]
      .filter(Boolean)
      .map((t) => String(t).replace(/\s+/g, ''))
    for (const w of want) {
      if (!w) continue
      /* 标题 / 问句可能被裁成一截（原文页加引号、条目带序号），所以按「前六个字在不在」判 */
      const key = w.slice(0, 6)
      if (!shown.includes(key)) fail(`1 ${id} 第 ${i + 1} 页丢了「${key}…」（${s.kind}）`)
    }
  })
}
if (!FAIL.some((f) => f.startsWith('1 '))) ok('1 各族都把这 21 页的字全排上去了', '逐页比对标题 / 正文 / 条目')

/* --------------------------- 2 / 3 · 色值硬约束 --------------------------- */

console.log('\n=== 2/3. 色值四条硬约束（ink ≥7:1、accent ≥4.5:1、色相差不落 150–210°）===')
for (const id of REPS) {
  const t = TEMPLATES[id]
  const issues = themeProblems(t)
  const ink = contrastRatio(t.ink, t.paper)
  const accent = contrastRatio(t.accent, t.paper)
  const gap = hueGap(t.accent, t.paper)
  console.log(
    `  ${id.padEnd(7)} 纸 ${t.paper} 墨 ${t.ink}（${ink.toFixed(1)}:1）强调 ${t.accent}（${accent.toFixed(1)}:1）色相差 ${gap.toFixed(0)}° | ${issues.length ? '✗ ' + issues.join('；') : '✓'}`
  )
  for (const p of issues) fail(`2/3 ${p}`)
  if (ink < 7) fail(`2 ${id} ink 对比 ${ink.toFixed(2)}:1 < 7:1`)
  if (accent < 4.5) fail(`2 ${id} accent 对比 ${accent.toFixed(2)}:1 < 4.5:1`)
  /* 照抄开源母版的八套（SOURCE_TEMPLATES）：蓝黄互补是母版自己定的色，不算模型乱配，第 3 条不问。
     前两条照样量——看不清就删套，不放宽。 */
  if (gap >= 150 && gap <= 210 && !isSourceTemplate(id)) fail(`3 ${id} 色相差 ${gap.toFixed(0)}° 落在 150–210°`)
}
if (!FAIL.some((f) => f.startsWith('2') || f.startsWith('3'))) ok('2/3 各族模板全部过线')

// 默认模板规则（TASKS/24，2026-11-22 改口径）：按学科落到**自带块面的后八族**，再看文体落到配色
//   语文→林地、古诗文→宣纸、数学/科学→古阑、英语→商务、史地/道法→钢印、其余→双年展
//   （用户验收：「模板不要这么素…只需要横线做出来的很恶心」；素课/极简降为墙里的选项）
// 判据只看输入里的课题 / 课时字面（不读课文、不问模型），所以用例要写成带学科词的那一种
const defaults: [string, string, string, string][] = [
  ['语文', '桂花雨', '第一课时', 'lindi'],
  ['语文', '古诗二首', '第一课时', 'xuan'],
  ['语文', '文言文二则', '第二课时', 'xuan'],
  ['数学', '比大小', '第一课时', 'gulan'],
  ['英语', 'Colours', '第一课时', 'shangwu'],
  ['历史', '鸦片战争', '第一课时', 'gangyin'],
  ['科学', '水的三态', '第一课时', 'gulan'],
  ['', '观潮', '第一课时', 'shuangnian'],
]
const wrongDefaults = defaults.filter(([s, t, p, want]) => defaultTemplateId(s, t, p) !== want)
if (wrongDefaults.length) fail(`默认模板选择不对：${wrongDefaults.map((d) => `${d[0]}/${d[1]}→${defaultTemplateId(d[0], d[1], d[2])}（应 ${d[3]}）`).join('；')}`)
else ok('§四 默认模板规则', defaults.map((d) => `${d[0] || '（空）'}→${d[3]}`).join(' / '))

/* --------------------------- 4 · 纯函数 --------------------------- */

console.log('\n=== 4. place() 纯函数：连跑两次，JSON.stringify 完全相等 ===')
{
  let diff = 0
  for (const id of REPS) {
    const t = TEMPLATES[id]
    const a = JSON.stringify(slides.map((s) => place(s, t)))
    const b = JSON.stringify(slides.map((s) => place({ ...s, items: s.items ? [...s.items] : s.items }, t)))
    if (a !== b) {
      diff++
      fail(`4 ${id}：两次 place() 的结果不一致（读了时间 / 随机 / 外部状态）`)
    }
  }
  if (diff === 0) ok('4 各族 × 两遍，逐字节相同', `${slides.length} 页 × 6 套`)
}

/* --------------------------- 5 · 越界 --------------------------- */

console.log('\n=== 5. 所有 Placed 都在纸面内（x ≥ 0、x+w ≤ 1、y ≥ 0、y+h ≤ 1）===')
{
  const EPS = 1e-9
  const out: string[] = []
  for (const id of REPS) {
    perTemplate.get(id)!.forEach((blocks, pi) => {
      blocks.forEach((p, bi) => {
        const why = [
          p.x < -EPS ? `x=${p.x}` : '',
          p.y < -EPS ? `y=${p.y}` : '',
          p.x + p.w > 1 + EPS ? `x+w=${(p.x + p.w).toFixed(4)}` : '',
          p.y + p.h > 1 + EPS ? `y+h=${(p.y + p.h).toFixed(4)}` : '',
        ].filter(Boolean)
        if (why.length) out.push(`${id} 第 ${pi + 1} 页第 ${bi + 1} 块（${p.kind}）越界：${why.join('、')}`)
      })
    })
  }
  for (const o of out) fail(`5 ${o}`)
  const totalBlocks = [...perTemplate.values()].reduce((n, pages) => n + pages.reduce((m, b) => m + b.length, 0), 0)
  if (out.length === 0) ok('5 零越界', `${totalBlocks} 块逐块量过`)
}

/* --------------------------- 6 · 换模板零网络 --------------------------- */

console.log('\n=== 6. 换模板零网络：mock fetch，四次切换的调用次数必须为 0 ===')
{
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    throw new Error('换模板不许发请求')
  }) as unknown as typeof fetch
  try {
    for (const id of REPS) placedOf(TEMPLATES[id])
  } finally {
    globalThis.fetch = realFetch
  }
  if (calls === 0) ok('6 各族切换零网络', 'fetch 调用 0 次')
  else fail(`6 换模板触发了 ${calls} 次网络请求`)
}

/* --------------------------- 7 · 教师话术词 --------------------------- */

console.log('\n=== 7. 除 quote 页外，title / line / items 与上屏文字都不许命中教师话术词 ===')
{
  const hits: string[] = []
  for (const id of REPS) {
    perTemplate.get(id)!.forEach((blocks, pi) => {
      const s = slides[pi]
      if (s.kind === 'quote') return
      const onScreen = [s.title, s.line ?? '', ...(s.items ?? []), ...blocks.filter((b) => b.kind === 'text').map((b) => b.text ?? '')]
        .join('\n')
      const m = onScreen.match(TEACHER_PHRASE)
      if (m) hits.push(`${id} 第 ${pi + 1} 页（${s.kind}）命中「${m[0]}」`)
    })
  }
  /* 反自检：喂两句已知违规的话，判定函数必须报违规；不报就是门禁自己在骗自己 */
  for (const bad of ['这四个词，谁读准？', '我准备在第三段停一下，再看看卡在哪']) {
    if (!phraseHit(bad)) fail(`7 反自检：违规句「${bad}」没被报出来（词表没覆盖）`)
  }
  if (phraseHit('这四个词，逐个读准，读错的做个记号'))
    fail('7 反自检：门禁自己换上的那句合规样张反而被报成违规（词表写宽了）')
  for (const h of hits.slice(0, 8)) fail(`7 ${h}`)
  if (hits.length === 0) ok('7 七个话术词零命中', `${slides.filter((s) => s.kind !== 'quote').length} 页 × 6 套，条款与上屏文字各扫一遍`)
}

/* --------------------------- 5.3 · 四次切换耗时 --------------------------- */

console.log('\n=== 5.3 换模板耗时（各族切换的总毫秒数必须 < 500ms）===')
{
  const t0 = Date.now()
  for (const id of REPS) placedOf(TEMPLATES[id])
  const ms = Date.now() - t0
  if (ms < 500) ok('5.3 各族切换', `${ms}ms（${slides.length} 页 × 6 套）`)
  else fail(`5.3 各族切换用了 ${ms}ms，超过 500ms`)
}

/* --------------------------- 5.2 · 六份 .pptx + dump + 缩略图 --------------------------- */

console.log('\n=== 5.2 六份 .pptx + 每套一份 dump ===')
rmSync(SVG_DIR, { recursive: true, force: true })
mkdirSync(SVG_DIR, { recursive: true })

/** dump 的一行：`[suke/quote] text=… size=40 x=.09 …` */
function dumpLine(id: string, kind: string, p: Placed): string {
  const num = (v: number) => v.toFixed(2).replace(/^0/, '')
  const parts = [`[${id}/${kind}] ${p.kind}`]
  if (p.text) parts.push(`text=${p.text.replace(/\n/g, ' / ')}`)
  if (p.size !== undefined) parts.push(`size=${p.size}`)
  parts.push(`x=${num(p.x)}`, `y=${num(p.y)}`, `w=${num(p.w)}`, `h=${num(p.h)}`)
  if (p.color) parts.push(`color=${p.color}`)
  if (p.fill) parts.push(`fill=${p.fill}`)
  if (p.font) parts.push(`font=${p.font}`)
  return parts.join(' ')
}

const CSS_FONT: Record<FontKey, string> = { song: 'Songti SC, SimSun, serif', kai: 'Kaiti SC, KaiTi, serif', hei: 'PingFang SC, Hiragino Sans GB, sans-serif' }
/**
 * qlmanage 把 SVG 放大 1.7 倍再画（它自己的归一化，不管 width 写多少）：
 * 这里反过来除掉这个系数，缩略图就正好是 1280×720 一像素不多不少。
 * 换机器后如果缩略图被裁了，先量一下这个系数，不要改坐标。
 */
const QL_SCALE = 1.7
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 按框宽折行：汉字算 1 个字宽，拉丁与数字算 0.55。
 * pptx 是 `wrap: true`，预览是普通块级文本——两边都会自动折行；
 * 缩略图不折就会横着冲出纸面，看上去像版面错了，其实只是图不会换行。
 */
function wrapTo(text: string, width: number, px: number): string[] {
  const limit = Math.max(px, width - px * 0.2)
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const chars = Array.from(raw)
    let buf = ''
    let used = 0
    for (const ch of chars) {
      const cw = /[\u3400-\u4DBF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? px : px * 0.55
      if (used + cw > limit && buf) {
        out.push(buf)
        buf = ''
        used = 0
      }
      buf += ch
      used += cw
    }
    out.push(buf)
  }
  return out
}

/**
 * 一份 Placed → 一张 SVG（1280×720）。只给缩略图看，不参与导出：
 * 位置与字号和 place() 一模一样，所以图里长什么样，PowerPoint 里就是什么样。
 */
function svgOf(placed: readonly Placed[], tpl: TemplateTheme, title: string): string {
  const W = 1280
  const H = 720
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${tpl.paper}"/>`]
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
    if (p.kind === 'rect' || p.kind === 'line') {
      const rx = ((p.radius ?? 0) * 4) / 3
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, p.kind === 'line' ? 1 : 0).toFixed(1)}" height="${Math.max(h, p.kind === 'line' ? 1 : 0).toFixed(1)}"${rx > 0 ? ` rx="${rx.toFixed(1)}"` : ''} fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'ellipse') {
      /* 叶片 / 圆点也要进缩略图：不然墙上看到的和成品差一整个图元 */
      const cx = x + w / 2
      const cy = y + h / 2
      const rot = p.rotate ? ` transform="rotate(${p.rotate} ${cx.toFixed(1)} ${cy.toFixed(1)})"` : ''
      body.push(
        `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"${rot}/>`
      )
      continue
    }
    if (p.kind === 'image' || !p.text) continue
    const pt = p.size ?? 18
    const px = (pt * 4) / 3
    const list = wrapTo(p.text, w, px)
    const lineH = px * (p.lineHeight ?? 1.3)
    const blockH = list.length * lineH
    const top = p.valign === 'middle' ? y + (h - blockH) / 2 : y
    const anchor = p.align === 'right' ? 'end' : p.align === 'center' ? 'middle' : 'start'
    const tx = p.align === 'right' ? x + w : p.align === 'center' ? x + w / 2 : x
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(top + lineH * i + px * 0.78).toFixed(1)}" font-family="${CSS_FONT[p.font ?? tpl.fontBody]}" font-size="${px.toFixed(1)}" fill="${p.color ?? tpl.ink}" text-anchor="${anchor}">${esc(line)}</text>`
      )
    })
  }
  body.push(
    `<text x="${(FOOT_SLOT.left.x * W).toFixed(0)}" y="${((FOOT_SLOT.left.y + 0.028) * H).toFixed(0)}" font-family="PingFang SC, sans-serif" font-size="12" fill="${tpl.muted}">${esc(title)}</text>`
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(W / QL_SCALE).toFixed(2)}" height="${(H / QL_SCALE).toFixed(2)}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" fill="${tpl.paper}"/>${body.join('')}</svg>`
}

const topic = plan.meta.topic
const svgPages: { file: string; label: string }[] = []

for (const id of REPS) {
  const tpl = TEMPLATES[id]
  const file = `${PPTX_DIR}/t-${id}.pptx`
  const dumpFile = `${DUMP_DIR}/t-${id}.txt`
  try {
    rmSync(file, { force: true })
    const r = await downloadTemplatedPptx(slides, tpl, undefined, file, { animated: false, limits: exportLimits })
    if (r.pages !== slides.length) fail(`5.2 ${id}：导出回报 ${r.pages} 页，应为 ${slides.length}`)
    const names = entries(file).filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    const notes = entries(file).filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
    if (names.length !== slides.length) fail(`5.2 ${id}：解包只有 ${names.length} 页，应为 ${slides.length}`)
    if (notes.length !== slides.length) fail(`5.2 ${id}：备注页 ${notes.length} 个，应为 ${slides.length}`)

    // 纸色真的进了每一页：封面页与正文页各查一个 XML
    const firstXml = unzip(file, names[0])
    const bare = tpl.paper.replace('#', '').toUpperCase()
    if (!firstXml.toUpperCase().includes(bare)) fail(`5.2 ${id}：第一页 XML 里找不到纸色 ${bare}`)
    // 字体映射：第一页必须出现映射后的字体名
    if (!firstXml.includes(FONT_FACE[tpl.fontTitle])) fail(`5.2 ${id}：第一页没有 ${FONT_FACE[tpl.fontTitle]}（字体映射失效）`)

    // 5.2 要的三页：封面 / 原文 / 字词。这一叠骨架稿没有字词页（字词关靠模型给生字），
    // 缺页时用本课原文里的四个词拼一张「版式样张」——只进 dump，不进 pptx。
    const wordsSample: StudentSlide = {
      kind: 'words',
      title: '字词关（样张）',
      items: ['沸腾', '横贯', '翻滚', '水天相接'],
      line: '这四个词，逐个读准，读错的做个记号',
      notes: '',
    }
    const pick = (k: StudentSlide['kind']): { slide: StudentSlide; page: number; real: boolean } => {
      const i = slides.findIndex((s) => s.kind === k)
      return i >= 0 ? { slide: slides[i], page: i + 1, real: true } : { slide: wordsSample, page: 0, real: false }
    }
    const dumpPages = (['cover', 'quote', 'words'] as StudentSlide['kind'][]).map(pick)
    const lines: string[] = [`# ${id} ${tpl.name} · ${slides.length} 页 · paper ${tpl.paper}`]
    for (const { slide: s, page, real } of dumpPages) {
      lines.push(`## ${real ? `第 ${page} 页` : '样张'} ${s.kind}｜${s.title}`)
      for (const p of place(s, tpl)) lines.push(dumpLine(id, s.kind, p))
    }
    writeFileSync(dumpFile, `${lines.join('\n')}\n`, 'utf8')

    console.log(
      `  ${id.padEnd(7)} ${statSync(file).size} 字节 | slide ${names.length} | notes ${notes.length} | 纸 ${bare} | 字体 ${FONT_FACE[tpl.fontTitle]} → ${file}`
    )
    for (const line of lines.slice(1)) console.log(`      ${line}`)
    console.log(`      dump → ${dumpFile}（${lines.length} 行）`)

    // 缩略图源：这一叠里真有的三种版式——封面 / 原文 / 编号（板书）。各族各三张 = 18 张。
    // 字词样张只进 dump：缩略图必须是 pptx 里真有的那一页，不拿样张冒充成品。
    for (const k of ['cover', 'quote', 'board'] as StudentSlide['kind'][]) {
      const i = slides.findIndex((s) => s.kind === k)
      if (i < 0) continue
      const svg = `${SVG_DIR}/${id}-${k}.svg`
      writeFileSync(svg, svgOf(place(slides[i], tpl), tpl, `《${topic}》${tpl.name}`), 'utf8')
      svgPages.push({ file: svg, label: `${id}/${k}` })
    }
  } catch (e) {
    fail(`5.2 ${id}：出片失败 —— ${e instanceof Error ? e.message : String(e)}`)
  }
}
if (svgPages.length) ok('缩略图源已写出', `${svgPages.length} 张 → ${SVG_DIR}`)

/* --------------------------- 8 · 图位不压字 --------------------------- */

console.log('\n=== 8. 有插画的页：图位与任何文字框零重叠；正文页不许只剩标题 + 一列字 ===')
{
  const ART = 'data:image/png;base64,iVBORw0KGgo='
  const FIX8: StudentSlide[] = (
    [
      { kind: 'hook', title: '先看题目', line: '这个题目里，你认得哪几个字？', items: ['桂花是一种花', '雨是落下来的'], notes: '' },
      { kind: 'board', title: '黑板上留下三行', line: '先抄哪一行？', items: ['摇花乐', '桂花香', '思乡情'], notes: '' },
      { kind: 'words', title: '读准这几个词', line: '你能读准几个？', items: ['箩筐', '杭州', '沉浸', '缠着'], notes: '' },
      { kind: 'compare', title: '两处桂花比一比', line: '哪儿不一样？', items: ['杭州的香', '家乡的香', '满觉陇', '旧宅院'], notes: '' },
    ] as StudentSlide[]
  ).map((s) => ({ ...s, illustration: ART }))
  const area = (a: Placed, b: Placed): number => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    return w > 0 && h > 0 ? w * h : 0
  }

  let images = 0
  const hooked: string[] = []
  const marked: string[] = []
  for (const id of REPS) {
    for (const s of FIX8) {
      const out = place(s, TEMPLATES[id])
      const imgs = out.filter((p) => p.kind === 'image')
      images += imgs.length
      for (const img of imgs) {
        for (const p of out.filter((q) => q.kind === 'text')) {
          const hit = area(img, p)
          if (hit > 0.0004) {
            fail(`8 ${id}/${s.kind}：「${String(p.text ?? '').slice(0, 6)}」压在图上（重叠 ${(hit * 100).toFixed(1)}% 版心）`)
          }
        }
      }
      // 极简是一幅字：一张图都不许压
      if (id === 'jijian' && imgs.length) fail(`8 极简不该压图（一幅字就是全部），实得 ${imgs.length} 张`)
      // 有画的正文页必须真的压上图（别把框窄到一点、图全被跳过）
      if (s.kind === 'hook' && imgs.length) hooked.push(id)
      /* 版面不许素：素课 / 宣纸 / 例题的正文页必须有「标题短线」或「重点句竖杠」，
         只剩标题 + 一列字、一点墨也没有的页面不算排过 */
      if (s.kind === 'hook' && ['suke', 'xuan', 'liti'].includes(id)) {
        const deco = out.some((p) => p.kind === 'rect' && p.h <= 0.01 && p.w <= 0.08)
        if (!deco) fail(`8 ${id}/plain：正文页没有标题短线，也没有重点句竖杠（版面太素）`)
        else marked.push(id)
      }
    }
  }
  if (marked.length !== 3) fail(`8 只有 ${marked.length} 族的正文页有装饰，应为 3（素课 / 宣纸 / 例题）`)
  /* 除极简（一幅字，一张图都不压）之外每一族都该压上图：族数从 FAMILY_IDS 现数，加族不回来改 */
  const hookedWant = FAMILY_IDS.length - 1
  if (hooked.length !== hookedWant) fail(`8 只有 ${hooked.length} 族在正文页压上了图，应为 ${hookedWant}（除极简外全族）`)
  if (!FAIL.some((f) => f.startsWith('8 '))) {
    ok('8 图位不压字', `四档版式 × ${REPS.length} 族，共压 ${images} 张；正文页 ${hooked.length} 族有图、三族有墨`)
  }
}

/* --------------------------- 9 · 字不压字 --------------------------- */

console.log('\n=== 9. 条目排满时，两块字也不许压在一起（页眉 / 正文 / 问句行 / 备注） ===')
{
  const PX = 4 / 3
  const PW = 1280
  const PH = 720
  /** 字的实际占位：行长估算法与离线渲染器同一套（中文按 1em 宽，对齐算进去） */
  const extent = (p: Placed): { x: number; y: number; w: number; h: number } => {
    const fs = (p.size ?? 18) * PX
    const lh = fs * (p.lineHeight ?? 1.5)
    const per = Math.max(1, Math.floor((p.w * PW) / fs))
    const lines = String(p.text ?? '').split('\n')
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(Array.from(l).length / per)), 0)
    const hpx = rows * lh
    const longest = Math.min(per, Math.max(...lines.map((l) => Array.from(l).length)))
    const wpx = Math.min(p.w * PW, longest * fs)
    const x = p.align === 'center' ? p.x * PW + (p.w * PW - wpx) / 2 : p.align === 'right' ? p.x * PW + p.w * PW - wpx : p.x * PW
    const y = p.valign === 'middle' ? p.y * PH + (p.h * PH - hpx) / 2 : p.y * PH
    return { x, y, w: wpx, h: hpx }
  }
  /* 四页最满的：六条正文 / 六条对照 / 六条板书 / 两句重点（全部在内容层上限 6 之内） */
  const CASES: [string, StudentSlide][] = [
    ['满六条', { kind: 'close-read', title: '一页装满六条也不散', line: '这么多，怎么记得住？', items: ['第一条：读通课文', '第二条：圈出生字', '第三条：找出写香', '第四条：说说摇花乐', '第五条：背第一段', '第六条：讲讲母亲'], notes: '' } as StudentSlide],
    ['对照六条', { kind: 'compare', title: '两处桂花比一比', line: '哪儿不一样？', items: ['杭州的香', '家乡的香', '满觉陇', '旧宅院', '开得早', '开得晚'], notes: '' } as StudentSlide],
    ['板书六条', { kind: 'board', title: '黑板上留下六行', line: '先抄哪一行？', items: ['摇花乐', '桂花香', '思乡情', '母亲说', '满身花', '一村香'], notes: '' } as StudentSlide],
    ['重点两句', { kind: 'hook', title: '先看题目', line: '这个题目里，你认得哪几个字？', items: ['桂花是一种花', '雨是落下来的'], notes: '' } as StudentSlide],
  ]
  let hit = 0
  for (const id of REPS) {
    for (const [label, slide] of CASES) {
      const out = place(slide, TEMPLATES[id]).filter((p) => p.kind === 'text')
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = extent(out[i])
          const b = extent(out[j])
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          const s = w > 0 && h > 0 ? w * h : 0
          const small = Math.min(a.w * a.h, b.w * b.h)
          if (small > 0 && s / small > 0.12) {
            hit++
            fail(
              `9 ${id}/${label}：「${String(out[i].text ?? '').slice(0, 8)}」压「${String(out[j].text ?? '').slice(0, 8)}」（${((s / small) * 100).toFixed(0)}%）`,
            )
          }
        }
      }
    }
  }
  if (hit === 0) ok('9 字不压字', `${REPS.length} 族 × ${CASES.length} 页（最满的一叠），字块互压 0 处`)
}

/* --------------------------- 汇总 --------------------------- */

console.log('')
if (FAIL.length) {
  console.error(`check:template 未通过：${FAIL.length} 条`)
  for (const f of FAIL.slice(0, 30)) console.error(`  ✗ ${f}`)
  if (FAIL.length > 30) console.error(`  …另有 ${FAIL.length - 30} 条`)
  process.exit(1)
}
console.log('✓ check:template 九条全过：页数与块数 / 对比度 / 色相 / 纯函数 / 零越界 / 零网络 / 话术词 / 图位不压字 / 字不压字')
console.log(`  交付：${REPS.length} 份 pptx（${PPTX_DIR}/t-*.pptx）+ ${REPS.length} 份 dump（${DUMP_DIR}/t-*.txt）+ 缩略图源（${SVG_DIR}）`)