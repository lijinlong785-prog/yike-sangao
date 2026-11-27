/**
 * 真机跑一份《狼牙山五壮士》（用完即删的临时脚本）：
 *   文字 → DeepSeek 官方（服务端注入 key，前端零密钥）
 *   插画 → 百炼 qwen-image-3.0（服务端 /api/bl 把异步任务吃成一次请求）
 * 跑法：PORT=8099 node server.mjs 之后
 *   npx esbuild --bundle --format=esm --platform=node --packages=external \
 *     --outfile=scripts/.run-yalang.mjs scripts/.run-yalang.ts && node scripts/.run-yalang.mjs
 */
import fs from 'node:fs'

;(globalThis as unknown as { window: unknown }).window ??= globalThis

const BASE = process.env.RUN_BASE || 'http://127.0.0.1:8099'
const rawFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `${BASE}${input}` : input
  return rawFetch(url as RequestInfo, init)
}) as typeof fetch

const OUT = process.env.OUT || '/tmp/yalang'
const TOPIC = process.env.TOPIC || '狼牙山五壮士'
fs.mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
const step = (s: string) => console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`)

const { DEFAULT_CONFIG, generatePlan } = await import('../src/lib/llm')
const { planForScale } = await import('../src/data/lesson')
const { limitsFor, scaleOf } = await import('../src/lib/scale')
const { buildStudentSlides, validateSlides } = await import('../src/lib/slides')
const { templateOf, defaultTemplateId } = await import('../src/lib/deck2/theme')
const { downloadTemplatedPptx } = await import('../src/lib/pptx')
const { findText } = await import('../src/data/texts')

const entry = findText(TOPIC)
const DURATION = 40 * 60
const input = {
  topic: TOPIC,
  subject: '',
  stage: '',
  grade: process.env.GRADE || '六年级',
  period: '第一课时',
  textbook: '',
  duration: DURATION,
  text: entry?.quotes?.join('\n') ?? '',
}
if (entry) console.log(`找到内置原文：${entry.title}（${entry.quotes?.length ?? 0} 段）`)

/** 零密钥 + 开插画 + 指定的百炼模型：跟评委拿到的状态只差「配插画」这个开关 */
const cfg = {
  ...DEFAULT_CONFIG,
  apiKey: '',
  illust: 'on' as const,
  imageModel: process.env.IMAGE_MODEL || 'qwen-image-3.0',
}

step(`1/3 备课包（DeepSeek 官方，零密钥）`)
const plan = await generatePlan(input, cfg)
console.log(`✓ ${plan.segments.length} 个环节 · 课题「${plan.meta.topic}」· ${plan.meta.grade ?? ''}`)

const scaled = planForScale(plan, DURATION)
const limits = limitsFor(cfg.density, scaleOf(DURATION), DURATION)

step(`2/3 学生版 + 插画（${cfg.imageModel}）`)
const ts = Date.now()
const slides = await buildStudentSlides(scaled, cfg, {
  onProgress: (p) => {
    if (p.stage === 'illust') process.stdout.write(`\r  画图 ${p.page ?? ''}/${p.total ?? ''}   `)
    else if (p.stage === 'direct') process.stdout.write(`\r  定画法   `)
  },
  onFallback: (why) => console.log(`\n  [降级] ${why}`),
  onIllustrated: (note, drawn) => console.log(`\n  配图：${drawn} 页（${note}）`),
  signal: AbortSignal.timeout(900_000),
})
console.log(`\n✓ ${((Date.now() - ts) / 1000).toFixed(0)}s · ${slides.length} 页`)
const withArt = slides.filter((s) => typeof s.illustration === 'string' && s.illustration.startsWith('data:image/'))
console.log(`  带图页：${withArt.length} / ${slides.length}`)
slides.forEach((s, i) => {
  const art = typeof s.illustration === 'string' && s.illustration.startsWith('data:image/') ? ' [图]' : ''
  console.log(`  ${String(i + 1).padStart(2)}. [${s.kind}]${art} ${s.title}`)
})
const check = validateSlides(slides, limits)
console.log(`  导出校验：${check.ok ? '✓ 过' : `✗ ${check.problems.slice(0, 4).join('；')}`}`)
fs.writeFileSync(`${OUT}/slides.json`, JSON.stringify(slides))

step('3/3 导出 .pptx')
const tid = defaultTemplateId(plan.meta.subject || '语文', plan.meta.topic, plan.meta.period)
const template = templateOf(tid)
const file = `${OUT}/《${TOPIC}》-课件.pptx`
fs.rmSync(file, { force: true })
await downloadTemplatedPptx(slides, template, undefined, file, { animated: false, limits })
console.log(`✓ ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)}MB · 模板 ${template.name} → ${file}`)
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
