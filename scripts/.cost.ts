/**
 * 临时成本统计（用完即删）：一次「课件 + 学生版 PPT」到底烧多少 token。
 * 只读本地文件与纯函数，不发任何网络请求。
 *
 *   node scripts/.cost.mjs
 */
import fs from 'node:fs'

;(globalThis as unknown as { window: unknown }).window ??= globalThis

const plan = JSON.parse(fs.readFileSync('/tmp/try-狼牙山五壮士-plan.json', 'utf8'))
const { buildStudentSlidesPrompt, SYSTEM_PROMPT, buildUserPrompt } = await import('../src/lib/prompt')
const { scaleOf, limitsFor } = await import('../src/lib/scale')
const { DEFAULT_CONFIG } = await import('../src/lib/llm')

/** 从源码里截一段模板字符串的字数（JS 侧估算足够，不做 AST） */
function templateLen(file: string, name: string, nextMark: string): number {
  const src = fs.readFileSync(file, 'utf8')
  const at = src.indexOf(`const ${name} = \``)
  if (at < 0) return 0
  const from = src.indexOf('`', at) + 1
  const to = src.indexOf(nextMark, from)
  return to > from ? to - from : 0
}

const duration = plan.meta.duration || 2400
const scale = scaleOf(duration)
const limits = limitsFor(DEFAULT_CONFIG.density, scale, duration)
const stu = buildStudentSlidesPrompt(plan, 'auto', scale)

const sysPlan = SYSTEM_PROMPT.length
const userPlan = buildUserPrompt({
  topic: '狼牙山五壮士',
  subject: '',
  stage: '',
  grade: '',
  period: '第一课时',
  textbook: '',
  duration: 2400,
}).length
const sysDirect = templateLen('src/lib/director.ts', 'DIRECT_SYSTEM', '\n\nconst TYPESET_SYSTEM')
const sysTypeset = templateLen('src/lib/director.ts', 'TYPESET_SYSTEM', '\n\n/**')

/** 中文为主的文本：1 字 ≈ 0.65 token（DeepSeek 分词器经验值），兼顾 JSON 里的英文符号 */
const tok = (chars: number) => Math.round(chars * 0.65)

const planOut = JSON.stringify(plan).length
const slidesOut = 4000 // 20 页学生版 JSON 实测约 4 KB（紧凑）
const directOut = 2600 // 导演计划：每页一句 brief
const typesetOut = 2400 // 排版：每页几条几何判断

const rows = [
  { step: '① 备课包（教学设计 / 说课稿 / 板书 / 答辩）', inChars: sysPlan + userPlan, outChars: planOut },
  { step: '② 学生版页面', inChars: stu.system.length + stu.user.length, outChars: slidesOut },
  { step: '③ 导演（哪页配图、画什么、留白）', inChars: sysDirect + 2600, outChars: directOut },
  { step: '④ 排版（按量的尺寸落每一页）', inChars: sysTypeset + 3000, outChars: typesetOut },
]

let inTok = 0
let outTok = 0
console.log('=== 一次「课件 + 学生版 PPT」的文本用量（《狼牙山五壮士》40 分钟实测稿） ===')
for (const r of rows) {
  const i = tok(r.inChars)
  const o = tok(r.outChars)
  inTok += i
  outTok += o
  console.log(
    `${r.step}\n    输入 ${String(r.inChars).padStart(6)} 字 ≈ ${String(i).padStart(5)} tok ｜ 输出 ${String(r.outChars).padStart(5)} 字 ≈ ${String(o).padStart(5)} tok`
  )
}
console.log(`\n合计：输入 ≈ ${inTok} tok ／ 输出 ≈ ${outTok} tok`)
console.log(`学生版提示词：system ${stu.system.length} 字 + user ${stu.user.length} 字`)
console.log(`备课包系统提示词 ${sysPlan} 字 + 用户 ${userPlan} 字；导演 ${sysDirect} 字；排版 ${sysTypeset} 字`)
console.log(`页数区间 ${limits.pagesMin}–${limits.pagesMax}，正好卡在下限附近（薄教案）`)

/* 价格敏感性：DeepSeek 官方 deepseek-flash 与实际余额扣费口径以账单为准，
   这里按「输入 ¥2 / 百万 tok、输出 ¥8 / 百万 tok」与半价档各算一行。 */
const price = (inYuan: number, outYuan: number) =>
  ((inTok * inYuan + outTok * outYuan) / 1_000_000).toFixed(4)
console.log('\n=== 文本费用（不含生图） ===')
console.log(`  ¥2 / ¥8 每百万 tok  →  ¥${price(2, 8)} 一次`)
console.log(`  ¥1 / ¥4 每百万 tok  →  ¥${price(1, 4)} 一次`)
console.log(`  ¥0.5 / ¥2 每百万 tok → ¥${price(0.5, 2)} 一次`)
console.log('\n生图：6 张（40 分钟档），每张按 ¥0.01–0.05 估 → ¥0.06–0.30')
console.log('一次完整生成（文本 + 6 张图）：¥0.10 – ¥0.50，取中位约 ¥0.25')
console.log('\n以 ¥10 余额计：约 20–90 次；¥50：约 100–450 次')