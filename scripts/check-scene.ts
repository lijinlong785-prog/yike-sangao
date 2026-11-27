/**
 * 第 10、11 件：场景库 + GIF 导出、导出双版本的离线门禁。
 *
 * 这条路在真机上已实测可行（60 帧 800×450 原样嵌入，WPS 与 PowerPoint 都循环播），
 * 这份脚本把它钉在离线可验的三段上：
 *   1. 逐帧绘制：三种场景各自的粒子真的画上了、颜色只取自自己的色板、
 *      同 seed 逐字节可复现、相邻帧不一样；
 *   2. GIF 编码：GIF89a 头、NETSCAPE 循环块（0 = 无限）、60 帧、每帧 80ms、
 *      1-bit 透明指到第 0 格；
 *   3. 导出的 .pptx：动态版有 gif 媒体与 <p:pic>，静态版一个媒体文件都没有，
 *      两份的页数与备注完全一致（第 11 件的「双版本」）。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { guihuaYu } from '../src/data/guihua'
import { allocate } from '../src/lib/timing'
import { assignDeckLayouts, buildDeck } from '../src/lib/deck'
import { DEFAULT_THEME } from '../src/lib/theme'
import { schemeFromJSON } from '../src/lib/scheme'
import { downloadDeckPptx } from '../src/lib/pptx'
import {
  SCENE,
  SCENE_KINDS,
  alignScenes,
  delayOf,
  framesOf,
  indexSceneFrame,
  opaquePixels,
  paintSceneFrame,
  sceneDataUrl,
  sceneGif,
  sceneProblems,
  sceneSummary,
  type SceneKind,
} from '../src/lib/scene'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${label}: 实得 ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`)
  }
}

const OUT_DIR = '/tmp/yike-check-scene'

/* ------------------------- 1. 逐帧绘制 ------------------------- */

const PALETTES: Record<SceneKind, string[]> = {
  // 桂花的淡金（#e8c46a / #d9a441 / #f0d894），不是朱红
  petals: ['232,196,106', '217,164,65', '240,216,148'],
  snow: ['255,255,255', '232,236,239'],
  rain: ['139,152,163', '109,122,134'],
}

/** 最长竖直线段（雨应明显长于雪） */
function maxVerticalRun(buf: Uint8ClampedArray, w: number, h: number): number {
  let best = 0
  for (let x = 0; x < w; x++) {
    let run = 0
    for (let y = 0; y < h; y++) {
      const a = buf[(y * w + x) * 4 + 3]
      if (a >= 128) {
        run++
        if (run > best) best = run
      } else run = 0
    }
  }
  return best
}

const runs: Record<SceneKind, number> = { petals: 0, snow: 0, rain: 0 }
for (const kind of SCENE_KINDS) {
  const buf = paintSceneFrame(kind, 0)
  eq(`${kind} 帧缓冲尺寸`, buf.length, SCENE.width * SCENE.height * 4)
  const px = opaquePixels(buf)
  if (px <= 0) fail(`${kind} 画了一帧却一个不透明像素都没有`)

  // 颜色只许出自自己的色板：场景不能偷偷用主题色或渐变
  const palette = new Set(PALETTES[kind])
  const seen = new Set<string>()
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 128) continue
    const key = `${buf[i]},${buf[i + 1]},${buf[i + 2]}`
    if (!palette.has(key)) seen.add(key)
  }
  if (seen.size) fail(`${kind} 出现了色板外的颜色：${[...seen].slice(0, 4).join(' / ')}`)

  // 确定性：同参数两次逐字节相同；隔一段的帧必须不一样
  const again = paintSceneFrame(kind, 0)
  let same = true
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== again[i]) {
      same = false
      break
    }
  }
  if (!same) fail(`${kind} 同参数两次绘制结果不一致（GIF 会每次导出都不一样）`)
  const later = paintSceneFrame(kind, 20)
  let differ = 0
  for (let i = 0; i < buf.length; i++) if (buf[i] !== later[i]) differ++
  if (differ === 0) fail(`${kind} 第 0 帧与第 20 帧一模一样（等于挂了张静态图）`)

  runs[kind] = maxVerticalRun(buf, SCENE.width, SCENE.height)
}

if (runs.rain < 8) fail(`雨的竖线最长只有 ${runs.rain}px，看不出是雨`)
if (runs.rain <= runs.snow) fail(`雨的竖线（${runs.rain}px）没有雪长（${runs.snow}px），两种场景看起来一样`)

// 索引化：透明像素一律 0，不透明像素落在 1..N（0 留给 GIF 的透明位）
const idx = indexSceneFrame(paintSceneFrame('snow', 3), [
  [255, 255, 255],
  [232, 236, 239],
])
if (idx.length !== SCENE.width * SCENE.height) fail('索引图尺寸与帧缓冲不一致')
if (!idx.some((v) => v > 0)) fail('索引图里没有任何不透明像素')
if (idx.some((v) => v > 2)) fail('索引图出现了色板之外的索引')

/* ------------------------- 2. GIF 编码 ------------------------- */

const gifs: Record<string, Uint8Array> = {}
for (const kind of SCENE_KINDS) {
  const bytes = sceneGif(kind)
  gifs[kind] = bytes
  const head = String.fromCharCode(...bytes.subarray(0, 6))
  if (head !== 'GIF89a') fail(`${kind} 的 GIF 头是 ${head}，应为 GIF89a`)
  if (bytes[bytes.length - 1] !== 0x3b) fail(`${kind} 的 GIF 没有结束符 0x3B`)

  // NETSCAPE2.0 + 循环次数 0（无限）
  const text = Buffer.from(bytes).toString('latin1')
  const nsAt = text.indexOf('NETSCAPE2.0')
  if (nsAt < 0) fail(`${kind} 的 GIF 没有 NETSCAPE2.0 块，不会循环`)
  else {
    const lo = bytes[nsAt + 11 + 2]
    const hi = bytes[nsAt + 11 + 3]
    if (lo !== 0 || hi !== 0) fail(`${kind} 的循环次数是 ${hi * 256 + lo}，应为 0（无限循环）`)
  }

  // 图形控制扩展：帧数 / 延时 / 透明位
  const frames: { delay: number; transparent: boolean; index: number }[] = []
  for (let i = 0; i + 7 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      frames.push({
        delay: bytes[i + 4] | (bytes[i + 5] << 8),
        transparent: (bytes[i + 3] & 0x01) === 1,
        index: bytes[i + 6],
      })
    }
  }
  eq(`${kind} 的帧数`, frames.length, framesOf(kind))
  const badDelay = frames.filter((f) => f.delay !== delayOf(kind) / 10)
  if (badDelay.length) fail(`${kind} 有 ${badDelay.length} 帧延时不是 ${delayOf(kind) / 10}×10ms`)
  if (frames.some((f) => !f.transparent)) fail(`${kind} 有帧没开 1-bit 透明，贴到幻灯片上会盖住整页`)
  if (frames.some((f) => f.index !== 0)) fail(`${kind} 的透明索引不是 0`)

  // 缓存：同一场景第二次拿到的必须是同一份字节
  if (sceneGif(kind) !== bytes) fail(`${kind} 的 GIF 没走缓存，每页都重编`)

  const url = sceneDataUrl(kind)
  if (!url.startsWith('data:image/gif;base64,')) fail(`${kind} 的 data URL 前缀不对`)
  const b64 = url.slice('data:image/gif;base64,'.length)
  if (Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0) !== bytes.length) {
    fail(`${kind} 的 base64 长度与 GIF 字节数对不上`)
  }
}

/* ------------------------- 3. 场景表的口径 ------------------------- */

const allMoving = Array.from({ length: 12 }, () => 'petals' as SceneKind)
if (!sceneProblems(allMoving).some((p) => /页页都动/.test(p))) fail('整份 12 页全在动没被判错')
if (sceneProblems(Array.from({ length: 12 }, () => '' as const)).length) fail('整份留白本来合法，却被判错')
if (!sceneProblems(['枫叶' as SceneKind, '', '', '']).some((p) => /不在 petals/.test(p))) {
  fail('自造的场景名「枫叶」没被判错')
}
eq('alignScenes 按页数裁', alignScenes(['snow', 'rain', 'petals'], 2), ['snow', 'rain'])
eq('alignScenes 短的补留白', alignScenes(['snow'], 3), ['snow', '', ''])
eq('alignScenes 不认识的留白', alignScenes(['snow', 'fog'], 2), ['snow', ''])
if (!sceneSummary(allMoving).includes('12/12')) fail('sceneSummary 没数出 12/12 页在动')

// 接到方案闸门上：场景全动 = 这份方案不采用（与色值出框同一条路）
const goodScheme = {
  name: '苔痕',
  motif: 'dots',
  paper: '#eef1ea',
  coverPaper: '#d5ddd2',
  paperDeep: '#e3e8de',
  paperLine: '#d8ded3',
  ink: '#22261f',
  inkSoft: '#5a6156',
  accent: '#8a4a3a',
  accentSoft: '#efe0da',
  ruleWidth: 1,
}
const movingPlan = schemeFromJSON({ ...goodScheme, scenes: allMoving }, '语文', 12)
if (movingPlan.theme) fail('模型交回「页页都动」的方案，被当成合格采用了')
else if (!movingPlan.problems.some((p) => /页页都动/.test(p))) {
  fail(`「页页都动」的退回原因不对：${JSON.stringify(movingPlan.problems)}`)
}
const mixed = schemeFromJSON(
  { ...goodScheme, scenes: ['petals', '', 'snow', '', '', 'rain', '', '', '', '', '', ''] },
  '语文',
  12
)
if (!mixed.theme) fail(`合格的场景表被退了：${mixed.problems.join('；')}`)
else eq('合格场景表落进方案', mixed.theme.scenes?.slice(0, 6), ['petals', '', 'snow', '', '', 'rain'])

/* ------------------------- 4. 场景落到页上 ------------------------- */

const basePages = buildDeck(guihuaYu, allocate(guihuaYu.segments, guihuaYu.meta.duration))
const sceneSlots = alignScenes(['petals', '', 'snow', '', '', 'rain', '', '', 'petals', '', '', ''], basePages.length)
const pages = assignDeckLayouts(basePages, null, sceneSlots)
eq('场景落到页上', pages.map((p) => p.scene), sceneSlots)
const noScenes = assignDeckLayouts(basePages, null, null)
if (noScenes.some((p) => p.scene !== '')) fail('没有场景表时，页上必须是留白而不是 undefined')
eq('插页/调序后仍能重排场景', assignDeckLayouts(pages.slice(0, 3), null, null).length, 3)

/* ------------------------- 5. 导出双版本 ------------------------- */

function unzipList(file: string): string[] {
  return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.endsWith('/'))
}
function unzipText(entry: string, file: string): string {
  return execFileSync('/usr/bin/unzip', ['-p', file, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const theme = { ...DEFAULT_THEME, scenes: sceneSlots }
const animFile = `${OUT_DIR}/anim.pptx`
const staticFile = `${OUT_DIR}/static.pptx`
const animPages = await downloadDeckPptx(pages, undefined, animFile, theme, { animated: true })
const staticPages = await downloadDeckPptx(pages, undefined, staticFile, theme, { animated: false })
eq('动态版页数', animPages.pages, pages.length)
eq('静态版页数', staticPages.pages, pages.length)

const animZip = unzipList(animFile)
const staticZip = unzipList(staticFile)
const gifMedia = animZip.filter((e) => /^ppt\/media\/.*\.gif$/.test(e))
if (gifMedia.length < 3) fail(`动态版只嵌了 ${gifMedia.length} 个 GIF，三种场景至少 3 个`)
if (staticZip.some((e) => /^ppt\/media\//.test(e))) {
  fail(`静态版里仍有媒体文件：${staticZip.filter((e) => /^ppt\/media\//.test(e)).join(' ')}`)
}

const slideEntries = (zip: string[]) => zip.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).sort()
eq('两份页数一致', slideEntries(staticZip).length, slideEntries(animZip).length)
const picsOf = (file: string, entries: string[]) =>
  entries.reduce((sum, e) => sum + (unzipText(e, file).match(/<p:pic>/g) ?? []).length, 0)
const animPics = picsOf(animFile, slideEntries(animZip))
const staticPics = picsOf(staticFile, slideEntries(staticZip))
const movingPages = sceneSlots.filter((s) => s !== '').length
if (animPics < movingPages) fail(`动态版只有 ${animPics} 张图，应有 ${movingPages} 页场景图`)
if (staticPics !== 0) fail(`静态版里出现了 ${staticPics} 张图（应一张都没有）`)

// [Content_Types].xml 不算数：pptxgenjs 每次都把 gif/png/jpeg... 的 Default 全写上，
// 未用到也写着（已实测）。真正能判的是「页面上有没有引用图片」与「包里有没有媒体」。
const imageRels = (file: string, zip: string[]) =>
  zip
    .filter((e) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(e))
    .reduce((sum, e) => sum + (unzipText(e, file).match(/relationships\/image/g) ?? []).length, 0)
const animRels = imageRels(animFile, animZip)
const staticRels = imageRels(staticFile, staticZip)
if (animRels < movingPages) fail(`动态版的图片关系只有 ${animRels} 条，应有 ${movingPages} 条`)
if (staticRels !== 0) fail(`静态版的幻灯片里仍引用了 ${staticRels} 张图（应一条都没有）`)

// 备注（口播稿）两份必须一字不差：双版本只差「插不插 GIF」
const notesOf = (file: string, zip: string[]) => {
  const notes = zip.filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e)).sort()
  return notes.map((e) => unzipText(e, file)).join('')
}
if (notesOf(animFile, animZip) !== notesOf(staticFile, staticZip)) {
  fail('动态版与静态版的备注（口播稿）不一致：双版本必须同源')
}

const animBytes = statSync(animFile).size
const staticBytes = statSync(staticFile).size
if (animBytes <= staticBytes) fail(`动态版 ${animBytes} 字节不大于静态版 ${staticBytes} 字节，GIF 可能没进包`)

/* ------------------------- 汇总 ------------------------- */

console.log(
  `  逐帧绘制：${SCENE_KINDS.join(' / ')} 各 1 帧，色板外颜色 0 个 | 竖线最长 rain ${runs.rain}px · snow ${runs.snow}px · petals ${runs.petals}px`
)
console.log(
  `  GIF：${SCENE_KINDS.map((k) => `${k} ${framesOf(k)}×${delayOf(k)}ms=${(framesOf(k) * delayOf(k)) / 1000}s`).join(' / ')} ` +
    `于 ${SCENE.width}×${SCENE.height}，GIF89a + NETSCAPE 循环 0 + 1-bit 透明索引 0，三份均命中`
)
console.log(
  `  导出双版本：动态 ${animBytes} 字节（${gifMedia.length} 个 GIF / ${animPics} 张图）· 静态 ${staticBytes} 字节（0 媒体 / 0 图）· ` +
    `页数与备注一致 | ${sceneSummary(sceneSlots)}`
)

if (failures.length) {
  console.error(`\n✗ 场景与双版本导出 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ 场景库 + GIF + 导出双版本：逐帧绘制 / 循环 GIF / 场景口径 / 动态静态两份 全部通过')
rmSync(OUT_DIR, { recursive: true, force: true })