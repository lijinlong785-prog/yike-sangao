/**
 * 非线性教学节奏时间轴（2026 Qoder StudyHack）
 *
 * 按分钟比例伸缩的莫兰迪学术色教学节奏条：
 *   · 切换 10/20/30/40 分钟课型时触发弹簧过渡动画；
 *   · 点击任意环节色块，左侧教学设计平滑滚动高亮，右侧教师课件与学生版 PPT 同步跳至对应页。
 */
import type { SegmentTimed } from '../types'
import { formatTime } from '../lib/timing'

/** 莫兰迪学术色板：低饱和、高雅度、对比清晰 */
export const MORANDI_PALETTE = [
  '#4E6E6B', // 青黛
  '#7D8E7E', // 豆绿
  '#B5836B', // 陶土
  '#6B7A99', // 雾蓝
  '#9B7E8C', // 藕荷
  '#8A7E66', // 苔褐
  '#5B7387', // 远山蓝
] as const

interface Props {
  timed: SegmentTimed[]
  duration: number
  activeIndex: number | null
  onSelect: (index: number) => void
}

function shortSegName(raw: string): string {
  const s = String(raw ?? '').trim()
  const parts = s.split(/[·・:：\-—]/).map((p) => p.trim()).filter(Boolean)
  return parts[0] || s
}

function fmtMinSec(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}秒`
  return s === 0 ? `${m}分` : `${m}分${s}秒`
}

export default function PacingTimeline({ timed, duration, activeIndex, onSelect }: Props) {
  const total = Math.max(1, duration)
  const totalMin = Math.round(total / 60)
  const tierLabel =
    totalMin <= 15
      ? '10分试讲骨架'
      : totalMin <= 25
        ? '20分精简骨架'
        : totalMin <= 35
          ? '30分标准骨架'
          : '40分公开课完整骨架'

  return (
    <div className="pacing-wrap" role="region" aria-label="非线性教学节奏时间轴">
      <div className="pacing-meta">
        <span className="pacing-title">
          教学节奏时间轴
          <em className="pacing-tier">{tierLabel} · {timed.length} 环节 · 共 {totalMin} 分钟</em>
        </span>
        <span className="pacing-hint">点击任意色块，左右双栏同步定位</span>
      </div>

      <div className="pacing-track">
        {timed.map((seg, i) => {
          const pct = Math.max(6, (seg.seconds / total) * 100)
          const color = MORANDI_PALETTE[i % MORANDI_PALETTE.length]
          const active = activeIndex === i
          return (
            <button
              key={`${seg.name}-${i}`}
              type="button"
              className={`pacing-seg${active ? ' active' : ''}`}
              style={{
                width: `${pct}%`,
                background: color,
              }}
              onClick={() => onSelect(i)}
              title={`${seg.name}（${fmtMinSec(seg.seconds)} · ${formatTime(seg.start)}–${formatTime(seg.end)}）`}
            >
              <span className="pacing-seg-name">{shortSegName(seg.name)}</span>
              <span className="pacing-seg-dur">{fmtMinSec(seg.seconds)}</span>
            </button>
          )
        })}
      </div>

      <div className="pacing-legend">
        {timed.map((seg, i) => {
          const color = MORANDI_PALETTE[i % MORANDI_PALETTE.length]
          const active = activeIndex === i
          return (
            <button
              key={`leg-${i}`}
              type="button"
              className={`pacing-chip${active ? ' active' : ''}`}
              onClick={() => onSelect(i)}
            >
              <i className="pacing-dot" style={{ background: color }} />
              <span>{seg.name}</span>
              <em>{formatTime(seg.start)}–{formatTime(seg.end)}</em>
            </button>
          )
        })}
      </div>
    </div>
  )
}
