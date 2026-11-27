/**
 * 语气校验（TASKS/08 §D.4）。
 *
 * 扫的是**产物文本**，不是源码：四份内置示例的课件全页可见文字 + 全部 notes
 * （学生版与教师课件两侧）+ speech 六段 + defense 问答，再加**泛化兜底两例**
 * （check-lib CASES 里的 generic(司马光) 与 generic(超长课题)，genericSlides() 现拼的 10 页），
 * 判据全部 import 自 src/lib/voice.ts——
 * 那一份同时是 prompt 注入用的判定源，站内不存在第二套写死的正则。
 * 有 Key（环境变量 YIKE_LLM_KEY）时再生成一份同结构文本一并扫，没有就只扫内置四篇。
 *
 * 两处硬编码排除，不排就是满屏误报：
 *   1. src/lib/voice.ts 里的正反例（❌ 那句本身就是禁句示范）→ 不读源码，天然不进扫描集；
 *   2. 本脚本头注释与常量里的禁词字面量 → 同样只扫产物文本，不 self-scan。
 *
 * 第 12 件起 deck.ts 的骨架**不再豁免**（旧版 DECK_SCAFFOLD 抹除已删）：
 * 课件页的标题 / 要点 / 问句 / 备注一律进扫描集，另加「上屏短句」三类口味判定
 * （四字对偶 / 三连排比 / 动作流水账）。写了 AI 腔就出不了成品，没有「工具本体」的后门。
 *
 * 硬失败（exit 1）三组：
 *   1. §D.2 四类禁用句式与五个禁词在硬扫描范围内命中数不为 0——答辩预案（defense）槽
 *      也在集内：任务书原话是「生成的任何文本里命中数必须为 0」，产物文本没有豁免资格；
 *   2. §D.1 classroom 那两条写死的判据，分母 = 各条路径学生版 notes 的实数（四篇内置数据
 *      + 泛化两例；内置稿是 lesson m40 档的源，每篇 16 页，m20/m30 由 trimBuiltinTier
 *      裁到 12/14；泛化两例走 clip 档，落在 08 §B 的 10–14 区间）：每条 notes
 *      必须有问句、必须带「（停三秒）」、不许出现（停 3 秒）
 *      （停两秒）这类变体写法，且「（停三秒）」必须**紧跟在一个问句之后**（问号后面允许
 *      夹一个闭合引号），飘到与问句无关的句子后面就是硬失败；一条 notes 里多个问句时，
 *      允许只在最后一个问句后标停顿；
 *   3. 每条路径的学生版 notes 条数不对（内置稿 ≠ m40 源 16 页，或泛化例不在 10–14 页区间）。
 * 泛化两例只扫学生版那 10 页（页面文字 + notes）：它们的 plan 是《桂花雨》改 meta，
 * 教师课件 / speech / defense 三段与 guihua 一字不差，重复扫只会把同一处命中数两遍。
 * 报错位置：内置四篇打 data 文件行号；泛化产物是运行期拼的，没有源码行号，打生成入口
 * （src/lib/slides.ts 的 genericPage）那一行，不为了行号去改生成逻辑。
 * 只警告：课堂称呼软上限（§D.3「少用」，每份同一称呼 ≤1 次）。单句长度不进判定，
 * 只在表里打印平均句长与最长句；超出档案建议值（shuoke 120 / classroom 30 / defense 60）算风格问题，人定。
 *
 * 扫描集纳入决定（TASKS/08 §A 数据契约落地后补）：
 *   · compare 页的 compareDiff 会展示给学生，逐页追加一条 `slide#N.compareDiff` 产物 entry——
 *     field 名不匹配 /^slide#\d+\.notes$/，notes 分母与问句判据不受影响；
 *   · 拆解页零件短标签 noteShort 住在 src/data/anim.ts，不是 slide 页条目，不硬挤进
 *     entries 体系（免得动分母），单独走同判定源的 scanVoice 一次，命中同样计硬零。
 *
 * 跑法：npm run check:voice
 *   任务书 §全局验收 写的是 `npx tsx scripts/check-voice.ts`，本项目不执行那条命令：
 *   仓库没有 tsx，也不为一条门禁新增依赖（底线：package.json 的依赖表由 check-lib 第 15
 *   段守着）。07 起站内已有一套免依赖方案——tsc -p tsconfig.scripts.json --noEmit 做类型
 *   门禁，vite 自带的 esbuild 打成一次性 esm，node 跑完即删（npm run check / check:slides
 *   都是这个模式），check:voice 沿用它。
 */
import { readdirSync, readFileSync } from 'node:fs'
import type { LessonPlan } from '../src/types'
import { CUBE_FACES } from '../src/data/anim'
import { biDaXiao, BIDAXIAO_STUDENT_SLIDES } from '../src/data/bidaxiao'
import { changFangTi, CHANGFANGTI_STUDENT_SLIDES } from '../src/data/changfangti'
import { guihuaYu, GUIHUA_STUDENT_SLIDES } from '../src/data/guihua'
import { qiLvChangZheng, CHANGZHENG_STUDENT_SLIDES } from '../src/data/changzheng'
import { buildDeck, type DeckPage } from '../src/lib/deck'
import { DEFAULT_CONFIG, generatePlan, postChatJson, type LLMConfig } from '../src/lib/llm'
import { buildStudentSlidesPrompt } from '../src/lib/prompt'
import {
  BUILTIN_TIER_PAGES,
  EMPTY_TASK,
  SLIDE_KINDS,
  TITLE_GUESS,
  TITLE_VERB,
  genericSlides,
  normalizeSlides,
  pageVisibleText,
  TEACHER_WORDS,
  type StudentSlide,
} from '../src/lib/slides'
import { allocate } from '../src/lib/timing'
import { packOf, subjectKeyOf, type SubjectKey } from '../src/lib/subject'
import {
  BANNED_WORDS,
  BANNED_WORD_TEXTS,
  FORBIDDEN_PATTERNS,
  SOFT_SUBJECTS,
  SOFT_SUBJECT_LIMIT,
  VOICE_PROFILES,
  scanVoiceDocs,
  scanVoice,
  tasteProblems,
  visibleChars,
  type VoiceDocEntry,
} from '../src/lib/voice'
import { CASES, SLIDES_PAGES_RANGE, inSlidesBand } from './check-lib'

/* ------------------------- 1. 扫描集边界 ------------------------- */

/**
 * 第 12 件的跨课词表：这些词只属于《桂花雨》。
 * 别的课里出现一个，说明文案是拿《桂花雨》套过去写的，没真读课文。
 * 泛化两例除外：它们的 plan 本来就是《桂花雨》改 meta（离线兜底模板的例子），
 * 内容与课题对不上是已知边界，不在本判据里重复计。
 */
const TOPIC_WORDS: Record<string, string[]> = {
  bidaxiao: ['桂花', '闻香', '摇花', '箩筐', '满觉陇', '琦君'],
  changfangti: ['桂花', '闻香', '摇花', '箩筐', '满觉陇', '琦君'],
  changzheng: ['桂花', '闻香', '摇花', '箩筐', '满觉陇', '琦君'],
}

/* ------------------------- 2. 产物文本 → entries ------------------------- */

interface Doc {
  id: string
  file: string
  plan: LessonPlan
  slides: StudentSlide[]
  /** 泛化兜底路径：notes 是 genericPage() 现拼的，没有 data 文件行号可打 */
  generated?: boolean
}

/** 泛化路径的生成入口：notes 不在任何 data 文件里，报错时打这个位置 */
const GENERIC_SRC = 'src/lib/slides.ts'

const DOCS: Doc[] = [
  { id: 'guihua', file: 'src/data/guihua.ts', plan: guihuaYu, slides: GUIHUA_STUDENT_SLIDES },
  { id: 'bidaxiao', file: 'src/data/bidaxiao.ts', plan: biDaXiao, slides: BIDAXIAO_STUDENT_SLIDES },
  { id: 'changfangti', file: 'src/data/changfangti.ts', plan: changFangTi, slides: CHANGFANGTI_STUDENT_SLIDES },
  { id: 'changzheng', file: 'src/data/changzheng.ts', plan: qiLvChangZheng, slides: CHANGZHENG_STUDENT_SLIDES },
]

/**
 * 泛化两例直接取 check-lib CASES 里名字以 generic( 开头的那两条（司马光 / 超长课题），
 * 不在这里另立一份课题清单——将来 check-lib 加一条泛化用例，这里的分母自己跟着涨。
 */
const GENERIC_DOCS: Doc[] = CASES.filter(([name]) => name.startsWith('generic(')).map(([name, plan]) => ({
  id: name,
  file: GENERIC_SRC,
  plan,
  slides: genericSlides(plan),
  generated: true,
}))

const ALL_DOCS: Doc[] = [...DOCS, ...GENERIC_DOCS]

function deckVisibleText(p: DeckPage): string {
  return [
    p.label,
    p.title,
    ...(p.bullets ?? []),
    p.question ?? '',
    p.figureHint ?? '',
    ...(p.prep ?? []).flatMap((g) => [g.heading, ...g.items.flatMap((it) => [it.name, it.usage, it.searchHint ?? ''])]),
  ]
    .filter((s) => String(s ?? '').trim())
    .join(' ')
}

/** 硬扫描范围：学生版页面 + 学生版 notes +（内置四篇才有）教师课件页面与 notes + speech 六段 + defense 问答 */
function hardEntries(d: Doc): VoiceDocEntry[] {
  const entries: VoiceDocEntry[] = []
  d.slides.forEach((s, i) => {
    entries.push({
      doc: d.id,
      field: `slide#${i + 1}.页面文字`,
      text: pageVisibleText(s).join(' '),
      file: d.file,
      slot: 'classroom',
    })
    entries.push({
      doc: d.id,
      field: `slide#${i + 1}.notes`,
      text: String(s.notes ?? ''),
      file: d.file,
      slot: 'classroom',
    })
    // §A 数据契约：compareDiff 会浮出给学生，算产物文本；字段名避开 notes 分母正则
    if (s.kind === 'compare' && Array.isArray(s.compareDiff) && s.compareDiff.length > 0) {
      entries.push({
        doc: d.id,
        field: `slide#${i + 1}.compareDiff`,
        text: s.compareDiff.map((t) => String(t ?? '')).join(' '),
        file: d.file,
        slot: 'classroom',
      })
    }
  })
  if (d.generated) return entries
  const deck = buildDeck(d.plan, allocate(d.plan.segments, d.plan.meta.duration))
  deck.forEach((p, i) => {
    for (const [suffix, text] of [
      ['页面文字', deckVisibleText(p)],
      ['notes', String(p.notes ?? '')],
    ] as const) {
      entries.push({
        doc: d.id,
        field: `deck#${i + 1}.${suffix}`,
        text,
        file: d.file,
        slot: 'shuoke',
      })
    }
  })
  ;(d.plan.speech ?? []).forEach((sec, i) => {
    entries.push({
      doc: d.id,
      field: `speech#${i + 1}(${sec.section}).页面文字`,
      text: String(sec.text ?? ''),
      file: d.file,
      slot: 'shuoke',
    })
  })
  for (const e of defenseEntries(d)) entries.push(e)
  return entries
}

/**
 * 答辩预案（§D.1 的 defense 槽）。裁决一之后它和其他字段同一判定集（由 hardEntries 并进去）：
 * §D.2 写的是「生成的任何文本里命中数必须为 0」，answer 是产物文本，命中即 exit 1，
 * 不再走「单列打印不进硬零」。这个函数只负责把那槽摊平成 entries，4.6 段拿它打印切片，
 * 好看出命中落在问答还是落在稿子上。
 */
function defenseEntries(d: Doc): VoiceDocEntry[] {
  const out: VoiceDocEntry[] = []
  ;(d.plan.defense ?? []).forEach((q, i) => {
    out.push({ doc: d.id, field: `defense#${i + 1}.question`, text: String(q.question ?? ''), file: d.file, slot: 'defense' })
    out.push({ doc: d.id, field: `defense#${i + 1}.answer`, text: String(q.answer ?? ''), file: d.file, slot: 'defense' })
  })
  return out
}

/* ------------------------- 3. 文件 + 行号定位 ------------------------- */

const fileCache = new Map<string, string>()

function sourceOf(file?: string): string {
  if (!file) return ''
  if (!fileCache.has(file)) {
    for (const p of [file, `../${file}`]) {
      try {
        fileCache.set(file, readFileSync(p, 'utf8'))
        break
      } catch {
        /* 换下一个候选路径 */
      }
    }
  }
  return fileCache.get(file) ?? ''
}

function lineOf(file: string | undefined, needle: string, fieldText: string): number {
  const src = sourceOf(file)
  if (!src) return 0
  const probe = needle.trim().slice(0, 12)
  let at = probe ? src.indexOf(probe) : -1
  if (at < 0) at = src.indexOf(fieldText.trim().slice(0, 12))
  if (at < 0) return 0
  return src.slice(0, at).split('\n').length
}

/** 泛化模板在 src/lib/slides.ts 里的起始行：notes 是它现拼的，报错时只能指到这里 */
function genericEntryLine(): number {
  const src = sourceOf(GENERIC_SRC)
  const at = src.indexOf('function genericPage(')
  return at < 0 ? 0 : src.slice(0, at).split('\n').length
}

/** 出错位置：内置四篇打 data 文件行号，泛化两例打生成入口位置 */
function locate(pd: PerDoc, needle: string, fieldText: string): string {
  if (pd.generated) {
    return `${pd.file}:${genericEntryLine() || '?'}（泛化模板 genericPage，产物无源码行号）`
  }
  return `${pd.file}:${lineOf(pd.file, needle, fieldText) || '?'}`
}

/** 新加两节（口味 / 教学动作词 / 跨课词）只需要文件定位，不追具体行号 */
function locateByDoc(d: Doc): string {
  return d.generated ? `${d.file}:${genericEntryLine() || '?'}（泛化模板）` : d.file
}

/* ------------------------- 4. 输出 ------------------------- */

const failures: string[] = []
const warnings: string[] = []

/** deck.ts 的骨架从第 12 件起进扫描集：本行只数页数，不再维护豁免清单 */
const deckSrc = sourceOf('src/lib/deck.ts')
if (!deckSrc) warnings.push('读不到 src/lib/deck.ts：无法对账教师课件页数')
console.log(
  `-- 语气校验（TASKS/08 §D.2 + 12 §四）--\n` +
    `判定源：src/lib/voice.ts（四类句式 ${FORBIDDEN_PATTERNS.length} 条 + 禁词 ${BANNED_WORDS.length} 个 + 课堂称呼 ${SOFT_SUBJECTS.length} 个 + 上屏短句三类），prompt.ts / slides.ts 复用同一份\n` +
    `扫描对象：产物文本（学生版页面与 notes、教师课件页面与 notes、speech 六段、defense 问答，另加泛化两例的学生版）；deck.ts 骨架不再豁免\n` +
    `另两把关：学生版页面与备注不得出现教学动作词（${TEACHER_WORDS.join(' / ')}）；非《桂花雨》的课不得出现《桂花雨》专属词`
)

const patternIds = FORBIDDEN_PATTERNS.map((p) => p.id)
const patternShort = ['不是…而是', '宁可…也', '与其…不如', '三句排比']

/** §D.1 classroom 写死的停顿写法：只认这一个字面量，别的都算变体 */
const PAUSE_MARK = '（停三秒）'
/** 任何「（…停…）」形态都抓出来比对，例如（停 3 秒）（停两秒）（指图，停一停） */
const PAUSE_SHAPE = /[（(][^）)]*停[^）)]*[)）]/g
/** 紧邻判据：停顿标记前面必须是问句末（问号，允许夹一个闭合引号），否则就是位置飘了 */
const PAUSE_PRECEDER = /[？?][”’」』]?\s*$/

/** 返回这条 notes 里没紧贴问句的「（停三秒）」上下文片段，空数组 = 位置全合规 */
function loosePauses(text: string): string[] {
  const bad: string[] = []
  let at = text.indexOf(PAUSE_MARK)
  while (at >= 0) {
    if (!PAUSE_PRECEDER.test(text.slice(Math.max(0, at - 12), at))) {
      bad.push(`${text.slice(Math.max(0, at - 16), at)}→${PAUSE_MARK}`)
    }
    at = text.indexOf(PAUSE_MARK, at + PAUSE_MARK.length)
  }
  return bad
}

function pageOf(field: string): string {
  const m = /^slide#(\d+)\./.exec(field)
  return m ? `第 ${m[1]} 页` : field
}

interface PerDoc {
  id: string
  file: string
  generated: boolean
  entries: VoiceDocEntry[]
  report: ReturnType<typeof scanVoiceDocs>
  /** 该路径学生版的实际页数——notes 分母必须与它一格不差（08 §B 三档 10–14 页） */
  pages: number
  questionNotes: number
  coveredNotes: number
  pausedNotes: number
}

const perDocs: PerDoc[] = []

for (const d of ALL_DOCS) {
  const entries = hardEntries(d)
  // 只有学生版备注归 classroom 档案管（§D.1「每页备注至少一个问句」）；
  // 教师课件那侧的 notes 是讲给评委的口播逐字稿，不归这条判据。
  const report = scanVoiceDocs(entries, { questionFields: /^slide#\d+\.notes$/ })
  const noteEntries = report.entries.filter((e) => e.field.endsWith('.notes') && e.field.startsWith('slide#'))
  const coveredNotes = noteEntries.filter((e) => e.stats.hasQuestion).length
  const pausedNotes = noteEntries.filter((e) => e.text.includes(PAUSE_MARK) && loosePauses(e.text).length === 0).length
  perDocs.push({
    id: d.id,
    file: d.file,
    generated: d.generated === true,
    entries,
    report,
    pages: d.slides.length,
    questionNotes: noteEntries.length,
    coveredNotes,
    pausedNotes,
  })
}

/* --- 4.1 命中表（6 条路径分列：4 内置 + 2 泛化） --- */
console.log(
  `\n四类禁用句式 + 五个禁词命中表（硬扫描范围已含 defense 槽，全部必须为 0；后两列每条路径 notes 必须全覆盖，内置稿 ${BUILTIN_TIER_PAGES.m40} 页 / 泛化例 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页）`
)
console.log(
  `  ${'篇'.padEnd(16)}${patternShort.map((s) => s.padStart(11)).join('')} | ${BANNED_WORD_TEXTS.map((w) => w.slice(0, 4).padStart(8)).join('')} | 平均句长 最长句 备注问句 停三秒`
)
for (const pd of perDocs) {
  const cells = patternIds.map((id) => String(pd.report.patternCounts[id]).padStart(11)).join('')
  const words = BANNED_WORD_TEXTS.map((w) => String(pd.report.bannedCounts[w]).padStart(8)).join('')
  console.log(
    `  ${pd.id.padEnd(16)}${cells} | ${words} | ${String(pd.report.avgSentenceChars).padStart(6)} ${String(
      pd.report.maxSentenceChars
    ).padStart(6)} ${`${pd.coveredNotes}/${pd.questionNotes}`.padStart(9)} ${`${pd.pausedNotes}/${pd.questionNotes}`.padStart(7)}`
  )
}
// 合计按各页实际条数累加（不再是写死的 6×10=60）；当前 4 内置 × 16 + 2 泛化 × 10 = 84。
const totalNotes = perDocs.reduce((n, pd) => n + pd.questionNotes, 0)
const totalCovered = perDocs.reduce((n, pd) => n + pd.coveredNotes, 0)
const totalPaused = perDocs.reduce((n, pd) => n + pd.pausedNotes, 0)
console.log(
  `  ${'合计'.padEnd(16)} | 备注问句 ${totalCovered}/${totalNotes} · 停三秒 ${totalPaused}/${totalNotes}（分母 = 各页 notes 实数，内置稿各 ${BUILTIN_TIER_PAGES.m40} 页 / 泛化例 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页）`
)

/* --- 4.2 逐条命中：文件 + 行号 + 原文片段 --- */
for (const pd of perDocs) {
  for (const p of pd.report.problems) {
    failures.push(
      `${locate(pd, p.matched, p.entry.text)} ${pd.id} ${p.entry.field} 命中「${p.label}」→ ${p.matched}｜…${p.snippet}…｜${p.note}`
    )
  }
}

/* --- 4.2b 上屏短句三类口味（12 §四）：四字对偶 / 三连排比 / 动作流水账 --- *
 * 只判会投到屏幕上的短句：学生版的 title / line / items / compareDiff，
 * 教师课件的 title / bullets / question。notes 与说课稿是长句，
 * 「先看左边，再看右边」这种正常叙述会被四字对偶判据误伤，不进这一节。 */
const tasteHits: string[] = []
for (const d of ALL_DOCS) {
  d.slides.forEach((s, i) => {
    for (const [what, text] of [
      ['标题', s.title],
      ['一行字', s.line ?? ''],
      ...(s.items ?? []).map((t, k) => [`要点 ${k + 1}`, t] as [string, string]),
      ...(s.compareDiff ?? []).map((t, k) => [`对比行 ${k + 1}`, t] as [string, string]),
    ] as [string, string][]) {
      const hits = tasteProblems(text)
      if (hits.length) tasteHits.push(`${locateByDoc(d)} ${d.id} 第 ${i + 1} 页${what}「${text}」→ ${hits.join('；')}`)
    }
  })
  if (d.generated) continue
  for (const [i, p] of buildDeck(d.plan, allocate(d.plan.segments, d.plan.meta.duration)).entries()) {
    for (const [what, text] of [
      ['标题', p.title],
      ...(p.bullets ?? []).map((t, k) => [`要点 ${k + 1}`, t] as [string, string]),
      ['提问', p.question ?? ''],
    ] as [string, string][]) {
      const hits = tasteProblems(text)
      if (hits.length) tasteHits.push(`${locateByDoc(d)} ${d.id} 课件第 ${i + 1} 页${what}「${text}」→ ${hits.join('；')}`)
    }
  }
}
failures.push(...tasteHits)
// 反向对账（12 §四）：「deck.ts 骨架不再豁免」不能只是一句注释——
// 每条内置路径的每一页都得真进了扫描集（页面文字 + 备注两条），少一条就是又被抹掉了。
for (const d of DOCS) {
  const deck = buildDeck(d.plan, allocate(d.plan.segments, d.plan.meta.duration))
  const got = (perDocs.find((x) => x.id === d.id)?.entries ?? []).filter((e) => e.field.startsWith('deck#')).length
  if (got !== deck.length * 2) {
    failures.push(`${d.file} 课件 ${deck.length} 页只进了 ${got} 条扫描 entry（应为 ${deck.length * 2}）：骨架又被豁免了`)
  }
}
console.log(
  `\n上屏短句口味（四字对偶 / 通过 A、B、C / 出示·播放·提问流水账）：${tasteHits.length ? `${tasteHits.length} 处命中 ✗` : '零命中 ✓'}`
)

/* --- 4.2c 学生版不许出现教学动作词（12 §一）：导出前 validateSlides 硬拦，这里再扫一遍内置数据 --- */
const teacherHits: string[] = []
for (const d of ALL_DOCS) {
  d.slides.forEach((s, i) => {
    for (const [what, text] of [
      ['页面', pageVisibleText(s).join(' ')],
      ['备注', String(s.notes ?? '')],
    ] as [string, string][]) {
      const hit = TEACHER_WORDS.filter((w) => String(text).includes(w))
      if (hit.length) teacherHits.push(`${locateByDoc(d)} ${d.id} 第 ${i + 1} 页${what}出现教学动作词 ${hit.join('、')}`)
    }
  })
}
failures.push(...teacherHits)
console.log(
  `学生版教学动作词（${TEACHER_WORDS.join(' / ')}）：${teacherHits.length ? `${teacherHits.length} 处 ✗` : '零命中 ✓'}`
)

/* --- 4.2d 跨课词：闻香 / 摇花这些只属于《桂花雨》--- */
const crossHits: string[] = []
for (const d of DOCS) {
  const words = TOPIC_WORDS[d.id]
  if (!words?.length) continue
  const text = hardEntries(d).map((e) => e.text).join(' ')
  const hit = words.filter((w) => text.includes(w))
  if (hit.length) crossHits.push(`${d.id} 不是《桂花雨》，却出现 ${hit.join('、')}：文案是套过来的，没真读这篇课文`)
}
failures.push(...crossHits)
console.log(`跨课词（《桂花雨》专属词不得套到别的课）：${crossHits.length ? `${crossHits.length} 处 ✗` : '零命中 ✓'}`)

/* --- 4.2e 学生版是动作卡，不是猜谜卡（17 §四.3） --- */
/**
 * 四条：
 *   1. 标题不得命中「哪一件 / 哪一行 / 先做哪 / 你觉得呢…」——那是猜老师心思；
 *   2. goals 页三条不得是「读懂 / 说出想法 / 写一段」这类三字空话；
 *   3. 模板页（genericSlides 现拼的 10 页）每个标题必须带一个动作；
 *      手写范稿与整节课的标题是从课文原句里取的（「12 条棱」「一暖一寒」），
 *      按 §4.2.4 属于「结论」那一类，不强制动词；
 *   4. 全库 `先做哪件` 零命中——它曾经是每一份课件的固定问句。
 */
const guessHits: string[] = []
const emptyTaskHits: string[] = []
for (const d of ALL_DOCS) {
  d.slides.forEach((s, i) => {
    if (TITLE_GUESS.test(String(s.title ?? ''))) guessHits.push(`${d.id} 第 ${i + 1} 页标题「${s.title}」`)
    if (s.kind !== 'goals') return
    for (const it of s.items ?? []) {
      const bare = String(it ?? '').replace(/^[①②③]\s*/, '').trim()
      if (EMPTY_TASK.test(bare)) emptyTaskHits.push(`${d.id} 第 ${i + 1} 页条目「${bare}」`)
    }
  })
}
if (guessHits.length) failures.push(`标题在让学生猜老师的心思（${guessHits.length} 处）：${guessHits.slice(0, 3).join('；')}`)
if (emptyTaskHits.length)
  failures.push(`目标页出现三字空话（${emptyTaskHits.length} 处）：${emptyTaskHits.slice(0, 3).join('；')}`)

/** 模板页：这一叠 10 页全是 genericPage 现拼的，标题必须是一句指令（封面是课题，不在此列） */
const verbHits: string[] = []
let verbChecked = 0
for (const d of GENERIC_DOCS) {
  for (const s of d.slides) {
    if (s.kind === 'cover') continue
    verbChecked++
    if (!TITLE_VERB.test(String(s.title ?? ''))) verbHits.push(`${d.id} 第 ${d.slides.indexOf(s) + 1} 页标题「${s.title}」`)
  }
}
if (verbHits.length) failures.push(`模板页标题没有动作（${verbHits.length} 处）：${verbHits.slice(0, 3).join('；')}`)

/** 反向自检：四条判据都得真会红 */
for (const text of ['三件事，先做哪一件？', '这一行，你觉得呢？', '哪个字最重要？']) {
  if (!TITLE_GUESS.test(text)) failures.push(`标题判据漏报：「${text}」`)
}
for (const text of ['读懂', '说出想法', '写一段', '学习课文', '理解内容']) {
  if (!EMPTY_TASK.test(text)) failures.push(`空话判据漏报：「${text}」`)
}
for (const text of ['圈出写声音的词', '这节课做三件事', '照黑板这三行，说一遍顺序']) {
  if (!TITLE_VERB.test(text)) failures.push(`动作判据漏报正例：「${text}」`)
}

/** 全库（src/ 下全部 ts/tsx）：那句「三件事，先做哪件」不许再在源码里出现 */
const SRC_DEAD = '先做哪件'
const srcHits: string[] = []
function walkSrc(dir: URL): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(`${ent.name}${ent.isDirectory() ? '/' : ''}`, dir)
    if (ent.isDirectory()) walkSrc(p)
    else if (/\.(ts|tsx)$/.test(ent.name) && readFileSync(p, 'utf8').includes(SRC_DEAD)) srcHits.push(p.pathname)
  }
}
walkSrc(new URL('../src/', import.meta.url))
if (srcHits.length) failures.push(`源码里还有「${SRC_DEAD}」：${srcHits.join('、')}`)

console.log(
  `标题门禁：${ALL_DOCS.length} 条路径禁猜谜 ${guessHits.length} 处 | 目标页三字空话 ${emptyTaskHits.length} 处 | ` +
    `模板页标题带动作 ${verbChecked - verbHits.length}/${verbChecked} | 源码「${SRC_DEAD}」${srcHits.length} 处 | 判据自检 11 例`
)

/* --- 4.2f 问句池的每一句都得是问句（17 §四：ASKS 降级为兜底，但仍是「问句池」） --- */
/**
 * 为什么单列一条：ASKS 的消费方是 pickQuestion / ensureQuestion / dedupePages，
 * 它们只负责往「这一页缺一句问话」的空位上填。填进去一句祈使句（「三件事，一件一件做」），
 * hasQuestion 之后仍是假，页面会被反复补问句——目标页从三行任务长到五行字，
 * 逐页节拍快照也跟着全错。所以池子里每一句都得带问号。
 */
const ASK_SUBJECTS: [SubjectKey, string][] = [
  ['chinese', '语文'],
  ['math', '数学'],
  ['english', '英语'],
  ['physics', '物理'],
  ['chemistry', '化学'],
  ['biology', '生物'],
  ['geography', '地理'],
  ['science', '科学'],
  ['other', '综合'],
]
const badAsks: string[] = []
let askChecked = 0

/* 学科判定：物理 / 化学 / 生物 / 地理 必须各自认出来（2026-11-22 拆科）。
   以前四科全落进 science，化学课拿到的是「先看仔细，动手做一次」这种小学科学的词。 */
{
  const cases: [string, SubjectKey][] = [
    ['物理', 'physics'],
    ['八年级物理', 'physics'],
    ['化学', 'chemistry'],
    ['九年级化学', 'chemistry'],
    ['生物', 'biology'],
    ['高中生物', 'biology'],
    ['地理', 'geography'],
    ['初中地理', 'geography'],
    ['科学', 'science'],
    ['小学科学', 'science'],
    ['语文', 'chinese'],
    ['数学', 'math'],
    ['英语', 'english'],
    ['劳动', 'other'],
  ]
  const wrong = cases.filter(([s, want]) => subjectKeyOf(s) !== want)
  if (wrong.length)
    failures.push(
      `学科判定不对：${wrong.map(([s, w]) => `${s}→${subjectKeyOf(s)}（应 ${w}）`).join('；')}`
    )
  else console.log(`✓ 学科判定（${cases.length} 例）：${cases.map(([s, k]) => `${s}→${k}`).join(' ')}`)
}
for (const [key, label] of ASK_SUBJECTS) {
  const pack = packOf(label)
  for (const kind of SLIDE_KINDS) {
    for (const q of pack.pool(kind, '桂花雨')) {
      askChecked++
      if (!/[？?]$/.test(q)) badAsks.push(`${key}.${kind}「${q}」`)
    }
  }
}
if (badAsks.length) failures.push(`问句池里混进了祈使句（${badAsks.length} 处）：${badAsks.slice(0, 3).join('；')}`)
if (!/[？?]$/.test('三件事，能一件一件做完吗？')) failures.push('问句判据漏报正例：「三件事，能一件一件做完吗？」')
if (/[？?]$/.test('三件事，一件一件做')) failures.push('问句判据漏报反例：「三件事，一件一件做」')
console.log(
  `问句池：${ASK_SUBJECTS.length} 学科 × ${SLIDE_KINDS.length} 页型的每一句都带问号 → ${askChecked - badAsks.length}/${askChecked}`
)

/* --- 4.3 学生版备注硬判据（分母 = 该路径页数：内置稿 = m40 源 16 页，泛化例 = clip 10–14）：有问句、有「（停三秒）」、且紧贴问句（裁决二 + 本轮紧邻） --- */
for (const pd of perDocs) {
  const notes = pd.report.entries.filter((e) => /^slide#\d+\.notes$/.test(e.field))
  // 先钉「条数 = 页数」：notes 必须一页一条，少了就是漏写、多了就是编号串位
  if (notes.length !== pd.pages)
    failures.push(
      `${locate(pd, '', '')} ${pd.id} 学生版 notes 有 ${notes.length} 条，该路径实有 ${pd.pages} 页，应逐页各一条（后两列的分母，08 §B）`
    )
  /* 内置稿是 lesson m40 档的源（16 页实料，m20/m30 由 trimBuiltinTier 裁到 12/14），
     条数必须正好等于 m40 目标；泛化两例走 clip 档，仍落在三档并集 10–14。 */
  const bandOk = pd.generated
    ? inSlidesBand(pd.pages) && inSlidesBand(notes.length)
    : pd.pages === BUILTIN_TIER_PAGES.m40 && notes.length === BUILTIN_TIER_PAGES.m40
  if (!bandOk)
    failures.push(
      pd.generated
        ? `${locate(pd, '', '')} ${pd.id} 学生版 notes 有 ${notes.length} 条（该路径 ${pd.pages} 页），应落在 ${SLIDES_PAGES_RANGE.min}–${SLIDES_PAGES_RANGE.max} 页区间（后两列的分母，08 §B）`
        : `${locate(pd, '', '')} ${pd.id} 学生版 notes 有 ${notes.length} 条（该路径 ${pd.pages} 页），内置稿是 m40 档的源，应正好 ${BUILTIN_TIER_PAGES.m40} 页（m20/m30 由 trimBuiltinTier 裁）`
    )
  for (const e of notes) {
    const at = `${locate(pd, e.text, e.text)} ${pd.id} ${pageOf(e.field)}`
    if (!e.stats.hasQuestion) {
      failures.push(`${at} 备注没有问句（§D.1 classroom：每页备注至少带一个问句）｜${e.text}`)
    }
    if (!e.text.includes(PAUSE_MARK)) {
      failures.push(`${at} 问句后面没标「${PAUSE_MARK}」（§D.1 classroom：问句后标停顿，等学生答完再往下念）｜${e.text}`)
    } else {
      const loose = loosePauses(e.text)
      if (loose.length) {
        failures.push(
          `${at} 「${PAUSE_MARK}」没紧跟在问句后面（§D.1：只能贴在问句之后，允许多个问句只在最后一个后标）→ ${loose.join(' ／ ')}｜${e.text}`
        )
      }
    }
    const variants = (e.text.match(PAUSE_SHAPE) ?? []).filter((m) => m !== PAUSE_MARK)
    if (variants.length) {
      failures.push(`${at} 停顿写法不统一，出现变体 ${variants.join(' ')}，一律写成「${PAUSE_MARK}」｜${e.text}`)
    }
  }
}

/* --- 4.4 课堂称呼软上限 --- */
const softLines: string[] = []
for (const pd of perDocs) {
  const hit = SOFT_SUBJECTS.filter((s) => (pd.report.softSubjectCounts[s] ?? 0) > 0)
  softLines.push(
    `${pd.id}: ${hit.length ? hit.map((s) => `${s}×${pd.report.softSubjectCounts[s]}`).join(' ') : '无'}（合计 ${pd.report.softSubjectTotal}）`
  )
  for (const o of pd.report.softOverLimit) {
    warnings.push(`${pd.id} 课堂称呼「${o.subject}」出现 ${o.count} 次，超软上限 ${SOFT_SUBJECT_LIMIT} 次（§D.3 少用，只警告）`)
  }
}
console.log(`\n课堂称呼计数（软上限 每份每个 ≤${SOFT_SUBJECT_LIMIT} 次，超出只警告）`)
for (const l of softLines) console.log('  ' + l)

/* --- 4.4b 拆解页零件短标签 noteShort：同判定源、另账本（见头部纳入决定） --- */
const noteShortHits: string[] = []
for (const f of CUBE_FACES) {
  const hits = scanVoice(f.noteShort).hits
  if (hits.length) noteShortHits.push(`面「${f.name}」noteShort「${f.noteShort}」命中 ${hits.map((h) => h.label).join(' / ')}`)
}
if (noteShortHits.length) failures.push(...noteShortHits)
console.log(`\n拆解页 noteShort 扫描 ${CUBE_FACES.length} 条（src/data/anim.ts，网页浮出文本）：${noteShortHits.length ? '有命中 ✗' : '零命中 ✓'}`)

/* --- 4.5 三套档案的落点自检：注入文本里必须真的带上判定源 --- */
const promptChecks: string[] = []
for (const prof of VOICE_PROFILES) {
  promptChecks.push(`${prof.kind}(${prof.name}) 规则 ${prof.rules.length} 条 / 正反例 ${prof.examples.length} 组 / 单句 ≤${prof.maxSentenceChars} 字`)
}
console.log('\n三套语气档案（voice.ts）')
for (const l of promptChecks) console.log('  ' + l)

/* --- 4.6 答辩预案切片：命中已由 4.2 计入 failures，这里只打印落在问答槽的那一份 --- */
let defenseHits = 0
console.log('\n答辩预案（defense 槽，§D.1 第三套档案）——裁决一：与其他字段同一判定集，命中即 exit 1')
for (const d of DOCS) {
  const rep = scanVoiceDocs(defenseEntries(d))
  defenseHits += rep.problems.length
  console.log(
    `  ${d.id.padEnd(12)} 句式 ${patternIds.map((i) => rep.patternCounts[i]).join('/')} | 禁词 ${BANNED_WORD_TEXTS.map(
      (w) => rep.bannedCounts[w]
    ).join('/')} | 平均句长 ${rep.avgSentenceChars} | 最长句 ${rep.maxSentenceChars}（档案建议 ≤${VOICE_PROFILES.find((p) => p.kind === 'defense')?.maxSentenceChars}）`
  )
}

/* --- 4.7 有 Key 时扫生成结果（同结构文本） --- */
const apiKey = (process.env.YIKE_LLM_KEY ?? '').trim()
let generatedScanned = false
if (apiKey) {
  // llm.ts 用 window.setTimeout 做 120 秒超时，Node 侧补一个最小垫片，不引依赖
  ;(globalThis as unknown as { window: unknown }).window = {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
  const cfg: LLMConfig = {
    baseUrl: (process.env.YIKE_LLM_BASE ?? DEFAULT_CONFIG.baseUrl).trim(),
    apiKey,
    model: (process.env.YIKE_LLM_MODEL ?? DEFAULT_CONFIG.model).trim(),
  }
  const input = guihuaYu.meta
  try {
    const plan = await generatePlan(input, cfg)
    const sp = buildStudentSlidesPrompt(plan)
    const slides = normalizeSlides(await postChatJson([{ role: 'system', content: sp.system }, { role: 'user', content: sp.user }], cfg), plan)
    const doc: Doc = { id: 'generated', file: '', plan, slides }
    const rep = scanVoiceDocs(hardEntries(doc), { questionFields: /^slide#\d+\.notes$/ })
    generatedScanned = true
    console.log(
      `\n生成结果（YIKE_LLM_KEY 已配置）：句式 ${patternIds.map((i) => rep.patternCounts[i]).join('/')} | 禁词 ${BANNED_WORD_TEXTS.map(
        (w) => rep.bannedCounts[w]
      ).join('/')} | 平均句长 ${rep.avgSentenceChars} | 备注问句 ${rep.questionCovered}/${rep.questionTracked}`
    )
    for (const p of rep.problems) {
      failures.push(`生成结果 ${p.entry.field} 命中「${p.label}」→ ${p.matched}｜…${p.snippet}…`)
    }
  } catch (e) {
    warnings.push(`有 Key 但这一次生成没跑通，跳过生成结果扫描 —— ${e instanceof Error ? e.message : String(e)}`)
  }
} else {
  console.log('\n生成结果：未配置 YIKE_LLM_KEY，本轮只扫内置四篇 + 泛化两例的产物文本（不发任何网络请求）')
}

/* --- 4.8 判定源自检：该抓的一条不能漏，不该报的一条不能多 --- */

/** 反向用例的仓库版：四类句式与五个禁词都要有样本，省略号 / 换行 / 夹标点都要拓到 */
const MUST_HIT: [string, string[]][] = [
  ['本环节旨在通过反复朗读，使学生体会作者对故乡的思念之情。', ['本环节旨在', '通过……使学生']],
  ['所以这节课的重点不是算，而是建立空间观念。', ['bu-ershi']],
  ['这一段的读法不是齐读……而是分角色。', ['bu-ershi']],
  ['重点不是观察，\n而是把空间观念立起来。', ['bu-ershi']],
  ['宁可少讲一页，也要把这句话读透。', ['ningke-ye']],
  ['与其逐字翻译，不如先补背景。', ['yuqi-buru']],
  ['与其说这是写景，不如说是写心情。', ['yuqi-buru']],
  ['这一段落既有朗读，又有品味，还有情感落点。', ['paibi-3']],
  ['不仅能读通，而且能读懂，更能读出自己的看法。', ['paibi-3']],
  ['这节课充分体现了学生主体地位，有效提升核心素养。', ['充分体现了', '有效提升', '核心素养']],
]

/** 内置稿里真实存在的「像但不该报」的句子：倒装「而不是」、既…也…、通过…（不接使学生） */
const MUST_NOT_HIT: string[] = [
  '“同样多”是最容易判断的关系。先建立相等的符号，再用不等做对比，学生才能理解符号是关系的简写，而不是三个孤立的图案。',
  '一年级学生坐不住，所以我让每个结论都从手上出来，而不是从老师嘴里出来。',
  '它是三条棱的统称，必须先有棱的概念才讲得通。放最后既是收束，也是为下一节课的体积埋伏笔，长宽高决定大小。',
  '通过观察、触摸、搭建，经历从实物到图形的抽象过程，在数一数、量一量、搭一搭中发展空间观念。',
  '同学们，看老师手里：牙膏盒、粉笔盒，还有一个魔方。它们都是方的，可又不太一样。',
  '这节课怎么体现“以学生为主体”？',
]

let selfChecks = 0
for (const [text, expects] of MUST_HIT) {
  const s = scanVoice(text)
  const got = [
    ...FORBIDDEN_PATTERNS.filter((p) => (s.patternCounts[p.id] ?? 0) > 0).map((p) => p.id),
    ...BANNED_WORD_TEXTS.filter((w) => (s.bannedCounts[w] ?? 0) > 0),
  ]
  const miss = expects.filter((e) => !got.includes(e))
  selfChecks++
  if (miss.length) failures.push(`判定源漏报：「${text.slice(0, 24)}…」没抓到 ${miss.join(' / ')}（实际抓到 ${got.join(' / ') || '零'}）`)
}
for (const text of MUST_NOT_HIT) {
  const s = scanVoice(text)
  selfChecks++
  if (s.hits.length) {
    failures.push(`判定源误报：「${text.slice(0, 24)}…」被判 ${s.hits.map((h) => h.label).join(' / ')}`)
  }
}
console.log(
  `\n判定源自检 ${selfChecks} 例：该抓 ${MUST_HIT.length} 例（含省略号 / 换行 / 夹标点变体）+ 不该报 ${MUST_NOT_HIT.length} 例 → ${
    failures.length ? '有未过线 ✗' : '全部过线 ✓'
  }`
)

/* --- 4.8c 上屏短句三类口味自检：四字对偶 / 三连排比 / 动作流水账 --- */
const TASTE_HIT: [string, string][] = [
  ['重点讲透，难点绕开', '四字对偶'],
  ['目标明确，条理清晰', '四字对偶'],
  /* 问号不是免罪符：后半句没疑问词的 4+4 照样是口号 */
  ['目标明确，条理清晰？', '四字对偶'],
  ['通过圈画批注、想象画面、角色代入，品味细节', '三连排比'],
  ['出示桂花图片，播放一段短视频，提问：你闻到了什么？', '动作流水账'],
]
const TASTE_CLEAR: string[] = [
  '这一课从孩子的鼻子开始，先让他们闭着眼闻',
  '哪一处要多花时间，哪一处会卡住',
  '先看左边，再看右边',
  '摇桂花那一段，学生把动词一个个圈出来',
  /* 4+4 但后半句是真疑问词：这是一句能问出口的话，不是口号 */
  '这几个数，哪个最大？',
]
let tasteChecks = 0
for (const [text, expect] of TASTE_HIT) {
  tasteChecks++
  const got = tasteProblems(text)
  if (!got.some((g) => g.startsWith(expect))) {
    failures.push(`口味判据漏报：「${text}」没抓到 ${expect}（实际 ${got.join(' / ') || '零'}）`)
  }
}
for (const text of TASTE_CLEAR) {
  tasteChecks++
  const got = tasteProblems(text)
  if (got.length) failures.push(`口味判据误报：「${text}」被判 ${got.join(' / ')}`)
}
console.log(
  `口味判据自检 ${tasteChecks} 例：该抓 ${TASTE_HIT.length} 例 + 不该报 ${TASTE_CLEAR.length} 例 → ${failures.length ? '有未过线 ✗' : '全部过线 ✓'}`
)

/* --- 4.8b 紧邻判据自检：位置飘走的样本必须报，贴在问句后的不许报 --- */
const PAUSE_OK: string[] = [
  '哪个字最容易写错？（停三秒）先自己读三遍。',
  '“暖？”（停三秒）写的不是天气，是心情。',
  '一样吗？差在哪？（停三秒）差的是那段日子。',
  '你说是不是？（停三秒） 后面允许空白。',
]
const PAUSE_BAD: string[] = [
  '这个词很有画面感。（停三秒）你闻到过桂花香吗？',
  '先自己读三遍，再回答。哪个字最容易写错？容易写错的那个，（停三秒）举手的来说。',
  '三件事一件一件做（停三秒）第二件最难。',
]
let pauseChecks = 0
for (const t of PAUSE_OK) {
  pauseChecks++
  const bad = loosePauses(t)
  if (bad.length) failures.push(`紧邻判据误报：「${t.slice(0, 20)}…」被判位置飘走 → ${bad.join(' ／ ')}`)
}
for (const t of PAUSE_BAD) {
  pauseChecks++
  if (loosePauses(t).length === 0) failures.push(`紧邻判据漏报：「${t.slice(0, 20)}…」的「${PAUSE_MARK}」没贴在问句后却没报错`)
}
console.log(
  `紧邻判据自检 ${pauseChecks} 例：贴在问句后 ${PAUSE_OK.length} 例不许报 + 飘走 ${PAUSE_BAD.length} 例必须报 → ${
    failures.length ? '有未过线 ✗' : '全部过线 ✓'
  }`
)

/* --- 4.9 汇总 --- */
const totalPatterns = patternIds.reduce((a, id) => a + perDocs.reduce((s, pd) => s + pd.report.patternCounts[id], 0), 0)
const totalBanned = BANNED_WORD_TEXTS.reduce((a, w) => a + perDocs.reduce((s, pd) => s + pd.report.bannedCounts[w], 0), 0)
const allNotes = perDocs.reduce((a, pd) => a + pd.questionNotes, 0)
const allCovered = perDocs.reduce((a, pd) => a + pd.coveredNotes, 0)
const allPaused = perDocs.reduce((a, pd) => a + pd.pausedNotes, 0)
const chars = perDocs.reduce((a, pd) => a + visibleChars(pd.entries.map((e) => e.text).join('')), 0)

console.log(
  `\n硬扫描合计：产物条目 ${perDocs.reduce((a, pd) => a + pd.entries.length, 0)} 条 / ${chars} 字 | ` +
    `四类句式命中 ${totalPatterns} | 禁词命中 ${totalBanned} | 平均句长 ${Math.round((perDocs.reduce((a, pd) => a + pd.report.avgSentenceChars, 0) / perDocs.length) * 10) / 10} | ` +
    `学生版备注问句覆盖 ${allCovered}/${allNotes} | 「${PAUSE_MARK}」 ${allPaused}/${allNotes}（含紧邻判据） | defense 槽命中 ${defenseHits}（已计硬零）`
)
console.log(`无 Key 确定性：${generatedScanned ? '本轮带 Key，已附加生成结果扫描' : '本轮零网络请求'}`)

if (warnings.length) {
  console.log(`\n警告 ${warnings.length} 条（不影响退出码）：`)
  for (const w of warnings) console.log('  ! ' + w)
}
if (failures.length) {
  console.error(
    `\n✗ 语气硬不合格 ${failures.length} 处（§D.2 句式与禁词命中必须为 0；§D.1 备注问句与「${PAUSE_MARK}」紧邻合规必须 ${allNotes}/${allNotes}）：`
  )
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log(
  `\n✓ ${ALL_DOCS.length} 条路径（内置 ${DOCS.length} + 泛化 ${GENERIC_DOCS.length}）产物文本：${FORBIDDEN_PATTERNS.map((p, i) => `${patternShort[i]}=${perDocs.reduce((s, pd) => s + pd.report.patternCounts[p.id], 0)}`).join(' ')} | ${BANNED_WORD_TEXTS.map((w) => `${w}=${perDocs.reduce((s, pd) => s + pd.report.bannedCounts[w], 0)}`).join(' ')} | 备注问句 ${allCovered}/${allNotes} 「${PAUSE_MARK}」 ${allPaused}/${allNotes}`
)
