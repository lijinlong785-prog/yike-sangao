/**
 * 演示模式（TASKS/04 → TASKS/07 §4.3）。
 * 全屏纸底，一页一页往前推；每一页内部按 step 播完动效才允许翻页，
 * 免得讲课时手一抖把还没展开的内容跳过去。
 *
 * 这一轮删掉了本地的 buildPages(plan)：网页演示现在直接吃 App 持有的那份
 * StudentSlide[]——和导出 .pptx 是同一个数组实例，页数从此不可能不一致。
 * 「这一页用哪个动效播」的判定在 src/lib/show.ts（纯数据，可离线对账）。
 * 动效全部是纯 CSS，没有动画库；这个文件由 Result 懒加载，不进首屏。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles-show.css'
import { formatTime } from '../lib/timing'
import {
  HINT_AUTO_HIDE_MS,
  HINT_TEXT,
  buildScenes,
  comparePairOf,
  hintOnAutoHide,
  hintOnDisableKey,
  hintOnPageEnter,
  initialHintState,
  interactiveModeOf,
  pathStepOf,
  sceneLabel,
  stepsOf,
} from '../lib/show'
import { DEFAULT_THEME, paperOf, themeStyle, type DeckTheme } from '../lib/theme'
import { backdropFor } from '../lib/backdrop'
import type { StudentSlide } from '../lib/slides'
import BackdropSvg from './BackdropSvg'
import RevealSlide from './anim/RevealSlide'
import ExplodeSlide from './anim/ExplodeSlide'
import PathSlide from './anim/PathSlide'

interface Props {
  /** App 里那份学生版页面：和两处下载读的是同一个数组 */
  slides: StudentSlide[]
  /** 试讲时长（秒），只写在封面那行提示里，不参与拼页 */
  duration: number
  /**
   * 学生版那一套纸（TASKS/12）：整套色板与纹理只注入 .show 根节点。
   * 与导出的 .pptx、右栏预览吃同一个值（studentTheme），不是课件那张纸。
   * 缺省 = 墨与朱，所以下面那两颗控制钮与退出钮在没有任何信号时也是纸墨原色。
   */
  theme?: DeckTheme
  onExit: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function SlideShow({ slides, duration, theme = DEFAULT_THEME, onExit }: Props) {
  // 页数 = slides.length：一页幻灯片就是学生版里的那一张，不多不少
  const scenes = useMemo(() => buildScenes(slides), [slides])
  const [page, setPage] = useState(0)
  const [step, setStep] = useState(1)
  const rootRef = useRef<HTMLDivElement>(null)

  /* ---------- 鼠标的岔路（TASKS/08 §A）----------
   * 这四个 state 只住鼠标这一条线：绝不写 step / page，也绝不拿 step 决定能不能点。
   * 键盘主线（step）要碰它们时，只有翻页重置这一条路（resetBranch）；
   * 岔路对画面的影响全部经由展示层合并（如 exploded = 键盘拆 || 鼠标拆），
   * 两边各自清零各自的，谁也不覆盖谁。 */
  const [explodeOpen, setExplodeOpen] = useState(false)
  const [partIndex, setPartIndex] = useState(-1)
  const [pairIndex, setPairIndex] = useState(-1)
  const [nodeIndex, setNodeIndex] = useState(-1)
  const [hint, setHint] = useState(initialHintState)

  const total = scenes.length
  const index = Math.min(page, Math.max(0, total - 1))
  const current = scenes[index]
  const steps = current ? stepsOf(current) : 1
  const atEnd = index === total - 1 && step >= steps
  // 这一页有没有岔路（纯判定，不改页数不改步骤数）
  const mode = current ? interactiveModeOf(current.slide, current) : null

  /** 翻页（只有键盘/按钮的主线导航会调到它）：岔路全部归零，回到主线呈现 */
  function resetBranch() {
    setExplodeOpen(false)
    setPartIndex(-1)
    setPairIndex(-1)
    setNodeIndex(-1)
  }

  function go(to: number) {
    if (to < 0 || to > total - 1) return
    setPage(to)
    setStep(1)
    resetBranch()
  }

  function advance() {
    if (!current) return
    if (step < steps) setStep(step + 1)
    else go(index + 1)
  }

  function back() {
    if (!current) return
    if (step > 1) setStep(step - 1)
    else if (index > 0) {
      setPage(index - 1)
      setStep(stepsOf(scenes[index - 1]))
      resetBranch()
    }
  }

  /* ---------- 岔路的鼠标处理器：一律 stopPropagation，不碰主线 ---------- */

  /** 拆开 / 合上：只写 explodeOpen；合上时顺手收掉零件选中（它也是岔路自己的） */
  function toggleExplode(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !explodeOpen
    setExplodeOpen(next)
    if (!next) setPartIndex(-1)
  }

  /** 零件点选：再点同一个 = 清除，回到主线呈现 */
  function pickPart(i: number) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      setPartIndex((p) => (p === i ? -1 : i))
    }
  }

  /** 对比页：点哪栏都落到同一对 (left, right)；再点同项清除 */
  function pickCompare(i: number) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      setPairIndex((p) => (p === i ? -1 : i))
    }
  }

  /** 路径页跳站：只写 nodeIndex，键盘的 step 一字不动；再点同站回主线 */
  function pickNode(i: number) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      setNodeIndex((n) => (n === i ? -1 : i))
    }
  }

  // 展示层合并：键盘走到拆解那一步（step===2）散开；鼠标「拆开」的岔路只在它自己的那一拍有效
  // （explodeOpen && step < 3）——一旦键盘往前走到合拢拍（step≥3），开态就不再让它回到散开，
  // 免得「拆开」留在开态时后两拍空转、合拢后零件说明又压在立方体上成重影。
  const exploded = step === 2 || (explodeOpen && step < 3)
  const comparePair =
    mode === 'compare' && current && current.template === 'reveal' && pairIndex >= 0
      ? comparePairOf(
          Math.floor(pairIndex / 2),
          pairIndex % 2 === 0 ? 'left' : 'right',
          current.items.length,
          current.slide
        )
      : null
  const shownStep =
    mode === 'path' && nodeIndex >= 0 && current && current.template === 'path'
      ? pathStepOf(nodeIndex, current.track.nodes)
      : step

  // 真全屏。被浏览器拒绝（比如在 iframe 里）就退化成覆盖整个视口的浮层，不影响讲课
  useEffect(() => {
    const el = rootRef.current
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {})
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  // 用浏览器自带的 ESC 退出全屏时，演示也一起收掉
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) onExit()
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [onExit])

  // 「这里可以点」：只在有交互的页首次进入时亮一次（纯逻辑在 show.ts 的 hint 状态机）
  const interactiveHere = mode !== null
  useEffect(() => {
    setHint((h) => hintOnPageEnter(h, index, interactiveHere))
  }, [index, interactiveHere])

  useEffect(() => {
    if (hint.showing < 0) return
    const timer = window.setTimeout(() => setHint(hintOnAutoHide), HINT_AUTO_HIDE_MS)
    return () => window.clearTimeout(timer)
  }, [hint.showing])

  // 键盘主线：→ / 空格 / Enter 逐层揭示，← 回退，Esc 退出——语义与任务 04/07 以来一字未改；
  // I 键是新占的岔路键（只关提示，不动 step/page），与风险清单那条铁律对齐。
  //
  // useEffect 依赖老 bug 的修法：原来这个 effect 没有依赖数组，每次 render 都拆装监听器；
  // 现在改成只在挂载时装一个稳定壳子，每 render 把最新 handler 存进 ref。
  // 两种写法的可观察行为等价：任意时刻按下的键都是由「当前这次 render 闭包」处理的（旧：刚重装的；新：ref 刚刷的），
  // 而键盘分支本身（哪些键 → 哪个动作）完全没动。
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onExit()
    } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
      e.preventDefault()
      advance()
    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
      e.preventDefault()
      back()
    } else if (e.key === 'i' || e.key === 'I') {
      // 排除修饰键：⌘I / Ctrl+Shift+I（开发者工具）不该误关提示，只在裸按 i 时才动 hint。
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // 不 preventDefault：这把键不抢任何既存行为
      setHint(hintOnDisableKey)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (total === 0) {
    return (
      <div className="show show-loading" style={themeStyle(theme)}>
        <button className="show-exit" onClick={onExit}>
          退出演示 · ESC
        </button>
        学生版页面还没准备好
      </div>
    )
  }

  return (
    <div className="show" ref={rootRef} onClick={advance} style={themeStyle(theme)}>
      <button
        className="show-exit"
        onClick={(e) => {
          e.stopPropagation()
          onExit()
        }}
      >
        退出演示 · ESC
      </button>

      <div className="show-stage" key={index}>
        {/* 底景：与 .pptx / PPT 预览同一份形状表；纸取这一页真正铺的那张（封面有封面纸） */}
        <BackdropSvg
          bg={backdropFor(paperOf(theme, current.slide.kind), index, current.slide.kind)}
          paper={paperOf(theme, current.slide.kind)}
          ink={theme.ink}
          accent={theme.accent}
        />
        {current.template === 'cover' && (
          <div className="ss-slide ss-cover">
            <p className="ss-label">一课三稿 · 模拟上课</p>
            <h1 className="ss-cover-title">《{current.slide.title}》</h1>
            <span className="ss-cover-rule" />
            {current.slide.line && <p className="ss-cover-lead">{current.slide.line}</p>}
            <p className="ss-cover-note">
              共 {pad(total)} 页　·　{formatTime(duration)}　·　点一下开始
            </p>
          </div>
        )}

        {current.template === 'reveal' && (
          <RevealSlide
            label={sceneLabel(current.slide)}
            title={current.slide.title}
            items={current.items}
            question={current.question}
            figure={current.figure}
            big={current.big}
            columns={current.columns}
            step={step}
            pickable={mode === 'compare'}
            activePair={comparePair}
            onPickItem={mode === 'compare' ? pickCompare : undefined}
          />
        )}

        {current.template === 'explode' && (
          <ExplodeSlide
            label={sceneLabel(current.slide)}
            title={current.slide.title}
            items={current.items}
            question={current.question}
            step={step}
            opened={explodeOpen}
            exploded={exploded}
            activePart={partIndex}
            noteShorts={current.noteShorts}
            onToggleOpen={toggleExplode}
            onPickPart={pickPart}
          />
        )}

        {current.template === 'path' && (
          <PathSlide
            label={sceneLabel(current.slide)}
            title={current.slide.title}
            track={current.track}
            trail={current.trail}
            question={current.question}
            step={shownStep}
            onPickNode={pickNode}
          />
        )}
      </div>

      {/* §A.3.3 的提示：只住岔路，pointer-events 全透，不参与布局与 stepsOf */}
      <div className={hint.showing === index ? 'show-tap-hint on' : 'show-tap-hint'} aria-hidden>
        {HINT_TEXT}
      </div>

      <footer className="show-foot" onClick={(e) => e.stopPropagation()}>
        <button className="show-btn" onClick={back} disabled={index === 0 && step <= 1}>
          ← 上一步
        </button>
        <span className="show-hint">
          {step < steps
            ? '这一页还没讲完，再点一下'
            : atEnd
              ? '最后一页 · ESC 退出'
              : '点击画面任意处，继续'}
        </span>
        <span className="show-page">
          {pad(index + 1)} / {pad(total)}
        </span>
        <button className="show-btn" onClick={advance} disabled={atEnd}>
          下一步 →
        </button>
      </footer>
    </div>
  )
}
