/**
 * 试画：让 DeepSeek 按课文写「装饰纹样」SVG（TASKS/24 §三 的换代版）
 *
 * 与 try-vector 的区别：那个画的是「插图」（有人有场景，1024×576 满幅）；
 * 这个画的是「纹样」（6~9 笔线，只在右半张，其余全空），专门给无图页当底。
 *
 * 用法：node scripts/try-motif.mjs 狼牙山 [桂花雨 ...]
 * 产出：/tmp/yike-motif/<主题>.svg + .png（纸底）+ sheet.png（原色 vs 压淡对照）
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT = '/tmp/yike-motif'
const W = 1024
const H = 576
const PAPER = '#F6F3EC'
const INK = '#5A6156'

const env = await fs.readFile('.env.local', 'utf8').catch(() => '')
const KEY =
  (env.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1] ?? process.env.DEEPSEEK_API_KEY ?? '').trim()
if (!KEY) {
  console.error('缺 DEEPSEEK_API_KEY（.env.local）')
  process.exit(1)
}

const SYSTEM = `你是一位书籍装帧设计师，为中文语文课件画「页边纹样」。纹样不是插画：它只有几根线，靠留白说话。
硬规矩，违反任一即作废：
1. 只输出一个 <svg>…</svg>，前面后面不许有任何文字、解释、markdown 围栏。
2. 根标签写死 viewBox="0 0 ${W} ${H}"，不要 width/height。
3. 背景必须完全透明：不许任何铺满整页的 rect、不许底色、不许渐变、不许滤镜、不许 clipPath、不许 <image>、不许 <text>。
4. 只用 <path fill="none" stroke="${INK}" stroke-width="2.5"> 或 <line stroke="${INK}" stroke-width="2.5">。禁止 fill（除 none）。
5. 全图笔画总数 5 到 8 条，不要更多。没被画到的区域必须彻底空白。
6. 所有笔画都落在右半张的这一个矩形里：x 从 580 到 950，y 从 300 到 460。左边一律留空。
7. 每条线都要「长」：单条长度 90 到 300 像素，斜度平缓。绝对不要画成一团碎短线，也不要让线挤在一处。
8. 笔画之间要拉开距离，最密的两条也至少隔 30 像素。`

const TOPICS = process.argv.slice(2)
const LIST = TOPICS.length ? TOPICS : ['狼牙山', '桂花雨']

const asks = {
  狼牙山: `课题《狼牙山五壮士》（六年级上册）。只画三样，按此顺序，坐标照抄：
- 2 条折线当险峰轮廓：第 1 条 M 600 385 L 640 330 L 680 372 L 730 318 L 780 368 L 830 335 L 880 380 L 930 345；
  第 2 条在它下面 40 像素，峰更矮：M 620 425 L 670 392 L 720 420 L 770 388 L 820 418 L 875 396。
- 1 条松枝：M 935 372 L 830 352 L 760 336，再在 830,352 处接一条短杈 L 812 322。
- 1 条石阶横线：M 640 445 L 700 445，再画 M 660 432 L 706 432。
一共 5~6 条，其余全空。`,
  桂花雨: `课题《桂花雨》（五年级上册）。只画三样，按此顺序，坐标照抄：
- 1 条长横枝：M 930 398 L 820 392 L 700 402 L 620 396（这一条必须画长、必须横）；
  枝上挑 1 条短杈：M 820 392 L 838 362。
- 4 条雨丝斜线，各自独立、相互隔开 40 像素以上：
  M 640 305 L 656 352；M 720 300 L 736 350；M 800 306 L 816 356；M 880 302 L 896 350。
- 3 条落花小弧（用 path 的 q 命令，不要 circle）：M 700 440 q 8 -10 16 0；M 780 452 q 8 -10 16 0；M 860 436 q 8 -10 16 0。
一共 9 条，其余全空。`,
  狼牙山远景: `课题《狼牙山五壮士》。这次画的是「页底远景」，横贯整页的底边，不是右半张。
只画三样，坐标照抄，一条都不能少：
- 1 条横贯全页的远山折线，山峰很矮（高度差不超过 40 像素），从最左到最右：
  M 0 512 L 96 492 L 168 506 L 250 486 L 340 504 L 430 488 L 520 500 L 620 484 L 712 502 L 800 490 L 890 506 L 968 494 L 1024 508
- 1 条更低的远山，比上面那条淡、更平：
  M 0 536 L 140 526 L 280 534 L 420 524 L 560 532 L 700 522 L 840 532 L 980 524 L 1024 530
- 2 条极短的云纹横线，浮在远山上方：M 700 452 L 790 452；M 830 466 L 900 466
一共 4 条，y 一律不低于 440，上方（标题与正文所在的区域 y 小于 440）完全空白。`,
}

/** 剥围栏、剥前导说明，取出 <svg>…</svg> */
function pickSvg(raw) {
  const s = String(raw ?? '')
  const a = s.indexOf('<svg')
  const b = s.lastIndexOf('</svg>')
  if (a < 0 || b < 0) return ''
  return s.slice(a, b + 6)
}

/** 净化：违禁标签/属性一律拒收（这一份不许出现任何 fill / 文字 / 外链） */
function vet(svg, full = false) {
  const bad = []
  if (!svg) return ['没拿到 svg']
  if (/<text|<image|<foreignObject|href=|url\(/i.test(svg)) bad.push('含文字/图片/外部引用')
  if (/fill="(?!none")/i.test(svg)) bad.push('含 fill（只许 none）')
  if (/linearGradient|radialGradient|<filter|<clipPath|<mask/i.test(svg)) bad.push('含渐变/滤镜/裁剪')
  if (!/viewBox="0 0 1024 576"/.test(svg)) bad.push('viewBox 不对')
  const strokes = (svg.match(/<(path|line|polyline)\b/g) ?? []).length
  if (strokes < 4) bad.push(`笔画只有 ${strokes} 条（要 6~9）`)
  if (strokes > 14) bad.push(`笔画 ${strokes} 条，太满`)
  // 坐标越界：把 x 小于 560 的笔画算作跑到左半张（标题区）
  const left = (svg.match(/(?:x1|x=|d="M)\s*"?([0-9]{1,4})/g) ?? [])
    .map((m) => Number(m.replace(/[^0-9]/g, '')))
    .filter((n) => n > 0 && n < 520)
  if (!full && left.length > 3) bad.push(`有 ${left.length} 个笔画跑进左半张`)
  return bad
}

async function draw(topic) {
  const t0 = Date.now()
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: asks[topic] ?? `课题《${topic}》。按三样物件画 6~9 笔纹样。` },
      ],
      temperature: 1.0,
      max_tokens: 1400,
    }),
  })
  const json = await res.json()
  const raw = json?.choices?.[0]?.message?.content ?? ''
  const svg = pickSvg(raw)
  const bad = vet(svg, topic.includes('远景'))
  const ms = Date.now() - t0
  if (bad.length) return { topic, ok: false, bad, ms, svg, raw }
  return { topic, ok: true, ms, svg, usage: json?.usage }
}

await fs.mkdir(OUT, { recursive: true })
const { Resvg } = await import('@resvg/resvg-js')
const results = []

for (const topic of LIST) {
  // 不合格就重投一次（纹样便宜，但别无限重投）
  let r = await draw(topic)
  if (!r.ok) {
    console.log(`  ${topic} 第 1 次不合格：${r.bad.join('；')}，重投`)
    r = await draw(topic)
  }
  if (!r.ok) {
    console.log(`✗ ${topic}：${r.bad.join('；')}`)
    continue
  }
  await fs.writeFile(path.join(OUT, `${topic}.svg`), r.svg, 'utf8')
  const png = new Resvg(r.svg, {
    fitTo: { mode: 'width', value: W },
    background: PAPER,
  })
    .render()
    .asPng()
  await fs.writeFile(path.join(OUT, `${topic}.png`), png)
  // 透明底版：贴到真实页面上做对照用（不带纸色）
  const alpha = new Resvg(r.svg, { fitTo: { mode: 'width', value: W } }).render().asPng()
  await fs.writeFile(path.join(OUT, `${topic}.alpha.png`), alpha)
  const strokes = (r.svg.match(/<(path|line|polyline)\b/g) ?? []).length
  console.log(
    `✓ ${topic}  ${strokes} 笔  ${(r.svg.length / 1024).toFixed(1)}KB  ${r.ms}ms  out=${json_usage(r.usage)}`
  )
  results.push({ topic, svg: r.svg })
}

function json_usage(u) {
  return u ? `${u.prompt_tokens}in/${u.completion_tokens}out` : '-'
}

/* 对照图：左=原色，右=压到 18% 贴在纸上的实际观感 */
if (results.length) {
  const py = `
from PIL import Image
import json, os
rows = json.load(open('${OUT}/list.json'))
W,H = 900,506
sheet = Image.new('RGB', (W*2+30, H*len(rows)+15*(len(rows)+1)), (255,255,255))
paper = Image.open(rows[0]['png']).convert('RGB').getpixel((2,2))
for i,r in enumerate(rows):
    im = Image.open(r['png']).convert('RGBA').resize((W,H), Image.LANCZOS)
    sheet.paste(im.convert('RGB'), (10, 15+i*(H+15)))
    # 压淡：与纸色按 alpha 0.32 混合（内页有字，这就是最终上屏的浓度）
    bg = Image.new('RGBA', im.size, paper+(255,))
    faded = Image.blend(bg, im, 0.32).convert('RGB')
    sheet.paste(faded, (W+20, 15+i*(H+15)))
sheet.save('${OUT}/sheet.png')
print('sheet ok', sheet.size)
`
  await fs.writeFile(
    path.join(OUT, 'list.json'),
    JSON.stringify(results.map((r) => ({ topic: r.topic, png: path.join(OUT, `${r.topic}.png`) })))
  )
  const { execFileSync } = await import('node:child_process')
  await fs.writeFile(path.join(OUT, 'sheet.py'), py)
  try {
    execFileSync('python3', [path.join(OUT, 'sheet.py')], { stdio: 'inherit' })
  } catch (e) {
    console.log('拼图失败（不影响单张）：', String(e).slice(0, 120))
  }
}
console.log(`\n产出目录：${OUT}`)
