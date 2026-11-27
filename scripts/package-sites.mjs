/**
 * 打包 Qoder Sites 产物（TASKS/14 §3.2）：一条命令可重复执行。
 *
 * 产出：
 *   release/web/              ← dist 原样（静态站）
 *   release/runtime/app.zip   ← sites/function.mjs + package.json（Function）
 *   release/qoder-sites.json  ← 路由 / SPA 回退 / 公开访问
 *
 * 三条自检（不合格直接退出非 0）：
 *   1. web/ 里搜不到 sk- 与 API_KEY 名（前端零密钥）
 *   2. app.zip 里没有 .env* / node_modules / dist
 *   3. qoder-sites.json 里有 SPA 回退与 public 访问
 *
 * 跑法：npm run sites（默认先 build；已有 dist 可 `node scripts/package-sites.mjs --no-build`）
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const SITES = path.join(ROOT, 'sites')
const OUT = path.join(ROOT, 'release')
const noBuild = process.argv.includes('--no-build')

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
}

function walk(dir, list = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, list)
    else list.push(p)
  }
  return list
}

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

/* ------------------------------- 1 · 构建 ------------------------------- */

if (!noBuild) {
  console.log('[1/4] 构建静态产物（vite build）')
  sh('npm', ['run', 'build'], { stdio: 'inherit' })
} else {
  console.log('[1/4] 跳过构建（--no-build）')
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html 不存在，先 npm run build')

/* ------------------------------ 2 · 静态站 ------------------------------ */

console.log('[2/4] 拷贝 dist → release/web')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'runtime'), { recursive: true })
fs.cpSync(DIST, path.join(OUT, 'web'), { recursive: true })

const webFiles = walk(path.join(OUT, 'web'))
for (const f of webFiles) {
  if (/\.map$/.test(f)) {
    fs.rmSync(f)
    continue
  }
  const text = /\.(js|css|html|json)$/.test(f) ? fs.readFileSync(f, 'utf8') : ''
  if (/\bsk-[A-Za-z0-9]{16,}/.test(text)) fail(`静态产物里打出明文 key：${path.relative(ROOT, f)}`)
  if (/VITE_[A-Z0-9_]*KEY/.test(text)) fail(`静态产物里还有 VITE_*KEY 读取：${path.relative(ROOT, f)}`)
}
console.log(`  ✓ ${webFiles.length} 个文件，零密钥`)

/* ------------------------------- 3 · 函数 ------------------------------- */

console.log('[3/4] 打 runtime/app.zip')
fs.copyFileSync(path.join(SITES, 'function.mjs'), path.join(OUT, 'runtime', 'function.mjs'))
fs.writeFileSync(
  path.join(OUT, 'runtime', 'package.json'),
  JSON.stringify({ name: 'yike-sangao-api', private: true, type: 'module', main: 'function.mjs' }, null, 2) + '\n'
)
const zipFile = path.join(OUT, 'runtime', 'app.zip')
fs.rmSync(zipFile, { force: true })
sh('/usr/bin/zip', ['-q', '-X', '-j', zipFile, path.join(OUT, 'runtime', 'function.mjs'), path.join(OUT, 'runtime', 'package.json')])
fs.rmSync(path.join(OUT, 'runtime', 'function.mjs'))
fs.rmSync(path.join(OUT, 'runtime', 'package.json'))

const zipList = sh('/usr/bin/unzip', ['-Z1', zipFile]).split('\n').map((s) => s.trim()).filter(Boolean)
if (zipList.some((n) => /(^|\/)\.env|node_modules|\.pptx$/.test(n))) fail(`app.zip 里混进了不该发的文件：${zipList.join(' / ')}`)
if (!zipList.includes('function.mjs')) fail('app.zip 里没有 function.mjs')
console.log(`  ✓ ${zipList.join(' + ')} · ${(fs.statSync(zipFile).size / 1024).toFixed(1)}KB`)

/* ----------------------------- 4 · 描述文件 ----------------------------- */

console.log('[4/4] 写 qoder-sites.json')
const manifest = {
  _schema_note:
    '字段形状按 TASKS/14 §二.4：上传前用 `qoder sites describe prepare_site` 的 JSON Schema 校对一遍；本文件由 scripts/package-sites.mjs 生成，不要手改',
  name: 'yike-sangao',
  framework: 'static',
  static: { dir: 'web', spaFallback: 'index.html' },
  functions: [
    {
      name: 'api',
      runtime: 'runtime/app.zip',
      handler: 'function.mjs',
      routes: ['/api/ds/*', '/api/sf/*', '/api/bl/*'],
      env: ['DEEPSEEK_API_KEY', 'SILICONFLOW_API_KEY', 'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL'],
    },
  ],
  access: { mode: 'public', requireLogin: false },
}
fs.writeFileSync(path.join(OUT, 'qoder-sites.json'), JSON.stringify(manifest, null, 2) + '\n')
if (!/"spaFallback"/.test(JSON.stringify(manifest))) fail('描述文件里没有 SPA 回退')
if (!/"public"/.test(JSON.stringify(manifest))) fail('描述文件里没把访问策略设成 public')

/* ------------------------------- 交付清单 ------------------------------- */

const total = walk(OUT).reduce((n, f) => n + fs.statSync(f).size, 0)
console.log(`\n✓ release/ 就绪：${walk(OUT).length} 个文件，${(total / 1024 / 1024).toFixed(2)}MB`)
console.log('  release/web/index.html          静态站（SPA）')
console.log('  release/runtime/app.zip         Function（/api/ds · /api/sf · /api/bl）')
console.log('  release/qoder-sites.json        路由 / SPA 回退 / 公开访问')
console.log('\n剩下三步只能在面板里点（TASKS/14 §3.3）：')
console.log('  1. Sites → 环境变量：DEEPSEEK_API_KEY、SILICONFLOW_API_KEY、DASHSCOPE_API_KEY、DASHSCOPE_BASE_URL（只写不可读）')
console.log('  2. 上传 release/ 并发布')
console.log('  3. 访问策略改成 Anyone can access，再用无痕窗口走一遍 §3.4 六条验收')