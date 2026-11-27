/* 一次性验证：引文块（pull）在真课稿上到底填上了几句、填在哪几页。
   不进门禁 —— 它只是看一眼数据，不许当断言用。 */
import { guihuaYu } from '../src/data/guihua'
import { qiLvChangZheng } from '../src/data/changzheng'
import { heTangYueSe } from '../src/data/hetang'
import {
  getBuiltinStudentSlides,
  withQuotes,
  withPulls,
  type StudentSlide,
} from '../src/lib/slides'
import { splitQuotes, findText } from '../src/data/texts'
import { limitsFor } from '../src/lib/scale'
import type { LessonPlan } from '../src/types'

/** 真实流程里 meta.text 是首页用 TEXTS/老师粘贴填的；内置稿本身不带原文，这里补上 */
function grounded(plan: LessonPlan): LessonPlan {
  const t = findText(String(plan?.meta?.topic ?? ''))
  if (!t) return plan
  return { ...plan, meta: { ...plan.meta, text: t.quotes.join('\n') } }
}

function run(name: string, plan: LessonPlan): void {
  plan = grounded(plan)
  const limits = limitsFor('auto', 'lesson', plan?.meta?.duration)
  const base = withQuotes(getBuiltinStudentSlides(plan, limits), plan, limits)
  const out = withPulls(base, plan)
  const quotes = splitQuotes(String(plan?.meta?.text ?? ''))
  const got = out.filter((s) => s.pull)
  console.log(`\n=== ${name} ===`)
  console.log(`原文句库 ${quotes.length} 句 · 页数 ${out.length} · 拿到引文块 ${got.length} 页`)
  console.log('  页型：' + out.map((s) => s.kind).join(' '))
  out.forEach((s: StudentSlide, i: number) => {
    if (!s.pull) return
    console.log(`  p${String(i + 1).padStart(2)} [${s.kind}] 标题「${s.title}」\n      引文「${s.pull}」`)
  })
  // 硬规矩：每句 pull 必须逐字出自原文句库
  const bad = got.filter((s) => !quotes.some((q) => q === s.pull))
  console.log(bad.length === 0 ? '  ✅ 全部逐字对得上原文' : `  ❌ ${bad.length} 句对不上原文`)

  /* 真机场景：LLM 一叠 30 页里原文页只有 4–5 页，其余句子是富余的。
     内置稿把句子几乎全做成了原文页（quote 极多），所以另跑一遍「去掉原文页」，
     看那些没图的活动页到底能不能填上引文块。 */
  const noQuote = base.filter((s) => s.kind !== 'quote')
  const out2 = withPulls(noQuote, plan)
  const got2 = out2.filter((s) => s.pull)
  console.log(`  ── 模拟真机（去掉原文页，${noQuote.length} 页）→ 引文块 ${got2.length} 页`)
  out2.forEach((s: StudentSlide, i: number) => {
    if (!s.pull) return
    console.log(`     p${String(i + 1).padStart(2)} [${s.kind}]「${s.pull}」`)
  })
  const bare = out2.filter(
    (s) => !s.pull && !s.illustration && ['hook', 'words', 'close-read', 'drill', 'compare', 'goals'].includes(s.kind)
  )
  console.log(`  ⚠ 仍是空块的活动页 ${bare.length} 页：${bare.map((s) => s.kind).join(' ') || '无'}`)
}

run('桂花雨', guihuaYu)
run('七律·长征', qiLvChangZheng)
run('荷塘月色', heTangYueSe)
