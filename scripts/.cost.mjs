var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/density.ts
function isDensity(x) {
  return x === "lean" || x === "standard" || x === "rich";
}
function limitsOf(lock) {
  return isDensity(lock) ? DENSITY[lock] : ENVELOPE;
}
var DENSITY_ORDER, DENSITY_LABELS, DEFAULT_DENSITY, DENSITY, WORDS_ITEMS_MAX, DEFAULT_LIMITS, ENVELOPE, PAGE_RANGE;
var init_density = __esm({
  "src/lib/density.ts"() {
    "use strict";
    DENSITY_ORDER = ["lean", "standard", "rich"];
    DENSITY_LABELS = {
      lean: "\u7CBE\u7B80",
      standard: "\u6807\u51C6",
      rich: "\u5145\u5B9E"
    };
    DEFAULT_DENSITY = "standard";
    DENSITY = {
      lean: { bodyChars: 30, pagesMin: 10, pagesMax: 10, itemsMax: 4, closeReadMax: 2 },
      standard: { bodyChars: 60, pagesMin: 10, pagesMax: 12, itemsMax: 5, closeReadMax: 3 },
      rich: { bodyChars: 90, pagesMin: 12, pagesMax: 14, itemsMax: 6, closeReadMax: 3 }
    };
    WORDS_ITEMS_MAX = 4;
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
var scale_exports = {};
__export(scale_exports, {
  CLIP_MAX_SECONDS: () => CLIP_MAX_SECONDS,
  LESSON_MIN_SECONDS: () => LESSON_MIN_SECONDS,
  M20_MAX_SECONDS: () => M20_MAX_SECONDS,
  M30_MAX_SECONDS: () => M30_MAX_SECONDS,
  clampPageCount: () => clampPageCount,
  deckRangeFor: () => deckRangeFor,
  limitsFor: () => limitsFor,
  planOfScale: () => planOfScale,
  scaleOf: () => scaleOf,
  slideRangeFor: () => slideRangeFor,
  tierOf: () => tierOf,
  tierPlanOf: () => tierPlanOf
});
function scaleOf(duration2) {
  const d = Number(duration2);
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return "clip";
  return "lesson";
}
function planOfScale(scale2) {
  return PLANS[scale2];
}
function tierOf(duration2) {
  const d = Number(duration2);
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return "clip";
  if (d <= M20_MAX_SECONDS) return "m20";
  if (d <= M30_MAX_SECONDS) return "m30";
  return "m40";
}
function tierPlanOf(tier) {
  if (tier === "clip") {
    const base = PLANS.clip;
    return {
      deckPages: base.deckPages,
      slidePages: base.slidePages,
      segments: base.segments,
      skeleton: "\u5BFC\u5165 \u2192 \u521D\u8BFB \u2192 \u7CBE\u8BFB \u2192 \u62D3\u5C55 \u2192 \u5C0F\u7ED3"
    };
  }
  return TIERS[tier];
}
function deckRangeFor(duration2) {
  return tierPlanOf(tierOf(duration2)).deckPages;
}
function slideRangeFor(duration2) {
  return tierPlanOf(tierOf(duration2)).slidePages;
}
function clampPageCount(n, range) {
  return Math.max(range.min, Math.min(range.max, Math.round(Number(n) || 0)));
}
function limitsFor(densityLock, scale2, duration2) {
  const base = limitsOf(densityLock);
  if (scale2 !== "lesson") return base;
  const plan2 = planOfScale(scale2);
  const hasTier = typeof duration2 === "number" && Number.isFinite(duration2);
  const pages = hasTier ? slideRangeFor(duration2) : plan2.slidePages;
  const segMax = hasTier ? tierPlanOf(tierOf(duration2)).segments.max : plan2.segments.max;
  return {
    ...base,
    pagesMin: pages.min,
    pagesMax: pages.max,
    closeReadMax: Math.max(base.closeReadMax, segMax)
  };
}
var CLIP_MAX_SECONDS, LESSON_MIN_SECONDS, PLANS, M20_MAX_SECONDS, M30_MAX_SECONDS, TIERS;
var init_scale = __esm({
  "src/lib/scale.ts"() {
    "use strict";
    init_density();
    CLIP_MAX_SECONDS = 600;
    LESSON_MIN_SECONDS = 1200;
    PLANS = {
      clip: {
        scale: "clip",
        deckPages: { min: 12, max: 16 },
        slidePages: { min: 10, max: 14 },
        segments: { min: 4, max: 6 },
        pagesPerSegment: { min: 2, max: 3 }
      },
      lesson: {
        scale: "lesson",
        deckPages: { min: 22, max: 28 },
        slidePages: { min: 16, max: 24 },
        segments: { min: 6, max: 7 },
        pagesPerSegment: { min: 3, max: 4 }
      }
    };
    M20_MAX_SECONDS = 1500;
    M30_MAX_SECONDS = 2100;
    TIERS = {
      m20: {
        deckPages: { min: 12, max: 16 },
        /** 3 个环节 × 3–4 页 + 首尾 4–5 页。
         *  第二十六轮下调（不是回退）：TASKS/25 起「没有材料的页不许上屏」——
         *  只剩一个动作、页面上找不到读什么/看哪句的页一律不出（《桂花雨》27 页里 11 页是这种）。
         *  薄教案三个环节的讲稿加起来不到 300 字，能站住的页就 11–13 张;
         *  硬凑回 16 张只能把「闭眼闻一闻」这类空页再请回来，正是用户指着骂的那一種。 */
        slidePages: { min: 11, max: 16 },
        segments: { min: 3, max: 3 },
        skeleton: "\u5BFC\u5165 + \u7CBE\u8BFB + \u5C0F\u7ED3"
      },
      m30: {
        deckPages: { min: 16, max: 20 },
        /** 4 个环节 × 3–4 页 + 首尾 4–5 页；同上，下限跟着素材走（实测 13 页） */
        slidePages: { min: 13, max: 18 },
        segments: { min: 4, max: 4 },
        skeleton: "\u5BFC\u5165 + \u521D\u8BFB + \u7CBE\u8BFB + \u5C0F\u7ED3"
      },
      m40: {
        deckPages: { min: 22, max: 28 },
        /** 6–7 个环节 × 2–4 页 + 首尾 5–6 页；同上，下限跟着素材走（薄教案实测 16–20 页） */
        slidePages: { min: 16, max: 24 },
        segments: { min: 6, max: 7 },
        skeleton: "\u5BFC\u5165 + \u521D\u8BFB + \u7CBE\u8BFB + \u54C1\u53E5 + \u62D3\u5C55 + \u5C0F\u7ED3\uFF08\u542B\u5B57\u8BCD / \u7EC3\u4E60 / \u68C0\u6D4B\uFF09"
      }
    };
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
function isTeacherPage(page) {
  if (!page) return false;
  if (TEACHER_PAGE_KINDS.has(page.kind)) return true;
  if (TEACHER_VOICE.test(String(page.title ?? ""))) return true;
  const hits = (page.bullets ?? []).filter((b) => TEACHER_VOICE.test(String(b ?? "")));
  return hits.length >= 2;
}
var TEACHER_VOICE, TEACHER_PAGE_KINDS;
var init_deck = __esm({
  "src/lib/deck.ts"() {
    "use strict";
    init_scale();
    init_scene();
    TEACHER_VOICE = /我准备|我打算|我这样|我要先|先给什么|然后再问|卡在哪|学情|预设|我会问|板书设计|这个环节|本环节的设计|谁读给大家听|谁来说|全班对答案|同桌互查/;
    TEACHER_PAGE_KINDS = /* @__PURE__ */ new Set(["design", "prep"]);
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

// src/data/texts.ts
function visibleChars(text) {
  let n = 0;
  for (const ch of String(text ?? "")) if (VISIBLE.test(ch)) n++;
  return n;
}
function fitQuote(raw) {
  const s = String(raw ?? "").trim();
  if (visibleChars(s) < 8) return "";
  if ([...s].length > 60) {
    const cut = s.search(/[，,；;：:]/);
    return cut > 0 ? s.slice(0, cut).trim() : s;
  }
  return s;
}
function unwrapQuote(line) {
  const pairs = [
    ["\u201C", "\u201D"],
    ["\u300C", "\u300D"],
    ["\u300E", "\u300F"],
    ['"', '"']
  ];
  for (const [l, r] of pairs) {
    if (!line.startsWith(l) || !line.endsWith(r) || line.length <= l.length + r.length) continue;
    const inner = line.slice(l.length, line.length - r.length);
    if (!inner.includes(l) && !inner.includes(r)) return inner.trim();
  }
  return line;
}
function groundText(given, model) {
  const own = String(given ?? "").trim();
  if (own) return own;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of String(model ?? "").split(/\r?\n/)) {
    const line = raw.replace(NUM_HEAD, "").replace(SOURCE_TAIL, "").trim();
    const body = unwrapQuote(line);
    if (!body || EXPLAIN.test(body)) continue;
    const one = fitQuote(body);
    if (!one) continue;
    const key = one.replace(/[\s，,。.！!？?；;：:、…—]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(one);
    if (out.length >= 6) break;
  }
  return out.join("\n");
}
function splitQuotes(raw) {
  const out = [];
  let carry = "";
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const text = carry + String(line ?? "").trim();
    carry = "";
    if (!text) continue;
    let buf = "";
    let depth = 0;
    const flush = () => {
      const one = fitQuote(buf);
      if (one) out.push(one);
      buf = "";
    };
    for (const ch of text) {
      buf += ch;
      if (ch === '"') depth = depth > 0 ? depth - 1 : depth + 1;
      else if (ch === "\u201C" || ch === "\u300C" || ch === "\u300E") depth += 1;
      else if ((ch === "\u201D" || ch === "\u300D" || ch === "\u300F") && depth > 0) depth -= 1;
      if (depth === 0 && SENT_END.test(ch)) flush();
    }
    const tail = buf.trim();
    if (!tail) continue;
    if (!SENT_END.test(tail) && [...tail].length <= 60 && !HEADING.test(tail)) carry = tail;
    else flush();
  }
  if (carry) {
    const one = fitQuote(carry);
    if (one) out.push(one);
  }
  return [...new Set(out)];
}
var VISIBLE, SENT_END, HEADING, EXPLAIN, NUM_HEAD, SOURCE_TAIL;
var init_texts = __esm({
  "src/data/texts.ts"() {
    "use strict";
    VISIBLE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF0-9A-Za-z]/;
    SENT_END = /[。！？；…]/;
    HEADING = /^(?:第[一二三四五六七八九十\d]+[段章节课页]|《[^》]*》|[（(]?[一二三四五六七八九十\d]+[）)、.．]?(?:段|章|节|课|页)?)$/;
    EXPLAIN = /本文|这篇课文|课文主要|课文讲|作者通过|课文写了|让我们|同学们|教学目标|教学重难点|本环节|板书设计|说课|核心素养/;
    NUM_HEAD = /^\s*(?:\d+\s*[.、．)）]|[（(]\s*\d+\s*[）)]|[-–—*•·])\s*/;
    SOURCE_TAIL = /\s*[（(【\[]\s*[^）)】\]]{0,24}(?:人教版|部编版|统编版|北师大版|苏教版|外研版|PEP|教材|课本|第[一二三四五六七八九十\d]+单元)[^）)】\]]{0,24}\s*[）)】\]]\s*$/;
  }
});

// src/lib/prompt.ts
var prompt_exports = {};
__export(prompt_exports, {
  SYSTEM_PROMPT: () => SYSTEM_PROMPT,
  buildStudentSlidesPrompt: () => buildStudentSlidesPrompt,
  buildUserPrompt: () => buildUserPrompt
});
function buildUserPrompt(input) {
  const scale2 = scaleOf(input.duration);
  const lesson = scale2 === "lesson";
  const segRule = lesson ? `- \u8FD9\u662F\u4E00\u8282 ${Math.round(input.duration / 60)} \u5206\u949F\u7684\u5B8C\u6574\u8BFE\uFF0C\u4E0D\u662F\u7247\u6BB5\u3002segments \u6392 6\u20137 \u4E2A\u73AF\u8282\uFF1A\u9884\u4E60 / \u5BFC\u5165 / \u5B57\u8BCD\u6216\u57FA\u7840 / \u7CBE\u8BFB\u6216\u63A2\u7A76\uFF08\u53EF\u4EE5\u62C6\u6210\u4E24\u4E2A\uFF09/ \u8BFE\u4E2D\u7EC3\u4E60\u6216\u8BFE\u5802\u6D3B\u52A8 / \u5C0F\u7ED3 / \u4F5C\u4E1A\uFF0Cratio \u4E4B\u548C\u7B49\u4E8E 1\uFF0C\u5176\u4E2D\u5FC5\u987B\u6709\u4E00\u6BB5\u300C\u8BFE\u4E2D\u7EC3\u4E60\u6216\u8BFE\u5802\u6D3B\u52A8\u300D
- \u6BCF\u4E2A\u73AF\u8282\u90FD\u8981\u6709\u80FD\u5F00\u53E3\u8BB2\u7684 scripts\uFF1A\u4E0D\u662F\u63D0\u7EB2\uFF0C\u662F\u7AD9\u5728\u8BB2\u53F0\u4E0A\u80FD\u76F4\u63A5\u5FF5\u7684\u8BDD\uFF1B\u91CD\u70B9\u73AF\u8282\u7684 script \u5199\u8DB3\uFF0C\u5141\u8BB8\u5199\u5230 200 \u5B57` : `- segments \u56FA\u5B9A 5 \u4E2A\u73AF\u8282\uFF1A\u5BFC\u5165 / \u521D\u8BFB\u6216\u65B0\u6388 / \u7CBE\u8BFB\u6216\u63A2\u7A76 / \u62D3\u5C55 / \u5C0F\u7ED3\uFF0Cratio \u4F9D\u6B21\u4E3A 0.125\u30010.2\u30010.4\u30010.175\u30010.1\uFF0C\u73AF\u8282\u540D\u8981\u5177\u4F53\uFF08\u4F8B\u5982\u201C\u7CBE\u8BFB \xB7 \u54C1\u5473\u6447\u82B1\u4E50\u201D\uFF09`;
  return `\u8BF7\u4E3A\u4EE5\u4E0B\u8BFE\u9898\u751F\u6210\u5907\u8BFE\u5305\uFF1A

- \u8BFE\u9898\uFF1A\u300A${input.topic}\u300B
- \u5B66\u79D1\uFF1A${input.subject || "\u672A\u586B\u2014\u2014\u4F60\u81EA\u5DF1\u6309\u8BFE\u9898\u5224\u5B9A\uFF0C\u586B\u8FDB meta.subject"}
- \u5B66\u6BB5\uFF1A${input.stage || "\u672A\u586B\u2014\u2014\u4F60\u81EA\u5DF1\u5224\u5B9A\uFF0C\u586B\u8FDB meta.stage"}
- \u5E74\u7EA7\uFF1A${input.grade || "\u672A\u586B\u2014\u2014\u4F60\u81EA\u5DF1\u5224\u5B9A\uFF0C\u586B\u8FDB meta.grade"}
- \u8BFE\u65F6\uFF1A${input.period}
- \u6559\u6750\u7248\u672C\uFF1A${input.textbook || "\u4E0D\u9650"}
- \u65F6\u957F\uFF1A${Math.round(input.duration / 60)} \u5206\u949F\uFF08\u6309\u533A\u95F4\u9009\u9AA8\u67B6\uFF0C\u4E0D\u662F\u628A\u77ED\u8BFE\u62C9\u957F\uFF09
${input.text?.trim() ? `- \u8001\u5E08\u5DF2\u7ECF\u7ED9\u7684\u539F\u6587\uFF08\u9010\u5B57\uFF0C\u539F\u6837\u6284\u56DE meta.text\uFF0C\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u6539\uFF09\uFF1A
${input.text.trim()}
` : ""}
\u4E25\u683C\u6309\u7167\u4EE5\u4E0B JSON \u7ED3\u6784\u8F93\u51FA\uFF08\u4E0D\u8981\u589E\u5220\u5B57\u6BB5\uFF09\uFF1A

{
  "meta": { "topic": "", "subject": "", "stage": "", "grade": "", "period": "", "textbook": "", "duration": ${input.duration}, "text": "" },
  "objectives": { "knowledge": "", "process": "", "emotion": "" },
  "keyPoint": "",
  "hardPoint": "",
  "preparation": "",
  "segments": [
    { "name": "\u73AF\u8282\u540D", "ratio": 0.125, "goal": "\u8FD9\u4E2A\u73AF\u8282\u8981\u8FBE\u6210\u4EC0\u4E48", "teacher": "\u6559\u5E08\u6D3B\u52A8", "student": "\u5B66\u751F\u6D3B\u52A8", "script": "\u8FD9\u4E00\u73AF\u8282\u7684\u53E3\u64AD\u7A3F\uFF0C\u80FD\u76F4\u63A5\u5FF5", "pauses": [{ "afterText": "\u63D2\u5728\u54EA\u53E5\u8BDD\u4E4B\u540E", "seconds": 5, "question": "\u4E0D\u8D85\u8FC7 20 \u5B57\u7684\u95EE\u53E5", "type": "\u786E\u8BA4\u7406\u89E3" }] }
  ],
  "homework": { "must": "", "optional": "" },
  "blackboard": { "layout": "\u7528 ASCII \u753B\u51FA\u677F\u4E66\u5E03\u5C40", "order": ["\u4E66\u5199\u987A\u5E8F1", "\u4E66\u5199\u987A\u5E8F2"] },
  "prep": {
    "courseware": [{ "name": "\u8BFE\u4EF6\u7D20\u6750\u540D", "usage": "\u4EC0\u4E48\u65F6\u5019\u7528", "searchHint": "\u53EF\u76F4\u63A5\u590D\u5236\u53BB\u641C\u7684\u5173\u952E\u8BCD" }],
    "physical": [{ "name": "\u5B9E\u7269\u6559\u5177\u540D", "usage": "\u4EC0\u4E48\u65F6\u5019\u7528" }],
    "media": [{ "name": "\u97F3\u89C6\u9891\u540D", "usage": "\u4EC0\u4E48\u65F6\u5019\u7528", "searchHint": "\u68C0\u7D22\u5173\u952E\u8BCD" }]
  },
  "speech": [ { "section": "\u8BF4\u6559\u6750", "text": "" } ],
  "defense": [ { "question": "", "answer": "" } ]
}

\u6CE8\u610F\uFF1A
- meta \u91CC\u7684 subject / stage / grade \u5FC5\u987B\u6309\u4F60\u7684\u5224\u65AD\u586B\u597D\uFF1B\u786E\u5B9E\u5224\u4E0D\u51FA\u6765\u7684\u5B57\u6BB5\u624D\u7559\u7A7A\u5B57\u7B26\u4E32\uFF0C\u4E0D\u8981\u778E\u731C
- meta.text \u662F\u8FD9\u8282\u8BFE\u8981\u7528\u7684\u8BFE\u672C\u539F\u53E5\uFF0C\u4E5F\u662F\u5B66\u751F\u7248\u300C\u539F\u6587\u9875\u300D\u7684\u552F\u4E00\u6765\u6E90\uFF1A\u8001\u5E08\u4E0A\u9762\u7ED9\u4E86\u539F\u6587\u5C31\u539F\u6837\u6284\u56DE\uFF0C\u4E00\u884C\u4E00\u53E5\u3001\u4E0D\u52A0\u5E8F\u53F7\u4E0E\u51FA\u5904\uFF1B\u6CA1\u7ED9\u5C31\u81EA\u5DF1\u6309\u8BFE\u9898\u7ED9 3\u20135 \u53E5\u8BFE\u672C\u4E0A\u7684\u539F\u53E5\u2014\u2014\u8BED\u6587\u662F\u8BFE\u6587\u539F\u53E5\uFF0C\u6570\u5B66\u662F\u8BFE\u672C\u4E0A\u7684\u5B9A\u4E49\u6216\u6CD5\u5219\u539F\u53E5\uFF08\u8981\u5E26\u6570\u5B57\uFF09\uFF0C\u82F1\u8BED\u662F\u672C\u5355\u5143\u7684\u6838\u5FC3\u53E5\u578B\u539F\u53E5\u3002\u4E00\u53E5\u90FD\u6CA1\u628A\u63E1\u5C31\u7559\u7A7A\u5B57\u7B26\u4E32\uFF0C\u7EDD\u5BF9\u4E0D\u8BB8\u7F16\uFF1B\u7F16\u4E00\u53E5\u9519\u7684\uFF0C\u6574\u8282\u8BFE\u7684\u539F\u6587\u9875\u90FD\u4F1A\u8DDF\u7740\u9519\u3002
${segRule}
- speech \u8981\u6709 6 \u6BB5\uFF1A\u8BF4\u6559\u6750\u3001\u8BF4\u5B66\u60C5\u3001\u8BF4\u76EE\u6807\u3001\u8BF4\u6559\u6CD5\u4E0E\u5B66\u6CD5\u3001\u8BF4\u6559\u5B66\u8FC7\u7A0B\u3001\u8BF4\u677F\u4E66
- defense \u7ED9 7 \u6761\uFF0C\u6BCF\u6761 answer \u4E0D\u8D85\u8FC7 80 \u4E2A\u6C49\u5B57
- \u6BCF\u4E2A\u73AF\u8282 pauses \u6700\u591A 2 \u4E2A\uFF0Cseconds \u5728 3\u201310 \u4E4B\u95F4\uFF1B\u6CA1\u6709\u5FC5\u8981\u5C31\u4E0D\u7ED9\uFF0C\u4E0D\u8981\u4E3A\u4E86\u51D1\u6570\u786C\u52A0
- pauses[].type \u53EA\u80FD\u662F\u201C\u786E\u8BA4\u7406\u89E3\u201D\u201C\u5F15\u53D1\u601D\u8003\u201D\u201C\u8FC7\u6E21\u201D\u4E09\u8005\u4E4B\u4E00
- prep \u4E09\u7EC4\u5404\u7ED9 2\u20133 \u9879\uFF0CsearchHint \u5199\u6210\u8001\u5E08\u80FD\u76F4\u63A5\u7C98\u8D34\u7684\u641C\u7D22\u8BCD\uFF1B\u6CA1\u6709\u97F3\u89C6\u9891\u5C31\u7559\u7A7A\u6570\u7EC4\uFF0C\u4E0D\u8981\u786C\u51D1
- blackboard.layout \u7528\u7B49\u5BBD\u5B57\u7B26\u753B\uFF0C\u4E0D\u8981\u4F7F\u7528\u4EFB\u4F55 markdown \u4EE3\u7801\u56F4\u680F\u7B26\u53F7
- homework \u5206\u5FC5\u505A\u4E0E\u9009\u505A\uFF0Cpreparation \u5217\u51FA\u5177\u4F53\u6559\u5177`;
}
function planToTeacherText(plan2) {
  const clip = (t, n) => {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    return s.length > n ? `${s.slice(0, n)}\u2026` : s;
  };
  const lines = [];
  lines.push(`\u4E09\u6761\u76EE\u6807\uFF1A
- \u77E5\u8BC6\uFF1A${clip(plan2.objectives?.knowledge, 120)}
- \u8FC7\u7A0B\uFF1A${clip(plan2.objectives?.process, 120)}
- \u60C5\u611F\uFF1A${clip(plan2.objectives?.emotion, 120)}`);
  lines.push(`\u8981\u8BB2\u900F\u7684\uFF1A${clip(plan2.keyPoint, 100)}`);
  lines.push(`\u96BE\u7A81\u7834\u7684\uFF1A${clip(plan2.hardPoint, 100)}`);
  lines.push(
    "\u5404\u6BB5\u8BB2\u4EC0\u4E48\u3001\u8001\u5E08\u600E\u4E48\u8BF4\uFF1A\n" + (plan2.segments ?? []).map((seg) => {
      const qs = (seg.pauses ?? []).map((p) => p.question).filter(Boolean).join(" / ");
      return `\u3010${seg.name}\u3011${clip(seg.goal, 60)}\uFF5C\u8BB2\u53F0\u4E0A\u7684\u8BDD\uFF1A${clip(seg.script, 140)}${qs ? `\uFF5C\u95EE\u5B66\u751F\uFF1A${qs}` : ""}`;
    }).join("\n")
  );
  lines.push(`\u8BFE\u540E\uFF1A\u5FC5\u505A ${clip(plan2.homework?.must, 70)}\uFF5C\u9009\u505A ${clip(plan2.homework?.optional, 70)}`);
  lines.push(`\u677F\u4E66\u4E66\u5199\u987A\u5E8F\uFF1A${(plan2.blackboard?.order ?? []).map((o) => clip(o, 40)).join("\uFF1B")}`);
  lines.push(
    `\u53EF\u4EE5\u7528\u4E0A\u7684\u68C0\u7D22\u8BCD\uFF1A${(plan2.prep?.courseware ?? []).map((c) => c.searchHint ?? c.name).filter(Boolean).slice(0, 3).join(" / ")}`
  );
  return lines.join("\n\n");
}
function pageRangeText(lim) {
  return lim.pagesMin === lim.pagesMax ? `${lim.pagesMin} \u9875` : `${lim.pagesMin}\u2013${lim.pagesMax} \u9875`;
}
function deckToPrompt(pages) {
  const clip = (t, n) => {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    return [...s].length > n ? `${[...s].slice(0, n).join("")}\u2026` : s;
  };
  return pages.filter((p) => !isTeacherPage(p)).map((p, i) => {
    const bullets = (p.bullets ?? []).map((b) => clip(b, 30)).filter(Boolean);
    const q = p.question ? `\uFF5C\u63D0\u95EE\uFF1A${clip(p.question, 30)}` : "";
    const body = bullets.length ? `\uFF5C${bullets.join(" / ")}` : "";
    return `${i + 1}. \u3010${p.label || p.kind}\u3011${clip(p.title, 30)}${body}${q}`;
  }).join("\n");
}
function buildStudentSlidesPrompt(plan2, lock = "auto", scale2 = scaleOf(plan2?.meta?.duration), edited) {
  const lesson = scale2 === "lesson";
  const lim = limitsFor(lock, scale2, plan2?.meta?.duration);
  const orderRule = lesson ? `2. \u9875\u5E8F\u8DDF\u7740\u73AF\u8282\u8D70\uFF0C\u4E0D\u6309\u9875\u578B\u6392\uFF1A\u5934\u4E24\u9875\u662F cover \u5C01\u9762\u3001goals \u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B\uFF0C \u4E4B\u540E\u6BCF\u4E00\u4E2A\u73AF\u8282 3\u20134 \u9875\uFF08\u8FD9\u4E00\u6BB5\u770B\u4EC0\u4E48 / \u8BFB\u54EA\u4E00\u53E5 / \u8BD5\u4E00\u8BD5\uFF09\uFF0C\u6700\u540E\u4E09\u9875\u662F board \u677F\u4E66\u3001homework \u4F5C\u4E1A\u3001end \u6536\u5C3E\u3002\u540C\u4E00\u9875\u578B\u53EF\u4EE5\u91CD\u590D\u51FA\u73B0\u2014\u2014\u516D\u4E03\u4E2A\u73AF\u8282\u5C31\u662F\u516D\u4E03\u7EC4\u9875\u9762\uFF0C\u4E0D\u8981 \u4E3A\u4E86\u300C\u9875\u578B\u4E0D\u91CD\u590D\u300D\u628A\u56DB\u5341\u8282\u8BFE\u538B\u56DE\u5341\u6765\u9875\u3002` : `2. \u9875\u5E8F\u56FA\u5B9A\uFF1Acover \u5C01\u9762 \u2192 hook \u60C5\u5883\u5BFC\u5165 \u2192 goals \u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B \u2192 words \u5B57\u8BCD\u5173 \u2192 close-read \u7CBE\u8BFB\uFF081\u2013${lim.closeReadMax} \u9875\uFF09\u2192 compare \u5BF9\u6BD4/\u8FC1\u79FB \u2192 board \u677F\u4E66 \u2192 drill \u7EC3\u4E00\u7EC3 \u2192 homework \u4F5C\u4E1A \u2192 end \u6536\u5C3E\u3002`;
  const tierBlock = isDensity(lock) ? `\u6863\u4F4D\u5DF2\u5728\u8BBE\u7F6E\u91CC\u9501\u5B9A\u300C${DENSITY_LABELS[lock]}\u300D\uFF08\u786C\u89C4\u5219\u91CC\u7684\u6570\u5B57\u5C31\u662F\u8FD9\u4E00\u6863\uFF0C\u4E0D\u8BB8\u8DF3\u51FA\uFF09\uFF1A\u6B63\u6587 \u2264${lim.bodyChars} \u5B57/\u9875\uFF0C${pageRangeText(lim)}\uFF0C\u975E\u5B57\u8BCD\u9875 items \u2264${lim.itemsMax}\uFF0C\u7CBE\u8BFB \u2264${lim.closeReadMax} \u9875\u3002` : `\u4F60\u6309\u5224\u636E\u81EA\u9009\u4E00\u6863\uFF08\u672A\u9501\u6863\uFF0C\u786C\u89C4\u5219\u91CC\u7684\u6570\u5B57\u662F\u4E09\u6863\u5E76\u96C6\u7684\u6700\u5BBD\u4E0A\u9650\uFF0C\u4E0D\u8D85\u5373\u53EF\uFF0C\u9009\u5B9A\u540E\u5168\u7BC7\u4FDD\u6301\u4E00\u81F4\uFF09\uFF1A
${DENSITY_MENU}`;
  const system = `\u4F60\u662F\u4E00\u4F4D\u5C0F\u5B66\u8001\u5E08\uFF0C\u6B63\u5728\u628A\u81EA\u5DF1\u5907\u597D\u7684\u8BFE\u4EF6\u91CD\u5199\u6210\u8BFE\u5802\u4E0A\u6295\u7ED9\u5B66\u751F\u770B\u7684 PPT\u3002
\u8BFE\u4EF6\u662F\u7ED9\u8001\u5E08\u8BFB\u7684\uFF0C\u8FD9\u53E0\u5E7B\u706F\u7247\u662F\u7ED9\u5B66\u751F\u62AC\u5934\u770B\u7684\u2014\u2014\u5B83\u4EEC\u4E0D\u662F\u540C\u4E00\u4EFD\u4E1C\u897F\u3002
\u5B66\u751F\u4E00\u9875\u53EA\u8BFB\u5F97\u4E0B\u4E00\u884C\u5B57\uFF0C\u770B\u5B8C\u5C31\u60F3\u8BF4\u3002\u4F60\u7684\u4EFB\u52A1\u4E0D\u662F\u7F29\u5199\uFF0C\u662F\u6362\u89C6\u89D2\u91CD\u5199\u3002

\u5BC6\u5EA6\u6863\u4F4D\uFF08\u4E09\u6863\uFF0C\u4EFB\u52A1 08 \xA7B\uFF09\uFF1A
${tierBlock}

\u539F\u6587\u4E0E\u52A8\u4F5C\uFF08\u4E0D\u7BA1\u54EA\u95E8\u5B66\u79D1\uFF0C\u90FD\u5FC5\u987B\u8DDF\u7740\u8BFE\u6587 / \u8BFE\u672C\u8D70\uFF1B\u4E00\u6761\u4E0D\u8FC7\u6574\u4EFD\u9000\u56DE\uFF09\uFF1A
\u4E00\u3001\u6709\u539F\u6587\u65F6\u5FC5\u987B\u7528\u539F\u6587\u3002\u7ED9\u4F60\u7684\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\u5C31\u662F\u8BFE\u672C\u539F\u53E5\uFF08\u8001\u5E08\u8D34\u7684\uFF0C\u6216\u8005\u5907\u8BFE\u5305\u91CC\u7ED9\u7684\uFF09\uFF0C\u5FC5\u987B\u539F\u6837\u51FA\u73B0\u5728\u5B66\u751F\u7248\u91CC\uFF0C\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u6539\uFF0C\u4E0D\u8BB8\u7F29\u5199\u3001\u4E0D\u8BB8\u8865\u6807\u70B9\u3001\u4E0D\u8BB8\u628A\u4E24\u53E5\u5408\u6210\u4E00\u53E5\u3002\u5B66\u751F\u7248\u91CC\u81F3\u5C11 30% \u7684\u9875\u662F\u539F\u6587\u9875\uFF08kind \u586B "quote"\uFF09\u3002\u5982\u679C\u7ED9\u4F60\u7684\u53E5\u5B50\u5F88\u591A\uFF08\u8001\u5E08\u8D34\u4E86\u6574\u7BC7\uFF09\uFF0C\u53EA\u6311 5\u20138 \u53E5\u505A\u539F\u6587\u9875\uFF0C\u6311\u54EA\u51E0\u53E5\u7684\u4F9D\u636E\u662F\u8BFE\u4EF6\u91CC\u8BF4\u8FD9\u8282\u8BFE\u8981\u6293\u7684\u5730\u65B9\uFF08\u91CD\u70B9\u6BB5\u3001\u5173\u952E\u8BCD\u6240\u5728\u53E5\uFF09\u3002\u5269\u4E0B\u7684\u53E5\u5B50\u4E0D\u8981\u786C\u585E\uFF0C\u5B81\u53EF\u5C11\u3002
  \u6570\u5B66\u8BFE\u7684\u5B9A\u4E49\u3001\u6CD5\u5219\u3001\u4F8B\u53E5\uFF0C\u82F1\u8BED\u8BFE\u7684\u53E5\u578B\u4E0E\u4F8B\u8BCD\uFF0C\u548C\u8BED\u6587\u7684\u8BFE\u6587\u539F\u53E5\u4E00\u6837\u90FD\u7B97\u539F\u6587\uFF1A\u8BFE\u672C\u4E0A\u600E\u4E48\u5199\u7684\u5C31\u600E\u4E48\u6446\u4E0A\u5C4F\uFF0C\u4E0D\u8BB8\u5199\u6210\u81EA\u5DF1\u7684\u8F6C\u8FF0\u3002
\u4E8C\u3001\u539F\u6587\u9875\u53EA\u653E\u4E24\u6837\u4E1C\u897F\uFF1Atext = \u539F\u6587\u91CC\u9010\u5B57\u5B58\u5728\u7684\u4E00\u53E5\uFF08\u957F\u7684\u53EF\u4EE5\u53EA\u53D6\u4E00\u4E2A\u5206\u53E5\uFF0C\u4F46\u4E0D\u80FD\u6539\u5B57\uFF09\uFF1Bnote = \u51FA\u5904\u6216\u4E00\u53E5\u63D0\u793A\uFF08\u53EF\u7A7A\uFF0C\u4E0D\u8D85\u8FC7 12 \u5B57\uFF09\u3002\u539F\u6587\u9875\u4E0D\u5199\u95EE\u53E5\u3001\u4E0D\u5199\u6761\u76EE\u3002
\u4E09\u3001\u9875\u9762\u4E0A\u7684\u6BCF\u4E00\u53E5\u8BDD\uFF0C\u90FD\u8981\u662F\u5B66\u751F\u80FD\u7ACB\u523B\u52A8\u624B\u7684\u52A8\u4F5C\u3002\u5408\u683C\uFF1A\u5708\u51FA\u7B2C 3 \u6BB5\u91CC\u5199\u6F6E\u58F0\u7684\u8BCD / \u7528\u201C\u5148\u2026\u2026\u63A5\u7740\u2026\u2026\u6700\u540E\u2026\u2026\u201D\u8BF4\u4E00\u904D / \u628A\u8FD9\u4E24\u4E2A\u5B57\u5199\u4E00\u904D\u3002\u4E0D\u5408\u683C\uFF08\u51FA\u73B0\u5373\u89C6\u4E3A\u9519\uFF09\uFF1A\u5168\u73ED\u3001\u540C\u684C\u3001\u4E92\u67E5\u3001\u5BF9\u7B54\u6848\u3001\u5C0F\u7EC4\u8BA8\u8BBA\u540E\u3001\u6C47\u62A5\u3001\u4EA4\u6D41\u4E00\u4E0B\u3002

\u786C\u89C4\u5219\uFF08\u4E00\u6761\u4E0D\u8FC7\uFF0C\u6574\u4EFD\u9000\u56DE\uFF09\uFF1A
0. \u9875\u5E8F\u4E0E\u5185\u5BB9\u4EE5\u8001\u5E08\u6539\u5B9A\u7684\u90A3\u4E00\u53E0\u8BFE\u4EF6\u4E3A\u51C6\uFF08\u89C1 user \u91CC\u5217\u51FA\u7684\u9875\uFF09\uFF1A\u53EF\u4EE5\u6362\u9875\u578B\u3001\u53EF\u4EE5\u88C1\u77ED\uFF0C\u4F46\u4E0D\u8BB8\u589E\u5220\u73AF\u8282\u3001\u4E0D\u8BB8\u6539\u52A8\u5B83\u8BB2\u7684\u987A\u5E8F\u3001\u4E0D\u8BB8\u52A0\u5165\u8BFE\u4EF6\u91CC\u6CA1\u6709\u7684\u5185\u5BB9\u3002\u8001\u5E08\u5220\u6389\u7684\u9875\uFF0C\u5B66\u751F\u7248\u91CC\u5BF9\u5E94\u5185\u5BB9\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u51FA\u73B0\uFF1B\u8001\u5E08\u63D2\u8FDB\u53BB\u7684\u9875\uFF0C\u5FC5\u987B\u6709\u4E00\u9875\u5BF9\u5E94\u3002
1. \u9875\u6570 ${pageRangeText(lim)}\uFF0C\u4E00\u9875\u53EA\u8BB2\u4E00\u4EF6\u4E8B\uFF0C\u5B81\u53EF\u591A\u4E00\u9875\u4E5F\u4E0D\u5728\u4E00\u9875\u91CC\u585E\u4E09\u4EF6\u3002
${orderRule}
3. kind \u53EA\u80FD\u662F\u8FD9\u5341\u4E00\u4E2A\u82F1\u6587\u503C\uFF1Acover | hook | goals | words | close-read | compare | board | drill | homework | end | quote\u3002
4. \u6BCF\u9875\u6B63\u6587\uFF08line + items \u5408\u8BA1\uFF09\u4E0D\u8D85\u8FC7 ${lim.bodyChars} \u4E2A\u5B57\uFF0C\u6807\u9898\u4E0D\u8BA1\u5165\uFF0C\u6807\u70B9\u548C\u7A7A\u767D\u4E0D\u8BA1\u5165\uFF1B\u8D85\u4E00\u4E2A\u5B57\u5C31\u9000\u56DE\u3002
5. \u6807\u9898\u53EA\u8BB8\u4E24\u79CD\uFF1A**\u6307\u4EE4**\uFF08\u201C\u5708\u51FA\u5199\u58F0\u97F3\u7684\u8BCD\u201D\uFF09\u6216**\u7ED3\u8BBA**\uFF08\u201C\u6F6E\u6C34\u662F\u4ECE\u8FDC\u5904\u4E00\u6761\u767D\u7EBF\u5F00\u59CB\u7684\u201D\uFF09\u3002\u4E0D\u8BB8\u5199\u201C\u4F60\u89C9\u5F97\u5462\u201D\u201C\u54EA\u4E00\u53E5\u6700\u91CD\u8981\u201D\u201C\u5148\u505A\u54EA\u4E00\u4EF6\u201D\u8FD9\u7C7B\u8981\u5B66\u751F\u731C\u8001\u5E08\u5FC3\u601D\u7684\u6807\u9898\u3002
6. goals \u9875\u7684\u6807\u9898\u56FA\u5B9A\u5199\u201C\u8FD9\u8282\u8BFE\u505A\u4E09\u4EF6\u4E8B\u201D\uFF0C\u4E09\u6761\u6761\u76EE\u5FC5\u987B\u662F\u201C\u52A8\u8BCD + \u672C\u8BFE\u7684\u4E1C\u897F\u201D\uFF08\u201C\u8BFB\u7B2C 3\u30014 \u6BB5\uFF0C\u5708\u51FA\u5199\u6F6E\u58F0\u7684\u8BCD\u201D\uFF09\uFF1B\u201C\u8BFB\u61C2\u201D\u201C\u8BF4\u51FA\u60F3\u6CD5\u201D\u201C\u5199\u4E00\u6BB5\u201D\u8FD9\u79CD\u4E09\u4E2A\u5B57\u7684\u7A7A\u8BDD\u6574\u4EFD\u9000\u56DE\u3002
7. \u7B54\u6848\u7EDD\u5BF9\u4E0D\u5199\u5728\u9875\u9762\u4E0A\uFF0C\u53EA\u5199\u8FDB notes\u3002\u9875\u9762\u4E0A\u53EA\u6709\u95EE\u53E5\u548C\u753B\u9762\uFF0Cnotes \u91CC\u624D\u662F\u8001\u5E08\u7684\u53E3\u8BED\u8BB2\u89E3\u4E0E\u63D0\u793A\u3002
8. \u4E03\u4E2A\u8BCD\u4E00\u4E2A\u90FD\u4E0D\u8BB8\u51FA\u73B0\uFF1A\u6559\u5B66\u76EE\u6807\u3001\u6559\u5B66\u91CD\u96BE\u70B9\u3001\u6559\u5B66\u8FC7\u7A0B\u3001\u73AF\u8282\u3001\u65F6\u957F\u3001\u672C\u73AF\u8282\u65E8\u5728\u3001\u6838\u5FC3\u7D20\u517B\uFF08\u9875\u9762\u548C notes \u90FD\u4E0D\u8981\u7528\uFF0Cnotes \u91CC\u8BF4\u201C\u8FD9\u4E00\u6BB5\u201D\u201C\u8FD9\u90E8\u5206\u201D\u5C31\u597D\uFF09\u3002
9. \u8BED\u8A00\u662F\u5B66\u751F\u8BED\u8A00\uFF1A\u5177\u4F53\u3001\u6709\u5F62\u3001\u80FD\u5FF5\u51FA\u53E3\u3002\u7981\u7528\u201C\u901A\u8FC7\u2026\u2026\u638C\u63E1\u2026\u2026\u201D\u201C\u65E8\u5728\u2026\u2026\u201D\u8FD9\u7C7B\u6559\u7814\u8154\u3002
10. \u5B57\u8BCD\u5173\u90A3\u4E00\u9875\u7528 kind: "words"\uFF0Citems \u91CC\u4E00\u4E2A\u8BCD\u4E00\u884C\uFF0C\u6700\u591A ${WORDS_ITEMS_MAX} \u4E2A\u8BCD\uFF08\u8FD9\u9875\u4F1A\u88AB\u653E\u5927\u5230 54pt\uFF0C\u6BCF\u8BCD\u4E0D\u8D85\u8FC7 4 \u5B57\uFF1B\u5B57\u8BCD\u9875\u4EFB\u4F55\u6863\u4F4D\u90FD\u4E0D\u8D85\u8FC7 ${WORDS_ITEMS_MAX} \u4E2A\u8BCD\uFF0C\u8FD9\u4E00\u6761\u4E0D\u968F\u6863\u4F4D\u653E\u5BBD\uFF09\u3002
11. notes \u662F\u4E0A\u53F0\u80FD\u76F4\u63A5\u5FF5\u7684\u53E3\u8BED\uFF0C\u5305\u542B\u8FD9\u4E00\u9875\u7684\u7B54\u6848\u6216\u63D0\u793A\uFF0C\u4E0D\u8D85\u8FC7 120 \u5B57\uFF0C\u4E0D\u8981\u5199\u201C\u672C\u9875\u8BB2\u89E3\u2026\u2026\u201D\u8FD9\u79CD\u65C1\u767D\u4F53\u3002
12. \u6BCF\u9875\u90FD\u5FC5\u987B\u5E26\u201C\u6750\u6599\u201D\u2014\u2014\u5B66\u751F\u4F4E\u5934\u5C31\u80FD\u6307\u7740\u7684\u4E1C\u897F\uFF1A\u4E00\u53E5\u5E26\u5F15\u53F7\u7684\u539F\u6587\uFF08\u9010\u5B57\uFF09\u3001\u672C\u8BFE\u7684\u5B57\u8BCD\u3001\u4E00\u4E2A\u7A7A\uFF08\uFF08\u3000\uFF09\uFF09\u3001\u4E00\u4E2A\u6570\u5B57\u6216\u4E00\u4E2A\u6B65\u9AA4\u3002\u53EA\u6709\u52A8\u4F5C\u3001\u6CA1\u6709\u6750\u6599\u7684\u9875\u6574\u4EFD\u9000\u56DE\uFF0C\u4F8B\uFF1A\u201C\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB\u201D\uFF08\u8BFB\u54EA\u53E5\uFF1F\uFF09\u201C\u8BFB\u4E00\u904D\u201D\uFF08\u8BFB\u4EC0\u4E48\uFF1F\uFF09\u201C\u505A\u52A8\u4F5C\u201D\uFF08\u505A\u54EA\u4E2A\uFF1F\uFF09\u3002\u5199\u6210\u201C\u628A\u2018\u7BA9\u7B50\u3001\u676D\u5DDE\u3001\u6D78\u6DA6\u2019\u653E\u56DE\u7B2C\u4E8C\u6BB5\u90A3\u53E5\u8BDD\u91CC\u8BFB\u201D\uFF0C\u6216\u8005\u5E72\u8106\u628A\u8FD9\u51E0\u4E2A\u8BCD\u76F4\u63A5\u6446\u8FDB items\u3002
13. \u6807\u9898\u4E0D\u8BB8\u662F\u628A\u8001\u5E08\u53E3\u5934\u8BDD\u5207\u4E0B\u6765\u7684\u788E\u7247\uFF1A\u201C\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB\u201D\u201C\u518D\u8BFB\u4E00\u904D\u201D\u201C\u5708\u52A8\u8BCD\u201D\u8FD9\u7C7B\u53EA\u6709\u52A8\u4F5C\u3001\u4E0D\u8BF4\u662F\u54EA\u4E2A\u5BF9\u8C61\u7684\u6807\u9898\u4E00\u5F8B\u9000\u56DE\uFF1B\u6807\u9898\u8981\u4E48\u5E26\u5BF9\u8C61\uFF08\u201C\u7BA9\u7B50\u7684\u7BA9\u201D\uFF09\uFF0C\u8981\u4E48\u5E26\u539F\u6587\uFF08\u201C\u6447\u5440\u6447\u201D\uFF09\uFF0C\u8981\u4E48\u662F\u4E00\u4E2A\u7ED3\u8BBA\u3002
13.5 items \u91CC\u6BCF\u6761\u90FD\u662F\u4E00\u4EF6\u4E1C\u897F\uFF08\u8BCD\u3001\u9010\u5B57\u539F\u6587\u3001\u6570\u5B57\u3001\u6B65\u9AA4\uFF09\uFF0C\u4E0D\u8BB8\u5199\u95EE\u53E5\u3002\u4E00\u9875\u53EA\u6709\u4E00\u4E2A\u95EE\u53E5\uFF0C\u5199\u5728 line \u91CC\uFF1Bitems \u91CC\u5199\u95EE\u53E5\u5C31\u6210\u4E86\u201C\u6B63\u6587\u662F\u539F\u6587\u3001\u6761\u76EE\u95EE\u53E6\u4E00\u4EF6\u4E8B\u201D\uFF0C\u5B66\u751F\u770B\u5230\u4E24\u5957\u8BDD\u3002
14. \u5C01\u9762\u9875\u662F\u6574\u5802\u8BFE\u7684\u95E8\u9762\uFF1Atitle \u53EA\u6709\u8BFE\u9898\u51E0\u4E2A\u5B57\uFF1Bline \u662F\u4E00\u53E5\u70B9\u9898\u7684\u526F\u9898\uFF08\u5982\u201C\u96E8\uFF0C\u4E5F\u53EF\u4EE5\u662F\u9999\u7684\u201D\uFF09\uFF0C\u4E0D\u8BB8\u5199\u6210\u63D0\u95EE\u6216\u6307\u4EE4\uFF1Bmeta\uFF08\u5B66\u6BB5\u5B66\u79D1 + \u5E74\u7EA7\u518C\u6B21\uFF0C\u5982\u201C\u5C0F\u5B66\u8BED\u6587 \xB7 \u4E94\u5E74\u7EA7\u4E0A\u518C\u201D\uFF09\u3001byline\uFF08\u5982\u201C\u4E94\u5E74\u7EA7\uFF083\uFF09\u73ED\u201D\uFF1B\u4E0D\u77E5\u9053\u73ED\u7EA7\u5C31\u5199\u201C\u4E94\u5E74\u7EA7\u3000\u3000\u73ED\u201D\uFF0C\u7559\u7A7A\u7ED9\u8001\u5E08\u586B\uFF09\u3001imageHint\uFF08\u4E00\u5F20\u80FD\u5F53\u5C01\u9762\u4E3B\u56FE\u7684\u5173\u952E\u8BCD\uFF0C\u4E0D\u5199\u6C49\u5B57\uFF09\u4E09\u6837\u90FD\u8981\u7ED9\u3002
15. \u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u56F4\u680F\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u3002
16. \u6BCF\u4E00\u9875\u90FD\u8981\u8E29\u5728\u8FD9\u4E00\u8BFE\u7684\u8BFE\u6587/\u77E5\u8BC6\u70B9\u4E0A\uFF1A\u51FA\u73B0\u672C\u8BFE\u7684\u4EBA\u7269\u3001\u5730\u540D\u3001\u7269\u4EF6\u3001\u539F\u53E5\u3001\u6570\u5B57\u6216\u6B65\u9AA4\u3002\u53EA\u8BB2\u300C\u6293\u5173\u952E\u8BCD\u300D\u300C\u600E\u4E48\u8BFB\u300D\u300C\u600E\u4E48\u60F3\u300D\u8FD9\u79CD\u54EA\u95E8\u8BFE\u90FD\u80FD\u7528\u7684\u65B9\u6CD5\u9875\uFF0C\u6574\u4EFD\u9000\u56DE\u2014\u2014\u65B9\u6CD5\u5FC5\u987B\u6302\u5728\u5177\u4F53\u5185\u5BB9\u4E0A\uFF08\u300C\u4ECE\u2018\u8D1F\u8346\u8BF7\u7F6A\u2019\u8FD9\u4E2A\u8BCD\u770B\u5EC9\u9887\u300D\uFF09\u3002

\u7ED3\u6784\uFF1A{"slides": [{"kind":"","title":"","text":"","line":"","items":[""],"imageHint":"","meta":"","byline":"","notes":"","compareDiff":[""]}]}
- title\uFF1A\u5B66\u751F\u770B\u5230\u7684\u5927\u5B57\uFF0C\u4E0D\u8D85\u8FC7 12 \u5B57
- text\uFF1A\u53EA\u7ED9 kind \u4E3A quote \u7684\u9875\u2014\u2014\u9010\u5B57\u6284 user \u91CC\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\u4E2D\u7684\u4E00\u53E5\uFF08\u90A3\u5C31\u662F\u8BFE\u672C\u539F\u53E5\uFF09\uFF0C\u5176\u4F59\u9875\u7559\u7A7A\uFF1B\u4E0D\u8BB8\u6309\u81EA\u5DF1\u7684\u8BB0\u5FC6\u53E6\u5199\u4E00\u53E5
- line\uFF1A\u4E00\u53E5\u8BDD\uFF08\u539F\u6587\u5F15\u53E5\u6216\u95EE\u53E5\uFF0C\u53EA\u80FD\u4E00\u53E5\uFF09
- items\uFF1A\u5B57\u8BCD\u9875\u3001\u4F5C\u4E1A\u9875\u3001\u5BF9\u6BD4\u9875\u7528\uFF0C\u6BCF\u9879\u4E00\u884C\uFF1B\u6BCF\u6761\u90FD\u662F\u4E00\u4EF6\u4E1C\u897F\uFF08\u8BCD / \u9010\u5B57\u539F\u6587 / \u6570\u5B57 / \u6B65\u9AA4\uFF09\uFF0C\u4E0D\u8BB8\u5199\u95EE\u53E5
- meta / byline\uFF1A\u53EA\u7ED9 cover \u9875\uFF0C\u89C1\u7B2C 14 \u6761
- compareDiff\uFF1A\u53EA\u7ED9 kind \u4E3A compare \u7684\u9875\u3002items \u6309\u5DE6\u53F3\u4E24\u680F\u4EA4\u66FF\u5206\u680F\uFF08\u7B2C 1\u30012 \u9879\u4E00\u5BF9\uFF0C\u7B2C 3\u30014 \u9879\u4E00\u5BF9\uFF0C\u843D\u5355\u7684\u5C3E\u5DF4\u4E5F\u7B97\u4E00\u5BF9\uFF09\uFF0CcompareDiff \u7B2C k \u6761\u5C31\u662F\u7B2C k \u5BF9\u300C\u54EA\u513F\u4E0D\u4E00\u6837\u300D\u7684\u63D0\u793A\uFF1A\u6761\u6570\u5FC5\u987B\u7B49\u4E8E\u5BF9\u6570\uFF0C\u6BCF\u6761\u4E0D\u8D85\u8FC7 12 \u4E2A\u5B57\uFF08\u542B\u6807\u70B9\uFF09\uFF0C\u53EA\u6307\u65B9\u5411\u4E0D\u7ED9\u7B54\u6848\uFF0C\u5B66\u751F\u70B9\u90A3\u4E00\u5BF9\u65F6\u6D6E\u5728\u4E24\u680F\u4E2D\u95F4\u3002\u7ED9\u4E0D\u9F50\u5C31\u6574\u4E2A\u5B57\u6BB5\u5B81\u53EF\u4E0D\u7ED9\uFF08\u7F51\u9875\u4F1A\u81EA\u52A8\u9000\u56DE\u4E0D\u53EF\u70B9\uFF0C\u4E0D\u4F1A\u9000\u56DE\u6574\u4EFD\u7A3F\uFF09
- imageHint\uFF1A\u53EA\u5728\u9700\u8981\u56FE\u4F4D\u65F6\u7ED9\uFF0C\u5199\u6210\u80FD\u76F4\u63A5\u7C98\u8D34\u53BB\u641C\u7684\u5173\u952E\u8BCD\uFF0C\u4E0D\u8D85\u8FC7 12 \u5B57

\u6B63\u4F8B\uFF08\u4F1A\u88AB\u7528\uFF09\uFF1A
{"kind":"close-read","title":"\u6447\u5440\u6447","line":"\u4E3A\u4EC0\u4E48\u662F\u201C\u6447\u201D\uFF0C\u4E0D\u662F\u201C\u6458\u201D\uFF1F","items":["\u201C\u6447\u5440\u6447\uFF0C\u6842\u82B1\u7EB7\u7EB7\u843D\u4E0B\u6765\u3002\u201D"],"notes":"\u63D0\u793A\uFF1A\u6447\u662F\u51E0\u4E2A\u4EBA\u62B1\u7740\u6811\u4F7F\u52B2\u6643\uFF0C\u6709\u58F0\u97F3\u3001\u6709\u52A8\u6001\u3001\u6709\u6EE1\u8EAB\u7684\u82B1\uFF1B\u6458\u662F\u4E00\u4E2A\u4EBA\u8F7B\u8F7B\u62FF\u4E0B\u6765\uFF0C\u5B89\u9759\uFF0C\u4E5F\u6CA1\u6709\u573A\u9762\u3002\u8C01\u6765\u628A\u8FD9\u53E5\u8BFB\u51FA\u6447\u7684\u52B2\u513F\uFF1F"}

\u53CD\u4F8B\uFF08\u4F1A\u88AB\u9000\u56DE\uFF09\uFF1A
{"kind":"drill","title":"\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB","notes":"\u8BA9\u5B66\u751F\u628A\u8FD9\u51E0\u4E2A\u8BCD\u653E\u56DE\u53E5\u5B50\u91CC\u8BFB\u4E00\u8BFB\u3002"}
\u8FD9\u5F20\u9519\u5728\u4E24\u5904\uFF1A\u8BFB\u54EA\u51E0\u4E2A\u8BCD\u3001\u54EA\u4E00\u53E5\uFF0C\u9875\u9762\u4E0A\u4E00\u4E2A\u90FD\u6CA1\u6709\uFF1B\u6807\u9898\u662F\u4ECE\u8BB2\u7A3F\u91CC\u5207\u4E0B\u6765\u7684\u534A\u53E5\u53E3\u5934\u8BDD\u3002

{"kind":"close-read","title":"\u6559\u5B66\u91CD\u96BE\u70B9","items":["\u73AF\u8282\u65F6\u957F 4 \u5206\u949F","\u901A\u8FC7\u54C1\u8BFB\u8BFE\u6587\u638C\u63E1\u501F\u7269\u6292\u60C5\u7684\u65B9\u6CD5"],"notes":"\u672C\u73AF\u8282\u65E8\u5728\u5F15\u5BFC\u5B66\u751F\u4F53\u4F1A\u4F5C\u8005\u60C5\u611F"}
\u8FD9\u5F20\u5E7B\u706F\u7247\u9519\u5728\u4E09\u5904\uFF1A\u628A\u6559\u6848\u6807\u9898\u642C\u4E0A\u5C4F\u3001\u5199\u4E86\u65F6\u957F\u8FD9\u79CD\u53EA\u6709\u8001\u5E08\u5173\u5FC3\u7684\u6570\u5B57\u3001\u7B54\u6848\u76F4\u63A5\u5370\u5728\u5B66\u751F\u8138\u4E0A\u3002

${VOICE_CLASSROOM}
\uFF08\u4E0A\u9762\u8FD9\u5957\u8BED\u6C14\u7BA1\u6BCF\u4E00\u9875\u7684 title / line / items \u4E0E notes\u3002\uFF09

\u6700\u540E\u68C0\u67E5\u4E00\u904D\uFF1A\u6BCF\u9875\u5B57\u6570\u8D85\u6CA1\u8D85 ${lim.bodyChars}\uFF1F\u6BCF\u9875\u90FD\u6709\u4E00\u4EF6\u5B66\u751F\u80FD\u6307\u5F97\u5230\u7684\u6750\u6599\u5417\uFF1F\u4E03\u4E2A\u7981\u8BCD\u6709\u6CA1\u6709\u6DF7\u8FDB\u6765\uFF1F\u7B54\u6848\u662F\u4E0D\u662F\u53EA\u5728 notes \u91CC\uFF1F`;
  const quotes = splitQuotes(String(plan2?.meta?.text ?? ""));
  const user = `\u8BFE\u9898\uFF1A\u300A${plan2.meta.topic}\u300B\uFF08${plan2.meta.grade}${plan2.meta.subject}\uFF0C${plan2.meta.period}\uFF09
${lesson ? `\u8FD9\u662F\u4E00\u8282 ${Math.round(Number(plan2.meta.duration) / 60)} \u5206\u949F\u7684\u5B8C\u6574\u8BFE\uFF0C\u6309\u73AF\u8282\u94FA\u5F00\uFF0C\u4E0D\u662F\u628A\u6BCF\u4E00\u9875\u88C1\u77ED\u3002
` : "\n"}${quotes.length ? `\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\uFF08\u8BFE\u6587\u539F\u6587\uFF0C\u9010\u5B57\u7528\uFF0C\u4E00\u4E2A\u5B57\u90FD\u4E0D\u8BB8\u6539\uFF09\uFF1A
${quotes.map((q, i) => `${i + 1}. ${q}`).join("\n")}

` : "\u3010\u8FD9\u8282\u8BFE\u8981\u8BB2\u7684\u53E5\u5B50\u3011\u8FD9\u6B21\u4E00\u53E5\u90FD\u6CA1\u6709\uFF08\u8001\u5E08\u6CA1\u8D34\u3001\u5907\u8BFE\u5305\u91CC\u4E5F\u6CA1\u628A\u63E1\uFF09\u2014\u2014\u8FD9\u4EFD\u7A3F\u5B50\u4E00\u9875\u539F\u6587\u9875\u90FD\u4E0D\u8BB8\u51FA\uFF08kind \u4E0D\u8BB8\u586B quote\uFF09\uFF0C\u5176\u4F59\u9875\u7167\u5E38\uFF0C\u4E0D\u8BB8\u51ED\u8BB0\u5FC6\u7F16\u4E00\u53E5\u539F\u6587\u3002\n\n"}${edited?.length ? `\u4E0B\u9762\u662F\u8001\u5E08\u5DF2\u7ECF\u6539\u5B9A\u7684\u8BFE\u4EF6\uFF0C\u9875\u5E8F\u4E0E\u6587\u5B57\u4EE5\u5B83\u4E3A\u51C6\uFF1B\u4F60\u53EF\u4EE5\u91CD\u6392\u6210\u5B66\u751F\u80FD\u770B\u7684\u9875\u578B\uFF0C\u4F46\u4E0D\u8BB8\u589E\u5220\u73AF\u8282\u3001\u4E0D\u8BB8\u6539\u52A8\u5B83\u8BB2\u7684\u987A\u5E8F\u3001\u4E0D\u8BB8\u52A0\u5165\u8BFE\u4EF6\u91CC\u6CA1\u6709\u7684\u5185\u5BB9\u3002\uFF08\u8BBE\u8BA1\u610F\u56FE\u3001\u4E0A\u8BFE\u524D\u51C6\u5907\u8FD9\u4E24\u7C7B\u662F\u7ED9\u8001\u5E08\u81EA\u5DF1\u770B\u7684\uFF0C\u4E0D\u4E0A\u5B66\u751F\u7248\uFF0C\u6E05\u5355\u91CC\u5DF2\u7ECF\u4E0D\u5217\u3002\uFF09

${deckToPrompt(edited)}

` : "\u4E0B\u9762\u662F\u6211\u7ED9\u8001\u5E08\u5907\u7684\u8BFE\u4EF6\uFF0C\u8BF7\u6539\u5199\u6210\u5B66\u751F\u8BFE\u5802\u7248\uFF1A\n\n"}${edited?.length ? "" : `${planToTeacherText(plan2)}

`}\u6309 {"slides": [...]} \u8F93\u51FA ${pageRangeText(lim)}\uFF0C\u4E25\u683C\u6309\u9875\u5E8F\u4E0E kind\uFF0C\u4E0D\u8981\u589E\u5220\u5B57\u6BB5\u3002`;
  return { system, user };
}
var VOICE_SHUOKE, VOICE_DEFENSE, VOICE_CLASSROOM, SYSTEM_PROMPT, DENSITY_MENU;
var init_prompt = __esm({
  "src/lib/prompt.ts"() {
    "use strict";
    init_deck();
    init_density();
    init_scale();
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
    DENSITY_MENU = `\u6863\u4F4D\u5224\u636E\uFF08\u5148\u6309\u8BFE\u6587\u81EA\u5DF1\u5B9A\u4E00\u6863\uFF0C\u518D\u5168\u7BC7\u5B88\u4F4F\u8FD9\u4E00\u6863\uFF0C\u522B\u4E00\u9875 lean \u4E00\u9875 rich\uFF09\uFF1A
- lean \u7CBE\u7B80\uFF1A\u8BFE\u6587\u77ED\u3001\u53E4\u8BD7\u3001\u4F4E\u5B66\u6BB5\u2014\u2014\u6B63\u6587 \u226430 \u5B57/\u9875\uFF0C10 \u9875\uFF0C\u975E\u5B57\u8BCD\u9875 items \u22644\uFF0C\u7CBE\u8BFB 2 \u9875\u3002
- standard \u6807\u51C6\uFF08\u9ED8\u8BA4\uFF0C\u62FF\u4E0D\u51C6\u5C31\u9009\u5B83\uFF09\uFF1A\u591A\u6570\u53D9\u4E8B/\u5199\u4EBA\u8BFE\u6587\u2014\u2014\u6B63\u6587 \u226460 \u5B57/\u9875\uFF0C10\u201312 \u9875\uFF0Citems \u22645\uFF0C\u7CBE\u8BFB 2\u20133 \u9875\u3002
- rich \u5145\u5B9E\uFF1A\u957F\u6587\u3001\u8BF4\u660E\u6587\u3001\u9AD8\u5B66\u6BB5\u3001\u4FE1\u606F\u5BC6\u5EA6\u5927\u2014\u2014\u6B63\u6587 \u226490 \u5B57/\u9875\uFF0C12\u201314 \u9875\uFF0Citems \u22646\uFF0C\u7CBE\u8BFB 3 \u9875\u3002`;
  }
});

// src/lib/endpoint.ts
function upstreamModel(model) {
  const m = String(model ?? "").trim();
  if (/-pro\b|v4-pro|v4\.pro/i.test(m)) return "deepseek-v4-pro";
  return "deepseek-flash";
}
function normalizeBase(input) {
  let s = String(input ?? "").trim();
  if (!s) return UPSTREAM_BASE;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  s = s.replace(/\/+$/, "");
  if (!/\/v\d/i.test(s) && !/compatible-mode/i.test(s) && !/paas\/v\d/i.test(s)) s += "/v1";
  return s;
}
function endpointOf(path, cfg, provider = "text") {
  const key = String(cfg.apiKey ?? "").trim();
  if (key) {
    return {
      url: `${normalizeBase(String(cfg.baseUrl ?? ""))}${path}`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      byok: true
    };
  }
  return {
    url: `${provider === "image" ? PROXY_IMAGE : PROXY_TEXT}${path}`,
    headers: { "Content-Type": "application/json" },
    byok: false
  };
}
var PROXY_TEXT, PROXY_IMAGE, DEEPSEEK_BASE, UPSTREAM_BASE;
var init_endpoint = __esm({
  "src/lib/endpoint.ts"() {
    "use strict";
    PROXY_TEXT = "/api/ds";
    PROXY_IMAGE = "/api/sf";
    DEEPSEEK_BASE = "https://api.deepseek.com/v1";
    UPSTREAM_BASE = DEEPSEEK_BASE;
  }
});

// src/lib/watermark.ts
var CRC_TABLE;
var init_watermark = __esm({
  "src/lib/watermark.ts"() {
    "use strict";
    CRC_TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        t[n] = c >>> 0;
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
var ILLUST_MODEL;
var init_illustrate = __esm({
  "src/lib/illustrate.ts"() {
    "use strict";
    init_endpoint();
    init_watermark();
    init_vector();
    ILLUST_MODEL = "Tongyi-MAI/Z-Image-Turbo";
  }
});

// src/lib/llm.ts
var llm_exports = {};
__export(llm_exports, {
  DEFAULT_CONFIG: () => DEFAULT_CONFIG,
  FallbackExhausted: () => FallbackExhausted,
  generatePlan: () => generatePlan,
  loadConfig: () => loadConfig,
  postChatJson: () => postChatJson,
  saveConfig: () => saveConfig,
  textChain: () => textChain
});
function normalizePauses(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (out.length >= 2) break;
    const p = item ?? {};
    const question = typeof p.question === "string" ? p.question.trim() : "";
    if (!question) continue;
    const seconds = Math.round(Number(p.seconds));
    const type = PAUSE_TYPES.includes(p.type) ? p.type : "\u786E\u8BA4\u7406\u89E3";
    out.push({
      afterText: typeof p.afterText === "string" ? p.afterText.trim() : "",
      seconds: Number.isFinite(seconds) ? Math.min(10, Math.max(3, seconds)) : 5,
      question: [...question].length > PAUSE_MAX_QUESTION ? `${[...question].slice(0, PAUSE_MAX_QUESTION - 1).join("")}\uFF1F` : question,
      type
    });
  }
  return out;
}
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw);
    const untouched = saved.baseUrl === LEGACY_DEFAULT.baseUrl && saved.model === LEGACY_DEFAULT.model;
    const base = untouched ? DEFAULT_CONFIG.baseUrl : saved.baseUrl;
    const model = untouched ? DEFAULT_CONFIG.model : saved.model;
    const textKey = String(saved.apiKey ?? "").trim();
    const imageKey = String(saved.imageKey ?? "").trim();
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      apiKey: textKey,
      imageKey: imageKey || void 0,
      ...base ? { baseUrl: normalizeBase(base) } : {},
      ...model ? { model } : {}
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
function describeError(status, detail) {
  const zh = chineseMessage(detail);
  if (zh) return zh;
  if (status === 502 || status === 504) return "\u6A21\u578B\u8FD9\u4F1A\u513F\u6CA1\u56DE\u8BDD\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u770B\u6D41\u7A0B\uFF0C\u7A0D\u540E\u518D\u70B9\u4E00\u6B21\u3002";
  if (status === 503) return "\u670D\u52A1\u5668\u8FD8\u6CA1\u914D\u597D\uFF0C\u8054\u7CFB\u90E8\u7F72\u7684\u4EBA\u3002";
  if (status === 401 || status === 403) return "\u63A5\u53E3\u4E0D\u8BA4\u8FD9\u628A key\uFF1B\u6E05\u7A7A\u8BBE\u7F6E\u9875\u91CC\u7684 key \u5C31\u8D70\u670D\u52A1\u7AEF\u3002";
  if (status === 404) return "\u63A5\u53E3\u5730\u5740\u6216\u6A21\u578B\u540D\u79F0\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5 Base URL \u548C\u6A21\u578B\u540D\u3002";
  if (status === 402) return "\u989D\u5EA6\u7528\u5B8C\u4E86\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u770B\u5B8C\u6D41\u7A0B\u3002";
  if (status === 429) return "\u8BF7\u6C42\u592A\u9891\u7E41\uFF0C\u6B47\u4E00\u4F1A\u513F\u518D\u8BD5\u3002";
  return `\u6A21\u578B\u6CA1\u6709\u56DE\u8BDD\uFF08${status}\uFF09\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u770B\u6D41\u7A0B\uFF0C\u7A0D\u540E\u518D\u70B9\u4E00\u6B21\u3002`;
}
function chineseMessage(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  try {
    const msg = JSON.parse(raw)?.error?.message;
    if (typeof msg === "string" && /[\u4e00-\u9fa5]/.test(msg)) return msg.trim();
  } catch {
  }
  if (/[\u4e00-\u9fa5]/.test(raw) && raw.length <= 80) return raw;
  return "";
}
function textChain(cfg) {
  const head = String(cfg.model ?? "").trim() || TEXT_CHAIN[0];
  if (String(cfg.apiKey ?? "").trim()) return [head];
  const raw = [head, ...TEXT_CHAIN.filter((m) => m !== head)];
  return [...new Set(raw.map(upstreamModel))];
}
function warnSwitch(from, to, why) {
  const short = (m) => m.split("/").pop()?.toLowerCase() ?? m;
  console.warn(`[fallback] \u6587\u672C ${short(from)}\u2192${short(to)} \u56E0\u4E3A ${why}`);
}
function whyOf(e) {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).replace(/\s+/g, " ").trim();
  if (/超时|timeout|abort/i.test(msg)) return "timeout";
  if (/JSON|json/i.test(msg)) return "bad json";
  if (e instanceof ApiError) return `http ${e.status}`;
  return "network";
}
function reasonOf(e) {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).replace(/\s+/g, " ").trim();
  if (/超时|timeout|abort/i.test(msg)) return "\u7B49\u592A\u4E45\u4E86";
  if (/JSON|json/i.test(msg)) return "\u56DE\u7684\u8BDD\u6CA1\u770B\u61C2";
  if (e instanceof ApiError) return "\u670D\u52A1\u90A3\u8FB9\u51FA\u4E86\u70B9\u72B6\u51B5";
  return "\u7F51\u7EDC\u65AD\u4E86";
}
async function requestChat(cfg, messages, withJsonMode, signal, temperature = 0.7, timeoutMs = CHAIN_STEP_MS) {
  const ep = endpointOf("/chat/completions", cfg);
  const controller = new AbortController();
  let timer;
  const bump = () => {
    if (timer !== void 0) window.clearTimeout(timer);
    timer = window.setTimeout(() => controller.abort(), timeoutMs);
  };
  bump();
  const relay = () => controller.abort();
  signal?.addEventListener("abort", relay);
  const timeoutText = `\u8BF7\u6C42\u8D85\u65F6\uFF08${Math.round(timeoutMs / 1e3)} \u79D2\u6CA1\u56DE\u8BDD\uFF09\u3002`;
  const fail = (e) => {
    if (signal?.aborted) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new Error(timeoutText);
    const wrapped = new Error(
      "\u8FDE\u4E0D\u4E0A\u6A21\u578B\u63A5\u53E3\uFF1A\u8981\u4E48\u8FD9\u53F0\u673A\u5668\u4E0A\u6CA1\u8DD1 server.mjs\uFF08\u7EAF\u9759\u6001\u6258\u7BA1\u65F6 /api/sf \u6CA1\u4EBA\u63A5\uFF09\uFF0C\u8981\u4E48\u63A5\u53E3\u5730\u5740\u5199\u9519\u4E86\u3002"
    );
    wrapped.cause = e;
    throw wrapped;
  };
  try {
    const body = {
      model: cfg.model,
      messages,
      temperature,
      stream: true
    };
    if (withJsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(ep.url, {
      method: "POST",
      signal: controller.signal,
      headers: ep.headers,
      body: JSON.stringify(body)
    });
    bump();
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, content: "", detail };
    }
    const ctype = res.headers?.get?.("content-type") ?? "";
    if (!res.body || ctype.includes("json") || !ctype && !res.headers?.get) {
      const data = await res.json();
      return { ok: true, status: res.status, content: String(data?.choices?.[0]?.message?.content ?? ""), detail: "" };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      bump();
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const one = JSON.parse(payload);
          const ch = one?.choices?.[0];
          out += String(ch?.delta?.content ?? ch?.message?.content ?? "");
        } catch {
        }
      }
    }
    out += decoder.decode();
    return { ok: true, status: res.status, content: out, detail: "" };
  } catch (e) {
    return fail(e);
  } finally {
    if (timer !== void 0) window.clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}
async function requestJsonOnce(cfg, messages, signal, temperature, timeoutMs) {
  let one = await requestChat(cfg, messages, true, signal, temperature, timeoutMs);
  if (!one.ok && one.status === 400 && /response_format|json_object|not.?support/i.test(one.detail)) {
    one = await requestChat(cfg, messages, false, signal, temperature, timeoutMs);
  }
  if (!one.ok) throw new ApiError(one.status, describeError(one.status, one.detail));
  if (!one.content) throw new Error("\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u5185\u5BB9\u3002");
  const content = one.content;
  try {
    return JSON.parse(extractJson(content));
  } catch {
    throw new Error("\u6A21\u578B\u8FD4\u56DE\u7684\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON\u3002");
  }
}
async function withTextChain(cfg, signal, run) {
  const models = textChain(cfg);
  const started = Date.now();
  let last = null;
  for (let i = 0; i < models.length; i++) {
    if (signal?.aborted) throw new Error("\u8BF7\u6C42\u5DF2\u53D6\u6D88\u3002");
    const left = CHAIN_BUDGET_MS - (Date.now() - started);
    if (left < 3e3) break;
    try {
      return await run({ ...cfg, model: models[i] }, Math.min(CHAIN_STEP_MS, left));
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ApiError && [401, 403, 402].includes(e.status)) throw e;
      last = e;
      if (i < models.length - 1) warnSwitch(models[i], models[i + 1], whyOf(e));
    }
  }
  const why = reasonOf(last);
  throw new FallbackExhausted(
    `\u6A21\u578B\u8FD9\u4F1A\u513F\u6CA1\u56DE\u8BDD\uFF08${why}\uFF09\uFF0C\u5148\u7528\u5185\u7F6E\u7A3F\u9876\u4E0A\uFF1B\u70B9\u300C\u91CD\u51FA\u300D\u4F1A\u518D\u8BD5\u4E00\u6B21\u3002`
  );
}
function planMessages(input) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) }
  ];
}
function fallbackPrep(preparation, topic) {
  const rep = { courseware: [], physical: [], media: [] };
  const names = preparation.split(/[、；;，,。]/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 24).slice(0, 6);
  for (const name of names) {
    if (/音频|视频|短片|朗读|录音|动画/.test(name)) {
      rep.media.push({ name, usage: "\u8BFE\u5802\u64AD\u653E", searchHint: `${topic} ${name}` });
    } else if (/卡片|实物|模型|教具|纸盒|小棒|贴纸/.test(name)) {
      rep.physical.push({ name, usage: "\u5B66\u751F\u52A8\u624B\u65F6\u4F7F\u7528" });
    } else {
      rep.courseware.push({ name, usage: "\u8BFE\u5802\u5C55\u793A\u4E0E\u8BB2\u89E3", searchHint: `${topic} ${name} \u9AD8\u6E05` });
    }
  }
  return rep;
}
function normalizePrep(raw, preparation, topic) {
  const base = fallbackPrep(preparation, topic);
  const data = raw ?? {};
  const pick = (key) => {
    const arr = data[key];
    if (!Array.isArray(arr)) return base[key];
    const items = arr.map((it) => it ?? {}).filter((it) => typeof it.name === "string" && String(it.name).trim()).slice(0, 4).map((it) => ({
      name: String(it.name).trim(),
      usage: typeof it.usage === "string" ? it.usage.trim() : "\u8BFE\u5802\u4F7F\u7528",
      ...typeof it.searchHint === "string" && it.searchHint.trim() ? { searchHint: it.searchHint.trim() } : {}
    }));
    return items.length > 0 ? items : base[key];
  };
  return { courseware: pick("courseware"), physical: pick("physical"), media: pick("media") };
}
function normalize(raw, input) {
  const data = raw ?? {};
  const str = (v, fallback = "") => typeof v === "string" && v.trim() ? v.trim() : fallback;
  const rawSegments = Array.isArray(data.segments) ? data.segments : [];
  if (rawSegments.length === 0) throw new Error("\u8FD4\u56DE\u7ED3\u679C\u91CC\u6CA1\u6709\u6559\u5B66\u73AF\u8282\uFF0C\u8BF7\u91CD\u8BD5\u4E00\u6B21\u3002");
  const ratioSum = rawSegments.reduce((sum, s) => sum + (Number(s?.ratio) || 0), 0);
  const segments = rawSegments.map((s, i) => {
    const ratio = ratioSum > 0 ? (Number(s?.ratio) || 0) / ratioSum : FALLBACK_RATIOS[i] ?? 1 / rawSegments.length;
    return {
      name: str(s?.name, `\u73AF\u8282 ${i + 1}`),
      ratio,
      goal: str(s?.goal),
      teacher: str(s?.teacher),
      student: str(s?.student),
      script: str(s?.script),
      pauses: normalizePauses(s?.pauses)
    };
  });
  const speech = Array.isArray(data.speech) ? data.speech.map((s, i) => ({
    section: str(s?.section, `\u7B2C ${i + 1} \u90E8\u5206`),
    text: str(s?.text)
  })) : [];
  const defense = Array.isArray(data.defense) ? data.defense.map((d) => ({
    question: str(d?.question),
    answer: str(d?.answer)
  })) : [];
  const order = Array.isArray(data.blackboard?.order) ? data.blackboard.order.filter((o) => typeof o === "string") : [];
  return {
    meta: {
      topic: input.topic,
      subject: input.subject,
      stage: input.stage,
      grade: input.grade,
      period: input.period,
      textbook: input.textbook,
      duration: input.duration,
      /* 原文两路（2026-11-21 用户拍的 A 案）：老师贴了就用老师的；没贴就用模型按课题
         交的课本原句，但先过 groundText 过筛（去编号/出处/解释句、去重、量长度）。
         之后的原文页全部以这份为唯一比对源（slides.ts 的 dropUnverifiedQuotes）。 */
      text: groundText(input.text, data?.meta?.text)
    },
    objectives: {
      knowledge: str(data.objectives?.knowledge),
      process: str(data.objectives?.process),
      emotion: str(data.objectives?.emotion)
    },
    keyPoint: str(data.keyPoint),
    hardPoint: str(data.hardPoint),
    preparation: str(data.preparation),
    segments,
    homework: {
      must: str(data.homework?.must),
      optional: str(data.homework?.optional)
    },
    blackboard: {
      layout: str(data.blackboard?.layout, "\uFF08\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u677F\u4E66\uFF0C\u8BF7\u91CD\u8BD5\uFF09"),
      order
    },
    prep: normalizePrep(data.prep, str(data.preparation), input.topic),
    speech,
    defense
  };
}
async function generatePlan(input, cfg, signal) {
  const messages = planMessages(input);
  const parsed = await withTextChain(
    cfg,
    signal,
    (cfgAt, timeoutMs) => requestJsonOnce(cfgAt, messages, signal, 0.7, timeoutMs)
  );
  return normalize(parsed, input);
}
async function postChatJson(messages, cfg, signal, temperature) {
  return withTextChain(
    cfg,
    signal,
    (cfgAt, timeoutMs) => requestJsonOnce(cfgAt, messages, signal, temperature ?? 0.7, timeoutMs)
  );
}
var DEFAULT_CONFIG, LEGACY_DEFAULT, STORAGE_KEY, TEXT_CHAIN, CHAIN_STEP_MS, CHAIN_BUDGET_MS, FALLBACK_RATIOS, PAUSE_TYPES, PAUSE_MAX_QUESTION, ApiError, FallbackExhausted;
var init_llm = __esm({
  "src/lib/llm.ts"() {
    "use strict";
    init_texts();
    init_illustrate();
    init_endpoint();
    init_prompt();
    DEFAULT_CONFIG = {
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      model: "deepseek-ai/DeepSeek-V4.1-Flash",
      imageModel: ILLUST_MODEL
    };
    LEGACY_DEFAULT = { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" };
    STORAGE_KEY = "yike-sangao:llm";
    TEXT_CHAIN = ["deepseek-ai/DeepSeek-V4.1-Flash", "deepseek-v4-pro"];
    CHAIN_STEP_MS = 5e4;
    CHAIN_BUDGET_MS = 15e4;
    FALLBACK_RATIOS = [0.125, 0.2, 0.4, 0.175, 0.1];
    PAUSE_TYPES = ["\u786E\u8BA4\u7406\u89E3", "\u5F15\u53D1\u601D\u8003", "\u8FC7\u6E21"];
    PAUSE_MAX_QUESTION = 20;
    ApiError = class extends Error {
      status;
      constructor(status, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
      }
    };
    FallbackExhausted = class extends Error {
      constructor(message) {
        super(message);
        this.name = "FallbackExhausted";
      }
    };
  }
});

// scripts/.cost.ts
import fs from "node:fs";
globalThis.window ??= globalThis;
var plan = JSON.parse(fs.readFileSync("/tmp/try-\u72FC\u7259\u5C71\u4E94\u58EE\u58EB-plan.json", "utf8"));
var { buildStudentSlidesPrompt: buildStudentSlidesPrompt2, SYSTEM_PROMPT: SYSTEM_PROMPT2, buildUserPrompt: buildUserPrompt2 } = await Promise.resolve().then(() => (init_prompt(), prompt_exports));
var { scaleOf: scaleOf2, limitsFor: limitsFor2 } = await Promise.resolve().then(() => (init_scale(), scale_exports));
var { DEFAULT_CONFIG: DEFAULT_CONFIG2 } = await Promise.resolve().then(() => (init_llm(), llm_exports));
function templateLen(file, name, nextMark) {
  const src = fs.readFileSync(file, "utf8");
  const at = src.indexOf(`const ${name} = \``);
  if (at < 0) return 0;
  const from = src.indexOf("`", at) + 1;
  const to = src.indexOf(nextMark, from);
  return to > from ? to - from : 0;
}
var duration = plan.meta.duration || 2400;
var scale = scaleOf2(duration);
var limits = limitsFor2(DEFAULT_CONFIG2.density, scale, duration);
var stu = buildStudentSlidesPrompt2(plan, "auto", scale);
var sysPlan = SYSTEM_PROMPT2.length;
var userPlan = buildUserPrompt2({
  topic: "\u72FC\u7259\u5C71\u4E94\u58EE\u58EB",
  subject: "",
  stage: "",
  grade: "",
  period: "\u7B2C\u4E00\u8BFE\u65F6",
  textbook: "",
  duration: 2400
}).length;
var sysDirect = templateLen("src/lib/director.ts", "DIRECT_SYSTEM", "\n\nconst TYPESET_SYSTEM");
var sysTypeset = templateLen("src/lib/director.ts", "TYPESET_SYSTEM", "\n\n/**");
var tok = (chars) => Math.round(chars * 0.65);
var planOut = JSON.stringify(plan).length;
var slidesOut = 4e3;
var directOut = 2600;
var typesetOut = 2400;
var rows = [
  { step: "\u2460 \u5907\u8BFE\u5305\uFF08\u6559\u5B66\u8BBE\u8BA1 / \u8BF4\u8BFE\u7A3F / \u677F\u4E66 / \u7B54\u8FA9\uFF09", inChars: sysPlan + userPlan, outChars: planOut },
  { step: "\u2461 \u5B66\u751F\u7248\u9875\u9762", inChars: stu.system.length + stu.user.length, outChars: slidesOut },
  { step: "\u2462 \u5BFC\u6F14\uFF08\u54EA\u9875\u914D\u56FE\u3001\u753B\u4EC0\u4E48\u3001\u7559\u767D\uFF09", inChars: sysDirect + 2600, outChars: directOut },
  { step: "\u2463 \u6392\u7248\uFF08\u6309\u91CF\u7684\u5C3A\u5BF8\u843D\u6BCF\u4E00\u9875\uFF09", inChars: sysTypeset + 3e3, outChars: typesetOut }
];
var inTok = 0;
var outTok = 0;
console.log("=== \u4E00\u6B21\u300C\u8BFE\u4EF6 + \u5B66\u751F\u7248 PPT\u300D\u7684\u6587\u672C\u7528\u91CF\uFF08\u300A\u72FC\u7259\u5C71\u4E94\u58EE\u58EB\u300B40 \u5206\u949F\u5B9E\u6D4B\u7A3F\uFF09 ===");
for (const r of rows) {
  const i = tok(r.inChars);
  const o = tok(r.outChars);
  inTok += i;
  outTok += o;
  console.log(
    `${r.step}
    \u8F93\u5165 ${String(r.inChars).padStart(6)} \u5B57 \u2248 ${String(i).padStart(5)} tok \uFF5C \u8F93\u51FA ${String(r.outChars).padStart(5)} \u5B57 \u2248 ${String(o).padStart(5)} tok`
  );
}
console.log(`
\u5408\u8BA1\uFF1A\u8F93\u5165 \u2248 ${inTok} tok \uFF0F \u8F93\u51FA \u2248 ${outTok} tok`);
console.log(`\u5B66\u751F\u7248\u63D0\u793A\u8BCD\uFF1Asystem ${stu.system.length} \u5B57 + user ${stu.user.length} \u5B57`);
console.log(`\u5907\u8BFE\u5305\u7CFB\u7EDF\u63D0\u793A\u8BCD ${sysPlan} \u5B57 + \u7528\u6237 ${userPlan} \u5B57\uFF1B\u5BFC\u6F14 ${sysDirect} \u5B57\uFF1B\u6392\u7248 ${sysTypeset} \u5B57`);
console.log(`\u9875\u6570\u533A\u95F4 ${limits.pagesMin}\u2013${limits.pagesMax}\uFF0C\u6B63\u597D\u5361\u5728\u4E0B\u9650\u9644\u8FD1\uFF08\u8584\u6559\u6848\uFF09`);
var price = (inYuan, outYuan) => ((inTok * inYuan + outTok * outYuan) / 1e6).toFixed(4);
console.log("\n=== \u6587\u672C\u8D39\u7528\uFF08\u4E0D\u542B\u751F\u56FE\uFF09 ===");
console.log(`  \xA52 / \xA58 \u6BCF\u767E\u4E07 tok  \u2192  \xA5${price(2, 8)} \u4E00\u6B21`);
console.log(`  \xA51 / \xA54 \u6BCF\u767E\u4E07 tok  \u2192  \xA5${price(1, 4)} \u4E00\u6B21`);
console.log(`  \xA50.5 / \xA52 \u6BCF\u767E\u4E07 tok \u2192 \xA5${price(0.5, 2)} \u4E00\u6B21`);
console.log("\n\u751F\u56FE\uFF1A6 \u5F20\uFF0840 \u5206\u949F\u6863\uFF09\uFF0C\u6BCF\u5F20\u6309 \xA50.01\u20130.05 \u4F30 \u2192 \xA50.06\u20130.30");
console.log("\u4E00\u6B21\u5B8C\u6574\u751F\u6210\uFF08\u6587\u672C + 6 \u5F20\u56FE\uFF09\uFF1A\xA50.10 \u2013 \xA50.50\uFF0C\u53D6\u4E2D\u4F4D\u7EA6 \xA50.25");
console.log("\n\u4EE5 \xA510 \u4F59\u989D\u8BA1\uFF1A\u7EA6 20\u201390 \u6B21\uFF1B\xA550\uFF1A\u7EA6 100\u2013450 \u6B21");
