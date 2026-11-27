/* 临时设计稿（第二轮）：三种课文 × 各自该配的风格 × 五页。
 *   《桂花雨》      → 宣纸（已有，本脚本只补数学与英语）
 *   《长方体的认识》 → 板书（黑板粉笔 + 方格 + 图上标数据 + 分步算式）
 *   五上 Unit 1    → 清新（词卡 + 四线三格 + 对话气泡）
 * 跑完即删；定稿后搬进 deck2/place.ts。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import type { Placed } from '../src/lib/deck2/place'

const W = 1280
const H = 720
const OUT = 'screenshots/styles'

/** 设计稿专用的扩展：斜线（长方体的深度边）与虚线（连线题） */
type Node = Placed & { path?: string; dash?: string; strokeWidth?: number; stroke?: string }

interface Style {
  paper: string
  surface: string
  ink: string
  muted: string
  accent: string
  line: string
  fontTitle: 'song' | 'kai' | 'hei'
  fontBody: 'song' | 'kai' | 'hei'
  radius: number
  grid: boolean
}

const BANSHU: Style = {
  paper: '#2A3A32',
  surface: '#33463C',
  ink: '#F0EDE2',
  muted: '#A8B5AA',
  accent: '#E9C46A',
  line: '#7C8F80',
  fontTitle: 'kai',
  fontBody: 'kai',
  radius: 6,
  grid: true,
}

const QINGXIN: Style = {
  paper: '#FFFDF8',
  surface: '#F2F6EC',
  ink: '#2B3026',
  muted: '#7C8474',
  accent: '#E07A5F',
  line: '#DDE5D4',
  fontTitle: 'hei',
  fontBody: 'hei',
  radius: 18,
  grid: false,
}

const GREEN = '#7FA98B'

/* ------------------------------ 小工具 ------------------------------ */

const edge = (x1: number, y1: number, x2: number, y2: number, color: string, t = 0.0035, opacity = 1): Node => {
  const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1)
  return horizontal
    ? { kind: 'rect', x: Math.min(x1, x2), y: y1 - t / 2, w: Math.abs(x2 - x1), h: t, fill: color, opacity }
    : { kind: 'rect', x: x1 - t / 2, y: Math.min(y1, y2), w: t, h: Math.abs(y2 - y1), fill: color, opacity }
}

/** 一个 2.5D 长方体：正面矩形 + 右上方的顶面与侧面。
 * 深度的边是真斜线，所以走 path；用 edge() 那种轴对齐矩形条会把斜边压成直角，画出来是残的。 */
function cuboid(x: number, y: number, w: number, h: number, d: number, color: string, label?: string[]): Node[] {
  const X = x * W
  const B = (y + h) * H // 正面底边
  const WW = w * W
  const HH = h * H
  const DD = d * W
  const DY = DD * 0.62 // 进深的竖直分量：约 32° 俯视，和课本插图一个味道
  const line = (s: string): Node => ({ kind: 'rect', x: 0, y: 0, w: 0, h: 0, path: s, stroke: color, strokeWidth: 2.4 })
  const out: Node[] = [
    line(`M ${X} ${B - HH} h ${WW} v ${HH} h ${-WW} Z`),
    line(`M ${X} ${B - HH} l ${DD} ${-DY} h ${WW} l ${-DD} ${DY}`),
    line(`M ${X + WW} ${B - HH} l ${DD} ${-DY} v ${HH} l ${-DD} ${DY}`),
  ]
  if (label) {
    // 三条边的长度标注：底边居中、右侧竖边、顶面斜边
    out.push({ kind: 'text', x: x + (w - 0.16) / 2, y: y + h + 0.012, w: 0.16, h: 0.035, text: label[0], size: 15, color, align: 'center', font: 'hei' })
    out.push({ kind: 'text', x: x + w + 0.02, y: y + h / 2 - 0.02, w: 0.12, h: 0.035, text: label[1], size: 15, color, font: 'hei' })
    out.push({ kind: 'text', x: x + w * 0.55 + d * 0.5, y: y - d * 0.62 - 0.075, w: 0.12, h: 0.035, text: label[2], size: 15, color, font: 'hei' })
  }
  return out
}

function gridLines(s: Style, step = 0.05): Node[] {
  if (!s.grid) return []
  const out: Node[] = []
  for (let x = step; x < 1; x += step) out.push({ kind: 'rect', x, y: 0, w: 0.0008, h: 1, fill: s.ink, opacity: 0.055 })
  for (let y = step; y < 1; y += step) out.push({ kind: 'rect', x: 0, y, w: 1, h: 0.0008, fill: s.ink, opacity: 0.055 })
  return out
}

function foot(s: Style, title: string, no: number): Node[] {
  return [
    { kind: 'text', x: 0.06, y: 0.925, w: 0.6, h: 0.04, text: title, size: 11, color: s.muted, font: s.fontBody },
    { kind: 'text', x: 0.86, y: 0.925, w: 0.08, h: 0.04, text: `${no} / 10`, size: 11, color: s.muted, align: 'right', font: s.fontBody },
  ]
}

/** 黑板式的页头：小标签 + 大标题 + 粉笔双线 */
function headBB(s: Style, label: string, title: string): Node[] {
  return [
    { kind: 'text', x: 0.06, y: 0.055, w: 0.5, h: 0.04, text: label, size: 15, color: s.accent, font: s.fontBody },
    { kind: 'text', x: 0.06, y: 0.095, w: 0.84, h: 0.07, text: title, size: 34, color: s.ink, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.178, w: 0.88, h: 0.0035, fill: s.ink, opacity: 0.55 },
    { kind: 'rect', x: 0.06, y: 0.187, w: 0.88, h: 0.0015, fill: s.ink, opacity: 0.28 },
  ]
}

/** 清新式的页头：一整条色块 */
function headQX(s: Style, label: string, right = ''): Node[] {
  const out: Node[] = [
    { kind: 'rect', x: 0.05, y: 0.05, w: 0.9, h: 0.1, fill: GREEN },
    { kind: 'text', x: 0.075, y: 0.072, w: 0.62, h: 0.055, text: label, size: 28, color: '#FFFFFF' },
  ]
  if (right) out.push({ kind: 'text', x: 0.6, y: 0.08, w: 0.32, h: 0.04, text: right, size: 14, color: '#EAF1E6', align: 'right' })
  return out
}

/* ============================ 数学 · 板书 ============================ */

const MATH_FOOT = '长方体的认识'

function mathCover(): Node[] {
  const s = BANSHU
  return [
    ...gridLines(s),
    { kind: 'rect', x: 0.06, y: 0.16, w: 0.62, h: 0.44, fill: s.surface, opacity: 0.5 },
    { kind: 'text', x: 0.09, y: 0.2, w: 0.56, h: 0.04, text: '人教版 · 五年级下册 · 第三单元', size: 16, color: s.muted, font: s.fontBody },
    { kind: 'text', x: 0.09, y: 0.26, w: 0.56, h: 0.13, text: '长方体的认识', size: 62, color: s.ink, font: s.fontTitle },
    { kind: 'rect', x: 0.09, y: 0.405, w: 0.26, h: 0.008, fill: s.accent },
    { kind: 'text', x: 0.09, y: 0.44, w: 0.56, h: 0.05, text: '6 个面 · 12 条棱 · 8 个顶点', size: 26, color: s.ink, font: s.fontBody },
    { kind: 'text', x: 0.09, y: 0.51, w: 0.56, h: 0.05, text: '五年级　　班', size: 17, color: s.muted, font: s.fontBody },
    ...cuboid(0.7, 0.5, 0.16, 0.22, 0.07, s.accent),
    ...foot(s, MATH_FOOT, 1),
  ]
}

function mathHook(): Node[] {
  const s = BANSHU
  return [
    ...gridLines(s),
    ...headBB(s, '一、先看看', '生活里，哪些东西是长方体？'),
    ...cuboid(0.08, 0.36, 0.16, 0.26, 0.06, s.ink),
    ...cuboid(0.36, 0.42, 0.2, 0.2, 0.08, s.ink),
    ...cuboid(0.68, 0.34, 0.14, 0.3, 0.06, s.ink),
    { kind: 'text', x: 0.06, y: 0.74, w: 0.86, h: 0.06, text: '问：它们的形状，有什么共同的地方？', size: 24, color: s.accent, font: s.fontTitle },
    ...foot(s, MATH_FOOT, 2),
  ]
}

function mathCount(): Node[] {
  const s = BANSHU
  return [
    ...gridLines(s),
    ...headBB(s, '二、数一数', '面、棱、顶点，各有多少？'),
    ...cuboid(0.09, 0.34, 0.26, 0.3, 0.11, s.ink),
    { kind: 'text', x: 0.52, y: 0.29, w: 0.42, h: 0.1, text: '面　6 个', size: 42, color: s.ink, font: s.fontTitle },
    { kind: 'text', x: 0.52, y: 0.41, w: 0.42, h: 0.1, text: '棱　12 条', size: 42, color: s.ink, font: s.fontTitle },
    { kind: 'text', x: 0.52, y: 0.53, w: 0.42, h: 0.1, text: '顶点　8 个', size: 42, color: s.ink, font: s.fontTitle },
    { kind: 'rect', x: 0.52, y: 0.383, w: 0.3, h: 0.002, fill: s.line, opacity: 0.5 },
    { kind: 'rect', x: 0.52, y: 0.503, w: 0.3, h: 0.002, fill: s.line, opacity: 0.5 },
    { kind: 'text', x: 0.06, y: 0.78, w: 0.84, h: 0.06, text: '摸一摸：面是平的，棱是边，顶点是尖的。', size: 18, color: s.accent, font: s.fontTitle },
    ...foot(s, MATH_FOOT, 3),
  ]
}

function mathExample(): Node[] {
  const s = BANSHU
  return [
    ...gridLines(s),
    ...headBB(s, '三、试一试', '一个长方体，棱长总和是多少？'),
    { kind: 'text', x: 0.06, y: 0.22, w: 0.88, h: 0.05, text: '长 6 cm，宽 4 cm，高 3 cm。', size: 24, color: s.accent, font: s.fontTitle },
    ...cuboid(0.08, 0.62, 0.26, 0.2, 0.09, s.ink, ['6 cm', '3 cm', '4 cm']),
    { kind: 'text', x: 0.48, y: 0.3, w: 0.46, h: 0.05, text: '棱长总和 =（长 + 宽 + 高）× 4', size: 22, color: s.ink, font: s.fontBody },
    { kind: 'text', x: 0.48, y: 0.4, w: 0.46, h: 0.05, text: '= （6 + 4 + 3）× 4', size: 26, color: s.ink, font: s.fontBody },
    { kind: 'text', x: 0.48, y: 0.49, w: 0.46, h: 0.05, text: '= 13 × 4', size: 26, color: s.ink, font: s.fontBody },
    { kind: 'text', x: 0.48, y: 0.58, w: 0.46, h: 0.06, text: '= 52（cm）', size: 30, color: s.accent, font: s.fontBody },
    { kind: 'text', x: 0.48, y: 0.68, w: 0.46, h: 0.04, text: '答：棱长总和是 52 cm。', size: 18, color: s.muted, font: s.fontBody },
    ...foot(s, MATH_FOOT, 4),
  ]
}

function mathBoard(): Node[] {
  const s = BANSHU
  const rows: [string, string][] = [
    ['面', '6 个，相对的面完全相同'],
    ['棱', '12 条，相对的棱长度相等'],
    ['顶点', '8 个，三条棱交在一起'],
  ]
  const out: Node[] = [...gridLines(s), ...headBB(s, '四、小结', '记住这三行就够用')]
  rows.forEach(([k, v], i) => {
    const y = 0.24 + i * 0.16
    out.push({ kind: 'text', x: 0.08, y, w: 0.12, h: 0.08, text: k, size: 36, color: s.accent, font: s.fontTitle })
    out.push({ kind: 'text', x: 0.22, y: y + 0.015, w: 0.7, h: 0.06, text: v, size: 26, color: s.ink, font: s.fontBody })
    out.push({ kind: 'rect', x: 0.08, y: y + 0.115, w: 0.84, h: 0.0015, fill: s.line, opacity: 0.55 })
  })
  out.push({ kind: 'text', x: 0.08, y: 0.74, w: 0.84, h: 0.06, text: '长方体的认识 = 面 · 棱 · 顶点', size: 28, color: s.accent, font: s.fontTitle })
  return [...out, ...foot(s, MATH_FOOT, 10)]
}

/* ============================ 英语 · 清新 ============================ */

const EN_FOOT = "Unit 1 What's he like?"

function fourLines(s: Style): Node[] {
  const ys = [0.5, 0.55, 0.6, 0.65]
  return ys.map((y, i) => ({
    kind: 'rect' as const,
    x: 0.62,
    y,
    w: 0.3,
    h: i === 1 || i === 2 ? 0.0018 : 0.0012,
    fill: s.line,
    opacity: 1,
  }))
}

function enCover(): Node[] {
  const s = QINGXIN
  return [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: s.surface, opacity: 0.5 },
    { kind: 'rect', x: 0.06, y: 0.12, w: 0.54, h: 0.76, fill: s.paper },
    { kind: 'rect', x: 0.09, y: 0.26, w: 0.06, h: 0.012, fill: s.accent },
    { kind: 'text', x: 0.09, y: 0.3, w: 0.48, h: 0.06, text: 'Unit 1 · Let’s learn', size: 20, color: s.muted },
    { kind: 'text', x: 0.09, y: 0.37, w: 0.48, h: 0.14, text: 'What’s he like?', size: 54, color: s.ink, bold: true },
    { kind: 'text', x: 0.09, y: 0.53, w: 0.48, h: 0.05, text: '小学英语 · 五年级上册', size: 21, color: s.ink },
    { kind: 'text', x: 0.09, y: 0.6, w: 0.48, h: 0.05, text: '五年级　　班', size: 18, color: s.muted },
    { kind: 'rect', x: 0.09, y: 0.68, w: 0.48, h: 0.09, fill: '#FBF1EC' },
    { kind: 'text', x: 0.11, y: 0.7, w: 0.44, h: 0.06, text: 'tall · kind · funny · shy …', size: 17, color: s.accent },
    { kind: 'rect', x: 0.64, y: 0.12, w: 0.3, h: 0.76, fill: '#EAF0E2' },
    ...fourLines(s),
    { kind: 'text', x: 0.64, y: 0.55, w: 0.26, h: 0.1, text: 'Aa Bb', size: 34, color: '#9DB48B' },
    ...foot(s, EN_FOOT, 1),
  ]
}

function enWords(): Node[] {
  const s = QINGXIN
  const appearance = [
    ['tall', '高的'],
    ['short', '矮的'],
    ['thin', '瘦的'],
    ['strong', '强壮的'],
  ]
  const personality = [
    ['kind', '和善的'],
    ['strict', '严格的'],
    ['funny', '滑稽的'],
    ['shy', '羞怯的'],
  ]
  const col = (items: string[][], x: number, name: string, hint: string): Node[] => {
    const out: Node[] = [
      { kind: 'rect', x, y: 0.2, w: 0.42, h: 0.62, fill: s.surface },
      { kind: 'text', x: x + 0.03, y: 0.23, w: 0.36, h: 0.05, text: name, size: 20, color: s.ink, bold: true },
      { kind: 'text', x: x + 0.03, y: 0.285, w: 0.36, h: 0.04, text: hint, size: 13, color: s.muted },
      { kind: 'rect', x: x + 0.03, y: 0.33, w: 0.34, h: 0.0018, fill: s.line, opacity: 1 },
    ]
    items.forEach(([w, m], i) => {
      const y = 0.36 + i * 0.11
      out.push({ kind: 'text', x: x + 0.03, y, w: 0.2, h: 0.06, text: w, size: 26, color: s.ink, bold: true })
      out.push({ kind: 'text', x: x + 0.24, y: y + 0.015, w: 0.16, h: 0.04, text: m, size: 15, color: s.muted })
    })
    return out
  }
  return [
    ...headQX(s, 'Word bank · 单词墙', '看外貌 · 看性格'),
    ...col(appearance, 0.05, 'Appearance 外貌', '看个子、看胖瘦'),
    ...col(personality, 0.53, 'Personality 性格', '看脾气、看做事'),
    ...foot(s, EN_FOOT, 2),
  ]
}

function enNewWords(): Node[] {
  const s = QINGXIN
  const cards: [string, string, string, string][] = [
    ['shy', '/ʃaɪ/', '羞怯的', 'The baby is very shy.'],
    ['kind', '/kaɪnd/', '和善的', 'My teacher is kind.'],
    ['polite', '/pəˈlaɪt/', '有礼貌的', 'He is polite to everyone.'],
    ['hard-working', '/ˌhɑːdˈwɜːkɪŋ/', '工作努力的', 'She is hard-working.'],
  ]
  const out: Node[] = [...headQX(s, 'New words · 新词', '4 个词，4 句话')]
  cards.forEach(([w, ipa, zh, sentence], i) => {
    const x = 0.05 + (i % 2) * 0.455
    const y = 0.2 + Math.floor(i / 2) * 0.36
    /* 音标不能跟词挤一行：hard-working 这种长词会把音标顶到卡外、再把中文压到下一行去。
       竖排四行（词 / 音标 / 中文 / 例句）后，任何词长都稳。 */
    out.push({ kind: 'rect', x, y, w: 0.435, h: 0.32, fill: s.surface })
    out.push({ kind: 'text', x: x + 0.03, y: y + 0.025, w: 0.37, h: 0.07, text: w, size: 28, color: s.ink, bold: true })
    out.push({ kind: 'text', x: x + 0.03, y: y + 0.098, w: 0.37, h: 0.04, text: ipa, size: 14, color: s.muted })
    out.push({ kind: 'text', x: x + 0.03, y: y + 0.142, w: 0.37, h: 0.045, text: zh, size: 16, color: s.accent })
    out.push({ kind: 'text', x: x + 0.03, y: y + 0.2, w: 0.37, h: 0.1, text: sentence, size: 15, color: s.ink, lineHeight: 1.5 })
  })
  return [...out, ...foot(s, EN_FOOT, 3)]
}

function enTalk(): Node[] {
  const s = QINGXIN
  return [
    ...headQX(s, 'Let’s talk · 一问一答', '两个人一组，问一问'),
    { kind: 'text', x: 0.06, y: 0.24, w: 0.1, h: 0.05, text: 'A', size: 22, color: s.accent, bold: true },
    { kind: 'rect', x: 0.13, y: 0.22, w: 0.5, h: 0.13, fill: s.surface },
    { kind: 'text', x: 0.15, y: 0.25, w: 0.46, h: 0.07, text: 'What’s he like?', size: 30, color: s.ink },
    { kind: 'text', x: 0.06, y: 0.44, w: 0.1, h: 0.05, text: 'B', size: 22, color: s.accent, bold: true },
    { kind: 'rect', x: 0.13, y: 0.42, w: 0.5, h: 0.13, fill: '#FBF1EC' },
    { kind: 'text', x: 0.15, y: 0.45, w: 0.46, h: 0.07, text: 'He’s kind.', size: 30, color: s.accent },
    { kind: 'text', x: 0.06, y: 0.62, w: 0.86, h: 0.04, text: '换一换：把 kind 换成下面的词，再说一遍', size: 15, color: s.muted },
    ...['tall', 'short', 'funny', 'strict', 'polite'].map((w, i) => ({
      kind: 'rect' as const,
      x: 0.06 + i * 0.17,
      y: 0.68,
      w: 0.15,
      h: 0.09,
      fill: s.surface,
    })),
    ...['tall', 'short', 'funny', 'strict', 'polite'].map((w, i) => ({
      kind: 'text' as const,
      x: 0.06 + i * 0.17,
      y: 0.705,
      w: 0.15,
      h: 0.05,
      text: w,
      size: 20,
      color: s.ink,
      align: 'center' as const,
    })),
    ...foot(s, EN_FOOT, 4),
  ]
}

function enPractice(): Node[] {
  const s = QINGXIN
  /* 连线题的右列一定要打乱：顺序对齐等于把答案写出来了，学生没得练 */
  const pairs: [string, string][] = [
    ['shy', '严格的'],
    ['polite', '工作努力的'],
    ['strict', '羞怯的'],
    ['hard-working', '有礼貌的'],
  ]
  const out: Node[] = [...headQX(s, 'Practice · 练一练', '连一连 · 填一填')]
  out.push({ kind: 'rect', x: 0.05, y: 0.2, w: 0.44, h: 0.62, fill: s.surface })
  out.push({ kind: 'text', x: 0.08, y: 0.225, w: 0.4, h: 0.045, text: 'Match and say  连一连', size: 17, color: s.ink, bold: true })
  pairs.forEach(([en, zh], i) => {
    const y = 0.32 + i * 0.11
    out.push({ kind: 'text', x: 0.08, y, w: 0.18, h: 0.05, text: en, size: 19, color: s.ink })
    out.push({ kind: 'text', x: 0.31, y, w: 0.16, h: 0.05, text: zh, size: 16, color: s.muted })
    // 两侧的连接点，中间留白给学生自己画线
    out.push({ kind: 'rect', x: 0.275, y: y + 0.022, w: 0.008, h: 0.008, fill: s.line })
    out.push({ kind: 'rect', x: 0.29, y: y + 0.022, w: 0.008, h: 0.008, fill: s.line })
  })
  out.push({ kind: 'rect', x: 0.51, y: 0.2, w: 0.44, h: 0.62, fill: '#FBF1EC' })
  out.push({ kind: 'text', x: 0.54, y: 0.225, w: 0.4, h: 0.045, text: 'Choose and write  选词填空', size: 17, color: s.ink, bold: true })
  /* 题干自己断行：靠自动折行会把句号或单个字母甩到下一行去 */
  const qs = ['1. My teacher is ______.\nShe never smiles.', '2. The boy is ______.\nHe says hello to all.']
  qs.forEach((q, i) => {
    out.push({ kind: 'text', x: 0.54, y: 0.31 + i * 0.16, w: 0.38, h: 0.12, text: q, size: 16, color: s.ink, lineHeight: 1.6 })
  })
  // 词库里放选项，不写答案：答案进讲稿，页面只给可选的词
  out.push({ kind: 'text', x: 0.54, y: 0.62, w: 0.38, h: 0.04, text: '词库', size: 13, color: s.muted })
  ;['strict', 'polite', 'shy', 'hard-working'].forEach((w, i) => {
    const x = 0.54 + (i % 2) * 0.19
    const y = 0.67 + Math.floor(i / 2) * 0.075
    out.push({ kind: 'rect', x, y, w: 0.175, h: 0.06, fill: s.paper })
    out.push({ kind: 'text', x, y: y + 0.014, w: 0.175, h: 0.04, text: w, size: 13, color: s.ink, align: 'center' })
  })
  return [...out, ...foot(s, EN_FOOT, 5)]
}

/* ------------------------------ 渲 SVG ------------------------------ */

const CSS_FONT: Record<string, string> = {
  song: 'Songti SC, SimSun, serif',
  kai: 'Kaiti SC, KaiTi, serif',
  hei: 'PingFang SC, Hiragino Sans GB, sans-serif',
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wrapTo(text: string, width: number, px: number): string[] {
  const limit = Math.max(px, width - px * 0.2)
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let buf = ''
    let used = 0
    for (const ch of raw) {
      const cw = /[\u3400-\u4DBF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? px : px * 0.55
      if (used + cw > limit && buf) {
        out.push(buf)
        buf = ''
        used = 0
      }
      buf += ch
      used += cw
    }
    out.push(buf)
  }
  return out
}

function svgOf(placed: readonly Node[], s: Style): string {
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${s.paper}"/>`]
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
    if (p.path) {
      body.push(
        `<path d="${p.path}" fill="none" stroke="${p.stroke ?? s.line}" stroke-width="${p.strokeWidth ?? 2}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''} opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'rect' || p.kind === 'line') {
      const r = s.radius && p.w * W > 40 ? s.radius : 0
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, p.kind === 'line' ? 1 : 0).toFixed(1)}" height="${Math.max(h, p.kind === 'line' ? 1 : 0).toFixed(1)}" rx="${r}" fill="${p.fill ?? s.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'image' || !p.text) continue
    const pt = p.size ?? 18
    const px = (pt * 4) / 3
    const list = wrapTo(p.text, w, px)
    const lineH = px * (p.lineHeight ?? 1.3)
    const blockH = list.length * lineH
    const top = p.valign === 'middle' ? y + (h - blockH) / 2 : y
    const anchor = p.align === 'right' ? 'end' : p.align === 'center' ? 'middle' : 'start'
    const tx = p.align === 'right' ? x + w : p.align === 'center' ? x + w / 2 : x
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(top + lineH * i + px * 0.78).toFixed(1)}" font-family="${CSS_FONT[p.font ?? s.fontBody]}" font-size="${px.toFixed(1)}"${p.bold ? ' font-weight="bold"' : ''} fill="${p.color ?? s.ink}" text-anchor="${anchor}">${esc(line)}</text>`
      )
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body.join('')}</svg>`
}

/* ------------------------------ 出图 ------------------------------ */

/* 别清空 OUT：上一轮的 A-xuan 五张留着，三课三套要一起给人看 */
mkdirSync(OUT, { recursive: true })

const jobs: [string, Style, () => Node[]][] = [
  ['B-changfangti-1-cover', BANSHU, mathCover],
  ['B-changfangti-2-hook', BANSHU, mathHook],
  ['B-changfangti-3-count', BANSHU, mathCount],
  ['B-changfangti-4-example', BANSHU, mathExample],
  ['B-changfangti-5-board', BANSHU, mathBoard],
  ['C-english-1-cover', QINGXIN, enCover],
  ['C-english-2-words', QINGXIN, enWords],
  ['C-english-3-new', QINGXIN, enNewWords],
  ['C-english-4-talk', QINGXIN, enTalk],
  ['C-english-5-practice', QINGXIN, enPractice],
]

const svgDir = '/tmp/yike-style-svg2'
rmSync(svgDir, { recursive: true, force: true })
mkdirSync(svgDir, { recursive: true })

for (const [name, style, fn] of jobs) {
  const svg = svgOf(fn(), style)
  writeFileSync(`${svgDir}/${name}.svg`, svg, 'utf8')
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng()
  writeFileSync(`${OUT}/${name}.png`, png)
}
console.log(`✓ ${jobs.length} 张 → ${OUT}`)
rmSync(fileURLToPath(import.meta.url), { force: true })