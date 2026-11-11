# B1 交互状态矩阵与动效边界

> 依据 `docs/frontend-skill-prompts.md` 的 B1 提示词、`impeccable` 的 `craft-floor.md` + Operate 模式、`docs/frontend-render-baseline.md`（A3 基线）与 `docs/frontend-decisions.md`（T1–T12 定案）。
> **本轮定位**：A 阶段与 P1-8 版本历史闭环完成后，按既定顺序进入 B 环节。本轮完成 B1 的**增量部分**——为本轮新增的版本历史交互落齐状态并补测试，同时对全站 6 页既有交互做**只读现状盘点**。全站逐组件 7 态审计与既有视图的状态补强属于 D1 报告与 D3 修复范围，本轮不擅自大改（T1 定案、C8）。
> 事实来源：`apps/web/src/views/*.vue`、`apps/web/src/styles.css`、`apps/web/src/views/*.spec.ts`、`docs/frontend-stage-a.md`。

---

## 1. 状态口径

| 状态 | 定义（B1 / Operate 口径） |
| --- | --- |
| default | 控件可操作、语义完整、可扫读 |
| hover | 指针悬停有可见响应，不引入位移编排 |
| focus | 键盘焦点环立即可见、不被顶栏遮挡（A3 / B5） |
| active | 按下 / 进行中期间控件仍表达当前动作 |
| disabled | 明确不可操作，且给出原因或进行中文案 |
| loading | 异步期间有进行中反馈，重复触发被抑制 |
| error | 说明问题与恢复动作，可重试，不吞掉错误码 |
| empty | 无数据时给出解释与下一步，而非「暂无数据」式空白 |
| success | 结果可见，且能继续下一步 |
| 无权限 | 教师页令牌缺失 / 公开页无效码时不泄露数据，给出恢复动作 |

---

## 2. 本轮新增交互：版本历史（已落实）

### 2.1 学生回执页 `/receipt/:receiptCode`

数据来自 4.6 的 `versions` 追加字段，**零新增网络请求**；历史附件复用 `api.download(fileId, receiptCode)` 走 4.7。

| 状态 | 实现位置 | 可见表现 | 测试证据 |
| --- | --- | --- | --- |
| default | `<details class="submission-detail version-history">` | 「查看历次修改（共 N 版）」折叠，默认收起 | `shows every submitted version…` |
| hover / focus / active | 沿用既有 `.button` 过渡与 `:focus-visible` 焦点环 | 无新增动效，A3 / B5、B9 口径不变 | 既有 `styles.css`，未改动焦点样式 |
| disabled | `:disabled="downloadingId === file.id"` | 下载中按钮禁用，文案「正在下载…」 | `shows the latest version…` 覆盖主区下载 |
| loading | 顶层 `loading` + `aria-live="polite"` | 「正在读取回执…」；版本数据随回执一次返回，无二级 loading | 既有 `offers a retry…` |
| error | 既有 `errorMessage` + `role="alert"` | 下载失败/读取失败给出提示，可「重新加载」 | 既有 `offers a retry…` |
| empty | `v-if="history.length > 1"` + `receipt.value?.versions ?? []` | 仅 1 版时不显示折叠区；旧响应无 `versions` 时优雅降级、主区照常渲染；单版本无文本时提示「此版本没有文本内容。」 | `hides the history panel…`、`still renders the receipt when an older response has no versions field` |
| success | 版本列表 + `第 N 版 · 当前版本` 标记 | 各版本文本、附件、时间可见，历史附件可下载 | `shows every submitted version…`（断言 `api.download('file-v1', 'receipt-code')`） |
| 无权限 | 既有 404 语义 | 无效回执码 → 「回执暂时无法打开」+ 重新加载；不渲染他人数据 | 既有 `offers a retry…`；公开接口边界 C7 |

### 2.2 教师看板 `/assignments/:assignmentId`

数据来自 3.16，**按需加载**（看板初始化不为每位学生发请求）；历史附件复用 `api.downloadSubmissionFile(...)` 走 3.14。桌面表格与移动列表双渲染共享同一份状态。

| 状态 | 实现位置 | 可见表现 | 测试证据 |
| --- | --- | --- | --- |
| default | `versionActionLabel()` → 「查看历次修改」 | 未点击前不发起请求 | `loads submission versions on demand…` 断言 `not.toHaveBeenCalled()` |
| hover / focus / active | 沿用既有 `.button` 与 `:focus-visible` | 无新增动效 | 未改动焦点样式 |
| disabled | `:disabled="versionState(…)?.loading"` | 读取中按钮禁用 | loading 态间接覆盖 |
| loading | `state.loading` → 「正在读取…」 | 重复点击被 `if (state.loading) return` 抑制 | `loads submission versions on demand…` |
| error | `state.error` + `.field-message.error-text` + `role="alert"` | 显示错误原文；按钮回到「查看历次修改」可重试 | `shows a recoverable error…`、`recovers when a failed version-history load is retried` |
| empty | `items: []` → 「暂无历次修改记录。」 | 给出解释而非空白 | `explains an empty version history` |
| success | 列表 + 「刷新历次修改」 | 各版本文本 / 附件 / 时间可见，历史附件可下载，允许主动刷新 | `loads submission versions on demand…`（断言 `api.downloadSubmissionFile(..., 'file-v1')`、`刷新历次修改`） |
| 无权限 | 3.16 的 401 由 `request()` 抛出，不吞掉 | 错误可见；既有看板「检查管理密钥」引导仍在 | 既有 `api/client.ts` 统一信封，未改动 |

> **本轮发现并修复的真实缺陷**：初版 `loadVersions` 用 `versionStates[id] ?? (versionStates[id] = {...})` 取到的是**原始对象**而非 Vue 响应式代理，导致异步完成后界面不重渲染（永久停在「正在读取…」）。已改为先写入再从响应式容器读取代理；由新增测试捕获并验证。

---

## 3. 全站 6 页既有交互状态现状（只读盘点）

> 方法：对 6 个视图做关键字计数（`:disabled`、进行中文案、错误/告警、空态、`aria-live`），用于定位薄弱页，**不是逐组件 7 态审计**。完整审计按 B1 完成标准留 D1（`audit` / `critique`）出报告、D3 统一修复。

| 视图 | disabled | loading 文案 | error / alert | empty 线索 | aria-live / status | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `TeacherHomeView.vue` | 0 | 6 | 6 | 5 | 2 | 空列表 / 读取失败 / 剪贴板不可用已有；无 disabled 控件（该页无异步写入） |
| `ClassSetupView.vue` | 4 | 7 | 21 | 1 | 2 | 密钥 / 建班 / 导入 / 分组状态较完整 |
| `AssignmentCreateView.vue` | 1 | 2 | 16 | 2 | 1 | 本地校验与保存态已有 |
| `AssignmentDashboardView.vue` | 4 | 14 | 25 | 4 | 2 | 本轮新增版本历史状态后覆盖最完整 |
| `StudentAssignmentView.vue` | 1 | 6 | 16 | **0** | 3 | `empty` 关键字为 0；接龙空态 / 线下说明的实际措辞需 D1 逐行核对，本轮不臆断 |
| `StudentReceiptView.vue` | 2 | 14 | 12 | 1 | 1 | 本轮新增历次修改与旧响应降级 |

**结论**：既有视图普遍具备 loading / error / 空态反馈，`StudentAssignmentView.vue` 的空态表达是唯一需要 D1 复核的线索；本轮不因其扩大改动范围。

---

## 4. 动效边界（Operate 模式）

- 本轮**未新增任何动画、过渡或滚动逻辑**；新控件全部复用既有 `.button` / `.submission-detail` / `.submission-files` 样式。
- 既有过渡集中在 `.15s–.16s`（按钮、导航、作业行），无滚动联动、无入场序列、无装饰性动画，符合 B1「动效只表达状态变化」。
- `prefers-reduced-motion`：既有 `@media (prefers-reduced-motion: reduce)` 把全局 `transition-duration` 设为 `.01ms!important`。`docs/frontend-stage-a.md` A2 已记录这与 `impeccable audit.md`「抹掉状态反馈」的潜在冲突；本轮版本历史的状态反馈依赖**文案与禁用态**而非过渡，因此在 reduced-motion 下仍可感知。是否调整全局降级策略属 D1 报告 / D3 修复范围，本轮不擅改。
- A3 基线未被破坏：未改断点、未改控件尺寸体系、未改 `:focus-visible`、未引入新圆角或颜色值；新增 CSS 仅使用既有 `var(--muted)` / `var(--line)` 与既有字号。

---

## 5. 改动面清单

| 文件 | 改动 | 影响范围 |
| --- | --- | --- |
| `apps/web/src/api/client.ts` | 新增 `SubmissionVersionFile` / `SubmissionVersion` / `SubmissionVersionList` 类型、`StudentReceipt.versions`、`api.listSubmissionVersions()` | 仅前端类型与客户端方法；不改 24 个接口契约、不改 `apps/api`、不改 `docs/api.md` |
| `apps/web/src/views/StudentReceiptView.vue` | `history` computed；`<details>` 历次修改区块 | 学生回执页；复用 4.7 下载历史附件 |
| `apps/web/src/views/AssignmentDashboardView.vue` | `versionStates` / `versionState` / `versionItems` / `versionActionLabel` / `loadVersions`；`load()` 清空缓存；桌面 + 移动双渲染插入版本历史块 | 教师看板；复用 3.14 下载历史附件，按需加载 |
| `apps/web/src/styles.css` | 新增 7 条 `.version-*` 规则 | 全局样式表；仅使用既有 token，未新增字体 / 图片 / 依赖 |
| `apps/web/src/views/StudentReceiptView.spec.ts` | 3 → 6 项 | 覆盖版本展示、历史附件下载、单版本隐藏、旧响应降级 |
| `apps/web/src/views/AssignmentDashboardView.spec.ts` | 2 → 6 项 | 覆盖按需加载、历史附件下载、错误、空态、失败重试 |
| `docs/frontend-decisions.md` | 新增 | T1–T12 定案记录 |
| `docs/frontend-interaction-states.md` | 本文件 | B1 增量成果 |
| `.gitignore` | 追加 `.taste-skill/` | 检查产物不入库 |

> `apps/api/**`、`docs/api.md`、`docs/handoff-prompt.md`、设计 spec / plan **零改动**；未新增路由、依赖、状态库、UI 库或图片资源。

---

## 6. 完成标准自检与未决项

| B1 完成标准 | 本轮状态 |
| --- | --- |
| 每个交互组件 7 态齐全 | **本轮新增的版本历史交互已齐全**（第 2 节）；全站既有组件仅完成只读盘点，逐态审计留 D1 |
| 关键流程空 / 错 / 成功态可见 | 版本历史流程已覆盖并有 6 项新增测试证据；既有流程见 `docs/frontend-stage-a.md` A1 |
| reduced-motion 下状态变化仍可感知 | 新增状态依赖文案与禁用态，不依赖过渡；全局降级策略的评审留 D1 / D3 |
| 无滚动联动与整页入场序列 | 本轮零新增动效 |
| `apps/web` 之外零改动（设计产物除外） | `.gitignore` 按 T4 定案改动；`apps/api` 与接口文档零改动 |
| A3 基线可测量项未被破坏 | 未改断点 / 对比度 / 焦点环 / 触摸尺寸体系 |

**未决项（不属阻塞，按既定顺序继续）**

- **B2 UX 文案 / 错误提示**：输入齐备（`docs/api.md` 错误码表、T8 定案、既有中文术语），**无阻塞**，是既定顺序中的下一个待办项。
- **B3 响应式与信息层级**：需要 1440 / 1024 / 768 / 390（及 320）四档的**渲染实测**才能给客观结论；构建产物已由本轮 `npm run build` 产出，但浏览器测量能力属 D2，故 B3 的结论需与 D2 的测量口径配套。
- **C1 / C3 数据衔接**：输入齐备（统一信封、`data: null`、Blob 下载路径均在代码中），无阻塞。
- **D1 / D2 交付校验**：按 T10 定案，需 H3 交接的**最新构建产物 + root** 与本机能用的 Edge；`impeccable context` launcher 仍走 fallback，不阻塞。
- **D3 合并修复**：需 D1 / D2 报告与 waivers，之后才跑完整交付级验证门槛并按 T12 决定是否提交 / 推送。
