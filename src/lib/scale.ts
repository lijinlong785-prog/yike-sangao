/* ================================================================== *
 * 时长 → 规模（TASKS/09 §S）                                          *
 *                                                                    *
 * 一句话：density.ts 管「一页装多少字」，本文件管「整份有多少页」。  *
 * 两件事正交——40 分钟的 standard 档 = 页多，每页还是 60 字。          *
 *                                                                    *
 * 之前选「上课 40 分钟」跟选 4 分钟出来的东西页数完全一样，原因就是   *
 * buildDeck / buildStudentSlides 的页数只受 density 的 10–14 上限控。 *
 *                                                                    *
 * 阈值：≤600 秒一律 clip，≥1200 秒一律 lesson，中间（601–1199）归 clip。*
 * 归 clip 是有意的保守取舍：宁可少排几页，也不把一个 10 分钟片段        *
 * 按整节课铺成 28 页，让老师翻页翻到手软。                            *
 * ================================================================== */

import { limitsOf, type DensityLimits, type DensityLock } from './density'

export type Scale = 'clip' | 'lesson'

export interface ScalePlan {
  scale: Scale
  /** 课件页数区间（教师版） */
  deckPages: { min: number; max: number }
  /** 课堂 PPT 页数区间（学生版） */
  slidePages: { min: number; max: number }
  /** 环节数量区间 */
  segments: { min: number; max: number }
  /** 每个环节的课堂 PPT 页数（用于备注分配） */
  pagesPerSegment: { min: number; max: number }
}

/** clip 的上界：3/4/5/10 分钟试讲、片段 */
export const CLIP_MAX_SECONDS = 600
/** lesson 的下界：40 分钟整节课 */
export const LESSON_MIN_SECONDS = 1200

/**
 * 两档参数表：
 *   clip   课件 12–16 / 课堂 PPT 10–14 / 环节 4–6 / 每环节 2–3 页
 *   lesson 课件 22–28 / 课堂 PPT 16–24 / 环节 6–7 / 每环节 3–4 页
 *
 * lesson 的课堂 PPT 从 26–36 收到 22–28（第二十轮），再收到 16–24（第二十六轮）：
 * 页数跟着「这一课有几件事可讲」走，不硬凑。20 / 30 / 40 分钟各自的区间见下面 TIERS——
 * 本表这一行只是「没给时长」时的兜底，取值与 m40 一致（整节课里最长的那一档）。
 */
const PLANS: Record<Scale, ScalePlan> = {
  clip: {
    scale: 'clip',
    deckPages: { min: 12, max: 16 },
    slidePages: { min: 10, max: 14 },
    segments: { min: 4, max: 6 },
    pagesPerSegment: { min: 2, max: 3 },
  },
  lesson: {
    scale: 'lesson',
    deckPages: { min: 22, max: 28 },
    slidePages: { min: 16, max: 24 },
    segments: { min: 6, max: 7 },
    pagesPerSegment: { min: 3, max: 4 },
  },
}

/** 时长 → 规模。非数字、负数一律当 clip（工具不能因为一个脏值就排 28 页） */
export function scaleOf(duration: number): Scale {
  const d = Number(duration)
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return 'clip'
  return 'lesson'
}

export function planOfScale(scale: Scale): ScalePlan {
  return PLANS[scale]
}

/* ================================================================== *
 * 四档时长骨架（10 §十二「课时长可变」）                               *
 *                                                                    *
 * Scale 仍只有两档（clip / lesson），因为密度与课堂 PPT 的口径只分两种； *
 * 但整节课内部不再是等差缩放：20 / 30 / 40 走不同环节骨架。           *
 * 本表是「这一档该多少页、几个环节」的唯一真源。                       *
 * ================================================================== */

export type Tier = 'clip' | 'm20' | 'm30' | 'm40'

export interface TierPlan {
  deckPages: { min: number; max: number }
  slidePages: { min: number; max: number }
  /** 环节数：20 / 30 是死数，40 是区间 */
  segments: { min: number; max: number }
  /** 骨架一句话，给文案与离线校验读 */
  skeleton: string
}

/** 精简档的上界：25 分钟（1500 秒）以内走精简 */
export const M20_MAX_SECONDS = 1500
/** 标准档的上界：35 分钟（2100 秒）往上走完整 */
export const M30_MAX_SECONDS = 2100

const TIERS: Record<Exclude<Tier, 'clip'>, TierPlan> = {
  m20: {
    deckPages: { min: 12, max: 16 },
    /** 3 个环节 × 4–5 页 + 首尾 4–5 页。
     *  第二十六轮曾下调到 11–16（「没有材料的页不许上屏」）；2026-11-22 用户验收再改口径：
     *  「内容太少，肯定不够讲 40 分钟…可以多增页数」——薄不是靠砍页解决的，是靠每页
     *  内容下限（materialProblems 的「正文页太薄」）+ 原文页印整段解决的。页数上限回到能撑满课堂的量。 */
    slidePages: { min: 11, max: 20 },
    segments: { min: 3, max: 3 },
    skeleton: '导入 + 精读 + 小结',
  },
  m30: {
    deckPages: { min: 16, max: 20 },
    /** 4 个环节 × 4–5 页 + 首尾 4–5 页；2026-11-22 用户口径：页数要撑满课堂 */
    slidePages: { min: 13, max: 26 },
    segments: { min: 4, max: 4 },
    skeleton: '导入 + 初读 + 精读 + 小结',
  },
  m40: {
    deckPages: { min: 22, max: 28 },
    /** 6–7 个环节 × 3–4 页 + 首尾 5–6 页；2026-11-22 用户拍板上限 34（约 1.2 分钟/页）。
     *  上一版 16–24 被用户指着说「不够讲 40 分钟」；模型上次顶到上限 24 就停，上限不改它永远只给 24。
     *  下限不动（16）：内置薄教案离线只有 16–20 页，抬下限等于逼代码编页填空。 */
    slidePages: { min: 16, max: 34 },
    segments: { min: 6, max: 7 },
    skeleton: '导入 + 初读 + 精读 + 品句 + 拓展 + 小结（含字词 / 练习 / 检测）',
  },
}

/** 时长 → 骨架档。非数字 / 负数 / 片段一律 clip（工具不能因为一个脏值就排 28 页） */
export function tierOf(duration: number): Tier {
  const d = Number(duration)
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return 'clip'
  // 区间闭合在两端：25 分钟整仍算精简，35 分钟整仍算标准（36 起才是完整）
  if (d <= M20_MAX_SECONDS) return 'm20'
  if (d <= M30_MAX_SECONDS) return 'm30'
  return 'm40'
}

/** 某一档的页数与环节参数；clip 沿用原表（不改 07 / 08 的任何数字） */
export function tierPlanOf(tier: Tier): TierPlan {
  if (tier === 'clip') {
    const base = PLANS.clip
    return {
      deckPages: base.deckPages,
      slidePages: base.slidePages,
      segments: base.segments,
      skeleton: '导入 → 初读 → 精读 → 拓展 → 小结',
    }
  }
  return TIERS[tier]
}

/** 课件页数区间：按所选时长，而不是只分 clip / lesson */
export function deckRangeFor(duration: number): { min: number; max: number } {
  return tierPlanOf(tierOf(duration)).deckPages
}

/**
 * 课堂 PPT 页数区间：跟着时长走（20 / 30 分钟的课不该撑成 28 页）。
 * 生成（lessonSlides）与校验（validateSlides / 导出）都从这里取同一个区间。
 */
export function slideRangeFor(duration: number): { min: number; max: number } {
  return tierPlanOf(tierOf(duration)).slidePages
}

/** 页数夹到区间里，且不返回小数（页数只能是整数） */
export function clampPageCount(n: number, range: { min: number; max: number }): number {
  return Math.max(range.min, Math.min(range.max, Math.round(Number(n) || 0)))
}

/**
 * 生成 / 校验实际生效的上限：字数、items、精读页数仍按密度档，**页数改按规模**。
 * 这是 density 与 scale 唯一的交叉点，其余地方不许再把两者混着算。
 *
 * 精读页数在 lesson 档放得开：一篇 40 分钟的课，每个环节都可能有一页「读进去」，
 * 沿用 clip 的 2–3 页上限会把其中大半砍掉。这里按每环节一页给足。
 */
export function limitsFor(
  densityLock: DensityLock | undefined | null,
  scale: Scale,
  /** 传了就看这一档的页数（20 / 30 / 40 各不相同）；不传沿用 lesson 兜底 22–28 */
  duration?: number
): DensityLimits {
  const base = limitsOf(densityLock)
  /* clip 档一字不改地返回密度那套：07/08 的 10–14 页、lean 的 10 页都原样保留。
   * 只有 lesson 档才推翻页数——否则 clip 档的手锁档位会被这里静默改掉。 */
  if (scale !== 'lesson') return base
  const plan = planOfScale(scale)
  const hasTier = typeof duration === 'number' && Number.isFinite(duration)
  const pages = hasTier ? slideRangeFor(duration) : plan.slidePages
  const segMax = hasTier ? tierPlanOf(tierOf(duration)).segments.max : plan.segments.max
  return {
    ...base,
    pagesMin: pages.min,
    pagesMax: pages.max,
    closeReadMax: Math.max(base.closeReadMax, segMax),
  }
}