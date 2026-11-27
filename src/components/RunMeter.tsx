import { useEffect, useRef, useState } from 'react'
import { etaOf, etaText, type EtaInput } from '../lib/eta'

interface Props extends EtaInput {
  /** 当前这一步在干什么（「正在重写学生版…」），与剩余时间同一行 */
  label: string
}

/**
 * 一条 2px 的细线 + 一行「正在… · 约还需 1 分 10 秒」。
 *
 * 每秒重渲染一次，剩余时间从 lib/eta.ts 现算：不播固定动画、不假装走到了头
 * （92% 封顶、10 秒兜底），页面真出来了这条自己就会被摘掉。
 * 纸与墨：细线用纸线色，走过的一段用墨色，不渐变、不投影。
 */
export default function RunMeter({ label, ...eta }: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  /* 已用工作量的高水位：某段超预算后 elapsed 吃过本段预算，换阶段那一刻
     「前段按整段扣」反而更小——托住它，剩余时间 / 进度条换阶段只往前不往回。
     组件在 run=null 时卸载，下一轮生成自然从零记起。 */
  const usedRef = useRef(0)
  /* 距上次「换阶段 / 翻页」几秒：带页数的阶段按页算是台阶，两张图之间
     台阶不动——把这段秒数加进去，倒计时才一直往下走（2026-11-23 真机「1 分 53 秒」冻住）。 */
  const markRef = useRef({ stage: eta.stage, page: eta.page ?? 0, at: Date.now() })
  if (markRef.current.stage !== eta.stage || markRef.current.page !== (eta.page ?? 0)) {
    markRef.current = { stage: eta.stage, page: eta.page ?? 0, at: Date.now() }
  }
  const sincePage = (Date.now() - markRef.current.at) / 1000
  const { left, pct, used } = etaOf({ ...eta, sincePage, usedFloor: usedRef.current })
  usedRef.current = Math.max(usedRef.current, used)
  return (
    <div className="run-meter" role="status" aria-live="polite">
      <div className="run-meter-bar" aria-hidden="true">
        <i style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <p className="run-meter-text">
        {label}
        <span className="run-meter-eta"> · {etaText(left)}</span>
      </p>
    </div>
  )
}