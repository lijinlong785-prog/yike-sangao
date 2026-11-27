/**
 * 模板 C：路径生长（历史、叙事类课文）
 * 一条 SVG 路径用 stroke-dashoffset 生长，节点按顺序点亮，右侧浮出该节点的一句话。
 * 板书页那条「A → B → C」主线由这里演；其余条目与问句留在页面上，一个字不丢。
 *
 * TASKS/08 §A.2③ 跳站：每一站都可点，点哪站画面就推进到哪站（允许倒着点）。
 * 岔路只写父组件的 nodeIndex；SlideShow 把展示用的 step 换成 pathStepOf 的返回值，
 * 键盘的 step 本身不被读也不被写。这里的 step prop 就是「展示步」，谁喂的都一样。
 */
import type { Track } from '../../data/anim'
import { RichLine } from './RevealSlide'

interface Props {
  label: string
  title: string
  track: Track
  /** 板书页上除主线以外的那几行旁注 */
  trail?: string[]
  /** 这一页要问学生的那一句，朱红宋体 */
  question?: string
  step: number
  onPickNode?: (i: number) => (e: React.MouseEvent) => void
}

export default function PathSlide({ label, title, track, trail, question, step, onPickNode }: Props) {
  const total = track.nodes.length
  const progress = total > 1 ? Math.min(1, (step - 1) / (total - 1)) : 1
  const current = Math.min(step, total) - 1

  return (
    <div className="ss-slide ss-slide-c">
      <p className="ss-label">{label}</p>
      <h2 className="ss-title">{title}</h2>

      {(trail?.length || question) && (
        <div className="ss-trail">
          {(trail ?? []).map((t, i) => (
            <p className="ss-trail-line" key={i}>
              <RichLine text={t} />
            </p>
          ))}
          {question && (
            <p className="ss-trail-q">
              <RichLine text={question} />
            </p>
          )}
        </div>
      )}

      <div className="path-wrap">
        <svg className="path-svg" viewBox="0 0 640 340" role="img" aria-label={title}>
          <path className="path-base" d={track.d} pathLength={100} />
          <path
            className="path-line"
            d={track.d}
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - progress * 100}
          />
          {track.nodes.map((n, i) => {
            const lit = i < step
            return (
              <g
                key={n.label}
                className={lit ? 'path-node on' : 'path-node'}
                onClick={onPickNode ? onPickNode(i) : undefined}
              >
                {/* 透明大命中区：站名与小圆点都好点，不靠鼠标精度 */}
                {onPickNode && <circle className="path-hit" cx={n.x} cy={n.y} r={18} />}
                <circle cx={n.x} cy={n.y} r={lit && i === current ? 9 : 6} />
                <text x={n.x} y={n.y + (n.dy ?? -18)} textAnchor="middle">
                  {n.label}
                </text>
              </g>
            )
          })}
        </svg>

        <aside className="path-caption">
          <span className="path-index">
            {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <h3>{track.nodes[current]?.label}</h3>
          <p>{track.nodes[current]?.caption}</p>
        </aside>
      </div>
    </div>
  )
}