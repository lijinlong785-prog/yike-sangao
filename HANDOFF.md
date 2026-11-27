# 现在要做的事（2026-11-21 14:30 交接）

> Qoder 里照抄下面这一句发出去即可。**四份全做完再汇报**，中间不要问。

---

## 唯一入口

```
按 TASKS/00-DO-ALL-NOW.md 执行，四份全做完再报，中间不要问。
```

顺序固定，不许调换：

1. `TASKS/22-student-is-not-deck.md` —— 学生版不许抄课件（`npm run check:student-not-deck`）
2. `TASKS/20b-cover-full-bleed.md` —— 封面满版（`npm run check:cover`）
3. `TASKS/23-four-real-layouts.md` —— 四套模板真不同（`npm run check:layout-distinct`）
4. `TASKS/21-deck-editable.md` —— PPT 可增删改（`npm run check:deck-edit`）

---

## 如果只想先发一份

那就发这一段（其余三份等这份验收过再说）：

```
按 TASKS/22-student-is-not-deck.md 执行。

核心：学生版 PPT 现在是从课件页逐页搬过来的（slides.ts:2679 deckPageSlide 注释就写着「内容照搬」），
必须改成「先捞素材、再按学生页型重建」，素材撑不起来就交内置学生版，绝不用课件页凑数。

验收：npm run check:student-not-deck（新建）+ npm run check:all 全绿
交付：deck-观潮.pptx + student-观潮.pptx 两份、各前 6 页缩略图、
     10 行「同一位置课件写什么 / 学生版写什么」对照表、改动清单。
```

---

## 背景材料（可读可不读，不影响动手）

- `AUDIT-2026-11-21.md` —— 12 个坑的完整清单，带文件行号
- `TASKS/00-DO-ALL-NOW.md` —— 全局红线 + 最终五样交付

## 不要做的事

- 不要重做 20（已完成）、19a（已完成）、18（已完成）、16（已完成）
- 不要改 `theme.ts` 的四套色值
- 不要放宽任何门禁阈值
