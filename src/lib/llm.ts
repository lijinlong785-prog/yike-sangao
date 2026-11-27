import type { LessonInput, LessonPlan, Pause, PauseType, PrepItem, Segment, TeachingPrep } from '../types'
import { groundText } from '../data/texts'
import type { DensityLock } from './density'
import { ILLUST_MODEL } from './illustrate'
import { endpointOf, normalizeBase, upstreamModel } from './endpoint'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt'

export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  /**
   * 课堂密度锁档（TASKS/08 §B）：'auto' 由模型按判据自定；lean / standard / rich 手动锁死。
   * optional：旧配置与离线校验的 cfg 字面量都不带它，缺省即 'auto'（buildStudentSlides 里 limitsOf 处理）。
   */
  density?: DensityLock
  /**
   * 生图专用 key（TASKS/11 §五⑥ + TASKS/13）：留空 = 跟文本一样走同源代理；
   * 填了 = 用自己的额度直连（只给「自带 key」的老师用）。
   */
  imageKey?: string
  /** 生图模型：留空走 Tongyi-MAI/Z-Image-Turbo（FLUX.1-schnell 已下线） */
  imageModel?: string
  /**
   * 配插画（TASKS/11）：默认 **关**。
   * 一张图要等十几秒、一份最多 6 张，评委现场点「生成」时多等这一分钟换不来分数；
   * 要展示这一块时，在设置页打开「配插画」即可，不打开就只出纯文字版（同样只读、能导出）。
   */
  illust?: 'on' | 'off'
}

/* 前端不再持有任何密钥，见 TASKS/13：没填 key 就走同源 /api/sf，key 在服务端注入。 */

/**
 * 默认走 DeepSeek 官方：一把 key 能写教案、写 SVG，也认图；位图生图另外走硅基流动。
 * 模型名仍是硅基那套 id（V3.2 / V4.1-Flash），过同源代理时由 endpoint.upstreamModel 换成本家认的。
 */
export const DEFAULT_CONFIG: LLMConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-ai/DeepSeek-V4.1-Flash',
  imageModel: ILLUST_MODEL,
}

/** 旧的默认（DeepSeek 官方）。只用来认「从没改过接口的人」，认出来就迁到新默认。 */
const LEGACY_DEFAULT = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }

const STORAGE_KEY = 'yike-sangao:llm'
/**
 * 文本两级链（TASKS/15 §3.1 / 26）：同一把 key、同一个 baseUrl 内换模型，上层完全不知道。
 * 实测（2026-11-21，DeepSeek 官方）：deepseek-flash（= V4.1-Flash）200 / 0.9s 起，
 * JSON 模式写中文教案骨架 2.7s；重活退 deepseek-v4-pro。
 * 模型名过代理时由 endpoint.upstreamModel 换成本家认的 id，换完再去重。
 */
const TEXT_CHAIN = ['deepseek-ai/DeepSeek-V4.1-Flash', 'deepseek-v4-pro']
/** 每一级单独超时：超过这个时间拿不到就换下一级。
 * 2026-11-21 真机实测从 35 秒提到 50 秒：《草原》40 分钟的整份教案在硅基流动上
 * 一次要跑 34–45 秒，35 秒那档刚到点就被砍，砍完再重跑一遍，总耗时反而变成 68.9 秒。
 * 宁可一级多等 15 秒，也不把一次能成的活白白重做。 */
const CHAIN_STEP_MS = 50_000
/** 整条链的总预算：超了就按失败处理，交给离线稿兜底。
 * 取值跟 TASKS/22 §3 的口径对齐（总预算 150 秒）；因为超时已改成「多久没吐字」，
 * 这个数只管「跑完两级就没时间再试」，不再误杀正在吐字的长活。 */
const CHAIN_BUDGET_MS = 150_000
const FALLBACK_RATIOS = [0.125, 0.2, 0.4, 0.175, 0.1]
const PAUSE_TYPES: PauseType[] = ['确认理解', '引发思考', '过渡']
const PAUSE_MAX_QUESTION = 20

/** 停顿点由模型出，但条数、字数、类型必须守住，否则讲台上会碎成一地 */
function normalizePauses(raw: unknown): Pause[] {
  if (!Array.isArray(raw)) return []
  const out: Pause[] = []
  for (const item of raw) {
    if (out.length >= 2) break
    const p = (item ?? {}) as Record<string, unknown>
    const question = typeof p.question === 'string' ? p.question.trim() : ''
    if (!question) continue
    const seconds = Math.round(Number(p.seconds))
    const type = PAUSE_TYPES.includes(p.type as PauseType) ? (p.type as PauseType) : '确认理解'
    out.push({
      afterText: typeof p.afterText === 'string' ? p.afterText.trim() : '',
      seconds: Number.isFinite(seconds) ? Math.min(10, Math.max(3, seconds)) : 5,
      question:
        [...question].length > PAUSE_MAX_QUESTION
          ? `${[...question].slice(0, PAUSE_MAX_QUESTION - 1).join('')}？`
          : question,
      type,
    })
  }
  return out
}

export function loadConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    /* 配插画默认开（2026-11-24 用户拍板）：评委 / 无痕窗口打开就该看到插画，
       不能指望每个人先去设置里拨开关。额度在服务端（券抵），默认开不花老师的钱；
       老师显式存过 'off' 的，下面 ...saved 会盖回去，尊重他的选择。
       DEFAULT_CONFIG 本身不动——离线门禁的「无字段=关」口径照旧。 */
    // 本机没存过配置：key 恒为空 = 走同源代理，老师不用碰任何 key
    if (!raw) return { ...DEFAULT_CONFIG, illust: 'on' }
    const saved = JSON.parse(raw) as Partial<LLMConfig>
    /*
     * 迁移：只有「两格都还是旧默认」的人才动产——那说明他从没改过接口，
     * 手里多半就是一把硅基的 key，却打在 DeepSeek 官方地址上，于是 401 / 402。
     * 自己改过任何一格（换过模型名或地址）的，一个字都不碰。
     */
    const untouched =
      saved.baseUrl === LEGACY_DEFAULT.baseUrl && saved.model === LEGACY_DEFAULT.model
    const base = untouched ? DEFAULT_CONFIG.baseUrl : saved.baseUrl
    const model = untouched ? DEFAULT_CONFIG.model : saved.model
    /*
     * Key：只有老师自己填了才带上（自带额度直连）；空 = 走同源代理。
     * 不再有任何构建期密钥兜底——前端产物里不许出现 sk-。
     */
    const textKey = String(saved.apiKey ?? '').trim()
    const imageKey = String(saved.imageKey ?? '').trim()
    return {
      ...DEFAULT_CONFIG,
      illust: 'on',
      ...saved,
      apiKey: textKey,
      imageKey: imageKey || undefined,
      ...(base ? { baseUrl: normalizeBase(base) } : {}),
      ...(model ? { model } : {}),
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg: LLMConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

function describeError(status: number, detail: string): string {
  // 代理回的中文句子直接给人看：界面上不许出现英文 JSON、request_id、Insufficient Balance
  const zh = chineseMessage(detail)
  if (zh) return zh
  // 502 / 504 是服务端转发上游失败的统一出口，不许把状态码摔给使用者
  if (status === 502 || status === 504) return '模型这会儿没回话，先用内置稿看流程，稍后再点一次。'
  if (status === 503) return '服务器还没配好，联系部署的人。'
  if (status === 401 || status === 403) return '接口不认这把 key；清空设置页里的 key 就走服务端。'
  if (status === 404) return '接口地址或模型名称不存在，请检查 Base URL 和模型名。'
  if (status === 402) return '额度用完了，先用内置稿看完流程。'
  if (status === 429) return '请求太频繁，歇一会儿再试。'
  return `模型没有回话（${status}），先用内置稿看流程，稍后再点一次。`
}

/** 从响应体里抽一句中文（代理回的都是中文）；没有就返回空串 */
function chineseMessage(text: string): string {
  const raw = String(text ?? '').trim()
  if (!raw) return ''
  try {
    const msg = JSON.parse(raw)?.error?.message
    if (typeof msg === 'string' && /[\u4e00-\u9fa5]/.test(msg)) return msg.trim()
  } catch {
    // 不是 JSON：下面按纯文本判
  }
  if (/[\u4e00-\u9fa5]/.test(raw) && raw.length <= 80) return raw
  return ''
}

/** 带状态码的错误：链上只须要认 401/403/402（换了也一样，直接抛） */
class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 三级都挂了：上层（App / student）据此落离线稿（骨架或内置课） */
export class FallbackExhausted extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FallbackExhausted'
  }
}

/** 这一级该用哪个模型：第一级是配置里那个，后面只从 TEXT_CHAIN 里补（去重）。
 * 走同源代理时先换成本家能认的 id（DeepSeek 方只有 flash / v4-pro），再逐级去重——
 * 否则 V3.2 与 V4.1 会映射成同一个模型，白跑一遍超时。
 * 老师自带 key 直连时只有他自己那一把接口认的模型名：不许把本家代理的两个 id 追进来——
 * 硅基流动收到 deepseek-ai/DeepSeek-V4.1-Flash 只会 400，白烧一轮超时，
 * 最后界面报「网络断了」，人还以为 key 填错了。
 * 导出给门禁用：链长随模型池变，断言读这条链，不许再写死「3 级」。 */
export function textChain(cfg: LLMConfig): string[] {
  const head = String(cfg.model ?? '').trim() || TEXT_CHAIN[0]
  if (String(cfg.apiKey ?? '').trim()) return [head]
  const raw = [head, ...TEXT_CHAIN.filter((m) => m !== head)]
  return [...new Set(raw.map(upstreamModel))]
}

/** 每一级换模型前在控制台留一行；界面一个字都不显示 */
function warnSwitch(from: string, to: string, why: string) {
  const short = (m: string) => m.split('/').pop()?.toLowerCase() ?? m
  console.warn(`[fallback] 文本 ${short(from)}→${short(to)} 因为 ${why}`)
}

function whyOf(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
  if (/超时|timeout|abort/i.test(msg)) return 'timeout'
  if (/JSON|json/i.test(msg)) return 'bad json'
  if (e instanceof ApiError) return `http ${e.status}`
  return 'network'
}

/**
 * 给界面看的原因：只许是人话，不许带状态码与英文。
 * whyOf() 那一份是给 console.warn 定位用的，两者分工不同，别混用。
 */
function reasonOf(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
  if (/超时|timeout|abort/i.test(msg)) return '等太久了'
  if (/JSON|json/i.test(msg)) return '回的话没看懂'
  if (e instanceof ApiError) return '服务那边出了点状况'
  return '网络断了'
}

/**
 * 真正发请求的那一层：只认 messages，不认业务，备课包和学生版课件共用它。
 * temperature 缺省 0.7（原有行为一个字节都没改）；只有「挑纸样」那种只要一个
 * 稳定标签的轻调用会显式传 0，免得同一篇课文两次生成换成两张纸。
 *
 * 2026-11-21 真机实测后改成**流式读**（第二十二轮）：40 分钟的整份教案是非流式下一口气
 * 写三五千 token 的活，两种接口都会在等第一个字节的时候把连接掐掉——
 * 裸 fetch 实测直接 `UND_ERR_SOCKET: other side closed`（bytesRead 0），
 * 站在应用层只能看到「网络断了」，人还以为是 key 填错了。
 * 改成 stream:true 后上游每吐一段就写一段，网关不会把它当死连接；
 * 超时的口径也跟着变：不再是「总时长 50 秒」，而是「连续 N 秒没吐字」——
 * 长活就不再被总时长误杀，真卡死时仍然按时报超时。
 */
async function requestChat(
  cfg: LLMConfig,
  messages: { role: string; content: string }[],
  withJsonMode: boolean,
  signal?: AbortSignal,
  temperature = 0.7,
  timeoutMs = CHAIN_STEP_MS
): Promise<{ ok: boolean; status: number; content: string; detail: string }> {
  // 落点与头只在这里取一次：走代理时不带 Authorization，走自己的才带
  const ep = endpointOf('/chat/completions', cfg)
  const controller = new AbortController()
  /** 空闲计时器：每收到一段就重新计，收到响应头之前也算一段 */
  let timer: number | undefined
  const bump = () => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => controller.abort(), timeoutMs)
  }
  bump()
  const relay = () => controller.abort()
  signal?.addEventListener('abort', relay)
  const timeoutText = `请求超时（${Math.round(timeoutMs / 1000)} 秒没回话）。`

  const fail = (e: unknown): never => {
    // 外部取消（换教案 / 关页面）不是超时：原样上报，链上不许拿它去换模型
    if (signal?.aborted) throw e
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error(timeoutText)
    // 界面只看到那句人话；原始原因挂到 cause 上，只给离线门禁定位用
    const wrapped = new Error(
      '连不上模型接口：要么这台机器上没跑 server.mjs（纯静态托管时 /api/sf 没人接），要么接口地址写错了。'
    )
    ;(wrapped as Error & { cause?: unknown }).cause = e
    throw wrapped
  }

  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      temperature,
      stream: true,
    }
    if (withJsonMode) body.response_format = { type: 'json_object' }

    const res = await fetch(ep.url, {
      method: 'POST',
      signal: controller.signal,
      headers: ep.headers,
      body: JSON.stringify(body),
    })
    bump()

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, status: res.status, content: '', detail }
    }

    const ctype = res.headers?.get?.('content-type') ?? ''
    /* 不认流式的兼容接口（或者离线门禁里的假响应）：整段 JSON 直接读，走老路 */
    if (!res.body || ctype.includes('json') || (!ctype && !res.headers?.get)) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return { ok: true, status: res.status, content: String(data?.choices?.[0]?.message?.content ?? ''), detail: '' }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bump()
      buf += decoder.decode(value, { stream: true })
      /* SSE：一行一个 data: {...}，delta.content 是这一段吐出来的字。
         有空行与注释行（: keep-alive），不认就跳过。 */
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const one = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; message?: { content?: string } }[]
          }
          const ch = one?.choices?.[0]
          out += String(ch?.delta?.content ?? ch?.message?.content ?? '')
        } catch {
          // 半截 JSON：下一段接着拼，不当错误
        }
      }
    }
    out += decoder.decode()
    return { ok: true, status: res.status, content: out, detail: '' }
  } catch (e) {
    return fail(e)
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
    signal?.removeEventListener('abort', relay)
  }
}

/**
 * 一次请求换一段解析好的 JSON：400 降级（部分兼容接口不认 response_format）→
 * 非 2xx 抛 ApiError → 取 content → 解析 JSON。
 * 这一层只管「一次」，换模型的事在 withTextChain 里。
 */
async function requestJsonOnce(
  cfg: LLMConfig,
  messages: { role: string; content: string }[],
  signal: AbortSignal | undefined,
  temperature: number,
  timeoutMs: number
): Promise<unknown> {
  let one = await requestChat(cfg, messages, true, signal, temperature, timeoutMs)

  // 部分兼容接口不支持 response_format，收到 400 时去掉再试一次
  if (!one.ok && one.status === 400 && /response_format|json_object|not.?support/i.test(one.detail)) {
    one = await requestChat(cfg, messages, false, signal, temperature, timeoutMs)
  }

  if (!one.ok) throw new ApiError(one.status, describeError(one.status, one.detail))
  if (!one.content) throw new Error('模型没有返回内容。')
  const content = one.content

  try {
    return JSON.parse(extractJson(content))
  } catch {
    throw new Error('模型返回的内容不是合法 JSON。')
  }
}

/**
 * 文本链（TASKS/15 §3.1）：V4.1-Flash → v4-pro，换模型不换接口。
 *   · 401 / 403 / 402 不换（换了也一样）→ 直接抛；
 *   · 外部取消不换 → 直接抛；
 *   · 超时 / 5xx / JSON 不合法 → 记一行 console.warn 后换下一级；
 *   · 总预算 150 秒，每级「连续 50 秒没吐字」算超时。
 */
async function withTextChain<T>(
  cfg: LLMConfig,
  signal: AbortSignal | undefined,
  run: (cfg: LLMConfig, timeoutMs: number) => Promise<T>
): Promise<T> {
  const models = textChain(cfg)
  const started = Date.now()
  let last: unknown = null

  for (let i = 0; i < models.length; i++) {
    if (signal?.aborted) throw new Error('请求已取消。')
    const left = CHAIN_BUDGET_MS - (Date.now() - started)
    if (left < 3000) break
    try {
      return await run({ ...cfg, model: models[i] }, Math.min(CHAIN_STEP_MS, left))
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof ApiError && [401, 403, 402].includes(e.status)) throw e
      last = e
      if (i < models.length - 1) warnSwitch(models[i], models[i + 1], whyOf(e))
    }
  }

  const why = reasonOf(last)
  throw new FallbackExhausted(
    `模型这会儿没回话（${why}），先用内置稿顶上；点「重出」会再试一次。`
  )
}

/** 备课包专用的提示词：system + user 两句都出自 prompt.ts，这里不加新逻辑 */
function planMessages(input: LessonInput): { role: string; content: string }[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(input) },
  ]
}

/** 模型没给 prep 时，把 preparation 那句话拆成三组清单，至少不让教学准备页开天窗 */
function fallbackPrep(preparation: string, topic: string): TeachingPrep {
  const rep: TeachingPrep = { courseware: [], physical: [], media: [] }
  const names = preparation
    .split(/[、；;，,。]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 24)
    .slice(0, 6)
  for (const name of names) {
    if (/音频|视频|短片|朗读|录音|动画/.test(name)) {
      rep.media.push({ name, usage: '课堂播放', searchHint: `${topic} ${name}` })
    } else if (/卡片|实物|模型|教具|纸盒|小棒|贴纸/.test(name)) {
      rep.physical.push({ name, usage: '学生动手时使用' })
    } else {
      rep.courseware.push({ name, usage: '课堂展示与讲解', searchHint: `${topic} ${name} 高清` })
    }
  }
  return rep
}

function normalizePrep(raw: unknown, preparation: string, topic: string): TeachingPrep {
  const base = fallbackPrep(preparation, topic)
  const data = (raw ?? {}) as Record<string, unknown>
  const pick = (key: 'courseware' | 'physical' | 'media'): PrepItem[] => {
    const arr = data[key]
    if (!Array.isArray(arr)) return base[key]
    const items: PrepItem[] = arr
      .map((it) => (it ?? {}) as Record<string, unknown>)
      .filter((it) => typeof it.name === 'string' && String(it.name).trim())
      .slice(0, 4)
      .map((it) => ({
        name: String(it.name).trim(),
        usage: typeof it.usage === 'string' ? it.usage.trim() : '课堂使用',
        ...(typeof it.searchHint === 'string' && it.searchHint.trim()
          ? { searchHint: it.searchHint.trim() }
          : {}),
      }))
    return items.length > 0 ? items : base[key]
  }
  return { courseware: pick('courseware'), physical: pick('physical'), media: pick('media') }
}

/** 模型返回的字段可能缺、可能类型不对，这里统一兜底，避免页面白屏 */
function normalize(raw: unknown, input: LessonInput): LessonPlan {
  const data = (raw ?? {}) as Record<string, any>
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback

  const rawSegments: any[] = Array.isArray(data.segments) ? data.segments : []
  if (rawSegments.length === 0) throw new Error('返回结果里没有教学环节，请重试一次。')

  const ratioSum = rawSegments.reduce((sum, s) => sum + (Number(s?.ratio) || 0), 0)
  const segments: Segment[] = rawSegments.map((s, i) => {
    const ratio =
      ratioSum > 0
        ? (Number(s?.ratio) || 0) / ratioSum
        : FALLBACK_RATIOS[i] ?? 1 / rawSegments.length
    return {
      name: str(s?.name, `环节 ${i + 1}`),
      ratio,
      goal: str(s?.goal),
      teacher: str(s?.teacher),
      student: str(s?.student),
      script: str(s?.script),
      pauses: normalizePauses(s?.pauses),
    }
  })

  const speech = Array.isArray(data.speech)
    ? data.speech.map((s: any, i: number) => ({
        section: str(s?.section, `第 ${i + 1} 部分`),
        text: str(s?.text),
      }))
    : []

  const defense = Array.isArray(data.defense)
    ? data.defense.map((d: any) => ({
        question: str(d?.question),
        answer: str(d?.answer),
      }))
    : []

  const order = Array.isArray(data.blackboard?.order)
    ? data.blackboard.order.filter((o: unknown) => typeof o === 'string')
    : []

  return {
    meta: {
      topic: input.topic,
      subject: input.subject,
      stage: input.stage,
      grade: input.grade,
      period: input.period,
      textbook: input.textbook,
      duration: input.duration,
      /* 原文两路（2026-11-21 用户拍的 A 案）：老师贴了就用老师的；没贴就用模型按课题
         交的课本原句，但先过 groundText 过筛（去编号/出处/解释句、去重、量长度）。
         之后的原文页全部以这份为唯一比对源（slides.ts 的 dropUnverifiedQuotes）。 */
      text: groundText(input.text, data?.meta?.text),
    },
    objectives: {
      knowledge: str(data.objectives?.knowledge),
      process: str(data.objectives?.process),
      emotion: str(data.objectives?.emotion),
    },
    keyPoint: str(data.keyPoint),
    hardPoint: str(data.hardPoint),
    preparation: str(data.preparation),
    segments,
    homework: {
      must: str(data.homework?.must),
      optional: str(data.homework?.optional),
    },
    blackboard: {
      layout: str(data.blackboard?.layout, '（模型没有返回板书，请重试）'),
      order,
    },
    prep: normalizePrep(data.prep, str(data.preparation), input.topic),
    speech,
    defense,
  }
}

export async function generatePlan(
  input: LessonInput,
  cfg: LLMConfig,
  signal?: AbortSignal
): Promise<LessonPlan> {
  const messages = planMessages(input)
  // 三级链在请求层内部完成，这里拿到的一定是一段能用的 JSON（或者 FallbackExhausted）
  const parsed = await withTextChain(cfg, signal, (cfgAt, timeoutMs) =>
    requestJsonOnce(cfgAt, messages, signal, 0.7, timeoutMs)
  )
  return normalize(parsed, input)
}

/**
 * 通用「一次对话换一段 JSON」出口，给学生版课件、配纸、点名重做等场景复用。
 * 三级链在内部完成：调用方不须要知道换过模型，失败只看到 FallbackExhausted 或一句中文。
 */
export async function postChatJson(
  messages: { role: string; content: string }[],
  cfg: LLMConfig,
  signal?: AbortSignal,
  temperature?: number
): Promise<unknown> {
  return withTextChain(cfg, signal, (cfgAt, timeoutMs) =>
    requestJsonOnce(cfgAt, messages, signal, temperature ?? 0.7, timeoutMs)
  )
}
