/**
 * 出图：把导演给的英文 brief 拼上锁死的画风，交给生图模型。
 *
 * 分工（TASKS/12）：
 *   · 画什么 —— 由 DeepSeek 当导演定（director.ts），这里一个字都不猜；
 *   · 长什么样 —— 画风前缀在这一层锁死，同一份课件前后几页必须像同一个人画的。
 * 上一版在这里用正则挑页、拿中文原句生图、固定贴右，那套已经整块拆掉：
 * 挑页由导演定，留白由图上量出来的数字定，贴哪边由第二遍排版定。
 *
 * TASKS/11 三条硬约束照旧：
 *   1. 模型 Tongyi-MAI/Z-Image-Turbo，步数 8；FLUX.1-schnell 已下线（403 Model disabled），
 *      切回去等于整份没有图；
 *   2. 生图 key 只在服务端（TASKS/13）：没填就走同源 /api/sf，前端产物里一个 sk- 都没有；
 *   3. 一份最多 6 张（0.2 元/张，成本线 1.2 元不许超），出过图的进缓存，二次导出 0 调用。
 */
import { endpointOf, imageProxyOf } from './endpoint'
import { bytesToDataUrl, dataUrlToBytes, isPng, stripWatermark } from './watermark'
import type { CoverArch } from './deck2/place'
import { generateVectorArt } from './vector'

/**
 * 出图走哪条路（TASKS/26）：
 *   · 'auto'（默认）—— 免费位图 Kolors → 付费位图 Z-Image → DeepSeek 写 SVG（矢量）→ 内置线稿。
 *     为什么免费那张排第一：老师手里多半只有一把 DeepSeek 的 key，位图那两级打不通也不能挡住出图，
 *     最后还有矢量兜着；钱只在「免费那张真画崩了」时才花。
 *   · 'vector' —— 矢量优先（自己写 SVG 最稳、零汉字），不成再叫两级生图模型。门禁 D 用它。
 *   · 'photo' —— 只走位图（Z-Image → Kolors），旧口径与门禁 E 用它。
 *
 * 三级都按「一张一张试」走：任何一级成了就返回，不再往下花钱。
 */
export type IllustEngine = 'auto' | 'vector' | 'photo'

export interface IllustConfig {
  baseUrl: string
  apiKey: string
  model: string
  engine?: IllustEngine
}

/** 生图模型名：只写这一处。FLUX.1-schnell 已下线，不要再切回去。 */
export const ILLUST_MODEL = 'Tongyi-MAI/Z-Image-Turbo'

/**
 * 备生图模型（TASKS/15 §3.2）：主模型 0.1 秒断连（免费档 2 张/分钟限速）就立刻换它，
 * 不退避等待；实测免费可用。
 */
export const ILLUST_FALLBACK_MODEL = 'Kwai-Kolors/Kolors'

/**
 * 百炼那一级（TASKS/27）：qwen-image-3.0 走阿里云百炼，0.18 元/张，学生券能抵。
 * 它是「异步任务」（40~60 秒一张），前端不操心：服务端 /api/bl 把提交+轮询吃成一次请求。
 * 放第一枪的理由不是便宜，是**画得好看**——水彩质感、零汉字、16:9 正好。
 */
export const ILLUST_BAILIAN_MODEL = 'qwen-image-3.0'

/**
 * 免费那一级（auto 的第一枪）：Kolors 在硅基流动上是 0 元，
 * 限速 2 张/分钟、400 张/天——够一份稿的 6 张，撞限速就等一会儿问同一家，绝不自己去花那 1 毛。
 */
export const ILLUST_FREE_MODEL = ILLUST_FALLBACK_MODEL

/** 步数：Turbo 档 8 步就够，多走只是变慢（§三 实测参数） */
export const ILLUST_STEPS = 8

/** 一份上限 6 张（§九）：0.2 元/张 → 一份 1.2 元，这是成本线，不许超 */
export const ILLUST_MAX = 6

export const DEFAULT_ILLUST: IllustConfig = {
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  model: ILLUST_MODEL,
  engine: 'auto',
}

/** 锁死的画风前缀：绘本、水彩、淡彩、线条略抖、不用纯黑、四周留白。
 * 纸面描述不写死在这里（见 paperPhrase）：纸换了、图还是暖白底，贴上去就是一块白卡。 */
const STYLE =
  "children's picture book illustration, soft watercolor washes with light colored-pencil lines, " +
  'muted natural palette, hand-drawn outlines that are slightly wobbly, never pure black, ' +
  'generous empty space around the subject, gentle and quiet mood'

/** 色相 → 英文色名（生图模型只认英文，中文混进去会把画面带跑） */
const HUE_WORDS: [number, string][] = [
  [20, 'rust'],
  [45, 'sand'],
  [70, 'olive'],
  [110, 'moss'],
  [160, 'green'],
  [200, 'teal'],
  [240, 'blue'],
  [285, 'indigo'],
  [325, 'violet'],
  [350, 'plum'],
  [361, 'red'],
]

/**
 * 纸面描述：由这一页的纸色生成（TASKS/12 §六①）。
 * `#1f2a24` → `deep ink-green paper background`，`#faf8f3` → `soft cream paper background`。
 * 不传就保持旧的暖白纸——离线脚本与旧调用点一行都不必改。
 */
export function paperPhrase(hex?: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return 'warm textured paper background'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2 / 255
  const c = (mx - mn) / 255
  let word = l < 0.5 ? 'slate grey' : 'cream'
  if (c >= 0.035) {
    const d = mx - mn
    const raw = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    const h = (raw * 60 + 360) % 360
    word = HUE_WORDS.find(([edge]) => h < edge)?.[1] ?? 'red'
  }
  const tone = l >= 0.7 ? 'soft' : l >= 0.45 ? 'muted' : 'deep ink-'
  return `${tone.endsWith('-') ? `${tone}${word}` : `${tone} ${word}`} paper background`
}

/** 重投时的取景变化（千问档）：同一 brief 换构图，降低连续两张都带字的概率 */
const HARD_VARIANTS = [
  'wider landscape view, more open sky and mist',
  'closer viewpoint, softer shapes, larger plain background',
  'different angle, simpler composition, bigger empty area',
]

/** 正向排除（生图模型不吃 negative prompt 时只能写进正向句里） */
const NO_TEXT = 'no text, no letters, no numbers, no signature, no watermark, no border, no frame'

/** 判废重投时加重的排除句：同一 brief 再画一次，只把「不许有字」说到最狠 */
const NO_TEXT_HARD =
  'the picture must contain absolutely no writing anywhere, no words, no captions, no signage, ' +
  'no chinese characters, no alphabet letters, no numerals'

/**
 * 封面三种构图（TASKS/20b §2.1）：封面图铺满整页，所以提示词里必须先把
 * 「哪一整块一定空着」说死——否则模型会把主体摆在正中，标题就只能压在画上。
 * 这三句与 deck2/place.ts 的三种槽位一一对应。
 */
export const COVER_COMPOSITION: Record<CoverArch, string> = {
  left:
    'composition: subject on the RIGHT third, the LEFT third is empty soft paper, ' +
    'generous negative space, no text, no letters, no characters',
  bottom:
    'composition: subject in the UPPER half, the LOWER third is empty soft paper, ' +
    'generous negative space, no text, no letters, no characters',
  rightTop:
    'composition: subject in the LOWER LEFT, the UPPER RIGHT corner is empty soft paper, ' +
    'generous negative space, no text, no letters, no characters',
}

/**
 * 封面单独一套排除句：封面就是整页那幅画，不许再写「画在纸上」，
 * 更不许出现 banner / frame / title area 这类词——写了模型反而会去画一个边框。
 */
const COVER_NO_TEXT = 'no text, no letters, no numbers, no signature, no watermark'

const TIMEOUT_MS = 60_000

/**
 * 出一份课件要几张插画：20 分钟 4 张、30 分钟 5 张、40 分钟 6 张（§九）。
 * 4 分钟的片段档也按 4 张走：再少就撑不起一本书的感觉。
 * 这只是「上限 allow」——具体画哪几页由导演定，导演给不满就少画。
 */
export function illustCountFor(durationSeconds: number): number {
  const minutes = Number(durationSeconds) / 60
  if (!Number.isFinite(minutes) || minutes <= 20) return 4
  if (minutes <= 30) return 5
  return ILLUST_MAX
}

export interface IllustResult {
  ok: boolean
  /** data:image/png;base64,... 可直接塞进 pptx */
  dataUrl?: string
  prompt?: string
  error?: string
}

/**
 * 一条 brief + 一套画风 = 一条生图提示词。
 * brief 是导演写的英文（谁/在哪/做什么/主体占哪半边/哪边留空），这里只负责
 * 「画风统一」与「画面里不许有字」，不改写内容——改写就等于又在猜画什么。
 */
export function composePrompt(
  brief: string,
  opts: {
    grade?: string
    subjectName?: string
    look?: string
    hardNoText?: boolean
    /** 重投轮次：换一句取景变化，免得连续两张一个模子 */
    variant?: number
    paper?: string
    /** 封面构图（TASKS/20b）：有值就是封面页，走另一套底子与排除句 */
    cover?: CoverArch
  } = {}
): string {
  const bits: string[] = [STYLE]
  // 底纸跟着这一页真正的纸走：纸是深绿，图就画在深绿纸上，贴上去接缝才看不见。
  // 封面例外：它铺满整页、自己就是纸，不再要求「画在一张纸上」
  if (opts.cover) bits.push(COVER_COMPOSITION[opts.cover])
  else bits.push(paperPhrase(opts.paper))
  bits.push(String(brief ?? '').trim())
  // look 是这一课的视觉母题，只收英文：中文混进生图提示词会把画面带跑
  const look = String(opts.look ?? '').trim()
  if (look && !/[\u3400-\u9fff]/.test(look)) bits.push(`recurring motif of this lesson: ${look}`)
  const who = opts.grade && /[一二三四五六]/.test(opts.grade) ? 'primary school children' : ''
  if (who) bits.push(who)
  /* 科目名一律不进提示词（2026-11-24 线上实测两轮）：中文「语文」会被千问题进画面；
     翻成英文 'Chinese language arts' 照样诱发题字（glyph≈2487）。画什么 brief 已经说清，
     科目语境对画面毫无贡献，只会招字——整段去掉。 */
  bits.push(opts.cover ? COVER_NO_TEXT : NO_TEXT)
  if (opts.hardNoText) {
    bits.push(NO_TEXT_HARD)
    /* 重投换构图说法：同一 brief 重投时给千问不同的取景指令，
       免得两张图一个模子（线上实测重投 glyph 原地不动）。 */
    if (typeof opts.variant === 'number') bits.push(HARD_VARIANTS[opts.variant % HARD_VARIANTS.length])
  }
  return bits.filter(Boolean).join(', ')
}

/* -------------------------------- 出图 -------------------------------- */

/** 这一趟跑下来真正发出去的生图请求数（验收「二次导出 0 调用」用） */
let requestCount = 0

/** 本次进程内已发出的生图请求数 */
export function illustCalls(): number {
  return requestCount
}

/** 额度不足（402）与鉴权失败都要停下：再打只会继续烧钱 */
function isStopError(message: string): boolean {
  return /\b402\b|insufficient|余额|额度|quota|payment/i.test(message)
}

/** 限速（免费档 2 张/分钟）：**不**降级到付费那张，等一会儿问同一家 */
function isRateLimited(message: string): boolean {
  return /\b429\b|rate.?limit|too many requests/i.test(message)
}

/**
 * 这家 key 根本不干生图（老师只填了 DeepSeek）、或者服务端没配 key：
 * 换下一级也是白问，直接跳到矢量——省一趟来回，也省一笔不该花的钱。
 */
function isWrongProvider(message: string): boolean {
  return /\b401\b|\b403\b|\b404\b|\b503\b|not_allowed|server_not_configured|服务器还没配好|不认这把 key/i.test(
    message
  )
}

/** 可中断的等待：撞限速重试用，页面点了「停止」就立刻醒 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener?.('abort', done, { once: true })
  })
}

/** 真正出图：/images/generations，返回 dataUrl（已抹水印）。
 * 递给哪家由模型名决定（imageProxyOf）：qwen-image 走百炼，其余走硅基。 */
async function generateOne(
  prompt: string,
  cfg: IllustConfig,
  signal?: AbortSignal,
  paperHex?: string
): Promise<IllustResult> {
  /* 千问不吃「负向排除」（2026-11-23《七律·长征》两张真图对照）：
     不带排除句那张 glyph≈1464 过闸；加了「absolutely no writing」那张 glyph≈6366 判废——
     越嘱咐「不许写字」它越往画面里题字。百炼这一档把排除句全剥掉、换正向说法；
     判废重投改成「换一幅构图」而不是「加重不许有字」。硅基各家保留原句
     （check-cover 查的是 composePrompt 的产出，与这一层无关）。 */
  if (/^qwen-image/i.test(String(cfg.model ?? ''))) {
    const hard = prompt.includes(NO_TEXT_HARD)
    prompt = prompt
      .split(NO_TEXT_HARD)
      .join('')
      .split(NO_TEXT)
      .join('')
      .split(COVER_NO_TEXT)
      .join('')
      .replace(/no text, no letters, no characters/g, 'generous negative space')
      .replace(/\s*,\s*,/g, ',')
      .replace(/,\s*$/, '')
      .trim()
    prompt += hard
      ? ', fresh alternate composition, wider view, more open sky and mist'
      : ', pure scenery illustration, open sky and mist areas'
  }
  const ctrl = new AbortController()
  // 百炼是异步任务，排队+出图实测 40~60 秒，60 秒的闸会把它误判成超时
  const budget = /^qwen-image/i.test(String(cfg.model ?? '')) ? 180_000 : TIMEOUT_MS
  const timer = setTimeout(() => ctrl.abort(), budget)
  requestCount += 1
  try {
    // 落点由 endpointOf 裁决：没填 key 就走同源代理，服务端注入 Authorization
    const ep = endpointOf('/images/generations', cfg, imageProxyOf(cfg.model || ILLUST_MODEL))
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: ep.headers,
      body: JSON.stringify({
        // §三 实测通过的四个参数，别再随手加 guidance_scale
        model: cfg.model || ILLUST_MODEL,
        prompt,
        image_size: '1024x576',
        batch_size: 1,
        num_inference_steps: ILLUST_STEPS,
      }),
      signal: signal ?? ctrl.signal,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, prompt, error: `${res.status} ${t.slice(0, 160)}` }
    }
    let data = await res.json()
    /* 分段协议（2026-11-23）：边缘函数只提交 / 只轮询一次，回 {pending, task_id}；
       等待在这里每 3 秒问一次，直到出图或失败——线上函数单次执行撑不下 50~70 秒的
       整段等待，旧同步外观在边缘总是 45 秒超时，位图全落空只剩矢量。
       本地 server.mjs 仍直接回 {data}，走不进这个循环。 */
    if (data?.pending && data?.task_id) {
      const sig = signal ?? ctrl.signal
      const deadline = Date.now() + 170_000
      while (Date.now() < deadline && !sig.aborted) {
        await sleep(3000, sig)
        if (sig.aborted) break
        const r2 = await fetch(ep.url, {
          method: 'POST',
          headers: ep.headers,
          body: JSON.stringify({ task_id: data.task_id, model: cfg.model || ILLUST_MODEL, n: 1 }),
          signal: sig,
        }).catch(() => null)
        if (!r2) continue
        const d2 = await r2.json().catch(() => null)
        if (!d2) continue
        if (d2.pending) continue
        /* 轮询路上的瞬时 5xx / 网关抖动不算失败，下一轮再问（线上实测偶发 504）；
           4xx（欠费 / 限速 / 任务真失败）才收手，交给出图链的分级规矩处理。 */
        if (!r2.ok && r2.status >= 500) continue
        if (!r2.ok || d2.error) {
          return { ok: false, prompt, error: `${r2.status} ${String(d2?.error?.message ?? '').slice(0, 160)}` }
        }
        data = d2
        break
      }
      if (data?.pending) return { ok: false, prompt, error: sig.aborted ? '已取消' : '生图等得太久（超时）' }
    }
    if (data?.error) return { ok: false, prompt, error: String(data.error.message ?? '生图失败').slice(0, 160) }
    const item = data?.images?.[0] ?? data?.data?.[0]
    const b64: string | undefined = item?.b64_json
    const url: string | undefined = item?.url
    if (b64) {
      const raw = dataUrlToBytes(`data:image/png;base64,${b64}`)
      const dataUrl =
        raw && isPng(raw) ? await stripWatermark(bytesToDataUrl(raw), paperHex) : `data:image/png;base64,${b64}`
      return { ok: true, prompt, dataUrl }
    }
    if (!url) return { ok: false, prompt, error: '接口没返回图片' }
    // 返回的是临时 URL（86400 秒过期）：立刻转成 base64，导出 pptx 时不受跨域与过期影响
    const img = await fetch(url).catch(() => null)
    if (!img || !img.ok) return { ok: false, prompt, error: '图片下载失败' }
    const bytes = new Uint8Array(await img.arrayBuffer())
    if (isPng(bytes)) return { ok: true, prompt, dataUrl: await stripWatermark(bytesToDataUrl(bytes), paperHex) }
    const mime = (img.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
    return { ok: true, prompt, dataUrl: bytesToDataUrl(bytes, mime) }
  } catch (e) {
    return { ok: false, prompt, error: e instanceof Error ? e.message : '未知错误' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 单张出图，三级按顺序试，成了就停（TASKS/26 续）：
 *
 *   auto（默认）：Kolors（免费）→ Z-Image（1 毛）→ DeepSeek 写 SVG（矢量）→ 页面不配图（内置线稿）
 *   vector      ：矢量 → Z-Image → Kolors
 *   photo       ：Z-Image → Kolors（旧口径，门禁 E 用）
 *
 * 三条「不许花钱」的规矩：
 *   1. 402 / 额度：立刻不打了，直接落到矢量（再打只是再欠一次）；
 *   2. 429 限速：等 20 秒问同一家，**不**顺势换成付费那张；
 *   3. 401 / 403 / 404 / 503：这把 key 不干生图（老师只填了 DeepSeek 就是这种），换级也白问，直接矢量。
 *
 * 注意这一层只管「画不出来」。画出来带字是另一件事，由 director.ts 判废后在同一条 brief 上重投一次。
 */
export async function generateIllustration(
  brief: string,
  cfg: IllustConfig,
  opts: {
    grade?: string
    subjectName?: string
    look?: string
    hardNoText?: boolean
    /** 重投轮次：换一句取景变化，免得连续两张一个模子 */
    variant?: number
    /** 这一页的纸色：提示词的底纸描述与抹水印的补丁色都取它 */
    paper?: string
    /** 封面构图：有值就走封面那套提示词（铺满整页、先空出一整块） */
    cover?: CoverArch
    /** 这一页的标题（只给矢量那边当上下文，不进画面） */
    title?: string
    signal?: AbortSignal
  } = {}
): Promise<IllustResult> {
  const engine: IllustEngine = cfg.engine ?? DEFAULT_ILLUST.engine ?? 'auto'
  const prompt = composePrompt(brief, opts)
  const cancelled: IllustResult = { ok: false, prompt: brief, error: '已取消' }

  /* 位图那几级的顺序：auto 把「券抵的百炼」排第一，后面才是硅基的免费档与付费档；
     显式指定的模型仍然排最前（老师自己在设置页填了就用它） */
  const models = ((): string[] => {
    const explicit = String(cfg.model ?? '').trim()
    const base =
      engine === 'auto'
        ? [ILLUST_BAILIAN_MODEL, ILLUST_FREE_MODEL, ILLUST_MODEL]
        : [ILLUST_MODEL, ILLUST_FALLBACK_MODEL]
    const list = explicit && !base.includes(explicit) ? [explicit, ...base] : base
    return list.filter((m, i, all) => all.indexOf(m) === i)
  })()

  let vectorError = ''
  const imageErrors: string[] = []

  /** 矢量那一级（photo 口径下不存在） */
  const runVector = async (): Promise<IllustResult | null> => {
    if (engine === 'photo') return null
    /* 导演的 brief 里已经写了「哪边留空」，这里照它念，免得图占了要写字的那半边 */
    const empty = /empty space on the left/i.test(brief) ? 'left' : 'right'
    const v = await generateVectorArt(brief, cfg, {
      paper: opts.paper,
      title: opts.title,
      empty,
      signal: opts.signal,
    })
    if (v.ok && v.dataUrl) return { ok: true, prompt: v.prompt ?? brief, dataUrl: v.dataUrl }
    if (opts.signal?.aborted) return cancelled
    vectorError = v.error ?? '没用'
    return null
  }

  /** 位图那几级：一张一张试，撞上「欠费 / 限速 / key 不干这活」就收手 */
  const runImages = async (): Promise<IllustResult | null> => {
    for (const model of models) {
      if (opts.signal?.aborted) return cancelled
      let r = await generateOne(prompt, { ...cfg, model }, opts.signal, opts.paper)
      // 免费档 2 张/分钟：等一会儿问同一家，不拿付费那张顶上
      if (!r.ok && isRateLimited(r.error ?? '')) {
        await sleep(20_000, opts.signal)
        if (opts.signal?.aborted) return cancelled
        r = await generateOne(prompt, { ...cfg, model }, opts.signal, opts.paper)
      }
      if (r.ok) return r
      const err = r.error ?? '失败'
      imageErrors.push(`${model.split('/').pop()}：${err}`)
      // 欠费 / 额度 / 还限速：这段到此为止，交给矢量那边，别再花钱
      if (isStopError(err) || isRateLimited(err)) return null
      /* 上游不认这把 key：换「同一家」的下一级是白问，但百炼与硅基是两家账——
         百炼没配（503）不该挡住硅基那两级，继续往下走 */
      if (isWrongProvider(err)) {
        if (model === ILLUST_BAILIAN_MODEL) continue
        return null
      }
    }
    return null
  }

  /** 两条路都没成时的交代：矢量那句在前、生图那几级一句一句排在后面 */
  const tail = (): IllustResult => ({
    ok: false,
    prompt: brief,
    error:
      [
        vectorError && `矢量：${vectorError}`,
        imageErrors.length > 0 && `生图：${imageErrors.join('，')}`,
      ]
        .filter(Boolean)
        .join('；') || '没画成',
  })

  if (engine === 'auto') {
    const r = await runImages()
    if (r) return r
    if (opts.signal?.aborted) return cancelled
    const v = await runVector()
    return v ?? tail()
  }

  const v = await runVector()
  if (v) return v
  if (opts.signal?.aborted) return cancelled
  const r = await runImages()
  return r ?? tail()
}

/* ------------------------------ 图片缓存 ------------------------------ */

/**
 * 缓存接口：由 deckStore 实现（键 = 课件指纹 + 导演输出哈希，页下标）。
 * 换教案 / 换了导演计划，键就变了，旧图绝不冒充新画。
 */
export interface IllustCache {
  load(fp: string): Promise<Map<number, string>>
  save(fp: string, index: number, dataUrl: string): Promise<void>
}