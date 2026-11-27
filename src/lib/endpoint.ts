/**
 * 请求落点的唯一裁决处（TASKS/13）。
 *
 * 两种走法，由「自己有没有填 key」决定：
 *   1. 没填（默认，评委拿到的状态）→ 同源 /api/ds/xxx（文本）或 /api/sf/xxx（生图），
 *      key 由服务端注入，前端产物里一个密钥都没有；
 *   2. 填了（老师自带额度）→ 直连他填的 baseUrl，走他自己的账。
 *
 * 任何地方都不许再自己拼 `${baseUrl}/chat/completions`：
 * 判断只写在这里，别处只调用 endpointOf()。
 */

export const PROXY_PREFIX = '/api/sf'

/**
 * 同源代理分两家（TASKS/26）：文本 / 写 SVG / 看图走 DeepSeek 官方，位图生图仍走硅基流动。
 * 路由写在服务端（server.mjs 与 vite.config.ts 两处），前端只认这两个常量。
 */
export const PROXY_TEXT = '/api/ds'
export const PROXY_IMAGE = '/api/sf'
/** 百炼（qwen-image 系列）：异步任务由服务端吃成同步外观，见 server.mjs serveBailianImage */
export const PROXY_IMAGE_BL = '/api/bl'

/**
 * 百炼文本（联网检索）：只给「课题 → 教材定位」这一条路用，见 lib/locate.ts。
 * 路径与生图同一个前缀，但服务端是两条不同的转发：这条必须开 enable_search。
 * 这条路**不许 byok**——搜索参数由服务端强制打开，浏览器里带 key 直连就绕过了。
 */
export const PROXY_BL_CHAT = '/api/bl'

/** 两家上游的默认落点 */
export const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'
export const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1'

/** 模型接口的默认落点（文本这一条真正指向的那一家） */
export const UPSTREAM_BASE = DEEPSEEK_BASE

/**
 * 模型名过代理时要换成本家认的：前端一直用硅基那套 id（V3.2 / V4.1-Flash / GLM），
 * 到了 DeepSeek 官方只有 deepseek-flash（= V4.1-Flash）与 deepseek-v4-pro。
 * 只在「走同源代理」时换；老师自带 key + baseUrl 时一个字不碰。
 */
export function upstreamModel(model: string): string {
  const m = String(model ?? '').trim()
  if (/-pro\b|v4-pro|v4\.pro/i.test(m)) return 'deepseek-v4-pro'
  // 其余（V3.2 / V4.1-Flash / 1017 快照 / GLM 备用级）在官方都落到这一级
  return 'deepseek-flash'
}

/**
 * 把用户手填的 Base URL 收拾成能拼 `/chat/completions` 的样子。
 * 三种常见填法都救回来：漏了协议、多了尾斜杠、只写到域名没写 /v1。
 * 认得出自家路径的（通义 compatible-mode、智谱 paas/v4、带 v1/v2 的）原样保留。
 */
export function normalizeBase(input: string): string {
  let s = String(input ?? '').trim()
  if (!s) return UPSTREAM_BASE
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  s = s.replace(/\/+$/, '')
  if (!/\/v\d/i.test(s) && !/compatible-mode/i.test(s) && !/paas\/v\d/i.test(s)) s += '/v1'
  return s
}

export interface Endpoint {
  url: string
  headers: Record<string, string>
  /** true = 用户自己的 key 直连；false = 走同源代理，服务端注入 key */
  byok: boolean
}

/**
 * 同源代理的入口前缀（2026-11-23 部署实测）：Qoder Sites 把 /api 留作平台保留段，
 * 应用函数挂在 /functions/v1/app 下，网关把函数名段之后的后缀原样递给函数——
 * 所以后面照旧拼 /api/ds/...，函数里截到 /api/ 开头再路由。
 * 本地 server.mjs / vite 代理认 /api 前缀，不加这一层；node 门禁无 location，也是 ''。
 */
export function proxyBase(): string {
  if (typeof location !== 'undefined' && /(^|\.)qoder\.zone$/i.test(location.hostname)) {
    return '/functions/v1/app'
  }
  return ''
}

export function endpointOf(
  path: string,
  cfg: { baseUrl?: string; apiKey?: string },
  provider: 'text' | 'image' | 'image-bl' | 'locate' = 'text'
): Endpoint {
  const key = String(cfg.apiKey ?? '').trim()
  /* 联网检索那条路永远走代理：enable_search 由服务端强制打开，
     让浏览器带着自己的 key 去直连，等于把「必须搜」这条规矩交给调用方决定。 */
  if (key && provider !== 'locate') {
    return {
      url: `${normalizeBase(String(cfg.baseUrl ?? ''))}${path}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      byok: true,
    }
  }
  // 走代理时一个 Authorization 都不带：带了空串会把服务端注入的头顶掉
  const proxy =
    provider === 'image-bl'
      ? PROXY_IMAGE_BL
      : provider === 'locate'
        ? PROXY_BL_CHAT
        : provider === 'image'
          ? PROXY_IMAGE
          : PROXY_TEXT
  return {
    url: `${proxyBase()}${proxy}${path}`,
    headers: { 'Content-Type': 'application/json' },
    byok: false,
  }
}

/**
 * 这个模型该递到哪家代理（TASKS/27）：qwen-image / z-image / wan 只养在百炼，
 * 其余（Kolors、Z-Image-Turbo 的硅基 id）仍在硅基。前端不持有任何一把 key，只按名字选路。
 */
export function imageProxyOf(model: string): 'image' | 'image-bl' {
  return /^(qwen-image|z-image|wan\d)/i.test(String(model ?? '').trim()) ? 'image-bl' : 'image'
}
