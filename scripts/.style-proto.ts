/* 临时设计稿：同一课《桂花雨》× 三种风格 × 五页，渲成 PNG 给人看。
 * 跑完即删。这些 Placed[] 是「定稿前的样子稿」，定了之后搬进 deck2/place.ts。
 *
 * 三种风格要解决的是同一件事：把课文材料摆到纸上。
 *   A 宣纸   —— 水墨、居中、朱印、竖线
 *   B 板书   —— 黑板粉笔、虚线框、黄色重点
 *   C 清新   —— 白纸圆角卡片、彩色标题条、词卡
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Placed } from '../src/lib/deck2/place'

const W = 1280
const H = 720
const QL_SCALE = 1.7
const OUT = 'screenshots/styles'

interface Style {
  id: string
  name: string
  paper: string
  surface: string
  ink: string
  muted: string
  accent: string
  line: string
  fontTitle: 'song' | 'kai' | 'hei'
  fontBody: 'song' | 'kai' | 'hei'
  /** 卡片圆角（px）；纸墨族是 0 */
  radius: number
}

const STYLES: Style[] = [
  {
    id: 'A-xuan',
    name: '宣纸',
    paper: '#F7F2E7',
    surface: '#EFE7D6',
    ink: '#2A2620',
    muted: '#8A8172',
    accent: '#8C3A2E',
    line: '#D9CFBA',
    fontTitle: 'kai',
    fontBody: 'song',
    radius: 0,
  },
  {
    id: 'B-heiban',
    name: '板书',
    paper: '#2A3A32',
    surface: '#33463C',
    ink: '#F0EDE2',
    muted: '#A8B5AA',
    accent: '#E9C46A',
    line: '#7C8F80',
    fontTitle: 'kai',
    fontBody: 'kai',
    radius: 6,
  },
  {
    id: 'C-qingxin',
    name: '清新',
    paper: '#FFFDF8',
    surface: '#F2F6EC',
    ink: '#2B3026',
    muted: '#7C8474',
    accent: '#E07A5F',
    line: '#DDE5D4',
    fontTitle: 'hei',
    fontBody: 'hei',
    radius: 18,
  },
]

/* ------------------------------ 内容（真课文材料） ------------------------------ */

const TOPIC = '《桂花雨》'
const META = '小学语文 · 五年级上册'
const BYLINE = '五年级　　班'
const AUTHOR = '琦君'

const CHARS: [string, string][] = [
  ['箩', 'luó'],
  ['杭', 'háng'],
  ['懂', 'dǒng'],
  ['兰', 'lán'],
  ['婆', 'pó'],
  ['糕', 'gāo'],
  ['饼', 'bǐng'],
  ['浸', 'jìn'],
  ['缠', 'chán'],
  ['茶', 'chá'],
]

const QUOTE = '桂花盛开的时候，不说香飘十里，至少前后左右十几家邻居，没有不浸在桂花香里的。'
const QUOTE_FROM = '琦君《桂花雨》'

const WORDS: [string, string][] = [
  ['纷纷扬扬', '（雪、花、叶）飘落的样子'],
  ['香飘十里', '香气飘得很远'],
  ['摇落', '摇动使落下'],
  ['沉浸', '浸在里头，全神投入'],
]

const BOARD: [string, string][] = [
  ['爱桂花', '香'],
  ['摇桂花', '乐'],
  ['念桂花', '情'],
]

/* ------------------------------ 三种版式 ------------------------------ */

/** 页框小字与页码在三种风格里位置一致（母版级的一致性） */
function foot(s: Style, no: number): Placed[] {
  return [
    { kind: 'text', x: 0.06, y: 0.925, w: 0.6, h: 0.04, text: TOPIC, size: 11, color: s.muted, font: s.fontBody },
    { kind: 'text', x: 0.86, y: 0.925, w: 0.08, h: 0.04, text: `${no} / 10`, size: 11, color: s.muted, align: 'right', font: s.fontBody },
  ]
}

function coverXuan(s: Style): Placed[] {
  return [
    { kind: 'rect', x: 0.06, y: 0.62, w: 0.44, h: 0.0018, fill: s.line },
    { kind: 'rect', x: 0.06, y: 0.628, w: 0.44, h: 0.0018, fill: s.line },
    { kind: 'text', x: 0.06, y: 0.28, w: 0.5, h: 0.16, text: TOPIC, size: 76, color: s.ink, font: s.fontTitle },
    { kind: 'text', x: 0.06, y: 0.46, w: 0.5, h: 0.06, text: AUTHOR, size: 20, color: s.muted, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.65, w: 0.038, h: 0.006, fill: s.accent },
    { kind: 'text', x: 0.06, y: 0.675, w: 0.6, h: 0.05, text: META, size: 22, color: s.ink, font: s.fontTitle },
    { kind: 'text', x: 0.06, y: 0.745, w: 0.6, h: 0.05, text: BYLINE, size: 18, color: s.muted, font: s.fontTitle },
    // 朱印
    { kind: 'rect', x: 0.78, y: 0.7, w: 0.075, h: 0.13, fill: s.accent, opacity: 0.92 },
    { kind: 'text', x: 0.78, y: 0.735, w: 0.075, h: 0.06, text: '桂', size: 24, color: '#FBF6EC', align: 'center', font: s.fontTitle },
    // 雨丝（无图时的学科线稿）
    ...Array.from({ length: 9 }, (_, i) => ({
      kind: 'line' as const,
      x: 0.62 + i * 0.032,
      y: 0.16 + (i % 3) * 0.05,
      w: 0.0008,
      h: 0.34,
      fill: s.line,
      opacity: 0.9,
    })),
    ...foot(s, 1),
  ]
}

function coverHeiban(s: Style): Placed[] {
  return [
    { kind: 'rect', x: 0.07, y: 0.2, w: 0.86, h: 0.34, fill: s.surface, opacity: 0.55 },
    { kind: 'text', x: 0.1, y: 0.25, w: 0.6, h: 0.16, text: TOPIC, size: 72, color: s.ink, font: s.fontTitle },
    { kind: 'text', x: 0.1, y: 0.41, w: 0.5, h: 0.05, text: `——  ${AUTHOR}`, size: 20, color: s.muted, font: s.fontTitle },
    { kind: 'rect', x: 0.1, y: 0.475, w: 0.34, h: 0.005, fill: s.accent },
    { kind: 'text', x: 0.1, y: 0.6, w: 0.7, h: 0.05, text: META, size: 22, color: s.ink, font: s.fontBody },
    { kind: 'text', x: 0.1, y: 0.67, w: 0.7, h: 0.05, text: BYLINE, size: 18, color: s.muted, font: s.fontBody },
    ...foot(s, 1),
  ]
}

function coverQingxin(s: Style): Placed[] {
  return [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: s.surface, opacity: 0.5 },
    { kind: 'rect', x: 0.06, y: 0.12, w: 0.5, h: 0.76, fill: s.paper },
    { kind: 'rect', x: 0.09, y: 0.28, w: 0.06, h: 0.012, fill: s.accent },
    { kind: 'text', x: 0.09, y: 0.33, w: 0.44, h: 0.16, text: TOPIC, size: 68, color: s.ink, font: s.fontTitle, bold: true },
    { kind: 'text', x: 0.09, y: 0.5, w: 0.44, h: 0.05, text: META, size: 22, color: s.ink },
    { kind: 'text', x: 0.09, y: 0.57, w: 0.44, h: 0.05, text: BYLINE, size: 18, color: s.muted },
    { kind: 'text', x: 0.09, y: 0.66, w: 0.44, h: 0.05, text: `作者  ${AUTHOR}`, size: 16, color: s.muted },
    // 右侧插画位：圆角大卡（图上真插画进来时替换这一块）
    { kind: 'rect', x: 0.61, y: 0.12, w: 0.33, h: 0.76, fill: '#EAF0E2' },
    { kind: 'rect', x: 0.7, y: 0.3, w: 0.15, h: 0.15, fill: '#C9D8B8' },
    { kind: 'rect', x: 0.74, y: 0.5, w: 0.07, h: 0.3, fill: '#B7C9A6' },
    ...foot(s, 1),
  ]
}

function charsXuan(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'text', x: 0.06, y: 0.08, w: 0.5, h: 0.05, text: '生字 · 会认', size: 18, color: s.accent, font: s.fontTitle },
    { kind: 'text', x: 0.06, y: 0.135, w: 0.6, h: 0.06, text: '先读准这十个字', size: 30, color: s.ink, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.215, w: 0.88, h: 0.0016, fill: s.line },
  ]
  CHARS.forEach(([ch, py], i) => {
    const col = i % 5
    const row = Math.floor(i / 5)
    const x = 0.06 + col * 0.176
    const y = 0.26 + row * 0.22
    out.push({ kind: 'text', x, y, w: 0.1, h: 0.03, text: py, size: 14, color: s.muted, font: s.fontBody })
    out.push({ kind: 'text', x, y: y + 0.035, w: 0.12, h: 0.11, text: ch, size: 54, color: s.ink, font: s.fontTitle })
    out.push({ kind: 'rect', x, y: y + 0.15, w: 0.12, h: 0.0014, fill: s.line })
  })
  out.push({ kind: 'text', x: 0.06, y: 0.74, w: 0.7, h: 0.05, text: '「浸」「缠」都是左右结构，左窄右宽', size: 18, color: s.muted, font: s.fontBody })
  return [...out, ...foot(s, 2)]
}

function charsHeiban(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'text', x: 0.06, y: 0.07, w: 0.6, h: 0.06, text: '我会读', size: 34, color: s.accent, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.145, w: 0.88, h: 0.004, fill: s.line, opacity: 0.8 },
  ]
  CHARS.forEach(([ch, py], i) => {
    const col = i % 5
    const row = Math.floor(i / 5)
    const x = 0.06 + col * 0.176
    const y = 0.22 + row * 0.3
    out.push({ kind: 'rect', x, y, w: 0.14, h: 0.26, fill: s.surface, opacity: 0.5 })
    out.push({ kind: 'text', x, y: y + 0.02, w: 0.14, h: 0.03, text: py, size: 14, color: s.muted, align: 'center', font: s.fontBody })
    out.push({ kind: 'text', x, y: y + 0.06, w: 0.14, h: 0.14, text: ch, size: 52, color: s.ink, align: 'center', font: s.fontTitle })
  })
  out.push({ kind: 'text', x: 0.06, y: 0.83, w: 0.8, h: 0.05, text: '最容易错：浸 jìn 不读 qīn', size: 18, color: s.accent, font: s.fontBody })
  return [...out, ...foot(s, 2)]
}

function charsQingxin(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'rect', x: 0.05, y: 0.05, w: 0.9, h: 0.1, fill: '#7FA98B' },
    { kind: 'text', x: 0.075, y: 0.072, w: 0.6, h: 0.055, text: '生字 · 会认', size: 30, color: '#FFFFFF' },
    { kind: 'text', x: 0.62, y: 0.078, w: 0.3, h: 0.045, text: '读准 10 个字', size: 15, color: '#EAF1E6', align: 'right' },
  ]
  CHARS.forEach(([ch, py], i) => {
    const col = i % 5
    const row = Math.floor(i / 5)
    const x = 0.05 + col * 0.181
    const y = 0.2 + row * 0.33
    out.push({ kind: 'rect', x, y, w: 0.155, h: 0.29, fill: s.surface })
    out.push({ kind: 'text', x, y: y + 0.03, w: 0.155, h: 0.03, text: py, size: 14, color: s.muted, align: 'center' })
    out.push({ kind: 'text', x, y: y + 0.075, w: 0.155, h: 0.13, text: ch, size: 50, color: s.ink, align: 'center', bold: true })
    out.push({ kind: 'rect', x: x + 0.055, y: y + 0.235, w: 0.045, h: 0.006, fill: s.accent })
  })
  out.push({ kind: 'text', x: 0.05, y: 0.87, w: 0.8, h: 0.05, text: '写字提示：懂、糕、饼、浸、缠、捡 —— 左窄右宽', size: 16, color: s.muted })
  return [...out, ...foot(s, 2)]
}

function quoteXuan(s: Style): Placed[] {
  return [
    { kind: 'text', x: 0.06, y: 0.08, w: 0.4, h: 0.05, text: '原文 · 这一句', size: 18, color: s.accent, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.24, w: 0.004, h: 0.36, fill: s.accent },
    { kind: 'text', x: 0.1, y: 0.24, w: 0.78, h: 0.32, text: QUOTE, size: 34, color: s.ink, font: s.fontTitle, lineHeight: 1.75 },
    { kind: 'text', x: 0.82, y: 0.58, w: 0.12, h: 0.04, text: QUOTE_FROM, size: 12, color: s.muted, align: 'right', font: s.fontBody },
    { kind: 'rect', x: 0.06, y: 0.68, w: 0.88, h: 0.0016, fill: s.line },
    { kind: 'text', x: 0.06, y: 0.71, w: 0.88, h: 0.05, text: '问：这里把香气写成了「浸」，用「飘」行不行？', size: 24, color: s.accent, font: s.fontTitle },
    ...foot(s, 3),
  ]
}

function quoteHeiban(s: Style): Placed[] {
  return [
    { kind: 'text', x: 0.06, y: 0.07, w: 0.5, h: 0.06, text: '读这句', size: 34, color: s.accent, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.145, w: 0.88, h: 0.004, fill: s.line, opacity: 0.8 },
    { kind: 'text', x: 0.07, y: 0.22, w: 0.86, h: 0.34, text: `“${QUOTE}”`, size: 34, color: s.ink, font: s.fontTitle, lineHeight: 1.7 },
    { kind: 'rect', x: 0.07, y: 0.58, w: 0.18, h: 0.004, fill: s.accent, opacity: 0.75 },
    { kind: 'text', x: 0.07, y: 0.61, w: 0.18, h: 0.04, text: QUOTE_FROM, size: 13, color: s.muted, font: s.fontBody },
    { kind: 'text', x: 0.07, y: 0.72, w: 0.86, h: 0.05, text: '问：「浸」换成「飘」，行不行？', size: 26, color: s.accent, font: s.fontTitle },
    ...foot(s, 3),
  ]
}

function quoteQingxin(s: Style): Placed[] {
  return [
    { kind: 'rect', x: 0.05, y: 0.05, w: 0.9, h: 0.1, fill: '#7FA98B' },
    { kind: 'text', x: 0.075, y: 0.072, w: 0.6, h: 0.055, text: '读原句 · 圈出「浸」', size: 30, color: '#FFFFFF' },
    { kind: 'rect', x: 0.05, y: 0.2, w: 0.9, h: 0.42, fill: s.surface },
    { kind: 'text', x: 0.09, y: 0.245, w: 0.82, h: 0.33, text: `“${QUOTE}”`, size: 32, color: s.ink, lineHeight: 1.7 },
    { kind: 'text', x: 0.62, y: 0.55, w: 0.28, h: 0.04, text: `—— ${QUOTE_FROM}`, size: 12, color: s.muted, align: 'right' },
    { kind: 'rect', x: 0.05, y: 0.68, w: 0.9, h: 0.16, fill: '#FBF1EC' },
    { kind: 'text', x: 0.08, y: 0.72, w: 0.84, h: 0.09, text: '问：为什么用「浸」不用「飘」？想想满院子都是香的时候是什么感觉。', size: 22, color: s.accent, lineHeight: 1.55 },
    ...foot(s, 3),
  ]
}

function wordsXuan(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'text', x: 0.06, y: 0.08, w: 0.5, h: 0.05, text: '词语 · 读一读', size: 18, color: s.accent, font: s.fontTitle },
    { kind: 'text', x: 0.06, y: 0.135, w: 0.7, h: 0.06, text: '这四个词，课文里都出现过', size: 30, color: s.ink, font: s.fontTitle },
  ]
  WORDS.forEach(([w, m], i) => {
    const y = 0.27 + i * 0.155
    out.push({ kind: 'text', x: 0.06, y, w: 0.3, h: 0.08, text: w, size: 38, color: s.ink, font: s.fontTitle })
    out.push({ kind: 'text', x: 0.38, y: y + 0.02, w: 0.55, h: 0.06, text: m, size: 20, color: s.muted, font: s.fontBody })
    out.push({ kind: 'rect', x: 0.06, y: y + 0.105, w: 0.88, h: 0.0012, fill: s.line })
  })
  return [...out, ...foot(s, 4)]
}

function wordsHeiban(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'text', x: 0.06, y: 0.07, w: 0.5, h: 0.06, text: '词语', size: 34, color: s.accent, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.145, w: 0.88, h: 0.004, fill: s.line, opacity: 0.8 },
  ]
  WORDS.forEach(([w, m], i) => {
    const x = 0.06 + (i % 2) * 0.45
    const y = 0.22 + Math.floor(i / 2) * 0.34
    out.push({ kind: 'rect', x, y, w: 0.42, h: 0.28, fill: s.surface, opacity: 0.5 })
    out.push({ kind: 'text', x: x + 0.02, y: y + 0.03, w: 0.38, h: 0.07, text: w, size: 30, color: s.accent, font: s.fontTitle })
    out.push({ kind: 'text', x: x + 0.02, y: y + 0.12, w: 0.38, h: 0.12, text: m, size: 17, color: s.ink, font: s.fontBody, lineHeight: 1.5 })
  })
  return [...out, ...foot(s, 4)]
}

function wordsQingxin(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'rect', x: 0.05, y: 0.05, w: 0.9, h: 0.1, fill: '#7FA98B' },
    { kind: 'text', x: 0.075, y: 0.072, w: 0.7, h: 0.055, text: '词语 · 读一读，说说它的意思', size: 28, color: '#FFFFFF' },
  ]
  WORDS.forEach(([w, m], i) => {
    const x = 0.05 + (i % 2) * 0.455
    const y = 0.2 + Math.floor(i / 2) * 0.36
    out.push({ kind: 'rect', x, y, w: 0.435, h: 0.32, fill: s.surface })
    out.push({ kind: 'text', x: x + 0.03, y: y + 0.04, w: 0.37, h: 0.08, text: w, size: 30, color: s.ink, bold: true })
    out.push({ kind: 'rect', x: x + 0.03, y: y + 0.13, w: 0.05, h: 0.006, fill: s.accent })
    out.push({ kind: 'text', x: x + 0.03, y: y + 0.16, w: 0.37, h: 0.12, text: m, size: 17, color: s.muted, lineHeight: 1.5 })
  })
  return [...out, ...foot(s, 4)]
}

function boardXuan(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'text', x: 0.06, y: 0.08, w: 0.5, h: 0.05, text: '板书', size: 18, color: s.accent, font: s.fontTitle },
    { kind: 'text', x: 0.06, y: 0.14, w: 0.8, h: 0.07, text: '这一课就落在这三条线上', size: 30, color: s.ink, font: s.fontTitle },
  ]
  BOARD.forEach(([n, m], i) => {
    const x = 0.1 + i * 0.3
    out.push({ kind: 'text', x, y: 0.34, w: 0.22, h: 0.08, text: `${i + 1}`, size: 16, color: s.accent, font: s.fontBody })
    out.push({ kind: 'text', x, y: 0.4, w: 0.22, h: 0.1, text: n, size: 40, color: s.ink, font: s.fontTitle })
    out.push({ kind: 'text', x, y: 0.52, w: 0.22, h: 0.05, text: `（${m}）`, size: 20, color: s.muted, font: s.fontTitle })
    if (i < BOARD.length - 1) out.push({ kind: 'text', x: x + 0.19, y: 0.43, w: 0.08, h: 0.05, text: '→', size: 28, color: s.accent, font: s.fontTitle })
  })
  out.push({ kind: 'rect', x: 0.1, y: 0.66, w: 0.8, h: 0.0016, fill: s.line })
  out.push({ kind: 'text', x: 0.1, y: 0.69, w: 0.8, h: 0.06, text: '借物抒情 · 月是故乡明', size: 26, color: s.accent, font: s.fontTitle })
  return [...out, ...foot(s, 10)]
}

function boardHeiban(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'text', x: 0.06, y: 0.07, w: 0.5, h: 0.06, text: '板书', size: 34, color: s.accent, font: s.fontTitle },
    { kind: 'rect', x: 0.06, y: 0.145, w: 0.88, h: 0.004, fill: s.line, opacity: 0.8 },
  ]
  BOARD.forEach(([n, m], i) => {
    const y = 0.24 + i * 0.19
    out.push({ kind: 'text', x: 0.08, y, w: 0.1, h: 0.06, text: `${i + 1}`, size: 22, color: s.accent, font: s.fontBody })
    out.push({ kind: 'text', x: 0.16, y, w: 0.3, h: 0.08, text: n, size: 40, color: s.ink, font: s.fontTitle })
    out.push({ kind: 'text', x: 0.5, y: y + 0.02, w: 0.35, h: 0.06, text: `—— ${m}`, size: 26, color: s.muted, font: s.fontTitle })
    if (i < BOARD.length - 1) out.push({ kind: 'text', x: 0.06, y: y + 0.11, w: 0.06, h: 0.06, text: '↓', size: 22, color: s.accent, font: s.fontTitle })
  })
  out.push({ kind: 'text', x: 0.08, y: 0.82, w: 0.8, h: 0.06, text: '借物抒情 —— 月是故乡明', size: 24, color: s.accent, font: s.fontTitle })
  return [...out, ...foot(s, 10)]
}

function boardQingxin(s: Style): Placed[] {
  const out: Placed[] = [
    { kind: 'rect', x: 0.05, y: 0.05, w: 0.9, h: 0.1, fill: '#7FA98B' },
    { kind: 'text', x: 0.075, y: 0.072, w: 0.7, h: 0.055, text: '板书 · 三条线', size: 30, color: '#FFFFFF' },
  ]
  BOARD.forEach(([n, m], i) => {
    const x = 0.05 + i * 0.3
    out.push({ kind: 'rect', x, y: 0.22, w: 0.28, h: 0.34, fill: s.surface })
    out.push({ kind: 'text', x, y: 0.26, w: 0.28, h: 0.08, text: n, size: 32, color: s.ink, align: 'center', bold: true })
    out.push({ kind: 'rect', x: x + 0.115, y: 0.365, w: 0.05, h: 0.008, fill: s.accent })
    out.push({ kind: 'text', x, y: 0.4, w: 0.28, h: 0.06, text: m, size: 22, color: s.muted, align: 'center' })
    if (i < BOARD.length - 1) out.push({ kind: 'text', x: x + 0.28, y: 0.35, w: 0.02, h: 0.05, text: '›', size: 28, color: s.accent })
  })
  out.push({ kind: 'rect', x: 0.05, y: 0.66, w: 0.9, h: 0.14, fill: '#FBF1EC' })
  out.push({ kind: 'text', x: 0.05, y: 0.7, w: 0.9, h: 0.06, text: '借物抒情 · 月是故乡明', size: 26, color: s.accent, align: 'center', bold: true })
  return [...out, ...foot(s, 10)]
}

const PAGES: { key: string; xuan: (s: Style) => Placed[]; heiban: (s: Style) => Placed[]; qingxin: (s: Style) => Placed[] }[] = [
  { key: '1-cover', xuan: coverXuan, heiban: coverHeiban, qingxin: coverQingxin },
  { key: '2-chars', xuan: charsXuan, heiban: charsHeiban, qingxin: charsQingxin },
  { key: '3-quote', xuan: quoteXuan, heiban: quoteHeiban, qingxin: quoteQingxin },
  { key: '4-words', xuan: wordsXuan, heiban: wordsHeiban, qingxin: wordsQingxin },
  { key: '5-board', xuan: boardXuan, heiban: boardHeiban, qingxin: boardQingxin },
]

/* ------------------------------ 渲 SVG ------------------------------ */

const CSS_FONT: Record<string, string> = {
  song: 'Songti SC, SimSun, serif',
  kai: 'Kaiti SC, KaiTi, serif',
  hei: 'PingFang SC, Hiragino Sans GB, sans-serif',
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 汉字 1 个字宽、拉丁 0.55：只为缩略图折行，与 pptx 的 wrap 同口径 */
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

function svgOf(placed: readonly Placed[], s: Style): string {
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${s.paper}"/>`]
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(W / QL_SCALE).toFixed(2)}" height="${(H / QL_SCALE).toFixed(2)}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${body.join('')}</svg>`
}

/* ------------------------------ 出图 ------------------------------ */

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const tmp = '/tmp/yike-style-svg'
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })

for (const st of STYLES) {
  for (const pg of PAGES) {
    const fn = st.id.startsWith('A') ? pg.xuan : st.id.startsWith('B') ? pg.heiban : pg.qingxin
    const svg = svgOf(fn(st), st)
    writeFileSync(`${tmp}/${st.id}-${pg.key}.svg`, svg, 'utf8')
  }
}

const files = readdirSync(tmp).filter((f) => f.endsWith('.svg'))
for (const f of files) {
  execFileSync('/usr/bin/qlmanage', ['-t', '-s', '1280', '-o', tmp, `${tmp}/${f}`], { stdio: 'ignore' })
}
for (const f of readdirSync(tmp).filter((n) => n.endsWith('.png'))) {
  renameSync(`${tmp}/${f}`, `${OUT}/${f.replace(/\.svg\.png$/, '.png')}`)
}
console.log(`✓ ${readdirSync(OUT).length} 张 → ${OUT}`)
console.log(readdirSync(OUT).sort().join('\n'))
rmSync(fileURLToPath(import.meta.url), { force: true })