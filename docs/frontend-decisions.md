# 前端制作待确认项定案（T1–T12）

> 依据 `docs/frontend-skill-prompts.md` 第 4 节。项目所有者已授权「不等待额外确认、按既定顺序连续推进」，因此本文件以**贴合仓库既有事实的合理默认**逐项定案，取代原先的「待确认 / 阻塞」状态。
> 定案原则：不臆造技术栈与业务细节、不扩展示例边界、不改动 `apps/api` 与 24 个接口契约、不新增路由 / 依赖 / UI 库 / 字体 / 图片资源（C5、C7）、不把 skill 示例资产复制进 `apps/web`。
> 事实来源优先级：`docs/handoff-prompt.md` → `docs/api.md` → 设计 spec / plan → 现有代码。冲突时以更靠前者为准。
> 本文件是**决策记录**，不是改动清单；每项注明「是否需代码改动」及验证方式。

---

## 0. 定案总览

| 编号 | 结论（一句话） | 需代码改动 | 状态 |
| --- | --- | --- | --- |
| T1 | 两者都做，**先补 P1-8 版本历史前端，再做 6 页质量提升** | 是（见 T2/T3） | 已定案 |
| T2 | 学生回执页 + 教师看板双入口；展示版本号 / 时间 / 文本 / 历史附件下载；沿用既有组件范式 | 是 | 已定案 |
| T3 | 允许 `client.ts` 新增 `versions` 类型字段与版本历史客户端方法（仅前端内部适配） | 是 | 已定案 |
| T4 | 设计契约与阶段文档纳入版本控制；`.taste-skill/` 加入 `.gitignore` | 是（仅 `.gitignore`） | 已定案 |
| T5 | 沿用 `styles.css` 现有值作为唯一默认；不升格为不可变品牌承诺 | 否 | 已定案 |
| T6 | 手机浏览器优先；保留 320px 溢出检查；不指定机型；既有 760/430 断点不改 | 否（仅测量） | 已定案 |
| T7 | 不允许新增任何依赖或资源 | 否 | 已定案 |
| T8 | 仅对 429 / 413 / 503 做差异化可恢复文案，其余沿用统一 `message` | 是（后续 B2） | 已定案 |
| T9 | 不做多语言 / RTL / 深色模式 / 文本放大，保持简体中文 | 否 | 已定案 |
| T10 | gate 用构建页面 + root；launcher 下载不启用，继续走已验证的 fallback | 否（仅 D2 运行时） | 已定案 |
| T11 | 前端不消费 `GET /health` | 否 | 已定案 |
| T12 | 本轮产出留工作区，不提交、不推送 | 否 | 已定案 |

**开放项数量：0**。原先由这 12 项造成的 B/C/D 阻塞已清除。

---

## 1. 逐项定案

### T1 本轮前端目标范围

- **结论**：两者都做，顺序为「① 补齐 P1-8『查看历次修改』前端 → ② 按 A3 基线做 6 页质量提升（B → C → D）」。
- **依据**：`docs/handoff-prompt.md` 第 138 行把 P1-8 标为唯一「仍待补齐」的前端功能缺口，并注明「后端已完成、前端 UI 待做」；`docs/api.md` 3.16 / 4.6 / 4.7 已提供完整契约（含历史附件 `fileId` 下载），无需改动后端。它是全项目唯一有明确「原问题」与客观「已解决」判据的前端缺口（类型字段 + 组件测试），故优先。质量提升为风格与状态类工作，依赖渲染基线，排在其后。
- **影响提示词**：A1 尾、C2、D3、B/C/D 的目标范围。
- **约束**：不因补 P1-8 而新增接口、新增路由或改动 `apps/api`；不把 6 页质量提升提前到数据衔接闭环之前。

### T2 版本历史 UI 的入口与展示形态

- **结论**：**双入口**，均采用既有组件范式，不引入新展示形态。
  - 学生回执页 `/receipt/:receiptCode`：直接消费 4.6 已追加的 `versions`（按版本倒序），展示版本号、提交时间、文本内容、各版本附件下载；复用 `api.download(fileId, receiptCode)` 走 4.7（该接口明确允许历史 `fileId`，且校验回执码属于该提交）。**零新增网络请求**。
  - 教师看板 `/assignments/:assignmentId`：在学生明细的既有 `<details class="submission-detail">` 内按需调用 3.16，展示同一组字段；历史附件复用 `api.downloadSubmissionFile(assignmentId, submissionId, fileId)` 走 3.14（该接口明确允许历史 `fileId`，并校验文件同属该作业与该提交）。**按需加载**，不在看板初始化时为每位学生发请求。
  - 折叠容器沿用 `<details>` / `.download-list`，不新增弹窗、抽屉、时间轴、对比视图或新页面。
- **依据**：`docs/api.md` 3.14、3.16、4.6、4.7；`apps/web/src/views/StudentReceiptView.vue`、`AssignmentDashboardView.vue` 已有 `.receipt-card` / `.submission-detail` / `.download-list` 范式。
- **边界**：学生端只读本人提交、不渲染全班名单；教师端仅在管理令牌有效时可用；无效码沿用既有 404 语义。

### T3 `client.ts` 是否消费 `versions`

- **结论**：允许，且仅限前端内部适配。
  - 给 `StudentReceipt` 增加 `versions` 字段（类型与 4.6 一致）。
  - 新增 `listSubmissionVersions(submissionId)` 客户端方法，走既有 `request<T>()` 统一信封解包，路径 `GET /submissions/{submissionId}/versions`。
  - **不新增**鉴权方式、状态库、依赖或错误吞掉逻辑；`data: null` 与二进制 Blob 的既有区分保持不变。
- **依据**：`docs/api.md` 第 1 节统一信封、3.16；`apps/web/src/api/client.ts` 现有 `request` 模式。
- **边界**：不改 24 个接口定义、不改 `docs/api.md`、不改 `apps/api`（C7 / H5）。

### T4 设计产物与检查产物的版本控制

- **结论**：
  - `PRODUCT.md`、`DESIGN.md`、`docs/frontend-skill-prompts.md`、`docs/frontend-stage-a.md`、`docs/frontend-render-baseline.md`、本文件及后续阶段文档，作为**项目文档纳入版本控制**（`.gitignore` 未排除它们，保持可跟踪）。
  - `.taste-skill/`（gate 的 `build.json` / `gate.json` / `waivers.json` / 截图与报告）属机器生成的检查产物，**加入 `.gitignore` 不纳入版本控制**；D2 仍按 `docs/frontend-skill-prompts.md` 只写该目录。
- **依据**：当前 `.gitignore` 未含 `.taste-skill/`；`references/gate.md` 说明该目录内容会随每轮 gate 变化（含截图、轮次计数）；`docs/frontend-skill-prompts.md` T4 / D2。
- **影响提示词**：A1、A2、D2。**需代码改动**：仅 `.gitignore` 追加一行。

### T5 设计基线来源

- **结论**：以 `apps/web/src/styles.css` 中**已存在的值**为唯一默认；`DESIGN.md` 是记录性契约而非不可变品牌承诺，允许在 D3 经核对后收敛漂移。既有 `@import` 在线字体、配色、文字标记「收」是**既存实现值**，不新增、不替换、不升格为品牌事实。
- **依据**：`DESIGN.md` Overview / Colors / Typography；`docs/frontend-stage-a.md` A2；仓库中不存在 Logo 文件、品牌规范、真实照片（`PRODUCT.md` Evidence on Hand）。
- **影响提示词**：A2、A3、B1。**约束**：`document.md` Step 3 要求的描述性氛围措辞仍不代为编造。

### T6 设备与断点优先级

- **结论**：手机浏览器为第一优先；保留 320px 溢出检查（`body { min-width: 320px }` 已是既存下限）；不指定具体机型。既有 760px / 430px 媒体查询**不作为本轮改造目标**；`docs/frontend-render-baseline.md` 1.1 的 1440 / 1024 / 768 / 390 / 320 是**测量档位**，不是要落地的新断点。
- **依据**：设计 spec 验收标准 6「接口与前端布局适用于手机浏览器」；`styles.css`；A3 基线 B1 / B4。
- **影响提示词**：A3、B3、D2。

### T7 是否允许新增依赖或资源

- **结论**：**否**。沿用 C5 / 0.3：`apps/web` 当前仅依赖 `vue` 与 `vue-router`，不新增 UI 组件库、状态库、图标库、字体文件、图片素材，也不复制两个 skill 的 `assets/` 或示例世界。
- **依据**：`apps/web/package.json`、`docs/frontend-skill-prompts.md` 0.3 / C5。

### T8 错误提示粒度

- **结论**：仅对三类做**差异化、可恢复**文案，其余沿用统一 `message`：
  - `429 RATE_LIMITED`：说明请求过于频繁、结合 `Retry-After` 给出稍后重试。
  - `413 FILE_TOO_LARGE`：说明附件超出大小上限、提示减小文件或分批。
  - `503`：说明服务暂时不可用、提示稍后重试或联系教师。
  - 其余错误码（400 / 401 / 403 / 404 / 409 / 500 及 `VALIDATION_ERROR`）沿用统一 `message` + 「问题 + 恢复动作」结构，不编造业务事实。
- **依据**：`docs/api.md` 第 1 节错误码表、4.2 校验说明；B2 完成标准。
- **影响提示词**：B2、C1。**需代码改动**：延后到 B2 环节执行（本轮按既定顺序尚未推进到该步）。

### T9 多语言 / RTL / 深色模式 / 文本放大

- **结论**：**本轮不做**，保持简体中文单语、现有浅色主题。这些维度列为正式版范围，不进入 B5（`lang` 范围）、B7（追加测量）、D1（评分）的判定。
- **依据**：项目现有文案与 `DESIGN.md` 均为简体中文、单主题；`docs/frontend-skill-prompts.md` 0.2。
- **影响提示词**：B2、C1、D1。

### T10 运行环境与 gate 方式

- **结论**：
  - `impeccable context` launcher 的自包含二进制下载**不启用**；继续沿用已验证的 Launcher unavailable 兜底（直接读取项目上下文），不因等待下载阻塞推进。
  - gate 采用**构建页面 + `--root`**（`--start dist/index.html --root dist`），而非依赖常驻 dev server；每次 gate 前必须重新构建（`references/gate.md` 第 15–16 行）。
  - 环境已核对：Node `v22.22.2`、Edge 位于 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`。
- **依据**：`references/gate.md`；`docs/frontend-render-baseline.md` 1.2 / 5；本轮前置核对记录。
- **影响提示词**：D1、D2。**约束**：若 D2 时浏览器不可用，须据实记录 `GATE` 状态与未检查项，不得宣称通过。

### T11 是否消费 `GET /health`

- **结论**：**否**。前端不新增服务可达性探测或可见提示，避免扩大本轮范围；服务不可达由既有 `503` 错误文案（T8）表达。
- **依据**：`docs/api.md` 3.17；当前前端未使用该接口。
- **影响提示词**：B2、C1。

### T12 提交与推送策略

- **结论**：本轮所有产出**先留工作区**，不提交、不推送。沿用 `docs/handoff-prompt.md` 第 3 / 6 节门槛：全量验证通过且工作区改动清单可核对之后，且**在项目所有者明确要求推送时**才推送 `main`。`docs/frontend-skill-prompts.md` 本身随本轮设计产物一并留工作区。
- **依据**：`docs/frontend-skill-prompts.md` 0.3、D3；`docs/handoff-prompt.md`。
- **影响提示词**：D3。

---

## 2. 与硬约束 C1–C8 的一致性核对

| 约束 | 核对结果 |
| --- | --- |
| C1 唯一写入方 | 代码改动只由 `impeccable` 侧（本轮为项目既有 Vue/TS 模式）落到 `apps/web`；`design-taste-frontend` 仍只读、仅写 `.taste-skill/` |
| C2 唯一事实来源 | 所有定案以 `docs/handoff-prompt.md` / `docs/api.md` / `DESIGN.md` / 现有代码为依据；未采纳任何抽签调色板、hero 类型或 moments |
| C3 规则限缩 | 沿用 A3 的 S1–S9 停用清单；本项目全部页面仍按 Operate 处理 |
| C4 验收分层 | 项目既有验证命令、A3 渲染测量、impeccable 评审三者互不替代；本轮定案不宣布任何一项「通过」 |
| C5 零无关资产 | T7 明确否决新增依赖与资源；不复制 skill kit |
| C6 串行交接 | 按 T1 定案的顺序：先数据衔接闭环，再 B → C → D；不同时运行两个写入方 |
| C7 边界守恒 | 不改 `apps/api`、不改 24 接口、不新增路由 / 登录 / 多班级 / JWT / RBAC；公开页面不渲染全班名单；令牌与能力链接不出现在文案、日志、URL 展示中 |
| C8 待确认优先 | 原 12 项已由项目所有者授权定案，故不再是「未答复」状态；后续若出现新的未确认事实，仍按「影响 + 可选项 + 建议」处理，不落实为代码 |

---

## 3. 原问题已解决的核对表

| 核对项 | 判据 | 结果 |
| --- | --- | --- |
| 12 项待确认是否仍有开放项 | 第 0 节状态列全为「已定案」 | 0 个开放项 |
| 是否臆造技术栈 / 业务细节 | 每项结论均标注仓库依据 | 无臆造 |
| 是否突破项目范围 | C1–C8 一致性核对 | 无突破 |
| 设计产物是否可跟踪 | `git status` 中 5 份设计产物为 `??` 且未被 ignore | 待本轮验证 |
| `.taste-skill/` 是否被忽略 | `git check-ignore` 命中 | 待本轮验证 |
| 是否改动 `apps/web` / `apps/api` | 本步骤只写文档与 `.gitignore` | 本步骤零改动代码 |
