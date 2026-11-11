# C1 数据边界用例与状态兜底

> 状态：C1 实施记录；本轮工作区产物，未提交、未推送。依据 `docs/frontend-skill-prompts.md` §3.3、`docs/frontend-decisions.md` T8/T9/T11 与现有 `docs/api.md` 契约整理。本文记录前端如何呈现接口已定义的边界，不扩展业务契约。

## 范围与契约

- 仅涉及 `apps/web` 的 API 客户端、视图与测试；`apps/api` 和 `docs/api.md` 不属于本任务改动范围。
- 成功 JSON 响应必须是统一信封并包含 `data`。`GET /classes/current` 的 `data: null` 是班级尚未初始化的合法结果；缺失 `data`、空 JSON 响应体或不能解析的 JSON 不能当作 `null`。
- 下载 / 导出成功响应是原始二进制流，不是 JSON 信封。文件服务契约包含空文件校验，因此 0 字节响应不作为可下载的有效文件。
- 保留 HTTP 错误状态、接口 `code` 与 `Retry-After`；错误提示沿用 B2 的 `describeError()`。依 T8，仅 429 / 413 / 503 使用差异化文案，其余结构化错误沿用服务端 `message` 并补状态级恢复建议。
- 依 T9，不在 C1 引入多语言、RTL、深色模式或文本放大；依 T11，不新增 `GET /health` 探测。

## 数据边界用例表

| 编号 | 边界 / 接口事实 | 前端表现与处理 | 自动化证据 | 状态 |
| --- | --- | --- | --- | --- |
| C1-01 | `GET /classes/current` 返回 `data: null` | 客户端保留为 `null`；班级设置页展示创建班级入口，发布页提示先建立班级，不停留在加载态。 | `client.spec.ts`：`keeps a documented data:null envelope...`；`ClassSetupView.spec.ts`；`AssignmentCreateView.spec.ts` | 已覆盖 |
| C1-02 | 成功响应缺少 `data` 或 JSON 响应体为空 | 抛出 `INVALID_ENVELOPE`，不把协议错误误判为「尚未建班」。 | `client.spec.ts`：缺少 `data` 与空 JSON 响应两项 | 已覆盖 |
| C1-03 | 名单分页返回空页但 `total` 仍要求继续 | 客户端在无进展时停止分页并报 `INVALID_RESPONSE`，避免无尽请求；拒绝格式错误的分页数据。 | `client.spec.ts`：`stops paginated roster loading if a later page makes no progress` | 已覆盖 |
| C1-04 | 班级已存在但名单为空（学生列表 `items: []`、`total: 0`） | 班级设置页说明先导入名单，并禁用随机分组；发布页说明当前没有可发布对象，提交时仍由现有前置校验阻止空目标。 | `ClassSetupView.spec.ts`；`AssignmentCreateView.spec.ts` | 已覆盖 |
| C1-05 | 作业列表为空（`items: []`） | 教师首页显示尚无作业及建立名单 / 发布首项作业的下一步入口。 | `TeacherHomeView.spec.ts`：空列表用例 | 已覆盖 |
| C1-06 | 作业状态为 `draft` / `published` / `closed` | 首页展示「草稿 / 收取中 / 已结束」；草稿和已结束补充学生是否可打开 / 是否仍收取的说明。看板保留对应状态说明。 | `TeacherHomeView.spec.ts`：三态用例；看板视图现有状态文案 | 已覆盖 |
| C1-07 | 看板目标名单为空（`items: []`） | 展示没有目标学生的解释，不渲染伪造的学生行。 | `AssignmentDashboardView.spec.ts`：空目标用例 | 已覆盖 |
| C1-08 | 学生尚未提交（看板 `submissionId: null`） | 显示「尚未提交」，不显示批改、附件或版本历史操作。 | `AssignmentDashboardView.spec.ts`：提交附件与状态用例 | 已覆盖 |
| C1-09 | 当前提交版本没有附件（`files: []`） | 学生回执与教师提交内容区说明当前版本没有附件；下载列表不渲染空项。桌面看板与手机布局（`.mobile-student-list`）均展示该提示；历史版本附件仍按既有版本数据展示。 | `StudentReceiptView.spec.ts`；`AssignmentDashboardView.spec.ts`：`distinguishes a text-only submission...`（含移动端断言） | 已覆盖 |
| C1-10 | 教师尚未批改（回执 `feedback: null`；看板分数 / 反馈为 `null`） | 回执提示教师尚未添加反馈；看板显示尚未批改并保留填写反馈的入口。 | `StudentReceiptView.spec.ts`：`explains when no feedback...`；`AssignmentDashboardView.spec.ts` | 已覆盖 |
| C1-11 | 回执版本字段缺失 / 当前仅一版 / 历史为空 | 旧响应没有 `versions` 时回执仍可读；只有多版时展示历史入口；看板空历史显示中性说明而非错误。 | `StudentReceiptView.spec.ts`、`AssignmentDashboardView.spec.ts` | 已覆盖 |
| C1-12 | 签到幂等（`alreadyCheckedIn: true`） | 告知学生此前已签到并显示服务器记录时间，不误报为新签到。 | `StudentAssignmentView.spec.ts`：已签到回执用例 | 已覆盖 |
| C1-13 | 接龙名单读取失败 | 错误限定在接龙名单区域，作业主体仍可操作；提供原地重试，成功后清除局部错误。 | `StudentAssignmentView.spec.ts`：接龙名单失败与重试用例 | 已覆盖 |
| C1-14 | 接龙重复占位（HTTP 409） | 显示「你已经加入过这次接龙」及刷新名单的恢复动作，不显示成功回执。 | `StudentAssignmentView.spec.ts`：重复占位用例 | 已覆盖 |
| C1-15 | 学生再次提交同一线上作业 | 保持同一回执入口，版本号按服务端响应递增；不覆盖服务端版本事实。 | `StudentAssignmentView.spec.ts`：版本化重复提交用例 | 已覆盖 |
| C1-16 | 附件超过配置的单文件大小或数量 | 提交前阻止请求并显示对应限制；有限的服务端配置值用于界面和校验，缺失值沿用既有界面默认显示（20 MB / 5 个）。服务端 413 继续走 B2 差异化文案。 | `StudentAssignmentView.spec.ts`：超大小与超数量两项；`error-messages.spec.ts`：413 文案 | 已覆盖 |
| C1-17 | 429 / 413 / 503 与普通结构化错误 | JSON 错误的 `code` / `status` / `Retry-After` 保留并流向 B2；普通网络失败显示简体中文网络恢复提示。C3 后下载 / 导出端点失败同样解析错误信封并保留 `code` / `Retry-After`，429 / 413 / 503 在这些路径上也走 T8 差异化文案；信封缺失或不可解析时保留 `DOWNLOAD_FAILED` / `EXPORT_FAILED` 兜底。 | `client.spec.ts`；`error-messages.spec.ts`；视图网络错误用例；看板导出 429 差异化文案用例 | 已覆盖 |
| C1-18 | 网络失败或列表请求失败 | 教师首页提供重新加载；班级设置与发布页提供重新读取；学生接龙名单可单独重试；回执读取可重新加载。下载失败后按钮恢复可用，可再次点击。 | `TeacherHomeView.spec.ts`、`ClassSetupView.spec.ts`、`AssignmentCreateView.spec.ts`、`StudentAssignmentView.spec.ts`、`StudentReceiptView.spec.ts` | 已覆盖 |
| C1-19 | 正常二进制响应与空二进制响应 | 非空 Blob 保持二进制路径；0 字节通用响应与附件下载分别报 `EMPTY_RESPONSE` / `EMPTY_FILE`，不触发空文件下载。非空附件响应与导出响应已验证真实触发浏览器下载：`createObjectURL` → `anchor.download`（含 `Content-Disposition` 文件名解码与回退名）→ `click` → `revokeObjectURL`；导出请求携带管理令牌。测试以 mock URL 与 DOM 完成，不依赖真实浏览器。 | `client.spec.ts`：非空 Blob、空 Blob、空附件、`triggers a real browser download...`、`exports a non-empty file...` 用例 | 已覆盖 |
| C1-20 | 重复点击产生的并发操作 | 学生提交按钮在请求中禁用；看板同一导出在途时禁用重复导出；回执按文件记录下载中状态。 | `StudentAssignmentView.spec.ts`；`AssignmentDashboardView.spec.ts`：并发导出用例；回执视图状态 | 已覆盖 |
| C1-21 | 列表 / 看板响应不符合契约（缺字段、类型错误、错误页码、重复学生 ID、计数不一致） | 客户端在解析层抛 `INVALID_RESPONSE`，不做 `?? []` 静默空态：名单分页校验 `page` / `pageSize` / `total` / 单页条数并拒绝重复或无效学生 ID、无进展分页与超出 `total` 的记录数；作业列表按请求的默认页 1 与 `pageSize` 校验；分组与接龙列表必须是数组且接龙带 `items` / `total`；看板校验 `assignment` / `summary` / `items` 与四个统计字段。视图层不再把无效数据伪装成空列表。 | `client.spec.ts`：`stops paginated roster loading...` 及空响应 / 缺字段用例；视图测试不含 `?? []` 空态兜底 | 已覆盖 |

## 明确保留的边界 / 后续项

- **C3 / U2：**~~下载和导出端点失败时未解析 JSON 错误信封~~ 已在 C3 收口：三个二进制端点（教师附件 3.14、本人附件 4.7、导出 3.13）失败时解析 JSON 错误信封并保留 `code` / `message` / `Retry-After`，429 / 413 / 503 走 T8 差异化文案；信封缺失时保留原 `DOWNLOAD_FAILED` / `EXPORT_FAILED` 兜底中文文案。详见 `docs/frontend-c3-change-list.md`。
- **U1：**其余结构化 API 错误沿用服务端 `message`，若服务端 message 为英文，前端仍按 T8 保留原文；不在 C1 另建翻译表。
- **文件为空：**服务端文件存储契约包含空文件校验（`docs/api.md` §5），所以 0 字节下载响应视为异常；此处理没有更改上传或下载接口契约。
- 未运行 `design-taste-frontend` gate；本文及测试不构成 D2 的独立渲染验收，也不声明任何 gate 通过。

## 影响文件与约束核对

本阶段涉及的前端实现 / 测试包括 `apps/web/src/api/client.ts`、`apps/web/src/api/client.spec.ts`、`apps/web/src/api/error-messages.spec.ts`，以及班级设置、作业创建、教师首页、教师看板、学生作业、学生回执视图及相应组件测试。没有新增依赖或路由；没有改动 `apps/api` 或 `docs/api.md`。
