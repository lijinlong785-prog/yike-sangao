/**
 * 交互式粉笔黑板画布（2026 Qoder StudyHack）
 *
 * 1. 高拟真墨绿黑板 + 暖木质粉笔槽（内嵌四色粉笔与黑板擦）；
 * 2. 「分步书写演示」：逐行粉笔动画推演板书布局，支持播放/暂停、步进、全部显示、重置；
 * 3. HTML5 Canvas 颗粒感粉笔批注：纯白 / 暖黄 / 朱红 / 青瓷 4 色 + 板擦 + 清空笔迹；
 * 4. 一键导出 2x 高清黑板 PNG 图（含板书文字 + 老师手写粉笔批注）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LessonPlan } from '../types'

interface Props {
  plan: LessonPlan
}

interface ChalkColor {
  id: string
  label: string
  hex: string
}

const CHALK_COLORS: readonly ChalkColor[] = [
  { id: 'white', label: '纯白', hex: '#F5F3EC' },
  { id: 'yellow', label: '暖黄', hex: '#F6D57A' },
  { id: 'red', label: '朱红', hex: '#E86F5E' },
  { id: 'celadon', label: '青瓷', hex: '#7DD3C0' },
]

const WIDE_CHAR =
  /[\u1100-\u115F\u2190-\u21FF\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/

export default function InteractiveBlackboard({ plan }: Props) {
  const rawLines = useMemo(() => plan.blackboard.layout.split('\n'), [plan.blackboard.layout])
  /** 可分步推演的非空行下标 */
  const stepIndices = useMemo(
    () => rawLines.map((l, idx) => (l.trim() ? idx : -1)).filter((i) => i >= 0),
    [rawLines]
  )
  const totalSteps = Math.max(1, stepIndices.length)

  const [step, setStep] = useState<number>(totalSteps)
  const [playing, setPlaying] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [tool, setTool] = useState<'chalk' | 'eraser'>('chalk')
  const [chalkColor, setChalkColor] = useState<string>(CHALK_COLORS[0].hex)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [exported, setExported] = useState(false)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)

  // 换教案时重置为完整展示
  useEffect(() => {
    setStep(totalSteps)
    setPlaying(false)
  }, [totalSteps, plan.meta.topic])

  // 分步书写逐行播放定时器
  useEffect(() => {
    if (!playing) return
    if (step >= totalSteps) {
      setPlaying(false)
      return
    }
    const id = window.setTimeout(() => {
      setStep((s) => Math.min(totalSteps, s + 1))
    }, 900)
    return () => window.clearTimeout(id)
  }, [playing, step, totalSteps])

  // 保持画布与容器 2x 清晰度同步
  useEffect(() => {
    const syncSize = () => {
      const box = stageRef.current
      const canvas = canvasRef.current
      if (!box || !canvas) return
      const rect = box.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * 2))
      const h = Math.max(1, Math.round(rect.height * 2))
      if (canvas.width !== w || canvas.height !== h) {
        // 缩放前先暂存已有笔迹
        const snapshot = document.createElement('canvas')
        snapshot.width = canvas.width
        snapshot.height = canvas.height
        const sctx = snapshot.getContext('2d')
        if (sctx && canvas.width > 0 && canvas.height > 0) {
          sctx.drawImage(canvas, 0, 0)
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (ctx && snapshot.width > 0 && snapshot.height > 0) {
          ctx.drawImage(snapshot, 0, 0, w, h)
        }
      }
    }
    syncSize()
    window.addEventListener('resize', syncSize)
    return () => window.removeEventListener('resize', syncSize)
  }, [rawLines.length])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    }
  }

  /** 绘制带粉笔颗粒质感的笔触（双层散点模拟石板摩擦） */
  function strokeChalk(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
    if (tool === 'eraser') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineCap = 'round'
      ctx.lineWidth = 34
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
      ctx.restore()
      return
    }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.ceil(dist / 2.2))

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = chalkColor
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const cx = from.x + dx * t
      const cy = from.y + dy * t
      // 中心实芯
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(cx, cy, 2.3, 0, Math.PI * 2)
      ctx.fill()
      // 周围石板颗粒粉尘
      for (let g = 0; g < 7; g++) {
        const angle = Math.random() * Math.PI * 2
        const rad = Math.random() * 5.2
        ctx.globalAlpha = 0.14 + Math.random() * 0.36
        ctx.fillRect(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad, 1.8, 1.8)
      }
    }
    ctx.restore()
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawMode) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const pt = getPoint(e)
    lastPtRef.current = pt
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      strokeChalk(ctx, pt, { x: pt.x + 0.5, y: pt.y + 0.5 })
      setHasStrokes(true)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawMode || !drawingRef.current) return
    const pt = getPoint(e)
    const prev = lastPtRef.current ?? pt
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      strokeChalk(ctx, prev, pt)
      setHasStrokes(true)
    }
    lastPtRef.current = pt
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPtRef.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasStrokes(false)
    }
  }

  function startPlayback() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (step >= totalSteps) setStep(1)
    setPlaying(true)
  }

  /** 一键导出 2x 高清黑板 PNG（板面纹理 + 木质边框 + 当前板书文字 + 手写粉笔批注） */
  function exportPng() {
    const stage = stageRef.current
    const rect = stage?.getBoundingClientRect()
    const baseW = Math.max(640, Math.round(rect?.width ?? 760))
    const baseH = Math.max(360, Math.round(rect?.height ?? 420))
    const scale = 2
    const pad = 28
    const trayH = 26

    const out = document.createElement('canvas')
    out.width = (baseW + pad * 2) * scale
    out.height = (baseH + pad * 2 + trayH) * scale
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.scale(scale, scale)

    // 木质外框
    const wood = ctx.createLinearGradient(0, 0, baseW + pad * 2, baseH + pad * 2 + trayH)
    wood.addColorStop(0, '#8A603B')
    wood.addColorStop(0.5, '#6F492A')
    wood.addColorStop(1, '#5A3A20')
    ctx.fillStyle = wood
    ctx.fillRect(0, 0, baseW + pad * 2, baseH + pad * 2 + trayH)

    // 墨绿黑板面
    const board = ctx.createRadialGradient(
      pad + baseW * 0.5,
      pad + baseH * 0.45,
      40,
      pad + baseW * 0.5,
      pad + baseH * 0.5,
      baseW * 0.72
    )
    board.addColorStop(0, '#244235')
    board.addColorStop(1, '#182D24')
    ctx.fillStyle = board
    ctx.fillRect(pad, pad, baseW, baseH)

    // 微妙粉笔灰纹理
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    for (let i = 0; i < 180; i++) {
      ctx.fillRect(pad + ((i * 97) % baseW), pad + ((i * 53) % baseH), 2, 1)
    }

    // 渲染可见的板书文本
    const maxVisibleRow = step >= totalSteps ? rawLines.length - 1 : (stepIndices[step - 1] ?? -1)
    ctx.fillStyle = '#F3F1E8'
    ctx.font = '600 18px "Kaiti SC", "KaiTi", "Songti SC", monospace'
    ctx.textBaseline = 'top'
    const lineH = Math.min(30, Math.max(22, (baseH - 48) / Math.max(1, rawLines.length)))
    rawLines.forEach((line, idx) => {
      if (idx > maxVisibleRow) return
      let cx = pad + 32
      const cy = pad + 28 + idx * lineH
      for (const ch of [...line]) {
        if (ch !== ' ') ctx.fillText(ch, cx, cy)
        cx += WIDE_CHAR.test(ch) ? 18.5 : 9.5
      }
    })

    // 叠加老师的粉笔批注层
    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, pad, pad, baseW, baseH)
    }

    // 底部木质粉笔槽装饰
    ctx.fillStyle = '#53351D'
    ctx.fillRect(pad - 8, pad + baseH + 8, baseW + 16, 16)
    CHALK_COLORS.forEach((c, idx) => {
      ctx.fillStyle = c.hex
      ctx.fillRect(pad + 24 + idx * 42, pad + baseH + 10, 28, 6)
    })

    const url = out.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `《${plan.meta.topic}》-粉笔黑板.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setExported(true)
    window.setTimeout(() => setExported(false), 2000)
  }

  const maxVisibleRow = step >= totalSteps ? rawLines.length - 1 : (stepIndices[step - 1] ?? -1)
  const activeOrderIdx = Math.min(
    Math.max(0, plan.blackboard.order.length - 1),
    Math.floor(((Math.max(1, step) - 1) / totalSteps) * Math.max(1, plan.blackboard.order.length))
  )

  return (
    <div className="ibb-wrap">
      <div className="ibb-toolbar">
        <div className="ibb-group">
          <button type="button" className={`ibb-btn${playing ? ' primary' : ''}`} onClick={startPlayback}>
            {playing ? '⏸ 暂停书写' : step < totalSteps ? '▶ 继续演示' : '▶ 分步书写演示'}
          </button>
          <button
            type="button"
            className="ibb-btn"
            disabled={step >= totalSteps}
            onClick={() => {
              setPlaying(false)
              setStep((s) => Math.min(totalSteps, s + 1))
            }}
          >
            步进 →
          </button>
          <button
            type="button"
            className="ibb-btn"
            onClick={() => {
              setPlaying(false)
              setStep(step < totalSteps ? totalSteps : 1)
            }}
          >
            {step < totalSteps ? '全部显示' : '从头推演'}
          </button>
          <span className="ibb-step-badge">
            第 {Math.min(step, totalSteps)} / {totalSteps} 行
          </span>
        </div>

        <div className="ibb-group">
          <button
            type="button"
            className={`ibb-btn${drawMode ? ' active' : ''}`}
            onClick={() => {
              setDrawMode((v) => !v)
              setTool('chalk')
            }}
          >
            {drawMode ? '✎ 批注中' : '✎ 粉笔批注'}
          </button>

          {drawMode && (
            <>
              <div className="ibb-swatches" role="radiogroup" aria-label="粉笔颜色">
                {CHALK_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ibb-swatch${tool === 'chalk' && chalkColor === c.hex ? ' active' : ''}`}
                    style={{ background: c.hex }}
                    title={`${c.label}粉笔`}
                    aria-label={`${c.label}粉笔`}
                    onClick={() => {
                      setTool('chalk')
                      setChalkColor(c.hex)
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className={`ibb-btn${tool === 'eraser' ? ' active' : ''}`}
                onClick={() => setTool((t) => (t === 'eraser' ? 'chalk' : 'eraser'))}
              >
                板擦
              </button>
              <button type="button" className="ibb-btn" disabled={!hasStrokes} onClick={clearCanvas}>
                清笔迹
              </button>
            </>
          )}

          <button type="button" className="ibb-btn" onClick={exportPng}>
            {exported ? '已导出 2x PNG ✓' : '导出 2x 黑板图'}
          </button>
        </div>
      </div>

      {/* 高拟真墨绿黑板 + 木质框与粉笔槽 */}
      <div className="ibb-frame">
        <div className={`ibb-board${drawMode ? ' is-drawing' : ''}`} ref={stageRef}>
          <pre className="ibb-chalk-text" aria-label="板书内容">
            <span className="bb-grid">
              {rawLines.map((line, i) => {
                const visible = i <= maxVisibleRow
                const fresh = i === maxVisibleRow && step < totalSteps
                return (
                  <span
                    className={`bb-line ibb-line${visible ? ' show' : ' hide'}${fresh ? ' fresh' : ''}`}
                    key={i}
                  >
                    {[...line].map((ch, j) => (
                      <span className={WIDE_CHAR.test(ch) ? 'bb-w' : 'bb-n'} key={j}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    ))}
                  </span>
                )
              })}
            </span>
          </pre>

          <canvas
            ref={canvasRef}
            className={`ibb-canvas${drawMode ? ' active' : ''}${tool === 'eraser' ? ' eraser' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {drawMode && (
            <span className="ibb-draw-pill">
              {tool === 'eraser' ? '板擦模式 · 拖动擦除' : '粉笔批注模式 · 在黑板上直接圈画'}
            </span>
          )}
        </div>

        {/* 木质粉笔槽 */}
        <div className="ibb-tray" aria-hidden>
          <div className="ibb-tray-chalks">
            {CHALK_COLORS.map((c) => (
              <span key={c.id} className="ibb-chalk-stick" style={{ background: c.hex }} />
            ))}
          </div>
          <span className="ibb-eraser-block" />
        </div>
      </div>

      <div className="ibb-order">
        <h3 className="sec-title">书写顺序</h3>
        <ol className="order-list">
          {plan.blackboard.order.map((o, i) => (
            <li key={i} className={step < totalSteps && i === activeOrderIdx ? 'ibb-order-active' : undefined}>
              {o}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
