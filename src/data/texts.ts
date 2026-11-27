/**
 * 课文原文（TASKS/19a §2.2）。
 *
 * 这里只放「这节课要讲的那几句」，不放整段：引句逐字，错一个字比不写更糟。
 * 老师自己在首页贴的句子优先于这张表（见 Home.tsx）；这张表只是没贴时的兜底，
 * 也是课件里「原文页」唯一的来源。
 */
export interface TextEntry {
  /** 与 examples 的 label 对齐，如 '观潮' */
  title: string
  grade: string
  /** 逐字引句：关键段逐句，长句整句留（上屏由 chunkQuote 拆页）。错一个字比不写更糟 */
  quotes: string[]
}

export const TEXTS: TextEntry[] = [
  {
    title: '观潮',
    grade: '四年级上册',
    quotes: [
      '潮来了，只见东边水天相接的地方出现了一条白线，人群又沸腾起来。',
      '那条白线很快地向我们移来，逐渐拉长，变粗，横贯江面。',
      '再近些，只见白浪翻滚，形成一堵两丈多高的水墙。',
    ],
  },
  {
    title: '桂花雨',
    grade: '五年级上册',
    /* 2026-11-22 补料：真机 27 页里 16 页薄得看不懂，根因之一是这里只有 3 句、
       摇花/晒花制糕等关键段一句都没有。现按统编版课文关键段逐句补齐，
       逐字核对 2026 统编版电子课本。旧库两句已换：「桂花开了，满树都是金黄的」
       课文里没有这句；「外地的桂花再香…金桂」是琦君散文原句，不是课文改定本。 */
    quotes: [
      '可是桂花的香气，太迷人了。',
      '桂花盛开的时候，不说香飘十里，至少前后左右十几家邻居，没有不浸在桂花香里的。',
      '摇花对我来说是件大事，我总是缠着母亲问：“妈，怎么还不摇桂花呢？”',
      '这下，我可乐了，帮大人抱着桂花树，使劲地摇。',
      '摇哇摇，桂花纷纷落下来，我们满头满身都是桂花。',
      '我喊着：“啊！真像下雨，好香的雨呀！”',
      '桂花摇落以后，挑去小枝小叶，晒上几天太阳，收在铁盒子里，可以加在茶叶里泡茶，过年时还可以做糕饼。',
      '全年，整个村子都浸在桂花的香气里。',
      '可是母亲说：“这里的桂花再香，也比不上家乡院子里的桂花。”',
      '于是，我又想起了在故乡童年时代的“摇花乐”，还有那摇落的阵阵桂花雨。',
    ],
  },
  {
    title: '狼牙山五壮士',
    grade: '六年级上册',
    /* 2026-11-22 补料：真机 31 页里这一课是「凭记忆写」的——库里没有原文，模型只能写套话。
       现按统编版六年级上册第 6 课（作者沈重，选作课文时有改动）逐句补入，
       覆盖「接受任务 / 痛击敌人 / 引上绝路 / 顶峰歼敌 / 英勇跳崖」五个板块。
       逐字核对三个来源（人教社电子课本影印、教材配套朗读稿、百科条目），三处一致才收。 */
    quotes: [
      '1941年秋，日寇集中兵力，向我晋察冀根据地大举进犯。',
      '当时，七连奉命在狼牙山一带坚持游击战争。',
      '为了拖住敌人，七连六班的五个战士一边痛击追上来的敌人，一边有计划地把大批敌人引上了狼牙山。',
      '班长马宝玉沉着地指挥战斗，让敌人走近了，才下命令狠狠地打。',
      '五位战士胜利地完成了掩护任务，准备转移。',
      '另一条通向狼牙山的顶峰棋盘陀，那儿三面都是悬崖绝壁。',
      '班长马宝玉斩钉截铁地说了一声：“走！”带头向棋盘陀走去。',
      '战士们热血沸腾，紧跟在班长后面。他们知道班长要把敌人引上绝路。',
      '顿时，石头像雹子一样，带着五位壮士的决心，带着中国人民的仇恨，向敌人头上砸去。',
      '五位壮士屹立在狼牙山顶峰，眺望着群众和部队主力远去的方向。',
      '这是英雄的中国人民坚强不屈的声音！这声音惊天动地，气壮山河！',
    ],
  },
  {
    title: '七律·长征',
    grade: '六年级上册',
    quotes: [
      '红军不怕远征难，万水千山只等闲。',
      '五岭逶迤腾细浪，乌蒙磅礴走泥丸。',
      '金沙水拍云崖暖，大渡桥横铁索寒。',
      '更喜岷山千里雪，三军过后尽开颜。',
    ],
  },
  {
    title: '春',
    grade: '七年级上册',
    quotes: [
      '盼望着，盼望着，东风来了，春天的脚步近了。',
      '小草偷偷地从土里钻出来，嫩嫩的，绿绿的。',
    ],
  },
  {
    title: '荷塘月色',
    grade: '高一下册',
    quotes: [
      '曲曲折折的荷塘上面，弥望的是田田的叶子。',
      '月光如流水一般，静静地泻在这一片叶子和花上。',
    ],
  },
  {
    title: '背影',
    grade: '八年级上册',
    quotes: [
      '我看见他戴着黑布小帽，穿着黑布大马褂，深青布棉袍，蹒跚地走到铁道边，慢慢探身下去，尚不大难。',
    ],
  },
  {
    title: '济南的冬天',
    grade: '七年级上册',
    quotes: [
      '最妙的是下点小雪呀。',
      '山上的矮松越发的青黑，树尖上顶着一髻儿白花，好像日本看护妇。',
    ],
  },
  {
    title: '草船借箭',
    grade: '五年级下册',
    quotes: [
      '诸葛亮说：“怎么敢跟都督开玩笑？我愿意立下军令状，三天造不好，甘受惩罚。”',
    ],
  },
]

/**
 * 课题比对用的归一：去掉《》、空格、间隔号、全半角引号，全角转半角。
 * 「七律·长征」与「七律长征」、「《观潮》」与「观潮」都算同一课。
 */
function normalizeTopic(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[《》〈〉「」『』“”"'’‘\s·•・‧\-—_]/g, '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase()
}

/** 按课题匹配：去掉《》、空格、·、全半角差异后 includes */
export function findText(topic: string): TextEntry | undefined {
  const t = normalizeTopic(topic)
  if (!t) return undefined
  return TEXTS.find((e) => {
    const k = normalizeTopic(e.title)
    return Boolean(k) && (t.includes(k) || k.includes(t))
  })
}

/* ------------------------- 切句（规则写死，不许发挥） ------------------------- */

const VISIBLE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF0-9A-Za-z]/

/** 数可见字：汉字 + 字母数字；标点、空白不算 */
function visibleChars(text: string): number {
  let n = 0
  for (const ch of String(text ?? '')) if (VISIBLE.test(ch)) n++
  return n
}

/** 句末标点：只认这五种（「……」也落在这里） */
const SENT_END = /[。！？；…]/

/** 小标题一行的样子：「第一段」「（二）」「《桂花雨》」——它不是正文的半句，不接到下一行去 */
const HEADING =
  /^(?:第[一二三四五六七八九十\d]+[段章节课页]|《[^》]*》|[（(]?[一二三四五六七八九十\d]+[）)、.．]?(?:段|章|节|课|页)?)$/

/** 一句的长度处理：<8 字丢弃；>60 字取第一个逗号之前（一个字都不改） */
function fitQuote(raw: string): string {
  const s = String(raw ?? '').trim()
  if (visibleChars(s) < 8) return ''
  /* 长句不再截到第一个逗号（用户铁底线：原文照抄，不许漏）——
     整句留下，上屏时由 slides.ts 的 chunkQuote 逐字拆成多页原文页。 */
  return s
}

/**
 * 模型交的原文里，一看就是解释而不是课文的句子：整行丢
 * （「本文写了…」「作者通过…」这种句子在任何一课上都不该当原文页）
 */
const EXPLAIN =
  /本文|这篇课文|课文主要|课文讲|作者通过|课文写了|让我们|同学们|教学目标|教学重难点|本环节|板书设计|说课|核心素养/

/** 行首编号：「1. 」「（2）」「- 」——模型爱给原文加序号，序号不是原文 */
const NUM_HEAD = /^\s*(?:\d+\s*[.、．)）]|[（(]\s*\d+\s*[）)]|[-–—*•·])\s*/

/** 行尾出处：「（人教版五年级上册）」「——部编版」——出处不是原文 */
const SOURCE_TAIL =
  /\s*[（(【\[]\s*[^）)】\]]{0,24}(?:人教版|部编版|统编版|北师大版|苏教版|外研版|PEP|教材|课本|第[一二三四五六七八九十\d]+单元)[^）)】\]]{0,24}\s*[）)】\]]\s*$/

/**
 * 模型把整句包在一对引号里时把外壳去掉；句子里本来就有引号（对话）的一律不动。
 * 早先写成「行尾有引号就删」，把「廉颇说：“…”」的后引号删成了没闭合的引号，
 * splitQuotes 就再也不会在句末切了——一行两句粘到一起。
 */
function unwrapQuote(line: string): string {
  const pairs: [string, string][] = [
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
    ['"', '"'],
  ]
  for (const [l, r] of pairs) {
    if (!line.startsWith(l) || !line.endsWith(r) || line.length <= l.length + r.length) continue
    const inner = line.slice(l.length, line.length - r.length)
    if (!inner.includes(l) && !inner.includes(r)) return inner.trim()
  }
  return line
}

/**
 * 这节课的原文从哪来（2026-11-21，用户拍板 A 案）：
 *   · 老师自己贴了（首页输入框 / 内置引句）→ 一字不动，原样用；
 *   · 老师没贴 → 用模型按课题给的 3–5 句课本原句，但必须先过筛：
 *     去编号、去出处、去解释句、去重、长度按 splitQuotes 同一把尺（<8 字丢、>60 字取首句）。
 *
 * 为什么不让模型直接写原文页、还要落进 meta.text：原文页的唯一信任源必须是
 * 一份「先落库、后逐字比对」的文本（slides.ts 的 dropUnverifiedQuotes），
 * 否则模型每页各编一句，谁也查不出来。
 */
export function groundText(given: unknown, model: unknown): string {
  const own = String(given ?? '').trim()
  if (own) return own
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of String(model ?? '').split(/\r?\n/)) {
    const line = raw
      .replace(NUM_HEAD, '')
      .replace(SOURCE_TAIL, '')
      .trim()
    const body = unwrapQuote(line)
    if (!body || EXPLAIN.test(body)) continue
    const one = fitQuote(body)
    if (!one) continue
    const key = one.replace(/[\s，,。.！!？?；;：:、…—]/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(one)
    if (out.length >= 6) break
  }
  return out.join('\n')
}

/**
 * 把老师贴进来的文字切成「一句一行」。
 * 老师不会贴整篇备课——他多半只贴这节课要讲的那几句。但两种都要能吃。
 *
 * 规则（不许发挥）：
 * 1. 先按换行切，再按 。！？；… 切，保留原句尾标点
 * 2. 去过首尾空白；长度 < 8 字的丢弃（“好。”这种不成句）
 * 3. 长度 > 60 字的，取第一个逗号之前的部分（课件上放不下长句）
 * 4. 一个字都不改：不改标点、不补主语、不润色、不去拼音
 * 5. 去重（同句只留一次），保持原顺序
 *
 * 唯一一处细节：引号里的 。！？ 不切——「我喊着：“啊！真像下雨……”」要整句上屏，
 * 切在「啊！」后面就把一句原文切成了半句。
 *
 * 2026-11-21 真机补上的第二处细节：**换行不是句号**。模型写原文时爱按句断行，
 * 《桂花雨》就交上来这么两行——
 *   外地的桂花再香，还是比不得家乡旧宅院
 *   子里的金桂。
 * 以前一行一个 flush，于是学生版上出现一张只写「…旧宅院」的页：一句话被切成两半，
 * 前半句还断在词中间。现在行尾没收句就带到下一行接着拼。
 */
export function splitQuotes(raw: string): string[] {
  const out: string[] = []
  /* 上一行留到这一行接着拼的半句。小标题（「第一段」）不接：接上去就成了
     「第一段桂花开了」，把标题和正文粘成一句。 */
  let carry = ''
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const text = carry + String(line ?? '').trim()
    carry = ''
    if (!text) continue
    let buf = ''
    let depth = 0
    const flush = () => {
      const one = fitQuote(buf)
      if (one) out.push(one)
      buf = ''
    }
    for (const ch of text) {
      buf += ch
      if (ch === '"') depth = depth > 0 ? depth - 1 : depth + 1
      else if (ch === '“' || ch === '「' || ch === '『' || ch === '‘') depth += 1
      else if ((ch === '”' || ch === '」' || ch === '』' || ch === '’') && depth > 0) depth -= 1
      if (depth === 0 && SENT_END.test(ch)) flush()
    }
    const tail = buf.trim()
    if (!tail) continue
    if (!SENT_END.test(tail) && [...tail].length <= 60 && !HEADING.test(tail)) carry = tail
    else flush()
  }
  if (carry) {
    const one = fitQuote(carry)
    if (one) out.push(one)
  }
  return [...new Set(out)]
}