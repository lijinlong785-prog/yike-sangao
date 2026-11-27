/* ================================================================== *
 * 语气档案与病句判定源（TASKS/08 §D.1 / §D.2 / §D.3）                  *
 *                                                                    *
 * 两件事住在这一个文件里：                                            *
 *   1. 三套「谁在听」的写法档案（说课 / 课堂 / 答辩），供 prompt 注入； *
 *   2. 全站唯一的禁用句式与禁词判定源（FORBIDDEN_PATTERNS / BANNED_WORDS），*
 *      scripts/check-voice.ts 与生成路径都复用这里，别处不许再写第二套正则。 *
 *                                                                    *
 * 口径（已裁决，写死在这里）：§D.2 四类句式与五个禁词在**产物文本**里     *
 * 命中数必须为 0——内置人工稿同样不豁免；§D.3 的课堂称呼按「少用」处理，   *
 * 每份 ≤1 次为软上限，超出只进 warnings。                              *
 * ================================================================== */

export type VoiceKind = 'shuoke' | 'classroom' | 'defense'

/* ------------------------- §D.2 四类禁用句式 ------------------------- */

export interface VoicePattern {
  id: string
  /** 任务书里的原写法，打印用 */
  label: string
  /** 真正则：一律带 g，兼容「……」「…」「. . .」、中间夹标点与换行 */
  re: RegExp
  /** 这一条抓的是什么病句 */
  note: string
}

/**
 * 四类禁用句式。每条都是**真正则**，不是字面量匹配：
 * 省略号在中文里有「……」「…」和手打的「. . .」三种常见写法，中间还常夹逗号与换行，
 * 所以骨架一律写成「关联词 + 中间一小段（不跨句末标点）+ 关联词」。
 */
export const FORBIDDEN_PATTERNS: readonly VoicePattern[] = [
  {
    id: 'bu-ershi',
    label: '不是……而是……',
    // 「不 / 非 / 没」起头，中间最多 18 个不带句末标点与逗号的字，再一个可选逗号，落在「而是」。
    // 前缀 (?:^|[^而]) + 中间段至少 1 字，是为了放掉倒装的「……，而不是……」——
    // §D.2 第 1 类只列正装式，倒装那句（「符号是关系的简写，而不是三个孤立的图案」）是人话，不判。
    // 中间段不禁换行与省略号，所以「不是…\n而是」「不是……而是」都能抓住；但逗号只能有一个且必须紧贴而是。
    re: /(?:^|[^而])(?:不|非|没)[^。！？，,；;、]{1,18}[，,、]?[\s]*而是/g,
    note: '先否定一个说法再摆出自己的说法，是说课稿里最常见的排场话；把被否定的那个删掉，直接说要做什么。',
  },
  {
    id: 'ningke-ye',
    label: '宁可……也……',
    // 让步复句：宁可 + ≤24 字（可含逗号与换行，不跨句末标点）+ 也 / 都要 / 得。
    re: /宁可[^。！？]{1,24}?(?:也|都要|得)/g,
    note: '教研腔的取舍句式，课堂上没人这么说话；换成「我宁愿 X，所以 Y」或者直接说 Y。',
  },
  {
    id: 'yuqi-buru',
    label: '与其……不如……',
    // 「与其 / 与其说」+ ≤24 字 + 「不如 / 还不如」；「与其说」也一并抓掉，防止改稿时换成它。
    re: /与其(?:还)?说?[^。！？]{1,24}?(?:也)?不如/g,
    note: '书面比较句式，跟「不是……而是……」是同一张脸上的两种妆；直接给要选的那个。',
  },
  {
    id: 'paibi-3',
    label: '三句以上排比（既……又……更……）',
    // 三联关联词：既 + 一段 + 又/也 + 一段 + 更/还 + 一段。两个槽之间各限 ≤20 字，
    // 且都不许跨过句末标点，保证抓的是「一句话里连排三层」而不是隔了两句的巧合。
    // 「不仅…而且…更…」是同一毛病的另外两种壳，合并在这条里。
    re: /(?:既[^。！？]{1,20}?[又也][^。！？]{1,20}?(?:更|还))|(?:不仅|不但)[^。！？]{1,20}?(?:而且|同时)[^。！？]{1,20}?(?:更|还)/g,
    note: '三个关联词串起来的递进排比，念起来像汇报材料；留一个最重的说清楚就行。',
  },
]

/* ------------------------- §D.2 五个禁词 ------------------------- */

export interface BannedEntry {
  word: string
  /** 有的禁词本身就是跨句结构（通过……使学生），所以匹配一律走正则 */
  re: RegExp
  note: string
}

export const BANNED_WORDS: readonly BannedEntry[] = [
  {
    word: '本环节旨在',
    re: /本环节旨在/g,
    note: '档案腔开头，「旨在」两个字最不像人话。',
  },
  {
    word: '通过……使学生',
    re: /通过(?:[^。！？]{1,24}?)(?:使|让)学生/g,
    note: '把手段和学生捆成一句流程说明；主语换成「我」，说清我做了什么、学生做什么。',
  },
  {
    word: '充分体现了',
    re: /充?分体现(?:了|出)/g,
    note: '自我评价式结论，评委看的是你做了什么，不是你给自己打的勾。',
  },
  {
    word: '有效提升',
    // 这一桶管的是「提升 + 素养 / 能力 / 水平」这类无法检验的效果承诺，不只抓「有效提升」四字；
    // 修饰语可缺（切实提升、明显提升、直接一句「提升学生能力」都是同一个毛病）。
    re: /(?:有效|切实|明显|大幅)?提升(?:了)?(?:学生|儿童)?(?:的)?[^。！？]{0,6}?(?:核心素养|素养|能力|水平|成绩|效率)/g,
    note: '无法检验的效果承诺，删掉换成具体那一页发生了什么。',
  },
  {
    word: '核心素养',
    re: /核心素养/g,
    note: '口号级名词，写进稿子等于什么都没写。',
  },
  /* TASKS 10 §十三 第 12 件：三维目标那套格子，连同它的三个格名一起禁 */
  {
    word: '知识与能力',
    re: /知识(?:与|和)能力/g,
    note: '三维目标的旧壳子。直接说这一课学生要学会做什么。',
  },
  {
    word: '过程与方法',
    re: /过程(?:与|和)方法/g,
    note: '怎么学是和内容长在一起的，另起一格就只剩空话。',
  },
  {
    word: '情感态度与价值观',
    re: /情感态度(?:与|和)价值观/g,
    note: '要谈感情，就说课文里哪一句让人心里一动。',
  },
  {
    word: '三维目标',
    re: /三维目标/g,
    note: '三个格子填满，不等于把课说清楚。',
  },
]

/* ------------------------- 上屏短句的「不是老师写的」判定 ------------------------- *
 * 第 12 件新增：三类句式在产物里必须为 0——                        *
 *   1. 课标术语（上面 BANNED_WORDS 那几条，全量扫）；                *
 *   2. 四字对偶（「重点讲透，难点绕开」）：只判**上屏短句**，不判 notes *
 *      与说课稿的长句——长句里「先看左边，再看右边」这类正常叙述会被  *
 *      误伤，而它本来就不是对偶；                                    *
 *   3. 三连排比（「通过圈画批注、想象画面、角色代入」）与动作流水账     *
 *      （「出示 X、播放 Y、提问 Z」）。                              *
 * 判定与展示分离：scanTaste 只给命中，谁算「上屏短句」由调用方决定      *
 * （slides.ts 判 title/line/items，check-voice 判 deck 的标题与 bullets）。*
 * -------------------------------------------------------------------------- */

export interface TasteHit {
  id: string
  label: string
  /** 命中的原文片段 */
  matched: string
  note: string
}

/** 对偶两半里只要出现这些虚词，就不当对偶（「先看左边，再看右边」是正常叙述） */
const DUI_OU_FUNC = /[的了是在和也就都很会能要把被让给对从向与及或而且并且再又更才先却着过]/
/** 四字对偶：句首（或句号后）恰好 4 字 + 逗号 + 4 字，且整句到此收口 */
const DUI_OU = /(?:^|[。！？；\s])([^，,。！？；：\s]{4})[，,]([^，,。！？；：\s]{4})(?=[。！？；]|$)/g
/** 后半句带着真疑问词的，整句就是问句——4+4 只是问句恰好切在逗号上
 *  （「这几个数，哪个最大？」），不是口号。 */
const DUI_OU_ASK = /哪|什么|怎么|怎样|多少|几|谁|为什么|是否|是不是|有没有/
/** 「通过 / 借助 / 运用 / 凭借 + A、B、C」式的三连 */
const VIA_TRIPLE = /(?:通过|借助|运用|凭借)[^。！？；\n]{1,24}?、[^。！？；\n]{1,24}?、/g
/** 动作流水账：同一句里连排三个教师动作 */
const ACTION_WORDS = ['出示', '播放', '提问', '追问', '讲解', '板书', '引导'] as const

/** 扫一段上屏短句：返回三类命中（空数组 = 干净）。调用方只把短句交给它，别整段 notes 丢进来。 */
export function scanTaste(text: string): TasteHit[] {
  const raw = String(text ?? '')
  const hits: TasteHit[] = []

  for (const m of raw.matchAll(new RegExp(DUI_OU.source, 'g'))) {
    const a = m[1] ?? ''
    const b = m[2] ?? ''
    if (DUI_OU_FUNC.test(a) || DUI_OU_FUNC.test(b)) continue
    /* 问句不当对偶：只看问号不够（「目标明确，条理清晰？」照样是口号），
       必须是后半句里真有疑问词，而且整句确实以问号（或以 吗 / 呢）收口。 */
    const tail = raw.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1)
    if (DUI_OU_ASK.test(b) && (tail === '？' || tail === '?' || /[吗呢]$/.test(b))) continue
    hits.push({
      id: 'dui-ou',
      label: '四字对偶',
      matched: `${a}，${b}`,
      note: '前后各四字，念起来像口号；改成一句直说的话，把后半句想押的那个韵扔掉。',
    })
  }
  for (const m of raw.matchAll(new RegExp(VIA_TRIPLE.source, 'g'))) {
    hits.push({
      id: 'paibi-via',
      label: '三连排比',
      matched: m[0] ?? '',
      note: '「通过 A、B、C」是教研材料的写法；说清这一课到底让学生做了哪一件事。',
    })
  }
  for (const clause of raw.split(/[。！？；\n]/)) {
    const used = ACTION_WORDS.filter((w) => clause.includes(w))
    if (used.length >= 3) {
      hits.push({
        id: 'liushuizhang',
        label: '动作流水账',
        matched: clause.trim().slice(0, 30),
        note: '出示、播放、提问排成一串，像流程单。挑一个动作写透，其余交给课堂现场。',
      })
    }
  }
  return hits
}

/** 给界面与校验用的短句判据：有命中就是不合格，文案直接可读 */
export function tasteProblems(text: string): string[] {
  return scanTaste(text).map((h) => `${h.label}「${h.matched}」`)
}

/** 打印与 prompt 用的禁词字面量清单 */
export const BANNED_WORD_TEXTS: readonly string[] = BANNED_WORDS.map((b) => b.word)

/* ------------------------- §D.3 课堂称呼（软上限） ------------------------- */

export const SOFT_SUBJECTS: readonly string[] = ['让我们', '请大家', '同学们', '请你说', '大家可以']
/** 每份稿子里同一个课堂称呼允许的顶格次数；超出只进 warnings（已裁决口径） */
export const SOFT_SUBJECT_LIMIT = 1

/* ------------------------- §D.1 三套档案 ------------------------- */

export interface VoiceExample {
  bad: string
  good: string
}

export interface VoiceProfile {
  kind: VoiceKind
  /** 中文名，界面与打印用 */
  name: string
  /** 这段话说给谁听 */
  audience: string
  /** 逐条短句规则，直接拼进 prompt */
  rules: string[]
  /** bad / good 成对的正反例 */
  examples: VoiceExample[]
  /** 适用的禁用句式 id（当前三套都吃全套 §D.2 四类） */
  forbiddenPatterns: string[]
  /** 适用的禁词（当前三套都吃全套五个） */
  bannedWords: string[]
  /** §D.3 主语规则，逐条短句 */
  subjectRules: string[]
  /** 单句长度上限（字）：超过只报最长句，不作硬判 */
  maxSentenceChars: number
  /** 这一套管哪些产物字段，打印时能说清「为什么注入在这儿」 */
  slots: string[]
}

const SHUOKE: VoiceProfile = {
  kind: 'shuoke',
  name: '说课',
  audience: '讲给评委听：坐在对面的是打分的人，不是学生',
  rules: [
    '第一人称承担：写「我这样设计」「我把这一页放慢」，不写「本设计旨在」。',
    '每个设计点后面必须跟一句「因为」或「考虑到」，说清你为什么这么做。',
    '少形容词。想说「生动形象」，就换成你具体做了什么动作、学生做了什么动作。',
    '不写「环环相扣」「层层递进」「充分调动」这类自我评价；只写这一页真正发生了什么事。',
    '一句话只讲一个设计点，讲完就换行，不要把三个理由摞在同一句里。',
  ],
  examples: [
    {
      bad: '本环节旨在通过反复朗读，使学生体会作者对故乡的思念之情。',
      good:
        '这一段我让学生读三遍。第一遍读顺，第二遍读到自己心里发酸，第三遍才问他们想起了什么。',
    },
  ],
  forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
  bannedWords: BANNED_WORD_TEXTS.slice(),
  subjectRules: [
    '承诺落在自己身上：多用「我来」「我这样做」「我先说清楚」。',
    '少用「请你说」「让我们」「大家可以」——评委不是你的学生，不要指挥他。',
  ],
  // 与既有 SYSTEM_PROMPT 第 5 条同口径（每句 ≤120 字），这里不另立一条更紧的数，
  // 免得 D 块顺手把 A/B 块之外的生成口径改了。
  maxSentenceChars: 120,
  slots: ['speech（说课稿六段）', 'segments[].script（环节口播稿）', 'objectives / keyPoint / hardPoint'],
}

const CLASSROOM: VoiceProfile = {
  kind: 'classroom',
  name: '课堂',
  audience: '讲给学生抬头听：一页一句话，念出来就是课堂现场',
  rules: [
    '句子短，一句只说一个意思；能说七个字说完的不要用二十个字。',
    '每页备注至少带一个问句，问句后面标停顿：（停三秒）。不等学生答完不许往下念。',
    '不用「因此」「综上所述」「由此可见」「总而言之」这类书面连接词，直接说下一句。',
    '不叫「教学目标」「环节」「时长」这些教研名词；嘴上说的是「这一段」「这部分」。',
    '答案不进页面文字，只进备注；页面上留给学生的只有问句和画面。',
  ],
  examples: [
    {
      bad: '由此可见，作者正是借桂花这一载体，充分体现出对故乡深切的思念之情。',
      good: '桂花为什么老忘不掉？（停三秒）因为它连着院子里的那个人。',
    },
  ],
  forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
  bannedWords: BANNED_WORD_TEXTS.slice(),
  subjectRules: [
    '少用「请你说」「让我们」「大家可以」，多用「我来」「我这样做」。',
    '要学生做事时，先说清我要做什么，再说他做什么。',
  ],
  maxSentenceChars: 30,
  slots: ['slides[].notes（学生版每页备注）', 'slides[].title / line / items（页面可见文字）'],
}

const DEFENSE: VoiceProfile = {
  kind: 'defense',
  name: '答辩',
  audience: '临场答：评委追问，三十秒内必须收口',
  rules: [
    '先给判断，再给理由：第一句就是答案，不要铺垫。',
    '总共 60 字以内，说完就停，不要补第三层理由。',
    '开头不许「这个问题可以从三个方面来看」；也不许「谢谢评委老师的提问」。',
    '理由要落到这节课的具体动作上：哪一页、哪个提问、学生做了什么。',
  ],
  examples: [
    {
      bad: '这个问题可以从三个方面来看。首先，从课程标准的要求来说……其次，从学情角度而言……最后，从评价设计上看……',
      good: '我把它放在最后。学生先要会数棱，才知道「长宽高」是从棱里抽出来的——顺序反了，概念就是背的。',
    },
  ],
  forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
  bannedWords: BANNED_WORD_TEXTS.slice(),
  subjectRules: ['答的是自己的设计，主语一律是「我」；不要把话推给「我们教研组」「新课标」。'],
  // §D.1「总共 60 字以内」落在单句上；整条 answer 仍守既有 ≤80 字口径（Result.tsx 的 QA_LIMIT），
  // 那一条不归 D 块改。
  maxSentenceChars: 60,
  slots: ['defense[].question / defense[].answer（答辩预案 7 条）'],
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [SHUOKE, CLASSROOM, DEFENSE]

export function getVoiceProfile(kind: VoiceKind): VoiceProfile {
  const hit = VOICE_PROFILES.find((p) => p.kind === kind)
  if (!hit) throw new Error(`没有这套语气档案：${kind}`)
  return hit
}

/* ------------------------- prompt 注入块 ------------------------- */

/**
 * 把一套档案渲染成可以直接拼进 system prompt 的文字：
 * 规则条目 + 正反例 + 「输出前自检：四类句式命中必须为 0」的硬约束。
 * 禁用句式与禁词一律从 FORBIDDEN_PATTERNS / BANNED_WORDS 现取，不另抄一份。
 */
export function voicePromptBlock(kind: VoiceKind): string {
  const p = getVoiceProfile(kind)
  const patterns = FORBIDDEN_PATTERNS.map((x) => `\n- ${x.label}：${x.note}`).join('')
  const words = BANNED_WORDS.map((x) => `\n- ${x.word}：${x.note}`).join('')
  const examples = p.examples
    .map((e) => `\n❌ ${e.bad}\n✅ ${e.good}`)
    .join('\n')
  return [
    `【语气 · ${p.name}】${p.audience}。`,
    ...p.rules.map((r, i) => `${i + 1}. ${r}`),
    `主语规则：${p.subjectRules.join(' ')}`,
    `单句不超过 ${p.maxSentenceChars} 字。`,
    `正反例（会被用 / 会被退回）：${examples}`,
    `这些句式在产物文本里命中数必须为 0：${patterns}${words}`,
    '上屏短句（大标题 / 一行字 / 条目）再守三条：不写四字对偶（「重点讲透，难点绕开」），' +
      '不写「通过 A、B、C」式的三连，不写「出示 X、播放 Y、提问 Z」的动作流水账。',
    '输出前自检：把全部文字从头读一遍，上面这些句式与禁词的命中数必须为 0；' +
      '命中就改写这一句再输出，不要交出来等退回。',
  ].join('\n')
}

/* ------------------------- 扫描 ------------------------- */

export type HitKind = 'pattern' | 'word'

export interface VoiceHit {
  kind: HitKind
  /** 句式 id 或禁词字面量 */
  id: string
  label: string
  note: string
  /** 命中处在这段文本里的偏移（字符） */
  index: number
  /** 命中原文片段（截断到 40 字） */
  matched: string
  /** 命中处前后各留一点的原文上下文 */
  snippet: string
}

export interface VoiceStats {
  text: string
  /** 四类句式各自命中数（key = pattern id） */
  patternCounts: Record<string, number>
  /** 五个禁词各自命中数（key = 禁词字面量） */
  bannedCounts: Record<string, number>
  hits: VoiceHit[]
  /** 句子切分后的统计 */
  sentences: number
  avgSentenceChars: number
  maxSentenceChars: number
  /** 问句（以 ？ / ? 收尾）个数与占比 */
  questions: number
  questionShare: number
  hasQuestion: boolean
  /** §D.3 课堂称呼计数 */
  softSubjectCounts: Record<string, number>
  softSubjectTotal: number
}

/** 可见字数：汉字 + 字母数字，标点和空白不计（与 slides.ts 同一把尺） */
const VISIBLE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]|[0-9A-Za-z]/g

export function visibleChars(text: string): number {
  return (String(text ?? '').match(VISIBLE) ?? []).length
}

/** 按句末标点与换行切句；分号算句号（课堂侧要的是短句子）。行尾标点跟着句子一起留下，否则「这句是不是问句」就无从判断 */
export function splitSentences(text: string): string[] {
  return (String(text ?? '').match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => visibleChars(s) > 0)
}

function snippetOf(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 14)
  const to = Math.min(text.length, end + 14)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}`
}

/** 正则一律现拷一份：/g 的 lastIndex 是共享状态，复用同一个 RegExp 对象会漏数 */
function matchAll(re: RegExp, text: string): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(re.source, re.flags))]
}

/** 扫一段文本：返回四类句式与五个禁词的命中数、命中处偏移与原文片段、句长与问句统计 */
export function scanVoice(text: string): VoiceStats {
  const raw = String(text ?? '')
  const patternCounts: Record<string, number> = {}
  const bannedCounts: Record<string, number> = {}
  const hits: VoiceHit[] = []

  for (const p of FORBIDDEN_PATTERNS) {
    const found = matchAll(p.re, raw)
    patternCounts[p.id] = found.length
    for (const m of found) {
      const matched = m[0] ?? ''
      hits.push({
        kind: 'pattern',
        id: p.id,
        label: p.label,
        note: p.note,
        index: m.index ?? 0,
        matched: matched.length > 40 ? `${matched.slice(0, 39)}…` : matched,
        snippet: snippetOf(raw, m.index ?? 0, (m.index ?? 0) + matched.length),
      })
    }
  }
  for (const b of BANNED_WORDS) {
    const found = matchAll(b.re, raw)
    bannedCounts[b.word] = found.length
    for (const m of found) {
      const matched = m[0] ?? ''
      hits.push({
        kind: 'word',
        id: b.word,
        label: b.word,
        note: b.note,
        index: m.index ?? 0,
        matched: matched.length > 40 ? `${matched.slice(0, 39)}…` : matched,
        snippet: snippetOf(raw, m.index ?? 0, (m.index ?? 0) + matched.length),
      })
    }
  }
  hits.sort((a, b) => a.index - b.index)

  const sentences = splitSentences(raw)
  const lens = sentences.map((s) => visibleChars(s))
  const total = lens.reduce((a, b) => a + b, 0)
  const questions = sentences.filter((s) => /[？?]$/.test(s)).length

  const softSubjectCounts: Record<string, number> = {}
  let softSubjectTotal = 0
  for (const s of SOFT_SUBJECTS) {
    const n = raw.split(s).length - 1
    softSubjectCounts[s] = n
    softSubjectTotal += n
  }

  return {
    text: raw,
    patternCounts,
    bannedCounts,
    hits,
    sentences: sentences.length,
    avgSentenceChars: sentences.length ? Math.round((total / sentences.length) * 10) / 10 : 0,
    maxSentenceChars: lens.length ? Math.max(...lens) : 0,
    questions,
    questionShare: sentences.length ? Math.round((questions / sentences.length) * 100) / 100 : 0,
    hasQuestion: questions > 0,
    softSubjectCounts,
    softSubjectTotal,
  }
}

/** 一份产物里的一条文本（一页备注、一段说课稿、一条答辩……） */
export interface VoiceDocEntry {
  /** 篇 id，如 guihua / bidaxiao */
  doc: string
  /** 字段定位，如 slide#4.notes / deck#3 / speech:说教材 / defense#7.answer */
  field: string
  /** 产物文本本体 */
  text: string
  /** 这段文本住在哪个源文件（相对仓库根），供打印「文件 + 行号」 */
  file?: string
  /** 内容来自哪个语气槽，打印用 */
  slot?: VoiceKind
}

export interface VoiceDocReport {
  entries: (VoiceDocEntry & { stats: VoiceStats })[]
  /** 四类句式总命中数（按 id） */
  patternCounts: Record<string, number>
  /** 五个禁词总命中数（按禁词） */
  bannedCounts: Record<string, number>
  /** 全部硬命中（句式 + 禁词），带 entry 定位 */
  problems: (VoiceHit & { entry: VoiceDocEntry })[]
  /** 平均句长（整份合并后） */
  avgSentenceChars: number
  maxSentenceChars: number
  sentences: number
  /** 问句覆盖情况：带问句的条数 / 总条数，以及缺失清单 */
  questionCovered: number
  questionTracked: number
  questionMissing: VoiceDocEntry[]
  /** §D.3 课堂称呼计数与软超限清单（只警告） */
  softSubjectCounts: Record<string, number>
  softSubjectTotal: number
  softOverLimit: { doc: string; subject: string; count: number }[]
}

function emptyCounts(keys: readonly string[]): Record<string, number> {
  const o: Record<string, number> = {}
  for (const k of keys) o[k] = 0
  return o
}

/**
 * 扫一批产物文本（一次调用的全部产物就是一份 entries）。
 * 判定标准全部来自本文件的 FORBIDDEN_PATTERNS / BANNED_WORDS / SOFT_SUBJECTS，
 * 调用方只负责决定「哪些文本算产物」。
 *
 * questionFields：只有这些字段该带问句（课堂备注、页面文字）。说课稿与答辩不要求问句，
 * 把它们算进覆盖率会把「讲给评委的陈述段」误判成缺问句。
 * sentenceFields：只有这些字段参入句子长度统计。页面文字是把 title / line / items 拼出来的，
 * 中间只有空格没有句号，拿它算平均句长会得出「一句 200 字」这种假数字。
 */
export function scanVoiceDocs(
  entries: VoiceDocEntry[],
  opts?: { questionFields?: RegExp; sentenceFields?: RegExp; softLimit?: number }
): VoiceDocReport {
  const questionFields = opts?.questionFields ?? /(notes|页面|line|items)$/
  const sentenceFields = opts?.sentenceFields ?? /\.(notes|answer|script)$|^speech/
  const softLimit = opts?.softLimit ?? SOFT_SUBJECT_LIMIT

  const patternCounts = emptyCounts(FORBIDDEN_PATTERNS.map((p) => p.id))
  const bannedCounts = emptyCounts(BANNED_WORD_TEXTS)
  const softSubjectCounts = emptyCounts(SOFT_SUBJECTS)
  const problems: (VoiceHit & { entry: VoiceDocEntry })[] = []
  const questionMissing: VoiceDocEntry[] = []

  let sentences = 0
  let sentenceChars = 0
  let maxSentenceChars = 0
  let questionCovered = 0
  let questionTracked = 0
  let softSubjectTotal = 0

  const detailed = entries.map((e) => {
    const stats = scanVoice(e.text)
    for (const [k, v] of Object.entries(stats.patternCounts)) patternCounts[k] += v
    for (const [k, v] of Object.entries(stats.bannedCounts)) bannedCounts[k] += v
    for (const [k, v] of Object.entries(stats.softSubjectCounts)) softSubjectCounts[k] += v
    softSubjectTotal += stats.softSubjectTotal
    if (sentenceFields.test(e.field)) {
      sentences += stats.sentences
      sentenceChars += stats.avgSentenceChars * stats.sentences
      maxSentenceChars = Math.max(maxSentenceChars, stats.maxSentenceChars)
    }
    for (const h of stats.hits) problems.push({ ...h, entry: e })
    if (questionFields.test(e.field)) {
      questionTracked++
      if (stats.hasQuestion) questionCovered++
      else questionMissing.push(e)
    }
    return { ...e, stats }
  })

  const overByDoc = new Map<string, number>()
  for (const e of detailed) {
    for (const s of SOFT_SUBJECTS) {
      const n = e.stats.softSubjectCounts[s] ?? 0
      if (n > 0) overByDoc.set(`${e.doc}｜${s}`, (overByDoc.get(`${e.doc}｜${s}`) ?? 0) + n)
    }
  }
  const softOverLimit = [...overByDoc.entries()]
    .filter(([, n]) => n > softLimit)
    .map(([k, n]) => {
      const [doc, subject] = k.split('｜')
      return { doc, subject, count: n }
    })

  problems.sort((a, b) => a.entry.doc.localeCompare(b.entry.doc) || a.index - b.index)

  return {
    entries: detailed,
    patternCounts,
    bannedCounts,
    problems,
    avgSentenceChars: sentences ? Math.round((sentenceChars / sentences) * 10) / 10 : 0,
    maxSentenceChars,
    sentences,
    questionCovered,
    questionTracked,
    questionMissing,
    softSubjectCounts,
    softSubjectTotal,
    softOverLimit,
  }
}
