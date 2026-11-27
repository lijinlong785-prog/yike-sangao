/**
 * 插画兜底 · 按学科画的线稿（TASKS/24 §三）
 *
 * 有图时封面就是那张画；没图时不能白卡，可也不能一律画桂花雨——
 * 语文课画雨丝，数学课画方格，英语课画四线三格，科学课画坐标与柱，史地课画经纬网。
 * 这一份只给「封面 / 无图」用，元素全是轴对齐的细线（.pptx 里就是 rect，斜线会坏文件）。
 *
 * 三条硬边界：
 *   · 纯常量：不取随机、不读时间，place() 的纯函数判据不能被它破坏；
 *   · 位子在右半张（x .55–.95），与左边的标题错开，任何一套模板都不压字；
 *   · 每套都是 6–7 笔，线宽 .0018、透明度 28%（与 TASKS/20b §2.4 同一个口径）。
 */
export type MotifKey = 'chinese' | 'math' | 'english' | 'science' | 'humanities' | 'neutral'

export interface MotifStroke {
  x: number
  y: number
  w: number
  h: number
}

export interface Motif {
  key: MotifKey
  /** 这套线稿读成什么（写进 dump 与缩略图说明，不上面） */
  note: string
  ground: MotifStroke
  strokes: MotifStroke[]
}

const W = 0.0018

/** 一条竖笔 */
const v = (x: number, y: number, h: number): MotifStroke => ({ x, y, w: W, h })
/** 一条横笔 */
const hbar = (x: number, y: number, w: number): MotifStroke => ({ x, y, w, h: W })

export const MOTIFS: Record<MotifKey, Motif> = {
  /* 语文：地平线 + 雨丝（沿用 20b 那一套，一个数都没改） */
  chinese: {
    key: 'chinese',
    note: '雨丝',
    ground: hbar(0.56, 0.72, 0.34),
    strokes: [v(0.585, 0.59, 0.13), v(0.625, 0.635, 0.085), v(0.665, 0.555, 0.165), v(0.705, 0.62, 0.1), v(0.745, 0.65, 0.07), v(0.785, 0.6, 0.12)],
  },
  /* 数学：一条横轴一条纵轴，一只方格 + 一道刻度 */
  math: {
    key: 'math',
    note: '方格与坐标',
    ground: hbar(0.56, 0.72, 0.34),
    strokes: [v(0.58, 0.5, 0.22), hbar(0.64, 0.56, 0.18), hbar(0.64, 0.7, 0.18), v(0.64, 0.56, 0.142), v(0.82, 0.56, 0.142), hbar(0.66, 0.635, 0.16)],
  },
  /* 英语：四线三格 + 两道竖边（写得下字母的那一栏） */
  english: {
    key: 'english',
    note: '四线三格',
    ground: hbar(0.56, 0.72, 0.34),
    strokes: [hbar(0.56, 0.585, 0.34), hbar(0.56, 0.63, 0.34), hbar(0.56, 0.675, 0.34), v(0.58, 0.585, 0.135), v(0.88, 0.585, 0.135), v(0.66, 0.585, 0.135)],
  },
  /* 科学：横轴纵轴 + 三根高低不齐的柱（数据图） */
  science: {
    key: 'science',
    note: '坐标与柱',
    ground: hbar(0.56, 0.72, 0.34),
    strokes: [v(0.58, 0.5, 0.22), v(0.645, 0.64, 0.08), v(0.715, 0.59, 0.13), v(0.785, 0.54, 0.18), hbar(0.58, 0.5, 0.28)],
  },
  /* 史地：经纬网 + 三个地点 */
  humanities: {
    key: 'humanities',
    note: '经纬网',
    ground: hbar(0.56, 0.72, 0.34),
    strokes: [hbar(0.56, 0.56, 0.34), v(0.58, 0.56, 0.16), v(0.72, 0.56, 0.16), v(0.86, 0.56, 0.16), hbar(0.6, 0.625, 0.012), hbar(0.74, 0.6, 0.012)],
  },
  /* 认不出学科：一条地平线 + 五根排开的短笔，读成什么课都不出错 */
  neutral: {
    key: 'neutral',
    note: '笔迹',
    ground: hbar(0.56, 0.72, 0.34),
    strokes: [v(0.6, 0.62, 0.1), v(0.665, 0.585, 0.135), v(0.73, 0.64, 0.08), v(0.795, 0.6, 0.12), v(0.86, 0.65, 0.07)],
  },
}

/** 学科 → 线稿：英语先判（它同时命中不了语文的规则，但英文课名会带「阅读」二字） */
export function motifOf(subject: unknown): MotifKey {
  const s = String(subject ?? '')
  if (/英语|英文|外语/.test(s)) return 'english'
  if (/数学|算术|几何|代数/.test(s)) return 'math'
  if (/物理|化学|科学|生物|自然|常识/.test(s)) return 'science'
  if (/历史|地理|道法|道德|政治|社会|思政/.test(s)) return 'humanities'
  if (/语文|汉语|国学|阅读|习作|古诗|文言/.test(s)) return 'chinese'
  return 'neutral'
}

/** 一页上该画哪套线稿；`motif` 是导演 / 骨架层记下来的判定结果，没有就按中性 */
export function motifOfKey(v: unknown): Motif {
  const k = String(v ?? '')
  return k in MOTIFS ? MOTIFS[k as MotifKey] : MOTIFS.neutral
}
