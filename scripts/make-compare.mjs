/**
 * 「母版原图 ↔ 我们的产出」逐套并排对照（临时验伤用，不进产品）。
 *
 * 左：screenshots/tpl/ 下从 zarazhangrui/beautiful-html-templates 拿到的 1920×1080 原图
 * 右：check:template 写出的真实渲染 SVG（/tmp/yike-template-svg/）
 *
 * 输出 screenshots/cmp-<1|2>.svg|png，每张 4 族。
 * 跑法：node scripts/make-compare.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const SRC = '/tmp/yike-cmp'
const MINE = '/tmp/yike-template-svg'
const OUT = 'screenshots'
const CELL_W = 620
const CELL_H = 349
const PAD = 22
const LABEL = 30

/** id / 中文名 / 原图文件名 / 我的页型 */
const ROWS = [
  { id: 'shuangnian', name: '双年展 Biennale Yellow', src: 'biennale-yellow-1', mine: 'cover' },
  { id: 'gulan', name: '钴蓝格 Cobalt Grid', src: 'cobalt-grid-3', mine: 'board' },
  { id: 'shangwu', name: '商务蓝 Blue Professional', src: 'blue-professional-1', mine: 'cover' },
  { id: 'sanse', name: '三色刊 Editorial Tri-Tone', src: 'editorial-tri-tone-3', mine: 'board' },
  { id: 'lindi', name: '林地 Grove', src: 'grove-4', mine: 'board' },
  { id: 'changyan', name: '长桌宴 Long Table', src: 'long-table-3', mine: 'board' },
  { id: 'danse', name: '单色刊 Monochrome', src: 'monochrome-1', mine: 'cover' },
  { id: 'gangyin', name: '钢印 Stencil & Tablet', src: 'stencil-tablet-1', mine: 'cover' },
]

function inner(file) {
  const s = readFileSync(file, 'utf8')
  const open = s.indexOf('>', s.indexOf('<svg')) + 1
  const close = s.lastIndexOf('</svg>')
  return s.slice(open, close)
}

function dataUrl(file) {
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`
}

/** SVG 文本里的 & < > 必须转义，否则整张图渲染失败（族名里就有 &） */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const totalW = PAD + CELL_W + PAD + CELL_W + PAD
/* 一张纸只放两族：4 族并成一张时高度超过 Read 能完整显示的比例，会被截掉下半张 */
const rowsPerSheet = 2
const sheetH = PAD + rowsPerSheet * (LABEL + CELL_H + PAD)
/* qlmanage 把 SVG 按「高度铺满正方形」渲染，宽大于高时右边会被裁掉。
   所以画布直接做成正方形、内容垂直居中，出来的 PNG 就是完整的。 */
const canvasH = Math.max(sheetH, totalW)
const top0 = Math.round((canvasH - sheetH) / 2)
const missing = []

for (let sheet = 0; sheet < ROWS.length / rowsPerSheet; sheet++) {
  const rows = ROWS.slice(sheet * rowsPerSheet, (sheet + 1) * rowsPerSheet)
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${canvasH}" viewBox="0 0 ${totalW} ${canvasH}">`,
    `<rect width="${totalW}" height="${canvasH}" fill="#EDEAE3"/>`,
  ]
  rows.forEach((row, r) => {
    const y = top0 + PAD + r * (LABEL + CELL_H + PAD)
    const srcFile = `${SRC}/${row.src}.png`
    const mineFile = `${MINE}/${row.id}-${row.mine}.svg`
    if (!existsSync(srcFile)) missing.push(srcFile)
    if (!existsSync(mineFile)) missing.push(mineFile)
    // 族名
    parts.push(
      `<text x="${PAD}" y="${y + 20}" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="17" font-weight="600" fill="#2B2620">${esc(row.name)}</text>`,
    )
    const top = y + LABEL
    // 左：原图
    parts.push(
      `<image x="${PAD}" y="${top}" width="${CELL_W}" height="${CELL_H}" href="${dataUrl(srcFile)}"/>`,
    )
    parts.push(
      `<rect x="${PAD}" y="${top}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#B9B2A2" stroke-width="1"/>`,
    )
    // 右：我们的产出（原 1280×720，缩到 CELL_W）
    const s = CELL_W / 1280
    parts.push(`<g transform="translate(${PAD + CELL_W + PAD} ${top}) scale(${s})">${inner(mineFile)}</g>`)
    parts.push(
      `<rect x="${PAD + CELL_W + PAD}" y="${top}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#B9B2A2" stroke-width="1"/>`,
    )
    // 左右标注
    parts.push(
      `<text x="${PAD + 8}" y="${top + CELL_H - 8}" font-family="PingFang SC, sans-serif" font-size="13" fill="#6B6357">原图</text>`,
    )
    parts.push(
      `<text x="${PAD + CELL_W + PAD + 8}" y="${top + CELL_H - 8}" font-family="PingFang SC, sans-serif" font-size="13" fill="#6B6357">我们</text>`,
    )
  })
  parts.push('</svg>')
  mkdirSync(OUT, { recursive: true })
  const out = `${OUT}/cmp-${sheet + 1}.svg`
  writeFileSync(out, parts.join('\n'), 'utf8')
  console.log(`✓ ${out}（${totalW}×${canvasH}）`)
}

if (missing.length) {
  console.error(`缺文件：\n  ${missing.join('\n  ')}`)
  process.exit(1)
}