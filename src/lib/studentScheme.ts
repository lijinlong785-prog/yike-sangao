/**
 * 学生版那一套纸（TASKS/12）。
 *
 * 一句话说明白这里为什么存在：一份教案要出两样东西——课件是「文档」，给评课的人
 * 翻着看；课堂 PPT 是「投影」，要给后排学生看见。一份纸伺候不了两个场景：
 * 课件偏素，PPT 偏闷，看起来就是「同一份东西换了个版式」。
 *
 * 所以课件纸仍由 scheme.ts 的第一遍配，这里只负责第二遍：拿到课件纸之后，
 * 再问模型给学生版另配一套，并保证它与课件纸**肉眼分得出**。
 *
 * 四道闸（破一条就退回重配，两次还不行就走派生纸）：
 *   1. 与课件纸的 RGB 欧氏距离 ≥ 40，且明度档不同（一浅一深）或色相相差 ≥ 40°；
 *   2. 正文 ink 对 paper 对比 ≥ 7:1（投影距离上 4.5 看着就是灰的）；
 *   3. paperLine 对 paper 对比 ≥ 1.6:1（浅灰细线在投影上等于没画）；
 *   4. SCHEME_LIMITS 照样过（明度两档、泥色禁区、彩度、两纸色差 ≥ 20）。
 *
 * 失败一律无声：不弹提示、不加文案、不重试三次——第一帧就在屏幕上的派生纸
 * （deriveStudentTheme）顶上，它同样满足上面四条，而且绝不回 DEFAULT_THEME。
 */
import type { LessonPlan } from '../types'
import { postChatJson, type LLMConfig } from './llm'
import { DEFAULT_THEME, MOTIFS, type DeckTheme, type Motif } from './theme'
import {
  chroma,
  contrastRatio,
  hex6,
  lightness,
  rgbDistance,
  rgbOf,
  schemeProblems,
  subjectProblems,
  type SchemePageBrief,
} from './scheme'

/* ------------------------------ 学生版的四条闸 ------------------------------ */

export const STUDENT_LIMITS = {
  /** 与课件纸的 RGB 欧氏距离：现有 surfaceGapMin 是 20，学生版要两倍 */
  gapMin: 40,
  /** 明度档不同，或色相相差（度）——两者至少满足其一 */
  hueGapMin: 40,
  /** 正文对比：课件 4.5，投影要 7 */
  inkContrastMin: 7,
  /** 分隔线对纸的对比：浅灰细线在投影上等于没画 */
  lineContrastMin: 1.6,
} as const

/* ------------------------------ 颜色小工具 ------------------------------ */

/** FNV-1a：派生纸要「同一份教案永远同一套色」，所以只吃字符串，不吃 Math.random */
function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 色相 0–360 */
function hueOf(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  if (d === 0) return 0
  const raw = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (raw * 60 + 360) % 360
}

/** 两个色相的夹角（0–180）：判「是不是同一族的颜色」 */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** HSL → #rrggbb（s、l 都是 0–1） */
function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + hh / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
  }
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

/**
 * 固定色相与彩度，从 from 起按 dir 逐步走，直到「对 paper 的对比 ≥ target」。
 * 深浅两个方向共用：深纸上的 ink 往亮走，浅纸上的 ink 往暗走。
 */
function solveLightness(
  h: number,
  s: number,
  paper: string,
  target: number,
  from: number,
  dir: 1 | -1,
  chromaMax = 100
): string {
  let l = from
  for (let i = 0; i < 100; i++) {
    const hex = hslToHex(h, s, l)
    if (contrastRatio(hex, paper) >= target && chroma(hex) <= chromaMax) return hex
    l += dir * 0.01
    if (l <= 0.01 || l >= 0.99) break
  }
  return hslToHex(h, s, Math.max(0.02, Math.min(0.98, l)))
}

/**
 * 封面纸：必须在「明度档」里（浅 74–98 / 深 11–64，62–74 是泥色禁区），
 * 又要和主纸差 ≥ 40。先在同档内换色相与彩度，凑不够就整档翻过去——
 * 浅纸配深封面、深纸配浅封面，这是最后一步，不许留一张等于主纸的封面。
 */
function coverFor(paperH: number, paperS: number, paperL: number, band: 'light' | 'dark', paper: string): string {
  const tries =
    band === 'light'
      ? [
          { dh: 18, ds: 0.16, dl: -0.06 },
          { dh: -18, ds: 0.14, dl: -0.05 },
          { dh: 30, ds: 0.18, dl: 0.06 },
          { dh: 0, ds: 0.2, dl: 0.09 },
        ]
      : [
          { dh: 14, ds: 0.1, dl: 0.2 },
          { dh: -14, ds: 0.12, dl: 0.16 },
          { dh: 24, ds: 0.14, dl: 0.24 },
        ]
  const lo = band === 'light' ? 0.75 : 0.12
  const hi = band === 'light' ? 0.97 : 0.62
  let best = paper
  let bestGap = 0
  for (const t of tries) {
    const l = Math.max(lo, Math.min(hi, paperL + t.dl))
    const hex = hslToHex(paperH + t.dh, Math.max(0.02, Math.min(0.5, paperS + t.ds)), l)
    const gap = rgbDistance(hex, paper)
    if (gap > bestGap) {
      best = hex
      bestGap = gap
    }
  }
  if (bestGap < STUDENT_LIMITS.gapMin + 5) {
    const alt = hslToHex(paperH + 10, Math.min(0.3, paperS + 0.1), band === 'light' ? 0.56 : 0.9)
    if (rgbDistance(alt, paper) > bestGap) return alt
  }
  return best
}

/** 白字压在这张深纸上最多能到几比一：上不去就不是「够深的那张纸」 */
function maxContrast(paper: string): number {
  return contrastRatio('#ffffff', paper)
}

/* ------------------------------ 派生兜底 ------------------------------ */

/**
 * 派生兜底：翻转明度档，色相只在同一头偏 45°，保证 RGB 距离 ≥ 40。
 *   浅纸 → 深纸：明度压到 26–31%（再高就压不住 7:1），ink 反白，accent 提到亮头；
 *   深纸 → 浅纸：明度抬到 90% 上下，ink 回到近黑但不是纯黑。
 * 强调色跟课件那支笔（同一个色相）：以前取「纸色 + 150°」，桂花课于是配出一张
 * 深绿纸加一支淡紫笔，投影上就是「紫字绿底」——用户说的「颜色不对」就是这一套。
 * paperDeep / paperLine / inkSoft / accentSoft 一起重算——只改 paper 等于把这张纸弄坏。
 */
export function deriveStudentTheme(lesson: DeckTheme, topic = ''): DeckTheme {
  const seed = seedOf(`${topic}|${lesson.id}|${lesson.paper}`)
  const lessonHue = hueOf(lesson.paper)
  const lessonChroma = chroma(lesson.paper) / 100
  const lessonAccentL = lightness(lesson.accent) / 100
  const accentH = hueOf(lesson.accent)
  const accentS = Math.max(0.2, Math.min(0.7, chroma(lesson.accent) / 100 + 0.06))
  const toDark = lightness(lesson.paper) >= 50

  /* 学生纸与课件纸要隔着四十的色差，但「不一样」不等于「换一个色系」（TASKS/25）：
     只在课件纸的同一头再走 45°（暖纸往赭走、冷纸往青走），色差交给明度档去拉。 */
  const step = lessonHue <= 90 || lessonHue >= 300 ? -45 : 45
  const h = (lessonHue + step + 360) % 360
  const s = Math.max(0.12, Math.min(0.26, lessonChroma * 0.8 + 0.12))

  if (toDark) {
    let paperL = 0.26 + ((seed >> 3) % 4) * 0.012
    let paper = hslToHex(h, s, paperL)
    // 黄味重的深纸压不住 7:1：往暗里退两档，退到能压住为止
    for (let i = 0; i < 8 && maxContrast(paper) < STUDENT_LIMITS.inkContrastMin + 0.4; i++) {
      paperL -= 0.015
      paper = hslToHex(h, s, paperL)
    }
    const ink = solveLightness(h, 0.1, paper, STUDENT_LIMITS.inkContrastMin + 0.8, 0.8, 1)
    const inkSoft = solveLightness(h, 0.1, paper, 4.8, 0.6, 1)
    const accent = solveLightness(accentH, accentS, paper, 5, Math.max(0.5, lessonAccentL), 1, 60)
    return {
      id: `student:${paper}`,
      name: '夜墨',
      paper,
      coverPaper: coverFor(h, s, paperL, 'dark', paper),
      paperDeep: hslToHex(h, s * 0.9, paperL - 0.05),
      // 深纸上分隔线要比纸亮（暗底细线往暗走等于没画）
      paperLine: solveLightness(h, s * 0.7, paper, 1.8, paperL + 0.02, 1),
      ink,
      inkSoft,
      accent,
      accentSoft: hslToHex(accentH, 0.3, Math.min(0.55, paperL + 0.1)),
      serif: DEFAULT_THEME.serif,
      sans: DEFAULT_THEME.sans,
      motif: 'plain',
      ruleWidth: 1,
      note: '和课件同一套墨，翻到深档投影；强调色还是那支笔。',
      source: 'builtin',
    }
  }

  /* 深纸课件 → 浅纸学生版：纸往亮头走，ink 往暗头走，强调色压到能压在纸上 */
  let paperL = 0.9
  let paper = hslToHex(h, s, paperL)
  // 与课件纸的距离不够就继续压暗，最低 76%（再往下就进了 62–74% 的泥色禁区）
  for (let i = 0; i < 14 && rgbDistance(paper, lesson.paper) < STUDENT_LIMITS.gapMin + 2 && paperL > 0.76; i++) {
    paperL = Number((paperL - 0.01).toFixed(4))
    paper = hslToHex(h, s, paperL)
  }
  return {
    id: `student:${paper}`,
    name: '素纸',
    paper,
    coverPaper: coverFor(h, s, paperL, 'light', paper),
    paperDeep: hslToHex(h, s, Math.max(0.7, paperL - 0.07)),
    paperLine: solveLightness(h, s * 0.8, paper, 1.75, paperL - 0.02, -1),
    ink: solveLightness(h, 0.12, paper, STUDENT_LIMITS.inkContrastMin + 1, 0.16, -1),
    inkSoft: solveLightness(h, 0.1, paper, 4.8, 0.4, -1),
    accent: solveLightness(accentH, accentS, paper, 5, Math.min(0.5, lessonAccentL), -1, 60),
    accentSoft: hslToHex(accentH, 0.3, Math.max(0.4, paperL - 0.1)),
    serif: DEFAULT_THEME.serif,
    sans: DEFAULT_THEME.sans,
    motif: 'plain',
    ruleWidth: 1,
    note: '同一套墨换到亮纸上，投影更亮；强调色还是课件那支笔。',
    source: 'builtin',
  }
}

/* ------------------------------ 判一份学生纸 ------------------------------ */

/** 这套纸「为什么不能给学生版用」，空数组 = 合格 */
export function studentSchemeProblems(t: DeckTheme, lesson: DeckTheme): string[] {
  const bad = [...schemeProblems(t)]
  const gap = rgbDistance(t.paper, lesson.paper)
  if (gap < STUDENT_LIMITS.gapMin) {
    bad.push(
      `学生纸 ${t.paper} 与课件纸 ${lesson.paper} 色差 ${gap.toFixed(1)}，要求 ≥ ${STUDENT_LIMITS.gapMin}（两套纸必须一眼分得出）`
    )
  }
  const lessonLight = lightness(lesson.paper) >= 50
  const studentLight = lightness(t.paper) >= 50
  const hue = hueGap(hueOf(t.paper), hueOf(lesson.paper))
  if (lessonLight === studentLight && hue < STUDENT_LIMITS.hueGapMin) {
    bad.push(
      `学生纸与课件纸同属${studentLight ? '浅' : '深'}纸档，色相只差 ${hue.toFixed(0)}°，要求明度档不同或色相差 ≥ ${STUDENT_LIMITS.hueGapMin}°`
    )
  }
  const ink = contrastRatio(t.ink, t.paper)
  if (ink < STUDENT_LIMITS.inkContrastMin) {
    bad.push(`正文 ${t.ink} 对学生纸的对比 ${ink.toFixed(2)}:1，要求 ≥ ${STUDENT_LIMITS.inkContrastMin}:1（投影不是打印）`)
  }
  const line = contrastRatio(t.paperLine, t.paper)
  if (line < STUDENT_LIMITS.lineContrastMin) {
    bad.push(`分隔线 ${t.paperLine} 对学生纸的对比 ${line.toFixed(2)}:1，要求 ≥ ${STUDENT_LIMITS.lineContrastMin}:1`)
  }
  return bad
}

/* ------------------------------ 问模型 ------------------------------ */

/** 把一张纸翻成人话：模型不知道「要避开什么」就必然又配出一张米色 */
function paperWords(hex: string): string {
  const l = lightness(hex)
  const c = chroma(hex)
  const h = hueOf(hex)
  const tone = l >= 74 ? '浅纸' : l <= 64 ? '深纸' : '中间调（泥色禁区附近）'
  const warm = c < 6 ? '近中性' : h < 60 || h >= 320 ? '偏暖' : h < 200 ? '偏冷' : '偏冷绿'
  return `${hex}（${tone}、明度 ${l.toFixed(0)}%、${warm}）`
}

export function studentSchemePrompt(
  plan: LessonPlan,
  pages: SchemePageBrief[],
  lessonTheme: DeckTheme,
  rejected?: string[]
): { system: string; user: string } {
  const system = [
    '你是给中小学课堂投影配纸面的美术指导。这一套是给学生投影看的，不是给老师打印的。',
    '字要大、对比要狠、装饰要少。必须和老师那份明显不同。',
    '只输出一个 JSON 对象，不要代码围栏，不要解释文字。字段固定：',
    '{"name":"纸的名字，2-4 个汉字","note":"一句话说为什么这样配，≤28 字",',
    ' "motif":"plain|lines|dots|silk|seal",',
    ' "paper":"#rrggbb","coverPaper":"#rrggbb","paperDeep":"#rrggbb","paperLine":"#rrggbb",',
    ' "ink":"#rrggbb","inkSoft":"#rrggbb","accent":"#rrggbb","accentSoft":"#rrggbb"}',
    '',
    '硬约束（任何一条出框，这份方案会被直接退回重配）：',
    `1. paper 与 coverPaper 的明度 (max+min)/2 只有两档：浅纸 74%–98%（彩度 ≤ 34%），或深纸 11%–64%（彩度 ≤ 55%，字用浅色反白）。62%–74% 是泥色禁区，落进去直接退回。`,
    `2. 学生纸必须和老师那份明显不同：与老师纸的 RGB 欧氏距离 ≥ ${STUDENT_LIMITS.gapMin}，并且明度档不同（一浅一深）或色相相差 ≥ ${STUDENT_LIMITS.hueGapMin}°。`,
    `3. ink 对 paper 的对比度 ≥ ${STUDENT_LIMITS.inkContrastMin}:1（投影距离上 4.5 看着就是灰的）；inkSoft、accent 也要 ≥ 4.5:1。`,
    `4. paperLine 对 paper 的对比度 ≥ ${STUDENT_LIMITS.lineContrastMin}:1。`,
    '5. paperDeep 比 paper 更暗；一份只有两张纸：一张主纸（所有页）、一张封面纸（封面），不许每页换底色。',
    '6. 颜色跟着课文走：写海给咸味的蓝灰，写秋叶给晒过的土黄；不要荧光色、不要渐变。',
    '7. 这一遍只管纸：不许交 layouts / scenes，也不许改页序。',
  ].join('\n')

  const mood = [
    plan.objectives?.emotion ? `情感目标：${plan.objectives.emotion}` : '',
    plan.keyPoint ? `重点：${plan.keyPoint}` : '',
    plan.hardPoint ? `难点：${plan.hardPoint}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const user = [
    `课文：《${plan.meta.topic}》（${plan.meta.stage}${plan.meta.grade}·${plan.meta.subject ?? ''}·${plan.meta.period}）`,
    mood,
    '',
    `这一叠共 ${pages.length} 页：`,
    ...pages.map((p) => `${p.index}. ${p.title}（${p.kind}）`),
    '',
    '老师那份（课件）已经定了，你要避开它：',
    `· 主纸 ${paperWords(lessonTheme.paper)}`,
    `· 封面纸 ${paperWords(lessonTheme.coverPaper ?? lessonTheme.paper)}`,
    `· 正文 ${lessonTheme.ink}，强调 ${lessonTheme.accent}`,
    `· 纸名「${lessonTheme.name}」`,
    '学生版要另配一套：要么翻到另一档（老师浅你就深、老师深你就浅），要么把色相拉开 ≥ 40°。',
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

function cleanName(v: unknown): string {
  return (
    String(v ?? '')
      .replace(/[《》#<>"'`]/g, '')
      .replace(/\s+/g, '')
      .slice(0, 6) || '学生纸'
  )
}

function cleanNote(v: unknown): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

export interface ParsedStudentScheme {
  theme: DeckTheme | null
  problems: string[]
}

/** 洗一份学生纸：色值不全 / 出框 / 和课件纸撞车，都带问题清单退回 */
export function studentFromJSON(raw: unknown, plan: LessonPlan, lesson: DeckTheme): ParsedStudentScheme {
  const d = (raw ?? {}) as Record<string, unknown>
  const problems: string[] = []
  const colors: Record<string, string> = {}
  for (const [key, label] of COLOR_FIELDS) {
    const hex = hex6(d[key])
    if (!hex) {
      if (key === 'coverPaper' && !d[key]) continue
      problems.push(`${label} ${String(d[key] ?? '（没给）')} 不是六位色值 #rrggbb`)
      continue
    }
    colors[key] = hex
  }
  if (problems.length) return { theme: null, problems }

  const motif = String(d.motif ?? 'plain').trim().toLowerCase()
  const theme: DeckTheme = {
    id: `student:${colors.paper}`,
    name: cleanName(d.name),
    paper: colors.paper,
    ...(colors.coverPaper ? { coverPaper: colors.coverPaper } : {}),
    paperDeep: colors.paperDeep,
    paperLine: colors.paperLine,
    ink: colors.ink,
    inkSoft: colors.inkSoft,
    accent: colors.accent,
    accentSoft: colors.accentSoft,
    serif: DEFAULT_THEME.serif,
    sans: DEFAULT_THEME.sans,
    motif: (MOTIFS as readonly string[]).includes(motif) ? (motif as Motif) : 'plain',
    ruleWidth: d.ruleWidth === 2 ? 2 : 1,
    note: cleanNote(d.note),
    source: 'ai',
  }
  // 版式与场景一个都不许带：这一遍只管纸（TASKS/12 §三）
  const issues = [...studentSchemeProblems(theme, lesson), ...subjectProblems(theme, String(plan.meta.subject ?? ''))]
  return issues.length ? { theme: null, problems: issues } : { theme, problems: [] }
}

/* ------------------------------ 一条龙 ------------------------------ */

export interface StudentSchemeReport {
  theme: DeckTheme
  source: 'ai' | 'derived'
  /** 只给日志与自检看：界面上永远不出现半句话 */
  reason: string
}

/**
 * 取学生版这一套纸。输入必须带课件纸——模型不知道「要避开什么」就必然配出相近的米色。
 * 不许再看「浏览器里有没有 key」：落点由 endpointOf() 裁决，没 key 走同源代理照样问模型。
 *   · 最多问两次，出框就把问题清单写回提示词；
 *   · 仍然不行：静默落回派生纸，并把原因带在返回值里（不弹提示、不重试第三次）。
 */
export async function resolveStudentScheme(input: {
  plan: LessonPlan
  pages: SchemePageBrief[]
  lessonTheme: DeckTheme
  cfg: LLMConfig
  signal?: AbortSignal
}): Promise<StudentSchemeReport> {
  const { plan, pages, lessonTheme, cfg, signal } = input
  const derived = deriveStudentTheme(lessonTheme, plan.meta.topic)

  let problems: string[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { system, user } = studentSchemePrompt(plan, pages, lessonTheme, problems)
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
      const parsed = studentFromJSON(raw, plan, lessonTheme)
      if (parsed.theme) return { theme: parsed.theme, source: 'ai', reason: '' }
      problems = parsed.problems
    } catch (e) {
      // 超时 / 被新教案取代：llm.ts 把 abort 包成「请求超时」那句人话，
      // 所以这里不猜文案，直接看 signal：它才是这件事唯一可靠的证据
      if (signal?.aborted) {
        return { theme: derived, source: 'derived', reason: '取学生纸超时或被取消了，用的是派生那套。' }
      }
      const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
      problems = [msg || '接口没有回话']
      // 网络层失败不值得再问一次：第二次大概率还是同一个错
      break
    }
  }
  const why = (problems[0] ?? '原因不明').replace(/[。.；;，,]+$/, '')
  return {
    theme: derived,
    source: 'derived',
    reason: `模型给的学生纸不合格：${why}。已换成按课件纸派生的那一套。`,
  }
}
