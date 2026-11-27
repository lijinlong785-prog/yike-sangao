/**
 * 专业级上台提词器（2026 Qoder StudyHack 升级版）
 *
 * · Portal 挂载至 document.body，全屏无遮挡；
 * · 暗房（dark）/ 暖纸（warm）双视觉模式；
 * · requestAnimationFrame 平滑自动滚屏（150–270 字/分语速滑杆）；
 * · 字号调节（A− / A+）；
 * · 快捷键：空格暂停/继续、← / → 切换教学环节、ESC 退出；
 * · 右侧同步大屏 PPT 提示卡（实时对照当前环节的课堂画面与板书/停顿提问）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LessonPlan, SegmentTimed } from '../types'
import type { StudentSlide } from '../lib/slides'
import type { DeckPage } from '../lib/deck'
import { SLIDE_LABELS } from '../lib/slides'
import { formatTime } from '../lib/timing'

interface Props {
  plan: LessonPlan
  timed: SegmentTimed[]
  slides?: StudentSlide[]
  deck?: DeckPage[]
  initialIndex?: number
  onExit: () => void
}

interface DiagRow {
  name: string
  plan: number
  actual: number
  diff: number
}

function matchSlideForSegment(
  segIndex: number,
  totalSegs: number,
  slides: readonly StudentSlide[],
  deck: readonly DeckPage[]
): { badge: string; title: string; items: string[]; line?: string; illustration?: string; pageNo: string } | null {
  if (slides.length > 0) {
    const usable = Math.max(1, slides.length - 1)
    const idx =
      totalSegs <= 1
        ? 0
        : Math.min(slides.length - 1, Math.max(0, Math.round((segIndex / Math.max(1, totalSegs - 1)) * usable)))
    const s = slides[idx]
    if (s) {
      return {
        badge: SLIDE_LABELS[s.kind],
        title: s.title,
        items: s.items ?? [],
        line: s.line || s.text,
        illustration: s.illustration,
        pageNo: `学生版 PPT · 第 ${idx + 1} / ${slides.length} 页`,
      }
    }
  }
  if (deck.length > 0) {
    const idx = Math.min(
      deck.length - 1,
      Math.max(0, Math.round((segIndex / Math.max(1, totalSegs - 1)) * (deck.length - 1)))
    )
    const p = deck[idx]
    if (p) {
      return {
        badge: p.label,
        title: p.title,
        items: p.bullets ?? [],
        line: p.question,
        pageNo: `教师课件 · 第 ${idx + 1} / ${deck.length} 页`,
      }
    }
  }
  return null
}

export default function Teleprompter({ plan, timed, slides = [], deck = [], initialIndex = 0, onExit }: Props) {
  const total = plan.meta.duration
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, timed.length - 1)))
  const [acc, setAcc] = useState(0)
  const [, setNow] = useState(() => Date.now())
  const resumedAt = useRef<number | null>(Date.now())
  const [records, setRecords] = useState<(number | undefined)[]>(() => timed.map(() => undefined))
  const [running, setRunning] = useState(true)
  const [finished, setFinished] = useState(false)
  const [endArmed, setEndArmed] = useState(false)
  const endTimer = useRef<number | null>(null)
  const [copied, setCopied] = useState(false)

  /* 2026 专业提词器控制项 */
  const [mode, setMode] = useState<'dark' | 'warm'>('dark')
  const [fontSize, setFontSize] = useState<number>(30)
  const [cpm, setCpm] = useState<number>(210) // 150–270 字/分
  const [autoScroll, setAutoScroll] = useState<boolean>(true)
  const scriptBoxRef = useRef<HTMLDivElement | null>(null)

  const seg = timed[index] ?? timed[0]
  const liveElapsed = () =>
    acc + (running && resumedAt.current ? Math.floor((Date.now() - resumedAt.current) / 1000) : 0)
  const segElapsed = liveElapsed()
  const usedTotal =
    records.reduce<number>((sum, r) => sum + (r ?? 0), 0) + (finished ? 0 : segElapsed)
  const remain = Math.max(0, total - usedTotal)

  /* 250ms 节拍刷新时钟 */
  useEffect(() => {
    if (!running || finished) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running, finished, index])

  useEffect(() => {
    if (finished) return
    const sync = () => {
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [finished])

  /* 切换环节时滚回稿件顶部 */
  useEffect(() => {
    if (scriptBoxRef.current) scriptBoxRef.current.scrollTop = 0
  }, [index])

  /* requestAnimationFrame 平滑自动滚屏（按字/分语速换算像素速度） */
  useEffect(() => {
    if (!running || !autoScroll || finished) return
    let rafId = 0
    let lastTs = performance.now()
    let carry = 0

    const step = (ts: number) => {
      const dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000))
      lastTs = ts
      const el = scriptBoxRef.current
      if (el) {
        const charsPerLine = Math.max(12, Math.floor((el.clientWidth - 24) / Math.max(16, fontSize)))
        const lineHeightPx = fontSize * 1.85
        const linesPerSec = cpm / 60 / charsPerLine
        const pxPerSec = linesPerSec * lineHeightPx
        carry += pxPerSec * dt
        if (carry >= 0.5) {
          const move = Math.floor(carry)
          carry -= move
          el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + move)
        }
      }
      rafId = window.requestAnimationFrame(step)
    }
    rafId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(rafId)
  }, [running, autoScroll, finished, cpm, fontSize, index])

  function closeSegment(i: number, seconds: number) {
    setRecords((prev) => {
      const next = [...prev]
      next[i] = seconds
      return next
    })
  }

  function goNext() {
    if (index >= timed.length - 1) {
      askEnd()
      return
    }
    closeSegment(index, liveElapsed())
    setIndex(index + 1)
    setAcc(0)
    resumedAt.current = Date.now()
    setNow(Date.now())
  }

  function goPrev() {
    if (index === 0) {
      setAcc(0)
      resumedAt.current = Date.now()
      setNow(Date.now())
      return
    }
    setRecords((prev) => {
      const next = [...prev]
      next[index] = undefined
      next[index - 1] = undefined
      return next
    })
    setIndex(index - 1)
    setAcc(0)
    resumedAt.current = Date.now()
    setNow(Date.now())
  }

  function togglePause() {
    if (running) {
      setAcc(liveElapsed())
      resumedAt.current = null
      setRunning(false)
    } else {
      resumedAt.current = Date.now()
      setNow(Date.now())
      setRunning(true)
    }
  }

  function finish() {
    const used = liveElapsed()
    setRunning(false)
    resumedAt.current = null
    closeSegment(index, used)
    setFinished(true)
  }

  function askEnd() {
    if (endArmed) {
      if (endTimer.current) window.clearTimeout(endTimer.current)
      endTimer.current = null
      setEndArmed(false)
      finish()
      return
    }
    setEndArmed(true)
    endTimer.current = window.setTimeout(() => {
      endTimer.current = null
      setEndArmed(false)
    }, 3000)
  }

  /* 全局快捷键：ESC 退出 / 空格暂停 / 左右方向键切环节 */
  const actionsRef = useRef({ togglePause, goPrev, goNext, onExit, finished })
  actionsRef.current = { togglePause, goPrev, goNext, onExit, finished }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        e.preventDefault()
        actionsRef.current.onExit()
      } else if (!actionsRef.current.finished) {
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault()
          actionsRef.current.togglePause()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          actionsRef.current.goPrev()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          actionsRef.current.goNext()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(
    () => () => {
      if (endTimer.current) window.clearTimeout(endTimer.current)
    },
    []
  )

  const diag = useMemo(() => {
    const rows: DiagRow[] = timed.map((s, i) => {
      const actual = records[i] ?? 0
      return { name: s.name, plan: s.seconds, actual, diff: actual - s.seconds }
    })
    const used = rows.reduce((sum, r) => sum + r.actual, 0)
    const worst = rows.reduce<DiagRow | null>(
      (best, r) => (!best || Math.abs(r.diff) > Math.abs(best.diff) ? r : best),
      null
    )
    const intro = rows.find((r) => r.name.includes('导入'))
    const xinshou = rows.find((r) => r.name.includes('新授'))
    const within = rows.every((r) => Math.abs(r.diff) <= r.plan * 0.1)

    let note: string
    if (intro && intro.actual > intro.plan * 1.5) {
      note = '导入超时是最常见的崩盘点。评委在前 60 秒就形成了第一印象，导入一旦拖住，后面的精读必然被压缩。'
    } else if (used > total * 1.1) {
      note = '总时长超出 10%，说明练习或小结被挤压。建议把练习压到 1 个例题。'
    } else if (xinshou && xinshou.diff < 0 && worst && worst.name.includes('新授')) {
      note = '新授提前结束，说明内容密度不够或语速偏快，容易被追问「是不是讲太快了」。'
    } else if (within) {
      note = '节奏很稳，各环节偏差都在 10% 以内，这一版可以直接上台。'
    } else {
      const w = worst ?? { name: '—', plan: 0, actual: 0, diff: 0 }
      note = `偏差最大的是【${w.name}】，用了 ${w.actual} 秒，计划 ${w.plan} 秒。下次只盯这一个环节。`
    }

    const diffTotal = used - total
    return { rows, used, diffTotal, note, gapNote: gapSentence(diffTotal, timed) }
  }, [timed, records, total])

  const plainDiag = useMemo(() => {
    const lines = [
      `《${plan.meta.topic}》上台演练诊断`,
      `目标时长 ${formatTime(total)}（${total} 秒） / 实际用时 ${formatTime(diag.used)}（${diag.used} 秒） / 偏差 ${signed(diag.diffTotal)} 秒`,
      diag.gapNote,
      '',
      '环节\t计划\t实际\t偏差',
      ...diag.rows.map((r) => `${r.name}\t${r.plan}\t${r.actual}\t${signed(r.diff)}`),
      '',
      diag.note,
    ]
    return lines.join('\n')
  }, [plan.meta.topic, total, diag])

  async function copyDiag() {
    try {
      await navigator.clipboard.writeText(plainDiag)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = plainDiag
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const cueCard = useMemo(
    () => matchSlideForSegment(index, timed.length, slides, deck),
    [index, timed.length, slides, deck]
  )

  const overlay = finished ? (
    <div className={`teleprompter mode-${mode}`}>
      <div className="diag">
        <h2>演练完成</h2>
        <p className="diag-sub">
          《{plan.meta.topic}》 · {plan.meta.grade}
          {plan.meta.subject}
        </p>

        <div className="diag-overview">
          <div className="diag-cell">
            <span className="diag-num">{formatTime(total)}</span>
            <span className="diag-cap">目标时长</span>
          </div>
          <div className="diag-cell">
            <span className={diag.diffTotal > 0 ? 'diag-num bad' : 'diag-num'}>
              {formatTime(diag.used)}
            </span>
            <span className="diag-cap">实际用时</span>
          </div>
          <div className="diag-cell">
            <span className={Math.abs(diag.diffTotal) > total * 0.1 ? 'diag-num bad' : 'diag-num'}>
              {signed(diag.diffTotal)}
            </span>
            <span className="diag-cap">偏差（秒）</span>
          </div>
        </div>

        <p className="diag-gap">{diag.gapNote}</p>

        <table className="diag-table">
          <thead>
            <tr>
              <th>环节</th>
              <th>计划秒</th>
              <th>实际秒</th>
              <th>偏差</th>
            </tr>
          </thead>
          <tbody>
            {diag.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.plan}</td>
                <td className={r.diff > 0 ? 'bad' : undefined}>{r.actual}</td>
                <td className={Math.abs(r.diff) > r.plan * 0.1 ? 'bad' : undefined}>
                  {signed(r.diff)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="diag-note">{diag.note}</p>

        <div className="diag-actions">
          <button className="btn primary sm" onClick={() => void copyDiag()}>
            {copied ? '已复制 ✓' : '复制诊断'}
          </button>
          <button
            className="btn outline sm"
            onClick={() => {
              setIndex(0)
              setAcc(0)
              setNow(Date.now())
              resumedAt.current = Date.now()
              setRecords(timed.map(() => undefined))
              setFinished(false)
              setRunning(true)
            }}
          >
            再走一遍
          </button>
          <button className="btn outline sm" onClick={onExit}>
            回到工作台
          </button>
        </div>
      </div>
    </div>
  ) : (
    (() => {
      const segRatio = seg.seconds > 0 ? segElapsed / seg.seconds : 0
      const overBy = segElapsed - seg.seconds
      const barClass =
        overBy > 0 ? 'tp-segbar over' : segRatio >= 0.8 ? 'tp-segbar low' : 'tp-segbar'
      const next = timed[index + 1]
      return (
        <div className={`teleprompter mode-${mode}`}>
          {/* 顶部专业控制台 */}
          <header className="tp-topbar">
            <div className="tp-brand">
              <strong>《{plan.meta.topic}》</strong>
              <span>上台提词器 · 第 {index + 1} / {timed.length} 环节</span>
            </div>

            <div className="tp-tools">
              <div className="tp-pill-group" role="group" aria-label="视觉模式">
                <button
                  type="button"
                  className={mode === 'dark' ? 'tp-tool-btn active' : 'tp-tool-btn'}
                  onClick={() => setMode('dark')}
                >
                  暗房模式
                </button>
                <button
                  type="button"
                  className={mode === 'warm' ? 'tp-tool-btn active' : 'tp-tool-btn'}
                  onClick={() => setMode('warm')}
                >
                  暖纸模式
                </button>
              </div>

              <label className="tp-speed">
                <span>语速 {cpm} 字/分</span>
                <input
                  type="range"
                  min={150}
                  max={270}
                  step={10}
                  value={cpm}
                  onChange={(e) => setCpm(Number(e.target.value))}
                  aria-label="自动滚屏语速"
                />
              </label>

              <button
                type="button"
                className={autoScroll ? 'tp-tool-btn active' : 'tp-tool-btn'}
                onClick={() => setAutoScroll((v) => !v)}
              >
                {autoScroll ? '滚屏：开' : '滚屏：关'}
              </button>

              <div className="tp-pill-group" role="group" aria-label="字号调节">
                <button
                  type="button"
                  className="tp-tool-btn"
                  onClick={() => setFontSize((s) => Math.max(20, s - 2))}
                  title="缩小字号"
                >
                  A−
                </button>
                <span className="tp-font-read">{fontSize}px</span>
                <button
                  type="button"
                  className="tp-tool-btn"
                  onClick={() => setFontSize((s) => Math.min(46, s + 2))}
                  title="放大字号"
                >
                  A+
                </button>
              </div>

              <button type="button" className="tp-tool-btn exit" onClick={onExit}>
                退出 ESC
              </button>
            </div>
          </header>

          {/* 主双栏区：左侧大字提词滚屏 + 右侧大屏 PPT 提示卡 */}
          <div className="tp-stage">
            <div className="tp-main">
              <div className="tp-head-row">
                <div className="tp-clock-wrap">
                  <div className="tp-clock">{clock(remain)}</div>
                  <div className="tp-clock-label">剩余总时长 · 目标 {formatTime(total)}</div>
                </div>
                <div className="tp-seg-meta">
                  <span className="tp-seg-name">{seg.name}</span>
                  <div className="tp-meter-label">
                    <span>
                      本环节已用 {segElapsed}s / 预算 {seg.seconds}s
                    </span>
                    {overBy > 0 && <span className="tp-over">超时 +{overBy}s</span>}
                  </div>
                  <div className={barClass}>
                    <i style={{ width: `${Math.min(100, segRatio * 100)}%` }} />
                  </div>
                </div>
              </div>

              {/* 滚动口播稿区 */}
              <div className="tp-scroll-box" ref={scriptBoxRef}>
                <p className="tp-script" style={{ fontSize: `${fontSize}px` }}>
                  {seg.script}
                </p>

                <div className="tp-activity-box">
                  <div className="tp-act-row">
                    <b>教师动作</b>
                    <span>{seg.teacher}</span>
                  </div>
                  <div className="tp-act-row">
                    <b>学生预期</b>
                    <span>{seg.student}</span>
                  </div>
                </div>

                {seg.pauses && seg.pauses.length > 0 && (
                  <div className="tp-pauses">
                    {seg.pauses.map((p, i) => (
                      <div className="tp-pause" key={i}>
                        <span className="dot" />
                        <span>
                          <span className="sec">停 {p.seconds} 秒</span>（{p.type}）问：「{p.question}」
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="tp-next">
                {next ? `下一环节 · ${next.name}（${next.seconds} 秒）` : '当前为最后一个环节'}
              </p>
            </div>

            {/* 右侧同步大屏 PPT 提示卡 */}
            <aside className="tp-cue-panel">
              <div className="tp-cue-head">
                <span>大屏同步提示卡</span>
                <em>{cueCard?.pageNo ?? '课堂同步'}</em>
              </div>
              {cueCard ? (
                <div className="tp-cue-card">
                  {cueCard.illustration && (
                    <img className="tp-cue-img" src={cueCard.illustration} alt="" />
                  )}
                  <span className="tp-cue-badge">{cueCard.badge}</span>
                  <h4 className="tp-cue-title">{cueCard.title}</h4>
                  {cueCard.items.length > 0 && (
                    <ul className="tp-cue-list">
                      {cueCard.items.slice(0, 5).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {cueCard.line && <p className="tp-cue-line">「{cueCard.line}」</p>}
                </div>
              ) : (
                <div className="tp-cue-card">
                  <h4 className="tp-cue-title">{seg.name}</h4>
                  <p className="tp-cue-line">{seg.goal}</p>
                </div>
              )}

              <div className="tp-seg-jump">
                {timed.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`tp-seg-dot${i === index ? ' active' : records[i] !== undefined ? ' done' : ''}`}
                    onClick={() => {
                      closeSegment(index, liveElapsed())
                      setIndex(i)
                      setAcc(0)
                      resumedAt.current = Date.now()
                      setNow(Date.now())
                    }}
                  >
                    <span>{i + 1}</span>
                    <em>{s.name.split('·')[0].trim()}</em>
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <footer className="tp-controls">
            <div className="tp-kbd-hint">快捷键：空格 暂停/继续 · ← → 切环节 · ESC 退出</div>
            <div className="tp-control-btns">
              <button onClick={togglePause}>{running ? '⏸ 暂停（空格）' : '▶ 继续（空格）'}</button>
              <button onClick={goPrev} disabled={index === 0}>
                ← 上一环节
              </button>
              <button onClick={goNext} disabled={index >= timed.length - 1}>
                下一环节 →
              </button>
              <button
                className={endArmed ? 'danger armed' : 'danger'}
                onClick={askEnd}
                aria-live="polite"
              >
                {endArmed ? '确认结束演练？' : '结束并复盘'}
              </button>
            </div>
          </footer>
        </div>
      )
    })()
  )

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function tailSegment(segments: SegmentTimed[]): SegmentTimed | undefined {
  const reversed = [...segments].reverse()
  return reversed.find((s) => /问答|练习|检测|小结|作业|拓展/.test(s.name)) ?? reversed[0]
}

function gapSentence(diff: number, segments: SegmentTimed[]): string {
  const abs = Math.abs(diff)
  const verb = diff < 0 ? '少讲了' : '多讲了'
  if (abs < 5) {
    return diff === 0
      ? '节奏和目标基本对齐，一秒不多一秒不少，这一版可以直接上台。'
      : `节奏和目标基本对齐，${verb}不到 5 秒，这一版可以直接上台。`
  }
  const timed = segments.filter((s) => s.seconds > 0)
  const near = timed
    .map((s) => ({ name: s.name, seconds: s.seconds, off: Math.abs(s.seconds - abs) }))
    .sort((a, b) => a.off - b.off)[0]
  if (near && near.off <= Math.max(15, near.seconds * 0.35)) {
    return `比目标${verb} ${abs} 秒，差不多就是一整个【${near.name}】环节的时长。`
  }
  if (timed.length > 0) {
    const avg = Math.round(timed.reduce((sum, s) => sum + s.seconds, 0) / timed.length)
    if (abs < avg * 0.5) {
      return diff < 0
        ? `比目标${verb} ${abs} 秒，还不够一个环节（环节平均 ${avg} 秒），不影响上台。`
        : `比目标${verb} ${abs} 秒，还不够一个环节（环节平均 ${avg} 秒），只要别一路拖到收尾就行。`
    }
    const count = Math.min(Math.max(1, Math.round(abs / Math.max(avg, 1))), timed.length)
    const unit = count === 1 ? '1 个完整环节' : `${count} 个完整环节`
    const tail = tailSegment(timed)
    const tailName = tail ? `【${tail.name}】` : '收尾那一段'
    return diff < 0
      ? `比目标${verb} ${abs} 秒，差不多是 ${unit}（环节平均 ${avg} 秒）的量，下一遍先把${tailName}补齐。`
      : `比目标${verb} ${abs} 秒，差不多是 ${unit}（环节平均 ${avg} 秒）的量，后面的${tailName}大概率会被挤掉。`
  }
  return diff < 0
    ? `比目标${verb} ${abs} 秒，多半是某个环节被压缩或直接跳过了，下一遍只盯这一个。`
    : `比目标${verb} ${abs} 秒，多出来的通常是自己临时加的例题或追问，下一遍删掉它。`
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
