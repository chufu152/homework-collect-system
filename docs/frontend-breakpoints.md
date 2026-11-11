# B3 响应式与信息层级：断点行为说明

> 依据 `docs/frontend-skill-prompts.md` 3.2 的 B3 提示词、`docs/frontend-decisions.md`（T5 / T6 / T7 / T12 定案）、`docs/frontend-render-baseline.md`（A3 基线 B1 / B2 / B4）与 `docs/frontend-stage-a.md`。
> **本轮定位**：B1、B2 完成后按既定顺序推进 B3。先做客观渲染测量，再只修测量发现的真实缺陷，最后给出断点行为说明。
> **边界声明**：本轮是 B3 的布局实测，**不是 D2 的 gate 验收**；未运行 `design-taste-frontend` 的检查脚本，未创建 `.taste-skill/`，不输出也不宣称任何 `GATE:` 结论。A3 第 1.2 节指出的 `--quick` 覆盖缺口（B7 reduced-motion、B9 hover 位移）本轮同样**未检查**。
> 范围守恒：`apps/api`、`docs/api.md`、`apps/web/src/router.ts` 与 6 条路由结构零改动；零新增依赖、零新增资源、零新增动效模板（T7 / C5 / C7）；既有 760px / 430px 断点值未改（T6）；本轮不提交、不推送（T12）。

---

## 1. 测量方法（可复算，零新增依赖）

| 项 | 口径 |
| --- | --- |
| 构建产物 | 本轮先执行 `npm run build --workspace @homework/web`，测的是最新 `apps/web/dist`（CSS `index-DX-0jEFe.css`） |
| 浏览器 | 本机 Edge headless，经 CDP 驱动；Node `v22.22.2` 内置 `fetch` / `WebSocket` / `http`，**未安装 Playwright / Puppeteer** |
| 临时脚本 | `apps/web/var/b3/measure.mjs`，产物 `report.json` / `report.md`；`var/` 已被 `.gitignore` 忽略，**不是交付物、不入库** |
| 数据 | 脚本内起静态服务器 + SPA fallback，并为 `/api/v1/*` 返回固定夹具（8 名学生、4 项作业、含 3 个版本的回执、长未完成名单、长附件名、长不可断行 URL），刻意使用压力数据 |
| 宽度 | `1440 / 1024 / 768 / 390 / 320`（前四档来自 B3 提示词，320 来自 T6 的溢出检查要求） |
| 路由实例 | 7 个：6 条既有路由 + `/a/relay1`（同一条 `/a/:shareCode` 路由的接龙夹具变体）；每档每路由测 `collapsed` 与 `expanded`（展开全部 `<details>` 与版本历史按钮）两态，共 **70 个测量单元** |
| 采集项 | 页面横向溢出（`max(documentElement.scrollWidth, body.scrollWidth) - clientWidth`）、越界元素（排除滚动容器内）、顶栏三段互相遮挡、可见控件的 tap FAIL（A3 B4：高 <32px 或宽 <24px 且 8px 内有邻目标）与 <44px 告警、网格隐式行、看板/名单结构显示状态 |
| 已知测量环境差异 | ① 在线字体 `fonts.googleapis.com` / `fonts.gstatic.com` 被显式屏蔽，中文使用系统回退字体，字形宽度可能与生产略有差异；② 视口用 `mobile: false`，经典滚动条在 320 档占 15px，`clientWidth` 实为 305px，属于更保守的桌面窄窗情形；③ 夹具非真实 API，未覆盖真实网络错误态与真实附件下载 |

---

## 2. 修复前的客观缺陷（首轮实测）

| 档位 | 现象 | 证据 |
| --- | --- | --- |
| 1440 / 1024 / 768 | 首页 `.assignment-row` 声明 5 列，却有 7 个可见网格子项（`.mobile-summary` 无桌面隐藏规则、复制按钮多出一项），内容落入**隐式第二行**，复制按钮掉到下一行左端 | `implicitRows[{cols:5, visibleKids:7}]` |
| 1440 / 1024 / 768 | 教师看板 5 处 `<summary>` 高 17px 且邻近控件 8px 内存在，按 A3 B4 判为 tap FAIL | `failTap=5` |
| 390 / 320 | 顶栏两个 `.nav-link` 高 31px 且彼此相邻，判为 tap FAIL（教师 4 页各 2 处） | `failTap=2` |
| 390 | 看板 `.summary-strip .count-chip` 因 `white-space: nowrap`，长未完成名单宽 402px（`left 35 → right 437`），整页横向溢出 **62px** | `overflow=62`，越界元素 1 |
| 320 | 教师 4 页与接龙页整页溢出 **15px**：`body { min-width: 320px }` 与 305px 可用宽度冲突，根容器被撑到 320px | 越界元素 4（根容器组） |
| 320 | 看板整页溢出 **132px**：除上述 15px 外，`count-chip` 402px、`.feedback-form`（76px + 160px + 按钮）把 `.mobile-student-row` 撑到 344px，保存反馈按钮右缘 315px；展开态越界元素 **60 个** | `overflow=132`，`offenderCount=10 / 60` |
| 320 | 学生提交页溢出 **16px**：`.assignment-instructions` 的长 URL 在 `white-space: pre-wrap` 下不可断行，`scrollWidth 305 > clientWidth 273` | `overflow=16`，越界元素 0（内容溢出被计入文档滚动宽度） |
| 320 | 学生回执页默认态 0，展开「查看历次修改」后溢出 **15px**（同 body 下限问题） | `overflow=0 / 15` |

---

## 3. 已落实的样式改动（仅 `apps/web/src/styles.css`）

| 编号 | 改动 | 解决的问题 |
| --- | --- | --- |
| F1 | `body { min-width: min(320px, 100%) }` | 保留 320px 设计下限，但出现经典滚动条时回落到可用宽度，消除 320 档 15/16px 假下限溢出 |
| F2 | 新增 `.assignment-row .mobile-summary { display: none }`、`.assignment-row:has(.icon-button) .row-arrow { display: none }`、`.assignment-row .icon-button { grid-column: 5; grid-row: 1 }`；末列 32px → 36px | 桌面端 5 列只放 5 个可见项，消除隐式第二行与复制按钮错位；`:has()` 项目已在 `.radio-option` 使用 |
| F3 | `.summary-strip .count-chip` 改为 `display:block; max-width:100%; white-space:normal; overflow-wrap:anywhere` | 长未完成名单在 390/320 换行，不再撑破整页 |
| F4 | ≤760px：`.assignment-row` 改 2 列，带复制按钮时 3 列（末列 44px）；隐藏 `.row-metric / .status-pill / .row-arrow`，`.mobile-summary` 定位第 2 列，`.icon-button` 第 3 列并改 44×44 | **结构式折叠**：只保留标题、完成摘要、复制动作，不做等比缩放；窄屏行内不再出现隐式第二行 |
| F5 | ≤760px：`.feedback-form` 改 `minmax(56px,76px) minmax(0,1fr)` 两列，按钮 `grid-column: 1 / -1`，输入与按钮 `min-height: 44px`；`.mobile-student-row` 首列改 `minmax(0,1fr)`、子元素 `min-width: 0`；附件行 `min-width: 0`、按钮 `max-width: 100%` | 看板卡片不再被固定最小列宽撑到 344px，反馈表单在 320 档仍可完成打分与保存 |
| F6 | ≤760px：`.topbar nav .nav-link` / `.topbar-action` 设 `min-height: 44px` + `inline-flex` 居中；≤430px 收紧 `.topbar` gap 与左右内边距、nav-link 左右内边距 | 顶栏触摸目标达标，且 305px 可用宽度下三段不互相挤压 |
| F7 | `.submission-detail summary` 设 `min-height: 44px; padding: 10px 0`（保留原生 disclosure marker） | 消除桌面看板与窄屏回执的 tap FAIL |
| F8 | `.assignment-heading h1` / `.assignment-instructions` 增加 `overflow-wrap: anywhere` | 长标题、长链接在 320 档任意位置断行 |

> 断点值仍为既有的 `760px` 与 `430px`，**未新增媒体查询档位**；所有新增声明都落在这两个既有块或基础规则中。颜色、圆角、字号、字体、阴影体系一律沿用 `styles.css` 已有值（T5）。

---

## 4. 断点行为说明（B3 期望产出）

| 区间 | 顶栏 | 作业列表 | 教师看板 / 名单 | 表单与文本 |
| --- | --- | --- | --- | --- |
| ≥ 761px | 68px 高，品牌 + 导航 + 发布入口三段横排 | 5 列完整信息（标题 / 状态 / 已完成 / 未完成 / 箭头↔复制按钮）；窄屏摘要隐藏 | `.student-table-wrap` 表格可见，`.mobile-student-list` 隐藏；反馈表单 3 列（分数 / 反馈 / 保存） | `.field-row` / `.radio-grid` 两列；未完成名单现在也可换行 |
| 431–760px | 60px 高；导航与发布入口 ≥44px 触摸高度 | 折叠为 2 列（标题 + 完成摘要），有分享链接时第 3 列放 44px 复制按钮；隐藏次要指标与箭头 | 表格隐藏，改 8 张学生卡片；卡片内保留状态、提交内容、历次修改、反馈与导出；反馈表单变 2 列 + 整行保存按钮；复制字段整行 | `.field-row` / `.radio-grid` 单列；统计 4→2 列 |
| ≤ 430px | 再收紧 gap / 内边距，字号沿用既有 10–13px | 同上，不再缩小控件 | 同上；卡片首列 `minmax(0,1fr)` 保证长文本与长附件名不撑破 | 公有页表单单列；接龙行 3→2 列；长标题与说明任意位置断行 |

**信息层级原则**：窄屏隐藏的是重复或次要信息（指标数值、状态胶囊、箭头），保留的是主任务信息（作业/学生标识、完成进度、提交内容、反馈、下载、导出、复制）；表格到卡片是结构替换，不是等比缩放。6 条路由与导航逻辑完全未变。

---

## 5. 修复后复测结果

复测使用同一脚本、同一夹具、同一构建产物口径（重新构建后 CSS hash 与测量时一致）：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 70 个单元最大横向溢出 | 132px（320 看板） | **0px** |
| 越界元素总数 | 超过 90（含展开态 60） | **0** |
| tap FAIL 总数 | 每档教师页 2 / 桌面看板 5 | **0** |
| 顶栏三段遮挡 | 0 | **0** |
| 1440 首页作业行 | 5 列 / 7 可见项 | **5 列 / 5 可见项** |
| 390 / 320 首页作业行 | 3 列 / 4 可见项 | **2–3 列 / 2–3 可见项** |
| 390 / 320 教师看板（展开态） | 溢出 62 / 132px | **表格 `none`、卡片列表 `grid`、8 行、23 个可见按钮、5 个可见 summary、溢出 0** |

> 剩余 **WARN 级**（A3 B4 明确不阻断，留 D1 / D2 判断）：`.brand-lockup` 34px、`.button` 42px、表单输入 43px、公有页 `.brand-mark` 29×29px 等仍低于 44px 但 ≥32px 且无 8px 内相邻小目标。本轮未为凑数值改动既有的按钮与品牌标记尺寸（T5）。

---

## 6. 项目既有验证命令

| 命令 | 结果 |
| --- | --- |
| `npm test` | **84 项全通过**（API 54 / Web 27 / contracts 3，25 个测试文件） |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过（CSS 15.89 kB / JS 154.67 kB，gzip 4.12 / 54.20 kB） |
| `npm run db:validate` | 通过（Prisma schema 有效） |
| `git diff --check` | 退出码 0，仅既知 CRLF 提示 |
| `apps/web` 视图 / 客户端 / 测试文件 | 本轮 **零改动**，改动面只有 `apps/web/src/styles.css` 与本说明文档 |

> CSS 布局无法由 jsdom 组件测试覆盖，故 B3 的验收证据是上述 CDP 实测报告（`apps/web/var/b3/report.json`），不是新增组件测试；两者互不替代（C4）。

---

## 7. 完成标准自检与遗留

| B3 完成标准 | 现状 |
| --- | --- |
| 1440 / 1024 / 768 / 390 四档无横向溢出、无遮挡 | 70 单元溢出 0、顶栏遮挡 0；320 档按 T6 追加亦为 0 |
| 窄屏下看板 / 名单可完成主任务 | 390 / 320 卡片列表 8 行、23 个可见操作按钮、5 个提交内容折叠入口，反馈与版本历史可用 |
| 触摸控件达标 | A3 B4 的 FAIL 级从每档 2–5 处降为 0；低于 44px 的 WARN 级剩余项已在第 5 节列明 |
| 路由结构未变 | `router.ts` 与 6 条路径零改动，`apps/api` / `docs/api.md` 零改动 |
| 未新增依赖与动效模板 | 仅 CSS 声明，零新增依赖 / 资源 / 断点 / 动效 |

**未覆盖 / 留待后续环节**：

- D2 的 gate 未运行；A3 的 B7（reduced-motion）、B9 中 `hover-move` / `hover-spill` 本轮未检查，不得计为通过。
- 在线字体屏蔽、桌面经典滚动条、夹具数据三项测量前提已在第 1 节注明；真实 PostgreSQL + 真实 API 的渲染未在本轮测量范围内。
- 低于 44px 的 WARN 级控件（品牌标记、42px 按钮、43px 输入）与 A3 B3「单一圆角 / 字号体系」的既存漂移（A2 记录：12 种圆角、51 处硬编码颜色）属 D1 评审与 D3 修复范围，B3 未擅自大改。
- U1（后端 `message` 英文）、U2（下载 / 导出失败时未解析 JSON 错误信封）仍分别留待项目所有者与 C3。
- 按 T12，本轮所有产出留工作区，**未提交、未推送**。
