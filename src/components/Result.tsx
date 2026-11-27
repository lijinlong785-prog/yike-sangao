/**
 * 备课工作台结果页（2026 Qoder StudyHack 最终版）
 *
 * · 顶部极简控制条：10/20/30/40 分课型一键重排胶囊、⌘K 指令台、粉笔黑板、上台提词器、统一下拉「导出 ▾」；
 * · 非线性教学节奏时间轴（PacingTimeline）：莫兰迪学术色弹簧伸缩，点击任意环节左右双栏同步跳转；
 * · 三稿双栏联动 + 教案原地微调：左侧环节带「定位 PPT ↗」，双击「教师 / 学生」活动文字原地编辑，
 *   改完直接同步至 Word / Markdown / 复制全稿 / 提词器；
 * · 交互式粉笔黑板（InteractiveBlackboard）：分步书写推演 + 4 色颗粒粉笔批注 + 2x 高清 PNG 导出；
 * · Linear 级 ⌘K 全局指令台（CommandPalette）+ 视觉模板墙（TemplateWall）均 Portal 挂载至 document.body。
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LessonPlan, SegmentTimed } from '../types'
import { allocate, formatTime } from '../lib/timing'
import { classroomPptxName, usePptxExport, type StudentDeck } from '../lib/student'
import { coursewarePptxName, useDeckPptxExport } from '../lib/deckExport'
import {
  editDeckPage,
  insertDeckPage,
  moveDeckPage,
  removeDeckPage,
  restoreDeckPage,
  setDeckBullet,
  type DeckPage,
} from '../lib/deck'
import { gridTexture, themeVars, type DeckTheme } from '../lib/theme'
import { applySlideScenes, hasSlideScenes } from '../lib/slides'
import type { StudentSlide } from '../lib/slides'
import {
  EMPTY_EDITS,
  addAfter,
  applyEdits,
  editCount,
  moveAt,
  patchRef,
  removeAt,
  stackLimits,
  visibleRefs,
  type DeckEdits,
  type PageRef,
  type SlidePatch,
} from '../lib/deck2/edits'
import { TEMPLATE_ORDER, defaultTemplateId, templateOf, type TemplateId } from '../lib/deck2/theme'
import { VISUAL_THEME_IDS, VISUAL_THEMES } from '../lib/deck2/visualSystem'
import { paginate } from '../lib/deck2/paginate'
import { durationGuard } from '../lib/session'
import { scriptTextOf } from '../lib/scriptText'
import { downloadWord, planToDocHtml } from '../lib/word'
import { downloadMarkdown, planToMarkdown } from '../lib/markdown'
import DeckPageView from './DeckPage'
import PptPreview from './PptPreview'
import RunMeter from './RunMeter'
import TemplateWall from './TemplateWall'
import Teleprompter from './Teleprompter'
import PacingTimeline from './PacingTimeline'
import InteractiveBlackboard from './InteractiveBlackboard'
import CommandPalette, { type CommandItem } from './CommandPalette'

const SlideShow = lazy(() => import('./SlideShow'))

interface Props {
  plan: LessonPlan
  deck: DeckPage[]
  originalDeck: DeckPage[]
  onDeckChange: (pages: DeckPage[]) => void
  onResetDeck: () => void
  duration: number
  onDuration: (seconds: number) => void
  isDemo: boolean
  notice: string
  student: StudentDeck
  theme: DeckTheme
  studentTheme: DeckTheme
  themeReport?: { source: 'ai' | 'builtin'; reason?: string; problems: string[] }
  onEnsureStudent: (force?: boolean) => Promise<StudentSlide[]>
  studentStale?: boolean
  onRetry: () => void
  onCancelStudent: () => void
  onOpenSettings: () => void
  planToken: number
  initialEdits?: DeckEdits
  initialTemplateId?: TemplateId | null
  initialTab?: 'deck' | 'student'
  initialSlideAt?: number
  onSession?: (patch: {
    edits: DeckEdits
    templateId: TemplateId | null
    tab: 'deck' | 'student'
    slideAt: number
  }) => void
}

const DURATION_MIN = 10
const DURATION_MAX = 45
const QA_LIMIT = 80

const DURATION_TIERS = [
  { minutes: 10, label: '10分试讲' },
  { minutes: 20, label: '20分精简' },
  { minutes: 30, label: '30分标准' },
  { minutes: 40, label: '40分公开课' },
] as const

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 40
  return Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(n)))
}

/** 根据教学环节下标计算对应的教师课件页码 */
function deckIndexForSegment(segIndex: number, segName: string, totalSegs: number, deck: readonly DeckPage[]): number {
  if (deck.length === 0) return 0
  const cleanName = segName.split('·')[0].trim()
  const exact = deck.findIndex(
    (p) => (p.kind === 'segment' || p.kind === 'segmentPoint') && (p.title.includes(segName) || p.title.includes(cleanName))
  )
  if (exact >= 0) return exact
  const segPages = deck.map((p, i) => (p.kind === 'segment' ? i : -1)).filter((i) => i >= 0)
  if (segPages.length > 0) {
    const mapped = Math.min(segPages.length - 1, Math.round((segIndex / Math.max(1, totalSegs - 1)) * (segPages.length - 1)))
    return segPages[mapped]
  }
  return Math.min(deck.length - 1, Math.max(0, Math.round((segIndex / Math.max(1, totalSegs - 1)) * (deck.length - 1))))
}

/** 根据教学环节下标计算对应的学生版 PPT 页码 */
function slideIndexForSegment(segIndex: number, totalSegs: number, slides: readonly StudentSlide[]): number {
  if (slides.length <= 1) return 0
  if (segIndex === 0) {
    const hookIdx = slides.findIndex((s) => s.kind === 'hook')
    return hookIdx >= 0 ? hookIdx : 0
  }
  if (segIndex >= totalSegs - 1) {
    const endIdx = slides.findIndex((s) => s.kind === 'homework' || s.kind === 'end')
    return endIdx >= 0 ? endIdx : slides.length - 1
  }
  const usableStart = Math.min(1, slides.length - 1)
  const usableEnd = Math.max(usableStart, slides.length - 2)
  const ratio = segIndex / Math.max(1, totalSegs - 1)
  return Math.min(slides.length - 1, Math.max(0, Math.round(usableStart + ratio * (usableEnd - usableStart))))
}

export default function Result({
  plan,
  deck,
  originalDeck,
  onDeckChange,
  onResetDeck,
  duration,
  onDuration,
  isDemo,
  notice,
  student,
  theme,
  studentTheme,
  themeReport,
  onEnsureStudent,
  studentStale = false,
  onRetry,
  onCancelStudent,
  planToken,
  initialEdits,
  initialTemplateId = null,
  initialTab = 'deck',
  initialSlideAt = 0,
  onSession,
}: Props) {
  const [tab, setTab] = useState<'deck' | 'student'>(initialTab)
  const [page, setPage] = useState(0)
  const [slideAt, setSlideAt] = useState(initialSlideAt)
  const [editState, setEditState] = useState<{ cur: DeckEdits; undo: DeckEdits[] }>(() => ({
    cur: initialEdits ?? EMPTY_EDITS,
    undo: [],
  }))
  const edits = editState.cur
  const commitEdits = (fn: (e: DeckEdits) => DeckEdits) =>
    setEditState((s) => {
      const next = fn(s.cur)
      if (next === s.cur) return s
      return { cur: next, undo: [...s.undo, s.cur].slice(-40) }
    })
  const undoEdits = () =>
    setEditState((s) =>
      s.undo.length === 0 ? s : { cur: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1) }
    )

  /** 左侧教案「教师 / 学生」活动原地微调（按环节名存储，切换课型时长也保留微调） */
  const [segEdits, setSegEdits] = useState<Record<string, { teacher?: string; student?: string }>>({})
  const [activeSeg, setActiveSeg] = useState<number | null>(null)
  const [flashSeg, setFlashSeg] = useState<number | null>(null)
  const [flashPreview, setFlashPreview] = useState(false)

  const [following, setFollowing] = useState(false)
  const [showing, setShowing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [toast, setToast] = useState('')

  const [templateId, setTemplateId] = useState<TemplateId | null>(initialTemplateId)
  const template = useMemo(
    () => templateOf(templateId ?? defaultTemplateId(plan.meta.subject, plan.meta.topic, plan.meta.period)),
    [templateId, plan]
  )
  const recommendedId = useMemo(
    () => defaultTemplateId(plan.meta.subject, plan.meta.topic, plan.meta.period),
    [plan]
  )
  const [wallOpen, setWallOpen] = useState(false)
  const pptx = usePptxExport()
  const deckPptx = useDeckPptxExport()

  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const blackboardRef = useRef<HTMLElement | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 2400)
  }, [])

  // 换教案时重置页面状态与微调记录
  const lastTokenRef = useRef(planToken)
  useEffect(() => {
    if (lastTokenRef.current === planToken) return
    lastTokenRef.current = planToken
    setPage(0)
    setSlideAt(0)
    setActiveSeg(null)
    setSegEdits({})
    setEditState({ cur: EMPTY_EDITS, undo: [] })
    pptx.reset()
    deckPptx.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planToken])

  // 关闭导出下拉菜单（点击外部或 ESC）
  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  // 全局 Cmd+K / Ctrl+K 唤起 Linear 级指令台
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** 合并了老师原地微调的完整教案：所有导出（Word / Markdown / 复制稿 / 提词器）均读这一份 */
  const viewPlan = useMemo<LessonPlan>(() => {
    const mergedSegments = plan.segments.map((s) => {
      const patch = segEdits[s.name]
      if (!patch) return s
      return {
        ...s,
        ...(patch.teacher !== undefined ? { teacher: patch.teacher } : {}),
        ...(patch.student !== undefined ? { student: patch.student } : {}),
      }
    })
    return { ...plan, meta: { ...plan.meta, duration }, segments: mergedSegments }
  }, [plan, duration, segEdits])

  const timed = useMemo(() => allocate(viewPlan.segments, duration), [viewPlan.segments, duration])
  const planEditedCount = useMemo(
    () =>
      Object.values(segEdits).reduce(
        (n, p) => n + (p.teacher !== undefined ? 1 : 0) + (p.student !== undefined ? 1 : 0),
        0
      ),
    [segEdits]
  )

  const rawSlides = useMemo(
    () => paginate(applySlideScenes(student.slides, deck), template),
    [student.slides, deck, template]
  )
  const refs = useMemo(() => visibleRefs(edits, rawSlides.length), [edits, rawSlides.length])
  const slides = useMemo(() => applyEdits(rawSlides, edits), [rawSlides, edits])
  const editedCount = editCount(edits)
  const total = deck.length
  const index = Math.min(page, Math.max(0, total - 1))
  const current = deck[index]
  const making = student.status === 'working'
  const pptxMessage = pptx.error || student.error
  const studentTab =
    making ? '学生版 · 生成中' : student.slides.length === 0 ? '学生版 · 待生成' : `学生版 PPT（${slides.length}）`

  useEffect(() => {
    if (total > 0 && page > total - 1) setPage(total - 1)
  }, [page, total])

  useEffect(() => {
    if (slides.length > 0 && slideAt > slides.length - 1) setSlideAt(slides.length - 1)
  }, [slideAt, slides.length])

  const patchSlide = (ref: PageRef, patch: SlidePatch) =>
    commitEdits((e) => patchRef(e, rawSlides.length, ref, patch))
  const moveSlide = (at: number, delta: number) => commitEdits((e) => moveAt(e, rawSlides.length, at, delta))
  const removeSlide = (at: number) => commitEdits((e) => removeAt(e, rawSlides.length, at))
  const addSlide = (at: number, id: string, slide: StudentSlide) => {
    commitEdits((e) => addAfter(e, rawSlides.length, at, id, slide))
    setSlideAt(at + 1)
  }
  const resetEdits = () => commitEdits(() => EMPTY_EDITS)

  const sessionRef = useRef(onSession)
  sessionRef.current = onSession
  useEffect(() => {
    const id = window.setTimeout(() => {
      sessionRef.current?.({ edits, templateId, tab, slideAt })
    }, 300)
    return () => window.clearTimeout(id)
  }, [edits, templateId, tab, slideAt])

  const patchPage = (patch: Partial<DeckPage>) =>
    onDeckChange(deck.map((p, i) => (i === index ? editDeckPage(p, patch) : p)))
  const patchBullet = (bullet: number, text: string) =>
    onDeckChange(deck.map((p, i) => (i === index ? setDeckBullet(p, bullet, text) : p)))

  function addBullet() {
    const p = deck[index]
    if (!p) return
    patchPage({ bullets: [...(p.bullets ?? []), ''] })
  }
  function deletePage() {
    const next = removeDeckPage(deck, index)
    if (next === deck) return
    onDeckChange(next)
    setPage(Math.max(0, Math.min(index, next.length - 1)))
  }
  function insertPage() {
    onDeckChange(insertDeckPage(deck, index))
    setPage(index + 1)
  }
  function movePage(delta: number) {
    const next = moveDeckPage(deck, index, delta)
    if (next === deck) return
    onDeckChange(next)
    setPage(index + delta)
  }
  function restorePage() {
    onDeckChange(restoreDeckPage(deck, index, originalDeck))
  }

  /** 切换课型时长（10 / 20 / 30 / 40 分或自定义分钟） */
  const applyDurationMinutes = useCallback(
    (nextMinRaw: number) => {
      const nextMin = clampMinutes(nextMinRaw)
      const nextSec = nextMin * 60
      if (nextSec === duration) return
      if (durationGuard(duration, nextSec, editedCount) === 'confirm') {
        const ok = window.confirm(
          `改到 ${nextMin} 分钟会按新课型重排教学节奏与课件；已微调内容会保留。继续？`
        )
        if (!ok) return
      }
      onDuration(nextSec)
      showToast(`已重排为 ${nextMin} 分钟课型骨架`)
    },
    [duration, editedCount, onDuration, showToast]
  )

  /** 三稿双栏联动：跳至指定教学环节（左栏滚动高亮 + 右栏教师课件与学生版 PPT 同步定位） */
  const jumpToSegment = useCallback(
    (segIndex: number, scrollLeft = true) => {
      const seg = timed[segIndex]
      if (!seg) return
      setActiveSeg(segIndex)
      setFlashSeg(segIndex)
      window.setTimeout(() => setFlashSeg((cur) => (cur === segIndex ? null : cur)), 1400)

      if (scrollLeft) {
        const card = document.getElementById(`seg-card-${segIndex}`)
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      const targetDeckIdx = deckIndexForSegment(segIndex, seg.name, timed.length, deck)
      setPage(targetDeckIdx)
      if (slides.length > 0) {
        const targetSlideIdx = slideIndexForSegment(segIndex, timed.length, slides)
        setSlideAt(targetSlideIdx)
      }
      setFlashPreview(true)
      window.setTimeout(() => setFlashPreview(false), 750)
    },
    [timed, deck, slides]
  )

  /** 左侧教案原地微调回调 */
  const handlePatchSegment = useCallback(
    (segName: string, field: 'teacher' | 'student', value: string) => {
      const orig = plan.segments.find((s) => s.name === segName)
      setSegEdits((prev) => {
        const cur = prev[segName] ?? {}
        const nextVal = orig && orig[field] === value ? undefined : value
        const updated = { ...cur, [field]: nextVal }
        if (updated.teacher === undefined && updated.student === undefined) {
          const copy = { ...prev }
          delete copy[segName]
          return copy
        }
        return { ...prev, [segName]: updated }
      })
    },
    [plan.segments]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cmdOpen || wallOpen || following || showing) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') {
        if (tab === 'deck') setPage((p) => Math.max(0, p - 1))
        else setSlideAt((p) => Math.max(0, p - 1))
      }
      if (e.key === 'ArrowRight') {
        if (tab === 'deck') setPage((p) => Math.min(total - 1, p + 1))
        else setSlideAt((p) => Math.min(slides.length - 1, p + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, total, slides.length, cmdOpen, wallOpen, following, showing])

  /* ==================== 导出动作集合 ==================== */
  const copyScript = useCallback(async () => {
    const text = scriptTextOf(viewPlan, timed)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const box = document.createElement('textarea')
      box.value = text
      box.style.position = 'fixed'
      box.style.opacity = '0'
      document.body.appendChild(box)
      box.select()
      try {
        document.execCommand('copy')
      } finally {
        document.body.removeChild(box)
      }
    }
    setCopied(true)
    showToast('已复制完整三稿纯文本（含原地微调）')
    window.setTimeout(() => setCopied(false), 2000)
  }, [viewPlan, timed, showToast])

  const handleExportWord = useCallback(() => {
    const html = planToDocHtml(viewPlan, timed, deck)
    downloadWord(`《${viewPlan.meta.topic}》-教学设计备课包.doc`, html)
    showToast('已导出 Word 教案（.doc）')
  }, [viewPlan, timed, deck, showToast])

  const handleExportMarkdown = useCallback(() => {
    const md = planToMarkdown(viewPlan, timed, deck)
    downloadMarkdown(`《${viewPlan.meta.topic}》-备课包.md`, md)
    showToast('已导出 Markdown 备课包（.md）')
  }, [viewPlan, timed, deck, showToast])

  const handleExportDeck = useCallback(async () => {
    if (deckPptx.busy) return
    await deckPptx.run(deck, coursewarePptxName(plan.meta.topic), theme)
    showToast('已导出教师版课件（.pptx）')
  }, [deckPptx, deck, plan.meta.topic, theme, showToast])

  const handleExportPptx = useCallback(
    async (animated: boolean) => {
      if (pptx.busy || making) return
      const list = slides.length ? slides : await onEnsureStudent()
      if (list.length === 0) return
      await pptx.run(
        list,
        classroomPptxName(plan.meta.topic),
        studentTheme,
        animated,
        stackLimits(student.limits, list.length),
        template
      )
      showToast(`已导出学生版课堂 PPT（${template.name} · .pptx）`)
    },
    [pptx, making, slides, onEnsureStudent, plan.meta.topic, studentTheme, student.limits, template, showToast]
  )

  async function handleGenerateStudent(force = false): Promise<StudentSlide[]> {
    if (making) return student.slides
    if (force && editedCount > 0 && !window.confirm(`会覆盖你改过的 ${editedCount} 处，确定？`)) {
      return student.slides
    }
    pptx.reset()
    setSlideAt(0)
    setEditState({ cur: EMPTY_EDITS, undo: [] })
    return onEnsureStudent(force)
  }

  async function onGenerate(force = false) {
    if (making) return
    const list = await handleGenerateStudent(force)
    if (list.length > 0) setTab('student')
  }

  const handleShow = useCallback(async () => {
    const list = slides.length > 0 ? slides : await onEnsureStudent()
    if (list.length > 0) setShowing(true)
  }, [slides, onEnsureStudent])

  const scrollToBlackboard = useCallback(() => {
    blackboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  /* ==================== ⌘K 全局指令清单 ==================== */
  const commands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      // 1. 课型时长重排
      ...DURATION_TIERS.map((t) => ({
        id: `dur-${t.minutes}`,
        group: '课型时长一键重排',
        title: `切换至 ${t.label}（${t.minutes} 分钟）`,
        subtitle: Math.round(duration / 60) === t.minutes ? '当前课型' : '重排教学节奏与课件页数',
        keywords: `${t.minutes} 分钟 时长 试讲 精简 标准 公开课 duration`,
        run: () => applyDurationMinutes(t.minutes),
      })),
      // 2. 跳转任意教学环节
      ...timed.map((s, i) => ({
        id: `seg-${i}`,
        group: '跳转教学环节（双栏同步）',
        title: `${i + 1}. ${s.name}`,
        subtitle: `${formatTime(s.start)}–${formatTime(s.end)} · ${s.seconds}s`,
        keywords: `环节 跳转 ${s.name} segment`,
        run: () => jumpToSegment(i, true),
      })),
      // 3. 三大公开课视觉主题
      ...VISUAL_THEME_IDS.map((vid) => {
        const meta = VISUAL_THEMES[vid]
        return {
          id: `theme-${vid}`,
          group: '切换公开课视觉主题',
          title: `应用「${meta.name}」视觉主题`,
          subtitle: meta.tagline,
          keywords: `${meta.name} ${vid} 主题 模板 换肤 公开课`,
          run: () => {
            setTemplateId(vid)
            setTab('student')
            showToast(`已切换公开课视觉主题：${meta.name}`)
          },
        }
      }),
      // 4. 工作台工具
      {
        id: 'tool-wall',
        group: '工作台工具',
        title: `打开视觉模板墙（全部 ${TEMPLATE_ORDER.length} 套）`,
        subtitle: '3 套公开课旗舰主题 + 19 族 43 套经典模板',
        keywords: '模板 换模板 模板墙 template wall',
        run: () => {
          setTab('student')
          setWallOpen(true)
        },
      },
      {
        id: 'tool-blackboard',
        group: '工作台工具',
        title: '定位至交互式粉笔黑板',
        subtitle: '分步书写推演 · 4 色粉笔批注 · 导出 2x PNG',
        keywords: '黑板 板书 粉笔 blackboard',
        run: scrollToBlackboard,
      },
      {
        id: 'tool-teleprompter',
        group: '工作台工具',
        title: '启动专业上台提词器',
        subtitle: '暗房/暖纸双模式 · 自动滚屏 · 右侧同步 PPT 提示卡',
        keywords: '提词器 演练 跟走 teleprompter',
        run: () => setFollowing(true),
      },
      {
        id: 'tool-tab-deck',
        group: '工作台工具',
        title: '切换右侧至「教师版课件」',
        subtitle: `共 ${deck.length} 页 · 支持原地编辑标题/要点/备注`,
        keywords: '教师 课件 deck',
        run: () => setTab('deck'),
      },
      {
        id: 'tool-tab-student',
        group: '工作台工具',
        title: '切换右侧至「学生版 PPT」',
        subtitle: `共 ${slides.length} 页 · 公开课投影画面`,
        keywords: '学生 ppt student',
        run: () => setTab('student'),
      },
      // 5. 导出与演示
      {
        id: 'exp-word',
        group: '导出与课堂演示',
        title: '导出 Word 教案（.doc）',
        subtitle: '包含教学设计（含原地微调）、课件逐页、说课与板书',
        keywords: 'word doc 导出 教案',
        run: handleExportWord,
      },
      {
        id: 'exp-deck-pptx',
        group: '导出与课堂演示',
        title: '导出教师版课件（.pptx）',
        subtitle: '保留全部增删改页与演讲者口播备注',
        keywords: 'pptx 教师 课件 导出',
        run: () => void handleExportDeck(),
      },
      {
        id: 'exp-student-pptx',
        group: '导出与课堂演示',
        title: '导出学生版课堂 PPT（.pptx）',
        subtitle: `当前模板：${template.name}·${template.tone}（含预置/上传插画）`,
        keywords: 'pptx 学生 课堂 导出',
        disabled: making || slides.length === 0,
        run: () => void handleExportPptx(hasSlideScenes(slides)),
      },
      {
        id: 'exp-md',
        group: '导出与课堂演示',
        title: '导出 Markdown 备课包（.md）',
        subtitle: '纯文本表格与代码块，适合 Notion / Obsidian / Git',
        keywords: 'markdown md 导出',
        run: handleExportMarkdown,
      },
      {
        id: 'exp-copy',
        group: '导出与课堂演示',
        title: '复制全部三稿纯文本',
        subtitle: '一键写入剪贴板，粘入 Word / 飞书即用',
        keywords: '复制 copy 全稿',
        run: () => void copyScript(),
      },
      {
        id: 'exp-show',
        group: '导出与课堂演示',
        title: '全屏课堂演示（SlideShow）',
        subtitle: '直接投屏给学生看，支持键盘翻页',
        keywords: '全屏 演示 放映 slideshow',
        disabled: making || slides.length === 0,
        run: () => void handleShow(),
      },
      {
        id: 'exp-print',
        group: '导出与课堂演示',
        title: '打印 / 另存 PDF',
        subtitle: '调用浏览器打印排版输出纸质教案',
        keywords: '打印 print pdf',
        run: () => window.print(),
      },
    ]
    return list
  }, [
    duration,
    timed,
    deck.length,
    slides,
    template.name,
    template.tone,
    making,
    applyDurationMinutes,
    jumpToSegment,
    scrollToBlackboard,
    handleExportWord,
    handleExportDeck,
    handleExportPptx,
    handleExportMarkdown,
    copyScript,
    handleShow,
    showToast,
  ])

  const currentMinutes = Math.round(duration / 60)
  const metaFacts = [
    [plan.meta.stage, plan.meta.grade].filter(Boolean).join(''),
    plan.meta.subject,
    plan.meta.period,
    plan.meta.textbook,
  ].filter(Boolean)

  return (
    <div className="result">
      {/* 极简工作台顶部控制条 */}
      <header className="studio-bar">
        <div className="studio-bar-left">
          <div className="studio-bar-title">
            <h2>《{plan.meta.topic}》</h2>
            {isDemo && <span className="badge-demo">示范课</span>}
          </div>
          <p className="result-meta">{metaFacts.join(' · ')}</p>
        </div>

        <div className="studio-bar-controls">
          {/* 四档课型时长一键切换胶囊 */}
          <div className="tier-pills" role="group" aria-label="一键切换课型时长">
            {DURATION_TIERS.map((t) => (
              <button
                key={t.minutes}
                type="button"
                className={`tier-pill${currentMinutes === t.minutes ? ' active' : ''}`}
                onClick={() => applyDurationMinutes(t.minutes)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="studio-bar-tools">
            <button
              type="button"
              className="tool-btn cmd-trigger"
              onClick={() => setCmdOpen(true)}
              title="打开全局备课指令面板（⌘K / Ctrl+K）"
            >
              <span>指令台</span>
              <kbd>⌘K</kbd>
            </button>

            <button
              type="button"
              className="tool-btn"
              onClick={scrollToBlackboard}
              title="定位至交互式粉笔黑板"
            >
              粉笔黑板
            </button>

            <button
              type="button"
              className="tool-btn"
              onClick={() => setFollowing(true)}
              title="启动专业级上台提词器"
            >
              上台提词器
            </button>

            {/* 统一下拉「导出 ▾」菜单 */}
            <div className="export-dropdown" ref={exportMenuRef}>
              <button
                type="button"
                className="btn primary sm export-trigger"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((v) => !v)}
              >
                导出 ▾
              </button>
              {exportOpen && (
                <div className="export-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setExportOpen(false)
                      handleExportWord()
                    }}
                  >
                    <span>Word 教案（.doc）</span>
                    <em>含教案微调 + 逐页课件</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={deckPptx.busy}
                    onClick={() => {
                      setExportOpen(false)
                      void handleExportDeck()
                    }}
                  >
                    <span>教师版课件（.pptx）</span>
                    <em>{deck.length} 页 · 含口播备注</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pptx.busy || making || slides.length === 0}
                    onClick={() => {
                      setExportOpen(false)
                      void handleExportPptx(hasSlideScenes(slides))
                    }}
                  >
                    <span>学生版 PPT（.pptx）</span>
                    <em>{template.name} · {slides.length} 页同源导出</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setExportOpen(false)
                      handleExportMarkdown()
                    }}
                  >
                    <span>Markdown 备课包（.md）</span>
                    <em>适配 Notion / 飞书</em>
                  </button>
                  <div className="export-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setExportOpen(false)
                      void copyScript()
                    }}
                  >
                    <span>{copied ? '已复制全稿 ✓' : '复制全稿纯文本'}</span>
                    <em>教学设计 + 说课 + 板书</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={making || slides.length === 0}
                    onClick={() => {
                      setExportOpen(false)
                      void handleShow()
                    }}
                  >
                    <span>全屏课堂演示</span>
                    <em>学生投影放映模式</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setExportOpen(false)
                      window.print()
                    }}
                  >
                    <span>打印 / 另存 PDF</span>
                    <em>A4 纸质教案排版</em>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 非线性教学节奏时间轴 */}
      <PacingTimeline
        timed={timed}
        duration={duration}
        activeIndex={activeSeg}
        onSelect={(i) => jumpToSegment(i, true)}
      />

      {toast && <div className="studio-toast" role="status">{toast}</div>}

      {notice && (
        <div className="notice">
          <span>{notice}</span>
          <button className="link-btn" onClick={onRetry}>
            重试在线模型
          </button>
        </div>
      )}

      {pptxMessage && (
        <div className="alert">
          <div>{pptxMessage}</div>
          {pptx.problems.length > 0 && (
            <ul className="alert-problems">
              {pptx.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <button className="link-btn" onClick={() => void handleExportPptx(true)}>
            重试导出
          </button>
        </div>
      )}

      {/* 双栏主工作区：左栏可编辑三稿教案 + 粉笔黑板，右栏同源课件 & 公开课 PPT */}
      <div className="result-cols">
        <div className="result-script">
          <section className="rs-sec">
            <div className="rs-sec-head">
              <h2>教学设计</h2>
              <div className="rs-sec-hint">
                {planEditedCount > 0 ? (
                  <>
                    <span className="edit-pill">已微调 {planEditedCount} 处 · 自动同步导出</span>
                    <button type="button" className="link-btn" onClick={() => setSegEdits({})}>
                      还原教案
                    </button>
                  </>
                ) : (
                  <span className="rs-sec-tip">双击任意「教师 / 学生」活动文字可原地微调</span>
                )}
              </div>
            </div>
            <TeachingDesign
              plan={viewPlan}
              timed={timed}
              activeSeg={activeSeg}
              flashSeg={flashSeg}
              onLocate={(i) => jumpToSegment(i, false)}
              onPatchSegment={handlePatchSegment}
            />
          </section>

          <section className="rs-sec" ref={blackboardRef} id="section-blackboard">
            <div className="rs-sec-head">
              <h2>交互式粉笔黑板</h2>
              <span className="rs-sec-tip">支持分步书写推演 · 4 色粉笔批注 · 2x PNG 导出</span>
            </div>
            <InteractiveBlackboard plan={viewPlan} />
          </section>

          <section className="rs-sec">
            <h2>说课稿</h2>
            <Speech plan={viewPlan} />
          </section>

          <section className="rs-sec">
            <h2>答辩预案</h2>
            <Defense plan={viewPlan} />
          </section>

          <section className="rs-sec">
            <h2>讲台时间表</h2>
            <Timeline plan={viewPlan} timed={timed} onStartFollow={() => setFollowing(true)} />
          </section>
        </div>

        <aside className={`result-preview${flashPreview ? ' is-synced' : ''}`} style={themeVars(theme)}>
          <div className="rs-switch">
            <div className="segmented sm">
              <button
                className={tab === 'deck' ? 'seg active' : 'seg'}
                onClick={() => setTab('deck')}
              >
                教师课件（{total}）
              </button>
              <button
                className={tab === 'student' ? 'seg active' : 'seg'}
                onClick={() => setTab('student')}
              >
                {studentTab}
              </button>
            </div>
            <label className="rs-dur" title="可自定义 10–45 分钟">
              <input
                type="number"
                min={DURATION_MIN}
                max={DURATION_MAX}
                value={currentMinutes}
                onChange={(e) => applyDurationMinutes(Number(e.target.value))}
                aria-label="课时分钟数"
              />
              分
            </label>
          </div>

          {/* 公开课三大视觉主题快捷切换条 + 模板墙入口 */}
          {tab === 'student' && (
            <div className="tpl-bar">
              <div className="tpl-quick-themes" role="group" aria-label="三大公开课视觉主题">
                {VISUAL_THEME_IDS.map((vid) => {
                  const meta = VISUAL_THEMES[vid]
                  const active = template.id === vid
                  return (
                    <button
                      key={vid}
                      type="button"
                      className={`tpl-quick-btn${active ? ' active' : ''}`}
                      onClick={() => setTemplateId(vid)}
                      title={meta.tagline}
                    >
                      <i className="tpl-swatch" style={{ background: meta.theme.accent }} />
                      <span>{meta.name}</span>
                    </button>
                  )
                })}
              </div>
              <button type="button" className="btn outline sm" onClick={() => setWallOpen(true)}>
                换模板（{TEMPLATE_ORDER.length} 套）
              </button>
            </div>
          )}

          <div className="rs-stage">
            {tab === 'deck' && current && (
              <DeckPageView
                page={current}
                index={index}
                total={total}
                topic={plan.meta.topic}
                texture={gridTexture(theme)}
                onPatch={patchPage}
                onBullet={patchBullet}
                onAddBullet={addBullet}
                onDelete={deletePage}
                onInsert={insertPage}
                onMove={movePage}
                onRestore={restorePage}
              />
            )}
            {tab === 'student' && (
              <PptPreview
                topic={plan.meta.topic}
                slides={slides}
                theme={studentTheme}
                template={template}
                index={slideAt}
                onIndex={setSlideAt}
                exportState={pptx}
                making={making}
                progress={student.progress}
                onCancel={onCancelStudent}
                idle={!making && student.slides.length === 0}
                stale={studentStale}
                base={rawSlides}
                refs={refs}
                editedCount={editedCount}
                onPatch={patchSlide}
                onMove={moveSlide}
                onRemove={removeSlide}
                onAdd={addSlide}
                onUndo={undoEdits}
                canUndo={editState.undo.length > 0}
                onResetEdits={resetEdits}
                onGenerate={() => void handleGenerateStudent()}
                onDownload={(animated) => void handleExportPptx(animated)}
              />
            )}
          </div>

          {making && student.run && (
            <RunMeter {...student.run} label={student.progress || '正在生成学生版…'} />
          )}
          {tab === 'student' && student.illustNote && <p className="ppt-note">{student.illustNote}</p>}

          {tab === 'deck' && (
            <div className="rs-nav">
              <button className="btn outline sm" disabled={index === 0} onClick={() => setPage(index - 1)}>
                ←
              </button>
              <span className="ppt-count">
                {index + 1} / {total}
              </span>
              <button
                className="btn outline sm"
                disabled={index >= total - 1}
                onClick={() => setPage(index + 1)}
              >
                →
              </button>
              <button
                className="btn outline sm"
                onClick={onResetDeck}
                disabled={!deck.some((p) => p.userEdited)}
                title="删掉的页与改过的字全部回到原稿"
              >
                恢复原稿
              </button>
              <button className="btn primary sm" onClick={() => void handleExportDeck()} disabled={deckPptx.busy}>
                {deckPptx.busy ? '正在导出…' : deckPptx.done ? '已下载 ✓' : '下载教师课件'}
              </button>
            </div>
          )}

          {tab === 'deck' && (
            <div className="rs-gen">
              {making ? (
                <button
                  className="btn outline sm"
                  onClick={onCancelStudent}
                  title="停止这次生成，已经出来的页会留着"
                >
                  停止生成
                </button>
              ) : student.interrupted && student.slides.length > 0 ? (
                <button className="btn primary sm" onClick={() => void onGenerate(true)}>
                  继续生成学生版 PPT
                </button>
              ) : student.slides.length === 0 ? (
                <button className="btn primary sm" onClick={() => void onGenerate()}>
                  课件改好了，生成学生版 PPT
                </button>
              ) : studentStale ? (
                <>
                  <button className="btn primary sm" onClick={() => void onGenerate(true)}>
                    课件已修改，同步重新生成学生版
                  </button>
                </>
              ) : (
                <>
                  <button className="btn outline sm" onClick={() => setTab('student')}>
                    查看学生版 PPT（{slides.length} 页） →
                  </button>
                  <button
                    className="btn primary sm"
                    onClick={() => void handleExportPptx(hasSlideScenes(slides))}
                    disabled={pptx.busy}
                  >
                    {pptx.busy ? `编排第 ${pptx.page}/${pptx.total} 页…` : pptx.done ? '已下载 ✓' : '导出学生版 PPTX'}
                  </button>
                </>
              )}
            </div>
          )}

          <p className="rs-theme" title={tab === 'student' ? template.fits.join(' / ') : (theme.note ?? undefined)}>
            {tab === 'student'
              ? `当前视觉：${template.name}·${template.tone}（预览 / 模板墙 / .pptx 三处同源）`
              : `文档纸面：${theme.name}（点击页内文字即可原地编辑）`}
          </p>
          {themeReport && themeReport.problems.length > 0 && themeReport.source === 'builtin' && (
            <p className="pv-theme-note" title={themeReport.problems.join('；')}>
              纸面已回落默认：{themeReport.problems[0]}
            </p>
          )}
        </aside>
      </div>

      {following && (
        <Teleprompter
          plan={viewPlan}
          timed={timed}
          slides={slides}
          deck={deck}
          initialIndex={activeSeg ?? 0}
          onExit={() => setFollowing(false)}
        />
      )}

      <TemplateWall
        open={wallOpen}
        topic={plan.meta.topic}
        current={template}
        recommendedId={recommendedId}
        onPick={(id) => setTemplateId(id)}
        onClose={() => setWallOpen(false)}
      />

      <CommandPalette open={cmdOpen} commands={commands} onClose={() => setCmdOpen(false)} />

      {showing && slides.length > 0 && (
        <Suspense fallback={<div className="show show-loading">正在准备全屏放映…</div>}>
          <SlideShow slides={slides} duration={duration} theme={studentTheme} onExit={() => setShowing(false)} />
        </Suspense>
      )}
    </div>
  )
}

/* ---------- 教学设计（支持双击原地微调 + 定位 PPT ↗） ---------- */

function InlineEditableActivity({
  label,
  value,
  onSave,
}: {
  label: string
  value: string
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else setDraft(value)
  }

  if (editing) {
    return (
      <div className="seg-act-editing">
        <b>{label}</b>
        <div className="seg-act-editor">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(value)
                setEditing(false)
              } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
            }}
            aria-label={`编辑${label}活动`}
          />
          <span className="seg-act-hint">失焦或 ⌘+Enter 保存 · ESC 取消</span>
        </div>
      </div>
    )
  }

  return (
    <p
      className="seg-act-editable"
      title="双击原地微调文字（自动同步至 Word / Markdown / 提词器）"
      onDoubleClick={() => setEditing(true)}
    >
      <b>{label}</b>
      <span className="seg-act-text">{value}</span>
      <button
        type="button"
        className="seg-act-editbtn"
        onClick={() => setEditing(true)}
        aria-label={`微调${label}活动`}
        title="点击或双击原地编辑"
      >
        微调
      </button>
    </p>
  )
}

function TeachingDesign({
  plan,
  timed,
  activeSeg,
  flashSeg,
  onLocate,
  onPatchSegment,
}: {
  plan: LessonPlan
  timed: SegmentTimed[]
  activeSeg: number | null
  flashSeg: number | null
  onLocate: (index: number) => void
  onPatchSegment: (segName: string, field: 'teacher' | 'student', value: string) => void
}) {
  return (
    <div className="stack">
      <section>
        <h3 className="sec-title">教学目标</h3>
        <ul className="obj-list">
          <li>
            <b>课文里的</b>
            {plan.objectives.knowledge}
          </li>
          <li>
            <b>课上怎么练</b>
            {plan.objectives.process}
          </li>
          <li>
            <b>读完留下的</b>
            {plan.objectives.emotion}
          </li>
        </ul>
      </section>

      <section className="two-col">
        <div className="kv">
          <span className="kv-k key">教学重点</span>
          <span className="kv-v">{plan.keyPoint}</span>
        </div>
        <div className="kv">
          <span className="kv-k hard">教学难点</span>
          <span className="kv-v">{plan.hardPoint}</span>
        </div>
      </section>

      <section>
        <h3 className="sec-title">教学过程</h3>
        {timed.map((s, i) => (
          <div
            className={`seg-card${activeSeg === i ? ' is-active' : ''}${flashSeg === i ? ' is-flash' : ''}`}
            id={`seg-card-${i}`}
            key={`${s.name}-${i}`}
          >
            <div className="seg-head">
              <span className="seg-name">{s.name}</span>
              <div className="seg-head-right">
                <span className="seg-time">
                  {Math.round(s.seconds / 60)}分 · {formatTime(s.start)} – {formatTime(s.end)}
                </span>
                <button
                  type="button"
                  className="seg-locate-btn"
                  onClick={() => onLocate(i)}
                  title="同步右侧教师课件与学生版 PPT 至本环节对应页"
                >
                  定位 PPT ↗
                </button>
              </div>
            </div>
            <p className="seg-goal">{s.goal}</p>
            <div className="seg-body">
              <InlineEditableActivity
                label="教师"
                value={s.teacher}
                onSave={(val) => onPatchSegment(s.name, 'teacher', val)}
              />
              <InlineEditableActivity
                label="学生"
                value={s.student}
                onSave={(val) => onPatchSegment(s.name, 'student', val)}
              />
            </div>
            {s.pauses?.map((p, j) => (
              <p className="pause" key={j}>
                <em>停 {p.seconds} 秒</em>
                <span>
                  {p.type} · 问：「{p.question}」
                </span>
              </p>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h3 className="sec-title">作业布置</h3>
        <p className="para">
          <b>必做</b>
          {plan.homework.must}
        </p>
        <p className="para">
          <b>选做</b>
          {plan.homework.optional}
        </p>
      </section>

      <section>
        <h3 className="sec-title">教学准备</h3>
        <p className="para">{plan.preparation}</p>
      </section>
    </div>
  )
}

/* ---------- 说课稿 ---------- */

function Speech({ plan }: { plan: LessonPlan }) {
  return (
    <div className="stack speech">
      {plan.speech.map((sec, i) => (
        <section key={i}>
          <h3 className="sec-title">{sec.section}</h3>
          <p className="speech-text">{sec.text}</p>
        </section>
      ))}
    </div>
  )
}

/* ---------- 答辩预案 ---------- */

function Defense({ plan }: { plan: LessonPlan }) {
  return (
    <div className="stack defense">
      {plan.defense.map((d, i) => {
        const len = [...d.answer].length
        return (
          <div className="qa" key={i}>
            <p className="qa-q">
              <span className="qa-no">Q{i + 1}</span>
              {d.question}
            </p>
            <p className="qa-a">{d.answer}</p>
            <p className={len > QA_LIMIT ? 'qa-count over' : 'qa-count'}>
              {len} 字{len > QA_LIMIT ? ` · 超出建议 ${len - QA_LIMIT} 字` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- 讲台时间表 ---------- */

function Timeline({
  plan,
  timed,
  onStartFollow,
}: {
  plan: LessonPlan
  timed: SegmentTimed[]
  onStartFollow?: () => void
}) {
  const total = plan.meta.duration
  const [actual, setActual] = useState<Record<number, string>>({})

  const usedTotal = timed.reduce((sum, _, i) => sum + (Number(actual[i]) || 0), 0)
  const hasActual = timed.some((_, i) => Number(actual[i]) > 0)

  return (
    <div className="stack">
      {onStartFollow && (
        <section className="follow-start">
          <h3 className="sec-title">上台之前，用专业提词器走一遍</h3>
          <button className="btn primary sm" onClick={onStartFollow}>
            启动上台提词器 →
          </button>
        </section>
      )}

      <section>
        <h3 className="sec-title">讲台逐段台词</h3>
        <div className="table-wrap">
          <table className={`timeline-table ${hasActual ? 'with-actual' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: '19%' }}>环节</th>
                <th style={{ width: '11%' }}>预算</th>
                <th style={{ width: '16%' }}>时间段</th>
                <th>口播台词（含原地微调）</th>
                <th style={{ width: '12%' }}>实际（秒）</th>
              </tr>
            </thead>
            <tbody>
              {timed.map((s, i) => {
                const used = Number(actual[i]) || 0
                const over = used > s.seconds * 1.5
                const warn = used > s.seconds && !over
                return (
                  <tr key={i} className={over ? 'row-over' : warn ? 'row-warn' : undefined}>
                    <td className="tl-name">
                      {s.name}
                      {over && <span className="over-badge">超时</span>}
                    </td>
                    <td className="tl-sec">{s.seconds}s</td>
                    <td className="tl-range">
                      {formatTime(s.start)} – {formatTime(s.end)}
                    </td>
                    <td className="tl-script">{s.script}</td>
                    <td className="tl-actual">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="—"
                        value={actual[i] ?? ''}
                        onChange={(e) => setActual((prev) => ({ ...prev, [i]: e.target.value }))}
                        aria-label={`${s.name} 实际用时`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hasActual && (
          <div className={usedTotal > total ? 'actual-sum over' : 'actual-sum'}>
            实际合计 <b>{usedTotal}s</b> / 预算 {total}s
            {usedTotal > total
              ? `　超时 ${usedTotal - total}s`
              : `　还剩 ${total - usedTotal}s 可分配。`}
          </div>
        )}
      </section>
    </div>
  )
}