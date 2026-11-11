# 收发作业系统 demo — 前端协同制作提示词（双 skill 版）

> 本文档面向「用两个已安装的前端 skill 协同推进本项目前端制作」的场景。
> 它只提供可复制的提示词、职责边界与完成标准，不包含实现代码，也不是操作步骤教程。
> 所有项目事实均取自仓库内已有文档与代码（截至 `cb009cd`），未核实的内容一律进入第 4 节「待确认项」。

---

## 0. 使用方式与适用边界

### 0.1 怎么用

1. 每次开新任务，先复制 0.4 的「通用前导提示词」，再拼接第 3 节中的**一条**提示词条，作为一条完整消息发给执行 agent。
2. 一个环节只跑一条提示词；确认产出与完成标准后再进入下一条，避免两个 skill 同时写同一批文件。
3. 第 1、2 节是给项目所有者与执行 agent 共同阅读的「身份与规则说明」，不需要作为提示词发送，但提示词中引用的编号（A3 基线、H2 契约、C1 约束等）以这两节为准。
4. 第 4 节的待确认项在得到答复前不得由执行 agent 自行补齐；按 0.4 的规则处理。

### 0.2 已核实的项目事实（作为提示词的共同上下文）

| 项 | 已核实内容 | 来源 |
| --- | --- | --- |
| 项目与阶段 | 单班级、免账号登录的「班级作业收发」demo；后端 24 个接口已开发完成并验收，前端保持既有交付状态，本轮只做前端 | `docs/handoff-prompt.md` 1.1–1.3 |
| 前端技术栈 | npm workspaces；`apps/web` = Vue 3 + TypeScript + Vite 6 + Vue Router，组合式 API 局部状态，全局 `styles.css`，统一 `api/client.ts`；组件测试用 Vitest + @vue/test-utils；无 UI 组件库、无状态库、无图标库 | `apps/web/package.json`、`docs/handoff-prompt.md` 1.3 / 2.2、设计 spec |
| 页面与路由 | 共 6 条：`/` 教师首页、`/class/setup` 班级设置、`/assignments/new` 发布作业、`/assignments/:assignmentId` 教师看板（批改/导出）、`/a/:shareCode` 学生作业页（提交/签到/接龙）、`/receipt/:receiptCode` 学生回执页 | `apps/web/src/router.ts` |
| 接口契约 | 统一信封 `{ code, message, data, requestId }`；空结果为 `data: null`；文件下载/导出为二进制流，不走信封；错误码含 400/401/403/404/409/413/422/429/503/500 | `docs/api.md` 第 1 节 |
| 鉴权与边界 | 教师用请求头 `X-Demo-Admin-Token`（前端存于会话）；学生用 `shareCode` / `receiptCode` 能力链接；公开接口不返回全班名单；不引入登录、多班级、JWT/RBAC、真实敏感学生数据 | `docs/api.md` 第 1、5 节、`docs/handoff-prompt.md` 6 |
| 已知前端缺口 | `client.ts` 的 `StudentReceipt` 类型尚无 `versions` 字段，也没有版本历史客户端方法；后端 3.16 与 4.6 已提供 `versions`；前端「查看历次修改」UI 待做 | `apps/web/src/api/client.ts`、`docs/api.md` 3.16/4.6、`docs/handoff-prompt.md` P1-8 |
| 适配要求 | 接口与前端布局适用于手机浏览器 | 设计 spec 验收标准 6 |
| 验证与推送门槛 | 交付前跑项目既有验证命令（全量测试、typecheck、build、db:validate、npm ci --dry-run、生产依赖审计、git diff --check）；接口/数据模型变更需同步 `docs/api.md` + spec + 测试；推送前须全部通过且工作区干净 | `docs/handoff-prompt.md` 第 3、6 节 |

### 0.3 本轮明确不做

- 不实现、不修改后端接口与 `apps/api`，不改变 24 个接口的契约。
- 不新增路由、不新增页面类型（尤其不引入营销首页/落地页/登录页）。
- 不引入新的技术栈、依赖、UI 库、字体资源或图片素材。
- 不把两个 skill 的示例资产（taste-skill 的 `assets/`、Impeccable 的示例世界）复制进 `apps/web`。
- 不擅自决定第 4 节待确认项，不把假设写成既定事实。
- 不推送 `main`；本轮产出先留工作区供确认。

### 0.4 通用前导提示词（每条提示词前必须粘贴）

> 你在 `C:\Users\Administrator\WorkBuddy AI\HCS` 工作，项目是「收发作业系统」单班级 demo。请阅读并遵守 `docs/frontend-skill-prompts.md` 第 1、2 节对两个 skill 的分工、交接关系与不重叠约束，以及第 4 节待确认项。
>
> 事实来源优先级：`docs/handoff-prompt.md` → `docs/api.md` → `docs/superpowers/specs/2026-11-08-homework-collect-demo-design.md` → `docs/superpowers/plans/2026-11-08-homework-collect-demo.md` → 现有代码。冲突时以更靠前者为准，并向我报告差异，不要自行裁断。
>
> 项目事实：前端为 Vue 3 + TypeScript + Vite 6 + Vue Router，6 条既有路由，统一 `api/client.ts` 与 `styles.css`；后端已完成，24 个接口走统一响应信封，空结果为 `data: null`，下载/导出为二进制流；教师用 `X-Demo-Admin-Token`（存会话），学生用 `shareCode` / `receiptCode` 能力链接；公开接口不返回全班名单。所有页面都是 Operate 型任务界面，不是营销页面。
>
> 硬约束：只改 `apps/web` 与本文档约定的设计产物；不改 `apps/api`、不改接口契约、不新增依赖/状态库/UI 库、不新增路由、不扩展示例边界（登录、多班级、JWT/RBAC、真实学生数据）；使用简体中文汇报；未确认的视觉方向、品牌素材、展示形态一律记为待确认项并说明影响，不得臆造或擅自补齐；交付前按 `docs/handoff-prompt.md` 第 3 节跑项目既有验证命令，本轮不推送。
>
> 本条任务：

---

## 1. 两个 skill 的明确与介绍

### 1.1 指定情况与选择依据

本会话上一步刚按用户要求安装并验证了 `Leonxlnx/taste-skill` 与 `pbakaus/impeccable` 两个前端仓库中的 skill，因此「当前项目前端制作所依托的两个 skill」在上下文中已有明确所指，即下表两者，不另选。

若把上下文视作「未明确指定」，选择依据同样成立：

- **`impeccable` 与项目目标最贴合**：它显式区分 Persuade / Operate / Read / Experience 四种 Visitor Mode，其中 Operate 覆盖 app UI、后台、数据表、工具型界面，并提供 `init`（PRODUCT.md）、`document`（DESIGN.md）、`shape`（设计简报）、`harden`（边界状态）、`audit`（技术质检）、`polish`（收口）等从决策到验收的完整链路。本项目 6 条路由全部是 Operate 型任务界面，不存在落地页或作品集型页面。
- **`design-taste-frontend` 提供其它技能没有的独立验收能力**：它自带固定断点的无头浏览器检查脚本（`consistency.mjs`、布局 `check.mjs`、`shoot.mjs`、`copy-lint.mjs`、`perf.mjs`）与 finish gate，能对**已渲染的构建产物**给出客观测量与 `GATE:` 结论。这正好补上 Impeccable 以启发式评审为主的验收侧，形成「一方决策与写入、一方只读测量」的互补关系。
- **排除项**：用户级 `frontend-design` 是通用前端设计指引，无 Visitor Mode 划分、无设计契约产物、无独立渲染验收，与 `impeccable` 职责重叠且能力更弱；文档/表格/演示类 skill 与本任务无关。
- **重要前提**：两个 skill 原生都以公司官网、产品落地页、通用前端为主要对象；本项目是内部任务工具。因此必须按第 2 节限缩使用，否则其营销站点规则会与本项目界面冲突。

### 1.2 `impeccable`（v4.8.1，来自 `pbakaus/impeccable`）

| 维度 | 内容 |
| --- | --- |
| 名称与定位 | `impeccable`；以设计总监视角做前端设计、重设计、评审、审计、打磨与动效，强调「完成工作、按 surface 的 Visitor Mode 决定野心程度、看渲染结果再下结论」。Web、后台、组件、设计系统均在范围内。 |
| 具体功能 | 24 个命令分六类：Build（`init` / `document` / `extract` / `shape`）、Evaluate（`critique` / `audit`）、Refine（`polish` / `bolder` / `quieter` / `distill` / `harden` / `onboard`）、Enhance（`animate` / `colorize` / `typeset` / `layout` / `delight` / `overdrive`）、Fix（`clarify` / `adapt` / `optimize`）、Iterate（`live` / `generate`）；另有 `hooks`、`doctor`、`pin`。核心工作流是「`impeccable context` 载入上下文 → 载入对应 playbook → 任何 UI 编辑前读 `craft-floor.md`」。 |
| 输入边界 | 项目工作目录与 cwd；`PRODUCT.md`、`DESIGN.md`、surface brief、原生平台指引；`--target` 指定的文件或路由；应用无法运行时用已提交的视觉回归基准图或截图夹具；`shape` 需要目的/使用者/结果等问答输入；`document` 需要用户确认描述性的氛围与色彩措辞；`audit` 需要目标渲染结果用于确定性检测。setup 要求每会话运行一次 launcher；Windows 无 `sh` 时用 `.cmd` 变体。 |
| 输出边界 | 产品与视觉契约（`PRODUCT.md`、`DESIGN.md` 及其 sidecar、surface brief、config、design system 提取结果）；`shape` 只出设计简报且**不写代码**；`critique` / `audit` 只出评分与问题报告且**不修复**；`polish` / `harden` / `clarify` / `adapt` 等才对既有代码做修改；`live` / `generate` 出可视化变体。不产出后端接口、不生成项目测试用例、不运行项目测试套件。 |
| 能力限制 | `shape` 在确认后即停，且无问答机制时须标注假设并停；`audit` 是代码级技术质检（a11y / 性能 / 主题 / 响应式 / 实现完整性 0–4 分），不替代视觉判断；`polish` 保留既有视觉世界，不得暗中重设计；`document` 只能抽取代码中已存在的值；`craft-floor.md` 中标为 ban 的条目（如标题上方的 kicker/eyebrow）不可由 brief 覆盖；无参数调用只给路由菜单、不自动执行命令；`doctor` 报告 drift 但不得顺手修复；本项目未启用 `hooks`，编辑后不会自动跑检测器；launcher 是自包含二进制，首次运行可能需要下载；`live` / `generate` 依赖浏览器夹具，本轮不纳入。 |

### 1.3 `design-taste-frontend`（tasteskill 2.5.1，来自 `Leonxlnx/taste-skill`）

| 维度 | 内容 |
| --- | --- |
| 名称与定位 | `design-taste-frontend`；反模板化（anti-slop）的公司官网/产品落地页建设 skill，以 figma.com、x.ai 为质量标杆，强调「说清卖什么、每屏都展示真实东西、看起来是为客户做的」。9 条 house rules 优先于其余内容。 |
| 具体功能 | 按业务类型（software / gaming / product / service / place）决定页面计划；文案层（`copy.md`、`copy-voice.md`、`copy-lint.mjs`）；「deal」引擎（`deal.mjs`、`start.mjs`、`moments.mjs`）产出调色板、版式、hero 与高光时刻；资产套件（`system.css`、动效层、UI 卡片、图示、真实照片与图标脚本）；检查链（`consistency.mjs`、布局 `check.mjs`、`shoot.mjs`、`perf.mjs`、`copy-lint.mjs`）；finish gate（`gate.mjs`，含轮次、waivers 与报告）。支持在既有 React/Next/Vue/Svelte/Astro 项目中以该栈组件承载其标记与类名。 |
| 输入边界 | 一份 brief：业务类型、卖什么、买给谁、唯一主行动、真实素材（Logo、截图、照片、价格、地址）；一个浏览器可本地打开的页面（本地 HTML 文件、`localhost` / `127.0.0.1` 的 dev server URL，或构建产物 + `--root`）；`--start` / `--kind` / `--category` / `--primary` 用于 arm gate；运行环境要求 Node 22+ 与 Chrome / Edge / Chromium（ffmpeg 可选）。 |
| 输出边界 | 静态 HTML/CSS 或既有栈内的组件；`.taste-skill/` 下的 `build.json` / `gate.json` / `history.json` / `waivers.json`、截图与报告；报告首行是 `GATE: PASS` / `OPEN` / `DONE` / `SETUP` / `ERROR` / `OFF`，随后列出 waivers、开放 FAIL、deal 结果、各检查结果与未能检查项。**不产出**设计系统文档、接口衔接方案、业务状态设计、项目测试用例；不验证接口数据正确性。 |
| 能力限制 | house rules 是营销站点规则（hero 独占首屏、一屏一节、等量左右边距、真实照片、每页 1–2 个高光时刻、按行业抽调色板、无图片说明文字、地址与联系方式格式、禁用紫色）；`copy-lint` 要求 h1 命名品类与买家、首屏有硬事实、假设内容标 `data-assumed`——这些对任务型界面不适用且会误导；gate 把 `hero-enter` / `moment-none` 当作必须项，对后台界面属误报；只检查渲染后的 DOM，不感知 Vue 路由与组件状态；只打开本地页面，SPA 用构建产物时每次 gate 前必须重新构建、用 dev server 时服务必须在运行；`Stop` hook 只在 Claude Code 类环境自动触发，本会话为手动安装，需显式运行 gate；gate 默认最多 3 轮，`GATE: ERROR` / `OFF` 时不得重跑；只列 FAIL，不自动修；被误判的 FAIL 只能写 waivers 并给理由，不得改 skill 自带 kit 或规避检查。 |

### 1.4 能力对照（用于理解为何要限缩）

| 维度 | `impeccable` | `design-taste-frontend` |
| --- | --- | --- |
| 原生主场 | 通用前端，含 Operate 型后台/工具 | 公司官网、产品与落地页（Persuade） |
| 决策权 | 决定产品/视觉方向，产出契约文档 | 按业务类型「抽签」决定版式与配色，不面向任务界面 |
| 代码写入 | 有（Refine / Fix / Enhance 类命令） | 有（页面构建），但本项目**禁用** |
| 浏览器实测 | 以「看渲染结果」为原则，靠外部浏览器工具 | 自带固定断点脚本 + finish gate，可独立出客观结论 |
| 数据/状态 | `harden` 覆盖空态、错误、极端输入 | 不覆盖 |
| 设计契约 | PRODUCT.md / DESIGN.md / surface brief | 无 |
| 项目测试 | 不运行 | 不运行 |

---

## 2. 分工、交接关系与不重叠约束

### 2.1 分工矩阵

| 环节 | `impeccable`（主责：唯一决策方与唯一写入方） | `design-taste-frontend`（副责：只读基线与独立验收方） |
| --- | --- | --- |
| 页面结构 | 产品上下文、页面简报、信息架构、设计系统契约 | 只提供可客观测量的渲染基线清单（A3），不参与结构决策 |
| 交互表现 | 组件状态矩阵、UX 文案、空/错/权限态、响应式与层级 | 不参与 |
| 数据衔接 | 接口状态边界、错误码表达、下载/导出一致性、版本历史增量简报 | 不参与 |
| 交付校验 | 技术质检与 UX 评审报告、合并修复、项目既有验证命令收口 | 对已构建页面做独立浏览器测量与 gate 结论，回交发现 |

### 2.2 交接关系

| 编号 | 交接 | 上游产出 | 下游消费 | 交接判定 |
| --- | --- | --- | --- | --- |
| H1 | 基线交接（taste-skill → impeccable） | A3《渲染可测量基线清单》与停用规则清单 | B1/B3/C1 与 D2 共用同一份口径 | 清单只含可客观测量项，且已明确列出停用的营销规则 |
| H2 | 契约交接（impeccable 内部 → 双方） | PRODUCT.md、DESIGN.md、各路由 surface brief | 所有后续提示词；taste-skill 的验收以 DESIGN.md 为一致性基准 | 冲突时 DESIGN.md 与 `docs/api.md` 优先；taste-skill 的抽签结果不得覆盖 |
| H3 | 产物交接（impeccable → taste-skill） | 本次改动面清单、一个可本地打开的构建产物（dev server URL 或构建页面 + root） | D2 的浏览器检查 | 构建产物是最新一次构建；dev server 若被使用则在检查期间保持运行 |
| H4 | 结论回交（taste-skill → impeccable） | `GATE:` 报告、测量明细、waivers、未能检查项 | D3 统一判断与修复 | taste-skill 不自行修改 `apps/web`；报告须区分「真实缺陷」与「营销规则误报」 |
| H5 | 项目校验交接（impeccable → 项目命令） | 修复后的工作区、交付结论 | `docs/handoff-prompt.md` 第 3 节的既有验证命令 | 两个 skill 都不替代、不重复实现项目测试与类型检查 |

### 2.3 不重叠约束（硬约束，全部提示词共同遵守）

- **C1 唯一写入方**：只有 `impeccable` 可修改 `apps/web/**` 与项目根目录的设计契约文档。`design-taste-frontend` 全程只读页面，只允许在 `.taste-skill/` 下写检查产物。
- **C2 唯一事实来源**：产品与视觉事实以 PRODUCT.md / DESIGN.md、surface brief、`docs/api.md`、`docs/handoff-prompt.md` 为准。taste-skill 的抽签调色板、hero 类型、moments、配色禁令一律不作为决策依据。
- **C3 规则限缩**：taste-skill 的营销站点 house rules 与 `copy-lint` 的品类/买家/硬事实规则整体停用；`impeccable` 仅使用 Operate 模式与 Read 侧的排版一致性要求，不使用 Persuade / Experience 的「全力表达」尺度；其 `craft-floor.md` 中标为 ban 的绝对禁令仍需遵守。
- **C4 验收分层**：项目既有验证命令（功能/类型/构建/迁移校验/依赖审计/diff）由项目命令负责；`impeccable audit` 只出技术质检报告；taste-skill gate 只出渲染测量。三者互不替代、不互相宣布对方通过。
- **C5 零无关资产**：不把任一 skill 的 kit、示例页、示例图片、字体复制进 `apps/web`；不新增依赖、状态库、UI 库或图标库。
- **C6 串行交接**：不同时在同一目标上运行两个 skill 的写入类命令；每次只发一条提示词，按 H1→H2→H3→H4→H5 顺序交接，交接以文档或构建产物为单位。
- **C7 边界守恒**：不改 `apps/api`、不改 24 个接口契约、不新增路由、不引入登录/多班级/JWT/RBAC/真实敏感学生数据；会话中的管理令牌与能力链接不出现在文案、日志、URL 展示中；公开页面不渲染全班名单。
- **C8 待确认优先**：第 4 节任一项未获答复时，相关提示词只输出「影响 + 可选项 + 建议」，不把假设落实为代码，也不以「合理默认」名义新增业务细节。

---

## 3. 提示词条目录

> 每条格式统一：编号 / 调用 skill / 所需输入上下文 / 提示词 / 期望产出 / 完成标准。
> 发送时请按 0.1 拼接 0.4 通用前导。

### 3.1 环节 A — 页面结构

#### A1 产品上下文与六页简报

- **调用 skill**：`impeccable`（`init` + `shape`）
- **所需输入上下文**：0.4 通用前导；`docs/handoff-prompt.md` 1.1–1.2、2.1；`apps/web/src/router.ts`；设计 spec 的角色与权限表、验收标准。
- **提示词**：
  > 以 impeccable 的 `init` + `shape` 流程处理本项目前端。先读取上述项目文档与 `router.ts`，把 6 条既有路由逐条写成 surface brief：目标与使用者、唯一主任务、Visitor Mode、关键状态与数据范围、必须保持不变的东西、反目标。所有页面按 Operate 模式处理（学生端是任务页，不是营销页）。本条只输出 `PRODUCT.md` 与简报，不修改 `apps/web` 任何文件；凡项目文档未给出的品牌、字体、素材、视觉方向一律列为待确认项，不要自行补齐，也不要发起多轮访谈或写方向契约。
- **期望产出**：`PRODUCT.md`；覆盖 6 条路由的 surface brief（含 job / audience / outcome / mode / states / ranges / constraints / anti-goals）；待确认项清单。
- **完成标准**：6 条路由逐条覆盖且无遗漏、无新增路由；每条 mode 标注 Operate；`apps/web` 零改动；未出现臆造的品牌色/字体/图片/业务事实；待确认项与第 4 节对齐。

#### A2 视觉契约与设计系统提取

- **调用 skill**：`impeccable`（`document` + `extract`）
- **所需输入上下文**：A1 的简报；`apps/web/src/styles.css`；六个 `views/*.vue`；`apps/web/src/App.vue`；0.2 中「无 UI 库/字体资源」的事实。
- **提示词**：
  > 以 impeccable 的 `document` + `extract` 流程，从现有 `styles.css` 与六个视图中提取已在使用的颜色、字号、间距、圆角与组件模式，生成项目根目录 `DESIGN.md`（DESIGN.md 格式，frontmatter 为机器可读 token）与一份「共享组件 / 一次性实现」清单。只描述代码中确实存在的值，不引入新配色、新字体、新图标库或新组件库；需要人为确认的氛围与色彩描述列为待确认项，不代为决定。本条不修改任何 `.vue` 文件。
- **期望产出**：`DESIGN.md`（token 化）；可复用 token 与组件清单；漂移清单（哪些是一次性实现）。
- **完成标准**：每个 token 都能回溯到现有代码；`apps/web` 零改动；描述性措辞的未决项已列入待确认；文件可作为后续一致性基准供 H2 使用。

#### A3 渲染可测量基线与规则停用清单

- **调用 skill**：`design-taste-frontend`（只读，仅使用 references 中可客观测量的部分）
- **所需输入上下文**：A2 的 `DESIGN.md`；0.2 的「手机浏览器」适配要求；`design-taste-frontend/SKILL.md` 第 5 节 Checklist 与 `references/gate.md`。
- **提示词**：
  > 以 design-taste-frontend 的参考文档中「可客观测量」的部分为限，产出一份只读的《渲染可测量基线清单》：固定断点、等边距与对齐、单一按钮/卡片/圆角/字号体系、触摸点击区、键盘焦点与标题层级、文本对比度、`prefers-reduced-motion`、无占位文案、hover 反馈。另附一份《停用规则清单》，逐条写明本项目为何停用以下营销规则：hero 独占首屏、一屏一节、真实照片、抽签调色板与高光时刻、h1 必须命名品类与买家、硬事实与 `data-assumed`、地址与联系方式格式、紫色禁令、`hero-enter` / `moment-none` 必过项。本条不复制 skill 的 `assets/` 到 `apps/web`，不运行 gate，不修改任何页面文件。
- **期望产出**：《渲染可测量基线清单》与《停用规则清单》（交 H1 给 impeccable，并作为 D2 的唯一验收口径）。
- **完成标准**：清单只含可客观测量项，不含任何视觉方向建议；停用理由逐条对应 1.3 的能力限制；`apps/web` 与 `.taste-skill/` 均零改动。

### 3.2 环节 B — 交互表现

#### B1 组件状态矩阵与动效边界

- **调用 skill**：`impeccable`（`craft-floor.md` + Operate 模式 + 必要的 Refine 类命令）
- **所需输入上下文**：A1 简报、A2 `DESIGN.md`、A3 基线；`apps/web/src/views/*.vue` 现有交互；`docs/api.md` 3.9–3.13、4.2–4.5。
- **提示词**：
  > 以 impeccable 的 craft-floor 与 Operate 模式为准，针对 6 条路由的交互组件建立并落实状态矩阵：default / hover / focus / active / disabled / loading / error，外加 empty / success / 无权限。重点覆盖名单导入、发布与状态切换、看板批改与导出、线上提交（文本、附件、重复提交）、签到幂等、接龙占位、回执查看。动效只表达状态变化，遵循 Operate 的短时长与 reduced-motion 保留反馈；不做滚动编排、入场序列或装饰性动画。你是本阶段唯一可修改 `apps/web` 的 skill，修改范围只限本条涉及的视图与 `styles.css`。
- **期望产出**：状态矩阵文档；对应的视图与样式改动；改动面清单。
- **完成标准**：每个交互组件 7 态齐全，关键流程的空/错/成功态可见；reduced-motion 下状态变化仍可感知；无滚动联动与整页入场序列；`apps/web` 之外零改动；A3 基线中可测量项未被破坏。

#### B2 UX 文案、错误提示与首次使用

- **调用 skill**：`impeccable`（`clarify` + `onboard`）
- **所需输入上下文**：`docs/api.md` 第 1 节错误码表与 4.2 的校验错误说明；0.2 的既有业务术语；B1 状态矩阵；`docs/handoff-prompt.md` 6 的简体中文约定。
- **提示词**：
  > 以 impeccable 的 `clarify` + `onboard` 处理全站 UX 文案、错误提示、空态与首次使用引导。错误文案必须说明问题与恢复动作，并覆盖 400/401/403/404/409/413/429/503/500 及 `VALIDATION_ERROR`、`FILE_TOO_LARGE`、`RATE_LIMITED`；班级未初始化、空名单、未批改等空态要能引导下一步。文案沿用项目既有术语（应交/已完成/未完成/迟交、缺交名单、分享链接、回执码、分组、目标名单），不编造业务事实、不新增功能说明。不得在提示、URL 展示或日志中暴露管理令牌、`shareCode`、`receiptCode` 或全班名单。
- **期望产出**：文案对照表；对应视图改动；无法由现有接口区分的错误语义列为待确认项。
- **完成标准**：每个错误码都有可读且可恢复的提示；空态不出现「暂无数据」式无引导文案；术语与现有中文一致；未新增业务事实；demo 鉴权边界未被文案破坏。

#### B3 响应式与信息层级

- **调用 skill**：`impeccable`（`adapt` + `layout`；仅在必要时使用极少量 `animate`）
- **所需输入上下文**：A1 简报、A2 `DESIGN.md`、A3 基线；0.2 的手机浏览器适配要求；`apps/web/src/router.ts`。
- **提示词**：
  > 以 impeccable 的 `adapt` + `layout` 处理响应式与信息层级。以「接口与前端布局适用于手机浏览器」和 A3 基线为准，覆盖 1440 / 1024 / 768 / 390，并按基线做窄屏溢出检查；教师看板与名单在窄屏做结构式折叠而非等比缩放；控件满足触摸尺寸；保持 6 条既有路由与现有导航逻辑，不引入新的动效模板或布局范式。任何超出 A3 基线的断点或设备优先级要求，列为待确认项。
- **期望产出**：断点行为说明；对应视图与样式改动。
- **完成标准**：四档宽度无横向溢出、无遮挡；窄屏下看板/名单可完成主任务；触摸控件达标；路由结构未变；未新增依赖与动效模板。

### 3.3 环节 C — 数据衔接

#### C1 数据边界用例与状态兜底

- **调用 skill**：`impeccable`（`harden`）
- **所需输入上下文**：`docs/api.md` 全量接口契约（尤其 3.2、3.10、3.13、4.1–4.7）；`apps/web/src/api/client.ts`；0.2 的统一信封与 Blob 下载事实；`docs/handoff-prompt.md` 关于空响应体修复的说明。
- **提示词**：
  > 以 impeccable 的 `harden` 建立并落实一份「数据边界用例表」，逐条覆盖：班级未初始化（`currentClass` 返回 `data: null`，不得当作已存在）、空名单、`draft` / `published` / `closed` 三态、无提交 / 无附件 / 未批改（`feedback` 为 `null`）、签到已签到、接龙重复占位、重复提交版本递增、上传超限、导出失败、限流、网络失败与并发重复操作。保留 `client.ts` 既有的统一信封解包与二进制下载路径；不得吞掉错误码，不得把空 Blob 当作有效数据判断；不得改动 `apps/api` 的接口契约。
- **期望产出**：边界用例表；对应视图与客户端改动（仅限 `apps/web` 内的适配，不改接口定义）。
- **完成标准**：每条路由的关键状态都有可见解释；`data: null` 与二进制响应被正确区分；错误码可向 B2 的文案映射；`apps/api` 与 `docs/api.md` 零改动。

#### C2 版本历史前端增量简报（只出方案，不写代码）

- **调用 skill**：`impeccable`（`shape` 增量）
- **所需输入上下文**：`docs/api.md` 3.16、4.6、3.14、4.7；`docs/handoff-prompt.md` P1-8；`apps/web/src/api/client.ts` 中 `StudentReceipt` 类型与现有方法；`apps/web/src/views/StudentReceiptView.vue`、`AssignmentDashboardView.vue`。
- **提示词**：
  > 以 impeccable 的 `shape` 增量流程只输出一份《版本历史前端增量简报》，不写代码。已知事实：3.16 提供教师侧 `GET /submissions/{submissionId}/versions`；4.6 回执已追加 `versions`；3.14 / 4.7 可用历史附件 `fileId` 下载；`client.ts` 的 `StudentReceipt` 类型尚无 `versions` 字段，也没有版本历史客户端方法；交接文档 P1-8 标注前端 UI 待做。请在简报中列出可选入口、教师端与学生端各自可见范围、复用哪条下载路径、会触及哪些现有文件、对现有组件测试的影响，并把所有需要拍板的选择列为待确认项。不得新增接口、不得改后端、不得假定用户已选定某种展示形态。
- **期望产出**：增量简报（job / outcome / scope / states / constraints / open decisions）；待确认项清单。
- **完成标准**：`apps/web` 与 `apps/api` 零改动；不新增接口、不新增路由；所有展示形态选择均以「可选项 + 影响」呈现，没有默认拍板；与第 4 节待确认项对应。

#### C3 下载、导出与鉴权一致性收口

- **调用 skill**：`impeccable`（`polish`，受控范围）
- **所需输入上下文**：`apps/web/src/api/client.ts` 的 `triggerFileDownload` / `download` / `exportFile` / `downloadSubmissionFile`；`docs/api.md` 3.13–3.15、4.7；0.2 的鉴权与边界事实；C1 用例表。
- **提示词**：
  > 以 impeccable 的 `polish` 收口数据衔接的一致性：保持 `client.ts` 现有的二进制下载（Blob、`Content-Disposition` 文件名解码）与导出行为；确认管理令牌仅存于会话、能力链接只在路由参数中使用、公开页面不渲染全班名单；对 C1 边界用例补齐可见反馈。本条不得引入新的鉴权方式、新的状态库或新的依赖，不得改动 `apps/api` 与 `docs/api.md` 的接口定义，不做超出 C1 范围的视觉重设计。
- **期望产出**：一致性修正；H3 交接所需的改动面清单。
- **完成标准**：下载/导出行为与既有实现一致；文件名解码、错误提示与空态完好；无新增依赖与鉴权方式；`apps/api` 零改动；改动面清单可直接交给 D2。

### 3.4 环节 D — 交付校验

#### D1 技术质检与 UX 评审（只出报告）

- **调用 skill**：`impeccable`（`audit` + `critique`）
- **所需输入上下文**：A2 `DESIGN.md`；C3 改动面清单；6 条路由的渲染结果；B1/B2/B3/C1 的产出文档。
- **提示词**：
  > 以 impeccable 的 `audit` + `critique` 对本次改动的 6 条路由出报告，不修代码。`audit` 按 a11y / performance / theming / responsive / implementation integrity 五个维度各给 0–4 分与关键发现，区分确定性检测结论与视觉判断并标注假阳性；`critique` 给 UX 启发式 P0/P1 清单。以 `DESIGN.md` 为一致性基准，以 A3 基线为渲染口径。报告交 D3 统一处理，本条不修改任何文件。
- **期望产出**：技术质检报告（五维评分）；UX 评审报告（P0/P1）；未检查项说明。
- **完成标准**：五维逐项给分且附证据；假阳性单独标注；报告只描述不改代码；未运行项目既有验证命令（留给 D3）。

#### D2 独立渲染验收（只读 gate）

- **调用 skill**：`design-taste-frontend`（`consistency.mjs` / 布局 `check.mjs` / `shoot.mjs` / `copy-lint.mjs` / `gate.mjs`，只读使用）
- **所需输入上下文**：H3 交接的「最新可本地打开的构建产物」与改动面清单；A3《渲染可测量基线清单》与《停用规则清单》；H2 的 `DESIGN.md`；本机能用的 Node 22+ 与 Chrome/Edge/Chromium 情况（见第 4 节）。
- **提示词**：
  > 以 design-taste-frontend 的浏览器检查与 finish gate 做独立只读验收。输入是 H3 交接的、已构建且可本地打开的页面（dev server URL 或构建页面 + root）、A3 基线与 H2 设计契约。只采纳与 A3 对应的可测量项；A3 停用清单中的营销规则若触发 FAIL，写入 waivers 并逐条记录理由，不为通过检查而反向改造业务界面。报告首行给出 `GATE:` 状态，随后列出全部开放 FAIL、全部 waiver、未能检查项与各检查结论。本条不修改 `apps/web`，仅写 `.taste-skill/` 下的检查产物。若环境不具备可用浏览器导致检查无法运行，据实记录 `GATE` 状态并说明未检查项，不得宣称通过。
- **期望产出**：`.taste-skill/` 下的测量产物与截图；`GATE:` 报告；waivers 记录；H4 回交给 impeccable 的发现清单。
- **完成标准**：A3 所列可测量项 0 个非豁免 FAIL；营销专属 FAIL 均有 waiver 与理由；报告区分真实缺陷与误报；`apps/web` 零改动；未因「通过 gate」而新增 hero、照片、抽签配色或高光时刻。

#### D3 合并修复与交付结论

- **调用 skill**：`impeccable`（`polish`）+ 项目既有验证命令（H5）
- **所需输入上下文**：D1 报告、D2 报告与 waivers；A2 `DESIGN.md`；0.2 的验证与推送门槛；`docs/api.md`、设计 spec、`docs/handoff-prompt.md` 的文档同步规则。
- **提示词**：
  > 以 impeccable 的 `polish` 作为唯一写入方，合并处理 D1 与 D2 的发现，修复顺序为：功能缺陷与数据丢失 → 缺失状态 → 层级/响应式/设计系统漂移 → 视觉与动效不一致 → 代码与资产清理。营销规则误报不修代码，只在交付结论中说明。随后按 `docs/handoff-prompt.md` 第 3 节跑项目既有验证命令，并确认 `docs/api.md`、设计 spec、交接文档与本次实现一致（接口契约未变则无需改动文档）。输出交付结论：改动面、验证结果、开放项、待确认项。按既有门槛，本条不推送 `main`。
- **期望产出**：修复后的 `apps/web`；交付结论报告；如有文档一致性问题则同步文档。
- **完成标准**：项目既有验证命令全部通过；`apps/web` 组件测试保持通过；接口契约未变时 `docs/api.md` 无需改动（若改动则必须同步 spec 与测试）；工作区改动清晰可列、未推送；开放项与待确认项逐条写明，不隐藏 D2 的 waiver 与未检查项。

---

## 4. 待确认项（未答复前不得由执行 agent 自行补齐）

| 编号 | 待确认项 | 影响的提示词 |
| --- | --- | --- |
| T1 | 本轮前端目标范围：是对现有 6 个页面做质量提升，还是优先补齐 P1-8 的「查看历次修改」UI，或两者都做、以何者为先 | A1、C2、D3 |
| T2 | 版本历史 UI 的具体入口与展示形态：只做教师看板、只做学生回执，还是两者；是否需要展示历史文本、历史附件下载入口、版本时间 | C2 |
| T3 | 是否消费回执新增的 `versions` 字段，以及 `client.ts` 是否允许新增对应的类型字段与客户端方法（属前端内部适配，不改后端契约） | C2、C3 |
| T4 | 是否允许在项目根目录新增 `PRODUCT.md` / `DESIGN.md` 等设计契约文件，以及 `.taste-skill/` 检查产物是否纳入版本控制（当前 `.gitignore` 未配置该目录，仓库中也不存在这三个路径） | A1、A2、D2 |
| T5 | 设计基线的来源：是否已有指定的品牌色、字体、Logo、真实图片素材；若无，是否接受「仅沿用现有 `styles.css` 中已存在的值」作为唯一默认 | A2、A3、B1 |
| T6 | 设备与断点优先级：是否以手机浏览器为第一优先；是否要求覆盖 320px 溢出检查；是否有需实测的具体机型 | A3、B3、D2 |
| T7 | 是否允许新增任何依赖或资源（UI 组件库、图标库、字体文件）；本项目当前依赖仅 Vue 与 Vue Router | A2、B1、C3 |
| T8 | 错误提示粒度：是否需要对 429（`RATE_LIMITED` + `Retry-After`）、413（`FILE_TOO_LARGE`）、503（服务未配置/数据库不可达）做差异化文案，还是沿用统一 message | B2、C1 |
| T9 | 是否需要多语言、RTL、深色模式、文本放大等 `harden` 会触及的维度；当前项目仅简体中文 | B2、C1、D1 |
| T10 | 运行环境可用性：本机是否具备 Node 22+ 与 Chrome/Edge/Chromium；`impeccable` launcher 首次运行如需下载二进制是否被允许；taste-skill gate 采用 dev server URL 还是构建页面 + root | D1、D2 |
| T11 | 是否允许项目前端消费 `GET /health`、或把服务不可达状态做成可见提示（当前前端未使用该接口） | C1、B2 |
| T12 | 设计产物与代码改动的提交策略：是否一次性提交、提交信息规范、`docs/frontend-skill-prompts.md` 本身是否随本轮一起提交；以及推送时机（沿用交接文档「验证全过后才推送」的门槛） | D3 |

---

## 5. 完成判定

当且仅当：A1–A3、B1–B3、C1–C3、D1–D3 的完成标准逐条满足，H1–H5 交接产物齐备，C1–C8 硬约束未被突破，第 4 节待确认项已逐条给出答复或明确标注为开放项，且项目既有验证命令全部通过时，本轮前端制作才判定为完成。
