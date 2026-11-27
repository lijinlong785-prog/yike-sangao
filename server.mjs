/**
 * 同源服务：静态托管 dist + 转发 /api/ds/* （DeepSeek 官方）与 /api/sf/* （硅基流动）并注入 key（TASKS/13 / 26）。
 *
 * 存在的唯一理由：让前端不持有密钥。
 * 文本 / 写 SVG / 看图 → DeepSeek 官方；位图生图 → 硅基流动（那两家模型不通用）。
 * 用法：npm run build && node server.mjs（端口 8080，PORT 可覆盖）
 *
 * 白名单只开这两个接口，多一个都不要：开放代理会被拿去刷额度。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8080)

/** 两家上游：文本走 DeepSeek 官方，生图走硅基流动 */
const PROVIDERS = {
  ds: {
    upstream: 'https://api.deepseek.com',
    allow: new Set(['/chat/completions']),
    /** 官方只认 deepseek-flash / deepseek-v4-pro */
    rewriteModel: true,
  },
  sf: {
    upstream: 'https://api.siliconflow.cn',
    allow: new Set(['/images/generations', '/chat/completions']),
    rewriteModel: false,
  },
  /* 百炼文本（兼容模式）：DeepSeek 欠费时的第一兜底，券抵（2026-11-23 用户拍板「文字也走千问」）。
     upstream 留空，openUpstream 里用 BAILIAN_CHAT_BASE 现拼（它带 /v1，要先剥掉）。 */
  bltext: {
    upstream: '',
    allow: new Set(['/chat/completions']),
    rewriteModel: false,
  },
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

function readEnvFile() {
  const out = {}
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
  return out
}

const fileEnv = readEnvFile()
const pickKey = (...names) =>
  String(
    names.map((n) => process.env[n] || fileEnv[n] || '').find((v) => String(v).trim()) || ''
  ).trim()

const KEYS = {
  ds: pickKey('DEEPSEEK_API_KEY'),
  sf: pickKey('SILICONFLOW_API_KEY', 'VITE_SILICONFLOW_API_KEY'),
  /** 百炼：生图的另一家（qwen-image 系列），走异步任务，见 serveBailianImage */
  bl: pickKey('DASHSCOPE_API_KEY'),
  /** 百炼文本兜底（qwen-plus，券抵）：与生图同一把 key，兼容模式端点 */
  bltext: pickKey('DASHSCOPE_API_KEY'),
}

/**
 * 百炼的落点：业务空间的 key 只认自己那个域名，填错就是 url error。
 * 地址由 .env.local 的 DASHSCOPE_BASE_URL 给（形如 https://ws-xxx.cn-beijing.maas.aliyuncs.com/api/v1）。
 */
const BAILIAN_BASE = pickKey('DASHSCOPE_BASE_URL') || 'https://dashscope.aliyuncs.com/api/v1'

/**
 * 百炼的文本端点（兼容模式）。和上面的业务空间地址不是一个域名：
 * 联网检索（enable_search）与 qwen-plus/max 只在 compatible-mode 上认。
 * 万一哪家的 key 只通了业务空间，可以用 DASHSCOPE_CHAT_BASE_URL 覆盖。
 */
const BAILIAN_CHAT_BASE =
  pickKey('DASHSCOPE_CHAT_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** 这几个前缀的模型只养在百炼，前端把模型名当上游选择器用 */
const BAILIAN_MODEL = /^(qwen-image|z-image|wan\d)/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 旧包发上来的仍是硅基那套 id；官方只认这两个，过一口气换掉 */
function mapModel(model) {
  const m = String(model ?? '')
  if (/-pro\b|v4-pro|v4\.pro/i.test(m)) return 'deepseek-v4-pro'
  return 'deepseek-flash'
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length })
  res.end(body)
}

/** 硅基那把 key 兼跑文本时用的模型（DeepSeek 官方账上没钱时换这家用） */
const SF_TEXT_MODEL =
  process.env.SILICONFLOW_TEXT_MODEL ||
  fileEnv.VITE_SILICONFLOW_TEXT_MODEL ||
  'deepseek-ai/DeepSeek-V3.2'

/** DeepSeek 欠费时文字兜底用的千问模型（券抵；要更强可设 TEXT_FALLBACK_MODEL=qwen-max） */
const BL_TEXT_MODEL = process.env.TEXT_FALLBACK_MODEL || fileEnv.TEXT_FALLBACK_MODEL || 'qwen-plus'

/** 改了模型名的请求体；不是 JSON 就原样发，上游自己会报 */
function retarget(body, model) {
  if (!model) return body
  try {
    const json = JSON.parse(body.toString('utf8'))
    json.model = model
    return Buffer.from(JSON.stringify(json), 'utf8')
  } catch {
    return body
  }
}

/**
 * 开一次上游请求，返回原始 Response（**不预读**）。
 * 不预读是为了能把 SSE 一段一段往下写：前端是流式读的，连接一传来就不能干等；
 * 以前这里 arrayBuffer() 把整段等完，前端看到的是「50 秒没回话」，长活全被判超时。
 * 返回 null 表示这一趟连都没连上（断连 / 超时）。
 */
async function openUpstream(which, upstreamPath, body, opts = {}) {
  const p = PROVIDERS[which]
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 180_000)
  const model = opts.model ?? (p.rewriteModel ? mapModel(bodyModel(body)) : '')
  const base = which === 'bltext' ? BAILIAN_CHAT_BASE.replace(/\/v1$/, '') : p.upstream
  try {
    const upstream = await fetch(`${base}/v1${upstreamPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEYS[which]}` },
      body: retarget(body, model),
      signal: ctrl.signal,
    })
    // 计时器不能跟着 Response 活 180 秒：头一到就放，真正的超时交给前端空闲判据
    clearTimeout(timer)
    return upstream
  } catch {
    clearTimeout(timer)
    return null
  }
}

/** 请求体里的模型名（解析不出来就空串，mapModel 会落 deepseek-flash） */
function bodyModel(body) {
  try {
    return String(JSON.parse(body.toString('utf8'))?.model ?? '')
  } catch {
    return ''
  }
}

/**
 * 转发 + 分级文案（TASKS/15 §3.4）：
 *   · 断连类（一秒就失败）立刻重试一次，不等待；重试成功则用户无感；
 *   · 上游的错一律换成中文，502 / proxy_error / Insufficient Balance / request_id 一个都不许出界面；
 *   · 只保留 401 / 402 / 403 / 429 四个状态码的语义（前端据此说人话），其余 5xx 统一 504；
 *   · 2026-11-21：DeepSeek 官方账上没钱 / 连不上时，拿硅基那把 key 兼跑一次文本——
 *     两把 key 里总有一把能用，评委打开页面不能因为一边欠费就看到「额度用完了」。
 */
async function relay(which, req, res, upstreamPath, body) {
  let upstream = await openUpstream(which, upstreamPath, body)
  // 断连（0.1 秒就挂，典型是免费档限速）：立刻重试一次，不退避
  if (!upstream) upstream = await openUpstream(which, upstreamPath, body)

  /* DeepSeek 欠费 / 连不上：先转百炼千问（券抵，2026-11-23 用户拍板「文字也走千问」），
     百炼也不通再落硅基——三把 key 只要有一把活着，评委就不会看到「额度用完」。 */
  if (which === 'ds' && (!upstream || [401, 402, 403].includes(upstream.status))) {
    await upstream?.body?.cancel?.().catch?.(() => {})
    upstream = null
    if (KEYS.bltext) upstream = await openUpstream('bltext', '/chat/completions', body, { model: BL_TEXT_MODEL })
    if ((!upstream || !upstream.ok) && KEYS.sf) {
      await upstream?.body?.cancel?.().catch?.(() => {})
      upstream = await openUpstream('sf', upstreamPath, body, { model: SF_TEXT_MODEL })
    }
  }

  if (!upstream) {
    return sendJson(res, 504, {
      error: {
        message: '模型这会儿没回话，先用内置稿看流程，稍后再点一次。',
        type: 'upstream_down',
      },
    })
  }

  if (upstream.ok) {
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    })
    if (!upstream.body) return res.end()
    const reader = upstream.body.getReader()
    // 浏览器先走一步（关页 / 换教案）：把上游也掐掉，别空烧额度
    res.on('close', () => {
      reader.cancel().catch(() => {})
    })
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) res.write(Buffer.from(value))
      }
    } catch {
      // 上游中途断了：已经发出去的照样留着，前端会按「没吐字超时」自己兜
    }
    return res.end()
  }

  // 上游自己报的错：不把原始 body 转发给浏览器（里面常有 request_id 与英文余额文案）
  if (upstream.status === 401 || upstream.status === 403) {
    return sendJson(res, upstream.status, {
      error: { message: '接口不认这把 key；清空设置页里的 key 就走服务端。', type: 'auth' },
    })
  }
  if (upstream.status === 402) {
    return sendJson(res, 402, {
      error: { message: '额度用完了，先用内置稿看完流程。', type: 'quota' },
    })
  }
  if (upstream.status === 429) {
    return sendJson(res, 429, { error: { message: '请求太频繁，歇一会儿再试。', type: 'rate' } })
  }
  return sendJson(res, 504, {
    error: { message: '模型这会儿没回话，先用内置稿看流程，稍后再点一次。', type: 'upstream_down' },
  })
}

/**
 * 百炼生图（qwen-image 系列）：它家是**异步任务**，不是一次请求就出图。
 * 提交拿 task_id → 每 3 秒问一次 → 成了把图下载下来转 base64。
 *
 * 为什么必须在这一层把异步吃掉：
 *   · 浏览器那边只认「一次请求换一张图」，改前端等于把同步那条路整段重写；
 *   · 图是带签名的 OSS 临时地址，直接丢给浏览器会被跨域拦住，落地必须由服务端下。
 *
 * 返回格式照抄硅基那套（{ data: [{ b64_json }] }），前端 generateOne 一个字都不用改。
 */
/**
 * 百炼文本（兼容模式 + 联网检索）：只给「课题 → 教材定位 + 关键原句」用。
 *
 * 为什么单开一条路，不塞进 /api/bl 的转发里：
 *   · 联网检索只有官方 compatible-mode 端点认（业务空间的 maas 域名不带 search 插件），
 *     两边的 base 不是一个；
 *   · search 参数必须在服务端强制打开——前端把 enable_search 传上来，谁都能改；
 *   · 这条路的模型也必须是 qwen-plus / max 这类带检索的，qwen-image 走不了。
 *
 * 返回就是百炼原样的 chat.completion，前端照 OpenAI 那套解析。
 */
async function serveBailianChat(res, body) {
  let j = {}
  try {
    j = JSON.parse(body.toString('utf8'))
  } catch {
    return sendJson(res, 400, { error: { message: '请求体不是 JSON。', type: 'bad_request' } })
  }
  const asked = String(j.model ?? '').trim()
  // 只有这几档带检索；别的名字一律换成 qwen-plus，免得上游报「模型不存在」
  const model = /^qwen-(max|plus|turbo|flash)/i.test(asked) ? asked : 'qwen-plus'
  const payload = {
    ...j,
    model,
    enable_search: true,
    // forced_search：这一趟必须真的去搜，不许模型凭记忆答（课文版本记错比搜不到更糟）
    search_options: { forced_search: true, enable_source: false, search_strategy: 'pro' },
    stream: false,
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60_000)
  try {
    const upstream = await fetch(`${BAILIAN_CHAT_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEYS.bl}` },
      body: Buffer.from(JSON.stringify(payload), 'utf8'),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    const text = await upstream.text()
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' })
    return res.end(text)
  } catch {
    clearTimeout(timer)
    return sendJson(res, 504, {
      error: { message: '联网查课文这会儿没回话，先用内置的几句。', type: 'upstream_down' },
    })
  }
}

async function serveBailianImage(res, body) {
  let j = {}
  try {
    j = JSON.parse(body.toString('utf8'))
  } catch {
    return sendJson(res, 400, { error: { message: '请求体不是 JSON。', type: 'bad_request' } })
  }
  const prompt = String(j.prompt ?? '').trim()
  if (!prompt) return sendJson(res, 400, { error: { message: '没给提示词。', type: 'bad_request' } })

  const model = String(j.model || 'qwen-image-3.0')
  // 前端一直用 1024x576（硅基口径），百炼只认星号
  const size = String(j.image_size || j.size || '1024x576').replace(/x/gi, '*')
  const n = Math.min(4, Math.max(1, Number(j.n || j.batch_size || 1) || 1))
  // 负向提示词与种子：前端一直在发，之前这层没接，等于把「别写字」的约束扔了。
  const negativePrompt = String(j.negative_prompt ?? j.negativePrompt ?? '').trim()
  const seed = Number.isFinite(Number(j.seed)) ? Number(j.seed) : null
  const auth = { Authorization: `Bearer ${KEYS.bl}` }

  /** 上游的错翻成人话：这几个码前端据此决定「换级」还是「收手」 */
  const fail = (status, message, type) => sendJson(res, status, { error: { message, type } })

  let submit
  try {
    submit = await fetch(`${BAILIAN_BASE}/services/aigc/image-generation/generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable', ...auth },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
        parameters: {
          size,
          n,
          watermark: false,
          ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
          ...(seed !== null ? { seed } : {}),
        },
      }),
    })
  } catch {
    return fail(504, '模型这会儿没回话，先用内置稿看流程，稍后再点一次。', 'upstream_down')
  }

  const sj = await submit.json().catch(() => null)
  if (!submit.ok) {
    const raw = JSON.stringify(sj ?? {})
    if (submit.status === 401 || submit.status === 403) return fail(submit.status, '接口不认这把 key；清空设置页里的 key 就走服务端。', 'auth')
    if (submit.status === 402) return fail(402, '额度用完了，先用内置稿看完流程。', 'quota')
    if (submit.status === 429 || /Throttling|limit/i.test(raw)) return fail(429, '请求太频繁，歇一会儿再试。', 'rate')
    // url error / InvalidParameter：这把 key 那个业务空间不开这个模型，换级也白问
    return fail(400, `百炼不受理这个请求（${String(sj?.code ?? submit.status)}）`, 'bad_request')
  }

  const taskId = sj?.output?.task_id
  if (!taskId) return fail(502, '百炼没给任务号，稍后再点一次。', 'upstream_down')

  // 一张图实测 40~60 秒；一分钟没成基本就是排队，给到 3 分钟
  for (let i = 0; i < 60; i++) {
    await sleep(3000)
    if (res.destroyed) return
    let d = null
    try {
      const r = await fetch(`${BAILIAN_BASE}/tasks/${taskId}`, { headers: auth })
      d = await r.json().catch(() => null)
    } catch {
      continue
    }
    const st = d?.output?.task_status
    if (st === 'SUCCEEDED') {
      const urls = (d.output?.choices?.[0]?.message?.content ?? [])
        .filter((c) => c?.type === 'image' && c.image)
        .map((c) => c.image)
      if (!urls.length) return fail(502, '百炼说画好了，但没给图。', 'upstream_down')
      const imgs = []
      for (const u of urls.slice(0, n)) {
        try {
          const img = await fetch(u)
          if (!img.ok) continue
          imgs.push({ b64_json: Buffer.from(await img.arrayBuffer()).toString('base64') })
        } catch {
          // 单张下载失败不算整单失败，有几张给几张
        }
      }
      if (!imgs.length) return fail(502, '图下载不下来，稍后再点一次。', 'upstream_down')
      /* 留底（2026-11-23 用户要求「拿得到千问画的图」）：每一张回来的图都落盘，
         包括前端质检 later 扔掉的——art-log/ 里按时间 + 任务号存 PNG 与提示词。
         只写本地，不进 dist、不进 release。 */
      try {
        const dir = path.join(ROOT, 'art-log')
        fs.mkdirSync(dir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        imgs.forEach((im, k) => {
          fs.writeFileSync(path.join(dir, `${stamp}-${taskId}-${k}.png`), Buffer.from(im.b64_json, 'base64'))
        })
        fs.writeFileSync(
          path.join(dir, `${stamp}-${taskId}.json`),
          JSON.stringify({ taskId, model, size, prompt, at: new Date().toISOString() }, null, 1)
        )
      } catch {
        // 留底失败不影响出图
      }
      return sendJson(res, 200, { data: imgs, images: imgs })
    }
    if (st === 'FAILED' || st === 'CANCELED' || st === 'UNKNOWN') {
      return fail(502, `百炼这张没画出来（${String(d?.output?.code ?? st)}）`, 'upstream_down')
    }
  }
  return fail(504, '这张画得太久，先用内置稿看流程，稍后再点一次。', 'upstream_down')
}

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0])
  let file = path.resolve(DIST, `.${rel}`)
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html')
    if (!fs.existsSync(file)) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('还没有构建产物。先跑 npm run build。')
      return
    }
  }
  const ext = path.extname(file).toLowerCase()
  const stat = fs.statSync(file)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0]

  /* 「生成到哪儿了」的现场线（2026-11-23 用户要求实时看进度）：只记 API 路径，
     不记静态资源、不记 key、不记请求体。tail -f 就能看出浏览器走到哪一步：
     /api/ds/chat = 在写文字，/api/bl/images = 在画一张图（一张 40~60 秒）。 */
  if (urlPath.startsWith('/api/')) {
    const t0 = Date.now()
    const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
    console.log(`[${stamp()}] → ${req.method} ${urlPath}`)
    res.on('finish', () => {
      console.log(`[${stamp()}] ← ${res.statusCode} ${urlPath} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    })
  }

  if (urlPath === '/healthz') {
    return sendJson(res, 200, {
      ok: true,
      text: { upstream: PROVIDERS.ds.upstream, keyed: Boolean(KEYS.ds) },
      image: { upstream: PROVIDERS.sf.upstream, keyed: Boolean(KEYS.sf) },
      bailian: { upstream: BAILIAN_BASE, keyed: Boolean(KEYS.bl) },
    })
  }

  // 百炼生图：异步任务在这一层吃成同步外观（前端的模型名以 qwen-image / z-image 开头就走这里）
  if (urlPath === '/api/bl/images/generations') {
    if (!KEYS.bl) {
      return sendJson(res, 503, { error: { message: '服务器还没配好，联系部署的人。', type: 'server_not_configured' } })
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    return serveBailianImage(res, Buffer.concat(chunks))
  }

  // 百炼文本（联网检索）：课题 → 教材定位 + 关键原句
  if (urlPath === '/api/bl/chat/completions') {
    if (!KEYS.bl) {
      return sendJson(res, 503, { error: { message: '服务器还没配好，联系部署的人。', type: 'server_not_configured' } })
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    return serveBailianChat(res, Buffer.concat(chunks))
  }

  for (const which of ['ds', 'sf']) {
    const prefix = `/api/${which}/`
    if (!urlPath.startsWith(prefix)) continue
    const target = urlPath.slice(prefix.length - 1)
    if (!PROVIDERS[which].allow.has(target)) {
      return sendJson(res, 404, { error: { message: '这个接口不在白名单里。', type: 'not_allowed' } })
    }
    if (!KEYS[which]) {
      return sendJson(res, 503, {
        error: {
          message: '服务器还没配好，联系部署的人。',
          type: 'server_not_configured',
        },
      })
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    return relay(which, req, res, target, Buffer.concat(chunks))
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('method not allowed')
    return
  }
  serveStatic(req, res, urlPath)
})

server.requestTimeout = 0
server.headersTimeout = 0
server.timeout = 0

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[一课三稿] http://localhost:${PORT}  文本=${PROVIDERS.ds.upstream}（${KEYS.ds ? '已配' : '未配'}）` +
      `  生图=${PROVIDERS.sf.upstream}（${KEYS.sf ? '已配' : '未配'}）` +
      `  百炼=${BAILIAN_BASE}（${KEYS.bl ? '已配' : '未配'}）`
  )
})
