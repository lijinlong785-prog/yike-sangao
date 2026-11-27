/**
 * 模板层 · 容量：一套模板一页到底装得下多少（TASKS/20 第 3 步）
 *
 * 为什么要算这一份：「换模板保文字」是硬承诺——同一份学生版稿子，换到十一套
 * 模板里任何一套都要排得下。模型写多长，不能靠排版时缩字号兜（缩字号会让
 * 各族的字号层级互相打架），得在生成之前就告诉它「这页最多这么多」。
 *
 * 算的办法：不另写一张容量表，直接拿 place() 当尺子——用探针页量出每个文本框的
 * 实际宽高与字号，反算「一行几个全角字 × 能排几行」。模板改了（框动、字号动、
 * 行距动），这里的数字自动跟着变，不存在第二份真值。
 *
 * 三处读它：
 *   · prompt.ts —— 生成前把「这套模板的容量」写进硬规则；
 *   · check-capacity.ts —— 按容量写满各族，量字压字与越界（承诺的验收）；
 *   · 界面 —— 只在需要说明「为什么这页只能这么多字」时用（暂未接）。
 */
import type { StudentSlide, StudentSlideKind } from '../slides'
import { extentOf, place } from './place'
import { FAMILY_IDS, FAMILY_REPS, TEMPLATES, type FamilyId } from './theme'
import { ENVELOPE, WORDS_ITEMS_MAX } from '../density'

/**
 * 字的实际占位：算法只在 place.ts 一份（settle 收字读的是同一个）。
 * 这里转出去，是为了让 check:capacity / check:fit 不必 import 两份。
 */
export { extentOf }

/** 正文可读底线（pt）：容量只允到「还读得清」为止，再小就不算装得下。
 *  16pt 与 720p 幻灯片的正常正文同一档；有画页（文字区收窄）最多缩到这里。 */
export const LEGIBLE_PT = 16
/** 标题上限与内容层同一个数（slides.ts 的 TITLE_MAX） */
const TITLE_CAP = 14
/** 纸面像素：与 place.ts 同一口径 */
const PW = 1280
const PH = 720
const PX = 4 / 3

export interface ArchFit {
  /** 一页最多几个全角字（= items × each，两条相乘就是上限） */
  chars: number
  /** 一页最多几条（与内容层 itemsMax 取小） */
  items: number
  /**
   * 一条最多几个字（一条一行，不折行）。
   * 没有这一项容量表就是错的：同一块地方能放 90 字，不代表能把它们分成
   * 6 条 × 15 字——框里一行只装得下 14 字，15 字那条会自己折成两行，
   * 于是第六条就被顶出去了。模型要的是「几条、每条多长」，不是「一共多少字」。
   */
  each: number
}

export interface Capacity {
  family: FamilyId
  /** 标题最多几个字（单行） */
  title: number
  /** 问句行最多几个字 */
  line: number
  /** 正文页（close-read / hook / goals 等） */
  body: ArchFit
  /** 编号页（board / drill / homework） */
  numbered: ArchFit
  /** 对比页（左右两栏，条目按下标奇偶分） */
  compare: ArchFit
  /** 字词页：chars = 每个词最多几个字（≤4），items 恒 4 */
  words: ArchFit
  /** 原文页：整句最多几个字 */
  quote: number
  /** 收尾页：那一句最多几个字 */
  end: ArchFit
}

/* ------------------------------ 探针 ------------------------------ */

/**
 * 探针一律用同一个字填，输出里一眼就认得出是哪一块。
 * 全是生僻字：「鑫 / 龘 / 靐」不会出现在页名（字词关 / 练一练…）与页脚课题里，
 * 所以按「含这个字」认块，绝不会把 12pt 的页名误当成正文。
 */
export const CAP_MARK = { title: '题', line: '问', body: '鑫', quote: '龘', end: '靐', note: '注' } as const
const MARK = CAP_MARK

function probe(kind: StudentSlideKind, extra: Partial<StudentSlide>): StudentSlide {
  return {
    kind,
    /* 同页其它字按「真实会写多长」给：标题 14 字（内容层的 TITLE_MAX）、问句 20 字、
       出处 10 字——量一项时其余不许空着，否则量出来的是只有一行字的空页 */
    title: MARK.title.repeat(TITLE_CAP),
    line: MARK.line.repeat(20),
    items: [],
    note: MARK.note.repeat(10),
    notes: '',
    ...extra,
  } as StudentSlide
}

/* ------------------------------ 反算 ------------------------------ */

const RUN = (id: FamilyId, slide: StudentSlide) => place(slide, TEMPLATES[FAMILY_REPS[id]])

/** 两块字的实际占位重叠是否超过「小块面积」的 12%（与 check:capacity / check:fit 同一阈值） */
function clash(a: ReturnType<typeof extentOf>, b: ReturnType<typeof extentOf>): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  const s = w > 0 && h > 0 ? w * h : 0
  const small = Math.min(a.w * a.h, b.w * b.h)
  return small > 0 && s / small > 0.12
}

/**
 * 「装得下」的判据（三件真事）：
 *   一、没有一块字从框里漫出来（半行容差与 settle 同一口径）；
 *   二、没有一块字被缩到 18pt 以下；
 *   三、没有两块字叠在一起（宣纸编号页的 6 条就是栽在这条：
 *       溢出 21px 刚好小于半行容差，settle 不缩，却把下面只有 7px 的问句行吞了）。
 *
 * 为什么不拿框宽高算：一条字多了会自己折行，折出来的行又把下一条顶开；宣纸的编号页
 * 还有「阶阶内缩」（框宽逐条变窄）；有的族按条数自己选字号（6 条 22pt、2 条 34pt）。
 * 拿几何估总会在这些地方估错，而 place() 本来就带尺子（settle），直接信它。
 *
 * 为什么「没缩过的小字」不算错：页名 12pt、图注 9pt、收尾页的 14pt 副题本就是小字，
 * 那是设计；只有「本来大、被挤小了」才是装不下——size0 正是这个信号。
 */
function fits(id: FamilyId, slide: StudentSlide): boolean {
  try {
    const out = RUN(id, slide).filter((p) => p.kind === 'text' && String(p.text ?? '').trim())
    /* 条目不许被 layout 悄悄截掉：liti / shuye / tigang 的编号页只画 5 条，
       不查这一条，容量表会报 6 条，模型写 6 条，第 6 条就没了。 */
    const want = (slide.items ?? []).join('').split('').filter((c) => c === MARK.body).length
    if (want > 0) {
      const got = out.map((p) => p.text ?? '').join('').split('').filter((c) => c === MARK.body).length
      if (got < want) return false
    }
    for (const p of out) {
      const e = extentOf(p)
      const lineH = (p.size ?? 18) * PX * (p.lineHeight ?? 1.5)
      if (e.h > p.h * PH + lineH * 0.5 + 1) return false
      if (p.size0 !== undefined && (p.size ?? 0) < LEGIBLE_PT) return false
    }
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        if (clash(extentOf(out[i]), extentOf(out[j]))) return false
      }
    }
    return true
  } catch {
    return false // 越界就地抛也是一种「装不下」
  }
}

/**
 * 「一直装得下」到第几个：从 1 往上扫，第一个装不下就停。
 * 不能用二分：字号是按字数退档的（10 字 34pt、18 字 27pt、20 字 22pt），
 * 装得下并不单调——文字变多反而可能从 27pt 掉到 22pt 又装下了。
 */
function upto(lo: number, hi: number, ok: (n: number) => boolean): number {
  let n = lo
  while (n < hi && ok(n + 1)) n += 1
  return n
}

/** 一条有几个字的页：items 条，每条 len 字 */
function listSlide(kind: StudentSlideKind, items: number, len: number): StudentSlide {
  return probe(kind, { items: Array.from({ length: items }, () => MARK.body.repeat(len)) })
}

/** 一种版式能装几条、每条几个字（条数先到上限，再在「条数上限」下量每条长度） */
function gridRoom(id: FamilyId, kind: StudentSlideKind, ceil: number): ArchFit {
  const items = Math.min(ceil, upto(1, ceil, (n) => fits(id, listSlide(kind, n, 1))))
  const each = upto(1, 40, (n) => fits(id, listSlide(kind, items, n)))
  /* 两个数要自洽：合计被内容层封在 90 字，6 条平分就是每条 15 字。
     报 6条×40字会让提示词自相矛盾（40×6=240 远超 90），模型只能磎。 */
  const chars = Math.min(items * each, ENVELOPE.bodyChars)
  return { chars, items, each: Math.min(each, Math.floor(chars / items)) }
}

/** 标题 / 问句的各自上限：三种条目页都量一遍取小（对比页的标题区比正文页矮） */
function headRoom(id: FamilyId, pick: 'title' | 'line', cap: number): number {
  const kinds: StudentSlideKind[] = ['close-read', 'board', 'compare']
  return Math.min(
    cap,
    ...kinds.map((kind) =>
      upto(1, cap, (n) => {
        const field = pick === 'title' ? { title: MARK.title.repeat(n) } : { line: MARK.line.repeat(n) }
        const keep = pick === 'title' ? { line: MARK.line.repeat(20) } : { title: MARK.title.repeat(TITLE_CAP) }
        /* 别的字按「一页真会有这么多」给：4 条 × 8 字（少于各族 layout 的 5 条上限，
           陪衬自己不会被截，量的才是标题/问句本身） */
        return fits(id, probe(kind, { ...field, ...keep, items: Array.from({ length: 4 }, () => MARK.body.repeat(8)) }))
      }),
    ),
  )
}

/**
 * 原文页：从 8 个字往上试，第一个装不下就停。
 * 不能用降序取最大：原文页字号按字数分档（QUOTE_PT），加上 settle 收字，
 * 会让「字数多反而装得下」（suke 130 字正常、140–170 字压出处、180 字又能装）。
 * 只有「从 8 到 N 每一个字数都排得下」才是真容量。出处（note）也算在内。
 */
function quoteRoom(id: FamilyId): number {
  const hi = 220
  let n = 8
  while (n < hi && fits(id, probe('quote', { text: MARK.quote.repeat(n + 1) }))) n += 1
  return n
}

/** 算一族的七种版式容量 */
function measure(id: FamilyId): Capacity {
  return {
    family: id,
    title: headRoom(id, 'title', TITLE_CAP),
    line: headRoom(id, 'line', 40),
    body: gridRoom(id, 'close-read', ENVELOPE.itemsMax),
    numbered: gridRoom(id, 'board', ENVELOPE.itemsMax),
    compare: gridRoom(id, 'compare', ENVELOPE.itemsMax),
    /* 字词页恒 ≤4 词，词长才是会溢出的那一维；每条口径与其它页对齐 → chars = 词长 */
    words: (() => {
      const n = upto(
        1,
        4,
        (k) => fits(id, probe('words', { items: Array.from({ length: WORDS_ITEMS_MAX }, () => MARK.body.repeat(k)) })),
      )
      return { chars: n, items: WORDS_ITEMS_MAX, each: n }
    })(),
    quote: quoteRoom(id),
    end: (() => {
      const n = upto(4, 120, (k) => fits(id, probe('end', { line: MARK.end.repeat(k), items: [] })))
      return { chars: n, items: 1, each: n }
    })(),
  }
}

const CACHE = new Map<FamilyId, Capacity>()

/** 一套模板的容量（首次调用现算，之后取缓存） */
export function capacityOf(id: FamilyId): Capacity {
  const hit = CACHE.get(id)
  if (hit) return hit
  const c = measure(id)
  CACHE.set(id, c)
  return c
}

/**
 * 十一套模板的公共安全线：每一项取 各族里最小的那个。
 *
 * 提示词写这一份，不写某一族的——老师随时会换模板，稿子必须换到哪一套都排得下。
 * 这就是「换模板保文字」在生成端的落点：先按最窄的那一族写，换到宽的那族只会更松。
 */
export function tightCapacity(): Capacity {
  const all = FAMILY_IDS.map(capacityOf)
  const min = (pick: (c: Capacity) => number) => Math.min(...all.map(pick))
  const minFit = (pick: (c: Capacity) => ArchFit): ArchFit => {
    const chars = Math.min(...all.map((c) => pick(c).chars))
    const items = Math.min(...all.map((c) => pick(c).items))
    const each = Math.min(...all.map((c) => pick(c).each))
    return { chars, items, each }
  }
  return {
    family: 'suke',
    title: min((c) => c.title),
    line: min((c) => c.line),
    body: minFit((c) => c.body),
    numbered: minFit((c) => c.numbered),
    compare: minFit((c) => c.compare),
    words: minFit((c) => c.words),
    quote: min((c) => c.quote),
    end: minFit((c) => c.end),
  }
}

/** 提示词里那一小段：把公共安全线翻成模型看得懂的几句话 */
export function capacityPromptBlock(): string {
  const t = tightCapacity()
  return `本套模板的页面容量（十九套模板里最窄的一套量出来的，超了换模板就会挤：这是上限，不是建议）：
- 标题 ≤ ${t.title} 字；问句行 ≤ ${t.line} 字
- 普通正文页：≤ ${t.body.items} 条，每条 ≤ ${t.body.each} 字（合计不超 ${t.body.chars} 字）
- 编号页（板书 / 练一练 / 作业）：≤ ${t.numbered.items} 条，每条 ≤ ${t.numbered.each} 字
- 对比页：≤ ${t.compare.items} 条，每条 ≤ ${t.compare.each} 字（左右两栏各一半）
- 字词页：不超过 4 个词，每个词 ≤ ${t.words.chars} 字
- 原文页：整句逐字照抄，不许改字；长句会自动拆成多页原文页，不用自己截（单页版面约装 ${t.quote} 字）`
}

/** 校验用：一族一份明细（check:capacity 打印这张表） */
export function capacityTable(): Capacity[] {
  return FAMILY_IDS.map(capacityOf)
}