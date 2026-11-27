/**
 * 试画一张矢量插画（TASKS/26 的实测入口）。
 *
 * 用法：npm run try:vector -- "one child under an osmanthus branch, wide empty space on the left"
 *
 * 干什么：把一句英文 brief 交给 DeepSeek V4.1 写 SVG → 净化 → resvg 栅格化 →
 * 存 /tmp/yike-vector/NN.png，并把 SVG 原文一并存下来。
 * 为什么要它：生图效果只能看，不能猜。模型/提示词一改，先跑这个看一眼，再决定要不要动管线。
 *
 * 没有 key 时（同源代理也没起）会直接把模型的拒绝原因打出来——那就是「为什么没图」。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEEPSEEK_BASE, normalizeBase } from '../src/lib/endpoint'
import { vectorCalls, generateVectorArt, sanitizeSvg, svgShapes } from '../src/lib/vector'

const OUT = '/tmp/yike-vector'

/** 跑完把自己这个 esbuild 临时包删掉：入口必须让 npm 把 brief 追加在最后，
 * 所以 package.json 里不能再接 `; rm …; exit $rc`（那样参数会拼到 exit 后面）。 */
function cleanSelf(): void {
  try {
    rmSync(fileURLToPath(import.meta.url), { force: true })
  } catch {
    // 删不掉也不影响看结果
  }
}

function envFile(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const raw = execFileSync('/bin/cat', ['.env.local'], { encoding: 'utf8' })
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // 没有 .env.local 就只看环境变量
  }
  return out
}

async function main(): Promise<void> {
  const brief =
    process.argv.slice(2).join(' ').trim() ||
    'one child under an osmanthus branch, subject occupies the left half, wide empty space on the right'
  const env = envFile()
  /* 写 SVG 是文本活：默认用 DeepSeek 官方那把 key（deepseek-flash = V4.1-Flash）。
     想试别家就手动给 DS_BASE_URL + DS_MODEL，别在这里写死第二套。 */
  const key = String(process.env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY || '').trim()
  const baseUrl = normalizeBase(String(process.env.DS_BASE_URL || DEEPSEEK_BASE))
  const model = String(process.env.DS_MODEL || 'deepseek-flash').trim()

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  console.log(`画什么：${brief}`)
  console.log(`模型：${model} @ ${baseUrl}`)
  console.log(`key：${key ? '有' : '没有（没 key 就只能看失败原因）'}`)

  const r = await generateVectorArt(brief, { baseUrl, apiKey: key, model }, {})

  console.log(`请求数：${vectorCalls()}`)
  if (!r.ok || !r.dataUrl) {
    console.error(`✗ 没画出来：${r.error ?? '未知原因'}`)
    cleanSelf()
    process.exit(1)
  }
  const svg = r.svg ?? sanitizeSvg('') ?? ''
  writeFileSync(`${OUT}/01.svg`, svg, 'utf8')
  const b64 = r.dataUrl.split(',')[1] ?? ''
  writeFileSync(`${OUT}/01.png`, Buffer.from(b64, 'base64'))
  console.log(`✓ ${OUT}/01.png（${svgShapes(svg)} 笔，SVG ${Math.round(svg.length / 1024)}KB）`)
  console.log(`  ${OUT}/01.svg`)
  cleanSelf()
}

void main()