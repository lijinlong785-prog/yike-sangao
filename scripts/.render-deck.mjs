var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/data/texts.ts
var init_texts = __esm({
  "src/data/texts.ts"() {
    "use strict";
  }
});

// src/lib/endpoint.ts
var init_endpoint = __esm({
  "src/lib/endpoint.ts"() {
    "use strict";
  }
});

// src/lib/watermark.ts
var CRC_TABLE;
var init_watermark = __esm({
  "src/lib/watermark.ts"() {
    "use strict";
    CRC_TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n2 = 0; n2 < 256; n2++) {
        let c = n2;
        for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        t[n2] = c >>> 0;
      }
      return t;
    })();
  }
});

// src/lib/vector.ts
var init_vector = __esm({
  "src/lib/vector.ts"() {
    "use strict";
    init_endpoint();
    init_watermark();
  }
});

// src/lib/illustrate.ts
var init_illustrate = __esm({
  "src/lib/illustrate.ts"() {
    "use strict";
    init_endpoint();
    init_watermark();
    init_vector();
  }
});

// src/lib/density.ts
var DENSITY_ORDER, DEFAULT_DENSITY, DENSITY, DEFAULT_LIMITS, ENVELOPE, PAGE_RANGE;
var init_density = __esm({
  "src/lib/density.ts"() {
    "use strict";
    DENSITY_ORDER = ["lean", "standard", "rich"];
    DEFAULT_DENSITY = "standard";
    DENSITY = {
      lean: { bodyChars: 30, pagesMin: 10, pagesMax: 10, itemsMax: 4, closeReadMax: 2 },
      standard: { bodyChars: 60, pagesMin: 10, pagesMax: 12, itemsMax: 5, closeReadMax: 3 },
      rich: { bodyChars: 90, pagesMin: 12, pagesMax: 14, itemsMax: 6, closeReadMax: 3 }
    };
    DEFAULT_LIMITS = DENSITY[DEFAULT_DENSITY];
    ENVELOPE = {
      bodyChars: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].bodyChars)),
      pagesMin: Math.min(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMin)),
      pagesMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMax)),
      itemsMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].itemsMax)),
      closeReadMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].closeReadMax))
    };
    PAGE_RANGE = { min: ENVELOPE.pagesMin, max: ENVELOPE.pagesMax };
  }
});

// src/lib/scale.ts
var init_scale = __esm({
  "src/lib/scale.ts"() {
    "use strict";
    init_density();
  }
});

// src/lib/scene.ts
import { GIFEncoder } from "gifenc/dist/gifenc.esm.js";
var SCENE, PAL;
var init_scene = __esm({
  "src/lib/scene.ts"() {
    "use strict";
    SCENE = {
      /** 800×450 = 16:9，与 LAYOUT_WIDE 同比例；60 帧实测原样嵌入 WPS / PowerPoint 都会循环播 */
      width: 800,
      height: 450,
      frames: 60,
      /**
       * 一帧 130ms → 整段 7.8s 一循环（TASKS 10 §十一：7.5–10 秒一轮）。
       * 比网页演示的雪花慢：这是投影上的背景板，不是动画片。
       */
      delayMs: 130
    };
    PAL = SCENE.width * SCENE.height;
  }
});

// src/lib/deck.ts
var PAGE_LAYOUTS, LAYOUT_NAME;
var init_deck = __esm({
  "src/lib/deck.ts"() {
    "use strict";
    init_scale();
    init_scene();
    PAGE_LAYOUTS = ["full", "split", "cards", "timeline", "cloze"];
    LAYOUT_NAME = {
      full: "\u6574\u9875\u5927\u56FE",
      split: "\u5DE6\u53F3\u5206\u680F",
      cards: "\u5361\u7247\u5899",
      timeline: "\u65F6\u95F4\u8F74",
      cloze: "\u6316\u7A7A\u731C"
    };
  }
});

// src/lib/theme.ts
var SANS, SERIF, DEFAULT_THEME;
var init_theme = __esm({
  "src/lib/theme.ts"() {
    "use strict";
    SANS = '"PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';
    SERIF = '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif';
    DEFAULT_THEME = {
      id: "builtin-ink",
      name: "\u7EB8\u4E0E\u58A8",
      paper: "#faf8f3",
      coverPaper: "#e2dcd0",
      paperDeep: "#f3efe6",
      paperLine: "#e2dccd",
      ink: "#1e1c19",
      inkSoft: "#56514a",
      accent: "#b23a2e",
      accentSoft: "#f0e0dc",
      serif: SERIF,
      sans: SANS,
      motif: "plain",
      ruleWidth: 1,
      source: "builtin",
      note: "\u7EB8\u4E0E\u58A8\uFF1A\u6CA1\u586B Key \u6216\u6A21\u578B\u6CA1\u4EA4\u51FA\u5408\u683C\u65B9\u6848\u65F6\u7684\u9ED8\u8BA4\u7EB8\u9762\u3002"
    };
  }
});

// src/lib/builtinScheme.ts
function toTheme(p) {
  return {
    id: p.id,
    name: p.name,
    paper: p.paper,
    coverPaper: p.coverPaper,
    paperDeep: p.paperDeep,
    paperLine: p.paperLine,
    ink: p.ink,
    inkSoft: p.inkSoft,
    accent: p.accent,
    accentSoft: p.accentSoft,
    serif: DEFAULT_THEME.serif,
    sans: DEFAULT_THEME.sans,
    motif: p.motif,
    ruleWidth: 1,
    source: "builtin",
    note: p.note
  };
}
var PAPERS, BUILTIN_THEMES;
var init_builtinScheme = __esm({
  "src/lib/builtinScheme.ts"() {
    "use strict";
    init_theme();
    PAPERS = [
      {
        id: "builtin-qiujiang",
        name: "\u79CB\u6C5F",
        note: "\u79CB\u5929\u3001\u82B1\u9999\u3001\u843D\u4E0B\u6765\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u6696\u767D\u7EB8\uFF0C\u6842\u9EC4\u505A\u70B9\u7F00\u3002",
        paper: "#fbf7ec",
        coverPaper: "#e5dcd1",
        paperDeep: "#f3eddf",
        paperLine: "#e5ddc9",
        ink: "#231f18",
        inkSoft: "#5a5346",
        accent: "#9c5a1e",
        accentSoft: "#f1e4d2",
        motif: "plain",
        // 与场景词表同一条纪律：不收单字「香 / 落 / 园 / 摇 / 秋」——
        // 「香蕉」「落到」「公园」会把数学课也拉到这张花香纸上。
        fits: /桂|花|叶子|树叶|落叶|落花|飘落|花香|清香|秋天|秋日|秋风|深秋|花园|校园|果园|院子|雨/g
      },
      {
        id: "builtin-xueyuan",
        name: "\u96EA\u539F",
        note: "\u96EA\u3001\u5C71\u8DEF\u3001\u8FDC\u884C\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u51B7\u767D\u7EB8\uFF0C\u975B\u84DD\u53EA\u7528\u4E8E\u4E00\u5904\u5F3A\u8C03\u3002",
        paper: "#f5f7f9",
        coverPaper: "#dde3ea",
        paperDeep: "#eef2f6",
        paperLine: "#dee4ea",
        ink: "#1d2228",
        inkSoft: "#525c66",
        accent: "#2f5b86",
        accentSoft: "#e2ecf5",
        motif: "plain",
        fits: /雪|山|长征|寒|远|军|路/g
      },
      {
        id: "builtin-qingye",
        name: "\u9752\u91CE",
        note: "\u8349\u5730\u3001\u6625\u5929\u3001\u751F\u957F\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u6DE1\u9752\u7EB8\uFF0C\u8349\u7EFF\u6536\u5728\u5F3A\u8C03\u8272\u4E0A\u3002",
        paper: "#f7f9f2",
        coverPaper: "#dfe4d0",
        paperDeep: "#eef1e5",
        paperLine: "#dfe4d2",
        ink: "#1e2119",
        inkSoft: "#535a48",
        accent: "#4a6a30",
        accentSoft: "#e4eedb",
        motif: "lines",
        fits: /草|树|苗|春|生长|田|绿|虫|鸟/g
      },
      {
        id: "builtin-taihen",
        name: "\u82D4\u75D5",
        note: "\u65E7\u4E8B\u3001\u8001\u5C4B\u3001\u56DE\u5FC6\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u65E7\u7EB8\u9EC4\uFF0C\u8D6D\u77F3\u505A\u5F3A\u8C03\u3002",
        paper: "#f8f4e8",
        coverPaper: "#ded5ca",
        paperDeep: "#efe9da",
        paperLine: "#ded5bf",
        ink: "#221f18",
        inkSoft: "#57503e",
        accent: "#7a5a2a",
        accentSoft: "#eee3cd",
        motif: "silk",
        fits: /旧|老|母|父|故|忆|年|家|乡|念/g
      },
      {
        id: "builtin-mushan",
        name: "\u66AE\u5C71",
        note: "\u79BB\u522B\u3001\u5B89\u9759\u3001\u66AE\u8272\u4E00\u7C7B\u8BFE\u6587\u7528\u8FD9\u5F20\uFF1A\u85D5\u767D\u7EB8\uFF0C\u6697\u7EA2\u505A\u5F3A\u8C03\u3002",
        paper: "#f9f4f5",
        coverPaper: "#e2d7da",
        paperDeep: "#f1eaea",
        paperLine: "#e2d7da",
        ink: "#221e20",
        inkSoft: "#575052",
        accent: "#8a3a4e",
        accentSoft: "#f0e0e5",
        motif: "plain",
        fits: /别|送|离|暮|夜|静|月|思/g
      },
      {
        id: "builtin-mochi",
        name: "\u58A8\u6C60",
        note: "\u53E4\u8BD7\u3001\u6587\u8A00\u3001\u5386\u53F2\u540D\u7BC7\u7528\u8FD9\u5F20\uFF1A\u58A8\u7EFF\u6DF1\u5E95\uFF0C\u7C73\u8272\u5B57\uFF0C\u91D1\u8272\u53EA\u70B9\u4E00\u5904\u3002",
        paper: "#1c2a27",
        // 深纸的封面只能往亮走：再往暗就掉出「纸」的明度底线（11%），变成纯黑。
        coverPaper: "#2e3b33",
        paperDeep: "#16211f",
        paperLine: "#34453f",
        ink: "#ece2c8",
        inkSoft: "#b6ad96",
        accent: "#d9a441",
        accentSoft: "#3b4335",
        motif: "silk",
        fits: /古诗|诗词|文言|古文|名篇|杜甫|李白|苏轼|辛弃疾|陆游|王维|白居易|赤壁|三国|水浒|西游|红楼|史记|论语|唐|宋词/g
      },
      {
        id: "builtin-heiban",
        name: "\u9ED1\u677F",
        note: "\u6570\u5B66\u3001\u79D1\u5B66\u7528\u8FD9\u5F20\uFF1A\u9ED1\u677F\u7EFF\u6DF1\u5E95\uFF0C\u7C89\u7B14\u767D\u5B57\uFF0C\u9EC4\u8272\u53EA\u7528\u4E8E\u4E00\u4E2A\u5173\u952E\u6570\u3002",
        paper: "#243029",
        coverPaper: "#18211c",
        paperDeep: "#1c2621",
        paperLine: "#3d4a41",
        ink: "#f2efe6",
        inkSoft: "#bcc2b6",
        accent: "#e8c46a",
        accentSoft: "#3b4136",
        motif: "lines",
        fits: /数学|算式|加法|减法|乘法|除法|分数|小数|面积|体积|周长|图形|长方形|正方形|三角|统计|方程|规律|单位/g
      }
    ];
    BUILTIN_THEMES = PAPERS.map(toTheme);
  }
});

// src/lib/scheme.ts
function rgbOf(hex) {
  const n2 = parseInt(String(hex).slice(1), 16);
  return [n2 >> 16 & 255, n2 >> 8 & 255, n2 & 255];
}
function relLuminance(hex) {
  const lin = rgbOf(hex).map((v2) => {
    const s = v2 / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
var LAYOUT_HINT;
var init_scheme = __esm({
  "src/lib/scheme.ts"() {
    "use strict";
    init_llm();
    init_deck();
    init_theme();
    init_scene();
    init_builtinScheme();
    LAYOUT_HINT = PAGE_LAYOUTS.map((l) => `${l}=${LAYOUT_NAME[l]}`).join("\u3001");
  }
});

// src/lib/deck2/theme.ts
var theme_exports = {};
__export(theme_exports, {
  FAMILIES: () => FAMILIES,
  FAMILY_IDS: () => FAMILY_IDS,
  FAMILY_REPS: () => FAMILY_REPS,
  FONT_FACE: () => FONT_FACE,
  FONT_STACK: () => FONT_STACK,
  HUE_CLASH: () => HUE_CLASH,
  SOURCE_TEMPLATES: () => SOURCE_TEMPLATES,
  TEMPLATES: () => TEMPLATES,
  TEMPLATE_IDS: () => TEMPLATE_IDS,
  TEMPLATE_LIMITS: () => TEMPLATE_LIMITS,
  TEMPLATE_ORDER: () => TEMPLATE_ORDER,
  defaultTemplate: () => defaultTemplate,
  defaultTemplateId: () => defaultTemplateId,
  familyTemplates: () => familyTemplates,
  hueGap: () => hueGap,
  hueOf: () => hueOf,
  isSourceTemplate: () => isSourceTemplate,
  isTemplateId: () => isTemplateId,
  labelOf: () => labelOf,
  templateOf: () => templateOf,
  themeProblems: () => themeProblems
});
function familyTemplates(f) {
  return TEMPLATE_ORDER.filter((t) => t.family === f);
}
function labelOf(t) {
  return `${t.name}\xB7${t.tone}`;
}
function isTemplateId(v2) {
  return typeof v2 === "string" && TEMPLATE_IDS.includes(v2);
}
function templateOf(id) {
  return isTemplateId(id) ? TEMPLATES[id] : TEMPLATES.jijian;
}
function defaultTemplateId(subject2, topic = "", period = "") {
  const s = String(subject2 ?? "");
  const word = `${String(topic ?? "")}${String(period ?? "")}`;
  if (CHINESE.test(s)) return CLASSIC.test(word) ? "xuan" : "lindi";
  if (MATH.test(s) || SCIENCE.test(s)) return "gulan";
  if (ENGLISH.test(s)) return "shangwu";
  if (HUMAN.test(s)) return "gangyin";
  if (CLASSIC.test(word) && !MATH.test(s) && !SCIENCE.test(s)) return "xuan";
  return "shuangnian";
}
function defaultTemplate(subject2, topic = "", period = "") {
  return TEMPLATES[defaultTemplateId(subject2, topic, period)];
}
function hueOf(hex) {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return (h + 360) % 360;
}
function hueGap(a, b) {
  const ha = hueOf(a);
  const hb = hueOf(b);
  if (ha === null || hb === null) return 0;
  const d = Math.abs(ha - hb) % 360;
  return d > 180 ? 360 - d : d;
}
function isSourceTemplate(id) {
  return SOURCE_TEMPLATES.includes(id);
}
function themeProblems(t) {
  const bad = [];
  const ink = contrastRatio(t.ink, t.paper);
  if (!(ink >= TEMPLATE_LIMITS.inkContrastMin)) {
    bad.push(`${t.id} \u6B63\u6587 ${t.ink} \u5BF9\u7EB8 ${t.paper} \u7684\u5BF9\u6BD4\u5EA6 ${ink.toFixed(2)}:1\uFF0C\u8981\u6C42 \u2265 ${TEMPLATE_LIMITS.inkContrastMin}:1`);
  }
  const accent = contrastRatio(t.accent, t.paper);
  if (!(accent >= TEMPLATE_LIMITS.accentContrastMin)) {
    bad.push(
      `${t.id} \u5F3A\u8C03\u8272 ${t.accent} \u5BF9\u7EB8 ${t.paper} \u7684\u5BF9\u6BD4\u5EA6 ${accent.toFixed(2)}:1\uFF0C\u8981\u6C42 \u2265 ${TEMPLATE_LIMITS.accentContrastMin}:1`
    );
  }
  const gap = hueGap(t.accent, t.paper);
  if (gap >= HUE_CLASH[0] && gap <= HUE_CLASH[1] && !isSourceTemplate(t.id)) {
    bad.push(`${t.id} \u5F3A\u8C03\u8272\u4E0E\u7EB8\u7684\u8272\u76F8\u5DEE ${gap.toFixed(0)}\xB0\uFF0C\u843D\u5728 ${HUE_CLASH[0]}\u2013${HUE_CLASH[1]}\xB0 \u7684\u7EA2\u7EFF\u649E\u533A\u95F4`);
  }
  if (t.accent === t.paper) bad.push(`${t.id} \u5F3A\u8C03\u8272\u4E0E\u7EB8\u540C\u8272`);
  return bad;
}
var TEMPLATE_IDS, TEMPLATES, FAMILIES, FAMILY_IDS, FAMILY_REPS, TEMPLATE_ORDER, FONT_FACE, FONT_STACK, CLASSIC, CHINESE, MATH, SCIENCE, ENGLISH, HUMAN, HUE_CLASH, TEMPLATE_LIMITS, SOURCE_TEMPLATES;
var init_theme2 = __esm({
  "src/lib/deck2/theme.ts"() {
    "use strict";
    init_scheme();
    TEMPLATE_IDS = [
      "suke",
      "suke-mo",
      "suke-zhe",
      "xuan",
      "xuan-qing",
      "xuan-zi",
      "liti",
      "liti-qing",
      "liti-zi",
      "liti-zhe",
      "jijian",
      "jijian-mo",
      "jijian-zhu",
      "shuye",
      "shuye-lan",
      "shuye-hong",
      "shuye-hui",
      "tigang",
      "tigang-zhu",
      "tigang-lan",
      "lanxian",
      "lanxian-wu",
      "lanxian-zi",
      "liu",
      "liu-hui",
      "liu-tao",
      "chang",
      "chang-lv",
      "chang-zi",
      "man",
      "man-hui",
      "man-leng",
      "ka",
      "ka-lv",
      "ka-qing",
      /* 第二批：八套母版，一套一色（族即这套母版的配色） */
      "shuangnian",
      "gulan",
      "shangwu",
      "sanse",
      "lindi",
      "changyan",
      "danse",
      "gangyin"
    ];
    TEMPLATES = {
      suke: {
        id: "suke",
        family: "suke",
        name: "\u7D20\u8BFE",
        tone: "\u6731\u7EA2",
        fits: ["\u8BED\u6587", "\u8BB0\u53D9", "\u5199\u666F", "\u6563\u6587"],
        paper: "#FBF8F1",
        surface: "#F3EEE2",
        ink: "#2B2823",
        muted: "#7A7368",
        accent: "#9C3A2F",
        line: "#DED5C4",
        fontTitle: "song",
        fontBody: "song"
      },
      "suke-mo": {
        id: "suke-mo",
        family: "suke",
        name: "\u7D20\u8BFE",
        tone: "\u58A8\u7EFF",
        fits: ["\u8BED\u6587", "\u5199\u666F", "\u8BF4\u660E"],
        paper: "#F9F7F0",
        surface: "#F0EDE2",
        ink: "#232A25",
        muted: "#6E746C",
        accent: "#33513F",
        line: "#DCD6C6",
        fontTitle: "song",
        fontBody: "song"
      },
      "suke-zhe": {
        id: "suke-zhe",
        family: "suke",
        name: "\u7D20\u8BFE",
        tone: "\u8D6D\u77F3",
        fits: ["\u8BED\u6587", "\u4E60\u4F5C", "\u53D9\u4E8B"],
        paper: "#FCF8EF",
        surface: "#F4EDDF",
        ink: "#2C271F",
        muted: "#7A7060",
        accent: "#8A5B22",
        line: "#E0D7C3",
        fontTitle: "song",
        fontBody: "song"
      },
      xuan: {
        id: "xuan",
        family: "xuan",
        name: "\u5BA3\u7EB8",
        tone: "\u8D6D",
        fits: ["\u8BED\u6587", "\u53E4\u8BD7\u6587", "\u6587\u8A00\u6587", "\u8BD7\u8BCD"],
        paper: "#F7F2E4",
        surface: "#EFE7D4",
        ink: "#221F19",
        muted: "#6B6355",
        accent: "#8C4A2F",
        line: "#D8CCB2",
        fontTitle: "kai",
        fontBody: "kai"
      },
      "xuan-qing": {
        id: "xuan-qing",
        family: "xuan",
        name: "\u5BA3\u7EB8",
        tone: "\u9752\u7070",
        fits: ["\u8BED\u6587", "\u6587\u8A00\u6587", "\u53E4\u8BD7\u8BCD"],
        paper: "#F6F3E8",
        surface: "#ECE7D7",
        ink: "#1F2723",
        muted: "#62685F",
        accent: "#35564C",
        line: "#D7D1BF",
        fontTitle: "kai",
        fontBody: "kai"
      },
      "xuan-zi": {
        id: "xuan-zi",
        family: "xuan",
        name: "\u5BA3\u7EB8",
        tone: "\u85D5\u7D2B",
        fits: ["\u8BED\u6587", "\u53E4\u8BD7\u6587", "\u8BD7\u8BCD"],
        paper: "#F9F3F1",
        surface: "#F0E8E5",
        ink: "#241F24",
        muted: "#6F636A",
        accent: "#5B3A5E",
        line: "#DED2D2",
        fontTitle: "kai",
        fontBody: "kai"
      },
      liti: {
        id: "liti",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u975B\u84DD",
        fits: ["\u6570\u5B66", "\u7269\u7406", "\u5316\u5B66", "\u79D1\u5B66"],
        paper: "#F7F9FB",
        surface: "#EDF2F6",
        ink: "#1C2830",
        muted: "#5C6873",
        accent: "#1F6FB2",
        line: "#D2DDE5",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "liti-qing": {
        id: "liti-qing",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u9752\u78A7",
        fits: ["\u6570\u5B66", "\u79D1\u5B66", "\u4FE1\u606F"],
        paper: "#F5FAF8",
        surface: "#EAF2EF",
        ink: "#1B2B28",
        muted: "#5A6B66",
        accent: "#146E62",
        line: "#CFE0DA",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "liti-zi": {
        id: "liti-zi",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u85E4\u7D2B",
        fits: ["\u6570\u5B66", "\u7269\u7406"],
        paper: "#F8F7FC",
        surface: "#EEEDF6",
        ink: "#221E2B",
        muted: "#625C72",
        accent: "#57407E",
        line: "#DBD7E8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "liti-zhe": {
        id: "liti-zhe",
        family: "liti",
        name: "\u4F8B\u9898",
        tone: "\u8D6D\u9EC4",
        fits: ["\u6570\u5B66", "\u5316\u5B66"],
        paper: "#FBF8F2",
        surface: "#F3EEE3",
        ink: "#262220",
        muted: "#6D655C",
        accent: "#8A5A18",
        line: "#E1D9C8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      jijian: {
        id: "jijian",
        family: "jijian",
        name: "\u6781\u7B80",
        tone: "\u58A8\u9ED1",
        fits: ["\u901A\u7528"],
        paper: "#FCFCFA",
        surface: "#F2F2EF",
        ink: "#1A1A18",
        muted: "#6A6A66",
        accent: "#1A1A18",
        line: "#E2E2DD",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "jijian-mo": {
        id: "jijian-mo",
        family: "jijian",
        name: "\u6781\u7B80",
        tone: "\u677E\u7EFF",
        fits: ["\u901A\u7528"],
        paper: "#FAFAF6",
        surface: "#F1F1EB",
        ink: "#15211D",
        muted: "#646A64",
        accent: "#24463A",
        line: "#E0E1DA",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "jijian-zhu": {
        id: "jijian-zhu",
        family: "jijian",
        name: "\u6781\u7B80",
        tone: "\u6731",
        fits: ["\u901A\u7528"],
        paper: "#FCFAF7",
        surface: "#F4F1EC",
        ink: "#241F1C",
        muted: "#6E6762",
        accent: "#8A3428",
        line: "#E4DFD8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      shuye: {
        id: "shuye",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u677E\u7EFF",
        fits: ["\u82F1\u8BED", "\u8BED\u6587", "\u9605\u8BFB"],
        paper: "#FBF9F3",
        surface: "#F2EFE5",
        ink: "#232927",
        muted: "#6F746C",
        accent: "#3A5748",
        line: "#DDD8C9",
        fontTitle: "song",
        fontBody: "song"
      },
      "shuye-lan": {
        id: "shuye-lan",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u85CF\u84DD",
        fits: ["\u82F1\u8BED", "\u9605\u8BFB"],
        paper: "#F7F9FB",
        surface: "#EDF1F5",
        ink: "#1B2630",
        muted: "#5D6872",
        accent: "#234E6E",
        line: "#D3DDE6",
        fontTitle: "song",
        fontBody: "song"
      },
      "shuye-hong": {
        id: "shuye-hong",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u80ED\u8102",
        fits: ["\u82F1\u8BED", "\u8BED\u6587"],
        paper: "#FBF7F4",
        surface: "#F2EBE6",
        ink: "#2A2220",
        muted: "#766864",
        accent: "#8B3B33",
        line: "#E0D4CF",
        fontTitle: "song",
        fontBody: "song"
      },
      "shuye-hui": {
        id: "shuye-hui",
        family: "shuye",
        name: "\u4E66\u9875",
        tone: "\u77F3\u58A8",
        fits: ["\u82F1\u8BED", "\u901A\u7528"],
        paper: "#F6F8F9",
        surface: "#ECF1F3",
        ink: "#202426",
        muted: "#666B6D",
        accent: "#3E4448",
        line: "#D9DFE1",
        fontTitle: "song",
        fontBody: "song"
      },
      tigang: {
        id: "tigang",
        family: "tigang",
        name: "\u63D0\u7EB2",
        tone: "\u677E\u9752",
        fits: ["\u5386\u53F2", "\u5730\u7406", "\u9053\u6CD5", "\u79D1\u5B66"],
        paper: "#FAFAF6",
        surface: "#F0F0E9",
        ink: "#1D2A28",
        muted: "#646C69",
        accent: "#1F4B48",
        line: "#DFE0D8",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "tigang-zhu": {
        id: "tigang-zhu",
        family: "tigang",
        name: "\u63D0\u7EB2",
        tone: "\u6731",
        fits: ["\u5386\u53F2", "\u9053\u6CD5"],
        paper: "#FCF8F2",
        surface: "#F3EEE4",
        ink: "#262120",
        muted: "#6F665E",
        accent: "#7E3126",
        line: "#E2D9C9",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "tigang-lan": {
        id: "tigang-lan",
        family: "tigang",
        name: "\u63D0\u7EB2",
        tone: "\u975B\u84DD",
        fits: ["\u5730\u7406", "\u79D1\u5B66"],
        paper: "#F6F8FA",
        surface: "#ECF0F4",
        ink: "#1A242C",
        muted: "#5C6670",
        accent: "#1F4A6B",
        line: "#D2DCE4",
        fontTitle: "hei",
        fontBody: "hei"
      },
      /**
       * 栏线（对照 beautiful-html-templates 的 biennale-yellow / cobalt-grid 抽出来的语汇）：
       * 标题压在一条贯穿整版的细横线上面，条目之间也有线，色块只做 12% 的底。
       * 纸是冷白（色相 210），强调色是藏蓝（219）——两者色相差 9°，刻意避开红绿撞那一段。
       */
      lanxian: {
        id: "lanxian",
        family: "lanxian",
        name: "\u680F\u7EBF",
        tone: "\u85CF\u84DD",
        fits: ["\u901A\u7528", "\u8BED\u6587", "\u6570\u5B66", "\u82F1\u8BED", "\u7406\u5316", "\u53F2\u5730"],
        paper: "#F6F7F8",
        surface: "#E9EBEE",
        ink: "#17233D",
        muted: "#616A7A",
        accent: "#2A4F94",
        line: "#D3D8DF",
        fontTitle: "song",
        fontBody: "hei"
      },
      "lanxian-wu": {
        id: "lanxian-wu",
        family: "lanxian",
        name: "\u680F\u7EBF",
        tone: "\u58A8\u7EFF",
        fits: ["\u901A\u7528", "\u751F\u7269", "\u5730\u7406"],
        paper: "#F5F7F4",
        surface: "#E8ECE7",
        ink: "#17261F",
        muted: "#5F6C64",
        accent: "#2C5A44",
        line: "#D2DAD3",
        fontTitle: "song",
        fontBody: "hei"
      },
      "lanxian-zi": {
        id: "lanxian-zi",
        family: "lanxian",
        name: "\u680F\u7EBF",
        tone: "\u85E4\u7D2B",
        fits: ["\u901A\u7528", "\u8BED\u6587", "\u5386\u53F2"],
        paper: "#F7F6FA",
        surface: "#EDEBF3",
        ink: "#1E1A2B",
        muted: "#655F73",
        accent: "#57407E",
        line: "#DAD6E5",
        fontTitle: "song",
        fontBody: "hei"
      },
      /* 六栏（Cobalt Grid）：冷白纸 + 钴蓝，满页横线把每一题切成一格 */
      liu: {
        id: "liu",
        family: "liu",
        name: "\u516D\u680F",
        tone: "\u94B4\u84DD",
        fits: ["\u6570\u5B66", "\u82F1\u8BED", "\u901A\u7528"],
        paper: "#F0F1F5",
        surface: "#E2E5EC",
        ink: "#1A2240",
        muted: "#5B6480",
        accent: "#2233BB",
        line: "#D2D7E1",
        fontTitle: "song",
        fontBody: "hei"
      },
      "liu-hui": {
        id: "liu-hui",
        family: "liu",
        name: "\u516D\u680F",
        tone: "\u7070\u7EFF",
        fits: ["\u6570\u5B66", "\u79D1\u5B66", "\u901A\u7528"],
        paper: "#F2F2F0",
        surface: "#E4E6E2",
        ink: "#20231F",
        muted: "#64695F",
        accent: "#2F4F45",
        line: "#D4D8D2",
        fontTitle: "song",
        fontBody: "hei"
      },
      "liu-tao": {
        id: "liu-tao",
        family: "liu",
        name: "\u516D\u680F",
        tone: "\u9676\u7EA2",
        fits: ["\u8BED\u6587", "\u5386\u53F2", "\u901A\u7528"],
        paper: "#F7EEEA",
        surface: "#EBDCD5",
        ink: "#2A1B17",
        muted: "#71605A",
        accent: "#9E3A22",
        line: "#E0CFC8",
        fontTitle: "song",
        fontBody: "hei"
      },
      /* 长桌（Long Table）：奶油纸 + 砖红，一件事一张卡片叠着摆 */
      chang: {
        id: "chang",
        family: "chang",
        name: "\u957F\u684C",
        tone: "\u7816\u7EA2",
        fits: ["\u8BED\u6587", "\u9053\u6CD5", "\u901A\u7528"],
        paper: "#FAF1E2",
        surface: "#F1E4CE",
        ink: "#2B1D18",
        muted: "#77645B",
        accent: "#B53D2A",
        line: "#E6D6C0",
        fontTitle: "hei",
        fontBody: "song"
      },
      "chang-lv": {
        id: "chang-lv",
        family: "chang",
        name: "\u957F\u684C",
        tone: "\u6A44\u6984",
        fits: ["\u79D1\u5B66", "\u5730\u7406", "\u901A\u7528"],
        paper: "#F3F1E6",
        surface: "#E7E5D4",
        ink: "#1E2619",
        muted: "#606A55",
        accent: "#4A6B2F",
        line: "#DCD9C7",
        fontTitle: "hei",
        fontBody: "song"
      },
      "chang-zi": {
        id: "chang-zi",
        family: "chang",
        name: "\u957F\u684C",
        tone: "\u6885\u7D2B",
        fits: ["\u8BED\u6587", "\u9605\u8BFB", "\u901A\u7528"],
        paper: "#F6F0F2",
        surface: "#EBE1E5",
        ink: "#2A1F26",
        muted: "#6E5D66",
        accent: "#7A3355",
        line: "#DFD2D8",
        fontTitle: "hei",
        fontBody: "song"
      },
      /* 满篇（Monochrome）：无彩色，靠字的大小与行距撑满一页 */
      man: {
        id: "man",
        family: "man",
        name: "\u6EE1\u7BC7",
        tone: "\u58A8",
        fits: ["\u8BED\u6587", "\u9605\u8BFB", "\u901A\u7528"],
        paper: "#FAFADF",
        surface: "#F2F2D2",
        ink: "#1A1A16",
        muted: "#5E5E54",
        accent: "#3A3A32",
        line: "#DDDDC4",
        fontTitle: "song",
        fontBody: "hei"
      },
      "man-hui": {
        id: "man-hui",
        family: "man",
        name: "\u6EE1\u7BC7",
        tone: "\u7070",
        fits: ["\u8BED\u6587", "\u901A\u7528"],
        paper: "#F4F4EE",
        surface: "#EAEAE2",
        ink: "#17181A",
        muted: "#5A5C58",
        accent: "#33342E",
        line: "#D8D8D0",
        fontTitle: "song",
        fontBody: "hei"
      },
      "man-leng": {
        id: "man-leng",
        family: "man",
        name: "\u6EE1\u7BC7",
        tone: "\u51B7\u7070",
        fits: ["\u6570\u5B66", "\u79D1\u5B66", "\u901A\u7528"],
        paper: "#F0F2F2",
        surface: "#E4E8E8",
        ink: "#141A1C",
        muted: "#566063",
        accent: "#2B3336",
        line: "#D5DADA",
        fontTitle: "song",
        fontBody: "hei"
      },
      /* 四卡（Stencil）：四块实心卡，色块是版面的骨 */
      ka: {
        id: "ka",
        family: "ka",
        name: "\u56DB\u5361",
        tone: "\u8D6D\u77F3",
        fits: ["\u79D1\u5B66", "\u5386\u53F2", "\u901A\u7528"],
        paper: "#F4EFE0",
        surface: "#E7E0CC",
        ink: "#1A1A16",
        muted: "#5F5A4E",
        accent: "#8A5527",
        line: "#DCD5C2",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "ka-lv": {
        id: "ka-lv",
        family: "ka",
        name: "\u56DB\u5361",
        tone: "\u6A44\u6984",
        fits: ["\u751F\u7269", "\u5730\u7406", "\u901A\u7528"],
        paper: "#F2F1E4",
        surface: "#E6E4D2",
        ink: "#1C1F16",
        muted: "#5B6050",
        accent: "#5F6B28",
        line: "#DAD9C6",
        fontTitle: "hei",
        fontBody: "hei"
      },
      "ka-qing": {
        id: "ka-qing",
        family: "ka",
        name: "\u56DB\u5361",
        tone: "\u94DC\u7EFF",
        fits: ["\u79D1\u5B66", "\u9053\u6CD5", "\u901A\u7528"],
        paper: "#F0F1EA",
        surface: "#E3E7DE",
        ink: "#16211F",
        muted: "#53605D",
        accent: "#2D6E64",
        line: "#D6DCD4",
        fontTitle: "hei",
        fontBody: "hei"
      },
      /* ================= 第二批：八套母版（TASKS/25） =================
       * 色值取自开源母版自己的色板（/tmp/yk-tpl），纸 / 墨 / 强调色按本项目四条硬约束重算过：
       * 母版的"黄底黑字""钴蓝满页"能直接过，粉底、锈红这类压到 ink ≥7:1 仍保持原色相。
       * 一套母版只配一个色（族即这套母版的配色），后面加纸色再翻倍。 */
      shuangnian: {
        id: "shuangnian",
        family: "shuangnian",
        name: "\u53CC\u5E74\u5C55",
        tone: "\u975B\u9EC4",
        fits: ["\u8BED\u6587", "\u901A\u7528", "\u5C55\u793A"],
        paper: "#E9E5DB",
        surface: "#F1EE2E",
        ink: "#1B2566",
        muted: "#4C5477",
        accent: "#1B2566",
        line: "#CFC9BA",
        fontTitle: "song",
        fontBody: "hei"
      },
      gulan: {
        id: "gulan",
        family: "gulan",
        name: "\u94B4\u84DD\u683C",
        tone: "\u94B4\u84DD",
        fits: ["\u6570\u5B66", "\u901A\u7528", "\u8BF4\u660E"],
        paper: "#F0EBDE",
        surface: "#E5DFCF",
        ink: "#171C8F",
        muted: "#5A5F86",
        accent: "#1F2BE0",
        line: "#C9C2B0",
        fontTitle: "song",
        fontBody: "hei"
      },
      shangwu: {
        id: "shangwu",
        family: "shangwu",
        name: "\u5546\u52A1\u84DD",
        tone: "\u5546\u52A1",
        fits: ["\u901A\u7528", "\u6C47\u62A5", "\u8BF4\u660E"],
        paper: "#FDFBEF",
        surface: "#EDF0F7",
        ink: "#111827",
        muted: "#5B6474",
        accent: "#2563EB",
        line: "#D8D3C4",
        fontTitle: "hei",
        fontBody: "hei"
      },
      sanse: {
        id: "sanse",
        family: "sanse",
        name: "\u4E09\u8272\u520A",
        tone: "\u7C89\u9EC4",
        fits: ["\u901A\u7528", "\u79D1\u5B66", "\u5206\u7C7B"],
        paper: "#F6C9DB",
        surface: "#F2D96B",
        ink: "#4A0E22",
        muted: "#7A3A4E",
        accent: "#8E1230",
        line: "#E0A7B9",
        fontTitle: "hei",
        fontBody: "hei"
      },
      lindi: {
        id: "lindi",
        family: "lindi",
        name: "\u6797\u5730",
        tone: "\u58A8\u7EFF",
        fits: ["\u8BED\u6587", "\u9605\u8BFB", "\u5199\u666F"],
        paper: "#EFE9DA",
        surface: "#E3DCCB",
        ink: "#1E2A20",
        muted: "#5D665A",
        accent: "#B23F38",
        line: "#D3CBB8",
        fontTitle: "song",
        fontBody: "hei"
      },
      changyan: {
        id: "changyan",
        family: "changyan",
        name: "\u957F\u684C\u5BB4",
        tone: "\u9508\u7EA2",
        fits: ["\u8BED\u6587", "\u9053\u6CD5", "\u901A\u7528"],
        paper: "#FAF1E2",
        surface: "#F3E6CF",
        ink: "#3A1F14",
        muted: "#7A5B4A",
        accent: "#A3311F",
        line: "#DCC9AC",
        fontTitle: "hei",
        fontBody: "song"
      },
      danse: {
        id: "danse",
        family: "danse",
        name: "\u5355\u8272\u520A",
        tone: "\u9ED1\u767D",
        fits: ["\u901A\u7528", "\u5199\u4F5C", "\u9605\u8BFB"],
        paper: "#F7F4DC",
        surface: "#EEEACD",
        ink: "#111111",
        muted: "#55543F",
        accent: "#111111",
        line: "#D8D4B8",
        fontTitle: "song",
        fontBody: "hei"
      },
      gangyin: {
        id: "gangyin",
        family: "gangyin",
        name: "\u94A2\u5370",
        tone: "\u94DC\u9752",
        fits: ["\u901A\u7528", "\u79D1\u5B66", "\u5C55\u793A"],
        paper: "#E7E1D0",
        surface: "#F0EAD8",
        ink: "#0A0A0A",
        muted: "#5A5648",
        accent: "#0F6158",
        line: "#D2CAB4",
        fontTitle: "hei",
        fontBody: "hei"
      }
    };
    FAMILIES = {
      suke: { name: "\u7D20\u8BFE", note: "\u5355\u680F\u9760\u5DE6\uFF0C\u53F3\u4FA7\u7559\u753B", fits: ["\u8BED\u6587", "\u5199\u666F", "\u53D9\u4E8B"] },
      xuan: { name: "\u5BA3\u7EB8", note: "\u5C45\u4E2D\uFF0C\u843D\u4E00\u679A\u6731\u5370", fits: ["\u53E4\u8BD7\u6587", "\u6587\u8A00\u6587"] },
      liti: { name: "\u4F8B\u9898", note: "\u53CC\u680F\u7F51\u683C\uFF0C\u6B65\u9AA4\u5206\u660E", fits: ["\u6570\u5B66", "\u7269\u7406", "\u5316\u5B66"] },
      jijian: { name: "\u6781\u7B80", note: "\u5927\u7559\u767D\uFF0C\u53EA\u6709\u5B57", fits: ["\u901A\u7528"] },
      shuye: { name: "\u4E66\u9875", note: "\u5DE6\u8FB9\u680F\uFF0C\u6B63\u6587\u538B\u5728\u53F3\u680F", fits: ["\u82F1\u8BED", "\u9605\u8BFB"] },
      tigang: { name: "\u63D0\u7EB2", note: "\u9876\u90E8\u6807\u9898\u6761\uFF0C\u5927\u5E8F\u53F7", fits: ["\u5386\u53F2", "\u5730\u7406", "\u9053\u6CD5"] },
      lanxian: { name: "\u680F\u7EBF", note: "\u6A2A\u7EBF\u8D2F\u7A7F\uFF0C\u6761\u76EE\u4E4B\u95F4\u6709\u7EBF", fits: ["\u901A\u7528", "\u8BED\u6587", "\u6570\u5B66", "\u82F1\u8BED"] },
      liu: { name: "\u516D\u680F", note: "\u6EE1\u9875\u6A2A\u7EBF\uFF0C\u4E00\u9898\u4E00\u683C\u9760\u5DE6", fits: ["\u6570\u5B66", "\u82F1\u8BED", "\u901A\u7528"] },
      chang: { name: "\u957F\u684C", note: "\u4E00\u4EF6\u4E8B\u4E00\u5F20\u5361\u7247\uFF0C\u53E0\u7740\u6446", fits: ["\u8BED\u6587", "\u9053\u6CD5", "\u901A\u7528"] },
      man: { name: "\u6EE1\u7BC7", note: "\u65E0\u5F69\u8272\uFF0C\u9760\u5B57\u7684\u5927\u5C0F\u6491\u6EE1\u4E00\u9875", fits: ["\u8BED\u6587", "\u9605\u8BFB", "\u901A\u7528"] },
      ka: { name: "\u56DB\u5361", note: "\u56DB\u5757\u5B9E\u5FC3\u5361\uFF0C\u4E00\u5757\u4E00\u4EF6\u4E8B", fits: ["\u79D1\u5B66", "\u5386\u53F2", "\u901A\u7528"] },
      /* 第二批：八套母版。note 就是它一眼能认出来的那件事，墙上不许写空话 */
      shuangnian: { name: "\u53CC\u5E74\u5C55", note: "\u886C\u7EBF\u5927\u5B57\u538B\u9EC4\u5757\uFF0C\u9875\u811A\u9F50\u56DB\u680F", fits: ["\u8BED\u6587", "\u901A\u7528"] },
      gulan: { name: "\u94B4\u84DD\u683C", note: "\u9898\u4E0A\u4E00\u9053\u901A\u680F\u84DD\u7EBF\uFF0C\u6761\u76EE\u4E24\u4E24\u4E00\u6392", fits: ["\u6570\u5B66", "\u901A\u7528"] },
      shangwu: { name: "\u5546\u52A1\u84DD", note: "\u6807\u9898\u4E0A\u4E00\u9053\u84DD\u6760\uFF0C\u53F3\u4FA7\u6574\u6761\u6D45panel", fits: ["\u901A\u7528", "\u6C47\u62A5"] },
      sanse: { name: "\u4E09\u8272\u520A", note: "\u7C89\u5E95\u3001\u6817\u7EA2\u4E0E\u9E45\u9EC4\u5361\u7247\u4EA4\u66FF", fits: ["\u79D1\u5B66", "\u5206\u7C7B"] },
      lindi: { name: "\u6797\u5730", note: "\u6696\u7EB8\u886C\u7EBF\u5927\u6807\u9898\uFF0C\u53F3\u534A\u5F20\u56FE\u4F4D", fits: ["\u8BED\u6587", "\u9605\u8BFB"] },
      changyan: { name: "\u957F\u684C\u5BB4", note: "\u4E09\u5F20\u5E26\u6846\u5361\u7247\u4E00\u6E9C\u6446\u5F00\uFF0C\u6BCF\u5F20\u81EA\u5E26\u4E0A\u4E0B\u4E24\u6761\u7EBF", fits: ["\u8BED\u6587", "\u9053\u6CD5"] },
      danse: { name: "\u5355\u8272\u520A", note: "\u53EA\u6709\u9ED1\u767D\u4E0E\u53D1\u4E1D\u7EBF\uFF0C\u9760\u5B57\u53F7\u5206\u5C42", fits: ["\u5199\u4F5C", "\u901A\u7528"] },
      gangyin: { name: "\u94A2\u5370", note: "\u94DC\u9752\u89D2\u5757 + \u5370\u767D\u5927\u6807\u9898\uFF0C\u5E95\u4E0B\u4E00\u9053\u94A2\u5370\u7EBF", fits: ["\u79D1\u5B66", "\u5C55\u793A"] }
    };
    FAMILY_IDS = [
      "suke",
      "xuan",
      "liti",
      "jijian",
      "shuye",
      "tigang",
      "lanxian",
      "liu",
      "chang",
      "man",
      "ka",
      "shuangnian",
      "gulan",
      "shangwu",
      "sanse",
      "lindi",
      "changyan",
      "danse",
      "gangyin"
    ];
    FAMILY_REPS = {
      suke: "suke",
      xuan: "xuan",
      liti: "liti",
      jijian: "jijian",
      shuye: "shuye",
      tigang: "tigang",
      lanxian: "lanxian",
      liu: "liu",
      chang: "chang",
      man: "man",
      ka: "ka",
      shuangnian: "shuangnian",
      gulan: "gulan",
      shangwu: "shangwu",
      sanse: "sanse",
      lindi: "lindi",
      changyan: "changyan",
      danse: "danse",
      gangyin: "gangyin"
    };
    TEMPLATE_ORDER = TEMPLATE_IDS.map((id) => TEMPLATES[id]);
    FONT_FACE = {
      song: "\u5B8B\u4F53",
      kai: "\u6977\u4F53",
      hei: "\u82F9\u65B9-\u7B80"
    };
    FONT_STACK = {
      song: '"Songti SC", "SimSun", "Noto Serif SC", serif',
      kai: '"Kaiti SC", "KaiTi", "STKaiti", serif',
      hei: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    };
    CLASSIC = /古诗|文言|古文|诗词|宋词|唐诗|诗经|论语|孟子|庄子|楚辞|乐府|绝句|律诗|小古文|文赋/;
    CHINESE = /语文|汉语|国学|阅读|习作/;
    MATH = /数学|算术/;
    SCIENCE = /物理|化学|科学|生物/;
    ENGLISH = /英语|英文|外语/;
    HUMAN = /历史|地理|道法|道德|政治|社会/;
    HUE_CLASH = [150, 210];
    TEMPLATE_LIMITS = {
      inkContrastMin: 7,
      accentContrastMin: 4.5
    };
    SOURCE_TEMPLATES = [
      "shuangnian",
      "gulan",
      "shangwu",
      "sanse",
      "lindi",
      "changyan",
      "danse",
      "gangyin"
    ];
  }
});

// src/lib/deck2/capacity.ts
var PX;
var init_capacity = __esm({
  "src/lib/deck2/capacity.ts"() {
    "use strict";
    init_place();
    init_theme2();
    init_density();
    PX = 4 / 3;
  }
});

// src/lib/voice.ts
function getVoiceProfile(kind) {
  const hit = VOICE_PROFILES.find((p) => p.kind === kind);
  if (!hit) throw new Error(`\u6CA1\u6709\u8FD9\u5957\u8BED\u6C14\u6863\u6848\uFF1A${kind}`);
  return hit;
}
function voicePromptBlock(kind) {
  const p = getVoiceProfile(kind);
  const patterns = FORBIDDEN_PATTERNS.map((x) => `
- ${x.label}\uFF1A${x.note}`).join("");
  const words = BANNED_WORDS.map((x) => `
- ${x.word}\uFF1A${x.note}`).join("");
  const examples = p.examples.map((e) => `
\u274C ${e.bad}
\u2705 ${e.good}`).join("\n");
  return [
    `\u3010\u8BED\u6C14 \xB7 ${p.name}\u3011${p.audience}\u3002`,
    ...p.rules.map((r, i) => `${i + 1}. ${r}`),
    `\u4E3B\u8BED\u89C4\u5219\uFF1A${p.subjectRules.join(" ")}`,
    `\u5355\u53E5\u4E0D\u8D85\u8FC7 ${p.maxSentenceChars} \u5B57\u3002`,
    `\u6B63\u53CD\u4F8B\uFF08\u4F1A\u88AB\u7528 / \u4F1A\u88AB\u9000\u56DE\uFF09\uFF1A${examples}`,
    `\u8FD9\u4E9B\u53E5\u5F0F\u5728\u4EA7\u7269\u6587\u672C\u91CC\u547D\u4E2D\u6570\u5FC5\u987B\u4E3A 0\uFF1A${patterns}${words}`,
    "\u4E0A\u5C4F\u77ED\u53E5\uFF08\u5927\u6807\u9898 / \u4E00\u884C\u5B57 / \u6761\u76EE\uFF09\u518D\u5B88\u4E09\u6761\uFF1A\u4E0D\u5199\u56DB\u5B57\u5BF9\u5076\uFF08\u300C\u91CD\u70B9\u8BB2\u900F\uFF0C\u96BE\u70B9\u7ED5\u5F00\u300D\uFF09\uFF0C\u4E0D\u5199\u300C\u901A\u8FC7 A\u3001B\u3001C\u300D\u5F0F\u7684\u4E09\u8FDE\uFF0C\u4E0D\u5199\u300C\u51FA\u793A X\u3001\u64AD\u653E Y\u3001\u63D0\u95EE Z\u300D\u7684\u52A8\u4F5C\u6D41\u6C34\u8D26\u3002",
    "\u8F93\u51FA\u524D\u81EA\u68C0\uFF1A\u628A\u5168\u90E8\u6587\u5B57\u4ECE\u5934\u8BFB\u4E00\u904D\uFF0C\u4E0A\u9762\u8FD9\u4E9B\u53E5\u5F0F\u4E0E\u7981\u8BCD\u7684\u547D\u4E2D\u6570\u5FC5\u987B\u4E3A 0\uFF1B\u547D\u4E2D\u5C31\u6539\u5199\u8FD9\u4E00\u53E5\u518D\u8F93\u51FA\uFF0C\u4E0D\u8981\u4EA4\u51FA\u6765\u7B49\u9000\u56DE\u3002"
  ].join("\n");
}
var FORBIDDEN_PATTERNS, BANNED_WORDS, BANNED_WORD_TEXTS, SHUOKE, CLASSROOM, DEFENSE, VOICE_PROFILES;
var init_voice = __esm({
  "src/lib/voice.ts"() {
    "use strict";
    FORBIDDEN_PATTERNS = [
      {
        id: "bu-ershi",
        label: "\u4E0D\u662F\u2026\u2026\u800C\u662F\u2026\u2026",
        // 「不 / 非 / 没」起头，中间最多 18 个不带句末标点与逗号的字，再一个可选逗号，落在「而是」。
        // 前缀 (?:^|[^而]) + 中间段至少 1 字，是为了放掉倒装的「……，而不是……」——
        // §D.2 第 1 类只列正装式，倒装那句（「符号是关系的简写，而不是三个孤立的图案」）是人话，不判。
        // 中间段不禁换行与省略号，所以「不是…\n而是」「不是……而是」都能抓住；但逗号只能有一个且必须紧贴而是。
        re: /(?:^|[^而])(?:不|非|没)[^。！？，,；;、]{1,18}[，,、]?[\s]*而是/g,
        note: "\u5148\u5426\u5B9A\u4E00\u4E2A\u8BF4\u6CD5\u518D\u6446\u51FA\u81EA\u5DF1\u7684\u8BF4\u6CD5\uFF0C\u662F\u8BF4\u8BFE\u7A3F\u91CC\u6700\u5E38\u89C1\u7684\u6392\u573A\u8BDD\uFF1B\u628A\u88AB\u5426\u5B9A\u7684\u90A3\u4E2A\u5220\u6389\uFF0C\u76F4\u63A5\u8BF4\u8981\u505A\u4EC0\u4E48\u3002"
      },
      {
        id: "ningke-ye",
        label: "\u5B81\u53EF\u2026\u2026\u4E5F\u2026\u2026",
        // 让步复句：宁可 + ≤24 字（可含逗号与换行，不跨句末标点）+ 也 / 都要 / 得。
        re: /宁可[^。！？]{1,24}?(?:也|都要|得)/g,
        note: "\u6559\u7814\u8154\u7684\u53D6\u820D\u53E5\u5F0F\uFF0C\u8BFE\u5802\u4E0A\u6CA1\u4EBA\u8FD9\u4E48\u8BF4\u8BDD\uFF1B\u6362\u6210\u300C\u6211\u5B81\u613F X\uFF0C\u6240\u4EE5 Y\u300D\u6216\u8005\u76F4\u63A5\u8BF4 Y\u3002"
      },
      {
        id: "yuqi-buru",
        label: "\u4E0E\u5176\u2026\u2026\u4E0D\u5982\u2026\u2026",
        // 「与其 / 与其说」+ ≤24 字 + 「不如 / 还不如」；「与其说」也一并抓掉，防止改稿时换成它。
        re: /与其(?:还)?说?[^。！？]{1,24}?(?:也)?不如/g,
        note: "\u4E66\u9762\u6BD4\u8F83\u53E5\u5F0F\uFF0C\u8DDF\u300C\u4E0D\u662F\u2026\u2026\u800C\u662F\u2026\u2026\u300D\u662F\u540C\u4E00\u5F20\u8138\u4E0A\u7684\u4E24\u79CD\u5986\uFF1B\u76F4\u63A5\u7ED9\u8981\u9009\u7684\u90A3\u4E2A\u3002"
      },
      {
        id: "paibi-3",
        label: "\u4E09\u53E5\u4EE5\u4E0A\u6392\u6BD4\uFF08\u65E2\u2026\u2026\u53C8\u2026\u2026\u66F4\u2026\u2026\uFF09",
        // 三联关联词：既 + 一段 + 又/也 + 一段 + 更/还 + 一段。两个槽之间各限 ≤20 字，
        // 且都不许跨过句末标点，保证抓的是「一句话里连排三层」而不是隔了两句的巧合。
        // 「不仅…而且…更…」是同一毛病的另外两种壳，合并在这条里。
        re: /(?:既[^。！？]{1,20}?[又也][^。！？]{1,20}?(?:更|还))|(?:不仅|不但)[^。！？]{1,20}?(?:而且|同时)[^。！？]{1,20}?(?:更|还)/g,
        note: "\u4E09\u4E2A\u5173\u8054\u8BCD\u4E32\u8D77\u6765\u7684\u9012\u8FDB\u6392\u6BD4\uFF0C\u5FF5\u8D77\u6765\u50CF\u6C47\u62A5\u6750\u6599\uFF1B\u7559\u4E00\u4E2A\u6700\u91CD\u7684\u8BF4\u6E05\u695A\u5C31\u884C\u3002"
      }
    ];
    BANNED_WORDS = [
      {
        word: "\u672C\u73AF\u8282\u65E8\u5728",
        re: /本环节旨在/g,
        note: "\u6863\u6848\u8154\u5F00\u5934\uFF0C\u300C\u65E8\u5728\u300D\u4E24\u4E2A\u5B57\u6700\u4E0D\u50CF\u4EBA\u8BDD\u3002"
      },
      {
        word: "\u901A\u8FC7\u2026\u2026\u4F7F\u5B66\u751F",
        re: /通过(?:[^。！？]{1,24}?)(?:使|让)学生/g,
        note: "\u628A\u624B\u6BB5\u548C\u5B66\u751F\u6346\u6210\u4E00\u53E5\u6D41\u7A0B\u8BF4\u660E\uFF1B\u4E3B\u8BED\u6362\u6210\u300C\u6211\u300D\uFF0C\u8BF4\u6E05\u6211\u505A\u4E86\u4EC0\u4E48\u3001\u5B66\u751F\u505A\u4EC0\u4E48\u3002"
      },
      {
        word: "\u5145\u5206\u4F53\u73B0\u4E86",
        re: /充?分体现(?:了|出)/g,
        note: "\u81EA\u6211\u8BC4\u4EF7\u5F0F\u7ED3\u8BBA\uFF0C\u8BC4\u59D4\u770B\u7684\u662F\u4F60\u505A\u4E86\u4EC0\u4E48\uFF0C\u4E0D\u662F\u4F60\u7ED9\u81EA\u5DF1\u6253\u7684\u52FE\u3002"
      },
      {
        word: "\u6709\u6548\u63D0\u5347",
        // 这一桶管的是「提升 + 素养 / 能力 / 水平」这类无法检验的效果承诺，不只抓「有效提升」四字；
        // 修饰语可缺（切实提升、明显提升、直接一句「提升学生能力」都是同一个毛病）。
        re: /(?:有效|切实|明显|大幅)?提升(?:了)?(?:学生|儿童)?(?:的)?[^。！？]{0,6}?(?:核心素养|素养|能力|水平|成绩|效率)/g,
        note: "\u65E0\u6CD5\u68C0\u9A8C\u7684\u6548\u679C\u627F\u8BFA\uFF0C\u5220\u6389\u6362\u6210\u5177\u4F53\u90A3\u4E00\u9875\u53D1\u751F\u4E86\u4EC0\u4E48\u3002"
      },
      {
        word: "\u6838\u5FC3\u7D20\u517B",
        re: /核心素养/g,
        note: "\u53E3\u53F7\u7EA7\u540D\u8BCD\uFF0C\u5199\u8FDB\u7A3F\u5B50\u7B49\u4E8E\u4EC0\u4E48\u90FD\u6CA1\u5199\u3002"
      },
      /* TASKS 10 §十三 第 12 件：三维目标那套格子，连同它的三个格名一起禁 */
      {
        word: "\u77E5\u8BC6\u4E0E\u80FD\u529B",
        re: /知识(?:与|和)能力/g,
        note: "\u4E09\u7EF4\u76EE\u6807\u7684\u65E7\u58F3\u5B50\u3002\u76F4\u63A5\u8BF4\u8FD9\u4E00\u8BFE\u5B66\u751F\u8981\u5B66\u4F1A\u505A\u4EC0\u4E48\u3002"
      },
      {
        word: "\u8FC7\u7A0B\u4E0E\u65B9\u6CD5",
        re: /过程(?:与|和)方法/g,
        note: "\u600E\u4E48\u5B66\u662F\u548C\u5185\u5BB9\u957F\u5728\u4E00\u8D77\u7684\uFF0C\u53E6\u8D77\u4E00\u683C\u5C31\u53EA\u5269\u7A7A\u8BDD\u3002"
      },
      {
        word: "\u60C5\u611F\u6001\u5EA6\u4E0E\u4EF7\u503C\u89C2",
        re: /情感态度(?:与|和)价值观/g,
        note: "\u8981\u8C08\u611F\u60C5\uFF0C\u5C31\u8BF4\u8BFE\u6587\u91CC\u54EA\u4E00\u53E5\u8BA9\u4EBA\u5FC3\u91CC\u4E00\u52A8\u3002"
      },
      {
        word: "\u4E09\u7EF4\u76EE\u6807",
        re: /三维目标/g,
        note: "\u4E09\u4E2A\u683C\u5B50\u586B\u6EE1\uFF0C\u4E0D\u7B49\u4E8E\u628A\u8BFE\u8BF4\u6E05\u695A\u3002"
      }
    ];
    BANNED_WORD_TEXTS = BANNED_WORDS.map((b) => b.word);
    SHUOKE = {
      kind: "shuoke",
      name: "\u8BF4\u8BFE",
      audience: "\u8BB2\u7ED9\u8BC4\u59D4\u542C\uFF1A\u5750\u5728\u5BF9\u9762\u7684\u662F\u6253\u5206\u7684\u4EBA\uFF0C\u4E0D\u662F\u5B66\u751F",
      rules: [
        "\u7B2C\u4E00\u4EBA\u79F0\u627F\u62C5\uFF1A\u5199\u300C\u6211\u8FD9\u6837\u8BBE\u8BA1\u300D\u300C\u6211\u628A\u8FD9\u4E00\u9875\u653E\u6162\u300D\uFF0C\u4E0D\u5199\u300C\u672C\u8BBE\u8BA1\u65E8\u5728\u300D\u3002",
        "\u6BCF\u4E2A\u8BBE\u8BA1\u70B9\u540E\u9762\u5FC5\u987B\u8DDF\u4E00\u53E5\u300C\u56E0\u4E3A\u300D\u6216\u300C\u8003\u8651\u5230\u300D\uFF0C\u8BF4\u6E05\u4F60\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u505A\u3002",
        "\u5C11\u5F62\u5BB9\u8BCD\u3002\u60F3\u8BF4\u300C\u751F\u52A8\u5F62\u8C61\u300D\uFF0C\u5C31\u6362\u6210\u4F60\u5177\u4F53\u505A\u4E86\u4EC0\u4E48\u52A8\u4F5C\u3001\u5B66\u751F\u505A\u4E86\u4EC0\u4E48\u52A8\u4F5C\u3002",
        "\u4E0D\u5199\u300C\u73AF\u73AF\u76F8\u6263\u300D\u300C\u5C42\u5C42\u9012\u8FDB\u300D\u300C\u5145\u5206\u8C03\u52A8\u300D\u8FD9\u7C7B\u81EA\u6211\u8BC4\u4EF7\uFF1B\u53EA\u5199\u8FD9\u4E00\u9875\u771F\u6B63\u53D1\u751F\u4E86\u4EC0\u4E48\u4E8B\u3002",
        "\u4E00\u53E5\u8BDD\u53EA\u8BB2\u4E00\u4E2A\u8BBE\u8BA1\u70B9\uFF0C\u8BB2\u5B8C\u5C31\u6362\u884C\uFF0C\u4E0D\u8981\u628A\u4E09\u4E2A\u7406\u7531\u645E\u5728\u540C\u4E00\u53E5\u91CC\u3002"
      ],
      examples: [
        {
          bad: "\u672C\u73AF\u8282\u65E8\u5728\u901A\u8FC7\u53CD\u590D\u6717\u8BFB\uFF0C\u4F7F\u5B66\u751F\u4F53\u4F1A\u4F5C\u8005\u5BF9\u6545\u4E61\u7684\u601D\u5FF5\u4E4B\u60C5\u3002",
          good: "\u8FD9\u4E00\u6BB5\u6211\u8BA9\u5B66\u751F\u8BFB\u4E09\u904D\u3002\u7B2C\u4E00\u904D\u8BFB\u987A\uFF0C\u7B2C\u4E8C\u904D\u8BFB\u5230\u81EA\u5DF1\u5FC3\u91CC\u53D1\u9178\uFF0C\u7B2C\u4E09\u904D\u624D\u95EE\u4ED6\u4EEC\u60F3\u8D77\u4E86\u4EC0\u4E48\u3002"
        }
      ],
      forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
      bannedWords: BANNED_WORD_TEXTS.slice(),
      subjectRules: [
        "\u627F\u8BFA\u843D\u5728\u81EA\u5DF1\u8EAB\u4E0A\uFF1A\u591A\u7528\u300C\u6211\u6765\u300D\u300C\u6211\u8FD9\u6837\u505A\u300D\u300C\u6211\u5148\u8BF4\u6E05\u695A\u300D\u3002",
        "\u5C11\u7528\u300C\u8BF7\u4F60\u8BF4\u300D\u300C\u8BA9\u6211\u4EEC\u300D\u300C\u5927\u5BB6\u53EF\u4EE5\u300D\u2014\u2014\u8BC4\u59D4\u4E0D\u662F\u4F60\u7684\u5B66\u751F\uFF0C\u4E0D\u8981\u6307\u6325\u4ED6\u3002"
      ],
      // 与既有 SYSTEM_PROMPT 第 5 条同口径（每句 ≤120 字），这里不另立一条更紧的数，
      // 免得 D 块顺手把 A/B 块之外的生成口径改了。
      maxSentenceChars: 120,
      slots: ["speech\uFF08\u8BF4\u8BFE\u7A3F\u516D\u6BB5\uFF09", "segments[].script\uFF08\u73AF\u8282\u53E3\u64AD\u7A3F\uFF09", "objectives / keyPoint / hardPoint"]
    };
    CLASSROOM = {
      kind: "classroom",
      name: "\u8BFE\u5802",
      audience: "\u8BB2\u7ED9\u5B66\u751F\u62AC\u5934\u542C\uFF1A\u4E00\u9875\u4E00\u53E5\u8BDD\uFF0C\u5FF5\u51FA\u6765\u5C31\u662F\u8BFE\u5802\u73B0\u573A",
      rules: [
        "\u53E5\u5B50\u77ED\uFF0C\u4E00\u53E5\u53EA\u8BF4\u4E00\u4E2A\u610F\u601D\uFF1B\u80FD\u8BF4\u4E03\u4E2A\u5B57\u8BF4\u5B8C\u7684\u4E0D\u8981\u7528\u4E8C\u5341\u4E2A\u5B57\u3002",
        "\u6BCF\u9875\u5907\u6CE8\u81F3\u5C11\u5E26\u4E00\u4E2A\u95EE\u53E5\uFF0C\u95EE\u53E5\u540E\u9762\u6807\u505C\u987F\uFF1A\uFF08\u505C\u4E09\u79D2\uFF09\u3002\u4E0D\u7B49\u5B66\u751F\u7B54\u5B8C\u4E0D\u8BB8\u5F80\u4E0B\u5FF5\u3002",
        "\u4E0D\u7528\u300C\u56E0\u6B64\u300D\u300C\u7EFC\u4E0A\u6240\u8FF0\u300D\u300C\u7531\u6B64\u53EF\u89C1\u300D\u300C\u603B\u800C\u8A00\u4E4B\u300D\u8FD9\u7C7B\u4E66\u9762\u8FDE\u63A5\u8BCD\uFF0C\u76F4\u63A5\u8BF4\u4E0B\u4E00\u53E5\u3002",
        "\u4E0D\u53EB\u300C\u6559\u5B66\u76EE\u6807\u300D\u300C\u73AF\u8282\u300D\u300C\u65F6\u957F\u300D\u8FD9\u4E9B\u6559\u7814\u540D\u8BCD\uFF1B\u5634\u4E0A\u8BF4\u7684\u662F\u300C\u8FD9\u4E00\u6BB5\u300D\u300C\u8FD9\u90E8\u5206\u300D\u3002",
        "\u7B54\u6848\u4E0D\u8FDB\u9875\u9762\u6587\u5B57\uFF0C\u53EA\u8FDB\u5907\u6CE8\uFF1B\u9875\u9762\u4E0A\u7559\u7ED9\u5B66\u751F\u7684\u53EA\u6709\u95EE\u53E5\u548C\u753B\u9762\u3002"
      ],
      examples: [
        {
          bad: "\u7531\u6B64\u53EF\u89C1\uFF0C\u4F5C\u8005\u6B63\u662F\u501F\u6842\u82B1\u8FD9\u4E00\u8F7D\u4F53\uFF0C\u5145\u5206\u4F53\u73B0\u51FA\u5BF9\u6545\u4E61\u6DF1\u5207\u7684\u601D\u5FF5\u4E4B\u60C5\u3002",
          good: "\u6842\u82B1\u4E3A\u4EC0\u4E48\u8001\u5FD8\u4E0D\u6389\uFF1F\uFF08\u505C\u4E09\u79D2\uFF09\u56E0\u4E3A\u5B83\u8FDE\u7740\u9662\u5B50\u91CC\u7684\u90A3\u4E2A\u4EBA\u3002"
        }
      ],
      forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
      bannedWords: BANNED_WORD_TEXTS.slice(),
      subjectRules: [
        "\u5C11\u7528\u300C\u8BF7\u4F60\u8BF4\u300D\u300C\u8BA9\u6211\u4EEC\u300D\u300C\u5927\u5BB6\u53EF\u4EE5\u300D\uFF0C\u591A\u7528\u300C\u6211\u6765\u300D\u300C\u6211\u8FD9\u6837\u505A\u300D\u3002",
        "\u8981\u5B66\u751F\u505A\u4E8B\u65F6\uFF0C\u5148\u8BF4\u6E05\u6211\u8981\u505A\u4EC0\u4E48\uFF0C\u518D\u8BF4\u4ED6\u505A\u4EC0\u4E48\u3002"
      ],
      maxSentenceChars: 30,
      slots: ["slides[].notes\uFF08\u5B66\u751F\u7248\u6BCF\u9875\u5907\u6CE8\uFF09", "slides[].title / line / items\uFF08\u9875\u9762\u53EF\u89C1\u6587\u5B57\uFF09"]
    };
    DEFENSE = {
      kind: "defense",
      name: "\u7B54\u8FA9",
      audience: "\u4E34\u573A\u7B54\uFF1A\u8BC4\u59D4\u8FFD\u95EE\uFF0C\u4E09\u5341\u79D2\u5185\u5FC5\u987B\u6536\u53E3",
      rules: [
        "\u5148\u7ED9\u5224\u65AD\uFF0C\u518D\u7ED9\u7406\u7531\uFF1A\u7B2C\u4E00\u53E5\u5C31\u662F\u7B54\u6848\uFF0C\u4E0D\u8981\u94FA\u57AB\u3002",
        "\u603B\u5171 60 \u5B57\u4EE5\u5185\uFF0C\u8BF4\u5B8C\u5C31\u505C\uFF0C\u4E0D\u8981\u8865\u7B2C\u4E09\u5C42\u7406\u7531\u3002",
        "\u5F00\u5934\u4E0D\u8BB8\u300C\u8FD9\u4E2A\u95EE\u9898\u53EF\u4EE5\u4ECE\u4E09\u4E2A\u65B9\u9762\u6765\u770B\u300D\uFF1B\u4E5F\u4E0D\u8BB8\u300C\u8C22\u8C22\u8BC4\u59D4\u8001\u5E08\u7684\u63D0\u95EE\u300D\u3002",
        "\u7406\u7531\u8981\u843D\u5230\u8FD9\u8282\u8BFE\u7684\u5177\u4F53\u52A8\u4F5C\u4E0A\uFF1A\u54EA\u4E00\u9875\u3001\u54EA\u4E2A\u63D0\u95EE\u3001\u5B66\u751F\u505A\u4E86\u4EC0\u4E48\u3002"
      ],
      examples: [
        {
          bad: "\u8FD9\u4E2A\u95EE\u9898\u53EF\u4EE5\u4ECE\u4E09\u4E2A\u65B9\u9762\u6765\u770B\u3002\u9996\u5148\uFF0C\u4ECE\u8BFE\u7A0B\u6807\u51C6\u7684\u8981\u6C42\u6765\u8BF4\u2026\u2026\u5176\u6B21\uFF0C\u4ECE\u5B66\u60C5\u89D2\u5EA6\u800C\u8A00\u2026\u2026\u6700\u540E\uFF0C\u4ECE\u8BC4\u4EF7\u8BBE\u8BA1\u4E0A\u770B\u2026\u2026",
          good: "\u6211\u628A\u5B83\u653E\u5728\u6700\u540E\u3002\u5B66\u751F\u5148\u8981\u4F1A\u6570\u68F1\uFF0C\u624D\u77E5\u9053\u300C\u957F\u5BBD\u9AD8\u300D\u662F\u4ECE\u68F1\u91CC\u62BD\u51FA\u6765\u7684\u2014\u2014\u987A\u5E8F\u53CD\u4E86\uFF0C\u6982\u5FF5\u5C31\u662F\u80CC\u7684\u3002"
        }
      ],
      forbiddenPatterns: FORBIDDEN_PATTERNS.map((p) => p.id),
      bannedWords: BANNED_WORD_TEXTS.slice(),
      subjectRules: ["\u7B54\u7684\u662F\u81EA\u5DF1\u7684\u8BBE\u8BA1\uFF0C\u4E3B\u8BED\u4E00\u5F8B\u662F\u300C\u6211\u300D\uFF1B\u4E0D\u8981\u628A\u8BDD\u63A8\u7ED9\u300C\u6211\u4EEC\u6559\u7814\u7EC4\u300D\u300C\u65B0\u8BFE\u6807\u300D\u3002"],
      // §D.1「总共 60 字以内」落在单句上；整条 answer 仍守既有 ≤80 字口径（Result.tsx 的 QA_LIMIT），
      // 那一条不归 D 块改。
      maxSentenceChars: 60,
      slots: ["defense[].question / defense[].answer\uFF08\u7B54\u8FA9\u9884\u6848 7 \u6761\uFF09"]
    };
    VOICE_PROFILES = [SHUOKE, CLASSROOM, DEFENSE];
  }
});

// src/lib/prompt.ts
var VOICE_SHUOKE, VOICE_DEFENSE, VOICE_CLASSROOM, SYSTEM_PROMPT;
var init_prompt = __esm({
  "src/lib/prompt.ts"() {
    "use strict";
    init_deck();
    init_density();
    init_scale();
    init_capacity();
    init_voice();
    init_texts();
    VOICE_SHUOKE = voicePromptBlock("shuoke");
    VOICE_DEFENSE = voicePromptBlock("defense");
    VOICE_CLASSROOM = voicePromptBlock("classroom");
    SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u6709 20 \u5E74\u7ECF\u9A8C\u7684\u5E08\u8303\u751F\u6559\u5B66\u6280\u80FD\u5927\u8D5B\u8BC4\u59D4\uFF0C\u540C\u65F6\u7CBE\u901A\u4E2D\u5C0F\u5B66\u5404\u5B66\u79D1\u6559\u5B66\u8BBE\u8BA1\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\u6839\u636E\u8BFE\u9898\uFF0C\u4EA7\u51FA\u4E00\u4EFD\u53EF\u4EE5\u76F4\u63A5\u62FF\u5230\u8BFE\u5802\u4E0A\u7528\u7684\u5B8C\u6574\u5907\u8BFE\u5305\u3002

\u8981\u6C42\uFF1A
1. \u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u5757\u3002
2. \u6240\u6709\u6587\u672C\u7528\u4E2D\u6587\uFF0C\u53E3\u543B\u662F\u771F\u5B9E\u7684\u6559\u5B66\u8BED\u8A00\uFF0C\u4E0D\u8981\u7A7A\u8BDD\u5957\u8BDD\u3002
3. \u6559\u5B66\u76EE\u6807\u3001\u91CD\u96BE\u70B9\u5FC5\u987B\u5177\u4F53\u5230\u8FD9\u7BC7\u8BFE\u6587\u6216\u8FD9\u4E2A\u77E5\u8BC6\u70B9\uFF0C\u7981\u6B62\u5199\u201C\u7406\u89E3\u8BFE\u6587\u201D\u201C\u638C\u63E1\u77E5\u8BC6\u201D\u8FD9\u7C7B\u653E\u5230\u54EA\u8282\u8BFE\u90FD\u6210\u7ACB\u7684\u7A7A\u8BDD\u3002
4. \u201C\u7B54\u8FA9\u9884\u6848\u201D\u7ED9 7 \u6761\uFF0C\u95EE\u9898\u5FC5\u987B\u662F\u771F\u5B9E\u8BD5\u8BB2\u73B0\u573A\u8BC4\u59D4\u7684\u8FFD\u95EE\uFF0C\u6BCF\u6761 answer \u4E0D\u8D85\u8FC7 80 \u4E2A\u6C49\u5B57\uFF0C\u80CC\u4E0B\u6765\u5C31\u80FD\u7B54\u3002
5. \u201C\u53E3\u64AD\u7A3F\u201D\u5FC5\u987B\u662F\u7AD9\u5728\u8BB2\u53F0\u4E0A\u80FD\u76F4\u63A5\u8BF4\u51FA\u53E3\u7684\u8BDD\uFF0C\u53E3\u8BED\u5316\uFF0C\u6BCF\u53E5\u4E0D\u8D85\u8FC7 120 \u5B57\u3002
6. \u5404\u73AF\u8282 ratio \u76F8\u52A0\u5FC5\u987B\u7B49\u4E8E 1\u3002
7. \u677F\u4E66\u5E03\u5C40\u7528\u7B49\u5BBD\u5B57\u7B26\u753B\uFF0C\u5BBD\u5EA6\u4E0D\u8D85\u8FC7 40 \u4E2A\u5B57\u7B26\uFF0C\u65B9\u4FBF\u624B\u673A\u67E5\u770B\u548C\u6284\u5199\u3002
8. \u6BCF\u4E2A\u73AF\u8282\u7684 pauses \u7ED9 0\u20132 \u4E2A\u505C\u987F\u70B9\uFF0C\u95EE\u53E5\u5FC5\u987B\u4E00\u53E5\u8BDD\u8BF4\u5B8C\u3001\u4E0D\u8D85\u8FC7 20 \u4E2A\u6C49\u5B57\uFF0Ctype \u53EA\u80FD\u662F\u201C\u786E\u8BA4\u7406\u89E3 / \u5F15\u53D1\u601D\u8003 / \u8FC7\u6E21\u201D\u3002
9. \u6559\u5B66\u51C6\u5907\u53EA\u51FA\u6E05\u5355\u3001\u7528\u9014\u548C\u68C0\u7D22\u8BCD\uFF0C\u7981\u6B62\u7F16\u9020\u56FE\u7247\u3001\u97F3\u9891\u5185\u5BB9\uFF0C\u4E5F\u7981\u6B62\u66FF\u8001\u5E08\u201C\u751F\u6210\u201D\u7D20\u6750\u3002

${VOICE_SHUOKE}
\uFF08\u4E0A\u9762\u8FD9\u5957\u8BED\u6C14\u7BA1 speech \u516D\u6BB5\u4E0E\u6BCF\u4E2A\u73AF\u8282\u7684 script\u3002\uFF09

${VOICE_DEFENSE}
\uFF08\u4E0A\u9762\u8FD9\u5957\u8BED\u6C14\u53EA\u7BA1 defense \u6570\u7EC4\u7684 answer\u3002\uFF09`;
  }
});

// src/lib/llm.ts
var init_llm = __esm({
  "src/lib/llm.ts"() {
    "use strict";
    init_texts();
    init_illustrate();
    init_endpoint();
    init_prompt();
  }
});

// src/lib/deckStore.ts
var init_deckStore = __esm({
  "src/lib/deckStore.ts"() {
    "use strict";
    init_deck();
  }
});

// src/lib/inspect.ts
var init_inspect = __esm({
  "src/lib/inspect.ts"() {
    "use strict";
    init_watermark();
  }
});

// src/lib/director.ts
function emptyReport() {
  return {
    directOk: false,
    typesetOk: false,
    drawn: 0,
    planned: 0,
    asked: 0,
    textFailed: 0,
    sides: { left: 0, right: 0 },
    itemsChanged: 0,
    look: "",
    note: "",
    failures: []
  };
}
var lastReport;
var init_director = __esm({
  "src/lib/director.ts"() {
    "use strict";
    init_llm();
    init_illustrate();
    init_inspect();
    init_place();
    lastReport = emptyReport();
  }
});

// src/lib/subject.ts
var init_subject = __esm({
  "src/lib/subject.ts"() {
    "use strict";
  }
});

// src/lib/motifs.ts
function motifOfKey(v2) {
  const k = String(v2 ?? "");
  return k in MOTIFS2 ? MOTIFS2[k] : MOTIFS2.neutral;
}
var W, v, hbar, MOTIFS2;
var init_motifs = __esm({
  "src/lib/motifs.ts"() {
    "use strict";
    W = 18e-4;
    v = (x, y, h) => ({ x, y, w: W, h });
    hbar = (x, y, w) => ({ x, y, w, h: W });
    MOTIFS2 = {
      /* 语文：地平线 + 雨丝（沿用 20b 那一套，一个数都没改） */
      chinese: {
        key: "chinese",
        note: "\u96E8\u4E1D",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.585, 0.59, 0.13), v(0.625, 0.635, 0.085), v(0.665, 0.555, 0.165), v(0.705, 0.62, 0.1), v(0.745, 0.65, 0.07), v(0.785, 0.6, 0.12)]
      },
      /* 数学：一条横轴一条纵轴，一只方格 + 一道刻度 */
      math: {
        key: "math",
        note: "\u65B9\u683C\u4E0E\u5750\u6807",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.58, 0.5, 0.22), hbar(0.64, 0.56, 0.18), hbar(0.64, 0.7, 0.18), v(0.64, 0.56, 0.142), v(0.82, 0.56, 0.142), hbar(0.66, 0.635, 0.16)]
      },
      /* 英语：四线三格 + 两道竖边（写得下字母的那一栏） */
      english: {
        key: "english",
        note: "\u56DB\u7EBF\u4E09\u683C",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [hbar(0.56, 0.585, 0.34), hbar(0.56, 0.63, 0.34), hbar(0.56, 0.675, 0.34), v(0.58, 0.585, 0.135), v(0.88, 0.585, 0.135), v(0.66, 0.585, 0.135)]
      },
      /* 科学：横轴纵轴 + 三根高低不齐的柱（数据图） */
      science: {
        key: "science",
        note: "\u5750\u6807\u4E0E\u67F1",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.58, 0.5, 0.22), v(0.645, 0.64, 0.08), v(0.715, 0.59, 0.13), v(0.785, 0.54, 0.18), hbar(0.58, 0.5, 0.28)]
      },
      /* 史地：经纬网 + 三个地点 */
      humanities: {
        key: "humanities",
        note: "\u7ECF\u7EAC\u7F51",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [hbar(0.56, 0.56, 0.34), v(0.58, 0.56, 0.16), v(0.72, 0.56, 0.16), v(0.86, 0.56, 0.16), hbar(0.6, 0.625, 0.012), hbar(0.74, 0.6, 0.012)]
      },
      /* 认不出学科：一条地平线 + 五根排开的短笔，读成什么课都不出错 */
      neutral: {
        key: "neutral",
        note: "\u7B14\u8FF9",
        ground: hbar(0.56, 0.72, 0.34),
        strokes: [v(0.6, 0.62, 0.1), v(0.665, 0.585, 0.135), v(0.73, 0.64, 0.08), v(0.795, 0.6, 0.12), v(0.86, 0.65, 0.07)]
      }
    };
  }
});

// src/data/guihua.ts
var init_guihua = __esm({
  "src/data/guihua.ts"() {
    "use strict";
  }
});

// src/data/bidaxiao.ts
var init_bidaxiao = __esm({
  "src/data/bidaxiao.ts"() {
    "use strict";
  }
});

// src/data/changfangti.ts
var init_changfangti = __esm({
  "src/data/changfangti.ts"() {
    "use strict";
  }
});

// src/data/changzheng.ts
var init_changzheng = __esm({
  "src/data/changzheng.ts"() {
    "use strict";
  }
});

// src/data/hetang.ts
var init_hetang = __esm({
  "src/data/hetang.ts"() {
    "use strict";
  }
});

// src/data/chun.ts
var init_chun = __esm({
  "src/data/chun.ts"() {
    "use strict";
  }
});

// src/data/beiying.ts
var init_beiying = __esm({
  "src/data/beiying.ts"() {
    "use strict";
  }
});

// src/data/fenshu.ts
var init_fenshu = __esm({
  "src/data/fenshu.ts"() {
    "use strict";
  }
});

// src/data/yuanmianji.ts
var init_yuanmianji = __esm({
  "src/data/yuanmianji.ts"() {
    "use strict";
  }
});

// src/lib/slides.ts
var SLIDE_LABELS, SLIDE_LIMITS, TOPIC_STOP, WEAK_CHARS;
var init_slides = __esm({
  "src/lib/slides.ts"() {
    "use strict";
    init_llm();
    init_prompt();
    init_voice();
    init_density();
    init_scale();
    init_scene();
    init_deck();
    init_texts();
    init_deckStore();
    init_illustrate();
    init_director();
    init_subject();
    init_motifs();
    init_guihua();
    init_bidaxiao();
    init_changfangti();
    init_changzheng();
    init_hetang();
    init_chun();
    init_beiying();
    init_fenshu();
    init_yuanmianji();
    SLIDE_LABELS = {
      cover: "\u8BFE\u9898",
      hook: "\u5148\u770B\u4E00\u773C",
      goals: "\u4E09\u4EF6\u4E8B",
      words: "\u5B57\u8BCD\u5173",
      "close-read": "\u8BFB\u8FD9\u4E00\u53E5",
      quote: "\u539F\u6587",
      compare: "\u6BD4\u4E00\u6BD4",
      board: "\u770B\u9ED1\u677F",
      drill: "\u7EC3\u4E00\u7EC3",
      homework: "\u8BFE\u540E",
      end: "\u4E00\u53E5\u8BDD"
    };
    SLIDE_LIMITS = {
      bodyChars: DEFAULT_LIMITS.bodyChars,
      pagesMin: PAGE_RANGE.min,
      pagesMax: PAGE_RANGE.max
    };
    TOPIC_STOP = new Set(
      "\u7684\u4E86\u7740\u5730\u5F97\u662F\u5728\u548C\u4E0E\u6216\u5C31\u800C\u628A\u88AB\u8BA9\u4ECE\u5411\u5BF9\u4E3A\u4EE5\u53CA\u4E8E\u4E2A\u8FD9\u90A3\u4F60\u6211\u4ED6\u5979\u5B83\u5B83\u4EEC\u8C01\u4EC0\u4E48\u51E0\u591A\u5C11\u4E0D\u4E00\u6CA1\u5F88\u90FD\u4E5F\u8FD8\u53C8\u624D\u53EA\u8BF7\u6211\u4EEC\u5927\u5BB6\u60A8\u5417\u5462\u5427\u554A\u5440\u54E6\u55EF\u7ED9\u5411\u5F80\u628A\u597D\u518D\u5148".split(
        ""
      )
    );
    WEAK_CHARS = new Set("\u6837\u540C\u5F02\u5DEE\u591A\u5C11\u597D\u5927\u5C0F\u592A\u66F4\u6700\u5BF9\u771F\u5047".split(""));
  }
});

// src/lib/deck2/place.ts
var place_exports = {};
__export(place_exports, {
  FOOT_SLOT: () => FOOT_SLOT,
  ITEM_CAP: () => ITEM_CAP,
  SIZES: () => SIZES,
  archetypeOf: () => archetypeOf,
  coverArchOf: () => coverArchOf,
  coverLayoutOf: () => coverLayoutOf,
  extentOf: () => extentOf,
  place: () => place,
  quotePointSize: () => quotePointSize
});
function archetypeOf(kind) {
  if (kind === "cover") return "cover";
  if (kind === "quote") return "quote";
  if (kind === "words") return "words";
  if (kind === "compare") return "compare";
  if (kind === "end") return "end";
  if (NUMBERED.includes(kind)) return "numbered";
  return "plain";
}
function clean(v2) {
  return String(v2 ?? "").replace(/\s+$/g, "").trim();
}
function lines(list) {
  return list.map(clean).filter(Boolean);
}
function extentOf(p) {
  const fs2 = (p.size ?? 18) * PX2;
  const lh = fs2 * (p.lineHeight ?? 1.5);
  const per = Math.max(1, Math.floor(p.w * PW / fs2));
  const list = String(p.text ?? "").split("\n");
  const rows = list.reduce((n2, l) => n2 + Math.max(1, Math.ceil(Array.from(l).length / per)), 0);
  const hpx = rows * lh;
  const longest = Math.min(per, Math.max(...list.map((l) => Array.from(l).length)));
  const wpx = Math.min(p.w * PW, longest * fs2);
  const x = p.align === "center" ? p.x * PW + (p.w * PW - wpx) / 2 : p.align === "right" ? p.x * PW + p.w * PW - wpx : p.x * PW;
  const y = p.valign === "middle" ? p.y * PH + (p.h * PH - hpx) / 2 : p.y * PH;
  return { x, y, w: wpx, h: hpx };
}
function guard(box, what) {
  const okBox = box.w > 0 && box.h > 0 && box.x >= -1e-9 && box.y >= -1e-9 && box.x + box.w <= 1.001 && box.y + box.h <= 1.001;
  if (!okBox) {
    throw new Error(`place(): ${what} \u7684\u6846\u6EA2\u51FA\u4E86\u7EB8\u9762\uFF08x=${box.x} y=${box.y} w=${box.w} h=${box.h}\uFF09`);
  }
}
function cText(ctx, box, value, style) {
  const text = clean(value);
  if (!text) return;
  guard(box, `\u6587\u672C\u300C${text.slice(0, 8)}\u300D`);
  ctx.out.push({
    kind: "text",
    ...box,
    text,
    size: style.size ?? SIZES.body,
    color: style.color,
    font: style.font,
    align: style.align ?? "left",
    valign: style.valign ?? "top",
    lineHeight: style.lineHeight ?? 1.5,
    bold: style.bold
  });
}
function cRect(ctx, box, fill, opacity, radius) {
  guard(box, "\u8272\u5757");
  ctx.out.push({ kind: "rect", ...box, fill, opacity, radius });
}
function cLine(ctx, box, fill, opacity) {
  guard(box, "\u7EC6\u7EBF");
  ctx.out.push({ kind: "line", ...box, fill, opacity });
}
function cEllipse(ctx, box, fill, opacity, rotate) {
  guard(box, "\u692D\u5706");
  ctx.out.push({ kind: "ellipse", ...box, fill, opacity, rotate });
}
function coverArt(ctx) {
  if (!ctx.art) return false;
  ctx.out.push({ kind: "image", x: 0, y: 0, w: 1, h: 1, data: ctx.art });
  return true;
}
function coverPt(n2, tiers = [96, 76, 52, 38]) {
  if (n2 <= 2) return tiers[0];
  if (n2 <= 4) return tiers[1];
  if (n2 <= 7) return tiers[2];
  return tiers[3];
}
function slantBand(ctx, top, bottom, x0, x1, fill, opacity) {
  const slices = 26;
  const dy = (bottom - top) / slices;
  for (let i = 0; i < slices; i += 1) {
    const y = top + i * dy;
    const left = x0 + (x1 - x0) * i / slices;
    cRect(ctx, { x: left, y, w: 1 - left, h: Math.min(dy + 1e-3, 1 - y) }, fill, opacity);
  }
}
function frameCard(ctx, box, heavy, light) {
  cLine(ctx, { x: box.x, y: box.y, w: box.w, h: 24e-4 }, heavy, 0.9);
  cLine(ctx, { x: box.x, y: box.y + box.h, w: box.w, h: 16e-4 }, heavy, 0.5);
  cLine(ctx, { x: box.x, y: box.y, w: 16e-4, h: box.h }, light, 1);
  cLine(ctx, { x: box.x + box.w, y: box.y, w: 16e-4, h: box.h }, light, 1);
}
function leafPair(ctx, x, y, size, fill, opacity = 1) {
  cEllipse(ctx, { x, y, w: size * 0.62, h: size }, fill, opacity);
  cEllipse(ctx, { x: x + size * 0.42, y: y + size * 0.18, w: size * 0.58, h: size * 0.84 }, fill, opacity * 0.72, 32);
}
function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
function besideArt(ctx, box) {
  const art = ctx.art ? ART_BOX[ctx.theme.family] : null;
  if (!art) return box;
  const right = art.x - 0.035;
  if (box.x + box.w <= right) return box;
  if (right - box.x < 0.2) return box;
  return { ...box, w: right - box.x };
}
function heroBody(ctx) {
  const items = ctx.items;
  const chars = items.join("").replace(/\s+/g, "").length;
  return items.length > 0 && items.length <= 2 && chars <= 32;
}
function bodyBlock(ctx, box, size, lh) {
  if (heroBody(ctx)) {
    cRect(ctx, { x: box.x - 0.022, y: box.y + 0.02, w: 6e-3, h: Math.min(box.h, 0.24) }, ctx.theme.accent, 0.55);
    cText(ctx, { ...box, x: box.x + 0.02, w: box.w - 0.02 }, bodyOf(ctx), {
      size: Math.round(size * 1.5),
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.5,
      valign: "middle"
    });
    return;
  }
  const rows = bodyOf(ctx).split("\n").filter(Boolean).length;
  const fit = Math.floor((box.h - 0.02) * 540 / Math.max(1, rows * lh));
  const s = Math.max(14, Math.min(size, fit));
  cText(ctx, box, bodyOf(ctx), { size: s, color: ctx.theme.ink, font: ctx.theme.fontBody, lineHeight: lh });
}
function tick(ctx, title) {
  cRect(ctx, { x: title.x, y: title.y + title.h + 5e-3, w: 0.07, h: 6e-3 }, ctx.theme.accent, 0.85);
}
function quotePointSize(chars, id = "suke") {
  const [a, b, c, d] = QUOTE_PT[id];
  return chars <= 20 ? a : chars <= 40 ? b : chars <= 80 ? c : d;
}
function scrimOf(...boxes) {
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - SCRIM_PAD);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - SCRIM_PAD);
  const x1 = Math.min(1, Math.max(...boxes.map((b) => b.x + b.w)) + SCRIM_PAD);
  const y1 = Math.min(1, Math.max(...boxes.map((b) => b.y + b.h)) + SCRIM_PAD);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function coverPlan(arch) {
  if (arch === "bottom") {
    const title2 = { x: 0.09, y: 0.62, w: 0.72, h: 0.16 };
    const bar2 = { x: 0.09, y: 0.795, w: 0.045, h: 8e-3 };
    const sub2 = { x: 0.09, y: 0.81, w: 0.6, h: 0.06 };
    return { title: title2, bar: bar2, sub: sub2, scrim: scrimOf(title2, bar2, sub2) };
  }
  if (arch === "rightTop") {
    const title2 = { x: 0.52, y: 0.12, w: 0.4, h: 0.2 };
    const bar2 = { x: 0.52, y: 0.335, w: 0.045, h: 8e-3 };
    const sub2 = { x: 0.52, y: 0.35, w: 0.38, h: 0.06 };
    return { title: title2, bar: bar2, sub: sub2, scrim: scrimOf(title2, bar2, sub2) };
  }
  const title = { x: 0.07, y: 0.34, w: 0.44, h: 0.2 };
  const bar = { x: 0.07, y: 0.555, w: 0.045, h: 8e-3 };
  const sub = { x: 0.07, y: 0.57, w: 0.42, h: 0.06 };
  return { title, bar, sub, scrim: scrimOf(title, bar, sub) };
}
function coverLayoutOf(quad) {
  if (!quad) return { arch: "left", scrim: 0.78 };
  const left = (num(quad.tl) + num(quad.bl)) / 2;
  const bottom = (num(quad.bl) + num(quad.br)) / 2;
  const corner = num(quad.tr);
  const best = Math.max(left, bottom, corner);
  if (best - Math.min(left, bottom, corner) < 0.08) return { arch: "bottom", scrim: 0.88 };
  if (best === left) return { arch: "left", scrim: 0.78 };
  if (best === corner) return { arch: "rightTop", scrim: 0.78 };
  return { arch: "bottom", scrim: 0.78 };
}
function coverArchOf(quad) {
  return coverLayoutOf(quad).arch;
}
function archOf(slide) {
  const v2 = String(slide.coverArch ?? "");
  return v2 === "bottom" || v2 === "rightTop" ? v2 : "left";
}
function clampOpacity(v2, fallback) {
  const n2 = Number(v2);
  if (!Number.isFinite(n2)) return fallback;
  return Math.min(1, Math.max(0.5, n2));
}
function coverFitSize(title, text) {
  const n2 = Math.max(1, Array.from(clean(text)).length);
  return Math.min(96, Math.max(36, Math.floor(title.w * 1280 * 0.95 * 0.75 / n2)));
}
function coverLayout(ctx, id) {
  const arch = archOf(ctx.slide);
  const plan = coverPlan(arch);
  const tune = COVER_TUNE[id];
  const title = {
    x: plan.title.x + tune.dx,
    y: plan.title.y + tune.dy,
    /* 右上空构图的标题框贴右沿：再往外扩就出纸，宽一律裁到纸内 */
    w: Math.min(plan.title.w + tune.dw, 1 - (plan.title.x + tune.dx) - 0.02),
    h: plan.title.h + tune.dh
  };
  const subW = Math.min(title.w, 1 - title.x - 0.02);
  const meta = { x: title.x, y: title.y + title.h + 0.04, w: subW, h: 0.05 };
  const sub = { ...plan.sub, x: title.x, y: meta.y + meta.h + 8e-3 + tune.gap, w: subW };
  const bottom = Math.max(title.y + title.h, meta.y + meta.h, sub.y + sub.h);
  if (bottom > 0.985) {
    const up = bottom - 0.985;
    title.y -= up;
    meta.y -= up;
    sub.y -= up;
  }
  const byline = { x: 0.6, y: 0.905, w: 0.34, h: 0.05 };
  if (ctx.art) {
    ctx.out.push({ kind: "image", x: 0, y: 0, w: 1, h: 1, data: ctx.art });
    cRect(ctx, scrimOf(title, sub, meta, byline), ctx.theme.paper, clampOpacity(ctx.slide.coverScrim, 0.78));
  } else {
    const motif = motifOfKey(ctx.slide.motif);
    for (const b of motif.strokes) cLine(ctx, b, ctx.theme.muted, 0.28);
    cLine(ctx, motif.ground, ctx.theme.muted, 0.28);
  }
  const titleSize = tune.fit ? coverFitSize(title, ctx.title) : tune.size;
  cText(ctx, title, ctx.title, {
    size: titleSize,
    color: ctx.theme.ink,
    font: tune.font ?? ctx.theme.fontTitle,
    align: tune.align,
    valign: "middle",
    lineHeight: id === "jijian" || id === "lanxian" ? 1.12 : 1.2,
    bold: id !== "xuan"
  });
  if (id !== "jijian" && id !== "man") {
    const barW = id === "liti" ? 0.18 : id === "lanxian" ? 0.26 : 0.045;
    const barX = tune.align === "center" ? title.x + (title.w - barW) / 2 : title.x;
    cRect(
      ctx,
      { ...plan.bar, x: barX, y: title.y + title.h + 0.012, w: barW, h: id === "liti" ? 0.012 : id === "lanxian" ? 0.014 : 8e-3 },
      ctx.theme.accent
    );
  }
  cText(ctx, sub, ctx.note || ctx.line, {
    size: tune.sub,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: tune.align,
    valign: "middle",
    lineHeight: 1.3
  });
  cText(ctx, meta, ctx.slide.meta ?? "", {
    size: 14,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: tune.align,
    valign: "middle",
    lineHeight: 1.3
  });
  cText(ctx, byline, ctx.slide.byline ?? "", {
    size: 11,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: "right",
    valign: "middle",
    lineHeight: 1.3
  });
  if (id === "xuan" && !ctx.art) seal(ctx, { x: 0.82, y: 0.8, w: 0.09, h: 0.09 });
}
function seal(ctx, box) {
  cRect(ctx, box, ctx.theme.accent, 0.9);
  cText(ctx, box, "\u5BA3\u7EB8", {
    size: 10,
    color: ctx.theme.paper,
    font: "kai",
    align: "center",
    valign: "middle",
    lineHeight: 1
  });
}
function lanxianHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.lanxian, ctx.title, {
    size: n2 <= 14 ? 36 : n2 <= 22 ? 28 : 24,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: "middle"
  });
  cLine(ctx, { x: 0.075, y: 0.225, w: 0.85, h: 18e-4 }, ctx.theme.accent, 0.5);
}
function liuHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.liu, ctx.title, {
    size: n2 <= 12 ? 30 : n2 <= 20 ? 25 : 21,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: "middle"
  });
  cLine(ctx, { x: 0.08, y: 0.212, w: 0.84, h: 35e-4 }, ctx.theme.accent, 0.9);
}
function slice(ctx, box) {
  cRect(ctx, box, ctx.theme.surface);
  cRect(ctx, { x: box.x, y: box.y, w: 6e-3, h: box.h }, ctx.theme.accent, 0.9);
}
function changHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.chang, ctx.title, {
    size: n2 <= 12 ? 28 : n2 <= 20 ? 24 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: "middle"
  });
  tick(ctx, HEAD.chang);
}
function manHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.man, ctx.title, {
    size: n2 <= 12 ? 28 : n2 <= 20 ? 24 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.2,
    valign: "middle"
  });
}
function kaCard(ctx, box) {
  cRect(ctx, box, ctx.theme.surface);
  cRect(ctx, { x: box.x, y: box.y, w: box.w, h: 0.014 }, ctx.theme.accent, 0.92);
}
function kaHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.ka, ctx.title, {
    size: n2 <= 12 ? 28 : n2 <= 20 ? 23 : 19,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.2,
    valign: "middle"
  });
  cRect(ctx, { x: 0.08, y: 0.252, w: 0.12, h: 0.01 }, ctx.theme.accent);
}
function bnHead(ctx) {
  if (!labelOnly(ctx)) {
    const n2 = Array.from(ctx.title).length;
    cText(ctx, { x: 0.037, y: 0.055, w: 0.62, h: 0.085 }, ctx.title, {
      size: n2 <= 10 ? 28 : n2 <= 16 ? 23 : 19,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      bold: true,
      lineHeight: 1.15,
      valign: "middle"
    });
  }
  cLine(ctx, { x: 0.037, y: 0.152, w: 0.926, h: 18e-4 }, ctx.theme.ink, 0.85);
  cText(ctx, { x: 0.7, y: 0.108, w: 0.263, h: 0.04 }, ctx.slide.meta ?? "", {
    size: 10,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: "right"
  });
}
function labelOnly(ctx) {
  return ctx.slide.kind === "quote" || ctx.slide.kind === "end";
}
function bnFoot(ctx) {
  const cols = [ctx.slide.meta ?? "", ctx.title, ctx.note || ctx.line, ctx.slide.byline ?? ""];
  const xs = [0.037, 0.23, 0.41, 0.65];
  const ws = [0.17, 0.16, 0.22, 0.3];
  for (let k = 0; k < 4; k += 1) {
    cLine(ctx, { x: xs[k], y: 0.905, w: ws[k], h: 18e-4 }, ctx.theme.ink, 0.6);
    cText(ctx, { x: xs[k], y: 0.918, w: ws[k], h: 0.05 }, cols[k], {
      size: 9,
      color: ctx.theme.muted,
      font: ctx.theme.fontBody,
      lineHeight: 1.25
    });
  }
}
function bnBar(ctx, box, last) {
  if (last) {
    cRect(ctx, { x: box.x - 2e-3, y: box.y - 2e-3, w: box.w + 4e-3, h: box.h + 4e-3 }, ctx.theme.ink, 0.9);
    cRect(ctx, box, ctx.theme.surface, 1);
  } else {
    cRect(ctx, box, ctx.theme.ink, 0.92);
  }
}
function gulanHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 4e-3 }, ctx.theme.accent, 0.9);
  if (!labelOnly(ctx)) {
    cText(ctx, { x: 0.035, y: 0.06, w: 0.7, h: 0.12 }, ctx.title, {
      size: n2 <= 10 ? 34 : n2 <= 16 ? 27 : 22,
      color: ctx.theme.ink,
      font: ctx.theme.fontTitle,
      lineHeight: 1.15,
      valign: "middle"
    });
  }
  cText(ctx, { x: 0.6, y: 0.155, w: 0.365, h: 0.04 }, ctx.slide.meta ?? "", {
    size: 10,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: "right"
  });
  cLine(ctx, { x: 0.035, y: 0.19, w: 0.93, h: 18e-4 }, ctx.theme.accent, 0.6);
}
function gulanFoot(ctx) {
  cLine(ctx, { x: 0.035, y: 0.955, w: 0.93, h: 4e-3 }, ctx.theme.accent, 0.9);
}
function shangwuPanel(ctx) {
  cRect(ctx, { x: 0.76, y: 0, w: 0.24, h: 1 }, ctx.theme.surface, 0.9);
  cLine(ctx, { x: 0.76, y: 0, w: 18e-4, h: 1 }, ctx.theme.accent, 0.4);
}
function shangwuHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cRect(ctx, { x: 0.062, y: 0.12, w: 9e-3, h: 0.1 }, ctx.theme.accent, 0.95);
  cText(ctx, { x: 0.098, y: 0.115, w: 0.6, h: 0.11 }, ctx.title, {
    size: n2 <= 12 ? 30 : n2 <= 20 ? 25 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.2,
    valign: "middle"
  });
}
function sanseHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cRect(ctx, { x: 0.042, y: 0.055, w: 0.014, h: 0.145 }, ctx.theme.accent, 1);
  cText(ctx, HEAD.sanse, ctx.title, {
    size: n2 <= 10 ? 30 : n2 <= 18 ? 24 : 20,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.2,
    valign: "middle"
  });
  cRect(ctx, { x: 0.078, y: 0.212, w: 0.14, h: 0.013 }, ctx.theme.surface, 1);
}
function tilePt(text, base, maxH = 1) {
  const n2 = Array.from(text).length;
  const want = n2 <= 2 ? base * 2.2 : n2 <= 4 ? base * 1.7 : n2 <= 8 ? base * 1.3 : base;
  const cap = Math.floor(maxH * 720 / 1.5);
  return Math.max(base, Math.min(Math.round(want), cap));
}
function sanseTile(ctx, box, text, index, size) {
  const filled = index % 2 === 0;
  cRect(ctx, box, filled ? ctx.theme.surface : ctx.theme.accent, 1);
  cText(ctx, { x: box.x + 0.022, y: box.y + 0.014, w: 0.1, h: 0.036 }, `/${String(index + 1).padStart(2, "0")}`, {
    size: 11,
    color: filled ? ctx.theme.accent : ctx.theme.surface,
    font: ctx.theme.fontBody,
    bold: true
  });
  const inner = { x: box.x + 0.022, y: box.y + 0.052, w: box.w - 0.044, h: box.h - 0.07 };
  const short = Array.from(text).length <= 4;
  cText(ctx, inner, text, {
    size: tilePt(text, size, inner.h),
    color: filled ? ctx.theme.ink : ctx.theme.surface,
    font: ctx.theme.fontBody,
    lineHeight: 1.45,
    align: short ? "center" : "left",
    valign: short ? "middle" : "top"
  });
}
function sanseGrid(ctx, list, top, bottom, size) {
  const n2 = list.length;
  if (!n2) return;
  const cols = n2 <= 3 ? n2 : n2 <= 6 ? 3 : 4;
  const rows = Math.ceil(n2 / cols);
  const gap = 0.014;
  const left = 0.042;
  const total = 0.916;
  const cw = (total - gap * (cols - 1)) / cols;
  const ch = (bottom - top - gap * (rows - 1)) / rows;
  list.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const box = { x: left + col * (cw + gap), y: top + row * (ch + gap), w: cw, h: ch };
    sanseTile(ctx, box, t, i, ch < 0.24 ? Math.min(size, 20) : size);
  });
}
function lindiHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.lindi, ctx.title, {
    size: n2 <= 10 ? 34 : n2 <= 16 ? 27 : 22,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.18,
    valign: "middle"
  });
  cLine(ctx, { x: 0.1, y: 0.292, w: 0.3, h: 2e-3 }, ctx.theme.accent, 0.85);
}
function lindiPlate(ctx) {
  cRect(ctx, LINDI_PLATE, ctx.theme.muted, 0.22);
  cText(ctx, { x: 0.53, y: 0.822, w: 0.4, h: 0.028 }, ctx.slide.meta ?? "", {
    size: 9,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody,
    align: "right"
  });
}
function changyanCard(ctx, box) {
  frameCard(ctx, box, ctx.theme.accent, ctx.theme.line);
}
function changyanNo(ctx, box, index) {
  cText(ctx, { x: box.x + 0.024, y: box.y + 0.016, w: 0.16, h: 0.038 }, `No.${String(index + 1).padStart(2, "0")}`, {
    size: 10,
    color: ctx.theme.accent,
    font: ctx.theme.fontBody
  });
}
function changyanGrid(ctx, list, top, bottom, size) {
  const n2 = list.length;
  if (!n2) return;
  const cols = n2 <= 3 ? n2 : 3;
  const rows = Math.ceil(n2 / cols);
  const gap = 0.03;
  const left = 0.042;
  const total = 0.916;
  const cw = (total - gap * (cols - 1)) / cols;
  const ch = (bottom - top - gap * (rows - 1)) / rows;
  list.forEach((t, i) => {
    const box = {
      x: left + i % cols * (cw + gap),
      y: top + Math.floor(i / cols) * (ch + gap),
      w: cw,
      h: ch
    };
    changyanCard(ctx, box);
    changyanNo(ctx, box, i);
    const inner = { x: box.x + 0.024, y: box.y + 0.062, w: box.w - 0.048, h: box.h - 0.09 };
    const short = Array.from(t).length <= 4;
    cText(ctx, inner, t, {
      size: tilePt(t, size, inner.h),
      color: ctx.theme.ink,
      font: ctx.theme.fontBody,
      lineHeight: 1.5,
      align: short ? "center" : "left",
      valign: "middle"
    });
  });
}
function changyanHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.changyan, ctx.title, {
    size: n2 <= 10 ? 32 : n2 <= 18 ? 26 : 21,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    bold: true,
    lineHeight: 1.18,
    valign: "middle"
  });
  cRect(ctx, { x: 0.08, y: 0.212, w: 0.11, h: 0.012 }, ctx.theme.accent);
}
function danseHead(ctx) {
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.danse, ctx.title, {
    size: n2 <= 8 ? 36 : n2 <= 14 ? 28 : n2 <= 20 ? 23 : 19,
    color: ctx.theme.ink,
    font: ctx.theme.fontTitle,
    lineHeight: 1.1,
    valign: "middle"
  });
  cLine(ctx, { x: 0.1, y: 0.238, w: 0.8, h: 1e-3 }, ctx.theme.accent, 0.85);
}
function danseCell(ctx, box, text, index, size) {
  cText(ctx, { x: box.x, y: box.y, w: box.w, h: 0.03 }, String(index + 1).padStart(2, "0"), {
    size: 10,
    color: ctx.theme.muted,
    font: ctx.theme.fontBody
  });
  cText(ctx, { x: box.x, y: box.y + 0.036, w: box.w, h: box.h - 0.045 }, text, {
    size,
    color: ctx.theme.ink,
    font: ctx.theme.fontBody,
    lineHeight: 1.55,
    valign: "middle"
  });
  cLine(ctx, { x: box.x, y: box.y + box.h, w: box.w, h: 1e-3 }, ctx.theme.accent, 0.4);
}
function danseGrid(ctx, list, top, bottom, size) {
  const n2 = list.length;
  if (!n2) return;
  const cols = n2 <= 3 ? n2 : n2 <= 4 ? 2 : 3;
  const rows = Math.ceil(n2 / cols);
  const gapX = 0.05;
  const gapY = 0.055;
  const left = 0.1;
  const total = 0.8;
  const cw = (total - gapX * (cols - 1)) / cols;
  const ch = (bottom - top - gapY * (rows - 1)) / rows;
  list.forEach((t, i) => {
    const box = {
      x: left + i % cols * (cw + gapX),
      y: top + Math.floor(i / cols) * (ch + gapY),
      w: cw,
      h: ch
    };
    danseCell(ctx, box, t, i, size);
  });
}
function gangyinLeaf(ctx, x, y, size, opacity = 1) {
  leafPair(ctx, x, y, size, ctx.theme.accent, opacity);
}
function gangyinHead(ctx) {
  cRect(ctx, { x: 0.08, y: 0.09, w: 0.56, h: 0.095 }, ctx.theme.accent);
  const n2 = Array.from(ctx.title).length;
  cText(ctx, HEAD.gangyin, ctx.title, {
    size: n2 <= 10 ? 24 : n2 <= 16 ? 19 : 16,
    color: ctx.theme.paper,
    font: ctx.theme.fontTitle,
    valign: "middle"
  });
  gangyinLeaf(ctx, 0.86, 0.078, 0.075, 0.9);
  cLine(ctx, { x: 0.08, y: 0.198, w: 0.84, h: 24e-4 }, ctx.theme.accent, 0.85);
}
function takeNumbered(ctx) {
  return ctx.items.slice(0, ITEM_CAP[ctx.theme.family].numbered);
}
function halves(items) {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}
function splitEven(items) {
  const cut = Math.ceil(items.length / 2);
  return [items.slice(0, cut), items.slice(cut)];
}
function n0(big, small, word) {
  return Array.from(word).length <= 5 ? big : small;
}
function bodyOf(ctx) {
  return ctx.items.join("\n");
}
function settle(ctx) {
  for (const p of ctx.out) {
    if (p.kind !== "text" || !String(p.text ?? "").trim()) continue;
    const start = p.size ?? SIZES.body;
    const floor = Math.max(8, Math.round(start * 0.4));
    let size = start;
    while (size > floor) {
      const lineH = size * PX2 * (p.lineHeight ?? 1.5);
      const e = extentOf({ ...p, size });
      const rows = Math.max(1, Math.round(e.h / lineH));
      const tol = rows <= 1 ? lineH * 0.5 + 0.5 : 1;
      if (e.h <= p.h * PH + tol) break;
      size -= 1;
    }
    if (size < start) {
      p.size = size;
      p.size0 = start;
    }
  }
}
function furn8(ctx) {
  cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.7);
  cRect(ctx, { x: 0.945, y: 0.03, w: 0.02, h: 0.035 }, ctx.theme.accent, 0.8);
}
function place(slide, theme) {
  const arch = archetypeOf(slide.kind);
  const fam = theme.family;
  const art = typeof slide.illustration === "string" && slide.illustration.startsWith("data:image/") ? slide.illustration : "";
  const ctx = {
    slide,
    theme,
    out: [],
    title: clean(slide.title),
    line: clean(slide.line),
    items: lines(slide.items ?? []),
    note: clean(slide.note),
    quote: clean(slide.text) || clean(slide.title),
    art
  };
  FURNITURE[fam](ctx);
  const alpha = SURFACE_ALPHA[fam];
  if (alpha > 0 && (arch === "words" || arch === "numbered" || arch === "compare")) {
    cRect(ctx, { x: 0.085, y: 0.3, w: 0.83, h: 0.54 }, theme.surface, alpha);
  }
  const artBox = ART_BOX[fam];
  LAYOUTS[fam][arch](ctx);
  if (artBox && art && arch !== "cover" && arch !== "quote" && !ART_SKIP[fam].includes(arch)) {
    guard(artBox, "\u63D2\u753B");
    const label = MARKS[fam].label;
    const clash = ctx.out.some((p) => p.kind === "text" && overlapArea(p, artBox) > 4e-4) || overlapArea(ASK[fam], artBox) > 4e-4 || (label ? overlapArea(label, artBox) > 4e-4 : false);
    if (!clash) ctx.out.push({ kind: "image", ...artBox, data: ctx.art });
  } else if (artBox && !art && clean(ctx.slide.pull) && arch !== "cover" && arch !== "quote" && !ART_SKIP[fam].includes(arch)) {
    const pull = clean(ctx.slide.pull);
    const label = MARKS[fam].label;
    const clash = ctx.out.some((p) => p.kind === "text" && overlapArea(p, artBox) > 4e-4) || overlapArea(ASK[fam], artBox) > 4e-4 || (label ? overlapArea(label, artBox) > 4e-4 : false);
    if (!clash) {
      const n2 = [...pull].length;
      cText(
        ctx,
        {
          x: artBox.x + artBox.w * 0.14,
          y: artBox.y + artBox.h * 0.2,
          w: artBox.w * 0.72,
          h: artBox.h * 0.6
        },
        `\u201C${pull}\u201D`,
        {
          size: n2 <= 18 ? 30 : n2 <= 40 ? 26 : 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "center",
          valign: "middle",
          lineHeight: 1.9
        }
      );
    }
  }
  if (arch !== "cover" && arch !== "quote" && arch !== "end" && ctx.line) {
    cText(ctx, ASK[fam], ctx.line, {
      size: 16,
      color: theme.accent,
      font: theme.fontBody,
      align: fam === "xuan" ? "center" : "left",
      valign: "middle"
    });
  }
  const marks = MARKS[fam];
  if (marks.label && arch !== "cover") {
    cText(ctx, marks.label, SLIDE_LABELS[slide.kind], {
      size: SIZES.tiny,
      color: theme.accent,
      font: theme.fontBody,
      align: fam === "xuan" ? "center" : "left",
      valign: "middle"
    });
  }
  if (marks.line && arch !== "cover") cLine(ctx, marks.line, theme.line, marks.line.opacity);
  settle(ctx);
  return ctx.out;
}
var FOOT_SLOT, NUMBERED, SIZES, CN_NUM, PW, PH, PX2, ASK, HEAD, MARKS, SURFACE_ALPHA, ART_BOX, ART_SKIP, QUOTE_PT, SCRIM_PAD, num, COVER_TUNE, suke, xuan, liti, jijian, shuye, tigangBand, tigang, lanxian, liu, chang, man, ka, BN_LEFT, BN_BAND, BN_DATE, shuangnian, gulan, shangwu, sanse, LINDI_PLATE, lindi, changyan, danse, gangyin, LAYOUTS, ITEM_CAP, FURNITURE;
var init_place = __esm({
  "src/lib/deck2/place.ts"() {
    "use strict";
    init_slides();
    init_motifs();
    FOOT_SLOT = {
      line: { x: 0.09, y: 0.935, w: 0.82, h: 15e-4 },
      left: { x: 0.09, y: 0.945, w: 0.5, h: 0.04 },
      right: { x: 0.71, y: 0.945, w: 0.2, h: 0.04 }
    };
    NUMBERED = ["board", "drill", "homework"];
    SIZES = { h1: 46, h1Big: 54, h2: 34, body: 26, small: 18, tiny: 12 };
    CN_NUM = "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341";
    PW = 1280;
    PH = 720;
    PX2 = 4 / 3;
    ASK = {
      suke: { x: 0.085, y: 0.845, w: 0.76, h: 0.05 },
      xuan: { x: 0.18, y: 0.83, w: 0.64, h: 0.05 },
      liti: { x: 0.06, y: 0.8, w: 0.88, h: 0.05 },
      jijian: { x: 0.1, y: 0.78, w: 0.8, h: 0.05 },
      shuye: { x: 0.26, y: 0.85, w: 0.34, h: 0.05 },
      tigang: { x: 0.09, y: 0.855, w: 0.46, h: 0.05 },
      /* 栏线：问句压在页脚线上方，与条目最后一条让开 0.01 */
      lanxian: { x: 0.075, y: 0.862, w: 0.6, h: 0.05 },
      /* 六栏：问句贴着最后一道横线，左齐 */
      liu: { x: 0.08, y: 0.855, w: 0.62, h: 0.05 },
      /* 长桌：问句落在一张纸卡上，偏右一点（左下的卡片叠到 0.78） */
      chang: { x: 0.1, y: 0.85, w: 0.56, h: 0.05 },
      /* 满篇：问句与正文同一条左边线（无彩色版面上靠对齐区分） */
      man: { x: 0.1, y: 0.855, w: 0.6, h: 0.05 },
      /* 四卡：问句与卡片左边线对齐 */
      ka: { x: 0.08, y: 0.845, w: 0.6, h: 0.05 },
      /* 第二批八族：问句各挂各的（位置本身就是族的一部分） */
      shuangnian: { x: 0.09, y: 0.795, w: 0.5, h: 0.05 },
      gulan: { x: 0.035, y: 0.885, w: 0.5, h: 0.05 },
      /* 商务蓝：问句行抬到 .82——页名在左下 .90，再低就压上去了 */
      shangwu: { x: 0.08, y: 0.82, w: 0.44, h: 0.05 },
      sanse: { x: 0.09, y: 0.84, w: 0.54, h: 0.05 },
      lindi: { x: 0.1, y: 0.845, w: 0.4, h: 0.05 },
      changyan: { x: 0.08, y: 0.852, w: 0.46, h: 0.05 },
      danse: { x: 0.1, y: 0.845, w: 0.56, h: 0.05 },
      gangyin: { x: 0.08, y: 0.865, w: 0.48, h: 0.05 }
    };
    HEAD = {
      suke: { x: 0.085, y: 0.185, w: 0.76, h: 0.09 },
      xuan: { x: 0.18, y: 0.145, w: 0.64, h: 0.1 },
      liti: { x: 0.06, y: 0.105, w: 0.7, h: 0.09 },
      jijian: { x: 0.1, y: 0.225, w: 0.8, h: 0.09 },
      shuye: { x: 0.26, y: 0.155, w: 0.34, h: 0.09 },
      tigang: { x: 0.09, y: 0.07, w: 0.8, h: 0.1 },
      /* 栏线：标题只占左 62%，右边那一条留给右上角的页名小标签 */
      lanxian: { x: 0.075, y: 0.085, w: 0.62, h: 0.12 },
      /* 六栏：标题矮一行，底下就是第一道满宽横线 */
      liu: { x: 0.08, y: 0.09, w: 0.66, h: 0.11 },
      /* 长桌：黑体标题，压在左上角第一张卡片的上沿 */
      chang: { x: 0.1, y: 0.1, w: 0.62, h: 0.11 },
      /* 满篇：标题贴到纸顶（Monochrome 的刊头），与任何一族的页眉都不在一条线上 */
      man: { x: 0.1, y: 0.035, w: 0.7, h: 0.11 },
      /* 四卡：标题压得更低，底下就是第一排卡 */
      ka: { x: 0.08, y: 0.145, w: 0.6, h: 0.1 },
      /* 双年展：刊头压到最上，底下一条通栏线 */
      shuangnian: { x: 0.09, y: 0.07, w: 0.8, h: 0.11 },
      /* 钴蓝格：题上就是那条通栏蓝线 */
      gulan: { x: 0.1, y: 0.13, w: 0.8, h: 0.095 },
      /* 商务蓝：标题右边整条浅 panel 让开，框只占左边 */
      shangwu: { x: 0.1, y: 0.125, w: 0.54, h: 0.095 },
      /* 三色刊：标题从栗红竖条右边起（竖条自己画在版式里） */
      sanse: { x: 0.078, y: 0.055, w: 0.72, h: 0.145 },
      /* 林地：衬线大标题只占左半张，右边是图（右边界 .52，与图版的 .53 让开 0.01，否则会判成字压图） */
      lindi: { x: 0.1, y: 0.155, w: 0.42, h: 0.12 },
      /* 长桌宴：黑体标题贴最上，像一桌的桌签 */
      changyan: { x: 0.08, y: 0.085, w: 0.66, h: 0.1 },
      /* 单色刊：标题宽松一行，底下只有一根发丝线 */
      danse: { x: 0.1, y: 0.11, w: 0.76, h: 0.11 },
      /* 钢印：标题在实心块里（反白），框要装得下 16 字 */
      gangyin: { x: 0.1, y: 0.105, w: 0.46, h: 0.075 }
    };
    MARKS = {
      suke: {
        label: { x: 0.085, y: 0.905, w: 0.5, h: 0.04 },
        line: { x: 0.04, y: 0.935, w: 0.92, h: 15e-4 }
      },
      xuan: {
        label: { x: 0.18, y: 0.905, w: 0.64, h: 0.04 },
        line: { x: 0.44, y: 0.935, w: 0.12, h: 15e-4 }
      },
      liti: {
        label: { x: 0.06, y: 0.905, w: 0.5, h: 0.04 },
        line: { x: 0.06, y: 0.935, w: 0.88, h: 8e-4 }
      },
      jijian: {
        label: null,
        line: { x: 0.1, y: 0.935, w: 0.8, h: 15e-4, opacity: 0.5 }
      },
      shuye: {
        label: { x: 0.26, y: 0.905, w: 0.34, h: 0.04 },
        line: { x: 0.26, y: 0.935, w: 0.64, h: 15e-4 }
      },
      tigang: {
        label: { x: 0.09, y: 0.905, w: 0.5, h: 0.04 },
        line: { x: 0.06, y: 0.935, w: 0.88, h: 12e-4 }
      },
      /* 栏线的页名反过来放右上角（像 Biennale 的「OPEN PROGRAMME」），左下留给问句 */
      lanxian: {
        label: { x: 0.705, y: 0.1, w: 0.22, h: 0.04 },
        line: { x: 0.075, y: 0.935, w: 0.85, h: 12e-4 }
      },
      /* 六栏：页名在右下，页脚一道贯穿到底的横线（满页横线是它的身份） */
      liu: {
        label: { x: 0.72, y: 0.905, w: 0.2, h: 0.04 },
        line: { x: 0.08, y: 0.935, w: 0.84, h: 15e-4 }
      },
      /* 长桌：卡片自己就是版面，页脚只留一道很淡的边线 */
      chang: {
        label: { x: 0.1, y: 0.905, w: 0.4, h: 0.04 },
        line: { x: 0.1, y: 0.935, w: 0.8, h: 12e-4, opacity: 0.7 }
      },
      /* 满篇：只有一根发丝线（全屏无彩色，不做块面） */
      man: {
        label: { x: 0.1, y: 0.905, w: 0.4, h: 0.04 },
        line: { x: 0.1, y: 0.935, w: 0.8, h: 8e-4, opacity: 0.55 }
      },
      /* 四卡：页名换到右下（像一页刀版的编号），页脚线还是靠左、与卡片对齐 */
      ka: {
        label: { x: 0.68, y: 0.905, w: 0.22, h: 0.04 },
        line: { x: 0.08, y: 0.935, w: 0.84, h: 15e-4 }
      },
      /* 双年展：页名在右下，页脚线压到 .885（底下还有四栏短横） */
      shuangnian: {
        label: { x: 0.62, y: 0.795, w: 0.3, h: 0.04 },
        line: { x: 0.09, y: 0.885, w: 0.82, h: 22e-4 }
      },
      /* 钴蓝格：页名右下；顶底两道粗蓝线由版式自画（每一页都有，是母版的身份证） */
      gulan: {
        label: { x: 0.8, y: 0.9, w: 0.165, h: 0.04 },
        line: null
      },
      /* 商务蓝：页名回到左下，页脚线只画左边那段（右边是 panel） */
      shangwu: {
        label: { x: 0.08, y: 0.9, w: 0.28, h: 0.04 },
        line: { x: 0.08, y: 0.932, w: 0.5, h: 12e-4 }
      },
      /* 三色刊：页名压到最下（结束页上半页是两块实色，页名必须落在下那条粉纸上） */
      sanse: {
        label: { x: 0.09, y: 0.895, w: 0.32, h: 0.04 },
        line: { x: 0.09, y: 0.925, w: 0.82, h: 2e-3 }
      },
      /* 林地：页名左下，页脚发丝线压到 .93 */
      lindi: {
        label: { x: 0.1, y: 0.895, w: 0.3, h: 0.04 },
        line: { x: 0.1, y: 0.93, w: 0.8, h: 12e-4 }
      },
      /* 长桌宴：页名右下（卡片排到 .84） */
      changyan: {
        label: { x: 0.68, y: 0.852, w: 0.24, h: 0.04 },
        line: { x: 0.08, y: 0.925, w: 0.84, h: 15e-4 }
      },
      /* 单色刊：只有一根发丝线，页名压到最下 */
      danse: {
        label: { x: 0.1, y: 0.895, w: 0.28, h: 0.04 },
        line: { x: 0.1, y: 0.932, w: 0.8, h: 8e-4 }
      },
      /* 钢印：页名右下，页脚就是那道钢印线 */
      gangyin: {
        label: { x: 0.66, y: 0.865, w: 0.26, h: 0.04 },
        line: { x: 0.08, y: 0.93, w: 0.84, h: 2e-3 }
      }
    };
    SURFACE_ALPHA = {
      suke: 0.04,
      xuan: 0.04,
      liti: 0.08,
      jijian: 0,
      shuye: 0,
      tigang: 0.06,
      lanxian: 0,
      liu: 0,
      chang: 0,
      man: 0,
      ka: 0,
      /* 第二批八族：色块都是排版里明着画的，不铺底纹 */
      shuangnian: 0,
      gulan: 0,
      shangwu: 0,
      sanse: 0,
      lindi: 0,
      changyan: 0,
      danse: 0,
      gangyin: 0
    };
    ART_BOX = {
      suke: { x: 0.6, y: 0.29, w: 0.34, h: 0.48 },
      xuan: { x: 0.66, y: 0.5, w: 0.26, h: 0.3 },
      liti: { x: 0.5, y: 0.24, w: 0.44, h: 0.56 },
      jijian: null,
      shuye: { x: 0.66, y: 0.28, w: 0.28, h: 0.44 },
      tigang: { x: 0.6, y: 0.24, w: 0.34, h: 0.48 },
      lanxian: { x: 0.685, y: 0.29, w: 0.24, h: 0.4 },
      liu: { x: 0.7, y: 0.3, w: 0.22, h: 0.4 },
      chang: { x: 0.66, y: 0.28, w: 0.26, h: 0.42 },
      man: { x: 0.68, y: 0.32, w: 0.24, h: 0.38 },
      ka: { x: 0.68, y: 0.3, w: 0.24, h: 0.4 },
      shuangnian: { x: 0.62, y: 0.24, w: 0.3, h: 0.46 },
      gulan: { x: 0.68, y: 0.29, w: 0.24, h: 0.42 },
      /* 商务蓝：整条右 panel 就是图位（没画时那块浅色也在） */
      shangwu: { x: 0.76, y: 0, w: 0.24, h: 1 },
      sanse: { x: 0.66, y: 0.24, w: 0.3, h: 0.52 },
      /* 林地：右半张全是图（与 LINDI_PLATE 同坐标，画正好压在那块灰绿版上） */
      lindi: { x: 0.53, y: 0.13, w: 0.4, h: 0.68 },
      changyan: { x: 0.67, y: 0.28, w: 0.28, h: 0.5 },
      danse: { x: 0.66, y: 0.3, w: 0.26, h: 0.4 },
      gangyin: { x: 0.7, y: 0.24, w: 0.22, h: 0.42 }
    };
    ART_SKIP = {
      suke: ["compare"],
      xuan: ["compare", "words"],
      liti: ["compare"],
      jijian: [],
      shuye: [],
      tigang: [],
      lanxian: ["compare", "words"],
      liu: ["compare", "words"],
      chang: ["compare", "words"],
      man: ["compare", "words"],
      ka: ["compare", "words"],
      shuangnian: ["compare", "words", "numbered"],
      /* 钴蓝格 / 商务蓝 / 长桌宴的条目页是满幅网格，图压上去就是字压图 */
      gulan: ["compare", "words", "numbered"],
      shangwu: ["compare", "words", "numbered"],
      sanse: ["compare", "words", "numbered"],
      lindi: ["compare", "words"],
      changyan: ["compare", "words", "numbered"],
      danse: ["compare", "words"],
      gangyin: ["compare", "words"]
    };
    QUOTE_PT = {
      suke: [40, 32, 26, 21],
      xuan: [36, 30, 24, 19],
      liti: [32, 28, 24, 19],
      jijian: [48, 48, 44, 35],
      shuye: [42, 32, 26, 21],
      tigang: [38, 30, 26, 21],
      lanxian: [52, 42, 34, 27],
      liu: [46, 36, 30, 24],
      chang: [44, 34, 28, 22],
      man: [50, 40, 32, 26],
      ka: [42, 34, 28, 22],
      shuangnian: [44, 34, 28, 22],
      gulan: [48, 38, 32, 26],
      shangwu: [46, 36, 30, 24],
      sanse: [42, 33, 27, 22],
      lindi: [50, 40, 32, 26],
      changyan: [44, 35, 29, 23],
      danse: [52, 42, 34, 27],
      gangyin: [46, 36, 30, 24]
    };
    SCRIM_PAD = 0.035;
    num = (v2) => Number.isFinite(Number(v2)) ? Number(v2) : 0;
    COVER_TUNE = {
      suke: { dy: 0, dx: 0, dw: 0, dh: 0, size: SIZES.h1, align: "left", sub: 18, gap: 0.03 },
      xuan: { dy: -0.04, dx: 0, dw: -0.04, dh: 0, size: 40, align: "center", font: "kai", sub: 16, gap: 0.03 },
      liti: { dy: 0.04, dx: 0, dw: 0.02, dh: 0, size: 44, align: "left", sub: 16, gap: 0.03 },
      jijian: { dy: -0.08, dx: 0, dw: 0, dh: 0.02, size: SIZES.h1Big, align: "left", sub: 14, gap: 0 },
      /* 书页：标题往右下错一点，左边留出边栏线（与内页同一条） */
      shuye: { dy: 0.02, dx: 0.04, dw: 0.06, dh: 0, size: 48, align: "left", sub: 16, gap: 0.03 },
      /* 提纲：标题略大、贴得最紧，像一张大纲的表头 */
      tigang: { dy: 0.02, dx: -0.03, dw: 0, dh: 0.02, size: 50, align: "left", sub: 16, gap: 0.02 },
      /* 栏线：标题最大、压到最下，顶上一道通栏线把整页切出来（与 Biennale 封面同构） */
      lanxian: { dy: 0.09, dx: -5e-3, dw: 0.16, dh: 0.02, size: 52, align: "left", sub: 16, gap: 0.03, fit: true },
      /* 六栏：标题抬高、往右缩，下面留出三道横线（Cobalt Grid 的格子感） */
      liu: { dy: -0.05, dx: 0.04, dw: -0.06, dh: 0, size: 66, align: "left", sub: 16, gap: 0.04 },
      /* 长桌：标题黑体、压在一张纸卡上，副题紧贴（像一张桌签） */
      chang: { dy: 0.05, dx: 0.075, dw: -0.04, dh: 0, size: 58, align: "left", font: "hei", sub: 16, gap: 0.02 },
      /* 满篇：标题提得最高、无装饰，下面一大片空给正文（无彩色的靠字号层级撑页） */
      man: { dy: -0.12, dx: 0, dw: -0.02, dh: 0, size: 56, align: "left", sub: 15, gap: 0.03 },
      /* 四卡：标题黑体、字最大，整块压到纸面下半（Stencil 的下沉式封），左边空出来给刀版白 */
      ka: { dy: 0.13, dx: 0.06, dw: 0, dh: 0.04, size: 62, align: "left", font: "hei", sub: 15, gap: 0.02 },
      /* 第二批八族：字号 41/42/43/45/47/49/51/53 占满剩下的空档（19 族两两不等）；
         标题整体压到下半张：dy 三档（.15/.19/.23）× dx 三档（左/中/右），
         同 dx 组内 dy 差 ≥ .04（标题与教材行两处 y 都拉开），跨组靠 dx 再拉一次。
         每一档的「副题底边」算式是 .698 + dy + dh + gap，一律 ≤ .985，不靠 clamp 往上收——
         一收就会把 .23 拉回到 .19 的位置上，两族又变成一模一样。 */
      shuangnian: { dy: 0.15, dx: 0, dw: 0.04, dh: 0, size: 41, align: "left", sub: 16, gap: 0.04 },
      gulan: { dy: 0.15, dx: -0.06, dw: 0.06, dh: 0.01, size: 42, align: "left", sub: 16, gap: 0.04 },
      shangwu: { dy: 0.15, dx: 0.12, dw: 0.08, dh: 0, size: 43, align: "left", sub: 16, gap: 0.04 },
      sanse: { dy: 0.19, dx: 0, dw: 0.02, dh: 0.02, size: 45, align: "left", sub: 15, gap: 0.05 },
      lindi: { dy: 0.19, dx: -0.06, dw: 0.06, dh: 0, size: 47, align: "left", sub: 16, gap: 0.06 },
      changyan: { dy: 0.19, dx: 0.12, dw: 0.06, dh: 0, size: 49, align: "left", sub: 15, gap: 0.04 },
      danse: { dy: 0.23, dx: 0, dw: -0.04, dh: 0.02, size: 51, align: "left", sub: 14, gap: 0.03 },
      gangyin: { dy: 0.23, dx: -0.06, dw: 0.1, dh: 0, size: 53, align: "left", sub: 13, gap: 0.045 }
    };
    suke = {
      cover: (ctx) => coverLayout(ctx, "suke"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.12, y: 0.22, w: 0.76, h: 0.58 }, quote, {
          size: quotePointSize(Array.from(quote).length, "suke"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.6, y: 0.72, w: 0.28, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right",
          valign: "middle"
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.085, y: 0.3, w: 0.5, h: 0.52 }, ctx.items.slice(0, 5).join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.7
        });
      },
      numbered: (ctx) => {
        const list = takeNumbered(ctx);
        cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        tick(ctx, HEAD.suke);
        cText(ctx, { x: 0.085, y: 0.3, w: 0.05, h: 0.52 }, list.map((_, i) => CN_NUM[i] ?? "\xB7").join("\n"), {
          size: SIZES.body,
          color: ctx.theme.accent,
          font: ctx.theme.fontTitle,
          lineHeight: 1.75
        });
        cText(ctx, besideArt(ctx, { x: 0.155, y: 0.3, w: 0.72, h: 0.52 }), list.join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.75
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        cText(ctx, HEAD.suke, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.085, y: 0.34, w: 0.4, h: 0.46 }, left.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cText(ctx, { x: 0.525, y: 0.34, w: 0.4, h: 0.46 }, right.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cLine(ctx, { x: 0.505, y: 0.32, w: 15e-4, h: 0.5 }, ctx.theme.line);
      },
      end: (ctx) => {
        cText(ctx, { x: 0.2, y: 0.4, w: 0.6, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: SIZES.h2,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.2, y: 0.58, w: 0.6, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      plain: (ctx) => {
        const title = { x: 0.085, y: 0.14, w: 0.76, h: 0.1 };
        cText(ctx, title, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        tick(ctx, title);
        bodyBlock(ctx, besideArt(ctx, { x: 0.085, y: 0.28, w: 0.76, h: 0.54 }), 22, 1.8);
      }
    };
    xuan = {
      cover: (ctx) => coverLayout(ctx, "xuan"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.18, y: 0.2, w: 0.64, h: 0.6 }, quote, {
          size: quotePointSize(Array.from(quote).length, "xuan"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 2
        });
        cText(ctx, { x: 0.18, y: 0.8, w: 0.64, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: "center" });
        const [left, right] = splitEven(ctx.items);
        cText(ctx, { x: 0.16, y: 0.3, w: 0.32, h: 0.52 }, left.join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.52, y: 0.3, w: 0.32, h: 0.52 }, right.join("\n"), {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.9
        });
      },
      numbered: (ctx) => {
        cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: "center" });
        tick(ctx, HEAD.xuan);
        const body = takeNumbered(ctx).map((t, i) => `\u5176${CN_NUM[i] ?? "\u4E00"}\u3000${t}`).join("\n");
        cText(ctx, besideArt(ctx, { x: 0.22, y: 0.3, w: 0.56, h: 0.52 }), body, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "left",
          lineHeight: 1.9
        });
      },
      compare: (ctx) => {
        const [top, bottom] = halves(ctx.items);
        cText(ctx, HEAD.xuan, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle, align: "center" });
        cText(ctx, { x: 0.18, y: 0.24, w: 0.64, h: 0.24 }, top.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "center",
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.18, y: 0.48, w: 0.64, h: 15e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.18, y: 0.52, w: 0.64, h: 0.26 }, bottom.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "center",
          lineHeight: 1.6
        });
      },
      end: (ctx) => {
        cText(ctx, { x: 0.3, y: 0.42, w: 0.4, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 30,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.3, y: 0.6, w: 0.4, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
        seal(ctx, { x: 0.86, y: 0.8, w: 0.07, h: 0.07 });
      },
      plain: (ctx) => {
        const title = { x: 0.18, y: 0.16, w: 0.64, h: 0.1 };
        cText(ctx, title, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center"
        });
        tick(ctx, { ...title, x: 0.18 + (0.64 - 0.07) / 2 });
        bodyBlock(ctx, besideArt(ctx, { x: 0.18, y: 0.3, w: 0.64, h: 0.52 }), 22, 2);
      }
    };
    liti = {
      cover: (ctx) => coverLayout(ctx, "liti"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.06, y: 0.22, w: 0.66, h: 0.56 }, quote, {
          size: quotePointSize(Array.from(quote).length, "liti"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.6
        });
        cRect(ctx, { x: 0.02, y: 0.24, w: 8e-3, h: 0.52 }, ctx.theme.accent, 0.25);
        cText(ctx, { x: 0.06, y: 0.8, w: 0.4, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const cells = ctx.art ? [
          { x: 0.06, y: 0.3, w: 0.38, h: 0.09 },
          { x: 0.06, y: 0.41, w: 0.38, h: 0.09 },
          { x: 0.06, y: 0.52, w: 0.38, h: 0.09 },
          { x: 0.06, y: 0.63, w: 0.38, h: 0.09 }
        ] : [
          { x: 0.06, y: 0.32, w: 0.4, h: 0.09 },
          { x: 0.5, y: 0.32, w: 0.44, h: 0.09 },
          { x: 0.06, y: 0.44, w: 0.4, h: 0.09 },
          { x: 0.5, y: 0.44, w: 0.44, h: 0.09 }
        ];
        ctx.items.slice(0, 4).forEach((word, i) => {
          const box = cells[i];
          cRect(ctx, box, ctx.theme.surface, 0.08);
          cText(ctx, { ...box, h: box.h }, word, {
            size: 24,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            align: "center",
            valign: "middle",
            lineHeight: 1.2
          });
        });
      },
      numbered: (ctx) => {
        cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        tick(ctx, HEAD.liti);
        const list = takeNumbered(ctx);
        const step = Math.min(0.14, 0.5 / Math.max(1, list.length));
        list.forEach((t, n2) => {
          const x = 0.06 + n2 * 0.02;
          const w = (ctx.art ? 0.4 : 0.88) - n2 * 0.02;
          const y = 0.3 + n2 * step;
          cText(ctx, { x, y, w, h: step - 0.02 }, `${n2 + 1}. ${t}`, {
            size: 24,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.5
          });
          cLine(ctx, { x, y: y + step - 0.02, w, h: 1e-3 }, ctx.theme.line);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        cText(ctx, HEAD.liti, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cRect(ctx, { x: 0.06, y: 0.22, w: 0.4, h: 0.06 }, ctx.theme.surface, 0.1);
        cRect(ctx, { x: 0.5, y: 0.22, w: 0.44, h: 0.06 }, ctx.theme.surface, 0.1);
        cText(ctx, { x: 0.06, y: 0.27, w: 0.4, h: 0.46 }, left.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cText(ctx, { x: 0.5, y: 0.27, w: 0.44, h: 0.46 }, right.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.5
        });
        cLine(ctx, { x: 0.475, y: 0.22, w: 12e-4, h: 0.6 }, ctx.theme.line);
      },
      end: (ctx) => {
        cText(ctx, { x: 0.2, y: 0.46, w: 0.6, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 32,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.06, y: 0.6, w: 0.6, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        const title = { x: 0.06, y: 0.14, w: 0.7, h: 0.1 };
        cText(ctx, title, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        tick(ctx, title);
        bodyBlock(ctx, besideArt(ctx, { x: 0.06, y: 0.32, w: 0.88, h: 0.54 }), 22, 1.7);
      }
    };
    jijian = {
      cover: (ctx) => coverLayout(ctx, "jijian"),
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.1, y: 0.26, w: 0.8, h: 0.48 }, quote, {
          size: quotePointSize(Array.from(quote).length, "jijian"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.5
        });
        cText(ctx, { x: 0.1, y: 0.76, w: 0.8, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      words: (ctx) => {
        cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const cells = [
          { x: 0.1, y: 0.32, w: 0.38, h: 0.1 },
          { x: 0.52, y: 0.32, w: 0.38, h: 0.1 },
          { x: 0.1, y: 0.44, w: 0.38, h: 0.1 },
          { x: 0.52, y: 0.44, w: 0.38, h: 0.1 }
        ];
        ctx.items.slice(0, 4).forEach((word, i) => {
          cText(ctx, cells[i], word, {
            size: 28,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            lineHeight: 1.2
          });
        });
      },
      numbered: (ctx) => {
        cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const list = takeNumbered(ctx);
        const size = list.length <= 3 ? 24 : list.length <= 4 ? 22 : list.length <= 5 ? 20 : 19;
        const lh = list.length <= 3 ? 2 : list.length <= 4 ? 1.9 : list.length <= 5 ? 1.85 : 1.8;
        cText(ctx, { x: 0.1, y: 0.36, w: 0.02, h: 0.4 }, list.map(() => "\xB7").join("\n"), {
          size,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          lineHeight: lh
        });
        cText(ctx, { x: 0.135, y: 0.36, w: 0.765, h: 0.4 }, list.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: lh
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        cText(ctx, HEAD.jijian, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.1, y: 0.4, w: 0.38, h: 0.36 }, left.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7
        });
        cText(ctx, { x: 0.52, y: 0.4, w: 0.38, h: 0.36 }, right.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7
        });
      },
      end: (ctx) => {
        cText(ctx, { x: 0.25, y: 0.42, w: 0.5, h: 0.12 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.25, y: 0.6, w: 0.5, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.1, y: 0.14, w: 0.8, h: 0.1 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        bodyBlock(ctx, { x: 0.1, y: 0.34, w: 0.8, h: 0.46 }, 24, 1.9);
      }
    };
    shuye = {
      cover: (ctx) => {
        coverLayout(ctx, "shuye");
        cLine(ctx, { x: 0.235, y: 0.08, w: 18e-4, h: 0.78 }, ctx.theme.line, 0.6);
      },
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.26, y: 0.22, w: 0.62, h: 0.48 }, quote, {
          size: quotePointSize(Array.from(quote).length, "shuye"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.05, y: 0.22, w: 0.15, h: 0.32 }, ctx.note, {
          size: 13,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right",
          lineHeight: 1.7
        });
        cLine(ctx, { x: 0.235, y: 0.16, w: 18e-4, h: 0.62 }, ctx.theme.line);
      },
      words: (ctx) => {
        const list = ctx.items.slice(0, 5);
        cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.05, y: 0.32, w: 0.15, h: 0.44 }, list.map((_, i) => String(i + 1)).join("\n"), {
          size: 14,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          align: "right",
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.26, y: 0.32, w: 0.34, h: 0.44 }, list.join("\n"), {
          size: 24,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9
        });
        cLine(ctx, { x: 0.235, y: 0.26, w: 18e-4, h: 0.5 }, ctx.theme.line);
      },
      numbered: (ctx) => {
        const list = takeNumbered(ctx);
        cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.05, y: 0.32, w: 0.15, h: 0.46 }, list.map((_, i) => CN_NUM[i] ?? "\xB7").join("\n"), {
          size: 13,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          align: "right",
          lineHeight: 2
        });
        cText(ctx, { x: 0.26, y: 0.32, w: 0.34, h: 0.46 }, list.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 2
        });
        cLine(ctx, { x: 0.235, y: 0.26, w: 18e-4, h: 0.52 }, ctx.theme.line);
      },
      compare: (ctx) => {
        const [top, bottom] = halves(ctx.items);
        cText(ctx, HEAD.shuye, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.26, y: 0.3, w: 0.34, h: 0.2 }, top.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.26, y: 0.52, w: 0.34, h: 12e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.26, y: 0.56, w: 0.34, h: 0.2 }, bottom.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.235, y: 0.26, w: 18e-4, h: 0.52 }, ctx.theme.line);
      },
      end: (ctx) => {
        cText(ctx, { x: 0.26, y: 0.38, w: 0.34, h: 0.16 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 30,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.4
        });
        cText(ctx, { x: 0.26, y: 0.64, w: 0.34, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        cLine(ctx, { x: 0.235, y: 0.16, w: 18e-4, h: 0.72 }, ctx.theme.line);
      },
      plain: (ctx) => {
        cText(ctx, { x: 0.26, y: 0.16, w: 0.34, h: 0.09 }, ctx.title, {
          size: SIZES.body,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle
        });
        bodyBlock(ctx, besideArt(ctx, { x: 0.26, y: 0.3, w: 0.34, h: 0.48 }), 22, 1.8);
        cLine(ctx, { x: 0.235, y: 0.12, w: 18e-4, h: 0.72 }, ctx.theme.line);
      }
    };
    tigangBand = (ctx) => {
      cRect(ctx, { x: 0.06, y: 0.06, w: 0.88, h: 0.13 }, ctx.theme.surface, 0.12);
      cLine(ctx, { x: 0.06, y: 0.19, w: 0.88, h: 18e-4 }, ctx.theme.accent, 0.5);
    };
    tigang = {
      cover: (ctx) => {
        coverLayout(ctx, "tigang");
        tigangBand(ctx);
      },
      quote: (ctx) => {
        const quote = `\u300C${ctx.quote}\u300D`;
        tigangBand(ctx);
        cText(ctx, { x: 0.09, y: 0.22, w: 0.82, h: 0.48 }, quote, {
          size: quotePointSize(Array.from(quote).length, "tigang"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.09, y: 0.82, w: 0.5, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const cells = [
          { x: 0.09, y: 0.3, w: 0.2, h: 0.07 },
          { x: 0.33, y: 0.3, w: 0.2, h: 0.07 },
          { x: 0.09, y: 0.41, w: 0.2, h: 0.07 },
          { x: 0.33, y: 0.41, w: 0.2, h: 0.07 }
        ];
        ctx.items.slice(0, 4).forEach((word, i) => {
          const box = cells[i];
          cRect(ctx, { x: box.x - 0.032, y: box.y + 0.026, w: 0.016, h: 0.016 }, ctx.theme.accent, 0.9);
          cText(ctx, box, word, {
            size: 24,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
        });
      },
      numbered: (ctx) => {
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        const list = takeNumbered(ctx);
        const step = Math.min(0.115, 0.46 / Math.max(1, list.length));
        list.forEach((t, n2) => {
          const y = 0.24 + n2 * step;
          cText(ctx, { x: 0.09, y, w: 0.08, h: step - 0.015 }, String(n2 + 1), {
            size: 40,
            color: ctx.theme.accent,
            font: ctx.theme.fontTitle,
            lineHeight: 1.05
          });
          cText(ctx, { x: 0.2, y: y + 0.01, w: 0.34, h: step - 0.015 }, t, {
            size: 22,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.6
          });
          cLine(ctx, { x: 0.09, y: y + step - 0.012, w: 0.45, h: 1e-3 }, ctx.theme.line);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        cText(ctx, { x: 0.09, y: 0.32, w: 0.2, h: 0.44 }, left.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cText(ctx, { x: 0.34, y: 0.32, w: 0.2, h: 0.44 }, right.join("\n"), {
          size: 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.6
        });
        cLine(ctx, { x: 0.315, y: 0.3, w: 12e-4, h: 0.48 }, ctx.theme.line);
      },
      end: (ctx) => {
        tigangBand(ctx);
        cText(ctx, { x: 0.09, y: 0.42, w: 0.46, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 32,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.09, y: 0.6, w: 0.46, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        tigangBand(ctx);
        cText(ctx, HEAD.tigang, ctx.title, { size: SIZES.body, color: ctx.theme.ink, font: ctx.theme.fontTitle });
        bodyBlock(ctx, besideArt(ctx, { x: 0.09, y: 0.34, w: 0.46, h: 0.44 }), 22, 1.7);
      }
    };
    lanxian = {
      cover: (ctx) => {
        coverLayout(ctx, "lanxian");
        const firstText = ctx.out.findIndex((p) => p.kind === "text");
        const at = firstText < 0 ? ctx.out.length : firstText;
        ctx.out.splice(at, 0, { kind: "rect", x: 0.66, y: 0, w: 0.34, h: 0.3, fill: ctx.theme.accent, opacity: 0.1 });
        cLine(ctx, { x: 0.04, y: 0.055, w: 0.92, h: 15e-4 }, ctx.theme.accent, 0.5);
        cLine(ctx, { x: 0.04, y: 0.878, w: 0.92, h: 12e-4 }, ctx.theme.line);
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cLine(ctx, { x: 0.1, y: 0.19, w: 0.8, h: 15e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.1, y: 0.22, w: 0.8, h: 0.44 }, q, {
          size: quotePointSize(Array.from(q).length, "lanxian"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          valign: "middle",
          lineHeight: 1.95
        });
        cLine(ctx, { x: 0.1, y: 0.68, w: 0.8, h: 15e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.52, y: 0.7, w: 0.38, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right",
          valign: "middle"
        });
      },
      words: (ctx) => {
        lanxianHead(ctx);
        const list = ctx.items.slice(0, 4);
        const colW = 0.4;
        const rowH = 0.22;
        list.forEach((w, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = 0.075 + col * (colW + 0.05);
          const y = 0.29 + row * rowH;
          cText(ctx, { x, y: y + 0.012, w: 0.06, h: 0.045 }, String(i + 1).padStart(2, "0"), {
            size: 12,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody,
            lineHeight: 1.2
          });
          cText(ctx, { x: x + 0.06, y, w: colW - 0.06, h: 0.13 }, w, {
            size: 40,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            lineHeight: 1.35,
            valign: "middle"
          });
          cLine(ctx, { x, y: y + 0.16, w: colW, h: 12e-4 }, ctx.theme.line);
        });
      },
      numbered: (ctx) => {
        lanxianHead(ctx);
        const list = takeNumbered(ctx);
        const step = Math.min(0.14, 0.46 / Math.max(1, list.length));
        const numSize = list.length <= 3 ? 40 : list.length <= 4 ? 34 : 28;
        const bodySize = list.length <= 3 ? 26 : list.length <= 4 ? 23 : 20;
        list.forEach((t, i) => {
          const y = 0.3 + i * step;
          cText(ctx, { x: 0.075, y, w: 0.08, h: step - 0.012 }, CN_NUM[i] ?? "\xB7", {
            size: numSize,
            color: ctx.theme.accent,
            font: ctx.theme.fontTitle,
            lineHeight: 1.1,
            valign: "middle"
          });
          cText(ctx, { x: 0.175, y, w: 0.65, h: step - 0.012 }, t, {
            size: bodySize,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.5,
            valign: "middle"
          });
          cLine(ctx, { x: 0.075, y: y + step - 8e-3, w: 0.75, h: 12e-4 }, ctx.theme.line);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        lanxianHead(ctx);
        cRect(ctx, { x: 0.075, y: 0.27, w: 0.38, h: 8e-3 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0.545, y: 0.27, w: 0.38, h: 8e-3 }, ctx.theme.accent, 0.22);
        const n2 = Math.max(left.length, right.length);
        const cmpSize = n2 <= 2 ? 32 : n2 <= 3 ? 28 : 24;
        cText(ctx, { x: 0.075, y: 0.3, w: 0.38, h: 0.5 }, left.join("\n"), {
          size: cmpSize,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.8
        });
        cText(ctx, { x: 0.545, y: 0.3, w: 0.38, h: 0.5 }, right.join("\n"), {
          size: cmpSize,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.8
        });
        cLine(ctx, { x: 0.52, y: 0.27, w: 12e-4, h: 0.47 }, ctx.theme.line);
      },
      end: (ctx) => {
        cLine(ctx, { x: 0.3, y: 0.31, w: 0.4, h: 18e-4 }, ctx.theme.accent, 0.6);
        cText(ctx, { x: 0.2, y: 0.34, w: 0.6, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          align: "center",
          valign: "middle",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.2, y: 0.53, w: 0.6, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "center"
        });
      },
      plain: (ctx) => {
        lanxianHead(ctx);
        if (heroBody(ctx)) {
          bodyBlock(ctx, besideArt(ctx, { x: 0.075, y: 0.3, w: 0.76, h: 0.44 }), 24, 1.7);
          return;
        }
        const list = ctx.items.slice(0, 10);
        const box = besideArt(ctx, { x: 0.075, y: 0.3, w: 0.76, h: 0.5 });
        const two = !ctx.art && list.length >= 4;
        const colW = two ? 0.4 : box.w;
        const perCol = two ? Math.ceil(list.length / 2) : list.length;
        const step = Math.min(0.24, 0.5 / Math.max(1, perCol));
        const bodySize = list.length <= 2 ? 30 : list.length <= 4 ? 24 : list.length <= 6 ? 21 : 18;
        list.forEach((t, i) => {
          const col = two ? Math.floor(i / perCol) : 0;
          const x = box.x + col * (colW + 0.05);
          const y = box.y + i % perCol * step;
          cText(ctx, { x, y, w: colW, h: step - 0.018 }, t, {
            size: bodySize,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.55
          });
          cLine(ctx, { x, y: y + step - 0.014, w: colW, h: 1e-3 }, ctx.theme.line);
        });
      }
    };
    liu = {
      cover: (ctx) => {
        coverLayout(ctx, "liu");
        const firstText = ctx.out.findIndex((p) => p.kind === "text");
        const at = firstText < 0 ? ctx.out.length : firstText;
        ctx.out.splice(at, 0, { kind: "rect", x: 0.04, y: 0.255, w: 0.92, h: 0.235, fill: ctx.theme.surface });
        cLine(ctx, { x: 0.04, y: 0.255, w: 0.92, h: 35e-4 }, ctx.theme.accent, 0.85);
        cLine(ctx, { x: 0.04, y: 0.878, w: 0.92, h: 15e-4 }, ctx.theme.accent, 0.75);
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cRect(ctx, { x: 0.08, y: 0.22, w: 4e-3, h: 0.44 }, ctx.theme.accent, 0.9);
        cText(ctx, { x: 0.13, y: 0.22, w: 0.76, h: 0.44 }, q, {
          size: quotePointSize(Array.from(q).length, "liu"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.95,
          valign: "middle"
        });
        cLine(ctx, { x: 0.13, y: 0.7, w: 0.75, h: 12e-4 }, ctx.theme.line);
        cText(ctx, { x: 0.5, y: 0.72, w: 0.38, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right",
          valign: "middle"
        });
      },
      words: (ctx) => {
        liuHead(ctx);
        const list = ctx.items.slice(0, 4);
        const step = 0.135;
        list.forEach((w, i) => {
          const y = 0.28 + i * step;
          cText(ctx, { x: 0.08, y: y + 0.03, w: 0.05, h: 0.04 }, String(i + 1).padStart(2, "0"), {
            size: 13,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody
          });
          cText(ctx, { x: 0.15, y, w: 0.6, h: 0.1 }, w, {
            size: 32,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
          cLine(ctx, { x: 0.08, y: y + 0.105, w: 0.84, h: 12e-4 }, ctx.theme.line);
        });
      },
      numbered: (ctx) => {
        liuHead(ctx);
        const list = takeNumbered(ctx);
        const step = Math.min(0.115, 0.46 / Math.max(1, list.length));
        const size = list.length <= 3 ? 26 : list.length <= 4 ? 23 : 20;
        list.forEach((t, i) => {
          const y = 0.27 + i * step;
          cRect(ctx, { x: 0.08, y: y + step / 2 - 8e-3, w: 0.016, h: 0.016 }, ctx.theme.accent, 0.9);
          cText(ctx, { x: 0.12, y, w: 0.72, h: step - 0.01 }, t, {
            size,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.5,
            valign: "middle"
          });
          cLine(ctx, { x: 0.08, y: y + step - 8e-3, w: 0.84, h: 12e-4 }, ctx.theme.line);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        liuHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 28 : n2 <= 3 ? 24 : 21;
        cRect(ctx, { x: 0.08, y: 0.26, w: 0.36, h: 6e-3 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0.56, y: 0.26, w: 0.36, h: 6e-3 }, ctx.theme.accent, 0.22);
        cText(ctx, { x: 0.09, y: 0.33, w: 0.34, h: 0.46 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.57, y: 0.33, w: 0.34, h: 0.46 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cLine(ctx, { x: 0.52, y: 0.26, w: 12e-4, h: 0.5 }, ctx.theme.line);
      },
      end: (ctx) => {
        cLine(ctx, { x: 0.08, y: 0.3, w: 0.84, h: 35e-4 }, ctx.theme.accent, 0.9);
        cText(ctx, { x: 0.08, y: 0.38, w: 0.78, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 38,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          valign: "middle",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.08, y: 0.56, w: 0.6, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        cLine(ctx, { x: 0.08, y: 0.66, w: 0.84, h: 12e-4 }, ctx.theme.line);
      },
      plain: (ctx) => {
        liuHead(ctx);
        const words = bodyOf(ctx).split("\n").filter(Boolean);
        const size = words.length <= 2 ? 30 : words.length <= 4 ? 24 : words.length <= 6 ? 20 : 17;
        const h = Math.min(0.5, 0.12 + words.length * size * 1.75 / 540);
        const box = besideArt(ctx, { x: 0.08, y: 0.3, w: 0.8, h });
        cRect(ctx, box, ctx.theme.surface);
        const hero = heroBody(ctx);
        cText(ctx, { x: box.x + 0.08, y: box.y + 0.02, w: box.w - 0.18, h: box.h - 0.04 }, bodyOf(ctx), {
          size: hero ? Math.round(size * 1.3) : size,
          color: ctx.theme.ink,
          font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
          bold: hero,
          lineHeight: 1.75,
          valign: "middle"
        });
      }
    };
    chang = {
      cover: (ctx) => {
        coverLayout(ctx, "chang");
        cRect(ctx, { x: 0.06, y: 0.845, w: 0.88, h: 0.012 }, ctx.theme.accent);
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        slice(ctx, { x: 0.1, y: 0.2, w: 0.78, h: 0.5 });
        cText(ctx, { x: 0.14, y: 0.28, w: 0.7, h: 0.36 }, q, {
          size: quotePointSize(Array.from(q).length, "chang"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9,
          valign: "middle"
        });
        cText(ctx, { x: 0.14, y: 0.74, w: 0.5, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        changHead(ctx);
        const list = ctx.items.slice(0, 4);
        list.forEach((w, i) => {
          const box = {
            x: 0.1 + i % 2 * 0.43,
            y: 0.3 + Math.floor(i / 2) * 0.2,
            w: 0.37,
            h: 0.16
          };
          slice(ctx, box);
          cText(ctx, { x: box.x + 0.04, y: box.y + 0.03, w: box.w - 0.08, h: box.h - 0.06 }, w, {
            size: 30,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
        });
      },
      numbered: (ctx) => {
        changHead(ctx);
        const list = takeNumbered(ctx);
        const gap = 0.018;
        const h = Math.min(0.17, (0.5 - gap * (list.length - 1)) / Math.max(1, list.length));
        list.forEach((t, i) => {
          const y = 0.28 + i * (h + gap);
          slice(ctx, { x: 0.1, y, w: 0.8, h });
          cText(ctx, { x: 0.14, y: y + 0.02, w: 0.05, h: h - 0.04 }, CN_NUM[i] ?? "\xB7", {
            size: 19,
            color: ctx.theme.accent,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
          cText(ctx, { x: 0.22, y: y + 0.02, w: 0.64, h: h - 0.04 }, t, {
            size: 21,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.5,
            valign: "middle"
          });
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        changHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 27 : n2 <= 3 ? 23 : 20;
        slice(ctx, { x: 0.08, y: 0.28, w: 0.4, h: 0.48 });
        slice(ctx, { x: 0.52, y: 0.28, w: 0.4, h: 0.48 });
        cText(ctx, { x: 0.12, y: 0.36, w: 0.34, h: 0.36 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.56, y: 0.36, w: 0.34, h: 0.36 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
      },
      end: (ctx) => {
        cText(ctx, { x: 0.24, y: 0.22, w: 0.5, h: 0.06 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        slice(ctx, { x: 0.18, y: 0.3, w: 0.6, h: 0.26 });
        cText(ctx, { x: 0.24, y: 0.36, w: 0.48, h: 0.15 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 34,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          valign: "middle",
          lineHeight: 1.35
        });
      },
      plain: (ctx) => {
        changHead(ctx);
        const words = bodyOf(ctx).split("\n").filter(Boolean);
        const size = words.length <= 2 ? 29 : words.length <= 4 ? 23 : words.length <= 6 ? 20 : 17;
        const h = Math.min(0.5, 0.12 + words.length * size * 1.7 / 540);
        const box = besideArt(ctx, { x: 0.1, y: 0.3, w: 0.8, h });
        slice(ctx, box);
        const hero = heroBody(ctx);
        cText(ctx, { x: box.x + 0.1, y: box.y + 0.02, w: box.w - 0.22, h: box.h - 0.04 }, bodyOf(ctx), {
          size: hero ? Math.round(size * 1.3) : size,
          color: ctx.theme.ink,
          font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
          bold: hero,
          lineHeight: 1.7,
          valign: "middle"
        });
      }
    };
    man = {
      cover: (ctx) => {
        coverLayout(ctx, "man");
        cLine(ctx, { x: 0.1, y: 0.055, w: 0.8, h: 8e-4 }, ctx.theme.accent, 0.6);
        cLine(ctx, { x: 0.1, y: 0.875, w: 0.8, h: 8e-4 }, ctx.theme.accent, 0.5);
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.08, y: 0.18, w: 0.8, h: 0.5 }, q, {
          size: quotePointSize(Array.from(q).length, "man"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 2,
          valign: "middle"
        });
        cLine(ctx, { x: 0.08, y: 0.7, w: 0.8, h: 8e-4 }, ctx.theme.accent, 0.6);
        cText(ctx, { x: 0.08, y: 0.72, w: 0.4, h: 0.06 }, ctx.note, {
          size: 13,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        manHead(ctx);
        ctx.items.slice(0, 4).forEach((w, i) => {
          const x = 0.08 + i * 0.21;
          cText(ctx, { x, y: 0.34, w: 0.2, h: 0.12 }, w, {
            size: 30,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
          cText(ctx, { x, y: 0.47, w: 0.2, h: 0.04 }, String(i + 1).padStart(2, "0"), {
            size: 12,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody
          });
        });
      },
      numbered: (ctx) => {
        manHead(ctx);
        const list = takeNumbered(ctx);
        const step = Math.min(0.105, 0.46 / Math.max(1, list.length));
        const size = list.length <= 3 ? 24 : list.length <= 4 ? 21 : 18;
        list.forEach((t, i) => {
          const y = 0.26 + i * step;
          cText(ctx, { x: 0.1, y, w: 0.05, h: step - 0.01 }, String(i + 1).padStart(2, "0"), {
            size: 12,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody,
            valign: "middle"
          });
          cText(ctx, { x: 0.16, y, w: 0.74, h: step - 0.01 }, t, {
            size,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.6,
            valign: "middle"
          });
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        manHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 26 : n2 <= 3 ? 22 : 19;
        cText(ctx, { x: 0.15, y: 0.38, w: 0.34, h: 0.34 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.59, y: 0.38, w: 0.34, h: 0.34 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
      },
      end: (ctx) => {
        cText(ctx, { x: 0.14, y: 0.36, w: 0.74, h: 0.14 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          valign: "middle",
          lineHeight: 1.35
        });
        cText(ctx, { x: 0.14, y: 0.56, w: 0.55, h: 0.07 }, ctx.note, {
          size: 18,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        manHead(ctx);
        cLine(ctx, { x: 0.1, y: 0.34, w: 0.8, h: 8e-4 }, ctx.theme.accent, 0.55);
        const hero = heroBody(ctx);
        const rows = bodyOf(ctx).split("\n").filter(Boolean).length;
        const size = rows <= 2 ? 28 : rows <= 4 ? 22 : rows <= 6 ? 19 : 17;
        const lh = rows <= 4 ? 1.85 : rows <= 6 ? 1.75 : 1.6;
        const box = besideArt(ctx, { x: 0.12, y: 0.38, w: 0.74, h: 0.44 });
        cText(ctx, box, bodyOf(ctx), {
          size,
          color: ctx.theme.ink,
          font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
          lineHeight: lh,
          valign: hero ? "middle" : "top"
        });
      }
    };
    ka = {
      cover: (ctx) => {
        coverLayout(ctx, "ka");
        const i = ctx.out.findIndex((p) => p.kind === "text");
        if (i >= 0) {
          const t = ctx.out[i];
          const pad = 0.022;
          const h = Math.min(t.h, (t.size ?? 62) / 540 * 1.15 + pad * 2);
          const x = Math.max(0, t.x - pad);
          const y = Math.max(0, t.y + (t.h - h) / 2);
          const n2 = Math.max(1, Array.from(clean(ctx.title)).length);
          const tw = Math.min(t.w, n2 * (t.size ?? 62) / 960 + pad * 2);
          const w = Math.min(tw, 1 - x);
          ctx.out.splice(i, 0, { kind: "rect", x, y, w, h: Math.min(h, 1 - y), fill: ctx.theme.accent });
          t.color = ctx.theme.paper;
        }
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        kaCard(ctx, { x: 0.08, y: 0.2, w: 0.82, h: 0.5 });
        cText(ctx, { x: 0.18, y: 0.26, w: 0.68, h: 0.38 }, q, {
          size: quotePointSize(Array.from(q).length, "ka"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9,
          valign: "middle"
        });
        cText(ctx, { x: 0.18, y: 0.64, w: 0.5, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        kaHead(ctx);
        ctx.items.slice(0, 4).forEach((w, i) => {
          const x = 0.08 + i * 0.21;
          cRect(ctx, { x, y: 0.3, w: 0.19, h: 0.024 }, ctx.theme.accent, 0.92);
          cText(ctx, { x, y: 0.36, w: 0.19, h: 0.12 }, w, {
            size: 26,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            bold: true,
            lineHeight: 1.3
          });
        });
      },
      numbered: (ctx) => {
        kaHead(ctx);
        const list = takeNumbered(ctx);
        const rows = list.length <= 4 ? 2 : 3;
        const h = rows === 2 ? 0.17 : 0.13;
        const gap = 0.02;
        list.forEach((t, i) => {
          const box = {
            x: 0.08 + i % 2 * 0.44,
            y: 0.3 + Math.floor(i / 2) * (h + gap),
            w: 0.4,
            h
          };
          kaCard(ctx, box);
          cText(ctx, { x: box.x + 0.04, y: box.y + 0.03, w: box.w - 0.08, h: box.h - 0.05 }, t, {
            size: rows === 2 ? 22 : 19,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.45,
            valign: "middle"
          });
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        kaHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 26 : n2 <= 3 ? 22 : 19;
        kaCard(ctx, { x: 0.08, y: 0.28, w: 0.4, h: 0.46 });
        kaCard(ctx, { x: 0.52, y: 0.28, w: 0.4, h: 0.46 });
        cText(ctx, { x: 0.12, y: 0.42, w: 0.32, h: 0.28 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.56, y: 0.42, w: 0.32, h: 0.28 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
      },
      end: (ctx) => {
        cRect(ctx, { x: 0.16, y: 0.27, w: 0.68, h: 0.19 }, ctx.theme.accent);
        cText(ctx, { x: 0.2, y: 0.31, w: 0.6, h: 0.1 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 38,
          color: ctx.theme.paper,
          font: ctx.theme.fontTitle,
          bold: true,
          valign: "middle",
          lineHeight: 1.3
        });
        cText(ctx, { x: 0.2, y: 0.52, w: 0.55, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        kaHead(ctx);
        const box = besideArt(ctx, { x: 0.08, y: 0.32, w: 0.84, h: 0.46 });
        const list = ctx.items;
        if (list.length >= 4) {
          const [a, b] = splitEven(list);
          cText(ctx, { x: box.x, y: box.y, w: box.w / 2 - 0.03, h: box.h }, a.join("\n"), {
            size: 20,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.7
          });
          cText(ctx, { x: box.x + box.w / 2 + 0.02, y: box.y, w: box.w / 2 - 0.03, h: box.h }, b.join("\n"), {
            size: 20,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.7
          });
          return;
        }
        const hero = heroBody(ctx);
        cText(ctx, { x: box.x + 0.08, y: 0.36, w: box.w - 0.08, h: 0.4 }, bodyOf(ctx), {
          size: hero ? 32 : 22,
          color: ctx.theme.ink,
          font: hero ? ctx.theme.fontTitle : ctx.theme.fontBody,
          lineHeight: 1.8,
          valign: hero ? "middle" : "top"
        });
      }
    };
    BN_LEFT = { x: 0, y: 0.25, w: 0.25, h: 0.75 };
    BN_BAND = { x: 0, y: 0.625, w: 1, h: 0.25 };
    BN_DATE = { x: 0.75, y: 0, w: 0.25, h: 0.375 };
    shuangnian = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        cRect(ctx, BN_LEFT, ctx.theme.surface, art ? 0.92 : 1);
        cRect(ctx, BN_BAND, ctx.theme.surface, art ? 0.85 : 0.55);
        cRect(ctx, BN_DATE, ctx.theme.surface, art ? 0.92 : 0.7);
        const n2 = Array.from(ctx.title).length;
        cText(ctx, { x: 0.037, y: 0.28, w: 0.6, h: 0.34 }, ctx.title, {
          size: coverPt(n2, [108, 88, 64, 46]),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          lineHeight: 1.06,
          valign: "middle"
        });
        cText(ctx, { x: 0.77, y: 0.05, w: 0.2, h: 0.28 }, ctx.slide.meta ?? "", {
          size: 20,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "right",
          valign: "middle",
          lineHeight: 1.3
        });
        cText(ctx, { x: 0.037, y: 0.83, w: 0.5, h: 0.05 }, ctx.note || ctx.line, {
          size: 12,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.35
        });
        bnFoot(ctx);
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        bnHead(ctx);
        cText(ctx, { x: 0.09, y: 0.24, w: 0.82, h: 0.42 }, q, {
          size: quotePointSize(Array.from(q).length, "shuangnian"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.7,
          valign: "middle"
        });
        cText(ctx, { x: 0.09, y: 0.72, w: 0.5, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        bnBar(ctx, { x: 0.09, y: 0.8, w: 0.4, h: 0.03 }, true);
      },
      words: (ctx) => {
        bnHead(ctx);
        const last = Math.min(3, ctx.items.length - 1);
        ctx.items.slice(0, 4).forEach((w, i) => {
          const y = 0.26 + i * 0.13;
          const bw = 0.3 + i * 0.09;
          cText(ctx, { x: 0.037, y, w: 0.24, h: 0.05 }, w, {
            size: 28,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            bold: true,
            valign: "middle"
          });
          bnBar(ctx, { x: 0.3, y: y + 8e-3, w: bw, h: 0.034 }, i === last);
          cText(ctx, { x: 0.3 + bw + 0.015, y, w: 0.06, h: 0.05 }, String(i + 1).padStart(2, "0"), {
            size: 12,
            color: ctx.theme.muted,
            font: ctx.theme.fontBody,
            valign: "middle"
          });
        });
      },
      numbered: (ctx) => {
        bnHead(ctx);
        const list = takeNumbered(ctx);
        const n2 = list.length;
        const step = Math.min(0.095, 0.52 / Math.max(1, n2));
        list.forEach((t, i) => {
          const y = 0.24 + i * step;
          cText(ctx, { x: 0.037, y, w: 0.05, h: step - 0.012 }, String(i + 1).padStart(2, "0"), {
            size: 12,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody,
            valign: "middle"
          });
          cText(ctx, { x: 0.095, y, w: 0.365, h: step - 0.012 }, t, {
            size: n2 <= 3 ? 22 : 18,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.4,
            valign: "middle"
          });
          cLine(ctx, { x: 0.037, y: y + step - 0.014, w: 0.423, h: 12e-4 }, ctx.theme.line);
          const bw = 0.15 + i * 0.04;
          bnBar(ctx, { x: 0.52, y: y + (step - 0.03) / 2, w: bw, h: 0.03 }, i === n2 - 1);
          cText(ctx, { x: 0.52 + bw + 0.012, y, w: 0.05, h: step - 0.012 }, String(i + 1).padStart(2, "0"), {
            size: 11,
            color: ctx.theme.muted,
            font: ctx.theme.fontBody,
            valign: "middle"
          });
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        const n2 = Array.from(ctx.title).length;
        cText(ctx, { x: 0.037, y: 0.055, w: 0.62, h: 0.085 }, ctx.title, {
          size: n2 <= 10 ? 28 : n2 <= 16 ? 23 : 19,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          lineHeight: 1.15,
          valign: "middle"
        });
        cLine(ctx, { x: 0.037, y: 0.152, w: 0.926, h: 18e-4 }, ctx.theme.ink, 0.85);
        const m = Math.max(left.length, right.length);
        const size = m <= 2 ? 26 : m <= 3 ? 22 : 19;
        cRect(ctx, { x: 0.037, y: 0.22, w: 0.18, h: 0.012 }, ctx.theme.ink, 0.9);
        cRect(ctx, { x: 0.52, y: 0.22, w: 0.18, h: 0.012 }, ctx.theme.surface, 1);
        cText(ctx, { x: 0.037, y: 0.28, w: 0.42, h: 0.44 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.85
        });
        cText(ctx, { x: 0.52, y: 0.28, w: 0.42, h: 0.44 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.85
        });
        cLine(ctx, { x: 0.4975, y: 0.26, w: 15e-4, h: 0.48 }, ctx.theme.line);
      },
      end: (ctx) => {
        cRect(ctx, { x: 0, y: 0.55, w: 1, h: 0.3 }, ctx.theme.surface, 0.92);
        bnHead(ctx);
        cText(ctx, { x: 0.09, y: 0.58, w: 0.82, h: 0.22 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 44,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          valign: "middle",
          lineHeight: 1.2
        });
        cText(ctx, { x: 0.09, y: 0.82, w: 0.6, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        bnHead(ctx);
        bodyBlock(ctx, besideArt(ctx, { x: 0.037, y: 0.24, w: 0.88, h: 0.46 }), 22, 1.8);
        cRect(ctx, { x: 0.037, y: 0.74, w: 0.25, h: 0.03 }, ctx.theme.surface, 0.9);
      }
    };
    gulan = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        const n2 = Array.from(ctx.title).length;
        cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 4e-3 }, ctx.theme.accent, 0.9);
        cText(ctx, { x: 0.035, y: 0.1, w: 0.8, h: 0.24 }, ctx.title, {
          size: coverPt(n2, [96, 80, 60, 44]),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.1,
          valign: "middle"
        });
        cText(ctx, { x: 0.6, y: 0.36, w: 0.365, h: 0.04 }, ctx.slide.meta ?? "", {
          size: 11,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          align: "right"
        });
        cLine(ctx, { x: 0.035, y: 0.4, w: 0.93, h: 18e-4 }, ctx.theme.accent, 0.6);
        cText(ctx, { x: 0.035, y: 0.46, w: 0.6, h: 0.06 }, ctx.note || ctx.line, {
          size: 16,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody,
          lineHeight: 1.4
        });
        for (let r = 0; r < 3; r += 1) {
          for (let c = 0; c < 2; c += 1) {
            cLine(ctx, { x: 0.035 + c * 0.48, y: 0.55 + r * 0.17, w: 0.45, h: 12e-4 }, ctx.theme.accent, 0.25);
          }
        }
        gulanFoot(ctx);
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        gulanHead(ctx);
        cText(ctx, { x: 0.035, y: 0.24, w: 0.8, h: 0.46 }, q, {
          size: quotePointSize(Array.from(q).length, "gulan"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.75,
          valign: "middle"
        });
        cText(ctx, { x: 0.035, y: 0.76, w: 0.6, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        gulanFoot(ctx);
      },
      words: (ctx) => {
        gulanHead(ctx);
        ctx.items.slice(0, 4).forEach((w, i) => {
          const x = i % 2 === 0 ? 0.035 : 0.515;
          const y = 0.26 + Math.floor(i / 2) * 0.26;
          cLine(ctx, { x, y, w: 0.45, h: 15e-4 }, ctx.theme.accent, 0.4);
          cText(ctx, { x, y: y + 0.015, w: 0.05, h: 0.04 }, `${String(i + 1).padStart(2, "0")}.`, {
            size: 11,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody
          });
          cText(ctx, { x: x + 0.055, y: y + 0.01, w: 0.38, h: 0.12 }, w, {
            size: tilePt(w, 32, 0.12),
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            bold: true,
            valign: "middle"
          });
        });
        gulanFoot(ctx);
      },
      numbered: (ctx) => {
        gulanHead(ctx);
        const list = takeNumbered(ctx);
        const rows = Math.max(1, Math.ceil(list.length / 2));
        const step = 0.6 / rows;
        list.forEach((t, i) => {
          const x = i % 2 === 0 ? 0.035 : 0.515;
          const y = 0.24 + Math.floor(i / 2) * step;
          cLine(ctx, { x, y, w: 0.45, h: 15e-4 }, ctx.theme.accent, 0.4);
          cText(ctx, { x, y: y + 0.012, w: 0.05, h: 0.04 }, `${String(i + 1).padStart(2, "0")}.`, {
            size: 11,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody
          });
          cText(ctx, { x: x + 0.055, y: y + 8e-3, w: 0.385, h: step - 0.03 }, t, {
            size: tilePt(t, list.length <= 3 ? 22 : 18, step - 0.03),
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.4,
            valign: "middle"
          });
        });
        gulanFoot(ctx);
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        const n2 = Array.from(ctx.title).length;
        cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 4e-3 }, ctx.theme.accent, 0.9);
        cText(ctx, { x: 0.035, y: 0.06, w: 0.7, h: 0.12 }, ctx.title, {
          size: n2 <= 10 ? 34 : n2 <= 16 ? 27 : 22,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.15,
          valign: "middle"
        });
        cLine(ctx, { x: 0.035, y: 0.19, w: 0.93, h: 18e-4 }, ctx.theme.accent, 0.6);
        const m = Math.max(left.length, right.length);
        const size = m <= 2 ? 26 : m <= 3 ? 22 : 19;
        cLine(ctx, { x: 0.035, y: 0.245, w: 0.43, h: 38e-4 }, ctx.theme.accent, 0.9);
        cLine(ctx, { x: 0.515, y: 0.245, w: 0.43, h: 38e-4 }, ctx.theme.accent, 0.35);
        cText(ctx, { x: 0.035, y: 0.3, w: 0.43, h: 0.44 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.85
        });
        cText(ctx, { x: 0.515, y: 0.3, w: 0.43, h: 0.44 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.85
        });
        cLine(ctx, { x: 0.4975, y: 0.26, w: 15e-4, h: 0.48 }, ctx.theme.accent, 0.3);
        gulanFoot(ctx);
      },
      end: (ctx) => {
        cLine(ctx, { x: 0.035, y: 0.025, w: 0.93, h: 4e-3 }, ctx.theme.accent, 0.9);
        cText(ctx, { x: 0.035, y: 0.06, w: 0.7, h: 0.09 }, ctx.title, {
          size: 26,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          valign: "middle"
        });
        cText(ctx, { x: 0.035, y: 0.32, w: 0.85, h: 0.22 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 46,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          valign: "middle",
          lineHeight: 1.25
        });
        cText(ctx, { x: 0.035, y: 0.6, w: 0.6, h: 0.06 }, ctx.note, {
          size: 15,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        gulanFoot(ctx);
      },
      plain: (ctx) => {
        gulanHead(ctx);
        bodyBlock(ctx, besideArt(ctx, { x: 0.035, y: 0.24, w: 0.88, h: 0.5 }), 24, 1.8);
        cLine(ctx, { x: 0.035, y: 0.78, w: 0.45, h: 15e-4 }, ctx.theme.accent, 0.3);
        gulanFoot(ctx);
      }
    };
    shangwu = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        slantBand(ctx, 0, 1, 0.6, 0.74, ctx.theme.surface, art ? 0.82 : 0.92);
        const n2 = Array.from(ctx.title).length;
        cRect(ctx, { x: 0.075, y: 0.335, w: 0.05, h: 7e-3 }, ctx.theme.accent, 0.95);
        cText(ctx, { x: 0.075, y: 0.37, w: 0.42, h: 0.2 }, ctx.title, {
          size: coverPt(n2, [66, 52, 37, 30]),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          lineHeight: 1.16,
          valign: "middle"
        });
        cText(ctx, { x: 0.3, y: 0.53, w: 0.26, h: 0.1 }, ctx.note || ctx.line, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody,
          lineHeight: 1.45
        });
        cText(ctx, { x: 0.075, y: 0.645, w: 0.4, h: 0.05 }, ctx.slide.meta ?? "", {
          size: 10,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        for (let k = 0; k < 3; k += 1) {
          cEllipse(ctx, { x: 0.845 + k * 0.019, y: 0.86, w: 0.01, h: 0.018 }, ctx.theme.accent, 0.75);
        }
        cEllipse(ctx, { x: 0.918, y: 0.852, w: 0.03, h: 0.053 }, ctx.theme.accent, 0.12);
      },
      quote: (ctx) => {
        shangwuPanel(ctx);
        const q = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.075, y: 0.2, w: 0.58, h: 0.46 }, q, {
          size: quotePointSize(Array.from(q).length, "shangwu"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.8,
          valign: "middle"
        });
        cText(ctx, { x: 0.075, y: 0.72, w: 0.5, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        shangwuPanel(ctx);
        shangwuHead(ctx);
        ctx.items.slice(0, 4).forEach((w, i) => {
          const y = 0.3 + i * 0.14;
          cText(ctx, { x: 0.1, y, w: 0.56, h: 0.1 }, w, {
            size: 32,
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            bold: true,
            valign: "middle"
          });
          cLine(ctx, { x: 0.1, y: y + 0.115, w: 0.56, h: 1e-3 }, ctx.theme.line);
        });
      },
      numbered: (ctx) => {
        shangwuPanel(ctx);
        shangwuHead(ctx);
        const list = takeNumbered(ctx);
        const step = Math.min(0.1, 0.46 / Math.max(1, list.length));
        list.forEach((t, i) => {
          const y = 0.28 + i * step;
          cText(ctx, { x: 0.075, y, w: 0.06, h: step - 0.012 }, String(i + 1).padStart(2, "0"), {
            size: 12,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody,
            valign: "middle"
          });
          cText(ctx, { x: 0.15, y, w: 0.56, h: step - 0.012 }, t, {
            size: list.length <= 3 ? 24 : 20,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.45,
            valign: "middle"
          });
          cLine(ctx, { x: 0.075, y: y + step - 0.018, w: 0.63, h: 1e-3 }, ctx.theme.line, 0.9);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        shangwuPanel(ctx);
        shangwuHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 25 : n2 <= 3 ? 21 : 18;
        cRect(ctx, { x: 0.075, y: 0.26, w: 0.32, h: 8e-3 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0.43, y: 0.26, w: 0.32, h: 8e-3 }, ctx.theme.accent, 0.3);
        cText(ctx, { x: 0.075, y: 0.32, w: 0.32, h: 0.42 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.43, y: 0.32, w: 0.32, h: 0.42 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
      },
      end: (ctx) => {
        shangwuPanel(ctx);
        cText(ctx, { x: 0.28, y: 0.3, w: 0.46, h: 0.16 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 38,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          valign: "middle",
          lineHeight: 1.3
        });
        cText(ctx, { x: 0.28, y: 0.54, w: 0.42, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        shangwuPanel(ctx);
        shangwuHead(ctx);
        bodyBlock(ctx, besideArt(ctx, { x: 0.075, y: 0.27, w: 0.64, h: 0.5 }), 23, 1.8);
      }
    };
    sanse = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        const n2 = Array.from(ctx.title).length;
        for (let k = 0; k < 5; k += 1) {
          cRect(
            ctx,
            { x: 0.042 + k * 0.08, y: 0.07, w: 0.068, h: 0.03 },
            k % 2 === 0 ? ctx.theme.accent : ctx.theme.surface,
            1
          );
        }
        cText(ctx, { x: 0.716, y: 0.068, w: 0.24, h: 0.04 }, ctx.slide.meta ?? "", {
          size: 13,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          align: "right"
        });
        cRect(ctx, { x: 0, y: 0.46, w: 0.94, h: 0.36 }, ctx.theme.surface, art ? 0.94 : 1);
        cText(ctx, { x: 0.055, y: 0.47, w: 0.83, h: 0.34 }, ctx.title, {
          size: coverPt(n2, [84, 68, 50, 38]),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          lineHeight: 1.16,
          valign: "middle"
        });
        cText(ctx, { x: 0.34, y: 0.845, w: 0.3, h: 0.05 }, ctx.note || ctx.line, {
          size: 15,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody
        });
        for (let k = 0; k < 3; k += 1) {
          cRect(ctx, { x: 0.845 + k * 0.038, y: 0.16, w: 0.026, h: 0.026 }, ctx.theme.accent, 1);
        }
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cRect(ctx, { x: 0.042, y: 0.1, w: 0.916, h: 0.76 }, ctx.theme.surface, 1);
        cRect(ctx, { x: 0.042, y: 0.1, w: 0.016, h: 0.76 }, ctx.theme.accent, 1);
        cText(ctx, { x: 0.09, y: 0.18, w: 0.82, h: 0.56 }, q, {
          size: quotePointSize(Array.from(q).length, "sanse"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9,
          valign: "middle"
        });
        cText(ctx, { x: 0.09, y: 0.775, w: 0.6, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.accent,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        sanseHead(ctx);
        sanseGrid(ctx, ctx.items.slice(0, 4), 0.28, 0.78, 30);
      },
      numbered: (ctx) => {
        sanseHead(ctx);
        sanseGrid(ctx, takeNumbered(ctx), 0.28, 0.8, 20);
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        sanseHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 25 : n2 <= 3 ? 21 : 18;
        cRect(ctx, { x: 0.042, y: 0.27, w: 0.44, h: 0.53 }, ctx.theme.surface, 1);
        cRect(ctx, { x: 0.518, y: 0.27, w: 0.44, h: 0.53 }, ctx.theme.accent, 1);
        cText(ctx, { x: 0.075, y: 0.33, w: 0.37, h: 0.41 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.8
        });
        cText(ctx, { x: 0.551, y: 0.33, w: 0.37, h: 0.41 }, right.join("\n"), {
          size,
          color: ctx.theme.surface,
          font: ctx.theme.fontBody,
          lineHeight: 1.8
        });
      },
      end: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 0.5, h: 0.86 }, ctx.theme.accent, 1);
        cRect(ctx, { x: 0.5, y: 0, w: 0.5, h: 0.86 }, ctx.theme.surface, 1);
        cText(ctx, { x: 0.06, y: 0.18, w: 0.38, h: 0.5 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 38,
          color: ctx.theme.surface,
          font: ctx.theme.fontTitle,
          bold: true,
          valign: "middle",
          lineHeight: 1.3
        });
        cText(ctx, { x: 0.56, y: 0.24, w: 0.38, h: 0.38 }, ctx.note, {
          size: 18,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.7,
          valign: "middle"
        });
      },
      plain: (ctx) => {
        sanseHead(ctx);
        const card = besideArt(ctx, { x: 0.042, y: 0.27, w: 0.916, h: 0.53 });
        cRect(ctx, card, ctx.theme.surface, 1);
        bodyBlock(ctx, { x: card.x + 0.04, y: card.y + 0.035, w: card.w - 0.08, h: card.h - 0.07 }, 22, 1.7);
      }
    };
    LINDI_PLATE = { x: 0.53, y: 0.13, w: 0.4, h: 0.68 };
    lindi = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        cRect(ctx, { x: 0, y: 0, w: 1, h: 1 }, ctx.theme.ink, art ? 0.7 : 1);
        const n2 = Array.from(ctx.title).length;
        cText(ctx, { x: 0.075, y: 0.075, w: 0.5, h: 0.04 }, ctx.slide.meta ?? "", {
          size: 12,
          color: ctx.theme.paper,
          font: ctx.theme.fontBody
        });
        cText(ctx, { x: 0.075, y: 0.36, w: 0.74, h: 0.34 }, ctx.title, {
          size: coverPt(n2, [72, 60, 46, 36]),
          color: ctx.theme.paper,
          font: ctx.theme.fontTitle,
          lineHeight: 1.2,
          valign: "middle"
        });
        cLine(ctx, { x: 0.078, y: 0.732, w: 0.14, h: 25e-4 }, ctx.theme.accent, 1);
        cText(ctx, { x: 0.38, y: 0.755, w: 0.3, h: 0.05 }, ctx.note || ctx.line, {
          size: 15,
          color: ctx.theme.paper,
          font: ctx.theme.fontBody
        });
        cText(ctx, { x: 0.6, y: 0.79, w: 0.34, h: 0.13 }, "01", {
          size: 64,
          color: ctx.theme.accent,
          font: ctx.theme.fontTitle,
          align: "right",
          valign: "middle",
          lineHeight: 1
        });
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cText(ctx, { x: 0.1, y: 0.2, w: 0.38, h: 0.44 }, q, {
          size: quotePointSize(Array.from(q).length, "lindi"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 2,
          valign: "middle"
        });
        cText(ctx, { x: 0.1, y: 0.7, w: 0.36, h: 0.06 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        lindiPlate(ctx);
      },
      words: (ctx) => {
        lindiHead(ctx);
        ctx.items.slice(0, 4).forEach((w, i) => {
          const y = 0.34 + i * 0.115;
          cText(ctx, { x: 0.1, y, w: 0.38, h: 0.1 }, w, {
            size: n0(32, 26, w),
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
          cLine(ctx, { x: 0.1, y: y + 0.105, w: 0.34, h: 12e-4 }, ctx.theme.line);
        });
        lindiPlate(ctx);
      },
      numbered: (ctx) => {
        lindiHead(ctx);
        const list = takeNumbered(ctx);
        const step = Math.min(0.085, 0.44 / Math.max(1, list.length));
        list.forEach((t, i) => {
          const y = 0.34 + i * step;
          cText(ctx, { x: 0.1, y, w: 0.06, h: step - 0.01 }, String(i + 1).padStart(2, "0"), {
            size: 11,
            color: ctx.theme.accent,
            font: ctx.theme.fontBody,
            valign: "middle"
          });
          cText(ctx, { x: 0.165, y, w: 0.32, h: step - 0.01 }, t, {
            size: list.length <= 3 ? 22 : list.length <= 4 ? 20 : 17,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.45,
            valign: "middle"
          });
        });
        lindiPlate(ctx);
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        lindiHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 26 : n2 <= 3 ? 22 : 19;
        cRect(ctx, { x: 0.1, y: 0.33, w: 0.38, h: 0.44 }, ctx.theme.surface, 0.55);
        cText(ctx, { x: 0.13, y: 0.37, w: 0.32, h: 0.36 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.85
        });
        cText(ctx, { x: 0.56, y: 0.37, w: 0.34, h: 0.36 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.85
        });
        cLine(ctx, { x: 0.53, y: 0.3, w: 15e-4, h: 0.5 }, ctx.theme.accent, 0.7);
      },
      end: (ctx) => {
        cRect(ctx, { x: 0, y: 0.62, w: 1, h: 0.38 }, ctx.theme.ink, 1);
        cText(ctx, { x: 0.1, y: 0.2, w: 0.72, h: 0.3 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.3,
          valign: "middle"
        });
        cText(ctx, { x: 0.1, y: 0.7, w: 0.6, h: 0.08 }, ctx.note, {
          size: 16,
          color: ctx.theme.paper,
          font: ctx.theme.fontBody,
          valign: "middle"
        });
      },
      plain: (ctx) => {
        lindiHead(ctx);
        bodyBlock(ctx, { x: 0.1, y: 0.33, w: 0.38, h: 0.44 }, 22, 1.75);
        lindiPlate(ctx);
      }
    };
    changyan = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        const n2 = Array.from(ctx.title).length;
        cText(ctx, { x: 0.062, y: 0.075, w: 0.5, h: 0.04 }, ctx.slide.meta ?? "", {
          size: 12,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        cText(ctx, { x: 0.06, y: 0.26, w: 0.66, h: 0.36 }, ctx.title, {
          size: coverPt(n2, [76, 70, 46, 36]),
          color: ctx.theme.accent,
          font: ctx.theme.fontTitle,
          bold: true,
          lineHeight: 1.14,
          valign: "middle"
        });
        cLine(ctx, { x: 0.062, y: 0.655, w: 0.46, h: 28e-4 }, ctx.theme.accent, 0.9);
        cText(ctx, { x: 0.42, y: 0.672, w: 0.3, h: 0.06 }, ctx.note || ctx.line, {
          size: 15,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody
        });
        cText(ctx, { x: 0.68, y: 0.1, w: 0.28, h: 0.24 }, "01", {
          size: 92,
          color: ctx.theme.accent,
          font: ctx.theme.fontTitle,
          align: "right",
          lineHeight: 1
        });
        for (let k = 0; k < 3; k += 1) {
          cLine(ctx, { x: 0.042 + k * 0.312, y: 0.9, w: 0.28, h: 24e-4 }, ctx.theme.accent, 0.5);
        }
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        const card = { x: 0.042, y: 0.12, w: 0.916, h: 0.66 };
        changyanCard(ctx, card);
        changyanNo(ctx, card, 0);
        cText(ctx, { x: 0.09, y: 0.19, w: 0.82, h: 0.5 }, q, {
          size: quotePointSize(Array.from(q).length, "changyan"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9,
          valign: "middle"
        });
        cText(ctx, { x: 0.09, y: 0.8, w: 0.6, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        changyanHead(ctx);
        const list = ctx.items.slice(0, 4);
        const gap = 0.03;
        const cw = (0.916 - gap * (list.length - 1)) / Math.max(1, list.length);
        list.forEach((w, i) => {
          const box = { x: 0.042 + i * (cw + gap), y: 0.3, w: cw, h: 0.32 };
          changyanCard(ctx, box);
          changyanNo(ctx, box, i);
          cText(ctx, { x: box.x + 0.024, y: box.y + 0.07, w: box.w - 0.048, h: box.h - 0.1 }, w, {
            size: n0(30, 22, w),
            color: ctx.theme.ink,
            font: ctx.theme.fontTitle,
            valign: "middle"
          });
        });
      },
      numbered: (ctx) => {
        changyanHead(ctx);
        changyanGrid(ctx, takeNumbered(ctx), 0.3, 0.82, 18);
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        changyanHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 24 : n2 <= 3 ? 21 : 18;
        const lc = { x: 0.042, y: 0.28, w: 0.44, h: 0.52 };
        const rc = { x: 0.518, y: 0.28, w: 0.44, h: 0.52 };
        changyanCard(ctx, lc);
        changyanCard(ctx, rc);
        changyanNo(ctx, lc, 0);
        changyanNo(ctx, rc, 1);
        cText(ctx, { x: lc.x + 0.03, y: lc.y + 0.075, w: lc.w - 0.06, h: lc.h - 0.11 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.75
        });
        cText(ctx, { x: rc.x + 0.03, y: rc.y + 0.075, w: rc.w - 0.06, h: rc.h - 0.11 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.75
        });
      },
      end: (ctx) => {
        const card = { x: 0.14, y: 0.22, w: 0.72, h: 0.36 };
        changyanCard(ctx, card);
        cText(ctx, { x: 0.18, y: 0.27, w: 0.64, h: 0.26 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 36,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          valign: "middle",
          lineHeight: 1.3
        });
        cText(ctx, { x: 0.18, y: 0.64, w: 0.6, h: 0.06 }, ctx.note, {
          size: 16,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        changyanHead(ctx);
        const box = besideArt(ctx, { x: 0.042, y: 0.28, w: 0.916, h: 0.52 });
        changyanCard(ctx, box);
        changyanNo(ctx, box, 0);
        bodyBlock(ctx, { x: box.x + 0.04, y: box.y + 0.09, w: box.w - 0.08, h: box.h - 0.13 }, 22, 1.75);
      }
    };
    danse = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        const n2 = Array.from(ctx.title).length;
        if (art) cRect(ctx, { x: 0, y: 0, w: 1, h: 1 }, ctx.theme.paper, 0.86);
        cLine(ctx, { x: 0.06, y: 0.075, w: 0.88, h: 12e-4 }, ctx.theme.ink, 0.9);
        cText(ctx, { x: 0.06, y: 0.09, w: 0.6, h: 0.04 }, ctx.slide.meta ?? "", {
          size: 11,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        cText(ctx, { x: 0.06, y: 0.22, w: 0.88, h: 0.44 }, ctx.title, {
          size: coverPt(n2, [78, 72, 52, 40]),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.08,
          valign: "middle"
        });
        cLine(ctx, { x: 0.06, y: 0.7, w: 0.88, h: 12e-4 }, ctx.theme.ink, 0.9);
        cText(ctx, { x: 0.46, y: 0.72, w: 0.3, h: 0.06 }, ctx.note || ctx.line, {
          size: 15,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        for (let k = 0; k < 3; k += 1) {
          cEllipse(ctx, { x: 0.856 + k * 0.03, y: 0.848, w: 0.014, h: 0.014 }, ctx.theme.ink, 0.85);
        }
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cLine(ctx, { x: 0.1, y: 0.16, w: 0.8, h: 12e-4 }, ctx.theme.ink, 0.8);
        cText(ctx, { x: 0.1, y: 0.2, w: 0.8, h: 0.5 }, q, {
          size: quotePointSize(Array.from(q).length, "danse"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.95,
          valign: "middle"
        });
        cLine(ctx, { x: 0.1, y: 0.75, w: 0.8, h: 12e-4 }, ctx.theme.ink, 0.8);
        cText(ctx, { x: 0.1, y: 0.78, w: 0.4, h: 0.05 }, ctx.note, {
          size: 13,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      words: (ctx) => {
        danseHead(ctx);
        danseGrid(ctx, ctx.items.slice(0, 4), 0.3, 0.78, 30);
      },
      numbered: (ctx) => {
        danseHead(ctx);
        danseGrid(ctx, takeNumbered(ctx), 0.3, 0.8, 19);
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        danseHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 25 : n2 <= 3 ? 21 : 18;
        cLine(ctx, { x: 0.1, y: 0.3, w: 0.8, h: 12e-4 }, ctx.theme.ink, 0.7);
        cText(ctx, { x: 0.13, y: 0.34, w: 0.36, h: 0.42 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.57, y: 0.34, w: 0.36, h: 0.42 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cLine(ctx, { x: 0.535, y: 0.3, w: 8e-4, h: 0.46 }, ctx.theme.accent, 0.5);
      },
      end: (ctx) => {
        cLine(ctx, { x: 0.15, y: 0.34, w: 0.7, h: 12e-4 }, ctx.theme.ink, 0.8);
        cText(ctx, { x: 0.15, y: 0.38, w: 0.7, h: 0.18 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          valign: "middle",
          lineHeight: 1.28
        });
        cText(ctx, { x: 0.15, y: 0.6, w: 0.5, h: 0.07 }, ctx.note, {
          size: SIZES.small,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        cLine(ctx, { x: 0.15, y: 0.7, w: 0.7, h: 12e-4 }, ctx.theme.ink, 0.5);
      },
      plain: (ctx) => {
        danseHead(ctx);
        bodyBlock(ctx, besideArt(ctx, { x: 0.1, y: 0.3, w: 0.8, h: 0.48 }), 24, 1.85);
      }
    };
    gangyin = {
      cover: (ctx) => {
        const art = coverArt(ctx);
        const n2 = Array.from(ctx.title).length;
        cText(ctx, { x: 0.052, y: 0.06, w: 0.42, h: 0.04 }, ctx.slide.meta ?? "", {
          size: 11,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody
        });
        gangyinLeaf(ctx, 0.812, 0.074, 0.16, 0.95);
        cRect(ctx, { x: 0.052, y: 0.44, w: 0.09, h: 0.028 }, ctx.theme.accent, 1);
        cText(ctx, { x: 0.05, y: 0.5, w: 0.78, h: 0.38 }, ctx.title, {
          size: coverPt(n2, [80, 76, 48, 36]),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          lineHeight: 1.06,
          valign: "middle"
        });
        cText(ctx, { x: 0.5, y: 0.895, w: 0.3, h: 0.05 }, ctx.note || ctx.line, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      quote: (ctx) => {
        const q = `\u300C${ctx.quote}\u300D`;
        cRect(ctx, { x: 0.14, y: 0.24, w: 8e-3, h: 0.4 }, ctx.theme.accent, 0.95);
        cText(ctx, { x: 0.2, y: 0.24, w: 0.66, h: 0.4 }, q, {
          size: quotePointSize(Array.from(q).length, "gangyin"),
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          lineHeight: 1.9,
          valign: "middle"
        });
        cText(ctx, { x: 0.2, y: 0.76, w: 0.5, h: 0.05 }, ctx.note, {
          size: 14,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
        gangyinLeaf(ctx, 0.85, 0.78, 0.1, 0.85);
      },
      words: (ctx) => {
        gangyinHead(ctx);
        const list = ctx.items.slice(0, 4);
        const gap = 0.022;
        const cw = (0.88 - gap * (list.length - 1)) / Math.max(1, list.length);
        const alphas = [1, 0.78, 0.55, 0.34];
        list.forEach((w, i) => {
          const box = { x: 0.06 + i * (cw + gap), y: 0.28, w: cw, h: 0.34 };
          cRect(ctx, box, ctx.theme.accent, alphas[i % 4]);
          cText(ctx, { x: box.x + 0.02, y: box.y + 0.03, w: box.w - 0.04, h: box.h - 0.06 }, w, {
            size: n0(30, 22, w),
            color: ctx.theme.paper,
            font: ctx.theme.fontTitle,
            bold: true,
            align: "center",
            valign: "middle"
          });
        });
      },
      numbered: (ctx) => {
        gangyinHead(ctx);
        const list = takeNumbered(ctx);
        const step = Math.min(0.1, 0.5 / Math.max(1, list.length));
        list.forEach((t, i) => {
          const y = 0.26 + i * step;
          cRect(ctx, { x: 0.08, y, w: 0.05, h: step - 0.02 }, ctx.theme.accent, 0.92);
          cText(ctx, { x: 0.08, y, w: 0.05, h: step - 0.02 }, String(i + 1).padStart(2, "0"), {
            size: 15,
            color: ctx.theme.paper,
            font: ctx.theme.fontTitle,
            align: "center",
            valign: "middle"
          });
          cText(ctx, { x: 0.155, y, w: 0.69, h: step - 0.02 }, t, {
            size: list.length <= 3 ? 22 : list.length <= 4 ? 20 : 18,
            color: ctx.theme.ink,
            font: ctx.theme.fontBody,
            lineHeight: 1.5,
            valign: "middle"
          });
          cLine(ctx, { x: 0.155, y: y + step - 0.022, w: 0.69, h: 12e-4 }, ctx.theme.line, 1);
        });
      },
      compare: (ctx) => {
        const [left, right] = halves(ctx.items);
        gangyinHead(ctx);
        const n2 = Math.max(left.length, right.length);
        const size = n2 <= 2 ? 25 : n2 <= 3 ? 21 : 18;
        cLine(ctx, { x: 0.1, y: 0.28, w: 0.35, h: 4e-3 }, ctx.theme.accent, 0.95);
        cLine(ctx, { x: 0.53, y: 0.28, w: 0.35, h: 4e-3 }, ctx.theme.accent, 0.35);
        cText(ctx, { x: 0.1, y: 0.34, w: 0.35, h: 0.42 }, left.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
        cText(ctx, { x: 0.53, y: 0.34, w: 0.35, h: 0.42 }, right.join("\n"), {
          size,
          color: ctx.theme.ink,
          font: ctx.theme.fontBody,
          lineHeight: 1.9
        });
      },
      end: (ctx) => {
        gangyinLeaf(ctx, 0.78, 0.16, 0.19, 0.9);
        cRect(ctx, { x: 0.08, y: 0.36, w: 0.07, h: 0.028 }, ctx.theme.accent, 1);
        cText(ctx, { x: 0.08, y: 0.42, w: 0.72, h: 0.2 }, ctx.line || ctx.items[0] || ctx.title, {
          size: 40,
          color: ctx.theme.ink,
          font: ctx.theme.fontTitle,
          bold: true,
          valign: "middle",
          lineHeight: 1.25
        });
        cText(ctx, { x: 0.08, y: 0.66, w: 0.6, h: 0.06 }, ctx.note, {
          size: 16,
          color: ctx.theme.muted,
          font: ctx.theme.fontBody
        });
      },
      plain: (ctx) => {
        gangyinHead(ctx);
        bodyBlock(ctx, besideArt(ctx, { x: 0.1, y: 0.24, w: 0.78, h: 0.54 }), 24, 1.8);
        if (!ctx.art) gangyinLeaf(ctx, 0.8, 0.68, 0.13, 0.55);
      }
    };
    LAYOUTS = {
      suke,
      xuan,
      liti,
      jijian,
      shuye,
      tigang,
      lanxian,
      liu,
      chang,
      man,
      ka,
      shuangnian,
      gulan,
      shangwu,
      sanse,
      lindi,
      changyan,
      danse,
      gangyin
    };
    ITEM_CAP = {
      suke: { numbered: 6, words: 5 },
      xuan: { numbered: 6, words: 4 },
      liti: { numbered: 5, words: 4 },
      jijian: { numbered: 6, words: 4 },
      shuye: { numbered: 5, words: 5 },
      tigang: { numbered: 5, words: 4 },
      lanxian: { numbered: 6, words: 4 },
      liu: { numbered: 6, words: 4 },
      chang: { numbered: 6, words: 4 },
      man: { numbered: 6, words: 4 },
      ka: { numbered: 6, words: 4 },
      shuangnian: { numbered: 6, words: 4 },
      gulan: { numbered: 6, words: 4 },
      shangwu: { numbered: 6, words: 4 },
      sanse: { numbered: 6, words: 4 },
      lindi: { numbered: 6, words: 4 },
      changyan: { numbered: 6, words: 4 },
      danse: { numbered: 6, words: 4 },
      gangyin: { numbered: 6, words: 4 }
    };
    FURNITURE = {
      suke: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 1, h: 0.14 }, ctx.theme.surface, 0.5);
        cRect(ctx, { x: 0.045, y: 0.2, w: 0.01, h: 0.62 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0.905, y: 0.885, w: 0.04, h: 0.07 }, ctx.theme.accent, 0.9);
        cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.6);
      },
      xuan: (ctx) => {
        const m = 0.028;
        cLine(ctx, { x: m, y: m, w: 1 - m * 2, h: 2e-3 }, ctx.theme.line, 0.7);
        cLine(ctx, { x: m, y: 1 - m, w: 1 - m * 2, h: 2e-3 }, ctx.theme.line, 0.7);
        cLine(ctx, { x: m, y: m, w: 15e-4, h: 1 - m * 2 }, ctx.theme.line, 0.7);
        cLine(ctx, { x: 1 - m, y: m, w: 15e-4, h: 1 - m * 2 }, ctx.theme.line, 0.7);
        cRect(ctx, { x: 0.9, y: 0.06, w: 0.035, h: 0.062 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0, y: 0.95, w: 1, h: 0.05 }, ctx.theme.surface, 0.5);
      },
      liti: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 0.13, h: 1 }, ctx.theme.surface, 0.5);
        cRect(ctx, { x: 0, y: 0, w: 0.13, h: 0.06 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0.13, y: 0.92, w: 0.42, h: 0.012 }, ctx.theme.accent, 0.9);
      },
      jijian: (ctx) => {
        if (archetypeOf(ctx.slide.kind) === "cover") return;
        cRect(ctx, { x: 0.66, y: 0, w: 0.34, h: 0.3 }, ctx.theme.surface, 0.55);
        cRect(ctx, { x: 0.06, y: 0.88, w: 0.18, h: 0.014 }, ctx.theme.accent, 0.9);
        cEllipse(ctx, { x: 0.92, y: 0.9, w: 0.03, h: 0.053 }, ctx.theme.accent, 0.25);
      },
      shuye: (ctx) => {
        cRect(ctx, { x: 0.055, y: 0, w: 0.016, h: 1 }, ctx.theme.accent, 0.8);
        for (let i = 0; i < 3; i++) cLine(ctx, { x: 0.94, y: 0.2 + i * 0.04, w: 0.03, h: 2e-3 }, ctx.theme.line, 0.6);
        cRect(ctx, { x: 0, y: 0.9, w: 1, h: 0.1 }, ctx.theme.surface, 0.5);
      },
      tigang: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 1, h: 0.045 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0.05, y: 0.22, w: 0.09, h: 0.56 }, ctx.theme.surface, 0.5);
        cRect(ctx, { x: 0.9, y: 0.88, w: 0.04, h: 0.07 }, ctx.theme.accent, 0.85);
      },
      lanxian: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 1, h: 0.1 }, ctx.theme.surface, 0.55);
        for (let i = 0; i < 3; i++) cRect(ctx, { x: 0.08 + i * 0.3, y: 0.16, w: 0.05, h: 0.012 }, ctx.theme.accent, 0.8);
        cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.5);
      },
      liu: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 1, h: 0.035 }, ctx.theme.accent, 0.8);
        for (let i = 0; i < 6; i++) cEllipse(ctx, { x: 0.07 + i * 0.15, y: 0.18, w: 0.012, h: 0.021 }, ctx.theme.accent, 0.6);
        cRect(ctx, { x: 0, y: 0.95, w: 1, h: 0.05 }, ctx.theme.surface, 0.5);
      },
      chang: (ctx) => {
        cRect(ctx, { x: 0, y: 0.88, w: 1, h: 0.12 }, ctx.theme.surface, 0.5);
        cRect(ctx, { x: 0.045, y: 0.05, w: 0.035, h: 0.062 }, ctx.theme.accent, 0.85);
        cRect(ctx, { x: 0, y: 2e-3, w: 1, h: 4e-3 }, ctx.theme.accent, 0.7);
      },
      man: (ctx) => {
        cRect(ctx, { x: 0, y: 0, w: 1, h: 0.12 }, ctx.theme.surface, 0.5);
        cRect(ctx, { x: 0.04, y: 0.16, w: 8e-3, h: 0.66 }, ctx.theme.accent, 0.8);
        cRect(ctx, { x: 0.91, y: 0.89, w: 0.035, h: 0.062 }, ctx.theme.accent, 0.85);
      },
      ka: (ctx) => {
        for (const [x, y] of [[0.03, 0.03], [0.948, 0.03], [0.03, 0.93], [0.948, 0.93]])
          cRect(ctx, { x, y, w: 0.022, h: 0.039 }, ctx.theme.accent, 0.7);
        cRect(ctx, { x: 0, y: 0.955, w: 1, h: 0.045 }, ctx.theme.surface, 0.5);
      },
      /* 后八族自己的版式里已经明着画了大色块，家具只补页脚色带与右上角章，
         让 plain / end 这些「字少」的式也不至于回到白纸。章放右上：左上 / 左下都是字。 */
      shuangnian: (ctx) => {
        furn8(ctx);
      },
      gulan: (ctx) => {
        furn8(ctx);
      },
      shangwu: (ctx) => {
        furn8(ctx);
      },
      sanse: (ctx) => {
        furn8(ctx);
      },
      lindi: (ctx) => {
        furn8(ctx);
      },
      changyan: (ctx) => {
        furn8(ctx);
      },
      danse: (ctx) => {
        furn8(ctx);
      },
      gangyin: (ctx) => {
        furn8(ctx);
      }
    };
  }
});

// scripts/.render-deck.ts
import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
var DIR = process.argv[2] || "/tmp/yalang";
var OUT = path.join(DIR, "png");
fs.mkdirSync(OUT, { recursive: true });
var { place: place2 } = await Promise.resolve().then(() => (init_place(), place_exports));
var { templateOf: templateOf2, defaultTemplateId: defaultTemplateId2 } = await Promise.resolve().then(() => (init_theme2(), theme_exports));
var { FOOT_SLOT: FOOT_SLOT2 } = await Promise.resolve().then(() => (init_place(), place_exports));
var slides = JSON.parse(fs.readFileSync(path.join(DIR, "slides.json"), "utf8"));
var subject = String(slides[0]?.subject ?? "\u8BED\u6587");
var tid = defaultTemplateId2(subject, "\u72FC\u7259\u5C71\u4E94\u58EE\u58EB", "\u7B2C\u4E00\u8BFE\u65F6");
var tpl = templateOf2(tid);
console.log(`\u6A21\u677F ${tpl.name}\uFF08${tid}\uFF09\xB7 ${slides.length} \u9875`);
var W2 = 1280;
var H = 720;
var FONT = {
  song: "Songti SC, Noto Serif CJK SC, serif",
  kai: "Kaiti SC, STKaiti, serif",
  hei: "PingFang SC, Noto Sans CJK SC, sans-serif"
};
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function wrapTo(text, widthPx, sizePx) {
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    let w = 0;
    for (const ch of [...para]) {
      const cw = /[\x00-\x7F]/.test(ch) ? sizePx * 0.55 : sizePx;
      if (w + cw > widthPx && line) {
        out.push(line);
        line = ch;
        w = cw;
      } else {
        line += ch;
        w += cw;
      }
    }
    out.push(line);
  }
  return out;
}
function svgOf(placed, title) {
  const body = [`<rect width="${W2}" height="${H}" fill="${tpl.paper}"/>`];
  for (const p of placed) {
    const x = p.x * W2;
    const y = p.y * H;
    const w = p.w * W2;
    const h = p.h * H;
    if (p.kind === "image") {
      if (p.data) {
        body.push(
          `<image x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" href="${p.data}"/>`
        );
      }
      continue;
    }
    if (p.kind === "rect" || p.kind === "line") {
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, p.kind === "line" ? 1 : 0).toFixed(1)}" height="${Math.max(h, p.kind === "line" ? 1 : 0).toFixed(1)}"${(p.radius ?? 0) > 0 ? ` rx="${((p.radius ?? 0) * 4 / 3).toFixed(1)}"` : ""} fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      );
      continue;
    }
    if (p.kind === "ellipse") {
      body.push(
        `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      );
      continue;
    }
    if (!p.text) continue;
    const pt = p.size ?? 18;
    const px = pt * 4 / 3;
    const list = wrapTo(p.text, w, px);
    const lineH = px * (p.lineHeight ?? 1.3);
    const blockH = list.length * lineH;
    const top = p.valign === "middle" ? y + (h - blockH) / 2 : y;
    const anchor = p.align === "right" ? "end" : p.align === "center" ? "middle" : "start";
    const tx = p.align === "right" ? x + w : p.align === "center" ? x + w / 2 : x;
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(top + lineH * i + px * 0.78).toFixed(1)}" font-family="${FONT[p.font ?? tpl.fontBody] ?? FONT.hei}" font-size="${px.toFixed(1)}"${p.bold ? ' font-weight="600"' : ""} fill="${p.color ?? tpl.ink}" text-anchor="${anchor}">${esc(line)}</text>`
      );
    });
  }
  body.push(
    `<text x="${(FOOT_SLOT2.left.x * W2).toFixed(0)}" y="${((FOOT_SLOT2.left.y + 0.028) * H).toFixed(0)}" font-family="PingFang SC, sans-serif" font-size="12" fill="${tpl.muted}">${esc(title)}</text>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H}" viewBox="0 0 ${W2} ${H}">${body.join("")}</svg>`;
}
var n = 0;
for (const slide of slides) {
  n += 1;
  const placed = place2(slide, tpl);
  const svg = svgOf(placed, `\u300A\u72FC\u7259\u5C71\u4E94\u58EE\u58EB\u300B${tpl.name}`);
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: W2 },
    font: { loadSystemFonts: true, defaultFontFamily: "Songti SC" }
  });
  const file = path.join(OUT, `p${String(n).padStart(2, "0")}.png`);
  fs.writeFileSync(file, r.render().asPng());
}
console.log(`\u2713 ${n} \u5F20 \u2192 ${OUT}`);
