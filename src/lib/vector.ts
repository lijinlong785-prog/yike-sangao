/**
 * 矢量插画（TASKS/26）：让文本模型写 SVG，再栅格化成 PNG 塞进 .pptx。
 *
 * 为什么单开一条通道：DeepSeek V4.1-Flash 只进文字出文字，画不了位图；
 * 但它写 SVG 很稳，而 SVG 有三样生图模型给不了的好处——
 *   ① 天然零汉字（我们不许画面带字，位图模型经常画上去）；
 *   ② 不烧生图额度，一份六张也就多几次文本调用；
 *   ③ 画风由提示词锁死（纸墨线稿），同一份课件前后像同一个人画的。
 * 短板也认：它画不出照片级的水彩与人物。所以顺序是「矢量先画 → 不成再叫生图模型」，
 * 两条都不成才落到「这一页不配图」，页面本身照常交付。
 *
 * 分工照旧：画什么由导演给（director.ts 的英文 brief），这里只管「怎么画」与「怎么落纸」。
 */
import { endpointOf, upstreamModel } from './endpoint'
import { bytesToDataUrl } from './watermark'

/** 画 SVG 的模型：先 V4.1-Flash，再 1017 快照，最后退到默认文本模型。 */
export const VECTOR_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash'

/** 画布与 .pptx 里那个框的比例一致（16:9），贴上去不用再裁 */
export const VECTOR_W = 1024
export const VECTOR_H = 576

/** 一根线的粗细范围：太细在投影上看不见，太粗就不是纸墨了 */
const STROKE = '3–6'

/** 配置：跟生图同一把 key、同一个 baseUrl，只是换了个模型 */
export interface VectorConfig {
  baseUrl: string
  apiKey: string
  /** 留空走 VECTOR_MODEL 那条链 */
  model?: string
}

export interface VectorResult {
  ok: boolean
  /** data:image/png;base64,... 可直接进 pptx */
  dataUrl?: string
  /** 模型交出来的那段 SVG（门禁与排查用） */
  svg?: string
  /** 画的是什么（英文 brief 原文） */
  prompt?: string
  error?: string
}

/** 矢量图请求数：跟 illustCalls() 分开数，才知道钱花在哪条路上 */
let vectorCount = 0
export function vectorCalls(): number {
  return vectorCount
}
export function resetVectorCalls(): void {
  vectorCount = 0
}

/**
 * 提示词：只讲「怎么画」，不讲「画什么」。
 *
 * 禁字这一条要说到最狠，并且点名禁 text/tspan —— 模型最容易干的事就是
 * 在画面上写一个「桂花雨」，那正是我们从头到尾在躲的东西。
 */
export function vectorMessages(
  brief: string,
  opts: { paper?: string; palette?: string[]; title?: string; empty?: 'left' | 'right' } = {}
): { role: string; content: string }[] {
  const paper = String(opts.paper ?? '#faf8f3').trim() || '#faf8f3'
  const palette = (opts.palette ?? ['#8a9a7b', '#c2a06b', '#7d8b8c', '#4a4a44']).slice(0, 5)
  const empty = opts.empty === 'left' ? '左半边' : opts.empty === 'right' ? '右半边' : '右侧'

  const system = [
    '你是一位给小学语文课件画插画的矢量画师，画风是「纸墨线稿 + 淡彩」：线条略抖、颜色淡、留白多。',
    '',
    '只输出一段 SVG 代码。不要解释、不要 Markdown 代码块标记、不要前后缀一个字。',
    '',
    '硬约束（违反任何一条这段代码就会被丢弃）：',
    `1. 根元素必须是：<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VECTOR_W} ${VECTOR_H}" width="${VECTOR_W}" height="${VECTOR_H}">`,
    '2. 只许用这些元素：path、rect、circle、ellipse、line、polyline、polygon、g',
    '3. 禁止 text、tspan、image、foreignObject、script、style、filter、pattern、use、marker、animate',
    '4. 画面里一个汉字、一个字母、一个数字、一个标点都不许有——只能用形状画画',
    '5. 不许任何外部引用（href、xlink:href、url(...)）',
    '6. 只用纯色填充加 fill-opacity / stroke-opacity 做层次，不许渐变、不许阴影',
    `7. 线条 stroke-width 取 ${STROKE}，stroke-linecap="round"，stroke-linejoin="round"`,
    '8. 元素总数 15–45 个，宁可少，别堆细节；一本书里的插图就该是这样',
    '9. 先铺一层填满整张画布的底色 rect，颜色用纸色；主体不许贴边',
    '',
    `构图：主体画在${empty}，另一边保持纸色空地（老师要把字压在空地上）。`,
  ].join('\n')

  const user = [
    `纸色：${paper}`,
    `只许用这几个颜色（外加它们的透明度变化）：${palette.join(' ')}`,
    opts.title ? `这一页讲的是：${opts.title}（不要把这些字写进画里）` : '',
    '画面内容（英文，来自导演）：',
    String(brief ?? '').trim(),
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/* ------------------------------ 净化 ------------------------------ */

/** 这些元素一律不许出现在产物里：要么带字，要么渲染出来两边不一样 */
const BANNED_TAG = /<\s*(text|tspan|image|foreignObject|script|style|filter|pattern|use|marker|animate)\b/i
/** 外部引用：canvas 与 resvg 都取不到，取不到就是一张空白 */
const EXTERNAL_REF = /(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|data:(?!image\/))/i

/**
 * 从模型嘴里抠出一段能渲染的 SVG。
 * 返回 null = 这段不能用，别硬塞进 .pptx（空白图比没图更难看）。
 */
export function sanitizeSvg(raw: string): string | null {
  const text = String(raw ?? '')
  if (!text) return null
  // 模型常把代码包在 ```xml 里，先削掉围栏
  const unfenced = text.replace(/```[a-zA-Z]*\s*/g, ' ').replace(/```/g, ' ')
  const start = unfenced.search(/<svg\b/i)
  const end = unfenced.toLowerCase().lastIndexOf('</svg>')
  if (start < 0 || end < 0 || end <= start) return null
  let svg = unfenced.slice(start, end + 6).trim()
  if (svg.length > 240_000) return null
  if (BANNED_TAG.test(svg)) return null
  if (EXTERNAL_REF.test(svg)) return null
  if (!/<(path|rect|circle|ellipse|line|polyline|polygon)\b/i.test(svg)) return null

  // 根标签上的尺寸/命名空间一律重写：canvas 要靠它算固有尺寸
  svg = svg.replace(/<svg\b[^>]*>/i, () => {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VECTOR_W} ${VECTOR_H}" width="${VECTOR_W}" height="${VECTOR_H}">`
  })
  return svg
}

/** 数一数这段画了多少笔：门禁与日志用（太素 / 太满都一眼看出来） */
export function svgShapes(svg: string): number {
  const m = svg.match(/<(path|rect|circle|ellipse|line|polyline|polygon)\b/gi)
  return m ? m.length : 0
}

/* ------------------------------ 栅格化 ------------------------------ */

/** 浏览器：Blob → Image → canvas。SVG 自带 width/height，drawImage 才有确定尺寸。 */
async function rasterInBrowser(svg: string, width: number, height: number): Promise<string | null> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = url
    })
    if (!img) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Node（离线门禁 / 试画脚本）：走 @resvg/resvg-js。
 * 用变量名动态 import：这个包有原生二进制，Vite 侧不该看见它。
 */
async function rasterInNode(svg: string, width: number, height: number): Promise<string | null> {
  const pkg = '@resvg/resvg-js'
  try {
    const mod = (await import(/* @vite-ignore */ pkg)) as {
      Resvg: new (svg: string, opts?: Record<string, unknown>) => { render(): { asPng(): Uint8Array } }
    }
    const png = new mod.Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng()
    return bytesToDataUrl(new Uint8Array(png), 'image/png')
  } catch (e) {
    console.warn('[vector] 栅格化失败（resvg 没装？）', e instanceof Error ? e.message : e)
    return null
  }
}

/** 一段 SVG → 一张 PNG（dataUrl）。两边各有一条路，出来的字节不同、画面一样。 */
export async function rasterizeSvg(svg: string, width = VECTOR_W, height = VECTOR_H): Promise<string | null> {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return rasterInBrowser(svg, width, height)
  }
  return rasterInNode(svg, width, height)
}

/* ------------------------------ 出图 ------------------------------ */

const VECTOR_CHAIN = [VECTOR_MODEL, 'deepseek-v4-pro']
/** 每级 45 秒：写 2–4k 字符的 SVG 比答一段话慢 */
const STEP_MS = 45_000
const BUDGET_MS = 90_000
/** 一次出图最多问两遍：第一遍不行就只说「哪条违反了」再要一次 */
const MAX_TRIES = 2

function retryable(detail: string): boolean {
  // 4xx 里只有「模型不认识 / 没开这个模型」值得换下一级；401/402 换谁都一样
  return /model|not.?found|invalid|unsupported|400|404/i.test(detail)
}

/** 真问一次：拿回模型原话（可能是 SVG，也可能带着解释） */
async function askOnce(cfg: VectorConfig, messages: { role: string; content: string }[], model: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const ep = endpointOf('/chat/completions', cfg)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const relay = () => ctrl.abort()
  signal?.addEventListener('abort', relay)
  vectorCount += 1
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: ep.headers,
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const err = new Error(`${res.status} ${detail.slice(0, 160)}`)
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    const data = await res.json()
    return String(data?.choices?.[0]?.message?.content ?? '')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', relay)
  }
}

/**
 * 画一张：模型 → SVG → 净化 → 栅格化。
 * 失败一律返回 ok:false（调用方自己决定要不要退到生图模型），不抛。
 */
export async function generateVectorArt(
  brief: string,
  cfg: VectorConfig,
  opts: { paper?: string; palette?: string[]; title?: string; empty?: 'left' | 'right'; signal?: AbortSignal } = {}
): Promise<VectorResult> {
  const prompt = String(brief ?? '').trim()
  if (!prompt) return { ok: false, prompt, error: '没有画面描述' }

  const models = [String(cfg.model ?? '').trim() || VECTOR_MODEL, ...VECTOR_CHAIN]
    .filter((m) => !!m)
    // 走同源代理时换成本家能认的 id，换完再去重（免得同一个人问三遍）
    .map((m) => (cfg.apiKey ? m : upstreamModel(m)))
    .filter((m, i, all) => all.indexOf(m) === i)
  const started = Date.now()
  let last = ''

  for (const model of models) {
    if (opts.signal?.aborted) return { ok: false, prompt, error: '已取消' }
    const left = BUDGET_MS - (Date.now() - started)
    if (left < 5000) break
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      try {
        const messages = vectorMessages(prompt, opts)
        // 第二遍把「上一次错在哪」说清楚：模型自己知道哪条线踩了
        if (attempt > 0) {
          messages.push({
            role: 'user',
            content: `上一段不能用的原因：${last}。整段重画，只输出 SVG，画面里不许有任何字。`,
          })
        }
        const raw = await askOnce(cfg, messages, model, Math.min(STEP_MS, left), opts.signal)
        const svg = sanitizeSvg(raw)
        if (!svg) {
          last = '没返回合法的 SVG（或里面带了 text / image / 外部引用）'
          continue
        }
        const dataUrl = await rasterizeSvg(svg)
        if (!dataUrl) {
          last = '这段 SVG 渲染不出来'
          continue
        }
        return { ok: true, prompt, dataUrl, svg }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? '')
        if (opts.signal?.aborted) return { ok: false, prompt, error: '已取消' }
        last = msg
        const status = (e as Error & { status?: number }).status
        // 鉴权 / 额度：换下一级也一样，直接停
        if (status === 401 || status === 402 || status === 403) return { ok: false, prompt, error: msg }
        if (!retryable(msg)) break
      }
    }
  }
  return { ok: false, prompt, error: last || '模型没交出能用的 SVG' }
}