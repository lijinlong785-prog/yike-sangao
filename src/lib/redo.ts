import type { LessonPlan } from '../types'
import { postChatJson, type LLMConfig } from './llm'
import { deckPageKey, type DeckPage } from './deck'

/* ================================================================== *
 * 点名重做（10 §十三 第 6 件）
 *
 * 「第九页重来」「第三到第五页」——只重出被点名的页，其余页一个字节都不动。
 * 默认不联动：不改页数、不重排、不碰没点名的页。
 *
 * 两条路：
 *   · 有 Key：只把这几个页交给模型重写（一次请求，只发这几页的上下文）；
 *   · 没 Key / 失败 / 交回不合格：按这一版原稿把这几页恢复成生成版，
 *     同时仍不动没点名的页。界面上要如实说是哪条路。
 * ================================================================== */

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

/** 「九」「十二」「二十三」「3」→ 数字；认不出返回 null */
export function cnNumber(text: string): number | null {
  const t = String(text ?? '')
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .trim()
  if (!t) return null
  if (/^\d+$/.test(t)) return Number(t)
  const chars = [...t]
  if (!chars.every((c) => c in CN_DIGIT)) return null
  if (chars.includes('十')) {
    const at = chars.indexOf('十')
    const tens = at === 0 ? 1 : CN_DIGIT[chars[at - 1]] ?? NaN
    const ones = at === chars.length - 1 ? 0 : CN_DIGIT[chars[at + 1]] ?? NaN
    return Number.isFinite(tens) && Number.isFinite(ones) ? tens * 10 + ones : null
  }
  // 没有「十」：逐位拼（「一二」= 12；单个「九」= 9）
  let n = 0
  for (const c of chars) {
    const d = CN_DIGIT[c]
    if (!Number.isFinite(d)) return null
    n = n * 10 + d
  }
  return n
}

export interface RedoRequest {
  /** 被点名的页（1 起） */
  targets: number[]
  /** 写在页码之外、或者超出总页数的数字 */
  outOfRange: number[]
  /** 说了「全部 / 整份」 */
  all: boolean
}

const NUM = '([0-9０-９一二两三四五六七八九十]{1,3})'

/**
 * 从一句人话里挑出页码。
 * 认这些写法：「第九页重来」「第9页」「第三到第五页」「第3-5页」「第9、11页」「第十页和第十二页」「全部重来」。
 * 认不出的文字一律忽略（不猜），越界的页码进 outOfRange，不静默夹到第一页。
 */
export function parsePageTargets(text: string, total: number): RedoRequest {
  const raw = String(text ?? '')
  const outOfRange: number[] = []
  const nums: number[] = []
  if (/全部|整份|所有页|整篇/.test(raw)) {
    return { targets: Array.from({ length: Math.max(0, total) }, (_, i) => i + 1), outOfRange, all: true }
  }

  // 先吃掉区间：第 X 到 / 至 / - / — / ~ 第 Y 页
  const spans: [number, number][] = []
  const rangeRe = new RegExp(`第?\\s*${NUM}\\s*(?:到|至|－|-|—|~)\\s*第?\\s*${NUM}\\s*页?`, 'g')
  let cleaned = raw
  for (const m of raw.matchAll(rangeRe)) {
    const a = cnNumber(m[1])
    const b = cnNumber(m[2])
    if (a === null || b === null) continue
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    for (let n = lo; n <= hi; n++) nums.push(n)
    if (m.index !== undefined) spans.push([m.index, m.index + m[0].length])
  }
  if (spans.length) {
    const chars = [...cleaned]
    for (const [from, to] of spans) for (let i = from; i < to; i++) chars[i] = ' '
    cleaned = chars.join('')
  }

  // 再吃单页：第 X 页 / X 页
  const singleRe = new RegExp(`(?:第\\s*)?${NUM}\\s*页`, 'g')
  for (const m of cleaned.matchAll(singleRe)) {
    const n = cnNumber(m[1])
    if (n !== null) nums.push(n)
  }
  // 最后吃裸页码（「9」「9、11」），只认独立的数字，别把「40 分钟」当页码
  const bareRe = new RegExp(`(?<![0-9０-９])${NUM}(?![0-9０-９]\\s*(?:分钟|秒|字|页))`, 'g')
  for (const m of cleaned.matchAll(bareRe)) {
    if (!/[0-9０-９一二两三四五六七八九十]/.test(m[0])) continue
    const n = cnNumber(m[1])
    if (n !== null) nums.push(n)
  }

  const targets: number[] = []
  for (const n of nums) {
    if (n < 1 || n > total) {
      if (!outOfRange.includes(n)) outOfRange.push(n)
    } else if (!targets.includes(n)) {
      targets.push(n)
    }
  }
  targets.sort((a, b) => a - b)
  outOfRange.sort((a, b) => a - b)
  return { targets, outOfRange, all: false }
}

export interface RedoResult {
  pages: DeckPage[]
  /** 真正换掉的页（1 起） */
  done: number[]
  /** 原稿里找不到同身份页的（用户自己插的页） */
  missed: number[]
}

/**
 * 按原稿重出点名页：只换这几页，其余页原样返回（连引用都不变）。
 * 重出的页打 userEdited —— 它是用户点名要的那一版，换规模时不许被覆盖。
 */
export function redoDeckPages(
  pages: DeckPage[],
  targets: number[],
  fresh: DeckPage[]
): RedoResult {
  const next = [...pages]
  const done: number[] = []
  const missed: number[] = []
  for (const t of targets) {
    const at = t - 1
    const page = next[at]
    if (!page) {
      missed.push(t)
      continue
    }
    const src = fresh.find((p) => deckPageKey(p) === deckPageKey(page))
    if (!src) {
      missed.push(t)
      continue
    }
    next[at] = {
      ...src,
      layout: page.layout,
      visual: page.visual,
      userEdited: true,
    }
    done.push(t)
  }
  return { pages: next, done, missed }
}

/* ------------------------- 有 Key：只重写这几页 ------------------------- */

export interface RedoReport extends RedoResult {
  source: 'llm' | 'builtin'
  /** 走内置 / 回退时的人话原因 */
  reason?: string
}

function redoPrompt(plan: LessonPlan, picked: { index: number; page: DeckPage }[]): {
  system: string
  user: string
} {
  const system = [
    '你是给师范生改课件的中文助手。只重写用户点名的那几页，别的一律不碰。',
    '每一页交回 JSON：{"pages":[{"index":9,"title":"...","bullets":["..."],"question":"...","notes":"..."}]}',
    '硬要求：index 用用户给的页码；title ≤18 字；bullets 2–4 条、每条 ≤44 字；question 一句问句；notes 60–150 字、口语、能直接念。',
    '不要写「教学目标 / 教学重难点 / 教学过程 / 环节 / 时长 / 本环节旨在 / 核心素养」这些教研腔词。',
    '不要新增页、不要删页、不要改没点名的页。',
  ].join('\n')

  const lines = picked.map(({ index, page }) => {
    const now = [page.title, ...(page.bullets ?? []), page.question ?? ''].filter(Boolean).join(' / ')
    return `第 ${index} 页（${page.label}）：${now}`
  })
  const user = [
    `课文：《${plan.meta.topic}》（${plan.meta.stage}${plan.meta.grade}·${plan.meta.subject}·${plan.meta.period}）`,
    `重点：${plan.keyPoint}`,
    `难点：${plan.hardPoint}`,
    `只重写下面这几页：`,
    ...lines,
    '交回 JSON，pages 里只许出现上面这几个 index。',
  ].join('\n')
  return { system, user }
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => String(s ?? '').trim()).filter(Boolean)
}

/** 模型交回的单项是否可用：title / notes 不能空，bullets 至少一条 */
function llmPageOk(raw: unknown): raw is { index: number; title: string; bullets: string[]; question?: string; notes: string } {
  const d = (raw ?? {}) as Record<string, unknown>
  const title = String(d.title ?? '').trim()
  const notes = String(d.notes ?? '').trim()
  const bullets = stringList(d.bullets ?? d.items)
  return Boolean(title && notes && bullets.length > 0)
}

/**
 * 点名重做永远走模型：没填 key 也走同源代理（落点由 endpointOf 裁决，这里不看 key）。
 * 任何一步不合格都退回「按原稿重出」，并带回原因。
 * 无论哪条路，没点名的页都原样保留（引用不变）。
 */
export async function redoPagesWithLLM(input: {
  pages: DeckPage[]
  targets: number[]
  fresh: DeckPage[]
  plan: LessonPlan
  cfg: LLMConfig
  signal?: AbortSignal
}): Promise<RedoReport> {
  const { pages, targets, fresh, plan, cfg, signal } = input
  const fallback = redoDeckPages(pages, targets, fresh)
  // 一页都没点名：没有活要干，直接是这次原稿
  if (targets.length === 0) return { ...fallback, source: 'builtin' }

  const picked = targets
    .map((t) => ({ index: t, page: pages[t - 1] }))
    .filter((p): p is { index: number; page: DeckPage } => Boolean(p.page))

  try {
    const { system, user } = redoPrompt(plan, picked)
    const raw = await postChatJson(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      cfg,
      signal
    )
    if (signal?.aborted) return { ...fallback, source: 'builtin', reason: '重做被取消了。' }

    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as Record<string, unknown>)?.pages)
        ? ((raw as Record<string, unknown>).pages as unknown[])
        : []
    const next = [...pages]
    const done: number[] = []
    for (const item of list) {
      if (!llmPageOk(item)) continue
      const index = Number((item as Record<string, unknown>).index)
      if (!targets.includes(index)) continue
      const at = index - 1
      const page = next[at]
      if (!page) continue
      next[at] = {
        ...page,
        title: String(item.title).trim(),
        bullets: stringList(item.bullets).slice(0, 4),
        question: String(item.question ?? '').trim() || page.question,
        notes: String(item.notes).trim(),
        baseTitle: page.baseTitle ?? page.title,
        userEdited: true,
      }
      if (!done.includes(index)) done.push(index)
    }
    if (done.length === 0) {
      return { ...fallback, source: 'builtin', reason: '模型没交出可用的页面，按这一版原稿重出。' }
    }
    const missed = targets.filter((t) => !done.includes(t))
    return { pages: next, done: done.sort((a, b) => a - b), missed, source: 'llm' }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
    const reason = /abort/i.test(msg)
      ? '重做被取消了，按这一版原稿重出。'
      : '接口没有回话，按这一版原稿重出这几页。'
    return { ...fallback, source: 'builtin', reason }
  }
}