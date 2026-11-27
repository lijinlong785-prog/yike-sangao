// 独立课件：《小蝌蚪找妈妈》水彩绘本风 PPT（不走项目课件流水线）
// 素材：.tadpole/*.png（ImageGen 原图裁底 8% 去水印）；原文：部编版二上第 1 课
import pptxgen from 'pptxgenjs'
import { resolve } from 'node:path'

const A = (n) => resolve('.tadpole/jpg', n + '.jpg')
const W = 13.333, H = 7.5
// 纸与色：奶油纸底 + 池塘绿 / 水蓝 / 暖珊瑚 / 荷粉 / 阳光黄
const PAPER = 'FAF7EE', CARD = 'FFFDF7', LINE = 'D9E3D2'
const INK = '33413A', SOFT = '6B7A6C'
const POND = '4E7D5B', POND_D = '2F5D46'
const WATER = '5E93A8', WATER_D = '3E7C93'
const CORAL = 'E8836B', CORAL_D = 'C05F45'
const SUN = 'D9A441'
const G_T = 'EAF2E4', W_T = 'E4F0F4', C_T = 'FBEAE3', S_T = 'FBF0DC'
const F_TITLE = 'Yuanti SC', F_BODY = 'PingFang SC', F_QUOTE = 'Kaiti SC'

const pptx = new pptxgen()
// ONLY=n 只建第 n 页（逐页目验用）；OUT 改输出名
const ONLY = +(process.env.ONLY || 0)
let sn = 0
const addS = () => {
  sn++
  if (ONLY && sn !== ONLY) return new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true } })
  return pptx.addSlide()
}
pptx.layout = 'LAYOUT_WIDE'
pptx.author = '水彩绘本课件'
pptx.company = '池塘里的故事'
pptx.title = '小蝌蚪找妈妈 · 水彩绘本课件'
pptx.subject = '部编版语文二年级上册第 1 课'

const rr = (s, x, y, w, h, fill, line) => s.addShape('roundRect', {
  x, y, w, h, rectRadius: 0.12, fill: { color: fill },
  line: line ? { color: line, width: 1 } : { type: 'none' },
})
const pill = (s, x, y, text, fill, color, fs = 11, w) => {
  const ww = w ?? text.length * (fs / 72) * 1.06 + 0.42
  s.addShape('roundRect', { x, y, w: ww, h: fs / 72 + 0.22, rectRadius: 0.11, fill: { color: fill }, line: { type: 'none' } })
  s.addText(text, { x, y, w: ww, h: fs / 72 + 0.22, fontFace: F_BODY, fontSize: fs, color, bold: true, align: 'center', valign: 'middle' })
  return ww
}
const txt = (s, t, o) => s.addText(t, { fontFace: F_BODY, color: INK, valign: 'top', ...o })
const quote = (s, t, o) => s.addText(t, { fontFace: F_QUOTE, color: INK, valign: 'top', lineSpacingMultiple: 1.12, ...o })
// 对话气泡：圆角块 + 朝右的小尾巴（无边框，绘本平涂）
const bubble = (s, x, y, w, h, fill, who, whoColor, body, fs = 17) => {
  txt(s, who, { x: x + 0.05, y: y - 0.3, w: 3, h: 0.28, fontSize: 12, bold: true, color: whoColor })
  rr(s, x, y, w, h, fill)
  s.addShape('triangle', { x: x + w - 0.12, y: y + h * 0.5 - 0.16, w: 0.3, h: 0.32, rotate: 90, fill: { color: fill }, line: { type: 'none' } })
  quote(s, body, { x: x + 0.28, y: y + 0.12, w: w - 0.56, h: h - 0.24, fontSize: fs })
}
const frame = (s, x, y, w, h, img, caption) => {
  rr(s, x, y, w, h, CARD, LINE)
  const iw = Math.min(w - 0.3, (h - 0.62) * (1024 / 942)), ih = iw / (1024 / 942)
  s.addImage({ path: A(img), x: x + (w - iw) / 2, y: y + 0.15, w: iw, h: ih })
  txt(s, caption, { x: x + 0.1, y: y + h - 0.34, w: w - 0.2, h: 0.28, fontSize: 11.5, color: SOFT, align: 'center' })
}
// 每页统一的页眉页脚：小标签 + 大标题 + 页码圆 + 纸脚线
const chrome = (s, tag, title, page, tagFill = G_T, tagColor = POND_D) => {
  s.background = { color: PAPER }
  pill(s, 0.55, 0.42, tag, tagFill, tagColor)
  txt(s, title, { x: 0.55, y: 0.84, w: 11, h: 0.62, fontSize: 30, bold: true, fontFace: F_TITLE, color: INK })
  s.addShape('ellipse', { x: 12.28, y: 0.42, w: 0.52, h: 0.52, fill: { color: POND }, line: { type: 'none' } })
  txt(s, String(page), { x: 12.28, y: 0.42, w: 0.52, h: 0.52, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
  s.addShape('line', { x: 0.55, y: 7.06, w: 12.23, h: 0, line: { color: LINE, width: 1 } })
  txt(s, '《小蝌蚪找妈妈》 · 水彩绘本课件', { x: 0.55, y: 7.12, w: 6, h: 0.26, fontSize: 9, color: SOFT })
  txt(s, '部编版 · 二年级上册', { x: 8.78, y: 7.12, w: 4, h: 0.26, fontSize: 9, color: SOFT, align: 'right' })
}

/* ---------- 1 封面：满版池塘 + 左侧奶油书名卡 ---------- */
{
  const s = addS()
  s.background = { color: PAPER }
  s.addImage({ path: A('cover'), x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } })
  rr(s, 0.62, 1.42, 5.05, 4.05, PAPER, LINE)
  pill(s, 0.98, 1.78, '部编版 · 二年级上册 · 第 1 课', CORAL, 'FFFFFF', 11, 3.5)
  txt(s, '小蝌蚪找妈妈', { x: 0.95, y: 2.42, w: 4.5, h: 0.95, fontSize: 44, bold: true, fontFace: F_TITLE, color: POND_D })
  s.addShape('line', { x: 1.0, y: 3.5, w: 1.3, h: 0, line: { color: CORAL, width: 2.5 } })
  quote(s, '大大的脑袋，长长的尾巴，\n一群小蝌蚪出发找妈妈啦！', { x: 0.98, y: 3.72, w: 4.4, h: 0.95, fontSize: 17, color: SOFT })
  txt(s, '水彩绘本课件 · 共 12 页', { x: 0.98, y: 4.92, w: 4.4, h: 0.3, fontSize: 11, color: SOFT })
  s.addNotes('开场：请小朋友看图——池塘里有一群小黑点，甩着尾巴游来游去，它们是谁？它们在干什么？揭题：小蝌蚪找妈妈。齐读课题两遍。')
}

/* ---------- 2 小蝌蚪的样子 ---------- */
{
  const s = addS()
  chrome(s, '课文 · 第 1 自然段', '池塘里的小蝌蚪', 2)
  rr(s, 0.55, 1.75, 6.3, 1.7, CARD, LINE)
  pill(s, 0.8, 1.95, '读一读', W_T, WATER_D)
  quote(s, '池塘里有一群小蝌蚪，大大的脑袋，黑灰色的身子，甩着长长的尾巴，快活地游来游去。', { x: 0.85, y: 2.42, w: 5.75, h: 0.95, fontSize: 18 })
  txt(s, '它们长什么样？圈出三个词', { x: 0.55, y: 3.72, w: 6, h: 0.35, fontSize: 14, bold: true, color: SOFT })
  pill(s, 0.55, 4.15, '大大的脑袋', G_T, POND_D, 14)
  pill(s, 2.75, 4.15, '黑灰色的身子', W_T, WATER_D, 14)
  pill(s, 5.2, 4.15, '长长的尾巴', C_T, CORAL_D, 14)
  rr(s, 0.55, 4.95, 6.3, 1.28, S_T)
  txt(s, '演一演', { x: 0.8, y: 5.11, w: 2, h: 0.3, fontSize: 12, bold: true, color: SUN })
  quote(s, '甩着尾巴游来游去——请小朋友用手当尾巴，快活地游一游。', { x: 0.8, y: 5.45, w: 5.8, h: 0.65, fontSize: 14.5 })
  txt(s, '「快活」就是快快乐乐——读出开心的语气。', { x: 0.55, y: 6.45, w: 6.3, h: 0.3, fontSize: 12, color: SOFT })
  frame(s, 7.15, 1.7, 5.63, 5.25, 'tadpoles', '一群小蝌蚪 · 快活地游来游去')
  s.addNotes('齐读第 1 自然段。提问：小蝌蚪长什么样？引导圈出「大脑袋、黑灰色身子、长尾巴」。做动作读「甩着长长的尾巴」，读出快活。')
}

/* ---------- 3 找妈妈路线图 ---------- */
{
  const s = addS()
  chrome(s, '课文 · 整体感知', '找妈妈路线图', 3)
  const stops = [
    { img: 'tadpoles', name: '小蝌蚪出发', clue: '大脑袋 · 长尾巴', tint: W_T, nc: WATER_D },
    { img: 'carp', name: '鲤鱼阿姨', clue: '四条腿，宽嘴巴', tint: G_T, nc: POND_D },
    { img: 'turtle', name: '乌龟', clue: '大眼睛，绿衣裳', tint: G_T, nc: POND_D },
    { img: 'frog', name: '青蛙妈妈', clue: '找到啦！', tint: C_T, nc: CORAL_D },
  ]
  const cw = 2.55, gap = 0.65, y = 2.62, ch = 3.42
  const badges = ['长出了两条后腿', '长出了两条前腿', '尾巴变短了']
  stops.forEach((st, i) => {
    const x = 0.55 + i * (cw + gap)
    rr(s, x, y, cw, ch, CARD, LINE)
    s.addImage({ path: A(st.img), x: x + (cw - 1.62) / 2, y: y + 0.22, w: 1.62, h: 1.49 })
    txt(s, st.name, { x, y: y + 1.82, w: cw, h: 0.4, fontSize: 17, bold: true, fontFace: F_TITLE, color: st.nc, align: 'center' })
    quote(s, st.clue, { x: x + 0.1, y: y + 2.3, w: cw - 0.2, h: 0.75, fontSize: 13, color: SOFT, align: 'center' })
    txt(s, ['第 1 站 · 出发', '第 2 站', '第 3 站', '终点 · 荷叶上'][i], { x, y: y + ch - 0.4, w: cw, h: 0.3, fontSize: 10, color: SOFT, align: 'center' })
    if (i < 3) {
      const gx = x + cw
      s.addShape('line', { x: gx + 0.06, y: y + 1.5, w: gap - 0.12, h: 0, line: { color: POND, width: 1.75, dashType: 'dash', endArrowType: 'triangle' } })
      rr(s, gx + gap / 2 - 1.05, 1.72, 2.1, 0.66, S_T)
      txt(s, '过了几天', { x: gx + gap / 2 - 1.05, y: 1.78, w: 2.1, h: 0.24, fontSize: 9.5, color: SUN, align: 'center' })
      txt(s, badges[i], { x: gx + gap / 2 - 1.05, y: 2.04, w: 2.1, h: 0.3, fontSize: 11.5, bold: true, color: SUN, align: 'center' })
    }
  })
  rr(s, 0.55, 6.28, 12.23, 0.6, W_T)
  quote(s, '小蝌蚪游哇游，过了几天……游哇游，过了几天……游哇游，过了几天——一边游，一边长大。', { x: 0.8, y: 6.36, w: 11.7, h: 0.45, fontSize: 14, color: WATER_D })
  s.addNotes('默读全文，小组合作摆路线：先遇谁、再遇谁、最后找到谁。把三次「过了几天」的变化贴到箭头上方，发现小蝌蚪是边找边长大的。')
}

/* ---------- 4/5/6 三次相遇：对话气泡页 ---------- */
const meets = [
  {
    page: 4, tag: '课文 · 第 2 自然段', title: '迎上去，问鲤鱼阿姨', img: 'carp', cap: '鲤鱼妈妈在教小鲤鱼捕食',
    verb: '迎上去', verbSay: '面对面游过去', ask: '鲤鱼阿姨，我们的妈妈在哪里？',
    answer: '你们的妈妈四条腿，宽嘴巴。你们到那边去找吧！', clues: ['四条腿', '宽嘴巴'],
    note: '分角色读：小蝌蚪要有礼貌、着急；鲤鱼阿姨要温和。做动作理解「迎」——面对面走过去。线索只说了一半，为下文认错妈妈埋下伏笔。',
  },
  {
    page: 5, tag: '课文 · 第 3 自然段', title: '追上去，叫乌龟妈妈', img: 'turtle', cap: '乌龟摆动着四条腿在水里游',
    verb: '追上去', verbSay: '从后面赶上去', ask: '妈妈，妈妈！',
    answer: '我不是你们的妈妈。你们的妈妈头顶上有两只大眼睛，披着绿衣裳。你们到那边去找吧！', clues: ['头顶两只大眼睛', '披着绿衣裳'],
    note: '讨论：为什么把乌龟当妈妈？（乌龟也有四条腿、宽嘴巴。）乌龟在前方游，所以是「追」。读出乌龟的慢吞吞和小蝌蚪的着急。',
  },
  {
    page: 6, tag: '课文 · 第 4–5 自然段', title: '荷叶上，找到妈妈啦！', img: 'frog', cap: '荷叶上蹲着一只大青蛙',
    verb: '游过去', verbSay: '平平地游到跟前', ask: '妈妈，妈妈！',
    answer: '好孩子，你们已经长成青蛙了，快跳上来吧！', clues: ['碧绿的衣裳', '雪白的肚皮', '一对大眼睛'],
    note: '齐读第 4 自然段，圈出「披、露、鼓」三个动词，做动作体会用词的准确。第 5 自然段读出兴奋与疼爱；「蹬、跳、蹦」一连串动作请学生演一演。',
  },
]
for (const m of meets) {
  const s = addS()
  chrome(s, m.tag, m.title, m.page)
  pill(s, 0.55, 1.72, m.verb, C_T, CORAL_D, 14)
  txt(s, m.verbSay, { x: 0.55 + m.verb.length * 0.24 + 0.62, y: 1.78, w: 3.4, h: 0.32, fontSize: 12, color: SOFT })
  bubble(s, 0.55, 2.5, 6.1, 0.85, W_T, '小蝌蚪', WATER_D, `“${m.ask}”`, 17)
  const ay = 3.82
  const ah = m.page === 5 ? 1.35 : m.page === 4 ? 1.15 : 0.95
  bubble(s, 0.55, ay, 6.1, ah, G_T, m.page === 4 ? '鲤鱼阿姨' : m.page === 5 ? '乌龟' : '青蛙妈妈', POND_D, `“${m.answer}”`, 16.5)
  const cy = ay + ah + 0.42
  if (m.page === 6) {
    rr(s, 0.55, cy, 6.1, 1.02, CARD, LINE)
    txt(s, '青蛙妈妈的样子', { x: 0.8, y: cy + 0.1, w: 3, h: 0.28, fontSize: 11, bold: true, color: SOFT })
    quote(s, [
      { text: '披着', options: { bold: true, color: CORAL_D } }, { text: '碧绿的衣裳，' },
      { text: '露着', options: { bold: true, color: WATER_D } }, { text: '雪白的肚皮，' },
      { text: '鼓着', options: { bold: true, color: POND_D } }, { text: '一对大眼睛。' },
    ], { x: 0.8, y: cy + 0.42, w: 5.6, h: 0.5, fontSize: 14.5 })
  } else {
    rr(s, 0.55, cy, 6.1, 1.02, CARD, LINE)
    txt(s, '得到的线索', { x: 0.8, y: cy + 0.1, w: 2, h: 0.28, fontSize: 11, bold: true, color: SOFT })
    let cx = 0.8
    for (const c of m.clues) cx += pill(s, cx, cy + 0.45, c, S_T, SUN, 12.5) + 0.18
  }
  if (m.page === 6) {
    rr(s, 0.55, cy + 1.18, 6.1, 0.52, C_T)
    quote(s, '后腿一蹬，向前一跳，蹦到了荷叶上。', { x: 0.8, y: cy + 1.26, w: 5.6, h: 0.38, fontSize: 13.5, color: CORAL_D })
  }
  frame(s, 7.15, 1.7, 5.63, 5.25, m.img, m.cap)
  s.addNotes(m.note)
}

/* ---------- 7 变身时间轴 ---------- */
{
  const s = addS()
  chrome(s, '科学 · 变态发育', '小蝌蚪变青蛙', 7)
  const iw = 12.23, ih = iw / (2560 / 993)
  s.addImage({ path: A('metamorphosis'), x: 0.55, y: 1.55, w: iw, h: ih })
  const stages = [
    { f: 0.135, n: '小蝌蚪', d: '大脑袋 · 长尾巴', t: W_T, c: WATER_D },
    { f: 0.305, n: '长后腿', d: '过了几天', t: G_T, c: POND_D },
    { f: 0.475, n: '长前腿', d: '又过了几天', t: G_T, c: POND_D },
    { f: 0.66, n: '尾巴变短', d: '游到荷花旁', t: S_T, c: SUN },
    { f: 0.855, n: '小青蛙', d: '尾巴不见了', t: C_T, c: CORAL_D },
  ]
  stages.forEach((st, i) => {
    const cx = 0.55 + iw * st.f, bw = 2.0
    rr(s, cx - bw / 2, 6.36, bw, 0.62, st.t)
    s.addShape('ellipse', { x: cx - bw / 2 + 0.1, y: 6.47, w: 0.4, h: 0.4, fill: { color: st.c }, line: { type: 'none' } })
    txt(s, String(i + 1), { x: cx - bw / 2 + 0.1, y: 6.47, w: 0.4, h: 0.4, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    txt(s, st.n, { x: cx - bw / 2 + 0.56, y: 6.4, w: bw - 0.62, h: 0.3, fontSize: 13.5, bold: true, color: st.c })
    txt(s, st.d, { x: cx - bw / 2 + 0.56, y: 6.68, w: bw - 0.62, h: 0.26, fontSize: 10, color: SOFT })
  })
  s.addNotes('按顺序说变化：大脑袋长尾巴 → 长两条后腿 → 长两条前腿 → 尾巴变短 → 尾巴不见了。对照课文三次「过了几天」，明白成长需要时间。可补充：青蛙小时候和长大后不一样，这叫变态发育。')
}

/* ---------- 8 和妈妈捉害虫 ---------- */
{
  const s = addS()
  chrome(s, '课文 · 第 6 自然段', '跟着妈妈，天天捉害虫', 8)
  rr(s, 0.55, 1.75, 4.5, 1.75, CARD, LINE)
  pill(s, 0.8, 1.95, '读一读', W_T, WATER_D)
  quote(s, '不知什么时候，小青蛙的尾巴已经不见了。他们跟着妈妈，天天去捉害虫。', { x: 0.82, y: 2.4, w: 3.98, h: 1.0, fontSize: 16 })
  rr(s, 0.55, 3.75, 4.5, 1.85, G_T)
  txt(s, '青蛙是捉虫能手', { x: 0.8, y: 3.92, w: 4, h: 0.35, fontSize: 16, bold: true, color: POND_D })
  txt(s, '一只青蛙一天大约能吃七十只害虫，一年能捉上万只，是庄稼的好朋友。', { x: 0.8, y: 4.32, w: 4.0, h: 0.85, fontSize: 12.5, color: INK, lineSpacingMultiple: 1.15 })
  pill(s, 0.8, 5.15, '保护青蛙，从我做起', CORAL, 'FFFFFF', 12)
  rr(s, 0.55, 5.85, 4.5, 0.85, S_T)
  quote(s, '你想对捉害虫的小青蛙说一句什么话？', { x: 0.8, y: 6.0, w: 4.0, h: 0.55, fontSize: 13.5, color: SUN })
  rr(s, 5.35, 1.7, 7.43, 5.25, CARD, LINE)
  s.addImage({ path: A('ending'), x: 5.5, y: 1.85, w: 7.13, h: 4.62, sizing: { type: 'cover', w: 7.13, h: 4.62 } })
  txt(s, '荷叶上 · 青蛙妈妈带小青蛙捉害虫', { x: 5.45, y: 6.55, w: 7.23, h: 0.3, fontSize: 11.5, color: SOFT, align: 'center' })
  s.addNotes('齐读末段。看图说话：青蛙妈妈和小青蛙在干什么？拓展：青蛙一天大约吃七十只害虫，讨论为什么要保护青蛙、怎样保护。')
}

/* ---------- 9 生字乐园 ---------- */
{
  const s = addS()
  chrome(s, '识字 · 我会写', '生字乐园', 9)
  const chars = [
    ['liǎng', '两', '两个'], ['jiù', '就', '就是'], ['nǎ', '哪', '哪里'],
    ['kuān', '宽', '宽嘴巴'], ['dǐng', '顶', '头顶'], ['dù', '肚', '肚皮'],
    ['pí', '皮', '皮球'], ['hái', '孩', '孩子'], ['tiào', '跳', '跳上来'],
  ]
  const tints = [[G_T, POND_D], [W_T, WATER_D], [C_T, CORAL_D], [S_T, SUN]]
  chars.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const x = 0.55 + col * 4.12, y = 1.72 + row * 1.66
    const [t, cc] = tints[i % 4]
    rr(s, x, y, 3.94, 1.5, CARD, LINE)
    rr(s, x, y, 0.14, 1.5, t)
    txt(s, c[0], { x: x + 0.2, y: y + 0.12, w: 3.6, h: 0.28, fontSize: 12, color: SOFT, align: 'center' })
    txt(s, c[1], { x: x + 0.2, y: y + 0.36, w: 3.6, h: 0.72, fontSize: 34, bold: true, fontFace: F_QUOTE, color: cc, align: 'center' })
    txt(s, c[2], { x: x + 0.2, y: y + 1.12, w: 3.6, h: 0.28, fontSize: 12, color: SOFT, align: 'center' })
  })
  txt(s, '写一写：「宽」是宝盖头，「跳」是足字旁——足字旁的字大多和脚的动作有关。', { x: 0.55, y: 6.72, w: 12.2, h: 0.3, fontSize: 12, color: SOFT })
  s.addNotes('开火车认读九个会写字并组词。观察结构：两、就、哪、宽、顶、肚、皮、孩、跳。重点范写「宽」（宝盖头罩住下面）与「跳」（足字旁捺变提）。学生描红临写，巡视纠姿。')
}

/* ---------- 10 三个动词 ---------- */
{
  const s = addS()
  chrome(s, '词语 · 演一演', '三个动词，三种游法', 10)
  const verbs = [
    { v: '迎上去', p: 'yíng shàng qù', mean: '面对面游过去', sent: '就迎上去，问：“鲤鱼阿姨，我们的妈妈在哪里？”', t: C_T, c: CORAL_D, mode: 'face', mood: '有礼貌 · 着急' },
    { v: '追上去', p: 'zhuī shàng qù', mean: '从后面赶上去', sent: '连忙追上去，叫着：“妈妈，妈妈！”', t: G_T, c: POND_D, mode: 'chase', mood: '兴奋 · 连忙' },
    { v: '游过去', p: 'yóu guò qù', mean: '平平地游到跟前', sent: '小蝌蚪游过去，叫着：“妈妈，妈妈！”', t: W_T, c: WATER_D, mode: 'swim', mood: '开心 · 激动' },
  ]
  verbs.forEach((vb, i) => {
    const x = 0.55 + i * 4.12, y = 1.78
    rr(s, x, y, 3.94, 4.5, CARD, LINE)
    rr(s, x, y, 3.94, 0.14, vb.t)
    txt(s, vb.v, { x: x + 0.2, y: y + 0.3, w: 3.54, h: 0.55, fontSize: 27, bold: true, fontFace: F_TITLE, color: vb.c, align: 'center' })
    txt(s, vb.p, { x: x + 0.2, y: y + 0.88, w: 3.54, h: 0.26, fontSize: 11, color: SOFT, align: 'center' })
    // 小示意图：圆点 = 小蝌蚪 / 对方，箭头 = 游的方向
    const dy = y + 1.42, lx = x + 0.62, rx = x + 3.0
    const dot = (dx, col) => s.addShape('ellipse', { x: dx, y: dy, w: 0.34, h: 0.34, fill: { color: col }, line: { type: 'none' } })
    const arrow = (ax, aw, dir) => s.addShape('line', dir === 'l'
      ? { x: ax + aw, y: dy + 0.17, w: aw, h: 0, line: { color: vb.c, width: 2, endArrowType: 'triangle' }, flipH: true }
      : { x: ax, y: dy + 0.17, w: aw, h: 0, line: { color: vb.c, width: 2, endArrowType: 'triangle' } })
    if (vb.mode === 'face') { dot(lx, INK); dot(rx, CORAL); arrow(lx + 0.42, 0.72, 'r'); arrow(rx - 1.14, 0.72, 'l') }
    if (vb.mode === 'chase') { dot(lx, INK); dot(rx, POND); arrow(lx + 0.42, 0.62, 'r'); arrow(rx - 1.2, 0.86, 'r') }
    if (vb.mode === 'swim') { dot(lx, INK); dot(rx, POND); arrow(lx + 0.42, 1.9, 'r') }
    txt(s, vb.mean, { x: x + 0.2, y: y + 2.0, w: 3.54, h: 0.32, fontSize: 13.5, bold: true, color: vb.c, align: 'center' })
    quote(s, vb.sent, { x: x + 0.3, y: y + 2.5, w: 3.34, h: 1.2, fontSize: 13.5, color: INK })
    pill(s, x + 1.22, y + 3.86, vb.mood, vb.t, vb.c, 12, 1.5)
  })
  rr(s, 0.55, 6.45, 12.23, 0.5, S_T)
  txt(s, '演一演：请三位同学上台，把「迎、追、游」做给大家看——位置不一样，心情也不一样！', { x: 0.8, y: 6.52, w: 11.7, h: 0.36, fontSize: 13, bold: true, color: SUN })
  s.addNotes('对比三个动词：鲤鱼阿姨面对面，所以「迎」；乌龟在前面游，所以「追」；青蛙在荷叶上，所以「游」。请学生上台演一演，再换词读句子体会不能互换。')
}

/* ---------- 11 拓展：池塘里的邻居 ---------- */
{
  const s = addS()
  chrome(s, '拓展 · 认一认', '池塘里的邻居', 11, W_T, WATER_D)
  const pals = [
    { img: 'duck', n: '鸭妈妈', d: '嘴巴扁扁，嘎嘎嘎', t: S_T, c: SUN },
    { img: 'goldfish', n: '金鱼', d: '尾巴像纱裙，吐泡泡', t: C_T, c: CORAL_D },
    { img: 'crab', n: '螃蟹', d: '八条腿，横着走', t: W_T, c: WATER_D },
  ]
  pals.forEach((p, i) => {
    const x = 0.55 + i * 4.12, y = 1.78
    rr(s, x, y, 3.94, 4.3, CARD, LINE)
    s.addImage({ path: A(p.img), x: x + 0.72, y: y + 0.25, w: 2.5, h: 2.3 })
    txt(s, p.n, { x: x + 0.2, y: y + 2.72, w: 3.54, h: 0.42, fontSize: 19, bold: true, fontFace: F_TITLE, color: p.c, align: 'center' })
    txt(s, p.d, { x: x + 0.2, y: y + 3.2, w: 3.54, h: 0.32, fontSize: 13, color: SOFT, align: 'center' })
    pill(s, x + 1.32, y + 3.68, '不是妈妈', p.t, p.c, 11, 1.3)
  })
  rr(s, 0.55, 6.3, 12.23, 0.62, G_T)
  quote(s, '想一想：它们是小蝌蚪的妈妈吗？用上「四条腿、宽嘴巴、绿衣裳」说一说理由。', { x: 0.8, y: 6.4, w: 11.7, h: 0.45, fontSize: 14, color: POND_D })
  s.addNotes('拓展说话训练：出示鸭妈妈、金鱼、螃蟹，请学生用课文里的线索判断「是不是妈妈」，说清理由（几条腿、嘴巴宽不宽、穿不穿绿衣裳），把语言运用落回课文。')
}

/* ---------- 12 想一想 + 谢谢 ---------- */
{
  const s = addS()
  chrome(s, '回顾 · 说一说', '想一想，说一说', 12, C_T, CORAL_D)
  frame(s, 0.55, 1.7, 4.6, 4.62, 'frog', '披着绿衣裳的青蛙妈妈')
  const qs = [
    '小蝌蚪为什么会把乌龟当成妈妈？',
    '用上「披着、露着、鼓着」，说说青蛙妈妈的样子。',
    '小青蛙天天跟着妈妈捉害虫，你想对它说什么？',
  ]
  qs.forEach((q, i) => {
    const y = 1.75 + i * 1.5
    rr(s, 5.5, y, 7.28, 1.3, CARD, LINE)
    s.addShape('ellipse', { x: 5.75, y: y + 0.42, w: 0.46, h: 0.46, fill: { color: [POND, WATER, CORAL][i] }, line: { type: 'none' } })
    txt(s, String(i + 1), { x: 5.75, y: y + 0.42, w: 0.46, h: 0.46, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    quote(s, q, { x: 6.42, y: y + 0.28, w: 6.1, h: 0.8, fontSize: 16 })
  })
  rr(s, 5.5, 6.3, 7.28, 0.62, C_T)
  txt(s, '谢谢观看 · 下节课接着读池塘里的故事', { x: 5.5, y: 6.3, w: 7.28, h: 0.62, fontSize: 14, bold: true, color: CORAL_D, align: 'center', valign: 'middle' })
  s.addNotes('回顾三问：认错妈妈的原因（线索不全）、用三个动词复述青蛙样子、情感表达（保护青蛙）。同桌互说再指名说。结课：谢谢观看，下节课继续池塘里的故事。')
}

await pptx.writeFile({ fileName: process.env.OUT || '《小蝌蚪找妈妈》-课件.pptx' })
console.log('OK', ONLY ? `slide ${ONLY}` : '12 slides', '->', process.env.OUT || '《小蝌蚪找妈妈》-课件.pptx')