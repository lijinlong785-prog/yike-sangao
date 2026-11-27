import type { LessonPlan } from '../types'
import { postChatJson, type LLMConfig } from './llm'
import { LAYOUT_NAME, PAGE_LAYOUTS, type PageLayout } from './deck'
import {
  DEFAULT_THEME,
  MOTIFS,
  type DeckTheme,
  type Motif,
} from './theme'
import { alignScenes, sceneProblems } from './scene'
import { builtinScheme } from './builtinScheme'

/* ================================================================== *
 * AI 现场配色（TASKS 09 §十三 第 9 件）
 *
 * 上一版是按学科分死的六套主题：数学永远是方格、英语永远是松绿。问题不在
 * 那六套本身，而在于「配得对不对」根本没人判——模型连颜色都不许碰。
 *
 * 现在反过来：模型读完课文，交一份视觉方案（色板 + 纸面母题 + 每页版式 +
 * 每页场景），前端按数据渲染。但模型永远不直接定稿，这一份文件就是那道闸：
 *
 *   1. 四条硬约束（写死，不接受任何「这次特殊」）：
 *        · 纸只能落在两档里：浅纸 74–98% / 深纸 16–64%（明度，(max+min)/2）
 *          62–74% 是「泥色禁区」——那个区间既不是纸也不是板，投影上只是一片脏灰。
 *          上一版只准 80–97%，等于命令所有课都用同一张米白纸：古诗文、数学、
 *          英语出来一模一样，这是底色永远「肉色」的真因。
 *        · 彩度：浅纸 ≤ 34%、深纸 ≤ 55%（max−min/255；浅色区饱和度虚高，不用 HSL S）
 *        · 字与纸的对比度 ≥ 4.5:1          （WCAG AA，正文与强调字都要过；深纸就是反白）
 *        · 同一份里两两底色色差 ≥ 20       （RGB 欧氏距离；主纸 ↔ 封面纸）
 *   2. 学科红线：数学、英语课出现「宣纸印章」母题（seal / silk）直接判错。
 *   3. 出框自动打回重配：把不合格的原因原样写回提示词再要一次；
 *      第二次还出框，就落回兜底纸面并把原因带给界面——绝不让荧光紫上屏。
 *
 * 没有 Key：一次请求都不发，直接用 DEFAULT_THEME。
 * ================================================================== */

/* ------------------------------ 四条硬约束 ------------------------------ */

export const SCHEME_LIMITS = {
  /** 浅纸档：明度 74–98%，彩度 ≤ 34%（淡青、暖沙、藕白都在这一档） */
  lightPaperMin: 74,
  lightPaperMax: 98,
  lightPaperChromaMax: 34,
  /** 深纸档：明度 11–64%，彩度 ≤ 55%（墨绿、靛蓝、黑板绿都在这一档，正文反白） */
  darkPaperMin: 11,
  darkPaperMax: 64,
  darkPaperChromaMax: 55,
  /** 62–74% 是泥色禁区：既不是纸也不是板，投影上只是一片脏灰 */
  mudMin: 62,
  mudMax: 74,
  /** 字与纸的 WCAG 对比度下限 */
  contrastMin: 4.5,
  /** 同一份里两两底色的 RGB 欧氏距离下限 */
  surfaceGapMin: 20,
} as const

const HEX6 = /^#[0-9a-f]{6}$/

/** 归一化成小写 #rrggbb；不是六位色值就是 null（模型的越权一律不认） */
export function hex6(v: unknown): string | null {
  const raw = String(v ?? '').trim().toLowerCase()
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  return HEX6.test(withHash) ? withHash : null
}

export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(String(hex).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** HSL 明度 0–100（(max+min)/2）：判「还是不是一张纸」 */
export function lightness(hex: string): number {
  const [r, g, b] = rgbOf(hex)
  return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100
}

/** 彩度 0–100（max−min）：判「艳不艳」。浅色上 HSL 饱和度会虚高，这里不用它 */
export function chroma(hex: string): number {
  const [r, g, b] = rgbOf(hex)
  return ((Math.max(r, g, b) - Math.min(r, g, b)) / 255) * 100
}

/** RGB 欧氏距离：判「两块纸摆在一起肉眼看不看得出来」。441.7 = 最远 */
export function rgbDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgbOf(a)
  const [r2, g2, b2] = rgbOf(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

/** WCAG 相对亮度 */
function relLuminance(hex: string): number {
  const lin = rgbOf(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG 对比度 1–21 */
export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a)
  const lb = relLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 学科红线：这两门课不许出现「宣纸印章」那一类母题 */
const NO_STAMP_SUBJECT = /数学|英语|英文/
/** 方案名 / 说明里写了这些词，等同于选了宣纸印章 */
const STAMP_WORDS = /宣纸|印章|朱印|印泥|帘纹/

/**
 * 一份方案的四条硬约束。返回人话清单，空数组 = 合格。
 * 只判「数据」，不管学科——学科那一条在 subjectProblems 里，两者合起来才是完整闸门。
 */
export function schemeProblems(t: DeckTheme): string[] {
  const bad: string[] = []
  const {
    lightPaperMin,
    lightPaperMax,
    lightPaperChromaMax,
    darkPaperMin,
    darkPaperMax,
    darkPaperChromaMax,
    mudMin,
    mudMax,
    contrastMin,
    surfaceGapMin,
  } = SCHEME_LIMITS

  const papers: [string, string][] = [['主纸', t.paper]]
  if (t.coverPaper) papers.push(['封面纸', t.coverPaper])

  for (const [label, hex] of papers) {
    const light = lightness(hex)
    const ch = chroma(hex)
    const isLight = light >= lightPaperMin && light <= lightPaperMax
    const isDark = light >= darkPaperMin && light <= darkPaperMax
    if (!isLight && !isDark) {
      const why =
        light > mudMin && light < mudMax
          ? `${mudMin}–${mudMax}% 是泥色禁区，既不像纸也不像板，投影上是一片脏灰`
          : `要求浅纸 ${lightPaperMin}–${lightPaperMax}% 或深纸 ${darkPaperMin}–${darkPaperMax}%`
      bad.push(`${label} ${hex} 明度 ${light.toFixed(1)}%，${why}`)
    }
    const cap = isDark ? darkPaperChromaMax : lightPaperChromaMax
    if (ch > cap) {
      bad.push(`${label} ${hex} 彩度 ${ch.toFixed(1)}%，要求 ≤ ${cap}%（${isDark ? '深纸' : '浅纸'}档）`)
    }
  }

  // 两两底色：只有主纸与封面纸两张「页底」，它们必须一眼分得出
  if (t.coverPaper) {
    const gap = rgbDistance(t.paper, t.coverPaper)
    if (gap < surfaceGapMin) {
      bad.push(`主纸与封面纸色差 ${gap.toFixed(1)}，要求 ≥ ${surfaceGapMin}（两张纸看不出区别就等于只有一张）`)
    }
  }

  // 要上纸的字：正文（ink）、次级字（inkSoft）、点缀字（accent）都得过 AA
  const onPaper: [string, string][] = [
    ['正文', t.ink],
    ['次级字', t.inkSoft],
    ['强调色', t.accent],
  ]
  for (const [label, hex] of onPaper) {
    const c = contrastRatio(hex, t.paper)
    if (c < contrastMin) {
      bad.push(`${label} ${hex} 对纸的对比度 ${c.toFixed(2)}:1，要求 ≥ ${contrastMin}:1`)
    }
  }

  // 结构关系：深纸更暗、纸线在中间、强调色不能和纸撞
  if (lightness(t.paperDeep) >= lightness(t.paper)) {
    bad.push(`纸深 ${lightness(t.paperDeep).toFixed(1)}% 没有比主纸 ${lightness(t.paper).toFixed(1)}% 更暗`)
  }
  if (t.accent === t.paper || t.accent === t.ink) bad.push('强调色与主纸 / 正文撞色')
  if (!MOTIFS.includes(t.motif)) bad.push(`纸面母题 ${String(t.motif)} 不在允许的五种里`)
  if (![1, 2].includes(t.ruleWidth)) bad.push(`分隔线 ${t.ruleWidth}px，只能是 1 或 2`)
  if (!/serif$/.test(t.serif) || /sans-serif/.test(t.serif)) bad.push('大标题字体栈不是衬线')
  if (!/sans-serif$/.test(t.sans)) bad.push('正文字体栈不是无衬线')
  return bad
}

/** 学科红线：数学 / 英语课不许出现宣纸印章 */
export function subjectProblems(t: DeckTheme, subject: string): string[] {
  if (!NO_STAMP_SUBJECT.test(String(subject ?? ''))) return []
  const bad: string[] = []
  if (t.motif === 'seal' || t.motif === 'silk') {
    bad.push(`${subject}课不许用宣纸${t.motif === 'seal' ? '印章' : '帘纹'}母题（motif=${t.motif}）`)
  }
  const words = `${t.name}${t.note ?? ''}`
  const hit = words.match(STAMP_WORDS)
  if (hit) bad.push(`${subject}课不许出现「${hit[0]}」这类宣纸印章的说法（方案名/说明里写了）`)
  return bad
}

/** 四条硬约束 + 学科红线，一起判 */
export function schemeIssues(t: DeckTheme, subject: string): string[] {
  return [...schemeProblems(t), ...subjectProblems(t, subject)]
}

/* ------------------------------ 兜底与对齐 ------------------------------ */

/** 一份方案的版式表按页数对齐：多的截掉，少的留空（deck.ts 会按页型补） */
export function alignLayouts(
  layouts: readonly PageLayout[] | undefined,
  total: number
): (PageLayout | undefined)[] {
  return Array.from({ length: Math.max(0, total) }, (_, i) => layouts?.[i])
}

/* ------------------------------ 问模型 ------------------------------ */

export interface SchemePageBrief {
  /** 1 起 */
  index: number
  kind: string
  title: string
}

const LAYOUT_HINT = PAGE_LAYOUTS.map((l) => `${l}=${LAYOUT_NAME[l]}`).join('、')

export function schemePrompt(
  plan: LessonPlan,
  pages: SchemePageBrief[],
  rejected?: string[]
): { system: string; user: string } {
  const subject = String(plan.meta.subject ?? '')
  const noStamp = NO_STAMP_SUBJECT.test(subject)

  const system = [
    '你是给中小学幻灯片配纸面的美术指导。先读课文，再给一份「视觉方案」。',
    '只输出一个 JSON 对象，不要代码围栏，不要解释文字。字段固定：',
    '{"name":"纸的名字，2-4 个汉字","note":"一句话说为什么这样配，≤28 字",',
    ' "motif":"plain|lines|dots|silk|seal",',
    ' "paper":"#rrggbb","coverPaper":"#rrggbb","paperDeep":"#rrggbb","paperLine":"#rrggbb",',
    ' "ink":"#rrggbb","inkSoft":"#rrggbb","accent":"#rrggbb","accentSoft":"#rrggbb",',
    ' "ruleWidth":1,"layouts":["full","cards",...],"scenes":["petals","",...]}',
    '',
    '硬约束（任何一条出框，这份方案会被直接退回重配）：',
    `1. paper 与 coverPaper 的明度 (max+min)/2 只有两档可选：浅纸 ${SCHEME_LIMITS.lightPaperMin}%–${SCHEME_LIMITS.lightPaperMax}%（彩度 ≤ ${SCHEME_LIMITS.lightPaperChromaMax}%），或深纸 ${SCHEME_LIMITS.darkPaperMin}%–${SCHEME_LIMITS.darkPaperMax}%（彩度 ≤ ${SCHEME_LIMITS.darkPaperChromaMax}%，字用浅色反白）。${SCHEME_LIMITS.mudMin}%–${SCHEME_LIMITS.mudMax}% 是泥色禁区，落进去直接退回。`,
    '   深纸不是例外，是另一档：古诗文可以墨绿，数学可以黑板绿，英语可以深靛；同一天不要两份都用浅纸。',
    `2. paper 与 coverPaper 的 RGB 欧氏距离不少于 ${SCHEME_LIMITS.surfaceGapMin}，两张纸必须一眼分得出。`,
    `3. ink、inkSoft、accent 对 paper 的对比度都不低于 ${SCHEME_LIMITS.contrastMin}:1。`,
    '4. paperDeep 比 paper 更暗；paperLine 是分隔线，比 paper 暗一档。',
    '5. 一份方案只有两张纸：一张主纸（所有页）、一张封面纸（封面）。不许每页换底色。',
    `6. layouts 的条数必须等于页数，每个值只能取：${LAYOUT_HINT}。整份至少三种，每 5 页至少一次 full。`,
    '7. scenes 的条数也必须等于页数，每个值只能取 petals（花瓣、落花、落叶）、snow（雪）、rain（雨）或 ""（留白）。',
    '   只有课文里真的写到那个物才填；抽不到具体的物就填 ""。至少留一页 ""，不许页页都动。',
    '8. 颜色要跟着课文走：写海就给咸味的蓝灰，写秋叶就给晒过的土黄；不要用荧光色、不要渐变。',
    '9. 只给色值，不要字体名、不要滤镜、不要图片。',
  ].join('\n')

  const mood = [
    plan.objectives?.emotion ? `情感目标：${plan.objectives.emotion}` : '',
    plan.keyPoint ? `重点：${plan.keyPoint}` : '',
    plan.hardPoint ? `难点：${plan.hardPoint}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const user = [
    `课文：《${plan.meta.topic}》（${plan.meta.stage}${plan.meta.grade}·${subject}·${plan.meta.period}）`,
    mood,
    '',
    `这一叠共 ${pages.length} 页，layouts 要按这个顺序给 ${pages.length} 条：`,
    ...pages.map((p) => `${p.index}. ${p.title}（${p.kind}）`),
    '',
    noStamp
      ? `${subject}课：motif 只能填 plain / lines / dots。宣纸、印章、帘纹一律不许出现在这份方案里。`
      : '母题自己按课文挑：抽不到具体的物就填 plain，不要硬套。',
    ...(rejected && rejected.length
      ? ['', '上一版被退回，原因是：', ...rejected.map((r) => `· ${r}`), '请按上面的硬约束重配。']
      : []),
  ]
    .filter((s) => s !== '')
    .join('\n')

  return { system, user }
}

/* ------------------------------ 洗模型交回的方案 ------------------------------ */

const COLOR_FIELDS = [
  ['paper', '主纸'],
  ['coverPaper', '封面纸'],
  ['paperDeep', '纸深'],
  ['paperLine', '纸线'],
  ['ink', '正文'],
  ['inkSoft', '次级字'],
  ['accent', '强调色'],
  ['accentSoft', '强调淡底'],
] as const

function cleanName(v: unknown, fallback: string): string {
  const s = String(v ?? '')
    .replace(/[《》#<>"'`]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 6)
  return s || fallback
}

function cleanNote(v: unknown): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function cleanLayouts(v: unknown, total: number): PageLayout[] {
  if (!Array.isArray(v)) return []
  const out: PageLayout[] = []
  for (let i = 0; i < Math.min(total, v.length); i++) {
    const s = String(v[i] ?? '').trim()
    if ((PAGE_LAYOUTS as readonly string[]).includes(s)) out.push(s as PageLayout)
    else out.push(undefined as unknown as PageLayout)
  }
  return out
}

export interface ParsedScheme {
  /** 色值齐、形状对才有；否则 null */
  theme: DeckTheme | null
  /** 越界与缺项，原样喂回下一轮提示词 */
  problems: string[]
}

/**
 * 把模型交回的 JSON 洗成一份方案。
 * 洗不动（缺色、非六位色值、越界）就带问题清单回去——这一份不采用。
 * 洗得动但违反硬约束，也带问题清单回去——这就是「出框自动打回重配」。
 */
export function schemeFromJSON(raw: unknown, subject: string, total: number): ParsedScheme {
  const d = (raw ?? {}) as Record<string, unknown>
  const problems: string[] = []
  const colors: Record<string, string> = {}

  for (const [key, label] of COLOR_FIELDS) {
    const hex = hex6(d[key])
    if (!hex) {
      // 封面纸可以没有（一份方案只给一张纸也是合法的）
      if (key === 'coverPaper' && !d[key]) continue
      problems.push(`${label} ${String(d[key] ?? '（没给）')} 不是六位色值 #rrggbb`)
      continue
    }
    colors[key] = hex
  }

  const motif = String(d.motif ?? 'plain').trim().toLowerCase()
  const theme: DeckTheme = {
    id: `ai:${colors.paper ?? 'none'}`,
    name: cleanName(d.name, '现场配色'),
    paper: colors.paper ?? DEFAULT_THEME.paper,
    ...(colors.coverPaper ? { coverPaper: colors.coverPaper } : {}),
    paperDeep: colors.paperDeep ?? DEFAULT_THEME.paperDeep,
    paperLine: colors.paperLine ?? DEFAULT_THEME.paperLine,
    ink: colors.ink ?? DEFAULT_THEME.ink,
    inkSoft: colors.inkSoft ?? DEFAULT_THEME.inkSoft,
    accent: colors.accent ?? DEFAULT_THEME.accent,
    accentSoft: colors.accentSoft ?? DEFAULT_THEME.accentSoft,
    serif: DEFAULT_THEME.serif,
    sans: DEFAULT_THEME.sans,
    motif: (MOTIFS as readonly string[]).includes(motif) ? (motif as Motif) : 'plain',
    ruleWidth: d.ruleWidth === 2 ? 2 : 1,
    layouts: cleanLayouts(d.layouts, total),
    // 场景只认三种，其余一律留白（模型写「枫叶」「烟花」不会被硬塞成花瓣）
    scenes: alignScenes(Array.isArray(d.scenes) ? (d.scenes as (string | undefined)[]) : undefined, total),
    note: cleanNote(d.note),
    source: 'ai',
  }

  if (problems.length) return { theme: null, problems }
  // 场景与纸面一起判：「页页都动」与色值出框同属「这份方案不采用」
  problems.push(...sceneProblems(theme.scenes ?? []))
  if (problems.length) return { theme: null, problems }
  const issues = schemeIssues(theme, subject)
  return issues.length ? { theme: null, problems: issues } : { theme, problems: [] }
}

/* ------------------------------ 一条龙：问 → 判 → 打回 → 兜底 ------------------------------ */

export interface SchemeReport {
  theme: DeckTheme
  source: 'ai' | 'builtin'
  /** 最后一轮被退回的原因（source=builtin 时就是给用户看的人话） */
  problems: string[]
  /** 实际发了几次请求：0 = 没 Key；1 = 一次过；2 = 打回过一次 */
  attempts: number
  reason?: string
}

/**
 * 取这一节课的纸面。
 * 不许再看「浏览器里有没有 key」：落点由 endpointOf() 裁决，没 key 走同源代理照样问模型。
 *   · 最多问两次。第一次出框 → 把问题原样写回提示词要一次；
 *   · 第二次仍出框 / 接口全挂 → 落回兜底并把问题清单一并带回界面（不静默改色）。
 */
export async function resolveScheme(input: {
  plan: LessonPlan
  pages: SchemePageBrief[]
  cfg: LLMConfig
  signal?: AbortSignal
}): Promise<SchemeReport> {
  const { plan, pages, cfg, signal } = input
  const subject = String(plan.meta.subject ?? '')
  // 兜底纸永远先算好：按课文现配一份（认意象 → 挑纸 → 排版式 → 落场景），
  // 与模型那条路同一个形状，界面与导出都吃这一份，模型全挂时就是这门课的纸。
  const offline = builtinScheme(plan, pages)

  let problems: string[] = []
  let used = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    used = attempt
    const { system, user } = schemePrompt(plan, pages, problems)
    try {
      const raw = await postChatJson(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        cfg,
        signal,
        0
      )
      const parsed = schemeFromJSON(raw, subject, pages.length)
      if (parsed.theme) {
        return { theme: parsed.theme, source: 'ai', problems: [], attempts: attempt }
      }
      problems = parsed.problems
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
      if (/abort/i.test(msg)) {
        return {
          theme: offline.theme,
          source: 'builtin',
          problems,
          attempts: attempt,
          reason: `取色被取消了，用的是本课兜底纸面「${offline.theme.name}」。`,
        }
      }
      problems = [msg || '接口没有回话']
      // 网络层失败不值得再问一次：第二次大概率还是同一个错
      break
    }
  }

  return {
    theme: offline.theme,
    source: 'builtin',
    problems,
    attempts: used,
    reason: `模型给的方案出框：${problems[0] ?? '原因不明'}。已换成本课兜底纸面「${offline.theme.name}」。`,
  }
}