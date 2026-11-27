/**
 * 真机回归（用完即删，.gitignore 不管 dot 前缀以外的脚本）：
 * 用**产品里那条零密钥链路**跑一份《桂花雨》40 分钟样张——
 *   前端 cfg 里 apiKey 为空 → endpointOf 落 /api/ds → 本机 `node server.mjs` 注入 key → DeepSeek 官方（欠费自动转硅基）。
 * 这条路径就是评委打开页面后走的那条，不走任何一把前端硬编码 key。
 *
 * 跑法：先 `PORT=8099 node server.mjs`，再
 *   npx esbuild --bundle --format=esm --platform=node --packages=external \
 *     --outfile=scripts/.real-run.mjs scripts/.real-run.ts && node scripts/.real-run.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

;(globalThis as unknown as { window: unknown }).window ??= globalThis

const BASE = process.env.RUN_BASE || 'http://127.0.0.1:8099'
const rawFetch = globalThis.fetch
/** 业务里代理是相对路径（浏览器里同源），node 里补上本机服务端 */
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `${BASE}${input}` : input
  return rawFetch(url as RequestInfo, init)
}) as typeof fetch

const OUT = process.env.OUT || '/tmp/real'
const TOPIC = process.env.TOPIC || '桂花雨'
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
const { EMPTY_EDITS, patchOriginal, applyEdits, editCount } = await import('../src/lib/deck2/edits')
const { scriptTextOf } = await import('../src/lib/scriptText')
const { allocate } = await import('../src/lib/timing')

const entry = findText(TOPIC)
const DURATION = 40 * 60
const input = {
  topic: TOPIC,
  subject: '',
  stage: '',
  grade: process.env.GRADE || '',
  period: '第一课时',
  textbook: '',
  duration: DURATION,
  text: entry?.quotes?.join('\n') ?? '',
}
fs.writeFileSync(`${OUT}/input.json`, JSON.stringify(input))

/** 零密钥：评审打开页面时的同一份配置（只把配图关掉，省额度，文字链路一条不少） */
const cfg = { ...DEFAULT_CONFIG, apiKey: '', illust: 'off' as const }

const report: Record<string, unknown> = { at: new Date().toISOString(), base: BASE, model: cfg.model, topic: TOPIC }

/* ------------------------------ 1 · 备课包 ------------------------------ */

step(`1/5 备课包（零密钥 → ${BASE}/api/ds）`)
const tp = Date.now()
const plan = await generatePlan(input, cfg)
report.planSeconds = (Date.now() - tp) / 1000
report.segments = plan.segments.length
report.topic = plan.meta.topic
report.speech = plan.speech?.length ?? 0
console.log(`✓ ${report.planSeconds}s · ${plan.segments.length} 个环节 · 说课 ${report.speech} 节 · 课题「${plan.meta.topic}」`)
fs.writeFileSync(`${OUT}/plan.json`, JSON.stringify(plan, null, 2))

const scaled = planForScale(plan, DURATION)
const limits = limitsFor(cfg.density, scaleOf(DURATION), DURATION)
report.limits = { min: limits.pagesMin, max: limits.pagesMax }

/* ----------------------------- 2 · 学生版 ----------------------------- */

step(`2/5 学生版（${limits.pagesMin}–${limits.pagesMax} 页）`)
const ts = Date.now()
const slides = await buildStudentSlides(scaled, cfg, {
  onProgress: (p) => {
    if (p.stage === 'direct') process.stdout.write(`\r  ${p.stage} ${p.page ?? ''}/${p.total ?? ''}   `)
  },
  onFallback: (why) => console.log(`\n  [降级] ${why}`),
  signal: AbortSignal.timeout(300_000),
})
report.slidesSeconds = (Date.now() - ts) / 1000
report.pages = slides.length
console.log(`\n✓ ${report.slidesSeconds}s · ${slides.length} 页`)
slides.forEach((s, i) => {
  const items = (s.items ?? []).join(' / ')
  console.log(`  ${String(i + 1).padStart(2)}. [${s.kind}] ${s.title}${s.line ? ` — ${s.line}` : ''}${items ? ` ｜ ${items}` : ''}`)
})
fs.writeFileSync(`${OUT}/slides.json`, JSON.stringify(slides))
const check = validateSlides(slides, limits)
report.valid = check.ok
report.problems = check.problems
console.log(`  导出校验：${check.ok ? '✓ 过' : `✗ ${check.problems.slice(0, 4).join('；')}`}`)
const missingNotes = slides.filter((s) => !String(s.notes ?? '').trim()).length
report.missingNotes = missingNotes
console.log(`  讲稿为空：${missingNotes} 页（必须 0：导出的备注就是这一栏）`)

/* ------------------------------ 3 · 稿子 ------------------------------ */

const script = scriptTextOf(scaled, allocate(scaled.segments, DURATION))
fs.writeFileSync(`${OUT}/script.txt`, script)
const sections = ['一、教学设计', '二、说课稿', '三、板书设计', '四、答辩预案', '五、讲台时间表']
const missSections = sections.filter((s) => !script.includes(s))
report.scriptChars = [...script].length
report.missingSections = missSections
console.log(`\n3/5 稿子 ${report.scriptChars} 字 · 五节${missSections.length ? `缺 ${missSections.join('/')}` : '齐'} → ${OUT}/script.txt`)

/* ---------------------------- 4 · 导出 .pptx ---------------------------- */

step('4/5 导出学生版 .pptx')
const tid = defaultTemplateId(plan.meta.subject || '语文', plan.meta.topic, plan.meta.period)
const template = templateOf(tid)
const file = `${OUT}/《${TOPIC}》-40分钟-课堂PPT.pptx`
fs.rmSync(file, { force: true })
const te = Date.now()
await downloadTemplatedPptx(slides, template, undefined, file, { animated: false, limits })
report.pptxSeconds = (Date.now() - te) / 1000
report.template = { id: tid, name: template.name, paper: template.paper }
report.pptxBytes = fs.statSync(file).size
console.log(`✓ ${report.pptxSeconds}s · ${(report.pptxBytes / 1024).toFixed(0)}KB · 模板 ${template.name}（${tid}）→ ${file}`)

function unzip(entryPath: string, target: string): string {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', target, entryPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return ''
  }
}
const listing = execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n').map((s) => s.trim())
const pageFiles = listing.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
const noteFiles = listing.filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
const noteTexts = noteFiles.map((e) => [...unzip(e, file).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join(' '))
report.pptxPages = pageFiles.length
report.pptxNotes = noteFiles.length
const notesIn = slides.filter((s, i) => noteTexts[i] && noteTexts[i].includes(String(s.notes ?? '').slice(0, 10))).length
report.notesMatched = notesIn
console.log(`  pptx ${pageFiles.length} 页 / ${noteFiles.length} 页备注 · 备注对得上的 ${notesIn}/${slides.length}`)

/* ------------------------- 5 · 改完再导一遍（真内容） ------------------------- */

step('5/5 改 2 处（标题 + 讲稿）再导一遍')
const at = slides.findIndex((s) => s.kind !== 'cover' && s.kind !== 'quote')
const NEW_TITLE = '这一页，老师改过了'
const NEW_NOTE = '先自己读一遍页上的材料，读完举手说一说。'
let edits = patchOriginal(EMPTY_EDITS, slides.length, at < 0 ? 1 : at, { title: NEW_TITLE })
edits = patchOriginal(edits, slides.length, at < 0 ? 1 : at, { notes: NEW_NOTE })
const edited = applyEdits(slides, edits)
report.edits = editCount(edits)
const file2 = `${OUT}/《${TOPIC}》-40分钟-改后.pptx`
fs.rmSync(file2, { force: true })
await downloadTemplatedPptx(edited, template, undefined, file2, { animated: false, limits })
const page2 = execFileSync('/usr/bin/unzip', ['-Z1', file2], { encoding: 'utf8' })
  .split('\n')
  .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
  .map((e) => unzip(e, file2))
  .join('\n')
const note2 = execFileSync('/usr/bin/unzip', ['-Z1', file2], { encoding: 'utf8' })
  .split('\n')
  .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
  .map((e) => unzip(e, file2))
  .join('\n')
report.editTitleIn = page2.includes(NEW_TITLE)
report.editNoteIn = note2.includes(NEW_NOTE)
console.log(`  改 ${report.edits} 处 · 新标题进页面 ${report.editTitleIn ? '✓' : '✗'} · 新讲稿进备注 ${report.editNoteIn ? '✓' : '✗'} → ${file2}`)

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 报告 ${OUT}/report.json`)