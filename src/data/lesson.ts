/* ================================================================== *
 * 40 分钟整节课的「环节表」（TASKS/09 §S）                            *
 *                                                                    *
 * 四篇内置示例原本都按 4 分钟剪：5 个环节、ratio 0.125/0.2/0.4/…     *
 * 拿它去上 40 分钟，等于把 8 分钟的内容抻成 40 分钟。这一份补的是     *
 * 缺的那两段——字词巩固、课中练习、当堂检测——并把 ratio 重排到 1。   *
 *                                                                    *
 * 两条硬约束：                                                        *
 * 1. 原有环节的文案一个字都不复制：这里只给「第几段之后插一段新的」   *
 *    和「原五段的新比例」，原文仍只住在各自的 data/*.ts 里。          *
 * 2. 四篇的新段合计之后，环节数必须是 6–7、ratio 之和必须恰好为 1。  *
 *    两条都由 scripts/check-scale.ts 硬断言，写错就出不了门。        *
 * ================================================================== */

import type { LessonPlan, Segment } from '../types'
import { tierOf } from '../lib/scale'

interface LessonShape {
  /** 按课题匹配（与 slides.ts 的 BUILTIN_MATCHERS 同一类做法） */
  match: RegExp
  /** 原五段的新比例，顺序与 plan.segments 一致 */
  ratios: number[]
  /** 新段插在第几个原环节之后（0 起始，即 after:1 表示插在原第 2 段后面） */
  inserts: { after: number; seg: Segment }[]
}

const SHAPES: LessonShape[] = [
  /* ---------------------------- 桂花雨 ---------------------------- */
  {
    match: /桂花/,
    ratios: [0.1, 0.16, 0.3, 0.14, 0.08],
    inserts: [
      {
        after: 1,
        seg: {
          name: '字词 · 把那个香字读透',
          ratio: 0.1,
          goal: '把“箩、杭、浸润、缠”读准写对，借“浸润”这个词，让“香”从闻一下变成渗满整个院子。',
          teacher:
            '出示生字词卡片，开火车读；单独拎出“浸润”，问两个字为什么都带三点水；“箩”的竹字头在黑板上写一遍，请两个学生在田字格里写。',
          student:
            '开火车读词，说说自己见过什么东西是“浸润”的；在田字格里写一遍“箩、杭”，写完同桌互相看一眼。',
          script:
            '开火车读这四个词，读对的坐下。停一下，看“浸润”这两个字。两个字都带三点水。水是怎么进去的？一点一点渗进去的。桂花的香也这样，进了院子就不走了，进了衣服，进了头发，第二天还能闻见。',
          pauses: [
            {
              afterText: '一点一点渗进去的',
              seconds: 5,
              question: '什么东西“浸润”过你？',
              type: '引发思考',
            },
          ],
        },
      },
      {
        after: 2,
        seg: {
          name: '练习 · 写一句摇花乐',
          ratio: 0.12,
          goal: '把精读时找到的动作和声音写进一句话，写完自己念一遍，听听顺不顺。',
          teacher:
            '给句式：我（　）着桂树，使劲地（　），花落下来，像（　）。学生写，教师巡视，挑三句念出来全班比一比。',
          student: '先口头补一遍，再写下来；写完同桌换着读，圈出对方用得最好的那个词。',
          script:
            '拿出本子，就写一句话：我抱着桂树，使劲地摇，花落下来像什么。三个空，填动词和比喻。写完同桌换着读，圈出对方用得最好的那个词。我请三位念，念完全班比一比，谁那个词最像摇花。',
          pauses: [
            {
              afterText: '圈出对方用得最好的那个词',
              seconds: 5,
              question: '哪个词让你听见了声音？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* ------------------------ 长方体的认识 ------------------------ */
  {
    match: /长方体|正方体|立方体/,
    ratios: [0.08, 0.15, 0.22, 0.14, 0.15],
    inserts: [
      {
        after: 2,
        seg: {
          name: '练习 · 搭一个长方体',
          ratio: 0.18,
          goal: '用 12 根小棒、8 个接头搭一个长方体，把“12 条棱、8 个顶点”从数出来变成做出来。',
          teacher:
            '四人一组发材料，先要求商量长、宽、高各用几根再动手；巡视时挑一组塌掉的当反例，请他们说塌在哪条棱上。',
          student: '小组分工，先算要用几根小棒，再搭；搭完用手指数一遍棱、数一遍顶点。',
          script:
            '每组一包小棒、一包接头。先别动手，商量一句：长、宽、高各用几根？商量好再搭。搭的时候会塌，塌了就看看哪条棱短了。搭完数一遍，12 条棱、8 个顶点，一个都不能少。',
          pauses: [
            {
              afterText: '塌了就看看哪条棱短了',
              seconds: 5,
              question: '塌掉那组，少的是哪条棱？',
              type: '确认理解',
            },
          ],
        },
      },
      {
        after: 3,
        seg: {
          name: '检测 · 用三个数字说清',
          ratio: 0.08,
          goal: '用“6 个面、12 条棱、8 个顶点”三个数字把自己的长方体说清楚，当堂看出谁还没会。',
          teacher:
            '投影一个没标数字的长方体，请两个学生上台指面、棱、顶点；其余学生在纸上写三个数字，写完举手。',
          student: '两人上台指，其余在纸上写 6、12、8，再画出相对的两个面。',
          script:
            '看这个长方体，我说三样，你指：面、棱、顶点。请两位上来指。下面的人写三个数字，写完举手。指错不要紧，指错了全班一起数一遍。',
          pauses: [
            {
              afterText: '指错了全班一起数一遍',
              seconds: 5,
              question: '顶点为什么正好 8 个？',
              type: '引发思考',
            },
          ],
        },
      },
    ],
  },

  /* ---------------------------- 比大小 ---------------------------- */
  {
    match: /比大小|多几种|少几种/,
    ratios: [0.12, 0.2, 0.3, 0.12, 0.08],
    inserts: [
      {
        after: 2,
        seg: {
          name: '练习 · 摆一摆再比',
          ratio: 0.18,
          goal: '用小棒摆两堆，一一对应比出多少，再把结果写成带符号的算式。',
          teacher:
            '同桌一组各抓一把小棒，要求一个对一个对齐摆好再看谁多；巡视时问一句“多出来几个”，请两组上黑板写算式。',
          student: '同桌各摆一堆，一一对齐，说出谁多谁少，把算式填进本子。',
          script:
            '两个人各抓一把，先不要数，摆在桌上，一个对一个对齐。对齐完看谁多出来，多出来几个？把它写成算式，中间那个符号张开嘴，朝着多的那一边。',
          pauses: [
            {
              afterText: '朝着多的那一边',
              seconds: 5,
              question: '符号的嘴为什么朝多的一边？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* -------------------------- 七律·长征 -------------------------- */
  {
    match: /长征|七律/,
    ratios: [0.1, 0.14, 0.32, 0.19, 0.1],
    inserts: [
      {
        after: 2,
        seg: {
          name: '练习 · 读出那口气',
          ratio: 0.15,
          goal: '把“只等闲”“尽开颜”两处读出轻重，体会“难”和“不怕”是怎么拧在一起的。',
          teacher: '男女生分句读，一句一句比；标出重音与停顿，最后全班齐读一遍。',
          student: '先自己标重音，再同桌互读，最后全班齐读。',
          script:
            '这一遍不看意思，只听声音。“万水千山只等闲”，哪两个字要重？“只等闲”。男生读一遍，女生读一遍，比一比谁把那口气读出来了。读完全班一起，慢一点，字和字之间留一点空。',
          pauses: [
            {
              afterText: '字和字之间留一点空',
              seconds: 5,
              question: '哪两个字最该重读？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* ---------------------------- 荷塘月色 ---------------------------- */
  {
    match: /荷塘月色|荷塘/,
    ratios: [0.1, 0.16, 0.32, 0.16, 0.1],
    inserts: [
      {
        after: 1,
        seg: {
          name: '字词 · 泻下来的月光',
          ratio: 0.16,
          goal: '把“泻、浮、斑驳、脉脉”放回句子里念一遍，知道“泻”比“照”重，“浮”让雾托着荷叶。',
          teacher:
            '开火车读四个词；把“月光如流水一般，静静地泻在这一片叶子和花上”整句投出来，请学生把这句里的“泻”换成“照”念，再说说差别。',
          student:
            '开火车读词，把“泻”和“照”各念一遍，说哪一个让人觉出月光的重量；再把“浮”换成“升”念一遍。',
          script:
            '先看四个词。第一句，月光泻下来。这个“泻”字，换成“照”行不行？照是平平地落在上面，泻是从高处一直往下流，带着分量。再看青雾浮起。浮是托着，叶子才像在动。后面还有斑驳、脉脉，读到那儿再停。',
          pauses: [
            {
              afterText: '带着分量',
              seconds: 5,
              question: '“泻”和“照”，差在哪儿？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* ------------------------------- 春 ------------------------------- */
  {
    match: /^《?春》?$|朱自清.*春/,
    ratios: [0.1, 0.14, 0.32, 0.17, 0.1],
    inserts: [
      {
        after: 2,
        seg: {
          name: '练习 · 换一个动词',
          ratio: 0.17,
          goal: '把“钻”换成“长、冒、拱”，每个念一遍再比，找出最像刚醒过来的草那一个字。',
          teacher:
            '把“小草偷偷地从土里钻出来”摆在屏幕上，请学生分别换成“长”“冒”“拱”念；三个字念完，问哪一个最像刚睡醒。',
          student:
            '在本子上写三个替换字，每个念一遍，选一个说理由；写完和同桌换着看。',
          script:
            '小草偷偷地从土里钻出来。把这个“钻”换掉，换成“长”，换成“冒”，换成“拱”。念一遍，哪一个最像刚睡醒的草？还是“钻”好。它慢慢使劲，从缝里出来，出来就不动了。',
          pauses: [
            {
              afterText: '出来就不动了',
              seconds: 5,
              question: '“钻”字里那点劲儿，在哪儿？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* ------------------------------ 背影 ------------------------------ */
  {
    match: /背影/,
    ratios: [0.1, 0.14, 0.3, 0.15, 0.11],
    inserts: [
      {
        after: 2,
        seg: {
          name: '写话 · 写一个动作',
          ratio: 0.2,
          goal: '照着“攀、缩、倾”那一串动作写三句话，写自己家里一个人做一件小事的样子。',
          teacher:
            '给三步：先写他做什么，再写他身上哪一处使劲，最后写你站在旁边在做什么。学生写十分钟，请两位念。',
          student:
            '在本子上写三句，写家里一个人做一件小事；写完念给同桌听，请他圈出最像动作的那个词。',
          script:
            '现在轮到我们写。不用写脸，写动作。先写他做什么，再写身上哪一处使劲，最后写你站在旁边在做什么。三句话，十分钟。写完念给同桌听，请他圈出最像的那个动词。',
          pauses: [
            {
              afterText: '最像的那个动词',
              seconds: 5,
              question: '你写的那个动作，别人学得来吗？',
              type: '引发思考',
            },
          ],
        },
      },
    ],
  },

  /* ------------------------ 分数的初步认识 ------------------------ */
  {
    match: /分数/,
    ratios: [0.1, 0.2, 0.3, 0.18, 0.1],
    inserts: [
      {
        after: 2,
        seg: {
          name: '检测 · 三个判断',
          ratio: 0.12,
          goal: '三道判断题，看谁真会了、谁还停在“分成两份就行”。',
          teacher:
            '出三道：分成两份一大一小算不算二分之一；三个同学分一张饼，每人几分之一；一张纸对折三次，一份是几分之一。学生用手势作答。',
          student: '三道题都用手势作答；答错的说一句自己刚才怎么想的。',
          script:
            '三道题，看谁反应快。第一题，分成两份，一大一小，能叫二分之一吗？不能。第二题，三个同学分一张饼，每人几分之一？三分之一。第三题，一张纸对折三次，一份是几分之一？八分之一。答错的说一句自己刚才怎么想的。',
          pauses: [
            {
              afterText: '答错的说一句',
              seconds: 5,
              question: '第三题，为什么是八分之一？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* ----------------------------- 圆的面积 ----------------------------- */
  {
    match: /圆的面积|圆面积/,
    ratios: [0.1, 0.2, 0.3, 0.18, 0.1],
    inserts: [
      {
        after: 2,
        seg: {
          name: '检测 · 先算半径的平方',
          ratio: 0.12,
          goal: '三道口算都先问第一步做什么，把“先平方再乘 π”卡住，看谁把直径当成半径。',
          teacher:
            '出三道：半径 3 求面积；直径 10 求面积；半径 2 求面积。三道都不许直接报答案，先说第一步做什么。',
          student: '三道题先在本子上写第一步，再报答案；错了的说清自己第一步做了什么。',
          script:
            '三道题，都先说第一步做什么。半径 3，第一步？先平方，九，再乘三点一四。直径 10，先做什么？先求半径，五，再平方。半径 2，多少？十二点五六。有人把直径 10 直接平方，那一题就错在第一步。',
          pauses: [
            {
              afterText: '那一题就错在第一步',
              seconds: 5,
              question: '直径给了，第一步做什么？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },

  /* ----------------------------- 草船借箭 ----------------------------- */
  {
    match: /草船借箭|草船/,
    ratios: [0.1, 0.16, 0.32, 0.16, 0.1],
    inserts: [
      {
        after: 2,
        seg: {
          name: '演练 · 复盘借箭沙盘',
          ratio: 0.16,
          goal: '借助纸船模拟“一字摆开 → 掉头受箭 → 顺风返程”，验证地利与天时的严密配合。',
          teacher: '请两组学生上台用纸船演示受箭与掉头时机，追问为什么不能等天亮再返程。',
          student: '桌面模拟船只调头路线，用“先……再……因为……”把借箭逻辑讲给同桌听。',
          script:
            '把纸船摆成一字，先船头朝西船尾朝东，一面受满箭立刻掉头。为什么非要掉头？既防船身倾覆，又顺着大风顺水返程，等曹操反应过来，船早走出二十多里了。',
          pauses: [
            {
              afterText: '既防船身倾覆',
              seconds: 5,
              question: '如果不掉头，船会发生什么？',
              type: '确认理解',
            },
          ],
        },
      },
    ],
  },
]

/**
 * 把一段教案展开成 40 分钟版：原五段按新比例改 ratio，再按 after 插入新段。
 * 命中不了的课文返回 undefined——调用方保持原样，由 buildDeck / lessonSlides 按算法补页。
 */
export function lessonSegmentsFor(plan: LessonPlan): Segment[] | undefined {
  const topic = String(plan?.meta?.topic ?? '')
  const shape = SHAPES.find((s) => s.match.test(topic))
  if (!shape) return undefined
  const origin = plan.segments ?? []
  /*
   * 只给「本来就是 4 分钟剪法」的 5 段稿子扩写。
   * 模型按 40 分钟提示词交回来 6–7 段时，它自己的环节比这张表更贴题，不得覆盖。
   */
  if (origin.length !== shape.ratios.length) return undefined

  const out: Segment[] = []
  origin.forEach((seg, i) => {
    out.push({ ...seg, ratio: shape.ratios[i] ?? seg.ratio })
    for (const ins of shape.inserts) if (ins.after === i) out.push(ins.seg)
  })
  // ratio 之和必须归一到 1（allocate 允许容差，但比例写错会静默偏掉）
  const sum = out.reduce((n, s) => n + s.ratio, 0)
  if (sum <= 0) return undefined
  return out.map((s) => ({ ...s, ratio: Number((s.ratio / sum).toFixed(4)) }))
}

/**
 * 当前时长下的教案视图：只改 meta.duration，整节课再把环节表换成对应时长的骨架。
 * 不修改原 plan（课件可编辑那一块要保留「教案是原始凭据」这条边界）。
 */
export function planForScale(plan: LessonPlan, duration: number): LessonPlan {
  const meta = { ...plan.meta, duration }
  const tier = tierOf(duration)
  if (tier === 'clip') return { ...plan, meta }
  const segments = tier === 'm40' ? lessonSegmentsFor(plan) : skeletonSegmentsFor(plan, tier)
  return segments ? { ...plan, meta, segments } : { ...plan, meta }
}

/* ================================================================== *
 * 20 / 30 分钟骨架（10 §十二）                                         *
 *                                                                    *
 * 不是等比缩放：
 *   20 分钟  导入 + 精读 + 小结（砍初读、砍拓展、砍练习）
 *   30 分钟  导入 + 初读 + 精读 + 小结（砍拓展）
 * 环节从原稿里挑，文字一个字不重写；只改 ratio，让分钟数按权重分。
 * ================================================================== */

interface SkeletonStep {
  /** 环节名匹配；匹配不到时用位次兵底 */
  match: RegExp
  /** 没有名字可认时的位置（0 起始，负数为从末尾数） */
  at: number
  weight: number
}

const SKELETONS: Record<'m20' | 'm30', SkeletonStep[]> = {
  m20: [
    { match: /导入|情境|入课|开课/, at: 0, weight: 0.15 },
    { match: /精读|品读|细读|品味|新授|新知|探究/, at: 2, weight: 0.7 },
    { match: /小结|总结|收束|作业/, at: -1, weight: 0.15 },
  ],
  m30: [
    { match: /导入|情境|入课|开课/, at: 0, weight: 0.1 },
    { match: /初读|整体感知|通读/, at: 1, weight: 0.2 },
    { match: /精读|品读|细读|品味|新授|新知|探究/, at: 2, weight: 0.55 },
    { match: /小结|总结|收束|作业/, at: -1, weight: 0.15 },
  ],
}

/** 按名字认环节；名字认不到就按位置，位置也被占了就看谁的篇幅长 */
function pickSegments(origin: Segment[], steps: SkeletonStep[]): Segment[] {
  const used = new Set<number>()
  const out: Segment[] = []
  for (const step of steps) {
    let at = origin.findIndex((s, i) => !used.has(i) && step.match.test(String(s.name ?? '')))
    if (at < 0) {
      const want = step.at < 0 ? origin.length + step.at : step.at
      if (want >= 0 && want < origin.length && !used.has(want)) at = want
    }
    if (at < 0) {
      // 最后一手：取还没被用掉的篇幅最长的一段（宁可多讲，不要空着）
      let best = -1
      origin.forEach((s, i) => {
        if (used.has(i)) return
        if (best < 0 || (s.ratio ?? 0) > (origin[best].ratio ?? 0)) best = i
      })
      at = best
    }
    if (at < 0) break
    used.add(at)
    out.push(origin[at])
  }
  return out
}

/**
 * 20 / 30 分钟的环节表。返回 undefined 时调用方保持原稿（比如环节少到凑不出骨架）。
 * 三段的 20 分钟版比例 0.15 / 0.7 / 0.15，四段的 30 分钟版 0.1 / 0.2 / 0.55 / 0.15，
 * 均恰好归 1，allocate 切出来之后分钟数合计就等于老师选的时长。
 */
export function skeletonSegmentsFor(
  plan: LessonPlan,
  tier: 'm20' | 'm30'
): Segment[] | undefined {
  const origin = plan.segments ?? []
  const steps = SKELETONS[tier]
  if (origin.length < steps.length) return undefined
  const picked = pickSegments(origin, steps)
  if (picked.length !== steps.length) return undefined
  return picked.map((seg, i) => ({ ...seg, ratio: steps[i].weight }))
}