/* ================================================================== *
 * 三档密度（TASKS/08 §B）                                            *
 *                                                                    *
 * slides.ts 从前把「每页 ≤30 字 / 10 页 / items ≤4 / 精读 ≤2 页」写死， *
 * 模型再强也只能交简笔画——这是「太简单」的真正原因。这里把那根绳子松成   *
 * 三档，档位由模型判据决定，也允许在 Settings 里手动锁死。               *
 *                                                                    *
 * 本文件是密度上限的唯一真源：slides.ts / prompt.ts / 校验脚本一律 import， *
 * 别处不再各写一套字数、items、页数、精读页数的硬编码。                   *
 * ================================================================== */

export type Density = 'lean' | 'standard' | 'rich'
/** Settings 里可锁的档位；'auto' = 由模型按判据自定（不锁死） */
export type DensityLock = 'auto' | Density

export const DENSITY_ORDER: Density[] = ['lean', 'standard', 'rich']

export const DENSITY_LABELS: Record<Density, string> = {
  lean: '精简',
  standard: '标准',
  rich: '充实',
}

/** 默认档：任务书裁定 standard（08 §B 覆盖 07）。未锁档、内置/泛化产物都按这一档 */
export const DEFAULT_DENSITY: Density = 'standard'

export interface DensityLimits {
  /** 每页正文（line + items）字数上限 */
  bodyChars: number
  /** 页数下限 */
  pagesMin: number
  /** 页数上限 */
  pagesMax: number
  /** 非字词页 items 数量上限（字词页另由 WORDS_ITEMS_MAX 恒 ≤4 锁死） */
  itemsMax: number
  /** 精读（close-read）页数上限 */
  closeReadMax: number
}

/**
 * 三档参数表（任务书 §B.2 逐格对齐）：
 *   lean     正文 ≤30 / 10 页      / items ≤4 / 精读 2 页
 *   standard 正文 ≤60 / 10–12 页   / items ≤5 / 精读 2–3 页（默认档）
 *   rich     正文 ≤90 / 12–14 页   / items ≤6 / 精读 3 页
 *
 * 生成路径默认走 limitsOf('auto') = ENVELOPE（正文 ≤90），所以「一页能写多少字」
 * 实际是 90；三档的区别在页数与 items 条数（讲得多就多排页，不是一页塞满）。
 */
export const DENSITY: Record<Density, DensityLimits> = {
  lean: { bodyChars: 30, pagesMin: 10, pagesMax: 10, itemsMax: 4, closeReadMax: 2 },
  standard: { bodyChars: 60, pagesMin: 10, pagesMax: 12, itemsMax: 5, closeReadMax: 3 },
  rich: { bodyChars: 90, pagesMin: 12, pagesMax: 14, itemsMax: 6, closeReadMax: 3 },
}

/**
 * 字词页每页词数上限——物理裁决：任何档位都锁 ≤4 词。
 * rich 的 items ≤6 只作用于非字词页；54pt 放大的字词页撑不到 6 行（任务 #4），
 * 所以这条不随档位放宽，slides.ts 与 validateSlides 都直接用它。
 */
export const WORDS_ITEMS_MAX = 4

export const DEFAULT_LIMITS: DensityLimits = DENSITY[DEFAULT_DENSITY]

/**
 * 三档并集：作为 validateSlides / pptx 导出的安全网默认。
 * 一份产物属于哪一档已经定了，导出时不该因为「校验用了默认档上限」而把 rich 的
 * 14 页 / ≤90 字误拒，所以安全网取最宽的一档；离线页数断言也用它派生的区间。
 */
export const ENVELOPE: DensityLimits = {
  bodyChars: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].bodyChars)),
  pagesMin: Math.min(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMin)),
  pagesMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMax)),
  itemsMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].itemsMax)),
  closeReadMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].closeReadMax)),
}

/** 离线页数断言的区间：由三档并集派生（10–14），不再钉死「必须 10 页」 */
export const PAGE_RANGE = { min: ENVELOPE.pagesMin, max: ENVELOPE.pagesMax }

/** 值域收窄：Settings / cfg 里的字符串是不是一个合法档位 */
export function isDensity(x: unknown): x is Density {
  return x === 'lean' || x === 'standard' || x === 'rich'
}

/**
 * 把锁档解析成「生成路径实际生效的 clamp / 校验上限」：
 *   - 锁到具体档（lean / standard / rich）→ 该档上限，加固与校验都按这一档；
 *   - 'auto' 或未给 → 三档并集 ENVELOPE：模型自选任意一档都不被误伤、不过早截断。
 * 内置 / 泛化的静态产物默认走 DEFAULT_LIMITS（standard），对 lean 手写数据幂等。
 */
export function limitsOf(lock: DensityLock | undefined | null): DensityLimits {
  return isDensity(lock) ? DENSITY[lock] : ENVELOPE
}

/**
 * 缓存钥匙用的「实际生效档位」指纹（TASKS/08 §B 补漏）：
 * 垃圾值与未给一律归 'auto'，与 limitsOf 的分辨力逐字对齐——
 * 四个取值（lean / standard / rich / auto）两两指纹不同，切档必然换钥匙。
 * student.ts 的 cacheRef / pendingRef 拿它当钥匙的一元，离线断言也直接 import 这一份。
 */
export function densityFingerprint(lock: DensityLock | undefined | null): DensityLock {
  return isDensity(lock) ? lock : 'auto'
}
