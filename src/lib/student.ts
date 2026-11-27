/**
 * 学生版课堂 PPT 的持有处（TASKS/07 §4.3）。
 *
 * 一句话说明白这里为什么存在：网页演示和导出的 .pptx 必须读**同一个** StudentSlide[]
 * 实例，页数才会永远一致。所以这份数据挂在最高的那一层（App），
 * 演示（SlideShow）、预览页下载（Preview）、教师版下载（Result）三方都从这里取，
 * 谁也不许自己再拼一遍。
 *
 * 三条规矩：
 * 1. 没填 key 时走内置/泛化数据（TASKS/13 后不再因为「没 key」而拒绝请求，key 在服务端）。
 * 2. 回退（有 Key 但模型那遍不合格）要说一句中文人话，界面上以小字显示，不弹窗。
 * 3. 失败不静默、不降级：拿到 PptxSlidesInvalidError 就把 problems 逐条摊开 + 给重试按钮，
 *    重试 = 再走一遍同样的流程，不做连锁重试。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LessonPlan } from '../types'
import type { LLMConfig } from './llm'
import { PptxSlidesInvalidError, countPptxPages, downloadPptx, downloadTemplatedPptx } from './pptx'
import { buildStudentSlides, getBuiltinStudentSlides, type SlideProgress, type StudentSlide } from './slides'
import { findExample } from '../data/examples'
import { attachBuiltinArt } from '../data/builtinArt'
import { densityFingerprint, type DensityLimits } from './density'
import { limitsFor, scaleOf } from './scale'
import { buildDeck, deckFingerprint, type DeckPage } from './deck'
import { allocate } from './timing'
import { DEFAULT_THEME, paperOf, type DeckTheme } from './theme'
import type { DeckTheme as TemplateTheme } from './deck2/theme'
import { resolveScheme, type SchemeReport } from './scheme'
import { builtinScheme } from './builtinScheme'
import { deriveStudentTheme, resolveStudentScheme, studentSchemeProblems, type StudentSchemeReport } from './studentScheme'
import { planKeyOf } from './session'

export type StudentStatus = 'idle' | 'working' | 'ready' | 'failed'

/**
 * 生成时「走到哪一段、从几点开始」（lib/eta.ts 拿它算「大概还要多久」）。
 * 与 progress 分开存：progress 是给人看的那句话，这里留的是能算的数。
 */
export interface SlideRun {
  stage: SlideProgress['stage']
  /** 这一段开始的时刻（毫秒时间戳）；同一段里翻页不重置 */
  at: number
  /** 段内进度（插画张数 / 兜底页数），没有分页的阶段是 0 */
  page: number
  total: number
}

export interface StudentDeckState {
  status: StudentStatus
  /** 交给演示与两处下载的那一份数组本身（同一个引用） */
  slides: StudentSlide[]
  /** 按钮上的进度话术：「正在重写学生版…」「正在编排第 N / 共 M 页」 */
  progress: string
  /** 当前阶段与起始时刻（「约还需多久」的算料，见 lib/eta.ts）；没在跑时是 null */
  run: SlideRun | null
  /**
   * 这一叠是被用户点「停止」截断的（不是跑完、也不是失败）。
   * 已经上屏的页留着，按钮换成「继续生成」；下一遍成功时清掉。
   */
  interrupted: boolean
  /** onFallback 给的那句中文，界面以小字显示 */
  fallback: string
  /** 生成这一叠页面本身失败的原因 */
  error: string
  /** 插画跑完的一句中文（只有额度不足停下时才有，见 TASKS/11 §八④） */
  illustNote: string
  /**
   * 这一叠是「模型失败后的内置降级页」而非模型亲写。UI 据此在降级提示旁挂一个
   * 「再试一次模型」按钮（走 ensure(true) 强制重打），让降级态可辨识、可重试。
   */
  degraded: boolean
  /**
   * 这一叠是从哪一版课件生成的（deckFingerprint）。老师改完课件，指纹就不一样了，
   * 界面据此写「课件改过了，重新生成」并把旧 PPT 标成「上一版已过期」（TASKS/17 §二.4）。
   */
  fingerprint: string
}

export const EMPTY_DECK: StudentDeckState = {
  status: 'idle',
  slides: [],
  progress: '',
  run: null,
  interrupted: false,
  fallback: '',
  error: '',
  illustNote: '',
  degraded: false,
  fingerprint: '',
}

/**
 * 学生版缓存的钥匙（TASKS/17 §二.5）：教案引用 + 档位指纹 + **这一叠课件的指纹**。
 * 三样全对上才算命中——老师改一个字，指纹就换，旧那一叠不许再被拿走。
 *
 * 抽成纯函数只为一件事：离线门禁能真的问一遍「同一叠再点一次会不会复用」，
 * 而不必把这个 hook 搬进 node（它要 DOM，SSR 里 ready 那道闸又永远不落）。
 */
export interface DeckKey {
  plan: LessonPlan
  density: string
  fingerprint: string
}

export function deckKeyOf(
  plan: LessonPlan,
  density: string,
  pages: readonly DeckPage[] | null | undefined
): DeckKey {
  return { plan, density, fingerprint: deckFingerprint(pages) }
}

export function sameDeckKey(a: DeckKey | null | undefined, b: DeckKey): boolean {
  return Boolean(a && sameLesson(a.plan, b.plan) && a.density === b.density && a.fingerprint === b.fingerprint)
}

/**
 * 同一课：课题 + 课时 + 档位相同。
 * 同档改分钟数会让 plan 变成新对象，但内容一个字没变——不能因此清屏 / 重配纸 / 重生成。
 */
export function sameLesson(
  a: LessonPlan | null | undefined,
  b: LessonPlan | null | undefined
): boolean {
  if (!a || !b) return a === b
  return planKeyOf(a, a.meta.duration) === planKeyOf(b, b.meta.duration)
}

/**
 * 刷新后把上一次的学生版接回来（TASKS/21 §二.6）。
 * slides 里的插画已在存档里剥掉：接回来的那一叠是文字页，按钮可以重新生成。
 */
export interface StudentResume {
  planKey: string
  slides: StudentSlide[]
  fingerprint: string
  degraded: boolean
}

/** 学生版 .pptx 的文件名：和教师文档（备课包.md / .doc）永远不同名 */
export function classroomPptxName(topic: string): string {
  const t = String(topic ?? '').replace(/[《》\s]/g, '')
  return `《${t || '课堂PPT'}》-课堂PPT.pptx`
}

export function slideProgressText(p: SlideProgress): string {
  if (p.stage === 'llm') return '正在重写学生版…'
  // 两遍导演各自只发一次（TASKS/12）：先定画法，再按图上的数字排版
  if (p.stage === 'direct') return '正在定这一课怎么画…'
  if (p.stage === 'typeset') return '正在按画排版面…'
  const total = p.total ?? p.page ?? 0
  const page = p.page ?? total
  // 出图是一张一张来的：进度按「张」说，不要拿「页」骗人
  if (p.stage === 'illust') return `正在配插画 ${page} / ${total} 张`
  return `正在编排第 ${page} / 共 ${total} 页`
}

function humanError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return '上一次生成已经取消。'
  const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
  return msg || '学生版页面没能拼出来，请重试。'
}

/** 取纸面的本地超时：比文本链一整条（110 秒）短很多，但得盖住一级（50 秒）的余量 */
const THEME_SCHEME_TIMEOUT_MS = 40_000

/** 学生版那一套纸的本地超时（TASKS/12 §4.2）：到点就用派生纸，界面上一个字都不提示 */
const STUDENT_SCHEME_TIMEOUT_MS = 40_000

/** 一张「学生纸已定」的闸：拼页前等它，旧的那张当场放行，不会把等待挂住 */
function makeReady(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {}
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

export interface StudentDeck extends StudentDeckState {
  /** 拿到这一叠页面：命中缓存直接给，没有才生成；重试 = 再调一次，不连锁 */
  ensure: (force?: boolean) => Promise<StudentSlide[]>
  /**
   * 「停止」：掐断正在跑的这一遍。已上屏的页留在屏幕上（状态回到可再生成），
   * 不抛错、不弹窗。备课包那一段的停止在 App 里（另一颗 AbortController）。
   */
  cancel: () => void
  /**
   * 生成这一叠时实际生效的上限（字数 / 页数区间 / items）。导出侧必须拿同一份去校验：
   * 从前 downloadPptx 内部写死 clip 的 10–14 页，一整节课的 27 页被自己的导出闸门退回，
   * 就是「学生版一按就炸」。这里把它跟着页面一起交出去，生成与导出同一个口径。
   */
  limits: DensityLimits
  /**
   * 本次课件的纸面（TASKS 09 §十三 第 9 件）。从 plan 落地的第一帧就有值：
   * 先给兜底的「纸与墨」，有 Key 时后台让模型读课文配一份，出框就自动打回重配。
   * 它失败、超时、乱答都只是「没换成模型配的那张纸」，永远不会把错误摊到界面上。
   */
  theme: DeckTheme
  /** 这张纸是怎么来的：模型配的 / 兜底；兜底时带上原因 */
  themeReport: { source: 'ai' | 'builtin'; reason?: string; problems: string[] }
  /**
   * 学生版（投影）那一套纸（TASKS/12）。与 theme 分开：课件是文档、PPT 是投影，
   * 两套纸各配各的；第一帧就是派生纸，模型那遍回来再换上，任何时候都不同源。
   */
  studentTheme: DeckTheme
}

/**
 * 挂在 App 的学生版状态。
 * 缓存钥匙是 plan 的引用 + 当前锁的档位 + **这一叠课件的指纹**（TASKS/17 §二.5）：
 * 老师改一个字，钥匙就换，旧那一叠不许再被命中——但旧页不从屏幕上抽走，
 * 只标成「上一版已过期」（界面拿 fingerprint 与当前课件的指纹比，见 App.tsx 的 stale）。
 *
 * 课件用 getter 传进来（而不是直接传数组）：App 里这一叠课件本身是下游算出来的，
 * 直接传会在渲染第一帧读到还没初始化的常量；而它只在点「生成」那一会儿需要。
 *
 * TASKS/15 块 A：钥匙里不再有「有没有 key」这一维——前端 key 不再是「走不走模型」的开关，
 * 只决定直连还是代理（endpointOf 裁决）。带着它只会让缓存永远 miss。
 */
export function useStudentDeck(
  plan: LessonPlan | null,
  cfg: LLMConfig,
  deckOf: () => readonly DeckPage[] | null | undefined,
  resume?: StudentResume | null
): StudentDeck {
  const [deckState, setDeck] = useState<StudentDeckState>(EMPTY_DECK)
  /* 刷新接回来的那一叠只消费一次；换课 / 跨档就废掉 */
  const resumeRef = useRef<StudentResume | null>(resume ?? null)
  /* 上一次真正「换了课」的钥匙：同档改分钟数时连清屏都不做 */
  const lastPlanKeyRef = useRef('')
  /** 点「生成」那一刻的课件：只在 ensure 里读，不在渲染期读（避开初始化顺序） */
  const deckOfRef = useRef(deckOf)
  deckOfRef.current = deckOf
  const cacheRef = useRef<{
    plan: LessonPlan
    density: string
    fingerprint: string
    slides: StudentSlide[]
    degraded: boolean
  } | null>(null)
  const pendingRef = useRef<{
    plan: LessonPlan
    density: string
    fingerprint: string
    promise: Promise<StudentSlide[]>
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const genRef = useRef(0)
  const fallbackRef = useRef('')
  const illustNoteRef = useRef('')
  // 纸面：跟着 plan 引用缓存
  const schemeCacheRef = useRef<{ plan: LessonPlan; report: SchemeReport | null } | null>(null)
  const schemeAbortRef = useRef<AbortController | null>(null)
  const [scheme, setScheme] = useState<{ plan: LessonPlan; report: SchemeReport } | null>(null)
  /** 最新课件纸：学生纸那遍与它并行，回来时用它复核（不能读闭包里的旧值） */
  const schemeRef = useRef<{ plan: LessonPlan; report: SchemeReport } | null>(scheme)
  schemeRef.current = scheme
  // 学生版那一套纸：与课件纸同寿命、同一个 plan 缓存钥匙，先串行拿到课件纸再问（§4.2）
  const studentCacheRef = useRef<{ plan: LessonPlan; lesson: DeckTheme; report: StudentSchemeReport } | null>(
    null
  )
  const studentAbortRef = useRef<AbortController | null>(null)
  const [studentScheme, setStudentScheme] = useState<{ plan: LessonPlan; report: StudentSchemeReport } | null>(null)
  const readyRef = useRef(makeReady())

  /**
   * 与 buildStudentSlides 同一份算法：密度档决定字数 / items，时长决定页数区间。
   * plan 为空时按『没锁档 + 片段』退到三档并集。
   */
  const limits = useMemo(
    () =>
      limitsFor(
        cfg?.density,
        scaleOf(plan?.meta?.duration ?? 0),
        plan?.meta?.duration
      ),
    [cfg?.density, plan]
  )

  // 先给兜底那一张，再让模型覆盖它——这一行永远有值，不存在「还没上色」的空档
  const report: SchemeReport = useMemo(
    () =>
      scheme && sameLesson(scheme.plan, plan)
        ? scheme.report
        : { theme: DEFAULT_THEME, source: 'builtin', problems: [], attempts: 0 },
    [plan, scheme]
  )
  const theme = report.theme
  /**
   * 学生版这套纸。模型那遍没回来之前先用派生纸（第一帧就有正确的纸，不闪），
   * 回来之后整份换掉；两条路都保证「和课件纸明显不同」，永远不回 DEFAULT_THEME。
   */
  const studentTheme = useMemo(
    () =>
      studentScheme && sameLesson(studentScheme.plan, plan)
        ? studentScheme.report.theme
        : deriveStudentTheme(theme, plan?.meta?.topic ?? ''),
    [plan, studentScheme, theme]
  )
  /** 生成那一叠时读的是「当下这张（学生版）纸」：插画四边要归一到它的纸色 */
  const themeRef = useRef<DeckTheme>(studentTheme)
  themeRef.current = studentTheme
  /** 两遍配纸的异步回调靠它认「这个结果还属于当前教案吗」（换教案后旧结果不许回写） */
  const planRef = useRef<LessonPlan | null>(plan)
  planRef.current = plan

  // 换教案：旧的那一叠立刻作废，不留一个「看着像新页面」的旧数组在界面上
  useEffect(() => {
    if (!plan) {
      lastPlanKeyRef.current = ''
      resumeRef.current = null
      genRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      pendingRef.current = null
      fallbackRef.current = ''
      illustNoteRef.current = ''
      cacheRef.current = null
      setDeck(EMPTY_DECK)
      return
    }
    const planKey = planKeyOf(plan, plan.meta.duration)
    /* 同档改分钟数：plan 是新对象、内容一个字没变——一页都不许抽走 */
    if (lastPlanKeyRef.current === planKey) return
    lastPlanKeyRef.current = planKey
    genRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    pendingRef.current = null
    fallbackRef.current = ''
    illustNoteRef.current = ''
    cacheRef.current = null
    schemeAbortRef.current?.abort()
    schemeAbortRef.current = null
    schemeCacheRef.current = null
    setScheme(null)
    // 学生纸与它同寿命：旧的那把闸先放行，免得上一份的 ensure 等在一张没人再发的纸上
    studentAbortRef.current?.abort()
    studentAbortRef.current = null
    studentCacheRef.current = null
    setStudentScheme(null)
    readyRef.current.resolve()
    readyRef.current = makeReady()
    setDeck(EMPTY_DECK)
    /* 刷新接回来：同一课、有学生版，就把它放回屏幕（插画已在存档里剥掉，顺手补回内置图） */
    const saved = resumeRef.current
    resumeRef.current = null
    if (saved && saved.planKey === planKey && saved.slides.length > 0) {
      const hydrated = attachBuiltinArt(saved.slides, plan.meta.topic)
      cacheRef.current = {
        plan,
        density: densityFingerprint(cfg?.density),
        fingerprint: saved.fingerprint,
        slides: hydrated,
        degraded: saved.degraded,
      }
      setDeck({
        status: 'ready',
        slides: hydrated,
        progress: '',
        run: null,
        interrupted: false,
        fallback: '',
        error: '',
        illustNote: '',
        degraded: saved.degraded,
        fingerprint: saved.fingerprint,
      })
      return
    }
    /* 免 API Key 示范课秒开（纯静态 Qoder Sites 也能 0 秒完整体验）：
       命中内置示范课且未配置自定义 Key 时，直接装载含 16:9 预置插画的学生版 PPT */
    if (!String(cfg?.apiKey ?? '').trim() && findExample(plan.meta.topic)) {
      const instant = attachBuiltinArt(getBuiltinStudentSlides(plan, limits), plan.meta.topic)
      const fp = deckFingerprint(deckOfRef.current() ?? [])
      cacheRef.current = {
        plan,
        density: densityFingerprint(cfg?.density),
        fingerprint: fp,
        slides: instant,
        degraded: false,
      }
      setDeck({
        status: 'ready',
        slides: instant,
        progress: '',
        run: null,
        interrupted: false,
        fallback: '',
        error: '',
        illustNote: '',
        degraded: false,
        fingerprint: fp,
      })
    }
  }, [plan])

  /*
   * 后台让模型读课文配一次纸面（只有这一个入口会发这一遍）。
   * 三个条件写在这里：① 不阻塞、不报错、不降级——catch 里什么都不做，纸面已经上色；
   * ② 不新增任何可见加载态（没 progress、没 notice）；③ 同一个 plan 只发一次。
   * 没填 key 也照发（块 A）：落点由 endpointOf 裁决，失败才落回本课的内置纸。
   */
  const schemeKeyRef = useRef('')
  useEffect(() => {
    if (!plan) return
    const planKey = planKeyOf(plan, plan.meta.duration)
    /* 同档改分钟数：纸不用重配（否则每改一次分钟数都发两遍模型请求） */
    if (schemeKeyRef.current === planKey) return
    schemeKeyRef.current = planKey
    const cached = schemeCacheRef.current
    if (cached && sameLesson(cached.plan, plan)) {
      // 上次那遍失败过（report=null）：照样把兜底那张纸设上——
      // 第二遍学生版靠 scheme 判定「第一遍什么时候结束」，不设就会一直等下去
      setScheme({
        plan,
        report:
          cached.report ?? { theme: DEFAULT_THEME, source: 'builtin', problems: [], attempts: 0 },
      })
      return
    }
    // 交给模型的只有页序（第几页、什么页型、标题）——配版式靠这个，不靠标题摘要；
    // 同一条页序也给内置方案（它只读标题认意象、按页型排版式），模型全挂时用它上色。
    const pages = buildDeck(plan, allocate(plan.segments, plan.meta.duration)).map((p, i) => ({
      index: i + 1,
      kind: String(p.kind),
      title: p.title,
    }))
    const offline = builtinScheme(plan, pages).theme

    // 纯静态示范课免 Key 秒开：直接使用本课内置纸面，不发无意义的 /api/ds 请求（避免静态托管 404/501 报错）
    if (!String(cfg?.apiKey ?? '').trim() && findExample(plan.meta.topic)) {
      const localReport: SchemeReport = { theme: offline, source: 'builtin', problems: [], attempts: 0 }
      schemeCacheRef.current = { plan, report: localReport }
      setScheme({ plan, report: localReport })
      return
    }

    const controller = new AbortController()
    schemeAbortRef.current = controller
    const timer = window.setTimeout(() => controller.abort(), THEME_SCHEME_TIMEOUT_MS)
    resolveScheme({ plan, pages, cfg, signal: controller.signal })
      .then((next) => {
        if (planRef.current !== plan) return
        schemeCacheRef.current = { plan, report: next }
        setScheme({ plan, report: next })
      })
      .catch(() => {
        if (planRef.current !== plan) return
        schemeCacheRef.current = { plan, report: null }
        setScheme({
          plan,
          report: { theme: offline, source: 'builtin', problems: [], attempts: 0 },
        })
      })
      .finally(() => {
        window.clearTimeout(timer)
        if (schemeAbortRef.current === controller) schemeAbortRef.current = null
      })
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const studentSchemeKeyRef = useRef('')
  useEffect(() => {
    if (!plan) return
    const planKey = planKeyOf(plan, plan.meta.duration)
    if (studentSchemeKeyRef.current === planKey) return
    studentSchemeKeyRef.current = planKey
    const cached = studentCacheRef.current
    if (cached && sameLesson(cached.plan, plan)) {
      setStudentScheme({ plan, report: cached.report })
      readyRef.current.resolve()
      return
    }

    const pages = buildDeck(plan, allocate(plan.segments, plan.meta.duration)).map((p, i) => ({
      index: i + 1,
      kind: String(p.kind),
      title: p.title,
    }))
    const live = schemeRef.current
    const basis = live && sameLesson(live.plan, plan) ? live.report.theme : builtinScheme(plan, pages).theme

    // 纯静态示范课免 Key 秒开：直接派生学生纸，0 网络请求、0 控制台错误
    if (!String(cfg?.apiKey ?? '').trim() && findExample(plan.meta.topic)) {
      const report: StudentSchemeReport = {
        theme: deriveStudentTheme(basis, plan.meta.topic),
        source: 'derived',
        reason: '内置示范课预置学生纸',
      }
      studentCacheRef.current = { plan, lesson: basis, report }
      setStudentScheme({ plan, report })
      readyRef.current.resolve()
      return
    }

    const controller = new AbortController()
    studentAbortRef.current = controller
    const timer = window.setTimeout(() => controller.abort(), STUDENT_SCHEME_TIMEOUT_MS)
    resolveStudentScheme({ plan, pages, lessonTheme: basis, cfg, signal: controller.signal })
      .then((next) => {
        if (planRef.current !== plan) return
        // 回来时若课件纸已定：按真实课件纸复核（与学生纸请求并行不矛盾，规则仍是那张纸）
        const now = schemeRef.current
        const real = now && sameLesson(now.plan, plan) ? now.report.theme : null
        const report =
          real && studentSchemeProblems(next.theme, real).length === 0
            ? next
            : real
              ? {
                  theme: deriveStudentTheme(real, plan.meta.topic),
                  source: 'derived' as const,
                  reason: '学生纸与课件纸太近，换成按课件纸派生的那一套。',
                }
              : next
        studentCacheRef.current = { plan, lesson: real ?? basis, report }
        setStudentScheme({ plan, report })
      })
      .catch(() => {
        // 无声：派生纸第一帧就在屏幕上，这里连缓存都不写（下次进来再试一遍）
      })
      .finally(() => {
        window.clearTimeout(timer)
        if (studentAbortRef.current === controller) studentAbortRef.current = null
        readyRef.current.resolve()
      })
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      readyRef.current.resolve()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  /**
   * 复核：课件纸比学生纸晚到，两张太近就把学生纸换成派生的那一套。
   * 只补一次判定，不重新发请求，也不改 TASKS/12 的题库/判据。
   */
  useEffect(() => {
    if (!plan || !scheme || !sameLesson(scheme.plan, plan)) return
    if (!studentScheme || !sameLesson(studentScheme.plan, plan)) return
    const bad = studentSchemeProblems(studentScheme.report.theme, scheme.report.theme)
    if (bad.length === 0) return
    const report = {
      theme: deriveStudentTheme(scheme.report.theme, plan.meta.topic),
      source: 'derived' as const,
      reason: '学生纸与课件纸太近，换成按课件纸派生的那一套。',
    }
    studentCacheRef.current = { plan, lesson: scheme.report.theme, report }
    setStudentScheme({ plan, report })
  }, [plan, scheme, studentScheme])

  const ensure = useCallback(
    async (force = false): Promise<StudentSlide[]> => {
      if (!plan) return []
      // 档位进缓存钥匙：手锁一档后 limitsOf(density) 变了，
      // 旧那叠不同档位的缓存必须算 miss，否则 ensure 命中旧页、改档静默不生效（任务 #4）。
      // 指纹走 densityFingerprint：与 limitsOf 同一分辨力（垃圾值归 'auto'），
      // 保证「未锁」与三档锁彼此钥匙互不相同，切档一定重算而不是复用旧页。
      // 课件指纹（TASKS/17 §二.5）：老师改一个字也换钥匙，旧叠不许再被命中。
      // 钥匙里不再有 key：前端 key 不决定走不走模型（TASKS/15 块 A）。
      const density = densityFingerprint(cfg?.density)
      // 点下去那一刻的课件快照：这一叠页面就是拿它做的，指纹也跟着它走
      const deckPages = deckOfRef.current() ?? []
      const key = deckKeyOf(plan, density, deckPages)
      const cached = cacheRef.current
      if (!force && cached && sameDeckKey(cached, key)) return cached.slides
      const pending = pendingRef.current
      if (!force && pending && sameDeckKey(pending, key)) return pending.promise

      // 不在拼页前等纸（s4 提速）：文字那遍与配纸并行发出去，屏幕先有字；
      // 纸只决定插画边带，等纸的动作挪到 withDirector 之前（TASKS/12 硬规矩 8 不变）。
      // 等待期间同一份可能已经拼完 / 拼起来：直接给它，不重复拼一遍
      const done = cacheRef.current
      if (!force && done && sameDeckKey(done, key)) return done.slides
      const running = pendingRef.current
      if (!force && running && sameDeckKey(running, key)) return running.promise

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const gen = ++genRef.current
      const live = (fn: () => void) => {
        if (gen === genRef.current) fn()
      }
      fallbackRef.current = ''
      illustNoteRef.current = ''
      setDeck((d) => ({
        ...d,
        status: 'working',
        progress: '正在重写学生版…',
        run: { stage: 'llm', at: Date.now(), page: 0, total: 0, illust: cfg?.illust === 'on' },
        interrupted: false,
        fallback: '',
        error: '',
        illustNote: '',
        degraded: false,
      }))

      const promise = buildStudentSlides(plan, cfg, {
        signal: controller.signal,
        // 同一段里插图一张一张报，起始时刻不能跟着翻页重置，否则倒计时会反复跳回去
        onProgress: (p) =>
          live(() =>
            setDeck((d) => ({
              ...d,
              progress: slideProgressText(p),
              run: {
                stage: p.stage,
                at: d.run && d.run.stage === p.stage ? d.run.at : Date.now(),
                page: p.page ?? 0,
                total: p.total ?? 0,
                // 配插画开着就把插图那 5 分钟从第一秒起算进总预算（2026-11-23）
                illust: cfg?.illust === 'on',
              },
            }))
          ),
        // 首屏两段交付：页面一拿到就上屏（无图），插图与排版到了再整叠换掉
        onDraft: (draft) => live(() => setDeck((d) => ({ ...d, slides: draft }))),
        onFallback: (reason) =>
          live(() => {
            fallbackRef.current = reason
            setDeck((d) => ({ ...d, fallback: reason }))
          }),
        onIllustrated: (note) => {
          illustNoteRef.current = note
        },
        // 插画边带归纸：取这一页当下那张纸（封面纸 / 主纸）
        paper: (kind) => paperOf(themeRef.current, kind),
        // 只在插画前等纸：文字已经先出屏了，这一等不再是「看着空白等配纸」
        awaitPaper: () => readyRef.current.promise,
        // 第 4 个参数 = 老师改定的这一叠课件：prompt 以它为准，兜底页也从它推
      }, deckPages)
        .then((slides) => {
          // 被新教案取代的那一遍：对调用方交出空数组——不缓存、不下发，
          // 旧的 handlePptx 拿到 0 页直接 return，幽灵下载不再发生（任务 #2）。
          if (gen !== genRef.current) return []
          // 取消（buildStudentSlides 交出空）：不缓存、不切 ready，由取代它的那遍收口。
          if (slides.length === 0) return []
          // 降级（有 Key 但模型那遍不合格）不进「命中即返回」的成功缓存：单独标 degraded，
          // plain ensure 仍可给出这叠内置页下载，但重试走 force 才会重新打模型（任务 #3）。
          const degraded = Boolean(fallbackRef.current)
          cacheRef.current = { ...key, slides, degraded }
          live(
            () =>
              setDeck({
                status: 'ready',
                slides,
                progress: '',
                run: null,
                interrupted: false,
                fallback: fallbackRef.current,
                error: '',
                illustNote: illustNoteRef.current,
                degraded,
                fingerprint: key.fingerprint,
              })
          )
          return slides
        })
        .catch((e) => {
          live(
            () =>
              setDeck((d) => ({
                ...d,
                status: 'failed',
                progress: '',
                run: null,
                interrupted: false,
                error: humanError(e),
                degraded: false,
              }))
          )
          return []
        })
        .finally(() => {
          if (pendingRef.current?.promise === promise) pendingRef.current = null
        })

      pendingRef.current = { ...key, promise }
      return promise
    },
    [plan, cfg]
  )

  /**
   * 停止：把这一遍连根拔掉（abort + 换代号 + 清 pending），再把状态收回到可再生成。
   * 已上屏的页留着——`status` 回到 ready，但 `fingerprint` 仍是旧的，界面靠
   * interrupted 把按钮写成「继续生成」；一页都没有就退回 idle。
   * 故意不动 slides：老师可能只是想先看看已经生成到哪了。
   */
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    genRef.current += 1
    pendingRef.current = null
    setDeck((d) => ({
      ...d,
      status: d.slides.length > 0 ? 'ready' : 'idle',
      progress: '',
      run: null,
      interrupted: d.slides.length > 0,
      error: '',
      fallback: '',
      degraded: false,
    }))
  }, [])

  return {
    ...deckState,
    theme,
    studentTheme,
    limits,
    themeReport: { source: report.source, reason: report.reason, problems: report.problems },
    ensure,
    cancel,
  }
}

export interface PptxExportState {
  busy: boolean
  done: boolean
  page: number
  total: number
  error: string
  /** PptxSlidesInvalidError 的逐条问题，必须显示给人看 */
  problems: string[]
}

const IDLE_EXPORT: PptxExportState = {
  busy: false,
  done: false,
  page: 0,
  total: 0,
  error: '',
  problems: [],
}

export interface PptxExport extends PptxExportState {
  /** true = 文件已经下载走；false = 失败原因已经写进 error / problems。
   *  animated=false 导纯静态版（一张图都不插）；没有场景时传 true 与 false 结果一样。
   *  limits = 这一叠生成时用的上限（学生版传 student.limits）；不给跑三档并集。
   *  template = 老师选的那套模板（TASKS/20）：给了就走 place() + renderPlaced 那条路，
   *  不给仍走原来的按页型现排——老调用点与离线门禁一行都不必改。 */
  run: (
    slides: StudentSlide[],
    fileName: string,
    theme?: DeckTheme,
    animated?: boolean,
    limits?: DensityLimits,
    template?: TemplateTheme
  ) => Promise<boolean>
  reset: () => void
}

/** 「生成课堂 PPT ↓」那颗按钮的三个态：进度 / 成功 / 失败带重试。两处下载共用一套 */
export function usePptxExport(): PptxExport {
  const [state, setState] = useState<PptxExportState>(IDLE_EXPORT)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )

  const run = useCallback(async (
    slides: StudentSlide[],
    fileName: string,
    theme?: DeckTheme,
    animated = true,
    limits?: DensityLimits,
    template?: TemplateTheme
  ) => {
    const total = countPptxPages(slides)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setState({ ...IDLE_EXPORT, busy: true, total, page: total ? 1 : 0 })
    try {
      // theme 不给就是墨与朱：离线脚本与旧调用点一行都不必改。
      // animated=false 一个媒体文件都不插（不能播动图、要打印的场合用）。
      // limits 跟着这一叠走：lesson 的 22–28 页不能被 clip 的 10–14 误拒。
      // template 给了就走模板那条路（place → renderPlaced），预览层读的是同一份 Placed。
      if (template) {
        await downloadTemplatedPptx(slides, template, (page) => setState((d) => ({ ...d, page })), fileName, {
          animated,
          limits,
        })
      } else {
        await downloadPptx(slides, (page) => setState((d) => ({ ...d, page })), fileName, theme, { animated, limits })
      }
      setState({ ...IDLE_EXPORT, done: true, total })
      timerRef.current = window.setTimeout(() => setState(IDLE_EXPORT), 2600)
      return true
    } catch (e) {
      // 不降级、不改投教案：把原因摊开，让界面上的「重试」再走一遍
      if (e instanceof PptxSlidesInvalidError) {
        setState({ ...IDLE_EXPORT, total, error: '学生版页面不合格，没有出片。', problems: e.problems })
      } else {
        const raw = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
        const networkish = /import|fetch|network|Failed to load/i.test(raw)
        setState({
          ...IDLE_EXPORT,
          total,
          error: networkish
            ? '课件引擎没加载成功（可能是网络断了），点重试再来一次。'
            : raw || '课堂 PPT 没能生成，请重试。',
        })
      }
      return false
    }
  }, [])

  const reset = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setState(IDLE_EXPORT)
  }, [])

  return { ...state, run, reset }
}
