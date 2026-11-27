/**
 * 临时脚本（用完即删）：只重导教师课件 .pptx（不调模型、几秒）。
 * 上一版把 deck2 的 TemplateTheme 直接塞进 downloadDeckPptx，
 * 老 DeckTheme 的 paperDeep / paperLine / inkSoft 全是 undefined → 块面与分隔线变黑。
 *
 * 跑法：npx esbuild --bundle --format=esm --platform=node --packages=external \
 *        --outfile=scripts/.redeck.mjs scripts/.recover-deck.ts && node scripts/.redeck.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

;(globalThis as unknown as { window: unknown }).window ??= globalThis

const { planForScale } = await import('../src/data/lesson')
const { templateOf, defaultTemplateId } = await import('../src/lib/deck2/theme')
const { downloadDeckPptx } = await import('../src/lib/pptx')
const { buildDeck } = await import('../src/lib/deck')
const { allocate } = await import('../src/lib/timing')
import type { LessonPlan } from '../src/types'

const plan = JSON.parse(fs.readFileSync('/tmp/yantuan-plan.json', 'utf8')) as LessonPlan
const DURATION = plan.meta.duration || 40 * 60
const scaled = planForScale(plan, DURATION)

/* 语文 → 素课；模型这次没判出学科，按学科手动给默认族 */
const template = templateOf(defaultTemplateId('语文', plan.meta.topic, plan.meta.period))
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
const file = path.join(process.env.HOME ?? '.', 'Downloads', '《少年闰土》-课件.pptx')
console.log(`导出教师课件（${deck.length} 页 / ${template.name}）→ ${file}`)
await downloadDeckPptx(deck, undefined, file, deckTheme)
console.log('✓ 完成')