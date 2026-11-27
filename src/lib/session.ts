/**
 * 「刷新不丢」——把这一课的原稿、学生版、改过的字、挑的模板落在本机（TASKS/21 §二.6）。
 *
 * 为什么要有这一个文件：老师改完学生版、插过页，一刷新回到首页，全都得重来；
 * 之前《少年闰土》就是这么丢的。教师课件本来有 deckStore 兜着，稿子和学生版没有。
 *
 * 三条边界：
 * 1. 只存「本机最近一课」，换课 / 点「重新备课」就清掉——不是多课存档，不做课程库。
 * 2. 插图（data:image/png;base64）不进存档：一张 1MB 上下，六张就把 5MB 配额撑爆。
 *    刷新后插画位退回线稿 / 空位，其余一个字都不丢；写不下时整份降级成「只留稿子」。
 * 3. 读出来的脏数据一律当没存：版本不对、缺 meta、JSON 坏了，都返回 null，不许让首页崩。
 *
 * 读写在 localStorage；纯函数（读 / 合并 / 剥图 / 档位判断）单独导出，门禁直接测。
 */
import type { LessonInput, LessonPlan } from '../types'
import type { StudentSlide } from './slides'
import { tierOf } from './scale'
import { EMPTY_EDITS, type DeckEdits } from './deck2/edits'
import type { TemplateId } from './deck2/theme'

export const SESSION_KEY = 'yike.session.v1'
export const SESSION_VERSION = 1
/** localStorage 一般 5MB；留 800KB 余量给别的键，超过就退到「不留学生版」 */
const MAX_BYTES = 4_200_000

export interface SessionSnapshot {
  v: number
  savedAt: number
  /** 首页那一路输入（拍照 / 口述的原文也在里面，重出要用） */
  input: LessonInput
  plan: LessonPlan
  duration: number
  isDemo: boolean
  /** 这一课的身份：课题 | 课时 | 档位。同档改分钟数不清屏（见 durationGuard） */
  planKey: string
  /** 学生版那一叠（插画已剥掉） */
  slides: StudentSlide[]
  /** 这一叠是从哪一版课件生成的（student.fingerprint） */
  fingerprint: string
  degraded: boolean
  edits: DeckEdits
  templateId: TemplateId | null
  tab: 'deck' | 'student'
  slideAt: number
}

/** 存档里最少要有这些，少一个就当没存 */
function looksLikePlan(p: unknown): p is LessonPlan {
  const plan = p as LessonPlan | null
  return Boolean(plan && plan.meta && typeof plan.meta.topic === 'string' && plan.meta.topic)
}

function looksLikeInput(i: unknown): i is LessonInput {
  const input = i as LessonInput | null
  return Boolean(input && typeof input === 'object' && typeof input.duration === 'number')
}

/** 纯函数：把一段 JSON 读成快照；版本不对 / 缺字段 / 坏了都返回 null */
export function parseSession(raw: string | null | undefined): SessionSnapshot | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const s = data as Partial<SessionSnapshot> | null
  if (!s || s.v !== SESSION_VERSION) return null
  if (!looksLikePlan(s.plan) || !looksLikeInput(s.input)) return null
  const duration = Number(s.duration)
  if (!Number.isFinite(duration) || duration <= 0) return null
  const slides = Array.isArray(s.slides) ? s.slides.filter((x) => x && typeof x.kind === 'string') : []
  return {
    v: SESSION_VERSION,
    savedAt: Number(s.savedAt) || Date.now(),
    input: s.input,
    plan: s.plan,
    duration,
    isDemo: Boolean(s.isDemo),
    planKey: typeof s.planKey === 'string' && s.planKey ? s.planKey : planKeyOf(s.plan, duration),
    slides,
    fingerprint: typeof s.fingerprint === 'string' ? s.fingerprint : '',
    degraded: Boolean(s.degraded),
    edits: s.edits && typeof s.edits === 'object' ? (s.edits as DeckEdits) : EMPTY_EDITS,
    templateId: typeof s.templateId === 'string' ? s.templateId : null,
    tab: s.tab === 'student' ? 'student' : 'deck',
    slideAt: Math.max(0, Math.floor(Number(s.slideAt) || 0)),
  }
}

/**
 * 纯函数：合并写入（App 存稿子、Result 存改字，两边不互相覆盖）。
 * 第一次写没有旧档：只要这次带的 patch 里有 plan + input，就当全量落一份。
 */
export function mergeSession(
  prev: SessionSnapshot | null,
  patch: Partial<Omit<SessionSnapshot, 'v' | 'savedAt'>>
): SessionSnapshot | null {
  if (prev) {
    const next: SessionSnapshot = { ...prev, ...patch, v: SESSION_VERSION, savedAt: Date.now() }
    if (!looksLikePlan(next.plan) || !looksLikeInput(next.input)) return null
    return next
  }
  const p = patch as Partial<SessionSnapshot>
  if (!looksLikePlan(p.plan) || !looksLikeInput(p.input)) return null
  const duration = Number(p.duration) || 2400
  return {
    v: SESSION_VERSION,
    savedAt: Date.now(),
    input: p.input,
    plan: p.plan,
    duration,
    isDemo: Boolean(p.isDemo),
    planKey: typeof p.planKey === 'string' && p.planKey ? p.planKey : planKeyOf(p.plan, duration),
    slides: Array.isArray(p.slides) ? p.slides : [],
    fingerprint: typeof p.fingerprint === 'string' ? p.fingerprint : '',
    degraded: Boolean(p.degraded),
    edits: p.edits ?? EMPTY_EDITS,
    templateId: p.templateId ?? null,
    tab: p.tab === 'student' ? 'student' : 'deck',
    slideAt: Math.max(0, Math.floor(Number(p.slideAt) || 0)),
  }
}

/** 纯函数：剥掉插画（6 张 base64 能撑爆配额），其余字段原样，不改入参 */
export function stripIllustration(slides: readonly StudentSlide[]): StudentSlide[] {
  return (slides ?? []).map((s) => {
    if (!s || !s.illustration) return s
    const next: StudentSlide = { ...s }
    delete next.illustration
    delete next.artSide
    delete next.coverArch
    delete next.coverScrim
    return next
  })
}

/** 这一课的身份：换课题 / 换课时 / 跨档才换屏；同档只改分钟数不算换课 */
export function planKeyOf(plan: LessonPlan | null | undefined, duration: number): string {
  if (!plan) return ''
  const topic = String(plan.meta?.topic ?? '').trim()
  const period = String(plan.meta?.period ?? '').trim()
  return `${topic}|${period}|${tierOf(duration)}`
}

/**
 * 改时长之前先问一句：同档不重置（页数没变）；跨档且改过东西才需要确认。
 * 返回 'ok' = 直接改；'confirm' = 界面问一句再改。
 */
export function durationGuard(currentSec: number, nextSec: number, editedCount: number): 'ok' | 'confirm' {
  if (editedCount <= 0) return 'ok'
  return tierOf(currentSec) === tierOf(nextSec) ? 'ok' : 'confirm'
}

/** 存档大小（字节，UTF-16 粗略按 2 算）——写不下时用它决定要不要丢学生版 */
export function sessionBytes(session: SessionSnapshot): number {
  try {
    return JSON.stringify(session).length * 2
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 读本机存档（只读一次，调用方自己决定要不要用） */
export function loadSession(): SessionSnapshot | null {
  const s = storage()
  if (!s) return null
  try {
    return parseSession(s.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

/**
 * 写存档：与已有内容合并，不互相覆盖。
 * 存不下时依次降级：去插画 → 去学生版（只留稿子）→ 放弃，不让一次写失败把页面弄崩。
 */
function stripEditIllustrations(edits: DeckEdits): DeckEdits {
  if (!edits) return edits
  let dirty = false
  const patches: DeckEdits['patches'] = {}
  for (const [k, p] of Object.entries(edits.patches ?? {})) {
    if (p && typeof p.illustration === 'string' && p.illustration.startsWith('data:image/')) {
      dirty = true
      const rest = { ...p }
      delete rest.illustration
      patches[Number(k)] = rest
    } else if (p) {
      patches[Number(k)] = p
    }
  }
  let added = edits.added
  if (added) {
    const nextAdded: Record<string, StudentSlide> = {}
    for (const [id, s] of Object.entries(added)) {
      if (s?.illustration && s.illustration.startsWith('data:image/')) {
        dirty = true
        const copy = { ...s }
        delete copy.illustration
        nextAdded[id] = copy
      } else {
        nextAdded[id] = s
      }
    }
    added = nextAdded
  }
  return dirty ? { ...edits, patches, ...(added ? { added } : {}) } : edits
}

export function saveSession(patch: Partial<Omit<SessionSnapshot, 'v' | 'savedAt'>>): void {
  const s = storage()
  if (!s) return
  const prev = parseSession(s.getItem(SESSION_KEY))
  const merged = mergeSession(prev, patch)
  if (!merged) return
  /* 插画一律不落盘：调用方忘刺了也不会把配额塔进去 */
  const lean: SessionSnapshot = {
    ...merged,
    slides: stripIllustration(merged.slides),
    edits: stripEditIllustrations(merged.edits),
  }
  const attempts: SessionSnapshot[] = [lean, { ...lean, slides: [] }]
  for (const item of attempts) {
    try {
      const raw = JSON.stringify(item)
      if (raw.length * 2 > MAX_BYTES && item.slides.length > 0) continue
      s.setItem(SESSION_KEY, raw)
      return
    } catch {
      /* 配额满 / 隐私模式：换下一种更小的写法 */
    }
  }
}

export function clearSession(): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(SESSION_KEY)
  } catch {
    /* 隐私模式下删不掉也不算错 */
  }
}