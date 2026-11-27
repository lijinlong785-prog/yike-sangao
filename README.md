# 一课三稿 · Editorial Studio

> **2026 Qoder 高校创造力大赛（StudyHack 赛道）参赛最终版**  
> 一句课题，同步生成可原地编辑的**教学设计**、**教师课件**与**公开课级学生 PPT**，改完直出 Word / `.pptx` / Markdown。免 API Key 即可 0 秒体验全部内置示范课，适配纯静态 **Qoder Sites** 一键部署。

📖 **逐功能实拍介绍（《荷塘月色》12 张 1600×1000 Retina 2x 逐功能截图 + 逐张配文）**：请查阅 [《一课三稿 · 参赛功能介绍.md》](./一课三稿%20·%20参赛功能介绍.md)（截图位于 [`docs/shots/`](./docs/shots/)）

---

## 核心升级亮点（7 大生产力模块）

1. **公开课 PPT 视觉系统 + 16:9 艺术插画管线**
   - 新增 3 套公开课旗舰视觉主题：**清新水彩 (`watercolor`)**、**简洁商务 (`business`)**、**童趣手绘 (`handdrawn`)**，并完整保留原有 **19 族 43 套**经典模板（共 **22 族 46 套**）。
   - 4 种标准版式（封面 / 章节过渡 / 要点罗列 / 图文并排），固定四档字号阶梯 **44 / 32 / 24 / 18 pt**，单页 **≤ 6 行、每行 ≤ 18 字**超限自动分页。
   - **三处 100% 同源**：`PptPreview` 实时预览、`TemplateWall` 模板墙缩略图、`pptx.ts` 导出均读取同一份 `place()` 坐标引擎。
   - 预置《荷塘月色》《桂花雨》《草船借箭》《圆的面积》《长方体的认识》五大示范课 **16:9 无字水彩/几何插画**（`src/data/builtinArt.ts`），0 秒离线加载并直写导出 `.pptx`（封面插画无条件满版铺底、字压图上）。
   - 支持**点击 PPT 画面直接展开编辑、点击画面插画直接本地换图**，每页支持上传 / 替换 / 移除配图（自动中心裁切压缩 16:9，写入 `SlidePatch.illustration`，40 步撤销、换模板保留、直写 `.pptx`）。

2. **首页 Editorial Studio 视觉重构（`Home.tsx`）**
   - Perplexity / Apple 风格极简大留白首屏：精致眉标、渐变衬线主标题、磨砂浮起一体化备课输入框。
   - 内置 **10分试讲 / 20分精简 / 30分标准 / 40分公开课** 快捷课型胶囊，课文原文折叠抽屉，下方 3 列精选示范课画廊带学段学科标签与 16:9 封面艺术预览。

3. **非线性教学节奏时间轴 + 一键课型时长重排（`PacingTimeline.tsx`）**
   - 全站最小时长下探至 **10 分钟（10–45 分钟）**。
   - 结果页顶部极简工作台控制条：四档课型一键切换胶囊、三栏同屏/双栏聚焦视图切换、`⌘K` 指令台、粉笔黑板、上台提词器、统一下拉「导出 ▾」菜单（收口 Word / 教师版 PPTX / 学生版 PPTX / Markdown / 复制全稿 / 全屏演示 / 打印）。
   - 下方莫兰迪学术色教学节奏条按分钟比例弹簧伸缩，点击任意色块三栏同步定位。

4. **三稿三栏同屏联动 + 教案原地微调（`Result.tsx`）**
   - 宽屏默认展开 **左教案 / 中教师版课件 / 右学生版公开课 PPT** 三栏同屏联动（可一键切「双栏聚焦」）；左侧每个教学环节卡片配「**定位 PPT ↗**」按钮，一键同步中右两栏翻页。
   - 双击任意「**教师 / 学生**」活动文字即可原地微调，修改结果自动同步至 Word / Markdown / 复制全稿与上台提词器。

5. **交互式粉笔黑板画布（`InteractiveBlackboard.tsx`）**
   - 高拟真墨绿石板黑板 + 暖木质粉笔槽，支持**分步书写演示**（逐行动画推演，可暂停/步进）、**HTML5 Canvas 颗粒感粉笔批注**（纯白 / 暖黄 / 朱红 / 青瓷 4 色 + 板擦 + 清笔迹）及**一键导出 2x 高清黑板 PNG 图**。

6. **Linear 级 `⌘K` 全局备课指令面板（`CommandPalette.tsx`）**
   - 全局监听 `Cmd+K` / `Ctrl+K` 呼出毛玻璃指令台（Portal 挂载至 `document.body`），支持模糊搜索与方向键直达：切课型时长、跳教学环节、切三大公开课主题、开模板墙/黑板/提词器、一键导出。

7. **专业级上台提词器（`Teleprompter.tsx`）+ Portal 弹窗防遮挡**
   - 支持**暗房 / 暖纸双模式**、`requestAnimationFrame` 平滑自动滚屏（**150–270 字/分**语速滑杆）、字号调节（`A−`/`A+`）、空格暂停、左右方向键切环节、右侧同步大屏 PPT 提示卡与课后演练复盘表。
   - `TemplateWall`、`CommandPalette`、`Teleprompter` 全部采用 `React.createPortal(..., document.body)` 挂载，`.result` 严禁 `transform` 动画，杜绝 `fixed` 弹窗遮挡与错位。

---

## 本地运行与构建部署

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# TypeScript 严格检查
npx tsc --noEmit

# 生产构建（纯静态 dist/ 可直接部署至 Qoder Sites / Vercel / Cloudflare Pages）
npm run build

# 本地预览生产包
npm run preview
```

> **纯静态部署（Qoder Sites）说明**：构建产物 `dist/` 开箱即用，无需后端与 API Key 即可 0 秒体验全部内置公开课示范课与完整编辑/导出/黑板/提词器功能；如需对任意自定义课题调用在线大模型，可在右上角「模型设置」中填入兼容 OpenAI 接口的 API Key，或运行 `npm start` 启动同源代理 `server.mjs`。

---

## 自动化验证门禁

```bash
npx tsc --noEmit           # TypeScript 严格类型检查
npm run typecheck:scripts  # 脚本工程类型检查
npm run build              # Vite 生产构建
npm run check              # .pptx 真实出片 + XML 逐页取证
npm run check:wall         # 46 套 / 22 族模板墙同源与零越界门禁
npm run check:scale        # 10 门示范课 × 20/30/40 分多档课型门禁
npm run check:deck-edit    # 增删改查 + 40 步撤销 + 换模板保字保图门禁
npm run check:session      # 本机存档合并与防配额溢出门禁
npm run check:nokey        # 前端与 dist/ 零密钥泄露门禁
```
