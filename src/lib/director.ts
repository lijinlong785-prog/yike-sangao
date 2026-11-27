/**
 * 导演（TASKS/12）：把「配插画」拆成两遍 DeepSeek，中间夹一层从图上量出来的数字。
 *
 *   第一遍 directDeck  —— 读整叠课件，定「哪几页画、每页画什么、留白在哪半边」。
 *   出图               —— 拿 brief 出图（illustrate.ts），再归纸、量数字（inspect.ts）。
 *   第二遍 typesetDeck —— 看不见图，只吃那几个数：文字放哪边、留几条、这一页什么版式。
 *
 * 为什么必须有第二遍：生图模型不会老老实实按 brief 摆位置（要它主体占右半边，
 * 它经常居中），所以「文字放哪边」不能靠第一遍的愿望，只能靠第二遍读实测数字。
 *
 * 三条边界：
 *   · 没有浏览器 key 也照配（TASKS/13）：没填就走同源代理，服务端注入 Authorization；
 *     画什么必须由导演定，不许退回正则猜（§一）。
 *   · 任何一遍失败都不抛：那一遍的活按「不配图 / 确定性版式」落地，页面本身不受影响。
 *   · 缓存两级：导演计划按「课题指纹」存，图片按「课题指纹 + 导演输出哈希」存。
 *     换教案立刻重画，同一份教案第二次导出 0 次 API 调用（§四）。
 */
import { postChatJson, type LLMConfig } from './llm'
import {
  generateIllustration,
  illustCountFor,
  type IllustCache,
  type IllustConfig,
} from './illustrate'
import { measureArt, mirrorArt, normalizeArt, type ArtNumbers } from './inspect'
import { coverLayoutOf, type CoverArch } from './deck2/place'

/* ------------------------------- 类型 ------------------------------- */

/** 第二遍可挑的五个版式（无画的页必须挑一个，绝不许留一片空白） */
export const DECK_LAYOUTS = ['full', 'split', 'cards', 'timeline', 'cloze'] as const
export type TextLayout = (typeof DECK_LAYOUTS)[number]
export type ArtSide = 'left' | 'right'

/** 导演要读的页面字段：只给课件本身有的东西，不绑死 slides.ts 的类型 */
export interface DirectorSlide {
  kind: string
  title: string
  line?: string
  items?: string[]
  imageHint?: string
}

/** 第一遍每页一条：画不画、画什么、留白在哪边 */
export interface DirectPage {
  i: number
  draw: boolean
  brief: string
  empty: ArtSide
  why: string
}

export interface DirectPlan {
  pages: DirectPage[]
  /** 这一课的视觉母题，英文一句；只用来保证几张图是同一本书里的 */
  look: string
}

/** 第二遍每页一条：图放哪边、字放哪边、留几条、这一页什么版式 */
export interface TypesetPage {
  i: number
  artSide: ArtSide
  textSide: ArtSide
  items: number
  drop: string[]
  layout: TextLayout
}

export interface TypesetPlan {
  pages: TypesetPage[]
}

export interface DirectorMeta {
  topic: string
  grade?: string
  subject?: string
  duration?: number
  /** 可用张数：导演最多画这么多，用完即止 */
  allow: number
  /** 这一页的纸色：图片四边归一到它（不传就不归，只量） */
  paper?: (kind: string) => string
}

/* ------------------------------ 指纹 ------------------------------ */

function digest(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`
}

/**
 * 导演计划的钥匙：课题 + 学段 + 学科 + 课时 + 张数。
 * 刻意不把整叠页面的文字拼进去：同一份教案每次重生成，学生的句子总会有几个字不一样，
 * 把文本算进钥匙就等于「同一教案第二次必重画」。
 * 页数对不上时（卷子变了）由 runDeckDirector 当作过期计划丢掉，这一层不负责。
 */
export function directorKey(meta: DirectorMeta): string {
  return digest(
    [meta.topic, meta.grade ?? '', meta.subject ?? '', String(meta.duration ?? 0), String(meta.allow)].join(
      '\u0004'
    )
  )
}

/** 第一遍输出的哈希：图片缓存键的后半段（同一课题、换了画法就重画） */
export function directHash(plan: DirectPlan): string {
  const body = plan.pages
    .filter((p) => p.draw)
    .map((p) => [p.i, p.empty, p.brief].join('\u0001'))
    .join('\u0003')
  return digest(`${plan.look}\u0005${body}`)
}

/** 图片的钥匙 = 导演计划钥匙 + 第一遍输出哈希 */
export function artFingerprint(planKey: string, plan: DirectPlan): string {
  return `${planKey}~${directHash(plan)}`
}

/* --------------------------- 一、净化第一遍 --------------------------- */

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/
/** brief 里出现这些词，说明它在要求画面写字——字由我们排版，图里一个都不许有 */
const TEXT_WORDS =
  /\b(texts?|letters?|words?|numbers?|numerals?|captions?|labels?|signs?|signage|titles?|typography|calligraphy|characters?|writing|font)\b/i
const MAX_BRIEF_WORDS = 25

/** 抽象页：这些页画出来也不像课文，一律 draw:false，宁缺不凑。
 * 原文页（quote）尤其不能画：插画版式会把「图 + 文」两栏排开，课文原句就没地方站了。 */
const ABSTRACT_KINDS = new Set(['goals', 'homework', 'quote'])
const ABSTRACT_TITLE = /^(学习目标|目标|三件事|作业|课后|练习|小结|下课|再见|复习)/
const TASK_TITLE = /(读一读|写一写|圈一圈|画一画|背一背|抄一抄|想一想|说一说|练一练|比一比|齐读|自由读)/

/** 这一页是不是抽象页（判断句 / 目标 / 指令 / 纯数字） */
export function isAbstractSlide(s: DirectorSlide): boolean {
  const kind = String(s.kind ?? '')
  if (ABSTRACT_KINDS.has(kind)) return true
  const title = String(s.title ?? '').trim()
  const line = String(s.line ?? '').trim()
  const items = (s.items ?? []).map(String)
  if (ABSTRACT_TITLE.test(title)) return true
  if (TASK_TITLE.test(title)) return true
  // 一页没有一句成句的话，只有几个词：画不出「谁在哪做什么」
  if (!line && items.length === 0) return true
  // 纯数字页（对比数据、页码、统计）
  const body = [line, ...items].join('').replace(/\s+/g, '')
  if (body && /^[\d０-９+×÷=<>%~.,:;、。，；：（）()\-—]+$/.test(body)) return true
  return false
}

function clip(text: string, max: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) : t
}

/** brief 的硬标准：英文、≤25 词、不要求画面出现文字 */
function cleanBrief(value: unknown): string {
  let text = clip(String(value ?? '').replace(/^["'“”「」]+|["'“”「」]+$/g, ''), 600)
  if (!text) return ''
  if (CJK.test(text)) return ''
  if (TEXT_WORDS.test(text)) return ''
  const words = text.split(' ')
  if (words.length > MAX_BRIEF_WORDS) text = words.slice(0, MAX_BRIEF_WORDS).join(' ')
  return text
}

/**
 * 封面兜底 brief：导演漏给时用它。英文、22 词、不要求画面出现文字。
 * 中文标题绝不许进生图提示词——会把画面带跑。
 */
const COVER_BRIEF = 'a wide establishing scene of this lesson: the place, the people and one object from the story, half the frame left empty'

/**
 * 第一遍的净化：模型给的 JSON 只是「建议」，能不能落地由这里说了算。
 *   ① 抽象页强制 false；② brief 不合规直接丢这一页；
 *   ③ 按页序取前 allow 张；④ 相邻两张必须一左一右，撞了宁缺不凑。
 *   ⑤ **封面永远画**，且不占 allow 名额——它是一份课件的脸。
 */
export function sanitizeDirect(raw: unknown, opts: { slides: readonly DirectorSlide[]; allow: number }): DirectPlan {
  const slides = opts.slides
  const allow = Math.max(0, Math.floor(Number(opts.allow) || 0))
  const box = (raw ?? {}) as { pages?: unknown; look?: unknown }
  const entries = Array.isArray(box.pages) ? box.pages : []
  const look = clip(String(box.look ?? ''), 120)
  const picked = new Map<number, { brief: string; empty: ArtSide; why: string }>()
  const isCover = (i: number): boolean => String(slides[i]?.kind ?? '') === 'cover'

  for (const item of entries) {
    const row = (item ?? {}) as { i?: unknown; draw?: unknown; brief?: unknown; empty?: unknown; why?: unknown }
    if (row.draw !== true) continue
    const i = Number(row.i)
    if (!Number.isInteger(i) || i < 0 || i >= slides.length) continue
    if (picked.has(i)) continue
    /* 封面只有标题、没有成句的话，isAbstractSlide 会把它判成「画不出谁在哪做什么」。
       但封面恰恰是本课唯一能画出「谁 + 在哪」的一页：判据在这里让路。 */
    if (isAbstractSlide(slides[i]) && !isCover(i)) continue
    const brief = cleanBrief(row.brief)
    if (!brief) continue
    picked.set(i, {
      brief,
      empty: row.empty === 'right' ? 'right' : 'left',
      why: clip(String(row.why ?? ''), 16),
    })
  }

  /* 封面：模型没排、或排了但 brief 不合规，这里一律补一条兜底。
     allow 为 0（这一份不配图）时一张都不补，规矩不变。 */
  if (allow > 0) {
    for (let i = 0; i < slides.length; i += 1) {
      if (!isCover(i) || picked.has(i)) continue
      picked.set(i, { brief: COVER_BRIEF, empty: 'left', why: '封面' })
    }
  }

  const pages: DirectPage[] = slides.map((_, i) => ({ i, draw: false, brief: '', empty: 'left', why: '' }))
  let used = 0
  let prev: ArtSide | null = null
  for (let i = 0; i < slides.length; i++) {
    const hit = picked.get(i)
    if (!hit) continue
    const cover = isCover(i)
    /* 封面不占内页额度：想多画一张封面，就从 here 加，不从别处挪（TASKS/20b 追加口径） */
    if (!cover && used >= allow) continue
    // 相邻两张撞了同一边：不删页，把这一页的留白改到另一边。
    // 真正落在哪边以回读的数字为准（出图后会按实测结果镜像），这里只保证计划自身一左一右。
    // 封面例外：它的标题永远压在左边（paintOne 按 cover:'left' 要图），只当起点，不参与翻边。
    const empty: ArtSide = cover
      ? 'left'
      : prev && hit.empty === prev
        ? prev === 'left'
          ? 'right'
          : 'left'
        : hit.empty
    pages[i] = { i, draw: true, brief: hit.brief, empty, why: hit.why }
    prev = empty
    if (!cover) used += 1
  }
  return { pages, look }
}

/* --------------------------- 三、净化第二遍 --------------------------- */

export function isLayout(value: unknown): value is TextLayout {
  return typeof value === 'string' && (DECK_LAYOUTS as readonly string[]).includes(value)
}

/** 没画的页也要有版式：按页型和条目数给一个确定的兜底，绝不留白 */
function defaultLayout(s: DirectorSlide, count: number): TextLayout {
  const kind = String(s.kind ?? '')
  if (kind === 'words' || kind === 'homework') return 'cards'
  if (kind === 'compare') return 'split'
  if (kind === 'drill') return 'cloze'
  if (kind === 'cover' || kind === 'end') return 'full'
  return count >= 3 ? 'split' : 'full'
}

const LAYOUT_CYCLE: TextLayout[] = ['split', 'cards', 'timeline', 'cloze', 'full']

/** 相邻两页撞了版式：按固定顺序换下一档，保证结果确定、可复现 */
function nextLayout(cur: TextLayout): TextLayout {
  const at = LAYOUT_CYCLE.indexOf(cur)
  return LAYOUT_CYCLE[(at + 1) % LAYOUT_CYCLE.length]
}

/** 按第二遍的意思删条目：先删它点名的，再从尾巴上削到它要的条数；只减不增 */
export function cutItems(items: readonly string[], want: number, drop: unknown): { kept: string[]; dropped: string[] } {
  const asks = Array.isArray(drop) ? drop.map((d) => String(d ?? '').trim()).filter(Boolean) : []
  const dropped: string[] = []
  const kept = items.map(String).filter((t) => {
    const hit = asks.some((d) => d === t || (d.length >= 2 && t.includes(d)))
    if (hit) dropped.push(t)
    return !hit
  })
  const cap = Math.max(0, Math.floor(want))
  while (kept.length > cap) dropped.push(kept.pop() as string)
  return { kept, dropped }
}

const ASK = /[？?]/

/**
 * 删条目之后再补一道：真跑实测的坑是第二遍把某页唯一一条问句当「多余」删了，
 * 于是整页既不能问也没有动作，导出被 validateSlides 原路退回。
 * 这里的规矩是死规矩：原来有问句，删完必须还剩一条问句；条数不少于 want、不多于它。
 * 结果保持原顺序，只减不增（除非要补回被删掉的问句）。
 */
function trimItems(items: readonly string[], want: number, drop: unknown): { kept: string[]; dropped: string[] } {
  const all = items.map(String)
  if (all.length === 0) return { kept: [], dropped: [] }
  const target = Math.min(Math.max(1, Math.floor(want) || 1), all.length)
  const base = cutItems(all, target, drop)
  const keep = new Set(base.kept)

  // 原来有问句、删完没了：把第一条被删的问句换回来，超出的位先让给非问句
  const asks = all.filter((t) => ASK.test(t))
  if (asks.length > 0 && ![...keep].some((t) => ASK.test(t))) {
    const back = asks.find((t) => !keep.has(t))
    if (back) {
      keep.add(back)
      while (keep.size > target) {
        const victim = [...keep].reverse().find((t) => !ASK.test(t))
        if (!victim) break
        keep.delete(victim)
      }
    }
  }
  // 还不够条数：按原顺序补
  for (const t of all) {
    if (keep.size >= target) break
    keep.add(t)
  }

  const kept = all.filter((t) => keep.has(t))
  return { kept, dropped: all.filter((t) => !keep.has(t)) }
}

/**
 * 第二遍的净化。四条硬规则连模型自己说了也不算：
 *   ① 有画：textSide 一律取实测更空的那半边（不是第一遍的愿望）；
 *   ② 有画且画占版 >55%：items 降到 1–2 条；其余页只减不增；
 *   ③ 无画：不得删条目，版式必须在五档里；
 *   ④ 相邻两页（都无画）版式不许相同。
 */
export function sanitizeTypeset(
  raw: unknown,
  opts: { slides: readonly DirectorSlide[]; direct: DirectPlan; nums: Map<number, ArtNumbers> }
): TypesetPlan {
  const { slides, direct, nums } = opts
  const box = (raw ?? {}) as { pages?: unknown }
  const entries = Array.isArray(box.pages) ? box.pages : []
  const rows = new Map<number, { items?: unknown; drop?: unknown; layout?: unknown }>()
  for (const item of entries) {
    const row = (item ?? {}) as { i?: unknown; items?: unknown; drop?: unknown; layout?: unknown }
    const i = Number(row.i)
    if (!Number.isInteger(i) || i < 0 || i >= slides.length || rows.has(i)) continue
    rows.set(i, row)
  }

  const pages: TypesetPage[] = []
  let lastLayout: TextLayout | null = null
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    const row = rows.get(i)
    const items = (s.items ?? []).map(String)
    const plan = direct.pages[i]
    if (plan?.draw === true && nums.has(i)) {
      const empty: ArtSide = nums.get(i)?.empty ?? plan.empty
      const big = (nums.get(i)?.subjectArea ?? 0) > 0.55
      const cap = big ? Math.min(2, Math.max(1, items.length)) : Math.max(items.length, 1)
      const want = Math.min(cap, Math.max(1, Math.round(Number(row?.items) || cap)))
      const cut = trimItems(items, want, row?.drop)
      pages.push({
        i,
        textSide: empty,
        artSide: empty === 'left' ? 'right' : 'left',
        items: cut.kept.length,
        drop: cut.dropped,
        // 有画的页一律「图 + 文」两栏，不参与五档轮换
        layout: 'split',
      })
      continue
    }
    let layout: TextLayout = isLayout(row?.layout) ? row.layout : defaultLayout(s, items.length)
    if (layout === lastLayout) layout = nextLayout(layout)
    pages.push({ i, textSide: 'left', artSide: 'right', items: items.length, drop: [], layout })
    lastLayout = layout
  }
  return { pages }
}

/* ------------------------------ 提问 ------------------------------ */

const DIRECT_SYSTEM = `你是这堂课版面的导演。读完整叠学生版页面，决定哪几页配插画、每页画什么、画面留白在哪半边。

只输出 JSON，不要解释，不要代码块：
{"pages":[{"i":3,"draw":true,"brief":"a girl standing under a tall osmanthus tree looking up, petals falling, subject occupies the right half, wide empty space on the left","empty":"left","why":"摇花乐"}],"look":"one sentence on this lesson's visual motif"}

规矩，违反即判不合格：
1. pages 逐页给（i 是 0 起的真实页码）。不画的页写 draw:false、brief 写空字符串。
2. brief 用英文，不超过 25 个词，只写画面上看得见的东西：谁、在哪、做什么、主体占画面的哪半边、哪边留空。
   —— 不写画风（画风由我们统一拼）；不写课文引号里的原句；不要求画面出现任何文字、字母、数字、标签、标牌。
3. 抽象页一律 draw:false：判断句页、学习目标页、作业页、纯指令页（读一读/写一写/比一比）、纯数字页；payload 里标了 abstract:true 的页一定不画。宁缺不凑。
4. 相邻两个 draw:true 的页，empty 必须一左一右交替（上一页 left，下一页就 right），不许连着同一边。
5. allow 是这一次要画的张数：可画的页够就画满 allow 张（额度不是建议，是任务），不够才少画；但绝不许把抽象页或相邻两页重边硬塞进来凑数。
6. 人物每页可以不同，只约束年龄段与画风统一——年龄按学段走，画风不用你操心。
7. look 用英文一句（≤20 词）说这一课的视觉母题，例如 one child, one osmanthus branch, one bamboo sieve。
8. cover 页必须 draw:true（allow 为 0 时除外）：封面是一份课件的脸。brief 画这一课的整幅画（谁 + 在哪 + 本课的物件），主体占一半、另一半留空，按第 4 条与内页错开。`

const TYPESET_SYSTEM = `你是排版。第一遍已经定了画什么，现在图已经画完。你看不见图，只许依据下面量出来的数字排版。

只输出 JSON，不要解释，不要代码块：
{"pages":[{"i":3,"artSide":"right","textSide":"left","items":3,"drop":["……"],"layout":"split"}]}

规矩，违反即判不合格：
1. pages 逐页给（i 是 0 起的真实页码），一页都不能漏。
2. 有画的页（art:true）：textSide 必须等于 measured.empty（更空的那半边）；artSide 写另一边。文字永远放在空的那一侧。
3. 有画的页：items 是这一页最终留几条，只能比原来少、不能多，最少 1 条；drop 写被删掉的原句（从原文照抄，一字不改）。
4. measured.subjectArea > 0.55（画占了半版以上）时，items 必须降到 1–2 条。
5. 没有画的页（art:false）：layout 必须在 full / split / cards / timeline / cloze 里挑一个，绝不许留一片空白；这类页 items 保持原样，drop 写空数组。
6. 相邻两页（都没有画）的 layout 不许相同。
7. 有画的页 layout 一律写 "split"（图与文两栏）。`

interface Counters {
  direct: number
  typeset: number
}

const counters: Counters = { direct: 0, typeset: 0 }

/** 第一遍原文里写了多少条 draw:true（净化前） */
let lastAsked = 0

/** 本次进程内两遍 DeepSeek 各自发了几次（验收「2 次都成功」「二次 0 调用」用） */
export function directorCalls(): Counters {
  return { ...counters }
}

function readMinutes(meta: DirectorMeta): number {
  return Math.round((Number(meta.duration) || 0) / 60)
}

function errorText(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return '已取消'
  const msg = e instanceof Error ? e.message : String(e ?? '未知错误')
  // 网络层把原始原因挂在 cause 上（llm.ts）：门禁要看得到它，界面只看 msg
  const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined
  const inner =
    cause instanceof Error
      ? cause.message
      : cause && typeof cause === 'object' && 'message' in cause
        ? String((cause as { message: unknown }).message)
        : ''
  return inner ? `${msg}（${inner}）` : msg
}

/** 第一遍：整叠课件 → 全局画法 */
export async function directDeck(
  slides: readonly DirectorSlide[],
  meta: DirectorMeta,
  cfg: LLMConfig,
  signal?: AbortSignal
): Promise<DirectPlan> {
  const payload = {
    lesson: {
      topic: meta.topic,
      grade: meta.grade ?? '',
      subject: meta.subject ?? '',
      minutes: readMinutes(meta),
    },
    allow: Math.max(0, Math.floor(Number(meta.allow) || 0)),
    mustDraw: Math.max(0, Math.floor(Number(meta.allow) || 0)),
    pages: slides.map((s, i) => ({
      i,
      kind: s.kind,
      title: s.title,
      line: s.line ?? '',
      items: s.items ?? [],
      // 抽象页先标出来：净化的时候反正也会被拿掉，不如先告诉它，免得多占一个名额
      abstract: isAbstractSlide(s),
    })),
  }
  counters.direct += 1
  const raw = await postChatJson(
    [
      { role: 'system', content: DIRECT_SYSTEM },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    cfg,
    signal,
    0.4
  )
  // 只给门禁看的数：模型自己写了多少页 draw:true（净化后还剩几页是另一件事）
  const box = raw as { pages?: { draw?: unknown }[] } | null
  lastAsked = Array.isArray(box?.pages) ? box.pages.filter((p) => p?.draw === true).length : 0
  return sanitizeDirect(raw, { slides, allow: payload.allow })
}

function round2(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100
}

/** 第二遍：每页原文案 + 图上量出来的数字 → 这一页怎么排 */
export async function typesetDeck(
  slides: readonly DirectorSlide[],
  direct: DirectPlan,
  nums: Map<number, ArtNumbers>,
  cfg: LLMConfig,
  signal?: AbortSignal
): Promise<TypesetPlan> {
  const payload = {
    layouts: DECK_LAYOUTS,
    pages: slides.map((s, i) => {
      const plan = direct.pages[i]
      const n = nums.get(i)
      return {
        i,
        kind: s.kind,
        title: s.title,
        line: s.line ?? '',
        items: s.items ?? [],
        art: Boolean(plan?.draw && n),
        brief: plan?.draw ? plan.brief : '',
        measured: n
          ? {
              subjectW: round2(n.subjectW),
              subjectH: round2(n.subjectH),
              subjectArea: round2(n.subjectArea),
              ink: round2(n.ink),
              edge: round2(n.edge),
              empty: n.empty,
              quad: {
                tl: round2(n.quad.tl),
                tr: round2(n.quad.tr),
                bl: round2(n.quad.bl),
                br: round2(n.quad.br),
              },
            }
          : null,
      }
    }),
  }
  counters.typeset += 1
  const raw = await postChatJson(
    [
      { role: 'system', content: TYPESET_SYSTEM },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    cfg,
    signal,
    0.2
  )
  return sanitizeTypeset(raw, { slides, direct, nums })
}

/* ------------------------------ 编排 ------------------------------ */

export interface DirectorReport {
  /** 第一遍是否成功（缓存命中算成功） */
  directOk: boolean
  /** 第二遍是否成功（缓存命中算成功） */
  typesetOk: boolean
  /** 最终真正带上图的页数 */
  drawn: number
  /** 第一遍决定要画的页数（圈定后可能因为带字判废而少画） */
  planned: number
  /** 第一遍原文里写了 draw:true 的条数（净化后可能少几页） */
  asked: number
  /** 画出来带字、按新 brief 重投一次仍带字而不画的页数 */
  textFailed: number
  /** 图落在左 / 右的页数 */
  sides: { left: number; right: number }
  /** 两遍之间 items 被改动的页数 */
  itemsChanged: number
  look: string
  /** 额度不足停下时的一句中文，平时为空 */
  note: string
  failures: { page: number; error: string }[]
}

function emptyReport(): DirectorReport {
  return {
    directOk: false,
    typesetOk: false,
    drawn: 0,
    planned: 0,
    asked: 0,
    textFailed: 0,
    sides: { left: 0, right: 0 },
    itemsChanged: 0,
    look: '',
    note: '',
    failures: [],
  }
}

/** 上一次导演跑下来的回执：只给门禁用，界面一个字都不读 */
let lastReport: DirectorReport = emptyReport()
export function directorReport(): DirectorReport {
  return lastReport
}

/** 导演计划缓存（由 deckStore 落 IndexedDB；Node 侧只剩进程内一层） */
export interface DirectorCache {
  load(key: string): Promise<{ direct: DirectPlan; typeset: TypesetPlan } | null>
  save(key: string, value: { direct: DirectPlan; typeset: TypesetPlan }): Promise<void>
}

export interface RunOptions<S extends DirectorSlide> {
  slides: readonly S[]
  cfg: { llm: LLMConfig; image: IllustConfig }
  meta: DirectorMeta
  cache: { plan: DirectorCache; art: IllustCache }
  signal?: AbortSignal
  onStage?: (stage: 'direct' | 'illust' | 'typeset', page: number, total: number) => void
}

/** 把计划里没画出图的那几页降级成 draw:false，第二遍就不会再为难它们 */
function prune(direct: DirectPlan, alive: Set<number>): DirectPlan {
  return {
    look: direct.look,
    pages: direct.pages.map((p) => (p.draw && !alive.has(p.i) ? { ...p, draw: false, brief: '' } : p)),
  }
}

interface Painted {
  dataUrl?: string
  nums?: ArtNumbers
  error?: string
  /** 因为画面里带字而丢掉（与网络失败分开数） */
  text?: boolean
}

/**
 * 出图 → 抹水印 → 边带归纸 → 量数字 → 带字就按新 brief 重投一次。
 * 重投仍是原 brief，只把「不许有字」说到最狠：画什么已经定了，改的是排除句。
 */
async function paintOne(
  i: number,
  direct: DirectPlan,
  cfg: IllustConfig,
  opts: { meta: DirectorMeta; paperHex: string; signal?: AbortSignal; cover?: CoverArch }
): Promise<Painted> {
  const plan = direct.pages[i]
  const common = {
    grade: opts.meta.grade,
    subjectName: opts.meta.subject,
    look: direct.look,
    // 底纸跟着这一页的纸走（TASKS/12 §六）：提示词的纸描述、抹水印的补丁色都取它
    paper: opts.paperHex || undefined,
    // 封面（TASKS/20b）：先把「哪一整块一定空着」写死在提示词里，标题才有地方落
    cover: opts.cover,
    signal: opts.signal,
  }
  const finish = async (dataUrl: string): Promise<Painted> => {
    const out = opts.paperHex ? await normalizeArt(dataUrl, opts.paperHex) : dataUrl
    const nums = await measureArt(out, opts.paperHex || undefined)
    if (!nums) return { error: '读不回这张图' }
    return { dataUrl: out, nums }
  }

  /* 千问爱题字是概率事件（线上实测同一提示词有时 glyph=0 有时 ≈2487）：
     单次重投不够，千问档投到 3 次（每次换取景说法），其余模型保持 2 次。
     一张 0.18 元券抵，多投两次换「张张有图」值得。生图本身失败（欠费/限速）
     不在此重试——交给出图链的分级规矩处理。 */
  const tries = /^qwen-image/i.test(String(cfg.model ?? '')) ? 3 : 2
  let firstGlyph = 0
  let lastGlyph = 0
  for (let t = 0; t < tries; t++) {
    const r = await generateIllustration(plan.brief, cfg, t === 0 ? common : { ...common, hardNoText: true, variant: t })
    if (!r.ok || !r.dataUrl) return { error: r.error ?? '没有图', text: t > 0 }
    const one = await finish(r.dataUrl)
    if (!one.nums) return { error: '读不回这张图' }
    if (!one.nums.textRisk) return one
    if (t === 0) firstGlyph = Math.round(one.nums.glyph)
    lastGlyph = Math.round(one.nums.glyph)
  }
  return {
    error: `画面疑似带字（重投 glyph≈${firstGlyph}→${lastGlyph}）`,
    text: true,
  }
}

/** 缓存命中的计划碰到新一叠页面：那一页现在是抽象页就不再画（同一课题重新生成时可能换页） */
function retarget(plan: DirectPlan, slides: readonly DirectorSlide[]): DirectPlan {
  return {
    look: plan.look,
    pages: plan.pages.map((p) =>
      p.draw && (!slides[p.i] || isAbstractSlide(slides[p.i])) ? { ...p, draw: false, brief: '' } : p
    ),
  }
}

/**
 * 一条龙：计划缓存 → 出图 → 归纸 → 量数 → 第二遍 → 落到页面上。
 * 不抛：任何一段失败都按「这一页不画 / 按确定性版式」落地，页面本身照常交付。
 */
export async function runDeckDirector<S extends DirectorSlide>(
  opts: RunOptions<S>
): Promise<{ slides: S[]; report: DirectorReport }> {
  const { slides, cfg, meta } = opts
  const report = emptyReport()
  lastReport = report
  const untouched = (): S[] => slides.slice()

  if (slides.length === 0) return { slides: untouched(), report }
  const allow = Math.max(0, Math.min(slides.length, Math.floor(Number(meta.allow) || 0)))
  if (allow === 0) return { slides: untouched(), report }

  const planKey = directorKey(meta)
  const planRow = await opts.cache.plan.load(planKey).catch(() => null)
  // 页数对不上 = 计划过期（同一课题换了页数），按没缓存处理，不能拿旧页码硬套
  const cached = planRow && planRow.direct.pages.length === slides.length ? planRow : null
  let direct: DirectPlan
  let typeset: TypesetPlan | null = null

  if (cached) {
    direct = retarget(cached.direct, slides)
    typeset = cached.typeset
    report.directOk = true
    report.typesetOk = true
  } else {
    opts.onStage?.('direct', 0, 1)
    try {
      direct = await directDeck(slides, { ...meta, allow }, cfg.llm, opts.signal)
      report.directOk = true
    } catch (e) {
      // 第一遍失败 = 这一份没有画法 = 整份不配图，绝不退回正则挑页
      report.failures.push({ page: 0, error: `第一遍：${errorText(e)}` })
      return { slides: untouched(), report }
    }
  }
  report.look = direct.look
  report.asked = lastAsked

  const planned = direct.pages.filter((p) => p.draw).map((p) => p.i)
  report.planned = planned.length
  const paperOf = (i: number): string => String(meta.paper?.(String(slides[i].kind ?? '')) ?? '').trim()

  // 图：先吃缓存，缺的才画（缓存键里带导演输出哈希，换了画法就重画）
  const artFp = artFingerprint(planKey, direct)
  const stored = await opts.cache.art.load(artFp).catch(() => new Map<number, string>())
  const art = new Map<number, string>()
  const nums = new Map<number, ArtNumbers>()
  const todo: number[] = []
  for (const i of planned) {
    const hit = stored.get(i)
    if (hit) art.set(i, hit)
    else todo.push(i)
  }

  if (todo.length > 0) {
    typeset = null
    let stopped = false
    let cursor = 0
    let done = 0
    /** 连续失败张数：两张都没画出来就不必再撞了（TASKS/15 §3.2） */
    let streak = 0
    const worker = async () => {
      while (!stopped && cursor < todo.length) {
        if (opts.signal?.aborted) return
        const i = todo[cursor++]
        // 封面按「主体靠右、左边整块留空」去要——模型不听也不怕，落位看的是实测四个数
        const cover: CoverArch | undefined = slides[i]?.kind === 'cover' ? 'left' : undefined
        const one = await paintOne(i, direct, cfg.image, {
          meta,
          paperHex: paperOf(i),
          signal: opts.signal,
          cover,
        })
        if (!one.dataUrl || !one.nums) {
          report.failures.push({ page: i + 1, error: one.error ?? '没有图' })
          if (one.text) report.textFailed += 1
          if (one.error && /\b402\b|insufficient|余额|额度|quota|payment/i.test(one.error)) {
            stopped = true
            continue
          }
          // 连续两张都失败：剩下的全放弃，整份 PPT 照常出无图版式
          // （多路并发下「连续」按共享计数近似，宁可少画，不拿钱反复撞墙）
          streak += 1
          if (streak >= 2) stopped = true
          continue
        }
        streak = 0
        art.set(i, one.dataUrl)
        nums.set(i, one.nums)
        await opts.cache.art.save(artFp, i, one.dataUrl).catch(() => {})
        done += 1
        opts.onStage?.('illust', done, todo.length)
      }
    }
    /* 并发路数看第一家是谁（2026-11-23 真机《七律·长征》）：auto 链第一枪是百炼
       qwen-image，它的并发上限是 2——4 路齐发立刻吃两个 429，每个 429 罚等 20 秒，
       比 2 路还慢，还可能把「连续两张失败就收手」的闸误触发。百炼打头就 2 路；
       显式硅基模型仍 4 路（TASKS/15 §4.1 旧规矩，那边一张几秒）。 */
    const blFirst =
      String(cfg.image.engine ?? 'auto') === 'auto' || /^qwen-image/i.test(String(cfg.image.model ?? ''))
    const lanes = blFirst ? 2 : 4
    await Promise.all(Array.from({ length: lanes }, () => worker()))
  }

  // 缓存里那几张也要量一遍（本地计算，0 次调用）——第二遍吃的是数，不是承诺
  if (!typeset) {
    for (const [i, dataUrl] of [...art]) {
      if (nums.has(i)) continue
      const one = await measureArt(dataUrl, paperOf(i) || undefined)
      if (one) nums.set(i, one)
      else {
        art.delete(i)
        report.failures.push({ page: i + 1, error: '读不回缓存里的图' })
      }
    }
  }

  // 相邻两张的留白必须一左一右：实测撞了就把后一张水平翻过来（不删页、不重画）
  let prevEmpty: ArtSide | null = null
  for (const i of [...art.keys()].sort((a, b) => a - b)) {
    const n = nums.get(i)
    if (!n) continue
    if (prevEmpty && n.empty === prevEmpty) {
      const flopped = await mirrorArt(art.get(i) as string)
      const m = flopped ? await measureArt(flopped, paperOf(i) || undefined) : null
      if (m && m.empty !== prevEmpty) {
        art.set(i, flopped)
        nums.set(i, m)
        await opts.cache.art.save(artFp, i, flopped).catch(() => {})
      }
    }
    prevEmpty = nums.get(i)?.empty ?? prevEmpty
  }

  const alive = new Set(art.keys())
  const alivePlan = prune(direct, alive)

  let booked: TypesetPlan
  if (typeset) {
    booked = typeset
  } else if (art.size === 0) {
    /* 一整份一张图都没有：第二遍就只剩「字怎么排」，而这件事 place.ts 的
       五档轮换加 defaultLayout 本来就能定，没必要为它再跑一次模型（一次大几千 token）。
       有图时才值得让模型看一眼图的空白侧；没图时这一遍纯属等 30 秒。 */
    booked = sanitizeTypeset(null, { slides, direct: alivePlan, nums })
    report.typesetOk = true
  } else {
    opts.onStage?.('typeset', 0, 1)
    try {
      booked = await typesetDeck(slides, alivePlan, nums, cfg.llm, opts.signal)
      report.typesetOk = true
    } catch (e) {
      // 第二遍失败：版式按确定性规则落地，图照用（文字侧取实测的空白侧）
      report.failures.push({ page: 0, error: `第二遍：${errorText(e)}` })
      booked = sanitizeTypeset(null, { slides, direct: alivePlan, nums })
    }
  }
  const typesetPlan: TypesetPlan = booked

  const out = slides.map((s, i) => {
    const row = typesetPlan.pages[i]
    if (!row) return s
    const before = (s.items ?? []).map(String)
    const cut = row.drop.length > 0 || row.items !== before.length ? cutItems(before, row.items, row.drop) : { kept: before }
    const items = art.has(i) ? cut.kept : before
    if (items.join('\u0001') !== before.join('\u0001')) report.itemsChanged += 1
    const patch: Record<string, unknown> = { layout: row.layout }
    if (art.has(i)) {
      patch.illustration = art.get(i)
      patch.artSide = row.artSide
      // 封面（TASKS/20b）：铺满整页，所以不取左/右，取「哪一块留给标题」
      if (slides[i]?.kind === 'cover') {
        const lay = coverLayoutOf(nums.get(i)?.quad)
        patch.coverArch = lay.arch
        patch.coverScrim = lay.scrim
      }
    }
    if (items.length > 0 || before.length > 0) patch.items = items
    return { ...s, ...patch } as S
  })

  await opts.cache.plan.save(planKey, { direct, typeset: typesetPlan }).catch(() => {})

  report.drawn = alive.size
  for (const i of alive) {
    const side = typesetPlan.pages[i]?.artSide ?? nums.get(i)?.empty ?? 'right'
    if (side === 'left') report.sides.left += 1
    else report.sides.right += 1
  }
  /* 配了几张、扔了几张、为什么扔，一律摆到界面上（2026-11-23：以前只有 402 才说话，
     图被质检扔掉时一声不吭，用户只看到「又没有插画」）。 */
  report.note = report.failures.length
    ? `配了 ${report.drawn} 张插画；${report.failures.length} 处没成（${String(report.failures[0].error).slice(0, 40)}）`
    : `本份用了 ${report.drawn} 张插画`
  lastReport = report
  return { slides: out, report }
}

/** 一份课件最多画几张：课时决定上限，导演在额度内自己挑页 */
export function allowFor(durationSeconds: number): number {
  return illustCountFor(durationSeconds)
}