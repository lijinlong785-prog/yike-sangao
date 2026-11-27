/**
 * 临时验证脚本（用完即删）：输入一篇陌生课文，把整条链路真跑一遍并逐条自检。
 *
 *   node scripts/.try.mjs 狼牙山五壮士 [分钟]
 *
 * 三步：备课包 → 学生版（含导演/插画）→ 两份 .pptx；自检项见 runChecks()。
 * 中间产物缓存在 /tmp/try-<topic>-plan.json / -slides.json，重导出不必再跑模型。
 */
import fs from 'node:fs'
import path from 'node:path'

;(globalThis as unknown as { window: unknown }).window ??= globalThis

const TOPIC = process.argv[2] || '狼牙山五壮士'
const MINUTES = Number(process.argv[3] || 40)
const DURATION = MINUTES * 60
const SLUG = TOPIC.replace(/\s+/g, '')
const PLAN_FILE = `/tmp/try-${SLUG}-plan.json`
const SLIDES_FILE = `/tmp/try-${SLUG}-slides.json`
const OUT_DIR = path.join(process.env.HOME ?? '.', 'Downloads')

function readEnv(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local')
  const out: Record<string, string> = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const env = readEnv()
if (!env.DEEPSEEK_API_KEY) {
  console.error('✗ .env.local 里没有 DEEPSEEK_API_KEY')
  process.exit(1)
}

const { DEFAULT_CONFIG, generatePlan } = await import('../src/lib/llm')
const { planForScale } = await import('../src/data/lesson')
const { limitsFor, scaleOf } = await import('../src/lib/scale')
const { buildStudentSlides, validateSlides, auditProblems } = await import('../src/lib/slides')
const { templateOf, defaultTemplateId } = await import('../src/lib/deck2/theme')
const { downloadTemplatedPptx, downloadDeckPptx } = await import('../src/lib/pptx')
const { buildDeck } = await import('../src/lib/deck')
const { allocate } = await import('../src/lib/timing')
import type { LessonInput, LessonPlan, StudentSlide } from '../src/types'

const cfg = {
  ...DEFAULT_CONFIG,
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  apiKey: env.DEEPSEEK_API_KEY,
}

const input: LessonInput = {
  topic: TOPIC,
  subject: '',
  stage: '',
  grade: '',
  period: '第一课时',
  textbook: '',
  duration: DURATION,
}

/* ---------------- 1. 备课包 ---------------- */
let plan: LessonPlan
if (fs.existsSync(PLAN_FILE)) {
  plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')) as LessonPlan
  console.log(`[1/3] 复用备课包 ${PLAN_FILE}`)
} else {
  const t = Date.now()
  console.log(`[1/3] 备课包：${TOPIC} / 第一课时 / ${MINUTES} 分钟`)
  plan = await generatePlan(input, cfg).catch((e) => {
    console.error('✗ 备课包失败：', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2))
  console.log(`✓ ${((Date.now() - t) / 1000).toFixed(1)}s`)
}

const scaled = planForScale(plan, DURATION)
const limits = limitsFor(cfg.density, scaleOf(DURATION), DURATION)

/* ---------------- 2. 学生版 ---------------- */
let slides: StudentSlide[]
const notes: string[] = []
if (fs.existsSync(SLIDES_FILE)) {
  slides = JSON.parse(fs.readFileSync(SLIDES_FILE, 'utf8')) as StudentSlide[]
  console.log(`[2/3] 复用学生版 ${SLIDES_FILE}（${slides.length} 页）`)
} else {
  console.log(`[2/3] 学生版（区间 ${limits.pagesMin}–${limits.pagesMax} 页）`)
  const t2 = Date.now()
  slides = await buildStudentSlides(scaled, cfg, {
    onProgress: (p) => {
      if (p.stage === 'direct' || p.stage === 'illust') {
        process.stdout.write(`\r  ${p.stage} ${p.page ?? ''}/${p.total ?? ''}   `)
      }
    },
    onFallback: (why) => notes.push(`[降级] ${why}`),
    onIllustrated: (note, used) => notes.push(`[插画] ${used} 张${note ? `：${note}` : ''}`),
    signal: AbortSignal.timeout(300_000),
  })
  fs.writeFileSync(SLIDES_FILE, JSON.stringify(slides))
  console.log(`\n✓ ${((Date.now() - t2) / 1000).toFixed(1)}s，${slides.length} 页`)
}

/* ---------------- 3. 自检 ---------------- */
const problems = auditProblems(slides, limits)
const check = validateSlides(slides, limits)
const lines: { ok: boolean; text: string }[] = []
const add = (ok: boolean, text: string) => lines.push({ ok, text })

add(
  plan.segments.length >= 6,
  `环节数 ${plan.segments.length}（≥6）`
)
add(
  (plan.meta.text ?? '').length >= 60,
  `模型交的课文原句 ${(plan.meta.text ?? '').length} 字（≥60，供原文页逐字校验）`
)
add(
  slides.length >= limits.pagesMin && slides.length <= limits.pagesMax,
  `学生版 ${slides.length} 页（区间 ${limits.pagesMin}–${limits.pagesMax}）`
)
add(problems.length === 0, `逐页审查 ${problems.length ? `✗ ${problems.length} 处：${problems[0]}` : '0 处'}`)
add(check.ok, `导出闸门 ${check.ok ? '通过' : `✗ ${check.problems.join('；')}`}`)

const quotes = slides.filter((s) => s.kind === 'quote')
const text = (plan.meta.text ?? '').replace(/\s+/g, '')
add(
  text.length === 0 ? quotes.length === 0 : quotes.every((q) => text.includes(String(q.line ?? q.title ?? '').replace(/\s+/g, ''))),
  `原文页 ${quotes.length} 页${text.length ? '，逐字都在课文原文里' : '（没原文，应为 0）'}`
)
const badTitles = slides.filter((s) => String(s.title ?? '').length > 18)
add(badTitles.length === 0, `标题超 18 字 ${badTitles.length} 处${badTitles.length ? `：${badTitles[0].title}` : ''}`)
const askInItems = slides.filter((s) => (s.items ?? []).some((i) => /[？?]$/.test(String(i).trim())))
add(askInItems.length === 0, `items 里挂问句 ${askInItems.length} 页${askInItems.length ? `：第 ${slides.indexOf(askInItems[0]) + 1} 页` : ''}`)
const dashCut = slides.filter((s) => /——[^，。！？]{0,4}$/.test(String(s.line ?? s.title ?? '')))
add(dashCut.length === 0, `半截话带破折号 ${dashCut.length} 页`)
const illustrated = slides.filter((s) => Boolean(s.illustration || s.scene)).length
add(true, `有图/场景的页 ${illustrated} 页`)

console.log('\n=== 自检 ===')
for (const l of lines) console.log(`  ${l.ok ? '✓' : '✗'} ${l.text}`)
notes.forEach((n) => console.log(`  · ${n}`))

console.log('\n=== 备课包环节 ===')
plan.segments.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}｜${s.goal}`))
console.log(`\n=== 学生版逐页（${slides.length}） ===`)
slides.forEach((s, i) => {
  const line = String(s.line ?? '').replace(/\s+/g, ' ')
  const items = (s.items ?? []).join(' / ')
  console.log(`  ${String(i + 1).padStart(2)}. [${s.kind}] ${s.title}${line ? ` — ${line}` : ''}${items ? ` ｜ ${items}` : ''}`)
})

/* ---------------- 4. 导出 ---------------- */
const template = templateOf(defaultTemplateId(plan.meta.subject || '语文', plan.meta.topic, plan.meta.period))
console.log(`\n[3/3] 模板 ${template.id}（${template.name}）`)
if (!check.ok) {
  console.log('✗ 导出闸门没过，不出片（先把上面那条问题修掉再导）')
  process.exit(2)
}
const studentFile = path.join(OUT_DIR, `《${TOPIC}》-课堂PPT.pptx`)
await downloadTemplatedPptx(slides, template, undefined, studentFile, { animated: true, limits })
console.log(`  ✓ 学生版 → ${studentFile}`)

const inkSerif = '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif'
const inkSans = '"PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif'
const deckTheme = {
  id: template.id,
  name: template.name,
  paper: template.paper,
  coverPaper: template.paper,
  paperDeep: template.surface,
  paperLine: template.line,
  ink: template.ink,
  inkSoft: template.muted,
  accent: template.accent,
  accentSoft: template.surface,
  serif: inkSerif,
  sans: inkSans,
  motif: 'plain' as const,
  ruleWidth: 1,
  source: 'builtin' as const,
  note: '',
}
const deck = buildDeck(scaled, allocate(scaled.segments, DURATION))
const deckFile = path.join(OUT_DIR, `《${TOPIC}》-课件.pptx`)
await downloadDeckPptx(deck, undefined, deckFile, deckTheme)
console.log(`  ✓ 教师课件 ${deck.length} 页 → ${deckFile}`)