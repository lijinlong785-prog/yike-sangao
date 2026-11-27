/**
 * 「大概还要多久」（2026-11-22 用户要求）。
 *
 * 一次生成要等两三分钟，从前界面上只有一个「生成中…」，老师不知道是卡了还是
 * 在跑——这一层把每一段的预算摆出来，用现算的剩余时间给他一个数。
 *
 * 预算取自第二十九轮真机四课实测（零密钥 → 同源代理 → DeepSeek，2026-11-22）：
 *   备课包   26.8 / 72.0 / 74.1 / 97.3 秒
 *   学生版   110.7 / 115.3 / 133.5 / 168.0 秒（重写一遍 + 定画 + 排版）
 * 取中位数往上一点落预算：宁可先说长一点，也不要走到 10 秒底线还在跑——
 * 浏览器实测那一轮备课包跑到 90 秒、学生版重写跑到 55 秒以上，所以 plan 85 / llm 65。
 *
 * 两条规矩：
 * 1. 不造假动画：剩余时间从阶段预算现算，每秒减一，不播固定的假进度；
 * 2. 不归零（用户口径）：算到「约还需 10 秒」就停住，不再往下减——
 *    页面还在转的时候，10 秒是诚实的下界，0 秒是谎话。
 */

export type RunStage = 'plan' | 'llm' | 'builtin' | 'direct' | 'illust' | 'typeset'

/** 每一段的预算（秒）。illust 按张算，见 ILLUS_SECONDS */
const STAGE_SECONDS: Record<RunStage, number> = {
  plan: 85,
  llm: 65,
  builtin: 8,
  direct: 45,
  illust: 0,
  typeset: 18,
}

/** 一张插画的预算：auto 链第一枪是百炼 qwen-image-3.0，2026-11-23 本地代理实测
 *  一张 50.8 秒（服务端注释也是 40~60 秒）——旧的 12 秒是硅基 Z-Image 的口径，
 *  拿它算百炼，倒计时会早早撞到 10 秒底线然后停几分钟，用户看着就是「卡死」。 */
export const ILLUS_SECONDS = 50

/** 学生版那一条链的顺序：算「还剩多少」得把后面还没走的段一起加上 */
const CHAIN: RunStage[] = ['llm', 'direct', 'illust', 'typeset']

/** 不归零的下界（秒） */
export const ETA_FLOOR = 10

/** 进度条最多走到 92%：页面没拿到之前，不许显示「完成」 */
const PCT_CAP = 0.92

export interface EtaInput {
  stage: RunStage
  /** 本阶段开始的时刻（毫秒时间戳）；0 = 还没开始 */
  at: number
  /** 本阶段已完成多少（插图张数 / 兜底页数）；没有分页的阶段不给 */
  page?: number
  /** 本阶段总数；没有分页的阶段不给 */
  total?: number
  /**
   * 这一叠配不配插画（默认关）。配了才把插图那一段算进总时长；
   * 不给时按「正在插图」当刻反推——那一阶段自己一定算。
   */
  illust?: boolean
  /**
   * 已用工作量的下界（秒）：RunMeter 记的高水位。某一段超预算时 elapsed 会
   * 吃过本段预算，换阶段那一刻「前面几段按整段扣」反而比它小——拿高水位托住，
   * 剩余时间与进度条换阶段时不许往回跳。
   */
  usedFloor?: number
  /**
   * 距离上一次「张数 / 页码变化」过去了几秒（RunMeter 现量）。
   * 带页数的阶段用它把倒计时钉在秒上：按页算的进度是台阶，两张图之间
   * 台阶不动，加上这段秒数才是一直往下走的斜线（2026-11-23 真机第三次：
   * 冻在「1 分 53 秒」——max(按页, 本段已等) 里按页更大时仍是常数）。
   */
  sincePage?: number
}

export interface Eta {
  /** 还要多久（秒），已按「封顶不归零」处理，最小 ETA_FLOOR */
  left: number
  /** 整条链走过多少（0–0.92），给细进度条用 */
  pct: number
  /** 已用工作量（秒）：给 RunMeter 记高水位用 */
  used: number
}

function budgetOf(stage: RunStage, total = 0, illust = false): number {
  if (stage !== 'illust') return STAGE_SECONDS[stage]
  /* 还没报张数时按满配 6 张预扣（2026-11-23）：不然文字阶段把插图算成 0，
     倒计时早早撞底冻住；真张数到了（≤6）总预算只缩不涨，进度条只往前。 */
  return illust ? ILLUS_SECONDS * Math.min(6, Math.max(1, total || 6)) : 0
}

/**
 * 现算「还剩多久」。
 * · plan 只有一段：预算 75 秒，超了就停在 10 秒；
 * · 学生版是一条链（重写 → 定画 → 插画 → 排版）：剩余 = 本段没走完的 + 后面几段的预算；
 *   进度条从整条链算起，换阶段只会往前走，不会倒回去；
 * · 带页数的阶段（插画、兜底页）按页算进度，其余按本段已等的秒数算。
 */
export function etaOf(input: EtaInput, now = Date.now()): Eta {
  const illust = input.illust === true || input.stage === 'illust'
  const total = input.total ?? 0
  const budget = (s: RunStage) => budgetOf(s, total, illust)
  const elapsed = input.at > 0 ? Math.max(0, (now - input.at) / 1000) : 0

  if (input.stage === 'plan') {
    const b = STAGE_SECONDS.plan
    const used = Math.max(elapsed, input.usedFloor ?? 0)
    return {
      left: Math.max(ETA_FLOOR, Math.round(b - used)),
      pct: Math.min(PCT_CAP, b > 0 ? used / b : 0),
      used,
    }
  }

  // builtin 是重写失败后的另一条腿，跟重写互斥：它之后仍是定画 → 插画 → 排版
  const chain = input.stage === 'builtin' ? (['builtin', ...CHAIN.slice(1)] as RunStage[]) : CHAIN
  const idx = Math.max(0, chain.indexOf(input.stage))
  const whole = chain.reduce((n, s) => n + budget(s), 0)
  const before = chain.slice(0, idx).reduce((n, s) => n + budget(s), 0)
  const here = budget(input.stage)
  /* 有页数：按页的台阶 + 距上次翻页的秒数（sincePage，RunMeter 现量）。
     两张图之间台阶不动，秒数照走——倒计时永远是斜线不是台阶（2026-11-23 真机三次：
     「1 分 3 秒」文字段封顶冻、「18 秒」图报满冻、「1 分 53 秒」max(按页,已等) 仍冻）。
     无页数：本段已等秒数，不封顶——超预算就继续吃后面的预算，一路减到 10 秒底线。 */
  const usedHere =
    total > 0
      ? here * Math.min(1, Math.max(0, (input.page ?? 0) / total)) + Math.max(0, input.sincePage ?? 0)
      : elapsed
  /* 进度条从整条链算起（走过的那几段按整段计入），不能只拿本段盛——
     否则一换阶段百分比就倒着走。高水位（usedFloor）托住换阶段那一刻的回跳。 */
  const used = Math.max(before + usedHere, input.usedFloor ?? 0)
  return {
    left: Math.max(ETA_FLOOR, Math.round(whole - used)),
    pct: whole > 0 ? Math.min(PCT_CAP, used / whole) : 0,
    used,
  }
}

/** 秒数 → 人话：「约还需 1 分 10 秒」；不足一分钟只说秒 */
export function etaText(leftSeconds: number): string {
  const s = Math.max(ETA_FLOOR, Math.round(leftSeconds))
  if (s < 60) return `约还需 ${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `约还需 ${m} 分钟` : `约还需 ${m} 分 ${r} 秒`
}