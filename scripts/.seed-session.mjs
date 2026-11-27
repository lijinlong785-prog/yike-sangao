// scripts/.seed-session.ts
import { readFileSync, writeFileSync } from "node:fs";

// src/lib/density.ts
var DENSITY_ORDER = ["lean", "standard", "rich"];
var DEFAULT_DENSITY = "standard";
var DENSITY = {
  lean: { bodyChars: 30, pagesMin: 10, pagesMax: 10, itemsMax: 4, closeReadMax: 2 },
  standard: { bodyChars: 60, pagesMin: 10, pagesMax: 12, itemsMax: 5, closeReadMax: 3 },
  rich: { bodyChars: 90, pagesMin: 12, pagesMax: 14, itemsMax: 6, closeReadMax: 3 }
};
var DEFAULT_LIMITS = DENSITY[DEFAULT_DENSITY];
var ENVELOPE = {
  bodyChars: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].bodyChars)),
  pagesMin: Math.min(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMin)),
  pagesMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].pagesMax)),
  itemsMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].itemsMax)),
  closeReadMax: Math.max(...DENSITY_ORDER.map((d) => DENSITY[d].closeReadMax))
};
var PAGE_RANGE = { min: ENVELOPE.pagesMin, max: ENVELOPE.pagesMax };

// src/lib/scale.ts
var LESSON_MIN_SECONDS = 1200;
var PLANS = {
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
function scaleOf(duration2) {
  const d = Number(duration2);
  if (!Number.isFinite(d) || d < LESSON_MIN_SECONDS) return "clip";
  return "lesson";
}
var M20_MAX_SECONDS = 1500;
var M30_MAX_SECONDS = 2100;
var TIERS = {
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

// src/lib/scene.ts
import { GIFEncoder } from "gifenc/dist/gifenc.esm.js";
var SCENE = {
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
var PAL = SCENE.width * SCENE.height;

// src/lib/deck.ts
function shortSentences(text, limit) {
  return String(text ?? "").split(/[。；;\n]/).map((s) => s.trim().replace(/^[，,、]/, "")).filter((s) => s.length > 1).slice(0, limit).map((s) => s.length > 46 ? `${s.slice(0, 45)}\u2026` : s);
}
function clip(text, max) {
  const chars = [...String(text ?? "").trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}\u2026` : chars.join("");
}
function mmss(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function uniqueTitles(pages) {
  const seen = /* @__PURE__ */ new Map();
  return pages.map((p) => {
    const n = (seen.get(p.title) ?? 0) + 1;
    seen.set(p.title, n);
    return n === 1 ? p : { ...p, title: `${p.title}\uFF08${n}\uFF09` };
  });
}
function coverPage(plan2) {
  const scale = scaleOf(plan2.meta.duration);
  return {
    kind: "cover",
    label: "\u8BFE\u9898",
    title: `\u300A${plan2.meta.topic}\u300B`,
    bullets: [
      `${plan2.meta.stage}${plan2.meta.grade} \xB7 ${plan2.meta.subject} \xB7 ${plan2.meta.period}`,
      plan2.meta.textbook ? plan2.meta.textbook : "\u6559\u6750\u7248\u672C\u4E0D\u9650",
      `${mmss(plan2.meta.duration)}`
    ],
    notes: `\u5404\u4F4D\u8BC4\u59D4\u8001\u5E08\u597D\uFF0C\u6211\u8BF4\u8BFE\u7684\u9898\u76EE\u662F\u300A${plan2.meta.topic}\u300B\uFF0C\u9009\u81EA${plan2.meta.textbook || ""}${plan2.meta.stage}${plan2.meta.grade}\uFF0C\u672C\u6B21\u4E3A${plan2.meta.period}\u3002${scale === "lesson" ? "\u6211\u628A\u6BCF\u4E2A\u73AF\u8282\u8981\u505A\u4EC0\u4E48\u3001\u8981\u505C\u5728\u54EA\u91CC\u95EE\uFF0C\u90FD\u5199\u5728\u540E\u9762\u51E0\u9875\u3002" : ""}\u4E0B\u9762\u5F00\u59CB\u6211\u7684\u8BFE\u5802\u3002`
  };
}
function objectivesPage(plan2) {
  return {
    kind: "objectives",
    label: "\u5B66\u4E60\u76EE\u6807",
    title: "\u8FD9\u4E00\u8BFE\u8981\u5E26\u5B66\u751F\u5F04\u61C2\u4EC0\u4E48",
    bullets: [
      `\u8BFE\u6587\u91CC\u7684\uFF5C${clip(plan2.objectives.knowledge, 56)}`,
      `\u8BFE\u4E0A\u600E\u4E48\u7EC3\uFF5C${clip(plan2.objectives.process, 56)}`,
      `\u8BFB\u5B8C\u7559\u4E0B\u7684\uFF5C${clip(plan2.objectives.emotion, 56)}`
    ],
    notes: `\u8FD9\u4E00\u8BFE\u6211\u53EA\u76EF\u4E09\u4EF6\u4E8B\u3002\u7B2C\u4E00\uFF0C\u8BFE\u6587\u8981\u8BFB\u51C6\u3001\u8BFB\u61C2\uFF1A${plan2.objectives.knowledge} \u7B2C\u4E8C\uFF0C\u65B9\u6CD5\u8981\u5728\u8BFE\u4E0A\u7EC3\u51FA\u6765\uFF1A${plan2.objectives.process} \u7B2C\u4E09\uFF0C\u8BFB\u5B8C\u5FC3\u91CC\u5F97\u7559\u4E0B\u70B9\u4E1C\u897F\uFF1A${plan2.objectives.emotion}`
  };
}
function keyPointsPage(plan2) {
  return {
    kind: "keypoints",
    label: "\u91CD\u96BE\u70B9",
    title: "\u54EA\u4E00\u5904\u8981\u591A\u82B1\u65F6\u95F4\uFF0C\u54EA\u4E00\u5904\u4F1A\u5361\u4F4F",
    bullets: [`\u8981\u591A\u82B1\u65F6\u95F4\u7684\uFF5C${clip(plan2.keyPoint, 60)}`, `\u5BB9\u6613\u5361\u4F4F\u7684\uFF5C${clip(plan2.hardPoint, 60)}`],
    notes: `\u8FD9\u4E00\u8BFE\u7684\u91CD\u70B9\u662F${plan2.keyPoint}\u3002\u96BE\u70B9\u662F${plan2.hardPoint}\u3002\u5230\u96BE\u70B9\u6211\u4F1A\u6162\u4E0B\u6765\uFF0C\u5148\u8BA9\u5B66\u751F\u81EA\u5DF1\u8BF4\uFF0C\u8BF4\u9519\u4E86\u518D\u56DE\u53BB\u8BFB\u8BFE\u6587\u3002`
  };
}
function designPage(plan2, timed) {
  const first = timed[0];
  const middle = timed[Math.floor(timed.length / 2)];
  return {
    kind: "design",
    label: "\u8BBE\u8BA1\u610F\u56FE",
    title: "\u8FD9\u4E00\u8BFE\uFF0C\u6211\u8FD9\u4E48\u60F3",
    bullets: [
      `\u4ECE\u300C${first?.name ?? "\u5BFC\u5165"}\u300D\u8FDB\u6765\uFF1A${clip(first?.goal ?? "", 44)}`,
      `\u4E2D\u95F4\u8FD9\u4E00\u6BB5\u653E\u5F00\u624B\u8BA9\u5B66\u751F\u8BD5\uFF1A${clip(middle?.goal ?? plan2.keyPoint, 44)}`,
      `\u6700\u540E\u6536\u5728\u300C${clip(plan2.keyPoint, 40)}\u300D\u4E0A`
    ],
    notes: `\u5148\u8BF4\u8FD9\u4E00\u8BFE\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u6392\u3002\u5F00\u5934\u4E0D\u8BB2\u77E5\u8BC6\uFF0C\u5148\u628A\u5B66\u751F\u62C9\u8FDB\u90A3\u4E2A\u573A\u666F\uFF0C${clip(first?.goal ?? "", 40)} \u4E2D\u6BB5\u662F\u5B66\u751F\u81EA\u5DF1\u52A8\u624B\u3001\u81EA\u5DF1\u8BF4\u7684\u90A3\u4E00\u6BB5\uFF0C\u6211\u9000\u5230\u65C1\u8FB9\uFF0C\u53EA\u5728\u4ED6\u4EEC\u5361\u4F4F\u65F6\u9012\u4E00\u53E5\u3002\u6700\u540E\u56DE\u5230${clip(plan2.keyPoint, 36)}\uFF0C\u8BA9\u8FD9\u4E00\u8282\u8BFE\u6709\u4E00\u4E2A\u80FD\u5E26\u8D70\u7684\u843D\u70B9\u3002`
  };
}
function hardPointPage(plan2) {
  return {
    kind: "hardpoint",
    label: "\u96BE\u70B9\u600E\u4E48\u529E",
    title: "\u5361\u4F4F\u7684\u5730\u65B9\uFF0C\u6211\u51C6\u5907\u8FD9\u4E48\u62C6",
    bullets: [
      `\u5361\u5728\u54EA\uFF5C${clip(plan2.hardPoint, 50)}`,
      `\u5148\u7ED9\u4EC0\u4E48\uFF5C\u4E00\u4E2A\u770B\u5F97\u89C1\u3001\u6478\u5F97\u7740\u7684\u4E1C\u897F\uFF0C\u8BA9\u5B66\u751F\u6709\u8BDD\u53EF\u8BF4`,
      `\u7136\u540E\u518D\u95EE\uFF5C\u300C\u4F60\u4ECE\u54EA\u513F\u770B\u51FA\u6765\u7684\u300D\uFF0C\u8BA9\u5B66\u751F\u81EA\u5DF1\u56DE\u5230\u8BFE\u6587`
    ],
    notes: `\u8FD9\u4E2A\u96BE\u70B9\u6211\u4E0D\u76F4\u63A5\u8BB2\u7B54\u6848\u3002${clip(plan2.hardPoint, 60)} \u76F4\u63A5\u8BB2\uFF0C\u5B66\u751F\u70B9\u5934\uFF0C\u4E0B\u8BFE\u5C31\u5FD8\u3002\u6211\u5148\u7ED9\u4E00\u4E2A\u5177\u4F53\u7684\u4E1C\u897F\u8BA9\u4ED6\u770B\u3001\u8BA9\u4ED6\u6478\uFF0C\u518D\u95EE\u300C\u4F60\u4ECE\u54EA\u513F\u770B\u51FA\u6765\u7684\u300D\uFF0C\u8BA9\u4ED6\u81EA\u5DF1\u8D70\u5230\u90A3\u53E5\u8BDD\u4E0A\u3002\u771F\u6CA1\u4EBA\u63A5\uFF0C\u5C31\u56DE\u9ED1\u677F\u90A3\u4E00\u884C\uFF0C\u8BF7\u521A\u624D\u6CA1\u4E3E\u624B\u7684\u5B69\u5B50\u518D\u8BF4\u4E00\u904D\u3002`
  };
}
function segmentPage(seg, index, total) {
  const acts = shortSentences(seg.teacher, 2);
  return {
    kind: "segment",
    label: total > 1 ? `\u73AF\u8282 ${String(index + 1).padStart(2, "0")}` : "\u6559\u5B66\u8FC7\u7A0B",
    title: seg.name,
    duration: mmss(seg.seconds),
    bullets: acts.length > 0 ? acts : [seg.goal],
    question: seg.pauses?.[0]?.question,
    notes: [
      seg.script,
      ...(seg.pauses ?? []).map((p) => `\uFF08\u505C ${p.seconds} \u79D2\uFF09${p.question}`)
    ].join(" ")
  };
}
function segmentPointPage(seg, index) {
  const stu = shortSentences(seg.student, 2);
  const first = stu[0] ?? seg.goal;
  return {
    kind: "segmentPoint",
    label: `\u73AF\u8282 ${String(index + 1).padStart(2, "0")} \xB7 \u5B66\u751F\u505A\u4EC0\u4E48`,
    title: clip(first, 26),
    duration: mmss(seg.seconds),
    bullets: [
      `\u8981\u505A\u7684\uFF5C${clip(seg.goal, 52)}`,
      ...stu.length > 0 ? stu.map((s) => `\u5B66\u751F\uFF5C${s}`) : ["\u5B66\u751F\uFF5C\u5148\u81EA\u5DF1\u8BD5\uFF0C\u518D\u540C\u684C\u8BF4"]
    ],
    question: seg.pauses?.[1]?.question ?? seg.pauses?.[0]?.question,
    notes: `${clip(seg.goal, 50)} \u8FD9\u4E00\u6BB5\u6211\u4E0D\u66FF\u4ED6\u4EEC\u8BF4\u3002${stu.length > 0 ? stu.join("\uFF0C") + "\u3002" : ""}\u7ED9\u8DB3\u65F6\u95F4\uFF0C\u7B49\u4E09\u4E94\u4E2A\u5B69\u5B50\u4E3E\u624B\u518D\u70B9\u4EBA\uFF0C\u8BF4\u9519\u4E86\u4E5F\u8BA9\u4ED6\u8BF4\u5B8C\u3002`
  };
}
function pausePage(seg, pause) {
  return {
    kind: "pause",
    label: "\u505C\u4E00\u505C",
    title: `\u505C ${pause.seconds} \u79D2\uFF1A${clip(pause.question, 20)}`,
    question: pause.question,
    bullets: [`\u5728\u300C${clip(seg.name, 18)}\u300D\u8FD9\u4E00\u6BB5\u505C\u4E0B\u6765`, `\u95EE\u5B8C\u4E0D\u8981\u9A6C\u4E0A\u63A5\u8BDD\uFF0C\u7B49\u624B\u4E3E\u8D77\u6765`],
    notes: `\uFF08\u505C ${pause.seconds} \u79D2\uFF09${pause.question} \u95EE\u5B8C\u5C31\u95ED\u5634\uFF0C\u6570\u5230\u4E09\uFF0C\u522B\u81EA\u5DF1\u628A\u7B54\u6848\u8BF4\u4E86\u3002\u6709\u4EBA\u4E3E\u624B\u518D\u70B9\u4EBA\uFF1B\u6CA1\u4EBA\u4E3E\u624B\uFF0C\u5C31\u6362\u6210\u300C\u8BF4\u7ED9\u4F60\u65C1\u8FB9\u7684\u4EBA\u542C\u300D\u3002`
  };
}
function activityPage(plan2, timed) {
  const pick = timed.find((s) => /练习|活动|操作|动手|搭建|摆|算一算|写一写|画一画|讨论|合作/.test(`${s.name}${s.teacher}${s.goal}`)) ?? timed[timed.length - 1];
  const stu = shortSentences(pick?.student ?? "", 2);
  return {
    kind: "activity",
    label: "\u8BFE\u4E2D\u6D3B\u52A8",
    title: `\u5B66\u751F\u81EA\u5DF1\u505A\uFF1A${clip(pick?.name.split("\xB7").pop()?.trim() ?? "\u8FD9\u4E00\u6BB5", 16)}`,
    duration: pick ? mmss(pick.seconds) : void 0,
    bullets: [
      `\u505A\u4EC0\u4E48\uFF5C${clip(pick?.name ?? plan2.keyPoint, 40)}`,
      ...stu.length > 0 ? stu.map((s) => `\u5B66\u751F\uFF5C${s}`) : ["\u5B66\u751F\uFF5C\u540C\u684C\u4E92\u76F8\u8BF4\u4E00\u904D\uFF0C\u518D\u8BF7\u4E24\u4E2A\u5168\u73ED\u8BF4"],
      "\u6211\u505A\u4EC0\u4E48\uFF5C\u8D70\u4E0B\u53BB\u542C\uFF0C\u6311\u4E00\u4E2A\u8BF4\u5F97\u4E0D\u4E00\u6837\u7684\uFF0C\u7559\u5230\u5168\u73ED\u8BB2"
    ],
    question: pick?.pauses?.[0]?.question ?? "\u8C01\u7684\u8BF4\u6CD5\u548C\u521A\u624D\u4E0D\u4E00\u6837\uFF1F",
    notes: `\u8FD9\u4E00\u6BB5\u6211\u5C11\u8BF4\u8BDD\u3002${clip(pick?.goal ?? plan2.keyPoint, 46)} \u5B66\u751F\u5728\u4E0B\u9762\u505A\uFF0C\u6211\u8D70\u4E0B\u53BB\u542C\uFF0C\u4E13\u95E8\u6311\u4E00\u4E2A\u8BF4\u5F97\u4E0D\u4E00\u6837\u7684\uFF0C\u7B49\u4F1A\u513F\u8BF7\u4ED6\u4E0A\u6765\u8BB2\u3002\u505A\u4E0D\u5B8C\u4E0D\u8981\u7D27\uFF0C\u505A\u9519\u4E5F\u4E0D\u8981\u7D27\uFF0C\u8FD9\u4E00\u6BB5\u5C31\u662F\u8981\u770B\u89C1\u4ED6\u4EEC\u600E\u4E48\u60F3\u3002`
  };
}
function assessmentPage(plan2, timed) {
  const last = timed[timed.length - 1];
  return {
    kind: "assessment",
    label: "\u5F53\u5802\u68C0\u6D4B",
    title: "\u4E0B\u8BFE\u4E4B\u524D\uFF0C\u5BF9\u4E00\u5BF9",
    bullets: [
      `\u6BCF\u4E2A\u4EBA\u90FD\u8981\u4F1A\uFF5C${clip(plan2.keyPoint, 40)}`,
      `\u80FD\u8BF4\u6E05\u7684\u624D\u7B97\u8FC7\uFF5C${clip(plan2.hardPoint, 38)}`,
      "\u600E\u4E48\u67E5\uFF5C\u6311\u4E24\u4E2A\u4EBA\u8BF4\u4E00\u904D\uFF0C\u8BF4\u4E0D\u6E05\u5C31\u56DE\u5230\u677F\u4E66\u90A3\u4E00\u884C"
    ],
    question: last?.pauses?.[0]?.question ?? "\u8C01\u80FD\u7528\u4E00\u53E5\u8BDD\u8BF4\u6E05\u4ECA\u5929\u5B66\u4E86\u4EC0\u4E48\uFF1F",
    notes: `\u6700\u540E\u7559\u4E24\u5206\u949F\u5BF9\u4E00\u5BF9\u3002${clip(plan2.keyPoint, 40)} \u8FD9\u6761\u6BCF\u4E2A\u4EBA\u90FD\u5F97\u4F1A\u3002\u8BF7\u4E24\u4E2A\u5B69\u5B50\u7528\u81EA\u5DF1\u7684\u8BDD\u8BF4\u4E00\u904D\uFF0C\u8BF4\u4E0D\u6E05\u7684\u5730\u65B9\uFF0C\u8BF4\u660E\u6211\u524D\u9762\u8BB2\u5FEB\u4E86\uFF0C\u4E0B\u4E00\u8282\u8BFE\u8865\u3002`
  };
}
function boardPage(plan2) {
  return {
    kind: "board",
    label: "\u677F\u4E66\u8BBE\u8BA1",
    title: "\u8FD9\u4E00\u8BFE\uFF0C\u843D\u5728\u8FD9\u51E0\u884C\u5B57\u4E0A",
    bullets: plan2.blackboard.order.slice(0, 5),
    notes: `\u677F\u4E66\u6309\u8FD9\u4E2A\u987A\u5E8F\u5199\uFF1A${plan2.blackboard.order.join("\uFF1B")}\u3002\u5B57\u4E0D\u591A\uFF0C\u4F46\u6BCF\u4E00\u884C\u90FD\u8981\u5728\u5BF9\u5E94\u7684\u73AF\u8282\u843D\u4E0B\u53BB\u3002`
  };
}
function prepPage(plan2) {
  return {
    kind: "prep",
    label: "\u6559\u5B66\u51C6\u5907",
    title: "\u4E0A\u8BFE\u524D\uFF0C\u628A\u8FD9\u4E9B\u5907\u9F50",
    prep: [
      { heading: "\u8BFE\u4EF6\u7D20\u6750", items: plan2.prep.courseware },
      { heading: "\u5B9E\u7269\u6559\u5177", items: plan2.prep.physical },
      { heading: "\u97F3\u89C6\u9891", items: plan2.prep.media }
    ],
    figureHint: "\u6B64\u5904\u653E\uFF1A\u672C\u8BFE\u4E3B\u56FE\uFF08\u6309\u68C0\u7D22\u8BCD\u81EA\u884C\u4E0B\u8F7D\u540E\u66FF\u6362\uFF09",
    notes: "\u6559\u5B66\u51C6\u5907\u5206\u4E09\u7EC4\uFF1A\u8BFE\u4EF6\u7D20\u6750\u3001\u5B9E\u7269\u6559\u5177\u3001\u97F3\u89C6\u9891\u3002\u6BCF\u4E00\u9879\u90FD\u5199\u4E86\u7528\u9014\u548C\u68C0\u7D22\u8BCD\uFF0C\u6309\u6E05\u5355\u5907\u9F50\u5373\u53EF\uFF0C\u4E0D\u9700\u8981\u989D\u5916\u5236\u4F5C\u3002"
  };
}
function homeworkPage(plan2) {
  return {
    kind: "homework",
    label: "\u4F5C\u4E1A",
    title: "\u8BFE\u540E\u505A\u4E24\u4EF6\u4E8B",
    bullets: [`\u5FC5\u505A\uFF5C${clip(plan2.homework.must, 60)}`, `\u9009\u505A\uFF5C${clip(plan2.homework.optional, 60)}`],
    notes: `\u4F5C\u4E1A\u5206\u4E24\u5C42\u3002\u5FC5\u505A\uFF1A${plan2.homework.must} \u9009\u505A\uFF1A${plan2.homework.optional}`
  };
}
function buildDeck(plan2, timed) {
  const scale = scaleOf(plan2.meta.duration);
  const lesson = scale === "lesson";
  const range = deckRangeFor(plan2.meta.duration);
  const segs = timed.length > 0 ? timed : [];
  const head = [
    coverPage(plan2),
    objectivesPage(plan2),
    keyPointsPage(plan2),
    designPage(plan2, segs)
  ];
  if (lesson) head.push(hardPointPage(plan2));
  const blocks = segs.map((seg, i) => {
    const block = [segmentPage(seg, i, segs.length)];
    if (lesson) block.push(segmentPointPage(seg, i));
    return block;
  });
  const tail = lesson ? [
    activityPage(plan2, segs),
    assessmentPage(plan2, segs),
    boardPage(plan2),
    prepPage(plan2),
    homeworkPage(plan2)
  ] : [boardPage(plan2), prepPage(plan2), homeworkPage(plan2)];
  const count = () => head.length + blocks.reduce((n, b) => n + b.length, 0) + tail.length;
  for (let i = 0; i < blocks.length && count() < range.min; i++) {
    const pause = segs[i].pauses?.[0];
    if (pause) blocks[i].push(pausePage(segs[i], pause));
  }
  const byLength = blocks.map((b, i) => ({ i, secs: segs[i].seconds })).sort((a, b) => b.secs - a.secs);
  for (const { i } of byLength) {
    if (count() >= range.min) break;
    blocks[i].push(segmentPointPage(segs[i], i));
  }
  const pages = [...head, ...blocks.flat(), ...tail];
  while (pages.length > range.max) {
    const at = pages.map((p) => p.kind).lastIndexOf("pause");
    if (at < 0) break;
    pages.splice(at, 1);
  }
  return uniqueTitles(pages).map((p) => p.baseTitle ? p : { ...p, baseTitle: p.title });
}
function deckFingerprint(pages) {
  const list = pages ?? [];
  let h = 2166136261;
  const feed = (text) => {
    const s = String(text ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 31;
    h = Math.imul(h, 16777619);
  };
  for (const page of list) {
    feed(page?.kind);
    feed(page?.title);
    for (const b of page?.bullets ?? []) feed(b);
    feed(page?.question);
  }
  return `${list.length}-${(h >>> 0).toString(36)}`;
}

// src/lib/timing.ts
function allocate(segments, total) {
  let acc = 0;
  const out = segments.map((s, i) => {
    const last = i === segments.length - 1;
    const seconds = last ? total - acc : Math.round(total * s.ratio);
    const start = acc;
    acc += seconds;
    return { ...s, seconds, start, end: acc };
  });
  return out;
}

// src/lib/deck2/edits.ts
var EMPTY_EDITS = Object.freeze({
  order: Object.freeze([]),
  removed: Object.freeze([]),
  patches: Object.freeze({})
});

// src/lib/session.ts
var SESSION_VERSION = 1;
function planKeyOf(plan2, duration2) {
  if (!plan2) return "";
  const topic = String(plan2.meta?.topic ?? "").trim();
  const period = String(plan2.meta?.period ?? "").trim();
  return `${topic}|${period}|${tierOf(duration2)}`;
}

// scripts/.seed-session.ts
var plan = JSON.parse(readFileSync("/tmp/real/plan.json", "utf8"));
var slides = JSON.parse(readFileSync("/tmp/real/slides.json", "utf8"));
var duration = 40 * 60;
var deck = buildDeck(plan, allocate(plan.segments, plan.meta.duration));
var input = {
  topic: "\u6842\u82B1\u96E8",
  subject: "\u8BED\u6587",
  stage: "\u5C0F\u5B66",
  grade: "\u4E94\u5E74\u7EA7",
  period: "\u7B2C\u4E00\u8BFE\u65F6",
  textbook: "\u90E8\u7F16\u7248",
  duration
};
var snapshot = {
  v: SESSION_VERSION,
  savedAt: Date.now(),
  input,
  plan,
  duration,
  isDemo: false,
  planKey: planKeyOf(plan, duration),
  slides,
  fingerprint: deckFingerprint(deck),
  degraded: false,
  edits: EMPTY_EDITS,
  templateId: "suke",
  tab: "student",
  slideAt: 0
};
writeFileSync("/tmp/real/session.json", JSON.stringify(snapshot));
console.log(
  `session.json \u5C31\u7EEA\uFF1AplanKey=${snapshot.planKey} / slides=${slides.length} / fingerprint=${snapshot.fingerprint} / ${(JSON.stringify(snapshot).length / 1024).toFixed(0)}KB`
);
