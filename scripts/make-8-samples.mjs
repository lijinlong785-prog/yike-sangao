/**
 * 八套新母版的样张（TASKS/25）：把 check:template 写出的真实渲染 SVG 拼成一张对照图。
 *
 * 为什么要拼图：8 套的差别是「版式骨架」不是「换个颜色」，一张一张看反而看不出差别，
 * 并排放在一张纸上才看得出「双年展压黄块 / 商务蓝右侧 panel / 长桌宴三张卡」。
 *
 * 输入：/tmp/yike-template-svg/<族>-<cover|board>.svg（由 npm run check:template 生成，含真实文字）
 * 输出：screenshots/templates-8.svg（4 列 × 4 行：上两行封面、下两行正文）
 *
 * 跑法：node scripts/make-8-samples.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const DIR = '/tmp/yike-template-svg'
const OUT = 'screenshots/templates-8.svg'
const W = 1280
const H = 720
const SCALE = 0.5
const CELL_W = W * SCALE
const CELL_H = H * SCALE
const PAD = 26
const LABEL = 34

const FAMILIES = [
  ['shuangnian', '双年展'],
  ['gulan', '钴蓝格'],
  ['shangwu', '商务蓝'],
  ['sanse', '三色刊'],
  ['lindi', '林地'],
  ['changyan', '长桌宴'],
  ['danse', '单色刊'],
  ['gangyin', '钢印'],
]

/** 取 SVG 内部的绘制内容（去掉外层 <svg> 壳，保留 viewBox 坐标系） */
function inner(file) {
  const s = readFileSync(file, 'utf8')
  const open = s.indexOf('>', s.indexOf('<svg')) + 1
  const close = s.lastIndexOf('</svg>')
  return s.slice(open, close)
}

const rows = [
  FAMILIES.slice(0, 4).map(([id]) => ({ id, page: 'cover' })),
  FAMILIES.slice(4).map(([id]) => ({ id, page: 'cover' })),
  FAMILIES.slice(0, 4).map(([id]) => ({ id, page: 'board' })),
  FAMILIES.slice(4).map(([id]) => ({ id, page: 'board' })),
]

const cols = 4
const totalW = PAD + cols * (CELL_W + PAD)
const totalH = PAD + rows.length * (CELL_H + LABEL + PAD)

const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`,
  `<rect width="${totalW}" height="${totalH}" fill="#F2EFE8"/>`,
]

const missing = []
rows.forEach((row, r) => {
  row.forEach((cell, c) => {
    const name = FAMILIES.find(([id]) => id === cell.id)[1]
    const x = PAD + c * (CELL_W + PAD)
    const y = PAD + r * (CELL_H + LABEL + PAD)
    const file = `${DIR}/${cell.id}-${cell.page}.svg`
    if (!existsSync(file)) {
      missing.push(file)
      return
    }
    parts.push(`<g transform="translate(${x} ${y}) scale(${SCALE})">${inner(file)}</g>`)
    // 细边框 + 族名（在格子下方，不压画面）
    parts.push(
      `<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#C9C2B2" stroke-width="1"/>`,
    )
    parts.push(
      `<text x="${x}" y="${y + CELL_H + 25}" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="19" fill="#3A352C">${name} · ${cell.page === 'cover' ? '封面' : '正文'}</text>`,
    )
  })
})
parts.push('</svg>')

if (missing.length) {
  console.error(`缺 ${missing.length} 张 SVG，先跑 npm run check:template：\n  ${missing.join('\n  ')}`)
  process.exit(1)
}

mkdirSync('screenshots', { recursive: true })
writeFileSync(OUT, parts.join('\n'), 'utf8')
console.log(`✓ ${OUT}（${totalW}×${totalH}，8 族 × 封面 / 正文）`)