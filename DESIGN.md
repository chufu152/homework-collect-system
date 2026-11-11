---
name: 收发作业系统 demo（班级工作台）
description: 单班级、免登录的作业收发工作台与学生任务页；只记录 apps/web 中已存在的视觉值。
colors:
  ink: "#1b2b31"
  muted: "#66777b"
  line: "#dce4e1"
  paper: "#ffffff"
  canvas: "#f2f5f3"
  navy: "#183847"
  sea: "#1e6c64"
  sea-soft: "#e6f2ee"
  citrus: "#e1ec92"
  amber: "#f8f0d5"
  error: "#a24037"
  error-soft: "#faeae7"
  success: "#276453"
  success-soft: "#e6f2ec"
  focus-ring: "#438d7d"
typography:
  display:
    fontFamily: "'Inter', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "clamp(28px, 4vw, 40px)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.045em"
  body:
    fontFamily: "'Inter', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  surface: "16px"
  control: "10px"
  compact: "9px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "10px"
  md: "16px"
  lg: "19px"
  xl: "24px"
  page-inline: "clamp(18px, 4vw, 52px)"
  topbar-inline: "clamp(18px, 5vw, 76px)"
components:
  button-primary:
    backgroundColor: "{colors.sea}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    minHeight: "42px"
    fontSize: "13px"
    fontWeight: 600
  button-secondary:
    backgroundColor: "{colors.paper}"
    borderColor: "{colors.line}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    minHeight: "42px"
  surface:
    backgroundColor: "{colors.paper}"
    borderColor: "{colors.line}"
    rounded: "{rounded.surface}"
  topbar:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.paper}"
    minHeight: "68px"
---

# Design System — 收发作业系统 demo

> 阶段 A 草案。依据 `docs/frontend-skill-prompts.md` 的 A2 提示词，调用 `impeccable` 的 `document` 流程从既有代码自动抽取，**只记录已存在的值**。
> `document.md` 的 Step 3 要求向用户确认「氛围、色彩性格」等描述性语言；本轮按「仅推进可确定的内容」跳过了该确认，相关位置以 `[待确认：T5]` 标注，未编写主观描述。
> `extract` 只执行到清点与文档化，未建立新组件、未迁移、未改动任何 `.vue`（见 `docs/frontend-stage-a.md` A2 节）。
> 事实来源：`apps/web/src/styles.css`（231 行）、`apps/web/src/App.vue`、`apps/web/src/views/*.vue`。

## Overview

本项目是 Operate 型任务界面集合，不是营销站点。视觉世界由单一全局样式表 `apps/web/src/styles.css` 定义，四个教师页共用 `.shell` + `.topbar` + `.page-wrap` 框架，两个学生页共用 `.public-frame` + `.public-brand` 框架；无组件库、无 CSS 框架、无设计系统目录、无主题切换。品牌文字标记为汉字「收」，以 `.brand-mark` 呈现。

`[待确认：T5]` 整体氛围与色彩性格描述。

## Colors

| 语义 | token | 值 | 代码中的用途 |
| --- | --- | --- | --- |
| 正文墨色 | `--ink` | `#1b2b31` | 标题、正文 |
| 次要文字 | `--muted` | `#66777b` | 副标题、表头、说明 |
| 分隔线 | `--line` | `#dce4e1` | 边框、表格线 |
| 纸面 | `--paper` | `#fff` | 卡片、输入、按钮底 |
| 画布 | `--canvas` | `#f2f5f3` | 页面背景 |
| 导航深蓝绿 | `--navy` | `#183847` | 顶栏背景 |
| 主色海绿 | `--sea` | `#1e6c64` | 主按钮、链接、强调 |
| 主色浅底 | `--sea-soft` | `#e6f2ee` | 强调统计卡 |
| 点缀黄绿 | `--citrus` | `#e1ec92` | 品牌标记、顶栏动作 |
| 琥珀底 | `--amber` | `#f8f0d5` | `draft` 状态底 |
| 错误 | `--error` / `--error-soft` | `#a24037` / `#faeae7` | 错误文字与底 |
| 成功 | `--success` / `--success-soft` | `#276453` / `#e6f2ec` | 成功文字与底 |

`:focus-visible` 使用硬编码 `#438d7d`（3px outline、3px offset），未纳入 `:root`。`:root` 之外还有 51 处硬编码颜色、39 个不同值，未收敛到上表；这些是**既存漂移**，不是本文件认可的新 token（见 `docs/frontend-stage-a.md`）。

`[待确认：T5]` 色彩性格描述；是否把上表升格为不可改动的品牌承诺。

## Typography

- 字体栈：`'Inter', 'Noto Sans SC', system-ui, sans-serif`，由 `styles.css` 第 1 行从 Google Fonts 在线引入（Inter 400/500/600/700、Noto Sans SC 400/500/600/700）。**这是既存外部资源**，不是本轮新增。
- 页面 h1：`clamp(28px, 4vw, 40px)` / 600 / `letter-spacing: -.045em` / `line-height: 1.18`；公有页 h1 为 `clamp(27px, 7vw, 37px)`。
- 区块 h2：`19px` / 600 / `-.025em`；公有页状态面板 h1/h2 为 `21px`；回执页 h1 为 `24px`。
- 正文：`14px` / 400，`line-height` 在长文本处为 `1.6`–`1.75`；辅助文字 `11–13px`。
- 数据数字：`.student-number`、`.relay-position`、`.roster-input`、`.receipt-code` 使用等宽字体栈；`.student-number` 使用 `font-variant-numeric: tabular-nums`。
- 辅助标签 `.eyebrow`：`12px` / 700 / `letter-spacing: .055em` / `--sea`，位于标题上方，共 14 处。

`[待确认：T5]` 字体是否作为品牌承诺、是否继续依赖外部 CDN；`[待确认：T9]` 多语言 / RTL 下的排版范围。

## Layout

- 教师页：`.topbar`（`min-height: 68px`，横向内边距 `clamp(18px, 5vw, 76px)`）+ `.page-wrap`（`width: min(1180px, 100%)`，`padding: 38px clamp(18px, 4vw, 52px) 76px`）。
- 学生页：`.public-frame`（`width: min(720px, 100%)`，`padding: 22px clamp(16px, 5vw, 42px) 36px`）。
- 断点：`@media (max-width: 760px)` 与 `@media (max-width: 430px)`；`body { min-width: 320px }`。
- 760px 以下：统计网格由 4 列变 2 列；作业行隐藏部分指标并显示 `.mobile-summary`；两列表单与单选项堆叠；看板隐藏 `.student-table-wrap`、显示 `.mobile-student-list`；顶栏与按钮字号缩小。
- 430px 以下：顶栏进一步收紧；公有页两列表单堆叠；接龙行由三列变两列。
- 常见间距：`gap` 取值 7–24px；表单 `.form-grid` 为 `19px`；`.field-row` 为 `14px`；`.button-row` 为 `9px`。

## Elevation & Depth

现有实现主要靠 `1px` 边框与纯色底区分层级，**没有阴影体系**：`.surface`、`.panel`、`.public-panel`、`.assignment-row`、`.radio-option` 均为 `border: 1px solid var(--line)` + 白底；`stats-grid` 的强调卡用 `--sea-soft` 底色而非投影。输入框聚焦使用 `box-shadow: 0 0 0 3px rgb(82 141 125 / 12%)` 作为焦点环，这是唯一一处阴影用法。

## Shapes

`:root` 仅定义 `--radius: 16px`，且只有 `.surface` 一处引用。实际使用的 `border-radius` 有 12 种取值：16px（surface / public-panel）、13px（作业行 / 接龙列表）、12px（summary-strip）、11px（radio-option / brand-mark 的 `11px 11px 11px 3px`）、10px（按钮 / 顶栏动作 / 反馈表单消息）、9px（nav-link / icon-button / field-message / 输入框）、8px、7px、999px（状态胶囊与 chip）、50%（类型圆点）。因此当前**不存在单一圆角标尺**，本文件只做记录。

## Components

- **Buttons**：`.button` 基类（`min-height: 42px`、`10px 16px`、13px/600、10px 圆角、`.15s` 过渡）；变体 `primary`（sea 底白字）、`secondary`（白底描边）、`quiet`（透明底 sea 字）、`danger`（error-soft 底 error 字）；`:disabled` 为 `opacity: .55` + `cursor: wait`。另有 `.icon-button`（36×36px）与 `.topbar-action`（顶栏动作）。
- **Cards / Containers**：`.surface`、`.panel`（`max-width: 760px`）、`.public-panel`、`stat-block`、`assignment-row`、`mobile-student-row`、`receipt-card`。
- **Status / Chips**：`.status-pill` 与 `.count-chip`（999px 圆角），状态变体 `published`（success-soft）、`draft`（amber）、`closed`（灰）；`.type-mark` 按作业类型切换圆点颜色。
- **Inputs / Fields**：`.field-block`、`.field-row`、`.field-stack`、`.field-note`、`.field-message`；输入/选择/文本域 `min-height: 43px`、9px 圆角、聚焦描边 `#528d7d` + 浅阴影；`.radio-option`（`:has(input:checked)` 高亮）、`.check-option`、`.file-field`、`.roster-input`（等宽）。
- **Feedback**：`.form-message` / `.field-message` 的 `error-text` / `success-text` 组合（文字色 + 浅底）；`.empty-state`（居中、含标题与引导按钮）；`role="alert"` / `role="status"` / `aria-live="polite"` 已在视图中使用。
- **Navigation**：`.topbar` + `.brand-lockup` / `.brand-mark`（「收」）+ `.nav-link`（`.router-link-active` 高亮）；学生页为 `.public-brand` + `.public-footer`。
- **Signature**：`.relay-list`（接龙序号 + 姓名 + 内容三列，窄屏两列）、`.student-table` / `.mobile-student-row` 双渲染、`.submission-detail`（`<details>` 展开提交内容）、`.copy-field`（只读链接 + 复制按钮）。
- **Motion**：过渡集中在 `.15s–.16s`（按钮、导航、作业行）；`@media (prefers-reduced-motion: reduce)` 将全局 `transition-duration` 设为 `.01ms!important`。

## Do's and Don'ts

以下由既有代码与项目约束归纳，**不是新规则**：

### Do

- 复用 `styles.css` 已有类名与 `:root` token 表达教师页 / 学生页两套框架。
- 文案沿用项目术语（应交/已完成/未完成/迟交、缺交名单、分享链接、回执码、分组、目标名单、管理密钥）。
- 保留统一响应信封的 `data: null` 判断与二进制下载路径；保留 `role` / `aria-live` 等既有可访问性标记。
- 错误与空态给出下一步动作（现有视图已大量采用）。

### Don't

- 不引入 UI 组件库、状态库、图标库、新字体或图片资源（C5）。
- 不新增路由、不改接口契约、不改 `apps/api`（C7）。
- 不在公开页面渲染全班名单，不在文案或 URL 展示管理令牌 / `shareCode` / `receiptCode`（C7）。
- 不按营销站点规则改造任务界面：hero 独占首屏、真实照片、高光时刻、抽签配色等均在 `docs/frontend-render-baseline.md` 中列为停用（C3）。
- 不把本文件未列出的硬编码颜色、圆角或内联样式升格为 token；是否收敛属待确认项，需 D3 在确认后处理。
