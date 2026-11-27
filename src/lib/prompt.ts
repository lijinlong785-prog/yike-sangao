import type { LessonInput, LessonPlan } from '../types'
import { isTeacherPage, type DeckPage } from './deck'
import {
  DENSITY_LABELS,
  WORDS_ITEMS_MAX,
  isDensity,
  type DensityLimits,
  type DensityLock,
} from './density'
import { limitsFor, planOfScale, scaleOf, type Scale } from './scale'
import { capacityPromptBlock } from './deck2/capacity'
import { voicePromptBlock } from './voice'
import { splitQuotes } from '../data/texts'

/* ================================================================== *
 * 语气注入（TASKS/08 §D.1）：四条生成路径各取一套档案，规则与正反例     *
 * 一律现从 src/lib/voice.ts 取——那里是四类禁用句式与五个禁词的唯一     *
 * 判定源，校验脚本与 prompt 用的是同一份，不存在第二套写死的正则。      *
 *   · 备课包（speech 说课稿 + segments[].script 环节口播）→ shuoke     *
 *   · 备课包的答辩预案（defense[]，本项目的确有这一槽位）→ defense     *
 *   · 学生版课堂 PPT（slides[] 页面文字与 notes）→ classroom           *
 *   · 纸面配色（src/lib/scheme.ts 的视觉方案）→ 不注入：那一次调用只    *
 *     产色值与版式名，没有叙述文本，套语气档案只会喂给模型废话。         *
 * ================================================================== */

/** 讲给评委听的那一段：说课稿与环节口播共用 */
const VOICE_SHUOKE = voicePromptBlock('shuoke')
/** 临场答的那一段：只管 defense 数组（先判断、再理由、60 字内收口） */
const VOICE_DEFENSE = voicePromptBlock('defense')
/** 讲给学生听的那一段：学生版每一页的文字与备注 */
const VOICE_CLASSROOM = voicePromptBlock('classroom')

export const SYSTEM_PROMPT = `你是一位有 20 年经验的师范生教学技能大赛评委，同时精通中小学各学科教学设计。
你的任务是根据课题，产出一份可以直接拿到课堂上用的完整备课包。

要求：
1. 只输出 JSON，不要任何解释文字，不要 markdown 代码块。
2. 所有文本用中文，口吻是真实的教学语言，不要空话套话。
3. 教学目标、重难点必须具体到这篇课文或这个知识点，禁止写“理解课文”“掌握知识”这类放到哪节课都成立的空话。
4. “答辩预案”给 7 条，问题必须是真实试讲现场评委的追问，每条 answer 不超过 80 个汉字，背下来就能答。
5. “口播稿”必须是站在讲台上能直接说出口的话，口语化，每句不超过 120 字。
6. 各环节 ratio 相加必须等于 1。
7. 板书布局用等宽字符画，宽度不超过 40 个字符，方便手机查看和抄写。
8. 每个环节的 pauses 给 0–2 个停顿点，问句必须一句话说完、不超过 20 个汉字，type 只能是“确认理解 / 引发思考 / 过渡”。
9. 教学准备只出清单、用途和检索词，禁止编造图片、音频内容，也禁止替老师“生成”素材。

${VOICE_SHUOKE}
（上面这套语气管 speech 六段与每个环节的 script。）

${VOICE_DEFENSE}
（上面这套语气只管 defense 数组的 answer。）`

export function buildUserPrompt(input: LessonInput): string {
  const scale = scaleOf(input.duration)
  const lesson = scale === 'lesson'
  /*
   * 09 §S：把规模告诉模型，否则 40 分钟和 4 分钟在它眼里没有区别。
   * clip 那句是 02 以来一直生效的原话，一个字没动；lesson 是新加的一支。
   */
  const segRule = lesson
    ? `- 这是一节 ${Math.round(input.duration / 60)} 分钟的完整课，不是片段。segments 排 6–7 个环节：预习 / 导入 / 字词或基础 / 精读或探究（可以拆成两个）/ 课中练习或课堂活动 / 小结 / 作业，ratio 之和等于 1，其中必须有一段「课中练习或课堂活动」
- 每个环节都要有能开口讲的 scripts：不是提纲，是站在讲台上能直接念的话；重点环节的 script 写足，允许写到 200 字`
    : `- segments 固定 5 个环节：导入 / 初读或新授 / 精读或探究 / 拓展 / 小结，ratio 依次为 0.125、0.2、0.4、0.175、0.1，环节名要具体（例如“精读 · 品味摇花乐”）`

  return `请为以下课题生成备课包：

- 课题：《${input.topic}》
- 学科：${input.subject || '未填——你自己按课题判定，填进 meta.subject'}
- 学段：${input.stage || '未填——你自己判定，填进 meta.stage'}
- 年级：${input.grade || '未填——你自己判定，填进 meta.grade'}
- 课时：${input.period}
- 教材版本：${input.textbook || '不限'}
- 时长：${Math.round(input.duration / 60)} 分钟（按区间选骨架，不是把短课拉长）
${
    input.text?.trim()
      ? `- 老师已经给的原文（逐字，原样抄回 meta.text，一个字都不许改）：\n${input.text.trim()}\n`
      : ''
}
严格按照以下 JSON 结构输出（不要增删字段）：

{
  "meta": { "topic": "", "subject": "", "stage": "", "grade": "", "period": "", "textbook": "", "duration": ${input.duration}, "text": "" },
  "objectives": { "knowledge": "", "process": "", "emotion": "" },
  "keyPoint": "",
  "hardPoint": "",
  "preparation": "",
  "segments": [
    { "name": "环节名", "ratio": 0.125, "goal": "这个环节要达成什么", "teacher": "教师活动", "student": "学生活动", "script": "这一环节的口播稿，能直接念", "pauses": [{ "afterText": "插在哪句话之后", "seconds": 5, "question": "不超过 20 字的问句", "type": "确认理解" }] }
  ],
  "homework": { "must": "", "optional": "" },
  "blackboard": { "layout": "用 ASCII 画出板书布局", "order": ["书写顺序1", "书写顺序2"] },
  "prep": {
    "courseware": [{ "name": "课件素材名", "usage": "什么时候用", "searchHint": "可直接复制去搜的关键词" }],
    "physical": [{ "name": "实物教具名", "usage": "什么时候用" }],
    "media": [{ "name": "音视频名", "usage": "什么时候用", "searchHint": "检索关键词" }]
  },
  "speech": [ { "section": "说教材", "text": "" } ],
  "defense": [ { "question": "", "answer": "" } ]
}

注意：
- meta 里的 subject / stage / grade 必须按你的判断填好；确实判不出来的字段才留空字符串，不要瞎猜
- meta.text 是这节课要用的课本原文，也是学生版「原文页」的唯一来源：老师上面给了原文就原样抄回，一行一句或一行一段、不加序号与出处；没给就自己按课题给 2–3 处课本原文（**一处可以是一整段，≤120 字，优先这节课要抓的重点段**——学生要能指着读一整段，一句一行太薄）：语文是课文原句 / 原段，数学是课本上的定义或法则原句（要带数字），英语是本单元的核心句型原句。一处都没把握就留空字符串，绝对不许编；编一句错的，整节课的原文页都会跟着错。
${segRule}
- speech 要有 6 段：说教材、说学情、说目标、说教法与学法、说教学过程、说板书
- defense 给 7 条，每条 answer 不超过 80 个汉字
- 每个环节 pauses 最多 2 个，seconds 在 3–10 之间；没有必要就不给，不要为了凑数硬加
- pauses[].type 只能是“确认理解”“引发思考”“过渡”三者之一
- prep 三组各给 2–3 项，searchHint 写成老师能直接粘贴的搜索词；没有音视频就留空数组，不要硬凑
- blackboard.layout 用等宽字符画，不要使用任何 markdown 代码围栏符号
- homework 分必做与选做，preparation 列出具体教具`
}

/* ------------------------------------------------------------------ *
 * 学生版课堂 PPT：把教师课件「重写」成学生抬头看得懂的一行字一页     *
 * ------------------------------------------------------------------ */

/** 把课件压成给模型的输入：只给它真正需要的教学信息，不给骨架名词 */
function planToTeacherText(plan: LessonPlan): string {
  const clip = (t: string, n: number) => {
    const s = String(t ?? '').replace(/\s+/g, ' ').trim()
    return s.length > n ? `${s.slice(0, n)}…` : s
  }
  const lines: string[] = []
  lines.push(`三条目标：
- 知识：${clip(plan.objectives?.knowledge, 120)}
- 过程：${clip(plan.objectives?.process, 120)}
- 情感：${clip(plan.objectives?.emotion, 120)}`)
  lines.push(`要讲透的：${clip(plan.keyPoint, 100)}`)
  lines.push(`难突破的：${clip(plan.hardPoint, 100)}`)
  lines.push(
    '各段讲什么、老师怎么说：\n' +
      (plan.segments ?? [])
        .map((seg) => {
          const qs = (seg.pauses ?? []).map((p) => p.question).filter(Boolean).join(' / ')
          return `【${seg.name}】${clip(seg.goal, 60)}｜讲台上的话：${clip(seg.script, 140)}${
            qs ? `｜问学生：${qs}` : ''
          }`
        })
        .join('\n')
  )
  lines.push(`课后：必做 ${clip(plan.homework?.must, 70)}｜选做 ${clip(plan.homework?.optional, 70)}`)
  lines.push(`板书书写顺序：${(plan.blackboard?.order ?? []).map((o) => clip(o, 40)).join('；')}`)
  lines.push(
    `可以用上的检索词：${(plan.prep?.courseware ?? [])
      .map((c) => c.searchHint ?? c.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(' / ')}`
  )
  return lines.join('\n\n')
}

/** 三档判据菜单：未锁档时喂给模型，让它按课文自己挑一档（§B.2） */
const DENSITY_MENU = `档位判据（先按课文自己定一档，再全篇守住这一档，别一页 lean 一页 rich）：
- lean 精简：课文短、古诗、低学段——正文 ≤30 字/页，10 页，非字词页 items ≤4，精读 2 页。
- standard 标准（默认，拿不准就选它）：多数叙事/写人课文——正文 ≤60 字/页，10–12 页，items ≤5，精读 2–3 页。
- rich 充实：长文、说明文、高学段、信息密度大——正文 ≤90 字/页，12–14 页，items ≤6，精读 3 页。`

/** 页数区间的文案：上下限相等就只写一个数，免得 lean 档出现「10–10 页」 */
function pageRangeText(lim: DensityLimits): string {
  return lim.pagesMin === lim.pagesMax ? `${lim.pagesMin} 页` : `${lim.pagesMin}–${lim.pagesMax} 页`
}

/**
 * 老师改定的那一叠课件，按页序交给模型（TASKS/17 §二.3）。
 * 只给标题 / 要点 / 提问：备注是老师自己的口播，不进学生版。
 */
function deckToPrompt(pages: readonly DeckPage[]): string {
  const clip = (t: unknown, n: number) => {
    const s = String(t ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    return [...s].length > n ? `${[...s].slice(0, n).join('')}…` : s
  }
  return pages
    .filter((p) => !isTeacherPage(p))
    .map((p, i) => {
      const bullets = (p.bullets ?? []).map((b) => clip(b, 30)).filter(Boolean)
      const q = p.question ? `｜提问：${clip(p.question, 30)}` : ''
      const body = bullets.length ? `｜${bullets.join(' / ')}` : ''
      return `${i + 1}. 【${p.label || p.kind}】${clip(p.title, 30)}${body}${q}`
    })
    .join('\n')
}

/** 生成学生版课堂 PPT 的重写提示词；lock='auto' 由模型按判据选档，否则锁死到该档。
 *  scale='lesson'（09 §S）时页数改走 26–36、页序跟着环节走，同一页型可以重复。 */
export function buildStudentSlidesPrompt(
  plan: LessonPlan,
  lock: DensityLock = 'auto',
  scale: Scale = scaleOf(plan?.meta?.duration),
  /** 老师已经改定的课件：有它时整份页序与内容以它为准（TASKS/17 §二.3） */
  edited?: readonly DeckPage[]
): { system: string; user: string } {
  const lesson = scale === 'lesson'
  // 锁到具体档就用那一档的硬数字；'auto' 用三档并集做上限，另附判据菜单让模型自选。
  // 页数在整节课档由 limitsFor 按所选时长（20 / 30 / 40）给，clip 档一字不改。
  const lim = limitsFor(lock, scale, plan?.meta?.duration)
  const orderRule = lesson
    ? `2. 页序跟着环节走，不按页型排：头两页是 cover 封面、goals 这节课做三件事， 之后每一个环节 3–4 页（这一段看什么 / 读哪一句 / 试一试），最后三页是 board 板书、homework 作业、end 收尾。同一页型可以重复出现——六七个环节就是六七组页面，不要 为了「页型不重复」把四十节课压回十来页。`
    : `2. 页序固定：cover 封面 → hook 情境导入 → goals 这节课做三件事 → words 字词关 → close-read 精读（1–${lim.closeReadMax} 页）→ compare 对比/迁移 → board 板书 → drill 练一练 → homework 作业 → end 收尾。`
  const tierBlock = isDensity(lock)
    ? `档位已在设置里锁定「${DENSITY_LABELS[lock]}」（硬规则里的数字就是这一档，不许跳出）：正文 ≤${lim.bodyChars} 字/页，${pageRangeText(lim)}，非字词页 items ≤${lim.itemsMax}，精读 ≤${lim.closeReadMax} 页。`
    : `你按判据自选一档（未锁档，硬规则里的数字是三档并集的最宽上限，不超即可，选定后全篇保持一致）：\n${DENSITY_MENU}`
  const system = `你是一位小学老师，正在把自己备好的课件重写成课堂上投给学生看的 PPT。
课件是给老师读的，这叠幻灯片是给学生抬头看的——它们不是同一份东西。
学生一页只读得下一行字，看完就想说。你的任务不是缩写，是换视角重写。

密度档位（三档，任务 08 §B）：
${tierBlock}

原文与动作（不管哪门学科，都必须跟着课文 / 课本走；一条不过整份退回）：
一、有原文时必须用原文。给你的【这节课要讲的句子】就是课本原句（老师贴的，或者备课包里给的），必须原样出现在学生版里，一个字都不许改，不许缩写、不许补标点、不许把不相邻的两句拼成一句。学生版里至少 30% 的页是原文页（kind 填 "quote"）。如果给你的句子很多（老师贴了整篇），只挑 5–8 处做原文页（一处可以是一整段），挑哪几处的依据是课件里说这节课要抓的地方（重点段、关键词所在句）。剩下的句子不要硬塞，宁可少。
  数学课的定义、法则、例句，英语课的句型与例词，和语文的课文原句一样都算原文：课本上怎么写的就怎么摆上屏，不许写成自己的转述。
二、原文页只放两样东西：text = 原文里逐字存在的一句**或一整段**（≤120 字；学生要能指着读一整段，一句一行太薄。超长不用自己截——排版会自动拆页；相邻两句排版会自动并段，你只管照抄）；note = 出处或一句提示（可空，不超过 12 字）。原文页不写问句、不写条目。
三、页面上的每一句话，都要是学生能立刻动手的动作。合格：圈出第 3 段里写潮声的词 / 用“先……接着……最后……”说一遍 / 把这两个字写一遍。不合格（出现即视为错）：全班、同桌、互查、对答案、小组讨论后、汇报、交流一下。

硬规则（一条不过，整份退回）：
0. 页序与内容以老师改定的那一叠课件为准（见 user 里列出的页）：可以换页型、可以裁短，但不许增删环节、不许改动它讲的顺序、不许加入课件里没有的内容。老师删掉的页，学生版里对应内容一个字都不许出现；老师插进去的页，必须有一页对应。
1. 页数 ${pageRangeText(lim)}，一页只讲一件事，宁可多一页也不在一页里塞三件。
${orderRule}
3. kind 只能是这十一个英文值：cover | hook | goals | words | close-read | compare | board | drill | homework | end | quote。
4. 每页正文（line + items 合计）不超过 ${lim.bodyChars} 个字，标题不计入，标点和空白不计入；超一个字就退回。
5. 标题只许两种：**指令**（“圈出写声音的词”）或**结论**（“潮水是从远处一条白线开始的”）。不许写“你觉得呢”“哪一句最重要”“先做哪一件”这类要学生猜老师心思的标题。
6. goals 页的标题固定写“这节课做三件事”，三条条目必须是“动词 + 本课的东西”（“读第 3、4 段，圈出写潮声的词”）；“读懂”“说出想法”“写一段”这种三个字的空话整份退回。
7. 答案绝对不写在页面上，只写进 notes。页面上只有问句和画面，notes 里才是老师的口语讲解与提示。
8. 七个词一个都不许出现：教学目标、教学重难点、教学过程、环节、时长、本环节旨在、核心素养（页面和 notes 都不要用，notes 里说“这一段”“这部分”就好）。
9. 语言是学生语言：具体、有形、能念出口。禁用“通过……掌握……”“旨在……”这类教研腔。
10. 字词关那一页用 kind: "words"，items 里一个词一行，最多 ${WORDS_ITEMS_MAX} 个词（这页会被放大到 54pt，每词不超过 4 字；字词页任何档位都不超过 ${WORDS_ITEMS_MAX} 个词，这一条不随档位放宽）。
11. notes 是上台能直接念的口语，包含这一页的答案或提示，不超过 120 字，不要写“本页讲解……”这种旁白体。
12. 每页都必须带“材料”——学生低头就能指着的东西：一句带引号的原文（逐字）、本课的字词、一个空（（　））、一个数字或一个步骤。只有动作、没有材料的页整份退回，例：“放回句子里读”（读哪句？）“读一遍”（读什么？）“做动作”（做哪个？）。写成“把‘箩筐、杭州、浸润’放回第二段那句话里读”，或者干脆把这几个词直接摆进 items。
13. 标题不许是把老师口头话切下来的碎片：“放回句子里读”“再读一遍”“圈动词”这类只有动作、不说是哪个对象的标题一律退回；标题要么带对象（“箩筐的箩”），要么带原文（“摇呀摇”），要么是一个结论。
13.5 items 里每条都是一件东西（词、逐字原文、数字、步骤），不许写问句。一页只有一个问句，写在 line 里；items 里写问句就成了“正文是原文、条目问另一件事”，学生看到两套话。
14. 封面页是整堂课的门面：title 只有课题几个字；line 是一句点题的副题（如“雨，也可以是香的”），不许写成提问或指令；meta（学段学科 + 年级册次，如“小学语文 · 五年级上册”）、byline（如“五年级（3）班”；不知道班级就写“五年级　　班”，留空给老师填）、imageHint（一张能当封面主图的关键词，不写汉字）三样都要给。
15. 只输出一个 JSON 对象，不要 markdown 代码围栏，不要任何解释文字。
16. 每一页都要踩在这一课的课文/知识点上：出现本课的人物、地名、物件、原句、数字 或步骤。只讲「抓关键词」「怎么读」「怎么想」这种哪门课都能用的方法页，整份退回——方法必须挂在具体内容上（「从‘负荆请罪’这个词看廉颇」）。
17. 正文页不许薄：drill / close-read / hook 页除标题外，items 至少两条，或 line 是一句整话（≥12 字）。只有标题加一句短问（「再读一遍」「你发现了什么」）的页视为坏页——修补时只换那一页，但整份交上来时这类页超过两页就整份退回。40 分钟的课要靠每一页都有可指读的材料撑满，不是靠页数凑。
18. 内容下限（hook / close-read / compare / drill 页三条都过；字词页摆词即可）：
   ① 至少一条完整材料：一句 ≥8 字的原文或整话，或一条算式（4 ○ 2）、公式填空（r²=（　））。drill 的题干必须摆在 items 里，line 只是提示语——items 只有「（　）再香」这种半截填空的退回；填空要把整句摆全：「这里的桂花再香，也比不上（　）」。宁可多摆一句原文，也不要只剩碎词短问。
   ② 单个汉字不许当条目：「抱 / 摇 / 喊」三个单字不是材料，要把字放回整句原文（「帮大人抱着桂花树，使劲地摇」）。要聚焦一个字，就把整句摆上屏、那个字单列在旁边（「浸」＋「没有不浸在桂花香里的」）。
   ③ 题文一致：title / line 说的对象，必须就是 items 里摆的那件东西。标题写「写你家的香」，items 却问「这一课先弄清楚什么」，学生不知道这页要干什么——退回。

上面的数字是内容层的档位；下面这组是模板的物理上限（用十九族里最窄的一套量出来的）。两者取严的那个——一份稿子要能在任何一套模板里都排得下，老师换模板时文字不许丢、不许挤。
${capacityPromptBlock()}

结构：{"slides": [{"kind":"","title":"","text":"","line":"","items":[""],"imageHint":"","pull":"","meta":"","byline":"","notes":"","compareDiff":[""]}]}
- title：学生看到的大字，不超过 12 字
- text：只给 kind 为 quote 的页——逐字抄 user 里【这节课要讲的句子】中的一句（那就是课本原句），其余页留空；不许按自己的记忆另写一句
- line：一句话（原文引句或问句，只能一句）
- items：字词页、作业页、对比页用，每项一行；每条都是一件东西（词 / 逐字原文 / 数字 / 步骤），不许写问句
- meta / byline：只给 cover 页，见第 14 条
- compareDiff：只给 kind 为 compare 的页。items 按左右两栏交替分栏（第 1、2 项一对，第 3、4 项一对，落单的尾巴也算一对），compareDiff 第 k 条就是第 k 对「哪儿不一样」的提示：条数必须等于对数，每条不超过 12 个字（含标点），只指方向不给答案，学生点那一对时浮在两栏中间。给不齐就整个字段宁可不给（网页会自动退回不可点，不会退回整份稿）
- imageHint：只在需要图位时给，写成能直接粘贴去搜的关键词，不超过 12 字
- pull：这一页**要用的那句课本原句**，只给 hook / words / close-read / compare / drill / goals 这几种页；必须逐字抄自 user 里【这节课要讲的句子】，一个字都不许改、不许加省略号。这一页右侧不配插画时，这句话会当引文摆进右半块，替掉一小块空白。这一页跟哪句原文都不搭就留空（""）——不许为了填坑随便抄一句，那比空着难看；自己写的「原句」一个字都对不上原文，会被整条丢掉。封面、原文页、board、homework、end 不填

正例（会被用）：
{"kind":"close-read","title":"摇呀摇","line":"为什么是“摇”，不是“摘”？","items":["“摇呀摇，桂花纷纷落下来。”"],"notes":"提示：摇是几个人抱着树使劲晃，有声音、有动态、有满身的花；摘是一个人轻轻拿下来，安静，也没有场面。谁来把这句读出摇的劲儿？"}

反例（会被退回）：
{"kind":"drill","title":"放回句子里读","notes":"让学生把这几个词放回句子里读一读。"}
这张错在两处：读哪几个词、哪一句，页面上一个都没有；标题是从讲稿里切下来的半句口头话。

{"kind":"close-read","title":"教学重难点","items":["环节时长 4 分钟","通过品读课文掌握借物抒情的方法"],"notes":"本环节旨在引导学生体会作者情感"}
这张幻灯片错在三处：把教案标题搬上屏、写了时长这种只有老师关心的数字、答案直接印在学生脸上。

{"kind":"drill","title":"句子里的谁","line":"你写的那句，里头站着谁？","items":["（　）再香"]}
这张错在：填空只截了半句，学生不知道这是哪句话；line 再完整也替不了 items 里的题干。写成「这里的桂花再香，也比不上（　）」。

{"kind":"close-read","title":"三个动作","line":"摇花那段，我做了哪三个动作？","items":["抱","摇","喊"]}
这张错在：三个单字不是材料，学生指不到任何一句话。把整句摆上屏：「帮大人抱着桂花树，使劲地摇」，再问哪三个动词。

${VOICE_CLASSROOM}
（上面这套语气管每一页的 title / line / items 与 notes。）

最后检查一遍：每页字数超没超 ${lim.bodyChars}？每页都有一件学生能指得到的材料吗？活动页有没有混进单字条目？填空是不是整句？标题和 items 说的是同一件事吗？七个禁词有没有混进来？答案是不是只在 notes 里？`

  const quotes = splitQuotes(String(plan?.meta?.text ?? ''))
  const user = `课题：《${plan.meta.topic}》（${plan.meta.grade}${plan.meta.subject}，${plan.meta.period}）
${lesson ? `这是一节 ${Math.round(Number(plan.meta.duration) / 60)} 分钟的完整课，按环节铺开，不是把每一页裁短。\n` : '\n'}${
    quotes.length
      ? `【这节课要讲的句子】（课文原文，逐字用，一个字都不许改）：\n${quotes.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`
      : '【这节课要讲的句子】这次一句都没有（老师没贴、备课包里也没把握）——这份稿子一页原文页都不许出（kind 不许填 quote），其余页照常，不许凭记忆编一句原文。\n\n'
  }${
    edited?.length
      ? `下面是老师已经改定的课件，页序与文字以它为准；你可以重排成学生能看的页型，但不许增删环节、不许改动它讲的顺序、不许加入课件里没有的内容。（设计意图、上课前准备这两类是给老师自己看的，不上学生版，清单里已经不列。）\n\n${deckToPrompt(edited)}\n\n`
      : '下面是我给老师备的课件，请改写成学生课堂版：\n\n'
  }${edited?.length ? '' : `${planToTeacherText(plan)}\n\n`}按 {"slides": [...]} 输出 ${pageRangeText(lim)}，严格按页序与 kind，不要增删字段。`

  return { system, user }
}

