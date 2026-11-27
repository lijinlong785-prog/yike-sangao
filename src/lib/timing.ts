import type { Segment, SegmentTimed } from '../types'

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 按比例把总时长切给各环节，四舍五入后把误差补到最后一个环节，保证总和精确 */
export function allocate(segments: Segment[], total: number): SegmentTimed[] {
  let acc = 0
  const out = segments.map((s, i) => {
    const last = i === segments.length - 1
    const seconds = last ? total - acc : Math.round(total * s.ratio)
    const start = acc
    acc += seconds
    return { ...s, seconds, start, end: acc }
  })
  return out
}

export function sumRatio(segments: Segment[]): number {
  return segments.reduce((a, s) => a + s.ratio, 0)
}
