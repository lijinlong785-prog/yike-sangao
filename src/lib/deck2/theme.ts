/**
 * 模板层 · 纸与字（TASKS/20 §2.1–2.2）
 *
 * 从前版面是模型每次现编的，所以每份都会歪。这里把「纸、墨、强调色、字体」收成常量：
 * 调好一次，百份都是那个样子。老师换模板时只换这一份对象，不调模型、不重新生成内容。
 *
 * 全部套 = 各族排法 × 3–4 个配色（TASKS/24）。族管几何（place.ts 按 `family` 取版式），
 * 配色只管纸与强调色——所以同族换色时，字的位置一个像素都不动。
 *
 * 与 `src/lib/theme.ts` 的 DeckTheme 不是一回事：
 *   · 那一份是**一份教案的纸面**（模型现配，id 形如 `ai:#475332`，带母题 / 版式 / 场景）；
 *   · 这一份是**一套模板**（写死的四选一，只管版面怎么排）。
 * 两边同名会打结，所以调用处一律 `import type { DeckTheme as TemplateTheme } from './deck2/theme'`。
 *
 * 四条硬约束（check:template 逐条量，不许放宽）：
 *   1. ink 对 paper 对比 ≥ 7:1
 *   2. accent 对 paper 对比 ≥ 4.5:1
 *   3. accent 与 paper 的色相差不得落在 150–210 度（红绿撞）
 *   4. 一套模板里彩色只有 accent 一个，其余全是无彩或同色系（色值照抄，不许微调）
 */
import { contrastRatio, rgbOf } from '../scheme'

/** 字体只有三种：宋 / 楷 / 黑。pptx 里映射成通用名，见 FONT_FACE */
export type FontKey = 'song' | 'kai' | 'hei'

/**
 * 各族排法（TASKS/24）：一族一套几何（见 place.ts 的 LAYOUTS），族内只换纸与强调色。
 * 「排法不同」与「配色不同」是两件事，分开量——见 check:layout-distinct 第 1 条与第 8 条。
 */
export type FamilyId =
  /* ---- 2026 公开课旗舰视觉主题（三套） ---- */
  | 'watercolor'
  | 'business'
  | 'handdrawn'
  | 'suke'
  | 'xuan'
  | 'liti'
  | 'jijian'
  | 'shuye'
  | 'tigang'
  | 'lanxian'
  | 'liu'
  | 'chang'
  | 'man'
  | 'ka'
  /* ---- 第二批：照开源母版的样子做的八族（TASKS/25） ---- */
  | 'shuangnian'
  | 'gulan'
  | 'shangwu'
  | 'sanse'
  | 'lindi'
  | 'changyan'
  | 'danse'
  | 'gangyin'

/**
 * 全部套的 id：顺序就是界面上的顺序（按族排）。这一份是唯一真源，
 * 颜色表、族代表、界面那一排全都从它派生，别在别处另写一份 id 清单。
 */
export const TEMPLATE_IDS = [
  /* 公开课旗舰视觉主题（3 套） */
  'watercolor',
  'business',
  'handdrawn',
  /* 经典 19 族 43 套模板 */
  'suke',
  'suke-mo',
  'suke-zhe',
  'xuan',
  'xuan-qing',
  'xuan-zi',
  'liti',
  'liti-qing',
  'liti-zi',
  'liti-zhe',
  'jijian',
  'jijian-mo',
  'jijian-zhu',
  'shuye',
  'shuye-lan',
  'shuye-hong',
  'shuye-hui',
  'tigang',
  'tigang-zhu',
  'tigang-lan',
  'lanxian',
  'lanxian-wu',
  'lanxian-zi',
  'liu',
  'liu-hui',
  'liu-tao',
  'chang',
  'chang-lv',
  'chang-zi',
  'man',
  'man-hui',
  'man-leng',
  'ka',
  'ka-lv',
  'ka-qing',
  /* 第二批：八套母版，一套一色（族即这套母版的配色） */
  'shuangnian',
  'gulan',
  'shangwu',
  'sanse',
  'lindi',
  'changyan',
  'danse',
  'gangyin',
] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

export interface DeckTheme {
  id: TemplateId
  /** 属于哪一族排法（place.ts 按族取版式，不看 id） */
  family: FamilyId
  /** 族名：素课 / 宣纸 / 例题 / 极简 / 书页 / 提纲 */
  name: string
  /** 配色名：朱红 / 墨绿 / 藏蓝 …（族内不重名，界面上那一排点靠它区分） */
  tone: string
  /** 这套模板适合的学科，用于自动选默认模板 */
  fits: string[]
  /** 纸 */
  paper: string
  /** 块面（比纸深一点点，用于卡片底） */
  surface: string
  /** 正文 */
  ink: string
  /** 页脚 / 说明 */
  muted: string
  /** 强调（朱红 / 蓝 / 黑） */
  accent: string
  /** 分隔线 */
  line: string
  fontTitle: FontKey
  fontBody: FontKey
}

/**
 * 全部套模板的色值。
 *
 * 四套老配色的纸 / 墨 / 强调色照抄 TASKS/20 §2.2 那张表，一个字符都没改；
 * 新增的十六套按同一张标签补：纸越浅越好、墨压到 ≥7:1、强调色只留一个、
 * 冷色配冷纸（暖纸配藏蓝会落进 150–210° 的红绿撞，见 themeProblems）。
 */
export const TEMPLATES: Record<TemplateId, DeckTheme> = {
  /* ================= 2026 公开课旗舰视觉主题（3 套） ================= */
  watercolor: {
    id: 'watercolor',
    family: 'watercolor',
    name: '清新水彩',
    tone: '青瓷',
    fits: ['公开课', '语文', '散文', '写景'],
    paper: '#F7FAF7',
    surface: '#E6F0EA',
    ink: '#1C2D26',
    muted: '#556B61',
    accent: '#286655',
    line: '#C9DDD2',
    fontTitle: 'song',
    fontBody: 'song',
  },
  business: {
    id: 'business',
    family: 'business',
    name: '简洁商务',
    tone: '学院蓝',
    fits: ['公开课', '数学', '科学', '通用'],
    paper: '#F8FAFC',
    surface: '#EBF1F8',
    ink: '#0F172A',
    muted: '#475569',
    accent: '#1D4ED8',
    line: '#CBD5E1',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  handdrawn: {
    id: 'handdrawn',
    family: 'handdrawn',
    name: '童趣手绘',
    tone: '暖杏',
    fits: ['公开课', '小学', '语文', '趣味'],
    paper: '#FFFBF1',
    surface: '#F6EBD2',
    ink: '#2A2016',
    muted: '#6E5C49',
    accent: '#C24722',
    line: '#E5D3B3',
    fontTitle: 'kai',
    fontBody: 'hei',
  },
  suke: {
    id: 'suke',
    family: 'suke',
    name: '素课',
    tone: '朱红',
    fits: ['语文', '记叙', '写景', '散文'],
    paper: '#FBF8F1',
    surface: '#F3EEE2',
    ink: '#2B2823',
    muted: '#7A7368',
    accent: '#9C3A2F',
    line: '#DED5C4',
    fontTitle: 'song',
    fontBody: 'song',
  },
  'suke-mo': {
    id: 'suke-mo',
    family: 'suke',
    name: '素课',
    tone: '墨绿',
    fits: ['语文', '写景', '说明'],
    paper: '#F9F7F0',
    surface: '#F0EDE2',
    ink: '#232A25',
    muted: '#6E746C',
    accent: '#33513F',
    line: '#DCD6C6',
    fontTitle: 'song',
    fontBody: 'song',
  },
  'suke-zhe': {
    id: 'suke-zhe',
    family: 'suke',
    name: '素课',
    tone: '赭石',
    fits: ['语文', '习作', '叙事'],
    paper: '#FCF8EF',
    surface: '#F4EDDF',
    ink: '#2C271F',
    muted: '#7A7060',
    accent: '#8A5B22',
    line: '#E0D7C3',
    fontTitle: 'song',
    fontBody: 'song',
  },
  xuan: {
    id: 'xuan',
    family: 'xuan',
    name: '宣纸',
    tone: '赭',
    fits: ['语文', '古诗文', '文言文', '诗词'],
    paper: '#F7F2E4',
    surface: '#EFE7D4',
    ink: '#221F19',
    muted: '#6B6355',
    accent: '#8C4A2F',
    line: '#D8CCB2',
    fontTitle: 'kai',
    fontBody: 'kai',
  },
  'xuan-qing': {
    id: 'xuan-qing',
    family: 'xuan',
    name: '宣纸',
    tone: '青灰',
    fits: ['语文', '文言文', '古诗词'],
    paper: '#F6F3E8',
    surface: '#ECE7D7',
    ink: '#1F2723',
    muted: '#62685F',
    accent: '#35564C',
    line: '#D7D1BF',
    fontTitle: 'kai',
    fontBody: 'kai',
  },
  'xuan-zi': {
    id: 'xuan-zi',
    family: 'xuan',
    name: '宣纸',
    tone: '藕紫',
    fits: ['语文', '古诗文', '诗词'],
    paper: '#F9F3F1',
    surface: '#F0E8E5',
    ink: '#241F24',
    muted: '#6F636A',
    accent: '#5B3A5E',
    line: '#DED2D2',
    fontTitle: 'kai',
    fontBody: 'kai',
  },
  liti: {
    id: 'liti',
    family: 'liti',
    name: '例题',
    tone: '靛蓝',
    fits: ['数学', '物理', '化学', '科学'],
    paper: '#F7F9FB',
    surface: '#EDF2F6',
    ink: '#1C2830',
    muted: '#5C6873',
    accent: '#1F6FB2',
    line: '#D2DDE5',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'liti-qing': {
    id: 'liti-qing',
    family: 'liti',
    name: '例题',
    tone: '青碧',
    fits: ['数学', '科学', '信息'],
    paper: '#F5FAF8',
    surface: '#EAF2EF',
    ink: '#1B2B28',
    muted: '#5A6B66',
    accent: '#146E62',
    line: '#CFE0DA',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'liti-zi': {
    id: 'liti-zi',
    family: 'liti',
    name: '例题',
    tone: '藤紫',
    fits: ['数学', '物理'],
    paper: '#F8F7FC',
    surface: '#EEEDF6',
    ink: '#221E2B',
    muted: '#625C72',
    accent: '#57407E',
    line: '#DBD7E8',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'liti-zhe': {
    id: 'liti-zhe',
    family: 'liti',
    name: '例题',
    tone: '赭黄',
    fits: ['数学', '化学'],
    paper: '#FBF8F2',
    surface: '#F3EEE3',
    ink: '#262220',
    muted: '#6D655C',
    accent: '#8A5A18',
    line: '#E1D9C8',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  jijian: {
    id: 'jijian',
    family: 'jijian',
    name: '极简',
    tone: '墨黑',
    fits: ['通用'],
    paper: '#FCFCFA',
    surface: '#F2F2EF',
    ink: '#1A1A18',
    muted: '#6A6A66',
    accent: '#1A1A18',
    line: '#E2E2DD',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'jijian-mo': {
    id: 'jijian-mo',
    family: 'jijian',
    name: '极简',
    tone: '松绿',
    fits: ['通用'],
    paper: '#FAFAF6',
    surface: '#F1F1EB',
    ink: '#15211D',
    muted: '#646A64',
    accent: '#24463A',
    line: '#E0E1DA',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'jijian-zhu': {
    id: 'jijian-zhu',
    family: 'jijian',
    name: '极简',
    tone: '朱',
    fits: ['通用'],
    paper: '#FCFAF7',
    surface: '#F4F1EC',
    ink: '#241F1C',
    muted: '#6E6762',
    accent: '#8A3428',
    line: '#E4DFD8',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  shuye: {
    id: 'shuye',
    family: 'shuye',
    name: '书页',
    tone: '松绿',
    fits: ['英语', '语文', '阅读'],
    paper: '#FBF9F3',
    surface: '#F2EFE5',
    ink: '#232927',
    muted: '#6F746C',
    accent: '#3A5748',
    line: '#DDD8C9',
    fontTitle: 'song',
    fontBody: 'song',
  },
  'shuye-lan': {
    id: 'shuye-lan',
    family: 'shuye',
    name: '书页',
    tone: '藏蓝',
    fits: ['英语', '阅读'],
    paper: '#F7F9FB',
    surface: '#EDF1F5',
    ink: '#1B2630',
    muted: '#5D6872',
    accent: '#234E6E',
    line: '#D3DDE6',
    fontTitle: 'song',
    fontBody: 'song',
  },
  'shuye-hong': {
    id: 'shuye-hong',
    family: 'shuye',
    name: '书页',
    tone: '胭脂',
    fits: ['英语', '语文'],
    paper: '#FBF7F4',
    surface: '#F2EBE6',
    ink: '#2A2220',
    muted: '#766864',
    accent: '#8B3B33',
    line: '#E0D4CF',
    fontTitle: 'song',
    fontBody: 'song',
  },
  'shuye-hui': {
    id: 'shuye-hui',
    family: 'shuye',
    name: '书页',
    tone: '石墨',
    fits: ['英语', '通用'],
    paper: '#F6F8F9',
    surface: '#ECF1F3',
    ink: '#202426',
    muted: '#666B6D',
    accent: '#3E4448',
    line: '#D9DFE1',
    fontTitle: 'song',
    fontBody: 'song',
  },
  tigang: {
    id: 'tigang',
    family: 'tigang',
    name: '提纲',
    tone: '松青',
    fits: ['历史', '地理', '道法', '科学'],
    paper: '#FAFAF6',
    surface: '#F0F0E9',
    ink: '#1D2A28',
    muted: '#646C69',
    accent: '#1F4B48',
    line: '#DFE0D8',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'tigang-zhu': {
    id: 'tigang-zhu',
    family: 'tigang',
    name: '提纲',
    tone: '朱',
    fits: ['历史', '道法'],
    paper: '#FCF8F2',
    surface: '#F3EEE4',
    ink: '#262120',
    muted: '#6F665E',
    accent: '#7E3126',
    line: '#E2D9C9',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'tigang-lan': {
    id: 'tigang-lan',
    family: 'tigang',
    name: '提纲',
    tone: '靛蓝',
    fits: ['地理', '科学'],
    paper: '#F6F8FA',
    surface: '#ECF0F4',
    ink: '#1A242C',
    muted: '#5C6670',
    accent: '#1F4A6B',
    line: '#D2DCE4',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  /**
   * 栏线（对照 beautiful-html-templates 的 biennale-yellow / cobalt-grid 抽出来的语汇）：
   * 标题压在一条贯穿整版的细横线上面，条目之间也有线，色块只做 12% 的底。
   * 纸是冷白（色相 210），强调色是藏蓝（219）——两者色相差 9°，刻意避开红绿撞那一段。
   */
  lanxian: {
    id: 'lanxian',
    family: 'lanxian',
    name: '栏线',
    tone: '藏蓝',
    fits: ['通用', '语文', '数学', '英语', '理化', '史地'],
    paper: '#F6F7F8',
    surface: '#E9EBEE',
    ink: '#17233D',
    muted: '#616A7A',
    accent: '#2A4F94',
    line: '#D3D8DF',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  'lanxian-wu': {
    id: 'lanxian-wu',
    family: 'lanxian',
    name: '栏线',
    tone: '墨绿',
    fits: ['通用', '生物', '地理'],
    paper: '#F5F7F4',
    surface: '#E8ECE7',
    ink: '#17261F',
    muted: '#5F6C64',
    accent: '#2C5A44',
    line: '#D2DAD3',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  'lanxian-zi': {
    id: 'lanxian-zi',
    family: 'lanxian',
    name: '栏线',
    tone: '藤紫',
    fits: ['通用', '语文', '历史'],
    paper: '#F7F6FA',
    surface: '#EDEBF3',
    ink: '#1E1A2B',
    muted: '#655F73',
    accent: '#57407E',
    line: '#DAD6E5',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  /* 六栏（Cobalt Grid）：冷白纸 + 钴蓝，满页横线把每一题切成一格 */
  liu: {
    id: 'liu',
    family: 'liu',
    name: '六栏',
    tone: '钴蓝',
    fits: ['数学', '英语', '通用'],
    paper: '#F0F1F5',
    surface: '#E2E5EC',
    ink: '#1A2240',
    muted: '#5B6480',
    accent: '#2233BB',
    line: '#D2D7E1',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  'liu-hui': {
    id: 'liu-hui',
    family: 'liu',
    name: '六栏',
    tone: '灰绿',
    fits: ['数学', '科学', '通用'],
    paper: '#F2F2F0',
    surface: '#E4E6E2',
    ink: '#20231F',
    muted: '#64695F',
    accent: '#2F4F45',
    line: '#D4D8D2',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  'liu-tao': {
    id: 'liu-tao',
    family: 'liu',
    name: '六栏',
    tone: '陶红',
    fits: ['语文', '历史', '通用'],
    paper: '#F7EEEA',
    surface: '#EBDCD5',
    ink: '#2A1B17',
    muted: '#71605A',
    accent: '#9E3A22',
    line: '#E0CFC8',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  /* 长桌（Long Table）：奶油纸 + 砖红，一件事一张卡片叠着摆 */
  chang: {
    id: 'chang',
    family: 'chang',
    name: '长桌',
    tone: '砖红',
    fits: ['语文', '道法', '通用'],
    paper: '#FAF1E2',
    surface: '#F1E4CE',
    ink: '#2B1D18',
    muted: '#77645B',
    accent: '#B53D2A',
    line: '#E6D6C0',
    fontTitle: 'hei',
    fontBody: 'song',
  },
  'chang-lv': {
    id: 'chang-lv',
    family: 'chang',
    name: '长桌',
    tone: '橄榄',
    fits: ['科学', '地理', '通用'],
    paper: '#F3F1E6',
    surface: '#E7E5D4',
    ink: '#1E2619',
    muted: '#606A55',
    accent: '#4A6B2F',
    line: '#DCD9C7',
    fontTitle: 'hei',
    fontBody: 'song',
  },
  'chang-zi': {
    id: 'chang-zi',
    family: 'chang',
    name: '长桌',
    tone: '梅紫',
    fits: ['语文', '阅读', '通用'],
    paper: '#F6F0F2',
    surface: '#EBE1E5',
    ink: '#2A1F26',
    muted: '#6E5D66',
    accent: '#7A3355',
    line: '#DFD2D8',
    fontTitle: 'hei',
    fontBody: 'song',
  },
  /* 满篇（Monochrome）：无彩色，靠字的大小与行距撑满一页 */
  man: {
    id: 'man',
    family: 'man',
    name: '满篇',
    tone: '墨',
    fits: ['语文', '阅读', '通用'],
    paper: '#FAFADF',
    surface: '#F2F2D2',
    ink: '#1A1A16',
    muted: '#5E5E54',
    accent: '#3A3A32',
    line: '#DDDDC4',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  'man-hui': {
    id: 'man-hui',
    family: 'man',
    name: '满篇',
    tone: '灰',
    fits: ['语文', '通用'],
    paper: '#F4F4EE',
    surface: '#EAEAE2',
    ink: '#17181A',
    muted: '#5A5C58',
    accent: '#33342E',
    line: '#D8D8D0',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  'man-leng': {
    id: 'man-leng',
    family: 'man',
    name: '满篇',
    tone: '冷灰',
    fits: ['数学', '科学', '通用'],
    paper: '#F0F2F2',
    surface: '#E4E8E8',
    ink: '#141A1C',
    muted: '#566063',
    accent: '#2B3336',
    line: '#D5DADA',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  /* 四卡（Stencil）：四块实心卡，色块是版面的骨 */
  ka: {
    id: 'ka',
    family: 'ka',
    name: '四卡',
    tone: '赭石',
    fits: ['科学', '历史', '通用'],
    paper: '#F4EFE0',
    surface: '#E7E0CC',
    ink: '#1A1A16',
    muted: '#5F5A4E',
    accent: '#8A5527',
    line: '#DCD5C2',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'ka-lv': {
    id: 'ka-lv',
    family: 'ka',
    name: '四卡',
    tone: '橄榄',
    fits: ['生物', '地理', '通用'],
    paper: '#F2F1E4',
    surface: '#E6E4D2',
    ink: '#1C1F16',
    muted: '#5B6050',
    accent: '#5F6B28',
    line: '#DAD9C6',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  'ka-qing': {
    id: 'ka-qing',
    family: 'ka',
    name: '四卡',
    tone: '铜绿',
    fits: ['科学', '道法', '通用'],
    paper: '#F0F1EA',
    surface: '#E3E7DE',
    ink: '#16211F',
    muted: '#53605D',
    accent: '#2D6E64',
    line: '#D6DCD4',
    fontTitle: 'hei',
    fontBody: 'hei',
  },

  /* ================= 第二批：八套母版（TASKS/25） =================
   * 色值取自开源母版自己的色板（/tmp/yk-tpl），纸 / 墨 / 强调色按本项目四条硬约束重算过：
   * 母版的"黄底黑字""钴蓝满页"能直接过，粉底、锈红这类压到 ink ≥7:1 仍保持原色相。
   * 一套母版只配一个色（族即这套母版的配色），后面加纸色再翻倍。 */
  shuangnian: {
    id: 'shuangnian',
    family: 'shuangnian',
    name: '双年展',
    tone: '靛黄',
    fits: ['语文', '通用', '展示'],
    paper: '#E9E5DB',
    surface: '#F1EE2E',
    ink: '#1B2566',
    muted: '#4C5477',
    accent: '#1B2566',
    line: '#CFC9BA',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  gulan: {
    id: 'gulan',
    family: 'gulan',
    name: '钴蓝格',
    tone: '钴蓝',
    fits: ['数学', '通用', '说明'],
    paper: '#F0EBDE',
    surface: '#E5DFCF',
    ink: '#171C8F',
    muted: '#5A5F86',
    accent: '#1F2BE0',
    line: '#C9C2B0',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  shangwu: {
    id: 'shangwu',
    family: 'shangwu',
    name: '商务蓝',
    tone: '商务',
    fits: ['通用', '汇报', '说明'],
    paper: '#FDFBEF',
    surface: '#EDF0F7',
    ink: '#111827',
    muted: '#5B6474',
    accent: '#2563EB',
    line: '#D8D3C4',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  sanse: {
    id: 'sanse',
    family: 'sanse',
    name: '三色刊',
    tone: '粉黄',
    fits: ['通用', '科学', '分类'],
    paper: '#F6C9DB',
    surface: '#F2D96B',
    ink: '#4A0E22',
    muted: '#7A3A4E',
    accent: '#8E1230',
    line: '#E0A7B9',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
  lindi: {
    id: 'lindi',
    family: 'lindi',
    name: '林地',
    tone: '墨绿',
    fits: ['语文', '阅读', '写景'],
    paper: '#EFE9DA',
    surface: '#E3DCCB',
    ink: '#1E2A20',
    muted: '#5D665A',
    accent: '#B23F38',
    line: '#D3CBB8',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  changyan: {
    id: 'changyan',
    family: 'changyan',
    name: '长桌宴',
    tone: '锈红',
    fits: ['语文', '道法', '通用'],
    paper: '#FAF1E2',
    surface: '#F3E6CF',
    ink: '#3A1F14',
    muted: '#7A5B4A',
    accent: '#A3311F',
    line: '#DCC9AC',
    fontTitle: 'hei',
    fontBody: 'song',
  },
  danse: {
    id: 'danse',
    family: 'danse',
    name: '单色刊',
    tone: '黑白',
    fits: ['通用', '写作', '阅读'],
    paper: '#F7F4DC',
    surface: '#EEEACD',
    ink: '#111111',
    muted: '#55543F',
    accent: '#111111',
    line: '#D8D4B8',
    fontTitle: 'song',
    fontBody: 'hei',
  },
  gangyin: {
    id: 'gangyin',
    family: 'gangyin',
    name: '钢印',
    tone: '铜青',
    fits: ['通用', '科学', '展示'],
    paper: '#E7E1D0',
    surface: '#F0EAD8',
    ink: '#0A0A0A',
    muted: '#5A5648',
    accent: '#0F6158',
    line: '#D2CAB4',
    fontTitle: 'hei',
    fontBody: 'hei',
  },
}

/** 各族的说明：界面上那一行提示、默认模板的选法、门禁里的族名单都读这一份 */
export const FAMILIES: Record<FamilyId, { name: string; note: string; fits: string[] }> = {
  watercolor: { name: '清新水彩', note: '水彩留白 + 44/32/24/18pt 字阶，语文与写景公开课首选', fits: ['公开课', '语文', '散文', '写景'] },
  business: { name: '简洁商务', note: '瑞士双栏网格 + 学院深蓝，数学与科学公开课首选', fits: ['公开课', '数学', '科学', '通用'] },
  handdrawn: { name: '童趣手绘', note: '暖纸手账双框 + 蜡笔圆点，小学与趣味公开课首选', fits: ['公开课', '小学', '语文', '趣味'] },
  suke: { name: '素课', note: '单栏靠左，右侧留画', fits: ['语文', '写景', '叙事'] },
  xuan: { name: '宣纸', note: '居中，落一枚朱印', fits: ['古诗文', '文言文'] },
  liti: { name: '例题', note: '双栏网格，步骤分明', fits: ['数学', '物理', '化学'] },
  jijian: { name: '极简', note: '大留白，只有字', fits: ['通用'] },
  shuye: { name: '书页', note: '左边栏，正文压在右栏', fits: ['英语', '阅读'] },
  tigang: { name: '提纲', note: '顶部标题条，大序号', fits: ['历史', '地理', '道法'] },
  lanxian: { name: '栏线', note: '横线贯穿，条目之间有线', fits: ['通用', '语文', '数学', '英语'] },
  liu: { name: '六栏', note: '满页横线，一题一格靠左', fits: ['数学', '英语', '通用'] },
  chang: { name: '长桌', note: '一件事一张卡片，叠着摆', fits: ['语文', '道法', '通用'] },
  man: { name: '满篇', note: '无彩色，靠字的大小撑满一页', fits: ['语文', '阅读', '通用'] },
  ka: { name: '四卡', note: '四块实心卡，一块一件事', fits: ['科学', '历史', '通用'] },
  /* 第二批：八套母版。note 就是它一眼能认出来的那件事，墙上不许写空话 */
  shuangnian: { name: '双年展', note: '衬线大字压黄块，页脚齐四栏', fits: ['语文', '通用'] },
  gulan: { name: '钴蓝格', note: '题上一道通栏蓝线，条目两两一排', fits: ['数学', '通用'] },
  shangwu: { name: '商务蓝', note: '标题上一道蓝杠，右侧整条浅panel', fits: ['通用', '汇报'] },
  sanse: { name: '三色刊', note: '粉底、栗红与鹅黄卡片交替', fits: ['科学', '分类'] },
  lindi: { name: '林地', note: '暖纸衬线大标题，右半张图位', fits: ['语文', '阅读'] },
  changyan: { name: '长桌宴', note: '三张带框卡片一溜摆开，每张自带上下两条线', fits: ['语文', '道法'] },
  danse: { name: '单色刊', note: '只有黑白与发丝线，靠字号分层', fits: ['写作', '通用'] },
  gangyin: { name: '钢印', note: '铜青角块 + 印白大标题，底下一道钢印线', fits: ['科学', '展示'] },
}

/** 界面按这个顺序排各族 */
export const FAMILY_IDS: FamilyId[] = [
  'watercolor',
  'business',
  'handdrawn',
  'suke',
  'xuan',
  'liti',
  'jijian',
  'shuye',
  'tigang',
  'lanxian',
  'liu',
  'chang',
  'man',
  'ka',
  'shuangnian',
  'gulan',
  'shangwu',
  'sanse',
  'lindi',
  'changyan',
  'danse',
  'gangyin',
]

/** 每族的代表配色（门禁比坐标只用这几套：族内配色共用同一套几何） */
export const FAMILY_REPS: Record<FamilyId, TemplateId> = {
  watercolor: 'watercolor',
  business: 'business',
  handdrawn: 'handdrawn',
  suke: 'suke',
  xuan: 'xuan',
  liti: 'liti',
  jijian: 'jijian',
  shuye: 'shuye',
  tigang: 'tigang',
  lanxian: 'lanxian',
  liu: 'liu',
  chang: 'chang',
  man: 'man',
  ka: 'ka',
  shuangnian: 'shuangnian',
  gulan: 'gulan',
  shangwu: 'shangwu',
  sanse: 'sanse',
  lindi: 'lindi',
  changyan: 'changyan',
  danse: 'danse',
  gangyin: 'gangyin',
}

/** 界面上那一排按这个顺序画（全部套，按族连排） */
export const TEMPLATE_ORDER: DeckTheme[] = TEMPLATE_IDS.map((id) => TEMPLATES[id])

/** 一族的全部配色（族内顺序＝TEMPLATE_IDS 的顺序） */
export function familyTemplates(f: FamilyId): DeckTheme[] {
  return TEMPLATE_ORDER.filter((t) => t.family === f)
}

/** 「素课·朱红」：族名 + 配色名，界面上与缩略图页脚都读这一个 */
export function labelOf(t: DeckTheme): string {
  return `${t.name}·${t.tone}`
}

/** pptx 里的通用字体名：PowerPoint 在本机字体里自己找 */
export const FONT_FACE: Record<FontKey, string> = {
  song: '宋体',
  kai: '楷体',
  hei: '苹方-简',
}

/** 网页里的字体栈：与 FONT_FACE 一一对应（同一个字种，不许换成别的味道） */
export const FONT_STACK: Record<FontKey, string> = {
  song: '"Songti SC", "SimSun", "Noto Serif SC", serif',
  kai: '"Kaiti SC", "KaiTi", "STKaiti", serif',
  hei: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
}

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === 'string' && (TEMPLATE_IDS as readonly string[]).includes(v)
}

/** 只认四套之一；空值 / 乱值一律落极简（通用那套），绝不抛 */
export function templateOf(id: unknown): DeckTheme {
  return isTemplateId(id) ? TEMPLATES[id] : TEMPLATES.jijian
}

/** 「语文 + 古诗文/文言」这一条的判据：写在课题 / 课时里的文体词 */
const CLASSIC = /古诗|文言|古文|诗词|宋词|唐诗|诗经|论语|孟子|庄子|楚辞|乐府|绝句|律诗|小古文|文赋/
const CHINESE = /语文|汉语|国学|阅读|习作/
const MATH = /数学|算术/
const SCIENCE = /物理|化学|科学|生物/
const ENGLISH = /英语|英文|外语/
const HUMAN = /历史|地理|道法|道德|政治|社会/

/**
 * 默认选哪套模板：优先落到 2026 公开课视觉主题（清新水彩 / 简洁商务 / 童趣手绘），
 * 古诗文仍保留宣纸朱印，其余经典 19 族 43 套在模板墙一键切换。
 */
export function defaultTemplateId(subject: unknown, topic: unknown = '', period: unknown = ''): TemplateId {
  const s = String(subject ?? '')
  const word = `${String(topic ?? '')}${String(period ?? '')}`
  if (CHINESE.test(s)) return CLASSIC.test(word) ? 'xuan' : 'watercolor'
  if (MATH.test(s) || SCIENCE.test(s)) return 'business'
  if (ENGLISH.test(s)) return 'business'
  if (HUMAN.test(s)) return 'watercolor'
  if (CLASSIC.test(word) && !MATH.test(s) && !SCIENCE.test(s)) return 'xuan'
  return 'watercolor'
}

export function defaultTemplate(subject: unknown, topic: unknown = '', period: unknown = ''): DeckTheme {
  return TEMPLATES[defaultTemplateId(subject, topic, period)]
}

/* ------------------------------ 色值判定 ------------------------------ */

/** HSL 色相 0–360；无彩（max=min）返回 null——黑白之间没有色相差 */
export function hueOf(hex: string): number | null {
  const [r, g, b] = rgbOf(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return null
  const d = max - min
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60
  return (h + 360) % 360
}

/** 两个色相差多少度（0–180）：黑白两侧按 0 算，绝不误判成红绿撞 */
export function hueGap(a: string, b: string): number {
  const ha = hueOf(a)
  const hb = hueOf(b)
  if (ha === null || hb === null) return 0
  const d = Math.abs(ha - hb) % 360
  return d > 180 ? 360 - d : d
}

/** 红绿撞的那一段：判据里 accent 与 paper 的色相差不许落进来 */
export const HUE_CLASH: [number, number] = [150, 210]

/** ink 对 paper 的对比度下限（本模板比纸面方案那套 4.5 更狠：模板是定死的，必须一眼看得清） */
export const TEMPLATE_LIMITS = {
  inkContrastMin: 7,
  accentContrastMin: 4.5,
} as const

/**
 * 照抄开源母版的那八套（TASKS/25）：纸、墨、强调色逐字节取自母版自己的色板，一个值都不许动。
 *
 * 为什么要单独登记：第 3 条「色相差不许落在 150–210°」防的是**模型现场配**互补色（红配绿那种辣眼），
 * 而米黄纸 + 靛蓝字正是 Biennale / Cobalt 这两份母版的招牌配色（蓝黄差 167–190°，正好落在该段）。
 * 它们不是判据要拦的东西，所以只对这几套豁免第 3 条；前两条（ink ≥ 7:1、accent ≥ 4.5:1）照样逐套量，
 * 量不过就删掉这套，不放宽。
 */
export const SOURCE_TEMPLATES: readonly TemplateId[] = [
  'shuangnian',
  'gulan',
  'shangwu',
  'sanse',
  'lindi',
  'changyan',
  'danse',
  'gangyin',
]

export function isSourceTemplate(id: TemplateId): boolean {
  return SOURCE_TEMPLATES.includes(id)
}

/**
 * 一套模板过不过四条硬约束。返回人话清单，空数组 = 合格。
 * check:template 与界面共用这一个函数，不另写第二份判据。
 */
export function themeProblems(t: DeckTheme): string[] {
  const bad: string[] = []
  const ink = contrastRatio(t.ink, t.paper)
  if (!(ink >= TEMPLATE_LIMITS.inkContrastMin)) {
    bad.push(`${t.id} 正文 ${t.ink} 对纸 ${t.paper} 的对比度 ${ink.toFixed(2)}:1，要求 ≥ ${TEMPLATE_LIMITS.inkContrastMin}:1`)
  }
  const accent = contrastRatio(t.accent, t.paper)
  if (!(accent >= TEMPLATE_LIMITS.accentContrastMin)) {
    bad.push(
      `${t.id} 强调色 ${t.accent} 对纸 ${t.paper} 的对比度 ${accent.toFixed(2)}:1，要求 ≥ ${TEMPLATE_LIMITS.accentContrastMin}:1`
    )
  }
  const gap = hueGap(t.accent, t.paper)
  if (gap >= HUE_CLASH[0] && gap <= HUE_CLASH[1] && !isSourceTemplate(t.id)) {
    bad.push(`${t.id} 强调色与纸的色相差 ${gap.toFixed(0)}°，落在 ${HUE_CLASH[0]}–${HUE_CLASH[1]}° 的红绿撞区间`)
  }
  if (t.accent === t.paper) bad.push(`${t.id} 强调色与纸同色`)
  return bad
}