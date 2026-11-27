/**
 * 临时救援脚本（用完即删）：把用户在浏览器里生成、但没落盘就丢掉的《少年闰土》重跑一份。
 *
 * 三步：备课包 → 学生版（导演/插画，生图欠费就退矢量底景）→ 两份 .pptx 落到 ~/Downloads。
 * 前两步的结果都缓存在 /tmp，重导出只跑第三步（几秒）。
 *
 * 跑法：npx esbuild --bundle --format=esm --platform=node --packages=external \
 *        --outfile=scripts/.recover.mjs scripts/.recover-yantuan.ts && node scripts/.recover.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

/* 业务模块里用了 window.clearTimeout / 浏览器口径：node 里先垫一层 */
;(globalThis as unknown as { window: unknown }).window ??= globalThis

const PLAN_FILE = '/tmp/yantuan-plan.json'
const SLIDES_FILE = '/tmp/yantuan-slides.json'
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
const dsKey = env.DEEPSEEK_API_KEY || ''
if (!dsKey) {
  console.error('✗ .env.local 里没有 DEEPSEEK_API_KEY，跑不了')
  process.exit(1)
}

const { DEFAULT_CONFIG, generatePlan } = await import('../src/lib/llm')
const { planForScale } = await import('../src/data/lesson')
const { limitsFor, scaleOf } = await import('../src/lib/scale')
const { buildStudentSlides } = await import('../src/lib/slides')
const { templateOf, defaultTemplateId } = await import('../src/lib/deck2/theme')
const { downloadTemplatedPptx, downloadDeckPptx } = await import('../src/lib/pptx')
const { buildDeck } = await import('../src/lib/deck')
const { allocate } = await import('../src/lib/timing')
import type { LessonInput, LessonPlan, StudentSlide } from '../src/types'

const cfg = {
  ...DEFAULT_CONFIG,
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  apiKey: dsKey,
}

const DURATION = 40 * 60
const input: LessonInput = {
  topic: '少年闰土',
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
  console.log(`[1/3] 复用备课包（${plan.segments.length} 个环节）`)
} else {
  const t = Date.now()
  console.log(`[1/3] 生成备课包：${input.topic} / ${input.period} / ${DURATION / 60} 分钟`)
  plan = await generatePlan(input, cfg).catch((e) => {
    console.error('✗ 备课包失败：', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2))
  console.log(`✓ ${((Date.now() - t) / 1000).toFixed(1)}s，${plan.segments.length} 个环节`)
}

const scaled = planForScale(plan, DURATION)
const limits = limitsFor(cfg.density, scaleOf(DURATION), DURATION)

/* ---------------- 2. 学生版页面 ---------------- */
let slides: StudentSlide[]
if (fs.existsSync(SLIDES_FILE)) {
  slides = JSON.parse(fs.readFileSync(SLIDES_FILE, 'utf8')) as StudentSlide[]
  console.log(`[2/3] 复用学生版（${slides.length} 页）`)
} else {
  console.log(`[2/3] 生成学生版（区间 ${limits.pagesMin}–${limits.pagesMax} 页）`)
  const t2 = Date.now()
  slides = await buildStudentSlides(scaled, cfg, {
    onProgress: (p) => {
      if (p.stage === 'direct' || p.stage === 'illust') {
        process.stdout.write(`\r  ${p.stage} ${p.page ?? ''}/${p.total ?? ''}   `)
      }
    },
    onFallback: (why) => console.log(`\n  [降级] ${why}`),
    onIllustrated: (note, used) => console.log(`\n  插画 ${used} 张${note ? `：${note}` : ''}`),
    signal: AbortSignal.timeout(240_000),
  })
  fs.writeFileSync(SLIDES_FILE, JSON.stringify(slides))
  console.log(`\n✓ ${((Date.now() - t2) / 1000).toFixed(1)}s，${slides.length} 页`)
}

slides.forEach((s, i) => {
  const line = String(s.line ?? '').replace(/\s+/g, ' ')
  const items = (s.items ?? []).join(' / ')
  console.log(`  ${String(i + 1).padStart(2)}. [${s.kind}] ${s.title}${line ? ` — ${line}` : ''}${items ? ` ｜ ${items}` : ''}`)
})

/* ---------------- 3. 导出两份 .pptx ---------------- */
/* 语文 → 素课（suke）：模型这次没判出学科，手动按学科给默认族 */
const template = templateOf(defaultTemplateId('语文', plan.meta.topic, plan.meta.period))
const studentFile = path.join(OUT_DIR, '《少年闰土》-课堂PPT.pptx')
console.log(`[3/3] 导出学生版（${template.name}）→ ${studentFile}`)
await downloadTemplatedPptx(slides, template, undefined, studentFile, { animated: true, limits })

/**
 * 教师课件走的是老 DeckTheme（字段是 paperDeep / paperLine / inkSoft），
 * 与 deck2 的 TemplateTheme 不同名同形——直接塞进去会让块面与分隔线变黑。
 */
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
const deckFile = path.join(OUT_DIR, '《少年闰土》-课件.pptx')
console.log(`      导出教师课件（${deck.length} 页）→ ${deckFile}`)
await downloadDeckPptx(deck, undefined, deckFile, deckTheme)

console.log('\n✓ 完成，两份文件都在 ~/Downloads')
console.log(`  学生版 ${slides.length} 页 / ${template.id}（${template.name}）`)
console.log(`  教师课件 ${deck.length} 页`)