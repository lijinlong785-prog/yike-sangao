import type { LessonPlan } from '../types'
import type { PageLayout } from './deck'
import { DEFAULT_THEME, type DeckTheme } from './theme'
import type { SceneKind, SceneSlot } from './scene'

/* ================================================================== *
 * 没 Key 时的那一份方案（TASKS 09 第 9、10 件的离线路径）
 *
 * 上一版没 Key 就直接给 DEFAULT_THEME：色板一张纸、版式全由 deck 兜底、
 * 场景一个都没有。结果是——评委打开公开链接、没填 Key，看到的是十页同一种
 * 版面的纸墨稿，花瓣一朵不掉。演示里最该看见的东西，恰好是离线看不到的那个。
 *
 * 这里补的是「同一套规则的手工版」：不联网，但照样读课文——
 *   · 先认意象（雪 / 雨 / 花与落叶），认不出就不画，绝不硬塞；
 *   · 再按意象挑一张纸（五套，明度 / 彩度 / 对比度全在 scheme.ts 的框内）；
 *   · 版式按页型轮换，同一种连不上两页；
 *   · 场景只落在有画面的那两三页，首末页不动。
 *
 * 它仍然只是「兜底」：有 Key 时 scheme.ts 问模型，模型给的方案优先。
 * ================================================================== */

/* ------------------------------ 认意象 ------------------------------ */

/**
 * 三张词表。强词 = 课文真的在写这个物（2 分），弱词 = 只是沾边（1 分）。
 * 打分而不是 first-match：一篇课文里既有"雨"又有"花"时，谁分高听谁的；
 * 分不出高低（并列）就判「说不清」，一个场景都不给。
 */
const SCENE_WORDS: Record<SceneKind, { strong: RegExp; weak: RegExp }> = {
  snow: {
    strong: /雪|冰|霜|寒|凛|皑|白茫茫|雪山|岷山/g,
    weak: /冬|北风|冷|白/g,
  },
  rain: {
    strong: /下雨|大雨|小雨|雨点|雨声|雨水|淋|湿透|雨/g,
    weak: /阴天|乌云|潮|滴/g,
  },
  petals: {
    strong: /桂花|花瓣|落花|落叶|飘落|纷纷|花雨|槐花|桃花|杏花|梅花/g,
    // 弱词只收不会被合成词带偏的写法：单字「香」会咬到「香蕉」、
    // 单字「园」会咬到「公园」、单字「落」会咬到「落到」——那都是说理句，不是花。
    weak: /花|叶子|树叶|花香|清香|春天|春日|春风|秋天|秋日|秋风|花园|校园|果园|摇落/g,
  },
}

export interface SceneVerdict {
  /** '' = 这篇课文分不清该下什么，宁可空着 */
  kind: SceneSlot
  /** 各类得分，给人看「凭什么这么判」 */
  score: Record<SceneKind, number>
  /** 命中的原词，界面上一句话说明用 */
  hits: string[]
}

function scoreOf(text: string, re: RegExp, weight: number): { n: number; words: string[] } {
  const words = text.match(re) ?? []
  return { n: words.length * weight, words }
}

/**
 * 读课文的文字，判该不该有场景、是哪一种。
 * 判据只有一条：最高分要 ≥2（至少一个强词），且严格高于第二名。
 * 两条都不满足就返回 ''——「分辨不清的时候选择不找」。
 */
export function sceneVerdictOf(text: string): SceneVerdict {
  const src = String(text ?? '')
  const score = { snow: 0, rain: 0, petals: 0 } as Record<SceneKind, number>
  const hits: string[] = []
  for (const kind of Object.keys(SCENE_WORDS) as SceneKind[]) {
    const { strong, weak } = SCENE_WORDS[kind]
    const a = scoreOf(src, strong, 2)
    const b = scoreOf(src, weak, 1)
    score[kind] = a.n + b.n
    hits.push(...new Set([...a.words, ...b.words]))
  }
  const ranked = (Object.keys(score) as SceneKind[]).sort((x, y) => score[y] - score[x])
  const top = ranked[0]
  const second = ranked[1]
  const clear = score[top] >= 2 && score[top] > score[second]
  return { kind: clear ? top : '', score, hits: clear ? [...new Set(hits)] : [] }
}

/** 把一节课里所有能读的文字拼起来：课题、重难点、环节、页面标题 */
export function lessonText(plan: LessonPlan, titles: readonly string[] = []): string {
  const seg = (plan.segments ?? []).map((s) => `${s.name} ${s.goal ?? ''} ${s.teacher ?? ''} ${s.student ?? ''}`)
  return [
    plan.meta?.topic ?? '',
    plan.meta?.textbook ?? '',
    plan.keyPoint ?? '',
    plan.hardPoint ?? '',
    ...seg,
    ...titles,
  ].join(' ')
}

/* ------------------------------ 五张纸 ------------------------------ */

interface BuiltinPaper {
  id: string
  name: string
  note: string
  paper: string
  coverPaper: string
  paperDeep: string
  paperLine: string
  ink: string
  inkSoft: string
  accent: string
  accentSoft: string
  motif: DeckTheme['motif']
  /** 这张纸配哪种意象：只做「语感」匹配，不按学科分死。
   *  带 g：`match` 要数出全部命中次数，不带 g 永远只返回第一个，每张纸都停在 1 分，
   *  paperOf 的「≥2 且唯一」就永远不成立——那就等于没 Key 只有一张纸。 */
  fits: RegExp
}

/**
 * 七张纸：五张浅纸（秋江/雪原/青野/苔痕/暮山）+ 两张深纸（墨池/黑板）。
 * 浅纸走 SCHEME_LIMITS 的 74–98% 档，深纸走 16–64% 档、正文反白——两档之间的
 * 62–74% 是泥色禁区（那个区间投影上只是一片脏灰）。
 * 上一版七张全是 80–97%、彩度 ≤8%，等于所有课共用一张米白纸，这是「永远肉色」的真因。
 * 与正文对比度 ≥4.5、主纸↔封面纸色差 ≥20，check-scheme 逐套验。
 */
const PAPERS: readonly BuiltinPaper[] = [
  {
    id: 'builtin-qiujiang',
    name: '秋江',
    note: '秋天、花香、落下来一类课文用这张：暖白纸，桂黄做点缀。',
    paper: '#fbf7ec',
    coverPaper: '#e5dcd1',
    paperDeep: '#f3eddf',
    paperLine: '#e5ddc9',
    ink: '#231f18',
    inkSoft: '#5a5346',
    accent: '#9c5a1e',
    accentSoft: '#f1e4d2',
    motif: 'plain',
    // 与场景词表同一条纪律：不收单字「香 / 落 / 园 / 摇 / 秋」——
    // 「香蕉」「落到」「公园」会把数学课也拉到这张花香纸上。
    fits: /桂|花|叶子|树叶|落叶|落花|飘落|花香|清香|秋天|秋日|秋风|深秋|花园|校园|果园|院子|雨/g,
  },
  {
    id: 'builtin-xueyuan',
    name: '雪原',
    note: '雪、山路、远行一类课文用这张：冷白纸，靛蓝只用于一处强调。',
    paper: '#f5f7f9',
    coverPaper: '#dde3ea',
    paperDeep: '#eef2f6',
    paperLine: '#dee4ea',
    ink: '#1d2228',
    inkSoft: '#525c66',
    accent: '#2f5b86',
    accentSoft: '#e2ecf5',
    motif: 'plain',
    fits: /雪|山|长征|寒|远|军|路/g,
  },
  {
    id: 'builtin-qingye',
    name: '青野',
    note: '草地、春天、生长一类课文用这张：淡青纸，草绿收在强调色上。',
    paper: '#f7f9f2',
    coverPaper: '#dfe4d0',
    paperDeep: '#eef1e5',
    paperLine: '#dfe4d2',
    ink: '#1e2119',
    inkSoft: '#535a48',
    accent: '#4a6a30',
    accentSoft: '#e4eedb',
    motif: 'lines',
    fits: /草|树|苗|春|生长|田|绿|虫|鸟/g,
  },
  {
    id: 'builtin-taihen',
    name: '苔痕',
    note: '旧事、老屋、回忆一类课文用这张：旧纸黄，赭石做强调。',
    paper: '#f8f4e8',
    coverPaper: '#ded5ca',
    paperDeep: '#efe9da',
    paperLine: '#ded5bf',
    ink: '#221f18',
    inkSoft: '#57503e',
    accent: '#7a5a2a',
    accentSoft: '#eee3cd',
    motif: 'silk',
    fits: /旧|老|母|父|故|忆|年|家|乡|念/g,
  },
  {
    id: 'builtin-mushan',
    name: '暮山',
    note: '离别、安静、暮色一类课文用这张：藕白纸，暗红做强调。',
    paper: '#f9f4f5',
    coverPaper: '#e2d7da',
    paperDeep: '#f1eaea',
    paperLine: '#e2d7da',
    ink: '#221e20',
    inkSoft: '#575052',
    accent: '#8a3a4e',
    accentSoft: '#f0e0e5',
    motif: 'plain',
    fits: /别|送|离|暮|夜|静|月|思/g,
  },
  {
    id: 'builtin-mochi',
    name: '墨池',
    note: '古诗、文言、历史名篇用这张：墨绿深底，米色字，金色只点一处。',
    paper: '#1c2a27',
    // 深纸的封面只能往亮走：再往暗就掉出「纸」的明度底线（11%），变成纯黑。
    coverPaper: '#2e3b33',
    paperDeep: '#16211f',
    paperLine: '#34453f',
    ink: '#ece2c8',
    inkSoft: '#b6ad96',
    accent: '#d9a441',
    accentSoft: '#3b4335',
    motif: 'silk',
    fits: /古诗|诗词|文言|古文|名篇|杜甫|李白|苏轼|辛弃疾|陆游|王维|白居易|赤壁|三国|水浒|西游|红楼|史记|论语|唐|宋词/g,
  },
  {
    id: 'builtin-heiban',
    name: '黑板',
    note: '数学、科学用这张：黑板绿深底，粉笔白字，黄色只用于一个关键数。',
    paper: '#243029',
    coverPaper: '#18211c',
    paperDeep: '#1c2621',
    paperLine: '#3d4a41',
    ink: '#f2efe6',
    inkSoft: '#bcc2b6',
    accent: '#e8c46a',
    accentSoft: '#3b4136',
    motif: 'lines',
    fits: /数学|算式|加法|减法|乘法|除法|分数|小数|面积|体积|周长|图形|长方形|正方形|三角|统计|方程|规律|单位/g,
  },
]

/** 数一数这张纸的语感词命中几个；数学 / 英语课不许走到丝帘纹那张 */
function paperScore(p: BuiltinPaper, text: string, subject: string): number {
  const words = text.match(p.fits)
  let n = words ? words.length : 0
  if (/数学|英语|英文/.test(subject) && (p.motif === 'silk' || p.motif === 'seal')) n = -1
  return n
}

function toTheme(p: BuiltinPaper): DeckTheme {
  return {
    id: p.id,
    name: p.name,
    paper: p.paper,
    coverPaper: p.coverPaper,
    paperDeep: p.paperDeep,
    paperLine: p.paperLine,
    ink: p.ink,
    inkSoft: p.inkSoft,
    accent: p.accent,
    accentSoft: p.accentSoft,
    serif: DEFAULT_THEME.serif,
    sans: DEFAULT_THEME.sans,
    motif: p.motif,
    ruleWidth: 1,
    source: 'builtin',
    note: p.note,
  }
}

/** 五套纸（DeckTheme 形态）：门禁要逐套跑 schemeIssues，界面不消费这张表 */
export const BUILTIN_THEMES: readonly DeckTheme[] = PAPERS.map(toTheme)

/** 每套纸的语感得分：门禁在「没挑出纸」时要能说清凭什么，不靠猜 */
export function paperScores(text: string, subject: string): { id: string; name: string; score: number }[] {
  return PAPERS.map((p) => ({ id: p.id, name: p.name, score: paperScore(p, text, subject) })).sort(
    (a, b) => b.score - a.score
  )
}

/**
 * 认不出意象时的中性纸：按学科给，不让语文和数学共用一张。
 * 数学 → 青野（方格线）、英语 → 雪原（冷白）、其余 → 苔痕（旧纸）。
 * 数英的红线（不许 silk / seal）由 subjectProblems 兜住：这三张里只有苔痕是 silk，
 * 而苔痕只发给非数英；青野是 lines、雪原是 plain，两门课都合法。
 */
function neutralOf(subject: string): DeckTheme {
  const s = String(subject ?? '')
  const id = /数学/.test(s) ? 'builtin-qingye' : /英语|英文/.test(s) ? 'builtin-xueyuan' : 'builtin-taihen'
  const pick = PAPERS.find((p) => p.id === id) ?? PAPERS[0]
  return toTheme(pick)
}

/** 按课文挑纸：命中最多且唯一的那张；认不出就按学科给一张中性纸 */
export function paperOf(text: string, subject: string): DeckTheme {
  const s = String(subject ?? '')
  const ranked = PAPERS.map((p) => ({ p, n: paperScore(p, text, s) })).sort((a, b) => b.n - a.n)
  /**
   * 数学 / 科学优先上「黑板」：这两门课本来的气质就是黑板粉笔，
   * 意象词再怎么命中也不该给一张花香纸。只有意象非常明确（≥3）才让步。
   */
  if (/数学|科学|物理|化学/.test(s) && (!ranked.length || ranked[0].n < 3)) {
    const board = PAPERS.find((p) => p.id === 'builtin-heiban')
    if (board) return toTheme(board)
  }
  if (!ranked.length || ranked[0].n < 2) return neutralOf(s)
  if (ranked[1] && ranked[1].n === ranked[0].n) return neutralOf(s)
  return toTheme(ranked[0].p)
}

/* ------------------------------ 版式轮换 ------------------------------ */

/** 轮换序列：按这个顺序一人一页发下去，同一种版式挨不着 */
const ROTATE: readonly PageLayout[] = ['split', 'cards', 'timeline', 'full', 'cloze']

function layoutOf(kind: string, i: number): PageLayout {
  if (kind === 'cover') return 'full'
  if (kind === 'compare') return 'split'
  if (kind === 'board') return 'cards'
  if (kind === 'homework' || kind === 'end') return 'full'
  return ROTATE[i % ROTATE.length]
}

/**
 * 每页版式。先按页型给一个本分选择，再消一次「相邻两页同款」：
 * 撞上了就往后挪一格——挪完仍然撞（页数太少）就认了，不硬凑。
 */
export function builtinLayouts(kinds: readonly string[]): PageLayout[] {
  const out: PageLayout[] = []
  const used = new Set<PageLayout>()
  kinds.forEach((kind, i) => {
    let pick = layoutOf(kind, i)
    if (out[i - 1] === pick && kind !== 'cover') {
      const alt = ROTATE.find((l) => l !== pick && l !== out[i - 1])
      if (alt) pick = alt
    }
    out.push(pick)
    used.add(pick)
  })
  return out
}

/* ------------------------------ 场景放哪几页 ------------------------------ */

/**
 * 这些页型才配得上一个场景：讲解、对比、词句。练习 / 布置 / 收尾不铺画面。
 *
 * 注意页型的口径：调用方 builtinScheme() 拿到的是 buildDeck() 的**课件页型**
 * （cover / objectives / … / segment / segmentPoint / pause / activity / assessment /
 * board / prep / homework），不是学生版的 stack / compare / words。
 * 按学生版页型筛，候选永远为空——scenes 全留白，而且不会报错。
 */
const SCENE_KINDS_OK = /^(segment|segmentPoint|pause|hardpoint|activity)$/

/**
 * 场景页：跳过首页与末页，页间隔至少 2 页，最多 3 页。
 * 页数少（<6）就只给一页——宁可少，不许页页都动。
 */
export function builtinSceneSlots(kinds: readonly string[], kind: SceneSlot): SceneSlot[] {
  const total = kinds.length
  const slots: SceneSlot[] = Array.from({ length: total }, () => '')
  if (!kind || total < 4) return slots
  const max = total < 8 ? 1 : total < 16 ? 2 : 3
  const candidates = kinds
    .map((k, i) => ({ k, i }))
    .filter(({ k, i }) => i > 0 && i < total - 1 && SCENE_KINDS_OK.test(k))
  if (!candidates.length) return slots
  const step = Math.max(2, Math.floor((total - 2) / max + 0.5))
  let last = -99
  let put = 0
  for (const c of candidates) {
    if (put >= max) break
    if (c.i - last < step) continue
    slots[c.i] = kind
    last = c.i
    put++
  }
  // 一页都没排上（候选页太挤）：退而取中间那页，保证「有一个」而不是「一个没有」
  if (put === 0) {
    const mid = candidates[Math.floor(candidates.length / 2)]
    slots[mid.i] = kind
  }
  return slots
}

/* ------------------------------ 一份完整方案 ------------------------------ */

export interface BuiltinScheme {
  theme: DeckTheme
  /** 判意象的依据，界面上给老师一句话 */
  verdict: SceneVerdict
}

/**
 * 没 Key 时的那一份方案。titles 是这一叠的页面标题（用来读课文），
 * kinds 是页面类型（决定版式与场景落点）。
 */
export function builtinScheme(
  plan: LessonPlan,
  pages: readonly { kind: string; title: string }[]
): BuiltinScheme {
  const text = lessonText(
    plan,
    pages.map((p) => p.title)
  )
  const verdict = sceneVerdictOf(text)
  const base = paperOf(text, String(plan.meta?.subject ?? ''))
  const kinds = pages.map((p) => p.kind)
  return {
    theme: {
      ...base,
      layouts: builtinLayouts(kinds),
      scenes: builtinSceneSlots(kinds, verdict.kind),
    },
    verdict,
  }
}
