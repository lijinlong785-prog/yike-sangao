import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Home from './components/Home'
import Result from './components/Result'
import Settings from './components/Settings'
import { loadConfig, saveConfig, generatePlan, type LLMConfig } from './lib/llm'
import {
  applyDeckLayout,
  assignDeckLayouts,
  buildDeck,
  deckFingerprint,
  layoutOfDeck,
  mergeDeck,
  sameDeckStack,
  type DeckLayout,
  type DeckPage,
} from './lib/deck'
import { clearDeck, loadDeck, saveDeck } from './lib/deckStore'
import { allocate } from './lib/timing'
import { useStudentDeck } from './lib/student'
import { EXAMPLES, findExample, type ExampleEntry } from './data/examples'
import { skeletonPlan } from './lib/skeleton'
import { planForScale } from './data/lesson'
import { clearSession, loadSession, planKeyOf, saveSession, stripIllustration } from './lib/session'
import type { LessonInput, LessonPlan } from './types'

type View = 'home' | 'result' | 'settings'

const DEFAULT_INPUT: LessonInput = {
  topic: '',
  subject: '',
  stage: '',
  grade: '',
  period: '',
  textbook: '',
  duration: 2400,
}

/**
 * 课时范围：10–45 分钟（覆盖 10 分试讲 / 20 分精简 / 30 分标准 / 40 分公开课）。
 */
const DURATION_MIN = 10 * 60
const DURATION_MAX = 45 * 60
function clampDuration(seconds: number): number {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n <= 0) return 2400
  return Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(n / 60) * 60))
}

const params =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
const demoParam = params.get('ex')
const initialDemo =
  params.has('demo') || demoParam
    ? EXAMPLES.find((e) => e.id === demoParam) ?? EXAMPLES[0]
    : undefined

const durationParam = (() => {
  const n = Number(params.get('duration'))
  return Number.isFinite(n) && n > 0 ? clampDuration(n) : undefined
})()

const restored = initialDemo ? null : loadSession()

const initialPlan: LessonPlan | null = initialDemo
  ? {
      ...initialDemo.plan,
      meta: {
        ...initialDemo.plan.meta,
        duration: durationParam ?? 2400,
      },
    }
  : (restored?.plan ?? null)

const initialDuration = restored
  ? clampDuration(restored.duration)
  : (initialPlan?.meta?.duration ?? 2400)

export default function App() {
  const [view, setView] = useState<View>(initialDemo || restored ? 'result' : 'home')
  const [settingsFrom, setSettingsFrom] = useState<'home' | 'result'>('home')
  const [input, setInput] = useState<LessonInput>(restored?.input ?? DEFAULT_INPUT)
  const [plan, setPlan] = useState<LessonPlan | null>(initialPlan)
  const [duration, setDuration] = useState<number>(initialDuration)
  const [isDemo, setIsDemo] = useState(Boolean(initialDemo) || Boolean(restored?.isDemo))
  const [loading, setLoading] = useState(false)
  const [planToken, setPlanToken] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(restored ? '已恢复上次的备课（含你改过的字）。' : '')
  const [cfg, setCfg] = useState<LLMConfig>(() => loadConfig())
  const planAbortRef = useRef<AbortController | null>(null)

  const activePlan = useMemo<LessonPlan | null>(
    () => (plan ? planForScale(plan, duration) : null),
    [plan, duration]
  )
  const student = useStudentDeck(
    activePlan,
    cfg,
    () => deck,
    restored
      ? {
          planKey: restored.planKey,
          slides: restored.slides,
          fingerprint: restored.fingerprint,
          degraded: restored.degraded,
        }
      : null
  )
  const ensureStudent = student.ensure
  const deckTheme = student.theme
  const studentTheme = student.studentTheme

  const baseDeck = useMemo<DeckPage[] | null>(
    () =>
      activePlan
        ? assignDeckLayouts(
            buildDeck(activePlan, allocate(activePlan.segments, activePlan.meta.duration)),
            deckTheme.layouts,
            deckTheme.scenes
          )
        : null,
    [activePlan, deckTheme]
  )
  const deckTopic = activePlan ? `${activePlan.meta.topic}|${activePlan.meta.period}` : ''
  const deckKey = `${deckTopic}|${activePlan?.meta.duration ?? 0}`
  const [deckState, setDeckState] = useState<{
    key: string
    topic: string
    pages: DeckPage[]
    layout: DeckLayout
  } | null>(null)

  const deck = useMemo<DeckPage[] | null>(() => {
    if (!baseDeck) return null
    const raw = (() => {
      if (deckState && deckState.key === deckKey) return deckState.pages
      if (deckState && deckState.topic === deckTopic) {
        return applyDeckLayout(mergeDeck(baseDeck, deckState.pages), deckState.layout)
      }
      const stored = deckTopic ? loadDeck(deckTopic, baseDeck) : null
      if (stored) {
        return stored.sameBase
          ? stored.pages
          : applyDeckLayout(mergeDeck(baseDeck, stored.pages), stored.layout)
      }
      return baseDeck
    })()
    return assignDeckLayouts(raw, deckTheme.layouts, deckTheme.scenes)
  }, [baseDeck, deckKey, deckTopic, deckState, deckTheme])

  useEffect(() => {
    if (!deck || !baseDeck) return
    setDeckState((prev) =>
      prev && prev.key === deckKey
        ? prev
        : { key: deckKey, topic: deckTopic, pages: deck, layout: layoutOfDeck(deck, baseDeck) }
    )
  }, [deck, deckKey, deckTopic, baseDeck])

  const handleDeckChange = (pages: DeckPage[]) =>
    setDeckState({
      key: deckKey,
      topic: deckTopic,
      pages,
      layout: baseDeck ? layoutOfDeck(pages, baseDeck) : { deleted: [], order: [] },
    })

  const deckEdited = Boolean(
    deck &&
      baseDeck &&
      (deck.some((p) => p.userEdited) || !sameDeckStack(deck, baseDeck))
  )

  useEffect(() => {
    if (!deck || !deckTopic || !baseDeck) return
    if (deckEdited) saveDeck(deckTopic, deck, baseDeck)
    else clearDeck()
  }, [deck, deckTopic, deckEdited, baseDeck])

  function handleResetDeck() {
    clearDeck()
    setDeckState(null)
  }

  useEffect(() => {
    if (plan) setDuration(clampDuration(plan.meta.duration))
  }, [plan])

  const studentStale = Boolean(
    deck && student.slides.length > 0 && deckFingerprint(deck) !== student.fingerprint
  )

  function openPlan(next: LessonPlan, demo: boolean) {
    setPlan(next)
    setPlanToken((t) => t + 1)
    setDuration(clampDuration(next.meta.duration))
    setIsDemo(demo)
    setView('result')
    window.scrollTo({ top: 0 })
  }

  /** 首页点击精选示范课：免 API Key 0 秒直达工作台 */
  function handleOpenDemo(entry: ExampleEntry, durationSec: number) {
    clearSession()
    setError('')
    setNotice('')
    const sec = clampDuration(durationSec)
    setInput({ ...entry.plan.meta, duration: sec })
    openPlan({ ...entry.plan, meta: { ...entry.plan.meta, duration: sec } }, true)
  }

  async function handleGenerate(next: LessonInput) {
    setInput(next)
    setError('')
    setNotice('')
    clearSession()

    // 若未配置自定义 API Key 且命中内置示范课：0 秒瞬开（纯静态 Qoder Sites 同样畅快）
    const matchedDemo = findExample(next.topic)
    if (matchedDemo && !String(cfg.apiKey ?? '').trim()) {
      openPlan(
        {
          ...matchedDemo.plan,
          meta: {
            ...matchedDemo.plan.meta,
            duration: clampDuration(next.duration),
            ...(next.text ? { text: next.text } : {}),
          },
        },
        true
      )
      return
    }

    const controller = new AbortController()
    planAbortRef.current = controller
    setLoading(true)
    try {
      const result = await generatePlan(next, cfg, controller.signal)
      setNotice('')
      openPlan(result, false)
    } catch (e) {
      if (controller.signal.aborted) {
        setNotice('已停止生成，重新点「生成」就行。')
        return
      }
      const msg = e instanceof Error ? e.message : '生成失败，请重试。'
      console.warn(`[fallback] 备课包没拿到：${msg}`)
      const ex = findExample(next.topic)
      if (ex) {
        openPlan(
          { ...ex.plan, meta: { ...ex.plan.meta, duration: clampDuration(next.duration) } },
          true
        )
        setNotice('当前为离线示范模式，已载入本课完整预置备课包；配置 API Key 后可实时改写。')
        return
      }
      openPlan(skeletonPlan(next), false)
      setNotice('当前未连上在线模型，先为您生成结构化骨架稿，可直接原地编辑并导出。')
    } finally {
      if (planAbortRef.current === controller) planAbortRef.current = null
      setLoading(false)
    }
  }

  function cancelPlan() {
    planAbortRef.current?.abort()
  }

  function handleConfig(next: LLMConfig) {
    setCfg(next)
    saveConfig(next)
    setError('')
  }

  const firstSaveRef = useRef(true)
  useEffect(() => {
    if (!plan) return
    const patch: Parameters<typeof saveSession>[0] = {
      input,
      plan,
      duration,
      isDemo,
      planKey: planKeyOf(plan, duration),
      slides: stripIllustration(student.slides),
      fingerprint: student.fingerprint,
      degraded: student.degraded,
    }
    if (firstSaveRef.current) {
      firstSaveRef.current = false
      if (restored) {
        patch.edits = restored.edits
        patch.templateId = restored.templateId
        patch.tab = restored.tab
        patch.slideAt = restored.slideAt
      }
    }
    saveSession(patch)
  }, [plan, input, duration, isDemo, student.slides, student.fingerprint, student.degraded])

  const handleSession = useCallback(
    (patch: Parameters<typeof saveSession>[0]) => {
      saveSession(patch)
    },
    []
  )

  function handleBackHome() {
    clearSession()
    setNotice('')
    setPlan(null)
    setView('home')
  }

  function openSettings() {
    if (view === 'settings') return
    setSettingsFrom(view === 'result' ? 'result' : 'home')
    setView('settings')
  }

  function goBack() {
    if (view === 'settings') {
      setView(settingsFrom === 'result' && plan ? 'result' : 'home')
      return
    }
    handleBackHome()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          {view !== 'home' && (
            <button className="btn ghost back" onClick={goBack} title="返回上一屏">
              ← 返回
            </button>
          )}
          <button className="brand" onClick={handleBackHome}>
            <span className="brand-mark">课</span>
            <span className="brand-text">
              一课三稿
              <em>备课 · 课件 · 公开课</em>
            </span>
          </button>
        </div>
        <div className="topbar-actions">
          <button className={`btn ghost ${view === 'settings' ? 'active' : ''}`} onClick={openSettings}>
            模型设置
          </button>
        </div>
      </header>

      <main className={`main${view === 'result' ? ' is-workspace' : ''}`}>
        {view === 'home' && (
          <Home
            value={input}
            loading={loading}
            error={error}
            cfg={cfg}
            onGenerate={handleGenerate}
            onOpenDemo={handleOpenDemo}
            onCancel={cancelPlan}
            onOpenSettings={openSettings}
          />
        )}
        {view === 'result' && activePlan && deck && baseDeck && (
          <Result
            plan={activePlan}
            deck={deck}
            originalDeck={baseDeck}
            onDeckChange={handleDeckChange}
            onResetDeck={handleResetDeck}
            duration={duration}
            onDuration={setDuration}
            isDemo={isDemo}
            notice={notice}
            student={student}
            theme={deckTheme}
            studentTheme={studentTheme}
            themeReport={student.themeReport}
            onEnsureStudent={ensureStudent}
            studentStale={studentStale}
            onRetry={() => void handleGenerate(input)}
            planToken={planToken}
            initialEdits={restored?.edits}
            initialTemplateId={restored?.templateId ?? null}
            initialTab={restored?.tab ?? (isDemo ? 'student' : 'deck')}
            initialSlideAt={restored?.slideAt ?? 0}
            onSession={handleSession}
            onCancelStudent={student.cancel}
            onOpenSettings={openSettings}
          />
        )}
        {view === 'settings' && <Settings value={cfg} onChange={handleConfig} />}
      </main>

      <footer className="footer">
        <span>一课三稿 · Editorial Studio</span>
        <span className="footer-dim">2026 Qoder 高校创造力大赛（StudyHack 赛道）参赛最终版</span>
      </footer>
    </div>
  )
}