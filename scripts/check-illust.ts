/**
 * TASKS/12 校验：两遍导演（定画法 → 出图 → 回读数字 → 按图排版）从净化一路走到 .pptx。
 *
 * 分六段，任何一段不过就非零退出：
 *   A 第一遍净化（离线）——抽象页强制不画、中文 brief 拒收、>25 词截断、
 *                          相邻两张一左一右、allow 用完即止
 *   B 回读数字（离线）——主体包围盒 / 四象限 / 非纸色比 / 边缘密度 / 带字判废，
 *                        边带归一与 3% 羽化，水印补丁不裁切
 *   C 第二遍净化（离线）——文字一律落在实测更空的那半边、画占版 >55% 时 items 降到 1–2、
 *                          无画页必挑五档版式且相邻不同、无画页不许删字
 *   D 导出（离线）——artSide 左/右各自落在镜像坐标上、正文不压图、无画页有版式记号
 *   E 全链路（离线，打桩）——两遍都成功、二次 0 调用、换课题立刻重画
 *   F 真跑（ILLUST_LIVE=1，约 1.2 元）——回执五个数
 *
 * 为什么 E 要打桩：真跑一次只证明「这次运气好」，打桩才能把「两遍各 1 次调用、
 * 同一教案第二次 0 次」变成每次 CI 都跑得起的硬断言。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
import { limitsFor } from '../src/lib/scale'
import { buildStudentSlides, getBuiltinStudentSlides, validateSlides, type StudentSlide } from '../src/lib/slides'
import { artBox, downloadPptx } from '../src/lib/pptx'
import { DEFAULT_THEME } from '../src/lib/theme'
import {
  DECK_LAYOUTS,
  allowFor,
  directorCalls,
  directorReport,
  isAbstractSlide,
  runDeckDirector,
  sanitizeDirect,
  sanitizeTypeset,
  type DirectPlan,
  type DirectorSlide,
  type TextLayout,
  type TypesetPlan,
} from '../src/lib/director'
import { directorCache, illustCache } from '../src/lib/deckStore'
import { measureImage, measureArt, mirrorArt, normalizeArt, type ArtNumbers } from '../src/lib/inspect'
import {
  DEFAULT_ILLUST,
  ILLUST_MAX,
  ILLUST_MODEL,
  illustCalls,
  illustCountFor,
  type IllustCache,
} from '../src/lib/illustrate'
import { bytesToDataUrl, decodePng, encodePng, isPng, stripWatermark, type RgbaImage } from '../src/lib/watermark'

const OUT_DIR = '/tmp/yike-check-director'
const KEEP_DIR = '/tmp/yike-sangao-director'
const errs: string[] = []

function fail(msg: string): void {
  errs.push(msg)
}

function ok(msg: string, detail = ''): void {
  console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
}

function unzip(entry: string, file: string): string {
  return execFileSync('/usr/bin/unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function entries(file: string): string[] {
  return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.endsWith('/'))
}

function mediaEntries(file: string): string[] {
  return entries(file).filter((e) => /^ppt\/media\/[^/]+$/.test(e))
}

/* ------------------------------ 合成图 ------------------------------ */

const PAPER: [number, number, number] = [250, 248, 243]

/** 一张 1024×576 的「水彩」：纸色底 + 半边一团暖色主体，可选一段中性深色小块（冒充字） */
function artImage(side: 'left' | 'right', span: number, glyph = false): RgbaImage {
  const width = 1024
  const height = 576
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      pixels[i] = PAPER[0]
      pixels[i + 1] = PAPER[1]
      pixels[i + 2] = PAPER[2]
      pixels[i + 3] = 255
    }
  }
  // 主体：贴着 side 那一侧的边上，span=0.5 小画 / span=1 大画（占版 >55%）
  const wFrac = span <= 0.5 ? 0.37 : 0.69
  const hFrac = span <= 0.5 ? 0.5 : 0.83
  const from = side === 'left' ? Math.round(width * 0.05) : Math.round(width * (0.95 - wFrac))
  const to = from + Math.round(width * wFrac)
  const yFrom = Math.round(height * ((1 - hFrac) / 2))
  const yTo = yFrom + Math.round(height * hFrac)
  for (let y = yFrom; y < yTo; y++) {
    for (let x = from; x < to; x++) {
      const edge = x === from || x === to - 1 || y === yFrom || y === yTo - 1
      const i = (y * width + x) * 4
      // 暖色（不是中性色），边缘略深模拟描线
      pixels[i] = edge ? 96 : 150
      pixels[i + 1] = edge ? 70 : 118
      pixels[i + 2] = edge ? 52 : 86
    }
  }
  if (glyph) {
    // 在中线上排一段「字」：中性深色小笔画，密度远高于水彩
    const gy = Math.round(height * 0.46)
    for (let y = gy; y < gy + 40; y++) {
      for (let x = 300; x < 740; x++) {
        if ((x - 300) % 18 > 12) continue
        const i = (y * width + x) * 4
        pixels[i] = 38
        pixels[i + 1] = 38
        pixels[i + 2] = 38
      }
    }
  }
  return { width, height, pixels }
}

/** 旧水印用例那张：右下角四条浅灰短横 */
function watermarkedImage(): RgbaImage {
  const width = 256
  const height = 144
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      pixels[i] = 196 + Math.round((x / width) * 24)
      pixels[i + 1] = 206 + Math.round((y / height) * 20)
      pixels[i + 2] = 186 + Math.round(((x + y) / (width + height)) * 18)
      pixels[i + 3] = 255
      const inMark = x > width * 0.84 && x < width * 0.97 && y > height * 0.86 && y < height * 0.94
      if (inMark && Math.round(y / 3) % 2 === 0) {
        pixels[i] = 150
        pixels[i + 1] = 150
        pixels[i + 2] = 150
      }
    }
  }
  return { width, height, pixels }
}

function stats(img: RgbaImage, x0: number, y0: number): { mean: number; sd: number } {
  const xs = Math.floor(img.width * x0)
  const ys = Math.floor(img.height * y0)
  const vals: number[] = []
  for (let y = ys; y < img.height; y++) {
    for (let x = xs; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      vals.push((img.pixels[i] + img.pixels[i + 1] + img.pixels[i + 2]) / 3)
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length))
  return { mean, sd }
}

async function dataUrlOf(img: RgbaImage): Promise<string> {
  return bytesToDataUrl(await encodePng(img))
}

/* --------------------------------- A 段 --------------------------------- */

/** A 段用的假页面：覆盖「抽象页 / 字词页 / 精读页 / 结尾页」 */
const A_SLIDES: DirectorSlide[] = [
  { kind: 'cover', title: '桂花雨', line: '琦君' },
  { kind: 'hook', title: '你闻过桂花吗', line: '一树的香，从哪儿来？' },
  { kind: 'goals', title: '这一课做三件事', items: ['读通全文', '找出摇花的段落'] },
  { kind: 'words', title: '字词关', items: ['桂花', '糕饼', '缠着'] },
  { kind: 'close-read', title: '摇花乐', line: '“摇桂花”是我最盼的事。' },
  { kind: 'drill', title: '数一数', line: '12 + 7 = ?' },
  { kind: 'board', title: '板书', items: ['桂花雨', '摇花乐', '思乡情'] },
  { kind: 'homework', title: '作业', items: ['抄写生字', '读给家长听'] },
  { kind: 'end', title: '下课', line: '把这一句读给同桌听。' },
]

function sectionA(): void {
  const good = (i: number, empty: 'left' | 'right') => ({
    i,
    draw: true,
    brief: `a child standing under a tall tree looking up, subject occupies the ${empty === 'left' ? 'right' : 'left'} half, wide empty space on the ${empty}`,
    empty,
    why: '试',
  })
  const long = Array.from({ length: 30 }, (_, k) => `word${k}`).join(' ')
  const plan = sanitizeDirect(
    {
      look: 'one child, one osmanthus branch',
      pages: [
        good(0, 'left'),
        good(1, 'right'),
        { i: 2, draw: true, brief: 'a child writing at a desk', empty: 'left', why: '目标页' },
        { i: 4, draw: true, brief: '一个小女孩站在桂花树下抬头看', empty: 'left', why: '中文' },
        { i: 5, draw: true, brief: 'a child with the words 桂花 on a board', empty: 'right', why: '带字' },
        { i: 6, draw: true, brief: long, empty: 'left', why: '超长' },
        good(7, 'left'),
        { i: 7, draw: true, brief: 'duplicate page should be ignored', empty: 'right', why: '重复' },
        { i: 8, draw: true, brief: 'a girl waving goodbye by a wooden door', empty: 'left', why: '结尾' },
        { i: 99, draw: true, brief: 'out of range page', empty: 'right', why: '越界' },
      ],
    },
    { slides: A_SLIDES, allow: 4 }
  )

  if (plan.pages.length !== A_SLIDES.length) fail(`A 净化：pages 应逐页给 ${A_SLIDES.length} 条，实得 ${plan.pages.length}`)
  const drawn = plan.pages.filter((p) => p.draw)
  /* TASKS/20b 追加口径：封面永远画，且不占 allow —— 内页仍是 allow 张，封面另加一张 */
  const coverDrawn = drawn.filter((p) => A_SLIDES[p.i]?.kind === 'cover').length
  if (coverDrawn !== 1) fail(`A 净化：封面必须画一张（实得 ${coverDrawn} 张）`)
  if (drawn.length - coverDrawn > 4) fail(`A 净化：allow=4，内页实际画了 ${drawn.length - coverDrawn} 页`)
  for (const i of [2, 3]) {
    if (plan.pages[i]?.draw) fail(`A 净化：第 ${i + 1} 页是抽象页 / 字词页，不该画`)
  }
  // 同一页写了两次：只认前一条（后一条是「duplicate page should be ignored」）
  if (plan.pages[7].draw && !/subject occupies/.test(plan.pages[7].brief)) {
    fail('A 净化：重复页取了后一条 brief')
  }
  const cjk = plan.pages.find((p) => /[\u3400-\u9fff]/.test(p.brief))
  if (cjk) fail(`A 净化：第 ${cjk.i + 1} 页的 brief 还带着中文`)
  const withText = plan.pages.find((p) => /\bwords?\b/i.test(p.brief))
  if (withText) fail(`A 净化：第 ${withText.i + 1} 页的 brief 还在要求画面出现字`)
  for (const p of drawn) {
    const words = p.brief.trim().split(/\s+/)
    if (words.length > 25) fail(`A 净化：第 ${p.i + 1} 页 brief ${words.length} 词，超过 25`)
  }
  for (let k = 1; k < drawn.length; k++) {
    if (drawn[k].empty === drawn[k - 1].empty) {
      fail(`A 净化：第 ${drawn[k - 1].i + 1} 页与第 ${drawn[k].i + 1} 页留白撞在同一边`)
    }
  }
  if (drawn.length === 0) fail('A 净化：一页都没画，用例本身写坏了')
  ok(
    'A 第一遍净化',
    `${drawn.length} 张（allow 4）| 抽象页/重复页/越界页全部拒收 | 中文 brief 与「要求写字」拒收 | ≤25 词 | 留白左右交替`
  )
}

/* --------------------------------- B 段 --------------------------------- */

async function sectionB(): Promise<void> {
  // 一、小画靠右 → 空在左
  const small = measureImage(artImage('right', 0.5), '#faf8f3')
  if (small.empty !== 'left') fail(`B 回读：主体靠右时 empty 应为 left，实得 ${small.empty}`)
  if (!(small.subjectArea > 0.05 && small.subjectArea < 0.55)) {
    fail(`B 回读：小画主体占版应落在 (0.05, 0.55)，实得 ${small.subjectArea.toFixed(2)}`)
  }
  if (!(small.ink > 0.05)) fail(`B 回读：非纸色像素比 ${(small.ink * 100).toFixed(1)}%，太小`)
  if (small.textRisk) fail('B 回读：干净的水彩被误判成带字')

  // 二、大画靠左 → 空在右，且占版 >55%（第二遍据此压条目）
  const big = measureImage(artImage('left', 1), '#faf8f3')
  if (big.empty !== 'right') fail(`B 回读：主体靠左时 empty 应为 right，实得 ${big.empty}`)
  if (!(big.subjectArea > 0.55)) {
    fail(`B 回读：大画占版应 >0.55，实得 ${big.subjectArea.toFixed(2)}`)
  }

  // 三、同样一张图，多一段中性深色小笔画 → 判带字
  const dirty = measureImage(artImage('right', 0.5, true), '#faf8f3')
  if (!dirty.textRisk) fail('B 回读：塞进去的一行深色小字没被判出来')
  if (!(dirty.edge >= small.edge)) fail('B 回读：带字图的边缘密度没涨')
  if (!(small.glyph < 1500 && dirty.glyph >= 1500)) {
    fail(`B 回读：带字判据的两边没拉开（干净 ${small.glyph} / 带字 ${dirty.glyph}）`)
  }

  // 四、边带归纸 + 3% 羽化：蓝边被吸成纸色，画面中心一个像素不动
  const bluish = artImage('right', 0.5)
  for (let x = 0; x < bluish.width; x++) {
    for (let d = 0; d < 4; d++) {
      for (const y of [d, bluish.height - 1 - d]) {
        const i = (y * bluish.width + x) * 4
        bluish.pixels[i] = 120
        bluish.pixels[i + 1] = 150
        bluish.pixels[i + 2] = 220
      }
    }
  }
  const centerBefore = (() => {
    const i = (Math.floor(bluish.height / 2) * bluish.width + Math.floor(bluish.width * 0.7)) * 4
    return [bluish.pixels[i], bluish.pixels[i + 1], bluish.pixels[i + 2]]
  })()
  const normalized = await normalizeArt(await dataUrlOf(bluish), '#faf8f3')
  const after = await measureArt(normalized, '#faf8f3')
  if (!after) fail('B 归纸：归一后的图读不回来')
  const back = await measureArt(await dataUrlOf(bluish), '#faf8f3')
  if (back?.empty !== 'left') fail('B 归纸：用例本身写坏了（未归一时 empty 不是 left）')
  const edgePixel = await (async () => {
    const img = await decodePng(Uint8Array.from(atob(normalized.split(',')[1]), (c) => c.charCodeAt(0)))
    if (!img) return null
    const i = (0 * img.width + 0) * 4
    return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]]
  })()
  if (!edgePixel) fail('B 归纸：归一后的 PNG 解不开')
  else {
    const dist = Math.hypot(edgePixel[0] - PAPER[0], edgePixel[1] - PAPER[1], edgePixel[2] - PAPER[2])
    if (dist > 4) fail(`B 归纸：角上的边带没化成纸色（距纸色 ${dist.toFixed(1)}）`)
  }
  const mid = after && (await (async () => {
    const img = await decodePng(Uint8Array.from(atob(normalized.split(',')[1]), (c) => c.charCodeAt(0)))
    if (!img) return null
    const i = (Math.floor(img.height / 2) * img.width + Math.floor(img.width * 0.7)) * 4
    return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]]
  })())
  if (mid && mid.join(',') !== centerBefore.join(',')) {
    fail(`B 归纸：画面中心被改动了（${centerBefore.join(',')} → ${mid.join(',')}）`)
  }

  // 五、水印补丁：抹完变平、尺寸不变、非 PNG 原样返回
  const raw = watermarkedImage()
  const before = stats(raw, 0.82, 0.78)
  const stripped = await stripWatermark(await dataUrlOf(raw))
  const out = await decodePng(Uint8Array.from(atob(stripped.split(',')[1]), (c) => c.charCodeAt(0)))
  if (!out) fail('B 水印：抹完解不回 PNG')
  else {
    if (out.width !== raw.width || out.height !== raw.height) {
      fail(`B 水印：尺寸被改了（${raw.width}×${raw.height} → ${out.width}×${out.height}）`)
    }
    const afterMark = stats(out, 0.82, 0.78)
    if (afterMark.sd > 6) fail(`B 水印：右下角补完仍不平（标准差 ${afterMark.sd.toFixed(2)}）`)
    if (Math.abs(afterMark.mean - before.mean) > 40) fail('B 水印：补丁把颜色洗掉了')
  }
  const passthrough = 'data:image/jpeg;base64,AAAA'
  if ((await stripWatermark(passthrough)) !== passthrough) fail('B 水印：不是 PNG 时应原样返回')

  // 六、镜像：翻面后留白换边、尺寸不变（相邻两页撞边时靠它换边，不删页）
  const mirrored = await measureArt(await mirrorArt(await dataUrlOf(artImage('right', 0.5))), '#faf8f3')
  if (!mirrored) fail('B 镜像：翻过面的图读不回来')
  else if (mirrored.empty !== 'right') fail(`B 镜像：翻面后留白应在 right，实得 ${mirrored.empty}`)

  ok(
    'B 回读数字',
    `小画 empty=${small.empty} 占版 ${(small.subjectArea * 100).toFixed(0)}% glyph ${small.glyph} | 大画 empty=${big.empty} 占版 ${(big.subjectArea * 100).toFixed(0)}% | 带字判废 ${dirty.textRisk}（glyph ${dirty.glyph}） | 边带归纸 + 3% 羽化 | 水印补完标准差 ${before.sd.toFixed(1)}→${stats(out ?? raw, 0.82, 0.78).sd.toFixed(1)}`
  )
}

/* --------------------------------- C 段 --------------------------------- */

function sectionC(): void {
  const slides: DirectorSlide[] = [
    { kind: 'cover', title: '桂花雨', line: '琦君' },
    { kind: 'close-read', title: '摇花乐', line: '“摇桂花”是我最盼的事。', items: ['a', 'b', 'c', 'd'] },
    { kind: 'goals', title: '这一课做三件事', items: ['读通全文', '找出摇花段落', '背一句'] },
    { kind: 'words', title: '字词关', items: ['桂花', '糕饼', '缠着'] },
    { kind: 'board', title: '板书', line: '桂花雨', items: ['摇花乐'] },
    { kind: 'end', title: '下课', line: '把这一句读给同桌听。' },
    // 第 7 页：整页只有一条问句，第二遍想把它删了（真跑踩过的坑）
    { kind: 'close-read', title: '真像下雨', items: ['为什么这里要用“喊”？'] },
  ]
  const direct: DirectPlan = {
    look: 'one child, one osmanthus branch',
    pages: slides.map((s, i) => ({
      i,
      draw: i === 1 || i === 4 || i === 6,
      brief: 'a child under a tree',
      empty: i === 1 || i === 6 ? 'left' : 'right',
      why: '',
    })),
  }
  // 实测：第 2 页画占版 70%（压条目）、空在左；第 5 页占版 30%、空在右
  const nums = new Map<number, ArtNumbers>([
    [
      1,
      {
        subjectW: 0.9,
        subjectH: 0.8,
        subjectArea: 0.7,
        quad: { tl: 0.2, tr: 0.9, bl: 0.2, br: 0.9 },
        ink: 0.4,
        edge: 0.1,
        glyph: 120,
        textRisk: false,
        empty: 'left',
      },
    ],
    [
      4,
      {
        subjectW: 0.4,
        subjectH: 0.5,
        subjectArea: 0.3,
        quad: { tl: 0.9, tr: 0.2, bl: 0.9, br: 0.2 },
        ink: 0.2,
        edge: 0.06,
        glyph: 80,
        textRisk: false,
        empty: 'right',
      },
    ],
    // 第 7 页：大画 + 空在左
    [
      6,
      {
        subjectW: 0.9,
        subjectH: 0.8,
        subjectArea: 0.7,
        quad: { tl: 0.2, tr: 0.9, bl: 0.2, br: 0.9 },
        ink: 0.4,
        edge: 0.1,
        glyph: 120,
        textRisk: false,
        empty: 'left',
      },
    ],
  ])
  const plan = sanitizeTypeset(
    {
      pages: [
        // 模型故意全写错：textSide 全写 left、items 一律 3、版式全写 cards
        { i: 0, artSide: 'left', textSide: 'left', items: 3, drop: [], layout: 'cards' },
        { i: 1, artSide: 'left', textSide: 'left', items: 3, drop: ['a'], layout: 'cards' },
        { i: 2, artSide: 'left', textSide: 'left', items: 1, drop: ['读通全文'], layout: 'cards' },
        { i: 3, artSide: 'left', textSide: 'left', items: 3, drop: [], layout: 'cards' },
        { i: 4, artSide: 'left', textSide: 'left', items: 9, drop: [], layout: 'split' },
        { i: 5, artSide: 'left', textSide: 'left', items: 3, drop: [], layout: 'diagonal' },
        // 第 7 页：把整页唯一的问句当「多余」删掉，items 还写 0——问句必须被补回来
        { i: 6, artSide: 'left', textSide: 'left', items: 0, drop: ['为什么这里要用“喊”？'], layout: 'split' },
      ],
    },
    { slides, direct, nums }
  )

  const p1 = plan.pages[1]
  if (p1.textSide !== 'left' || p1.artSide !== 'right') {
    fail(`C 排版：第 2 页文字应落在实测的 left、图落 right，实得 ${p1.textSide}/${p1.artSide}`)
  }
  if (p1.items > 2) fail(`C 排版：画占版 70% 时 items 应 ≤2，实得 ${p1.items}`)
  const p4 = plan.pages[4]
  if (p4.textSide !== 'right' || p4.artSide !== 'left') {
    fail(`C 排版：第 5 页文字应落在实测的 right、图落 left，实得 ${p4.textSide}/${p4.artSide}`)
  }
  if (p4.items > 1) fail(`C 排版：第 5 页只有 1 条 items，不许凭空加，实得 ${p4.items}`)
  // 第 7 页：整页唯一一条是问句，第二遍点名要删、条数还写 0——问句必须还在，且至少留 1 条
  const p6 = plan.pages[6]
  if (p6.items < 1) fail(`C 排版：第 7 页的问句被删光了（items=${p6.items}）`)
  if (p6.drop.length > 0) fail(`C 排版：第 7 页唯一的那条问句被当成多余删掉了（drop=${p6.drop.join('/')}）`)

  // 无画的页：条目一条不许删，版式必须在五档里，相邻两页不许相同
  for (const i of [0, 2, 3, 5]) {
    const row = plan.pages[i]
    if (row.drop.length > 0) fail(`C 排版：第 ${i + 1} 页没有画却删了字`)
    if (row.items !== (slides[i].items ?? []).length) fail(`C 排版：第 ${i + 1} 页没有画，条目数被改了`)
    if (!(DECK_LAYOUTS as readonly string[]).includes(row.layout)) {
      fail(`C 排版：第 ${i + 1} 页选了不存在的版式 ${row.layout}`)
    }
  }
  let last: TextLayout | null = null
  for (const i of [0, 2, 3, 5]) {
    const row = plan.pages[i]
    if (last && row.layout === last) fail(`C 排版：第 ${i + 1} 页和上一页版式撞了（都是 ${row.layout}）`)
    last = row.layout
  }
  // 抽象页也必须有版式：漏一页就是留一片空白
  if (plan.pages.length !== slides.length) fail(`C 排版：pages 应逐页给 ${slides.length} 条`)

  ok(
    'C 第二遍净化',
    `文字按实测空白侧落位（左/右各验一次）| 占版 70% → items ${p1.items} 条 | 无画页零删字、版式 ${plan.pages
      .filter((_, i) => [0, 2, 3, 5].includes(i))
      .map((p) => p.layout)
      .join('/')} 相邻不撞`
  )
}

/* --------------------------------- D 段 --------------------------------- */

const EMU = 914400

function sectionDxml(xml: string, want: Set<string>): { right: number; left: number } {
  const boxes = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => m[0])
  const content = boxes.filter((sp) =>
    [...sp.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].some((m) => want.has(m[1].trim()))
  )
  const geo = content.map((sp) => {
    const o = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(sp)
    const e = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(sp)
    return o && e ? { x: Number(o[1]) / EMU, right: (Number(o[1]) + Number(e[1])) / EMU } : null
  })
  return {
    right: Math.max(0, ...geo.map((g) => g?.right ?? 0)),
    left: Math.min(Infinity, ...geo.map((g) => g?.x ?? Infinity)),
  }
}

async function sectionD(): Promise<void> {
  const slides = getBuiltinStudentSlides(planForScale(guihuaYu, 240), limitsFor(undefined, 'clip', 240))
  if (slides.length < 6) {
    fail('D 导出：内置页面不够，用例写不下去')
    return
  }
  const art = await dataUrlOf(artImage('right', 0.5))
  const deck: StudentSlide[] = slides.map((s, i) => {
    if (i === 1) return { ...s, illustration: art, artSide: 'right', layout: 'split' }
    if (i === 3) return { ...s, illustration: art, artSide: 'left', layout: 'split' }
    if (i === 0) return { ...s, layout: 'timeline' }
    return s
  })
  const file = `${OUT_DIR}/director.pptx`
  rmSync(file, { force: true })
  await downloadPptx(deck, undefined, file, DEFAULT_THEME, { animated: false })

  const media = mediaEntries(file)
  if (media.length !== 2) fail(`D 导出：media 里应有 2 张插画，实得 ${media.length}`)

  const picOf = (page: number) => {
    const xml = unzip(`ppt/slides/slide${page}.xml`, file)
    const pic = /<p:pic>[\s\S]*?<\/p:pic>/.exec(xml)?.[0] ?? ''
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(pic)
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(pic)
    return { xml, x: off ? Number(off[1]) / EMU : NaN, y: off ? Number(off[2]) / EMU : NaN, cx: ext ? Number(ext[1]) / EMU : NaN }
  }

  const right = picOf(2)
  if (Math.abs(right.x - 6.45) > 0.001) fail(`D 导出：右图 x=${right.x.toFixed(3)}，应为 6.45`)
  if (Math.abs(right.y - 0.62) > 0.001) fail(`D 导出：右图 y=${right.y.toFixed(3)}，应为 0.62`)
  if (Math.abs(right.cx - 6.3) > 0.001) fail(`D 导出：右图宽 ${right.cx.toFixed(3)}，应为 6.30`)

  const left = picOf(4)
  if (Math.abs(left.x - artBox('left').art) > 0.001) {
    fail(`D 导出：左图 x=${left.x.toFixed(3)}，应为 ${artBox('left').art.toFixed(3)}`)
  }
  if (left.x > 1.0) fail(`D 导出：左图贴在了右边（x=${left.x.toFixed(3)}）`)
  if (Math.abs(left.cx - right.cx) > 0.001) fail('D 导出：左右两张图宽度不一样')
  if (/图位|去搜图/.test(left.xml)) fail('D 导出：左图那一页印着后台话术')

  // 文字不许压图：右图的页文字右边界 ≤ 6.45−0.35；左图的页文字左边界 ≥ 0.583+6.30+0.35
  const rWant = new Set([deck[1].title, ...(deck[1].items ?? []), deck[1].line ?? ''].filter(Boolean))
  const rBox = sectionDxml(right.xml, rWant)
  if (rBox.right > 6.45 - 0.35 + 0.001) fail(`D 导出：右图页文字压进图区（右边界 ${rBox.right.toFixed(2)}in）`)
  const lWant = new Set([deck[3].title, ...(deck[3].items ?? []), deck[3].line ?? ''].filter(Boolean))
  const lBox = sectionDxml(left.xml, lWant)
  if (lBox.left < 0.583 + 6.3 + 0.35 - 0.001) fail(`D 导出：左图页文字压进图区（左边界 ${lBox.left.toFixed(2)}in）`)

  // 无画的页必须有版式记号：timeline 会在纸面上留一颗朱点（ellipse）
  const cover = unzip('ppt/slides/slide1.xml', file)
  if (!/prst="ellipse"/.test(cover)) fail('D 导出：无画页的 timeline 版式没有落到纸面上（找不到椭圆记号）')

  for (let i = 0; i < deck.length; i++) {
    const xml = unzip(`ppt/slides/slide${i + 1}.xml`, file)
    if (/图位|去搜图/.test(xml)) fail(`D 导出：第 ${i + 1} 页还印着后台话术`)
  }

  ok(
    'D 导出',
    `右图 (6.45, 0.62) 6.30in | 左图 (${artBox('left').art.toFixed(3)}, 0.62) 6.30in | 文字右 ${rBox.right.toFixed(
      2
    )}in / 左 ${lBox.left.toFixed(2)}in | 无画页版式记号落地 | 无「图位」`
  )
}

/* --------------------------------- E 段 --------------------------------- */

interface MockCounts {
  chat: number
  image: number
  direct: number
  typeset: number
}

interface PlanEntry {
  direct: DirectPlan
  typeset: TypesetPlan
}

/** 打桩：chat 按 system 分辨第一遍 / 第二遍，image 按 brief 里的留白侧画图 */
function mockFetch(counts: MockCounts, sizes: Map<string, number>) {
  /** 内页图的序号（封面不算：「第 1、3 张大画」说的是内页，别被封面顶掉） */
  let innerSeq = 0
  return async (url: string, init?: RequestInit): Promise<unknown> => {
    if (url.includes('/images/generations')) {
      counts.image += 1
      const prompt = String((JSON.parse(String(init?.body ?? '{}')) as { prompt?: string }).prompt ?? '')
      /* 封面由净化器兜底补进来，brief 就是 COVER_BRIEF：它铺满整页，不算「大画压条」那一类 */
      const isCover = /wide establishing scene of this lesson/i.test(prompt)
      if (!isCover) innerSeq += 1
      const empty = /wide empty space on the left/.test(prompt)
        ? 'left'
        : /wide empty space on the right/.test(prompt)
          ? 'right'
          : 'left'
      const span = isCover ? 0.2 : sizes.get(`img${innerSeq}`) ?? 0.5
      const img = artImage(empty === 'left' ? 'right' : 'left', span)
      const b64 = (await dataUrlOf(img)).split(',')[1]
      return { ok: true, status: 200, json: async () => ({ images: [{ b64_json: b64 }] }), text: async () => '' }
    }
    if (url.includes('/chat/completions')) {
      counts.chat += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: { role: string; content: string }[] }
      const system = body.messages?.find((m) => m.role === 'system')?.content ?? ''
      const user = JSON.parse(body.messages?.find((m) => m.role === 'user')?.content ?? '{}') as {
        pages?: { i: number; kind: string; title: string; line?: string; items?: string[] }[]
      }
      const pages = user.pages ?? []
      if (system.includes('导演')) {
        counts.direct += 1
        const picks: number[] = []
        /* 封面不参与挑页：它由净化器兜底补一张，额度是「内页 allow + 封面 1」 */
        const free = pages.filter(
          (p) => p.kind !== 'cover' && !isAbstractSlide({ ...p, line: p.line ?? '', items: p.items ?? [] })
        )
        // 出图按页序走，第 1、3 张是大画：从第一个「条目 ≥3」的页起往后挑，
        // 大画才压得到条（16 页后这种页只剩字词关一页，不绕就会挑中封面/两条页，规则验空）
        const start = Math.max(0, free.findIndex((p) => (p.items ?? []).length >= 3))
        const ordered = [...free.slice(start), ...free.slice(0, start)]
        const step = Math.max(1, Math.floor(ordered.length / 6))
        for (let k = 0; k < 6 && k * step < ordered.length; k++) picks.push(ordered[k * step].i)
        const out = pages.map((p) => ({ i: p.i, draw: false, brief: '', empty: 'left', why: '' }))
        picks.forEach((i, k) => {
          const empty = k % 2 === 0 ? 'left' : 'right'
          out[i] = {
            i,
            draw: true,
            brief: `one child under an osmanthus branch, subject occupies the ${
              empty === 'left' ? 'right' : 'left'
            } half, wide empty space on the ${empty}`,
            empty,
            why: '试',
          } as never
        })
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ pages: out, look: 'one child, one osmanthus branch' }) } }],
          }),
          text: async () => '',
        }
      }
      counts.typeset += 1
      // 故意全写错：版式全 cards（相邻会撞）、textSide 全 left、items 一律 3
      const out = pages.map((p) => ({
        i: p.i,
        artSide: 'left',
        textSide: 'left',
        items: 3,
        drop: [],
        layout: 'cards',
      }))
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ pages: out }) } }] }),
        text: async () => '',
      }
    }
    throw new Error(`打桩没覆盖这个请求：${url}`)
  }
}

function planCache() {
  const store = new Map<string, PlanEntry>()
  return {
    async load(key: string): Promise<PlanEntry | null> {
      return store.get(key) ?? null
    },
    async save(key: string, value: PlanEntry): Promise<void> {
      store.set(key, value)
    },
  }
}

function artCache() {
  const store = new Map<string, Map<number, string>>()
  return {
    async load(fp: string) {
      return new Map(store.get(fp) ?? [])
    },
    async save(fp: string, index: number, dataUrl: string) {
      const one = store.get(fp) ?? new Map<number, string>()
      one.set(index, dataUrl)
      store.set(fp, one)
    },
  }
}

async function sectionE(): Promise<void> {
  const plan = planForScale(guihuaYu, 2400)
  const slides = getBuiltinStudentSlides(plan, limitsFor(undefined, 'lesson', 2400))
  if (slides.length === 0) {
    fail('E 全链路：取不到内置页面')
    return
  }
  const counts: MockCounts = { chat: 0, image: 0, direct: 0, typeset: 0 }
  // 第 1、3 张画大一点（占版 >55%），用来验「画占大半版就把条目压到 1–2 条」
  const sizes = new Map([['img1', 1], ['img3', 1]])
  const original = globalThis.fetch
  globalThis.fetch = mockFetch(counts, sizes) as unknown as typeof fetch
  const cache = { plan: planCache(), art: artCache() }
  const cfg = {
    llm: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-mock', model: 'deepseek-chat' },
    image: { ...DEFAULT_ILLUST, apiKey: 'sf-mock', engine: 'photo' as const },
  }
  const meta = {
    topic: plan.meta.topic,
    grade: plan.meta.grade,
    subject: plan.meta.subject,
    duration: plan.meta.duration,
    allow: illustCountFor(plan.meta.duration),
    paper: () => '#faf8f3',
  }

  const callsBefore = { ...directorCalls() }
  const imageBefore = illustCalls()
  const first = await runDeckDirector({ slides, cfg, meta, cache })
  const firstDirect = directorCalls().direct - callsBefore.direct
  const firstTypeset = directorCalls().typeset - callsBefore.typeset
  const firstImages = illustCalls() - imageBefore
  const report = directorReport()

  if (!report.directOk || !report.typesetOk) fail('E 全链路：两遍导演没有都成功')
  if (firstDirect !== 1) fail(`E 全链路：第一遍应调用 1 次，实得 ${firstDirect}`)
  if (firstTypeset !== 1) fail(`E 全链路：第二遍应调用 1 次，实得 ${firstTypeset}`)
  if (counts.chat !== 2) fail(`E 全链路：DeepSeek 应调用 2 次，实得 ${counts.chat}`)
  /* 张数口径（TASKS/20b 追加）：内页 allow 张 + 封面 1 张，封面不占额度 */
  const coverIdx = slides.findIndex((s) => s.kind === 'cover')
  const expectArt = meta.allow + (coverIdx >= 0 ? 1 : 0)
  if (firstImages !== expectArt) {
    fail(`E 全链路：应出 ${expectArt} 张图（内页 ${meta.allow} + 封面 ${coverIdx >= 0 ? 1 : 0}），实得 ${firstImages}`)
  }
  if (report.textFailed !== 0) fail(`E 全链路：带字判废了 ${report.textFailed} 张，不该有`)

  const illustrated = first.slides.filter((s) => s.illustration)
  if (illustrated.length !== expectArt) {
    fail(`E 全链路：带图页应 ${expectArt} 页，实得 ${illustrated.length}`)
  }
  if (coverIdx >= 0 && !first.slides[coverIdx]?.illustration) fail('E 全链路：封面没出图（封面必须画）')
  if (report.sides.left + report.sides.right !== illustrated.length) {
    fail('E 全链路：左右张数加起来不等于带图页数')
  }
  if (report.sides.left === 0 || report.sides.right === 0) {
    fail(`E 全链路：左右各应至少一张，实得 左 ${report.sides.left} / 右 ${report.sides.right}`)
  }
  // 相邻两张图必须一左一右（实测撞了就翻面，不删页）
  const arts = first.slides.filter((s) => s.illustration)
  for (let k = 1; k < arts.length; k++) {
    if (arts[k].artSide === arts[k - 1].artSide) fail('E 全链路：相邻两页的图落在同一边')
  }

  // 第二遍故意把版式全写 cards：净化后相邻无画页必须各不相同
  let lastLayout: string | null = null
  for (const s of first.slides) {
    if (s.illustration) {
      if (s.layout !== 'split') fail('E 全链路：带图页的版式应为 split')
      continue
    }
    if (!(DECK_LAYOUTS as readonly string[]).includes(String(s.layout))) {
      fail(`E 全链路：无画页缺版式（${String(s.layout)}）`)
    }
    if (lastLayout && s.layout === lastLayout) fail(`E 全链路：相邻两页版式撞了（${String(s.layout)}）`)
    lastLayout = String(s.layout)
  }

  // 两遍之间 items 被改动的页数：报告的数必须与逐页对比一致
  let changed = 0
  first.slides.forEach((s, i) => {
    const before = (slides[i].items ?? []).map(String).join('\u0001')
    const after = (s.items ?? []).map(String).join('\u0001')
    if (before !== after) changed += 1
  })
  if (report.itemsChanged !== changed) {
    fail(`E 全链路：报告改了 ${report.itemsChanged} 页，逐页对比是 ${changed} 页`)
  }
  // 画占大半版（实测 subjectArea >55%）的页必须压到 1–2 条；小画页不受此限。
  // 逐页回读实测认定大画，不按页序猜——内置稿 16 页后打桩挑中的页会变，
  // 只有第 1、3 张图是大画，其余四张是小画，小画页留 3 条是合法的。
  const trimmed: string[] = []
  let bigWithItems = 0
  for (let i = 0; i < first.slides.length; i++) {
    const s = first.slides[i]
    if (!s.illustration) continue
    const before = (slides[i].items ?? []).length
    const n = await measureArt(s.illustration, '#faf8f3')
    if ((n?.subjectArea ?? 0) <= 0.55) continue
    if (before >= 3) bigWithItems += 1
    if (before >= 3 && (s.items ?? []).length > 2)
      trimmed.push(`「${s.title}」${before}→${(s.items ?? []).length} 条`)
  }
  if (bigWithItems === 0) fail('E 全链路：打桩没挑中「大画 + 3 条以上」的页，压条规则没被验到')
  if (trimmed.length > 0)
    fail(`E 全链路：画占大半版时还有 ${trimmed.length} 页留着 3 条以上（${trimmed.join('；')}）`)
  // 第二遍不准把一页唯一的那条问句删光（真跑踩过的坑：删完导出被 validateSlides 退回）
  const lostAsk = first.slides.filter((s, i) => {
    const had = (slides[i].items ?? []).some((t) => /[？?]/.test(String(t)))
    if (!had) return false
    return ![...(s.items ?? []).map(String), String(s.line ?? '')].some((t) => /[？?]/.test(t))
  })
  if (lostAsk.length > 0) fail(`E 全链路：有 ${lostAsk.length} 页的问句被第二遍删光了`)
  // 每一页都得能导出：拿同一份 limits 跑一遍 validateSlides
  const check = validateSlides(first.slides, limitsFor(undefined, 'lesson', plan.meta.duration))
  if (!check.ok) fail(`E 全链路：导演后的页面过不了导出校验（${check.problems[0]}）`)

  // 同一教案第二次：0 次 API 调用，带图页与图本身一模一样
  const againBefore = { ...directorCalls() }
  const imageAgain = illustCalls()
  const fetchAgain = counts.chat + counts.image
  const again = await runDeckDirector({ slides, cfg, meta, cache })
  const againCalls =
    directorCalls().direct - againBefore.direct + (directorCalls().typeset - againBefore.typeset)
  const againImages = illustCalls() - imageAgain
  if (againCalls !== 0) fail(`E 全链路：同一教案二次导出又发了 ${againCalls} 次 DeepSeek 请求`)
  if (againImages !== 0) fail(`E 全链路：同一教案二次导出又发了 ${againImages} 次生图请求`)
  if (counts.chat + counts.image !== fetchAgain) fail('E 全链路：二次导出仍在打接口')
  const sameArt = again.slides.every((s, i) => s.illustration === first.slides[i].illustration)
  if (!sameArt) fail('E 全链路：二次导出拿到的不是同一批图')

  // 换课题：钥匙变了，立刻重画（2 次 DeepSeek）
  const beforeNewTopic = { ...directorCalls() }
  await runDeckDirector({ slides, cfg, meta: { ...meta, topic: `${meta.topic}·另一课` }, cache })
  const newTopicCalls =
    directorCalls().direct - beforeNewTopic.direct + (directorCalls().typeset - beforeNewTopic.typeset)
  if (newTopicCalls !== 2) fail(`E 全链路：换了课题应重新调用 2 次，实得 ${newTopicCalls}`)

  globalThis.fetch = original
  ok(
    'E 全链路（打桩）',
    `DeepSeek 2 次都成功（direct 1 / typeset 1）| 出图 ${firstImages} 张 | 左 ${report.sides.left} / 右 ${report.sides.right} | items 改动 ${report.itemsChanged} 页 | 大画压条验 ${bigWithItems} 页 | 二次导出 0 调用 | 换课题重画 2 次`
  )
}

/* --------------------------------- F 段 --------------------------------- */

function envFile(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const raw = execFileSync('/bin/cat', ['.env.local'], { encoding: 'utf8' })
    for (const line of raw.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m) out[m[1]] = m[2].trim()
    }
  } catch {
    /* 没有 .env.local 就空手而归，下面会报缺 Key */
  }
  return out
}

async function sectionF(): Promise<number> {
  const env = envFile()
  // TASKS/13：key 归服务端（SILICONFLOW_API_KEY），旧名只作回退——真跑脚本不进产物，两把都认
  const imageKey = env.SILICONFLOW_API_KEY ?? env.VITE_SILICONFLOW_API_KEY ?? ''
  // 真跑优先用 DeepSeek 官方 Key；没有就走硅基流动上的 DeepSeek-V3（同一个模型）
  const deepseekKey = env.VITE_DEEPSEEK_API_KEY ?? ''
  const llm = deepseekKey
    ? { baseUrl: env.VITE_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', apiKey: deepseekKey, model: 'deepseek-chat' }
    : {
        baseUrl: env.VITE_SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1',
        apiKey: imageKey,
        model: 'deepseek-ai/DeepSeek-V3',
      }
  if (!imageKey) {
    fail('F 真跑：.env.local 里没有 SILICONFLOW_API_KEY（旧名 VITE_SILICONFLOW_API_KEY 也认）')
    return 0
  }
  if (!llm.apiKey) {
    fail('F 真跑：既没有 VITE_DEEPSEEK_API_KEY，也没有 SILICONFLOW_API_KEY')
    return 0
  }
  console.log(`  真跑模型：${llm.model} @ ${llm.baseUrl}`)

  const duration = 2400
  const plan = planForScale(guihuaYu, duration)
  // 导出校验按这一叠自己的档位走：40 分钟是 22–28 页，不能用 clip 的 10–14
  const limits = limitsFor(undefined, 'lesson', duration)
  mkdirSync(KEEP_DIR, { recursive: true })

  const before = { ...directorCalls() }
  const imageBefore = illustCalls()
  const slides = await buildStudentSlides(
    plan,
    {
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      imageKey,
    },
    { onFallback: (why) => console.log(`  学生版回退：${why}`), paper: () => '#faf8f3' }
  )
  const report = directorReport()
  const direct = directorCalls().direct - before.direct
  const typeset = directorCalls().typeset - before.typeset
  const images = illustCalls() - imageBefore

  if (!report.directOk) fail('F 真跑：第一遍没有成功')
  if (!report.typesetOk) fail('F 真跑：第二遍没有成功')
  if (direct !== 1 || typeset !== 1) fail(`F 真跑：两遍应各 1 次，实得 ${direct} / ${typeset}`)
  for (const f of report.failures) console.log(`  失败：第 ${f.page} 页 — ${f.error}`)
  const eligible = slides.filter((s) => !isAbstractSlide(s)).length
  console.log(
    `  导演：可画页 ${eligible} / 额度 ${allowFor(duration)} | 模型圈 ${report.asked} 页 → 净化后 ${report.planned} 页 → 成图 ${report.drawn} 页 | 带字判废 ${report.textFailed} 页 | 生图请求 ${images} 次`
  )

  const illustrated = slides.map((s, i) => (s.illustration ? i + 1 : 0)).filter(Boolean)
  // 导出一手：先自查一遍，报红时把那一页的现状与内置原样一起摊开
  const selfCheck = validateSlides(slides, limits)
  if (!selfCheck.ok) {
    const base = getBuiltinStudentSlides(plan, limits)
    for (const p of selfCheck.problems) {
      const hit = /^第 (\d+) 页/.exec(p)
      const at = hit ? Number(hit[1]) - 1 : -1
      fail(`F 真跑：${p}`)
      if (at < 0) continue
      const s = slides[at]
      const b = base[at]
      console.log(
        `  第 ${at + 1} 页：画 ${s.illustration ? '有' : '无'} / 版式 ${String(s.layout)} / items ${
          (s.items ?? []).length
        } 条 | 内置原样 items ${(b?.items ?? []).length} 条\n` +
          `    现：${JSON.stringify({ title: s.title, line: s.line, items: s.items })}\n` +
          `    原：${JSON.stringify({ title: b?.title, line: b?.line, items: b?.items })}`
      )
    }
  }
  const file = `${OUT_DIR}/live.pptx`
  rmSync(file, { force: true })
  const exportBefore = illustCalls()
  await downloadPptx(slides, undefined, file, DEFAULT_THEME, { animated: false, limits })
  const exportCalls = illustCalls() - exportBefore

  // 带字复核：把真正进 .pptx 的每张图再量一遍
  let withText = 0
  for (const entry of mediaEntries(file).filter((e) => /\.(png|jpe?g)$/i.test(e))) {
    const bytes = execFileSync('/usr/bin/unzip', ['-p', file, entry], { maxBuffer: 64 * 1024 * 1024 })
    const raw = new Uint8Array(bytes)
    if (!isPng(raw)) continue
    const nums = await measureArt(bytesToDataUrl(raw), '#faf8f3')
    if (nums?.textRisk) withText += 1
  }
  if (withText > 0) fail(`F 真跑：进 .pptx 的图里有 ${withText} 张带字`)

  // 二次导出：0 调用。App 里第二次导出复用的就是手里这一叠，不会再走一遍课件生成，
  // 所以这里也只重跑导演那一段（与 withDirector 同一份入参），并把整段 fetch 计一层数。
  const againBefore = { ...directorCalls() }
  const againImage = illustCalls()
  const realFetch = globalThis.fetch
  let netCalls = 0
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    netCalls += 1
    return realFetch(...args)
  }) as typeof fetch
  let again: { slides: StudentSlide[] }
  try {
    again = await runDeckDirector({
      slides,
      cfg: {
        llm: { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model },
        image: { baseUrl: DEFAULT_ILLUST.baseUrl, apiKey: imageKey, model: ILLUST_MODEL },
      },
      meta: {
        topic: String(plan?.meta?.topic ?? ''),
        grade: plan?.meta?.grade,
        subject: plan?.meta?.subject,
        duration: plan?.meta?.duration,
        allow: allowFor(plan?.meta?.duration ?? 0),
        paper: () => '#faf8f3',
      },
      cache: { plan: directorCache, art: illustCache },
    })
  } finally {
    globalThis.fetch = realFetch
  }
  const againCalls =
    directorCalls().direct - againBefore.direct + (directorCalls().typeset - againBefore.typeset)
  const againImages = illustCalls() - againImage
  if (againCalls !== 0) fail(`F 真跑：同一教案二次导出又打了 ${againCalls} 次 DeepSeek`)
  if (againImages !== 0) fail(`F 真跑：同一教案二次导出又打了 ${againImages} 次生图`)
  if (netCalls !== 0) fail(`F 真跑：同一教案二次导出还有 ${netCalls} 次网络请求`)
  if (again.slides.length !== slides.length) fail('F 真跑：二次导出的页数变了')
  if (!again.slides.every((s, i) => s.illustration === slides[i].illustration)) {
    fail('F 真跑：二次导出拿到的不是同一批图')
  }

  console.log(
    `\n—— 五个数 ——\n` +
      `1. DeepSeek 两遍调用：${direct} + ${typeset} = ${direct + typeset} 次，都成功（${report.directOk && report.typesetOk}）\n` +
      `2. ${illustrated.length} 张里带字：${withText} 张\n` +
      `3. artSide 左右：左 ${report.sides.left} / 右 ${report.sides.right}\n` +
      `4. 两遍之间 items 被改动：${report.itemsChanged} 页\n` +
      `5. 同一教案二次导出 API 调用：DeepSeek ${againCalls} 次 + 生图 ${againImages} 次 = ${
        againCalls + againImages
      } 次（导出阶段另 ${exportCalls} 次）`
  )
  if (illustrated.length !== images) {
    console.log(`  （说明：计划 ${illustrated.length} 张，实际发出 ${images} 次生图请求，差额为带字重投或失败）`)
  }
  return slides.length
}

/* --------------------------------- 主流程 --------------------------------- */

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`导演校验：生图 ${DEFAULT_ILLUST.model}，上限 ${ILLUST_MAX} 张\n`)
  // llm.ts 的 requestChat 用 window.setTimeout 做 120 秒超时；Node 里没有 window，临时垫一下
  const g = globalThis as unknown as { window?: unknown }
  const savedWindow = g.window
  g.window = globalThis
  try {
    sectionA()
    await sectionB()
    sectionC()
    await sectionD()
    await sectionE()
    if (process.env.ILLUST_LIVE === '1') await sectionF()
    else console.log('（F 真跑跳过：要跑就 ILLUST_LIVE=1 npm run check:illust，约 1.2 元）')
  } finally {
    if (savedWindow === undefined) delete g.window
    else g.window = savedWindow
  }

  if (errs.length > 0) {
    console.error(`\n✗ ${errs.length} 处不合格：`)
    for (const e of errs) console.error(`  · ${e}`)
    process.exit(1)
  }
  console.log('\n全部通过。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})