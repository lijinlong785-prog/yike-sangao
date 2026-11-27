/**
 * TASKS/13 门禁：前端零密钥。
 *
 * 四条硬断言，任一失败退出码 1：
 *   1. `src/` 下不存在 `VITE_*KEY` 这类构建期密钥读取（注释里提到不算，先剥注释再判）；
 *      `src/` 里也不许出现字面量 `sk-xxxxx`；
 *   2. `src/lib/endpoint.ts` 存在且导出 `endpointOf`；
 *   3. `src/` 内每一处 `fetch(` 的落点都来自 `endpointOf`（白名单：示例图、生图临时图两处纯下载）；
 *   4. 若有 `dist/`，产物里不得出现匹配 `sk-[A-Za-z0-9]{20,}` 的字符串——这条最直接对应「部署后泄露」。
 *
 * 只读文件，不发网络请求，不需要 Key。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

/** 递归列出文件（只收给定后缀） */
function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

/**
 * 只留代码：把 // 与 /* *\/ 注释整段挖掉，字符串原样保留。
 * 必须按字符走一遍，不能拿正则一刀切——源码里到处是 `https://`，
 * 一刀切会把 URL 后面半行当注释吃掉，真的密钥读取反而藏起来了。
 */
function codeOnly(text: string): string {
  let out = ''
  let i = 0
  let quote: '"' | "'" | '`' | null = null
  while (i < text.length) {
    const c = text[i]
    const d = text[i + 1]
    if (quote) {
      out += c
      if (c === '\\') {
        out += d ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
      out += ' '
      continue
    }
    if (c === '/' && d === '/') {
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length : end
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    out += c
    i += 1
  }
  return out
}

/** 某字符下标在第几行（报错定位用） */
function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

const srcFiles = walk(SRC, ['.ts', '.tsx'])
const codes = new Map<string, string>()
for (const file of srcFiles) codes.set(file, codeOnly(readFileSync(file, 'utf8')))
const rel = (p: string) => relative(ROOT, p)

/* ------------------------- 1. 源码里不许有密钥 ------------------------- */

{
  const keyPattern = /\bVITE_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/g
  const literal = /\bsk-[A-Za-z0-9]{20,}/g
  let hits = 0
  for (const [file, code] of codes) {
    for (const m of code.matchAll(keyPattern)) {
      fail(`${rel(file)}:${lineAt(code, m.index ?? 0)} 还在读构建期密钥 ${m[0]}（前端不许持有 key）`)
      hits += 1
    }
    for (const m of code.matchAll(literal)) {
      fail(`${rel(file)}:${lineAt(code, m.index ?? 0)} 出现疑似密钥字面量 ${m[0].slice(0, 6)}…`)
      hits += 1
    }
  }
  if (hits === 0) ok('src/ 零密钥', `${srcFiles.length} 个文件剥注释后既无 VITE_*KEY 也无 sk- 字面量`)
}

/* ----------------------- 2. endpoint.ts 是唯一裁决处 ----------------------- */

{
  const file = join(SRC, 'lib', 'endpoint.ts')
  if (!existsSync(file)) {
    fail('src/lib/endpoint.ts 不存在（请求落点必须收在一个函数里）')
  } else {
    const code = codeOnly(readFileSync(file, 'utf8'))
    const exported = /export\s+(?:async\s+)?function\s+endpointOf|export\s+const\s+endpointOf\b/.test(code)
    if (!exported) fail('src/lib/endpoint.ts 没有导出 endpointOf')
    if (!/PROXY_PREFIX/.test(code)) fail('src/lib/endpoint.ts 里没有 /api/sf 前缀常量')
    if (exported) ok('endpoint.ts', '导出 endpointOf，落点判断只此一处')
  }
}

/* ------------------- 3. 每处 fetch 的落点都来自 endpointOf ------------------- */

{
  /**
   * 白名单：不是模型接口的纯下载，URL 由别处给定。
   * 多一条都要在这里写明理由，不要放宽成「文件名白名单」。
   */
  const ALLOW = new Set([
    `${rel(join(SRC, 'lib', 'vision.ts'))}::src`, // 读内置示例图 public/sample-page.jpg
    `${rel(join(SRC, 'lib', 'illustrate.ts'))}::url`, // 生图返回的临时 URL，立刻转 base64
  ])
  const seen: string[] = []
  for (const [file, code] of codes) {
    for (const m of code.matchAll(/\bfetch\s*\(\s*([A-Za-z0-9_$.?]+)/g)) {
      const target = m[1]
      const where = `${rel(file)}::${target}`
      seen.push(`${rel(file)}:${lineAt(code, m.index ?? 0)} → fetch(${target})`)
      if (target === 'ep.url') continue
      if (ALLOW.has(where)) continue
      fail(`${rel(file)}:${lineAt(code, m.index ?? 0)} 的 fetch(${target}) 没过 endpointOf（落点判断只许一处）`)
    }
  }
  if (!seen.some((s) => s.includes('fetch(ep.url)'))) fail('没有任何一处 fetch(ep.url)：endpointOf 可能根本没接上')
  ok('fetch 落点', seen.join('；'))
}

/* --------------------- 4. dist 里不许有任何密钥字面量 --------------------- */

{
  if (!existsSync(DIST)) {
    ok('dist 零密钥', '还没有 dist（先跑 npm run build 再验一次）')
  } else {
    const files = walk(DIST, ['.js', '.mjs', '.css', '.html', '.json', '.map', '.txt', '.svg'])
    const leak = /\bsk-[A-Za-z0-9]{20,}/g
    let scanned = 0
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      scanned += text.length
      for (const m of text.matchAll(leak)) {
        fail(`${rel(file)} 里搜到疑似密钥 ${m[0].slice(0, 6)}…（部署后会被人 F12 抄走）`)
      }
    }
    ok('dist 零密钥', `${files.length} 个产物文件、共 ${Math.round(scanned / 1024)} KB，未匹配 sk-*`)
  }
}

/* -------------------------------- 汇总 -------------------------------- */

console.log(
  '\n  四条：src 无密钥读取 / endpoint.ts 唯一裁决 / fetch 全过 endpointOf / dist 无 sk-*'
)
if (failures.length) {
  console.error(`\n✗ 前端零密钥校验失败，共 ${failures.length} 处：`)
  for (const f of failures.slice(0, 40)) console.error('  - ' + f)
  process.exit(1)
}
console.log('✓ 前端零密钥：4 条全部通过')
