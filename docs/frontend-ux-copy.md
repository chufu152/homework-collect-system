# B2 UX 文案、错误提示与空态对照表

> 依据 `docs/frontend-skill-prompts.md` 的 B2 提示词、`docs/frontend-decisions.md` 的 T8 / T9 / T11 定案、`docs/api.md` 第 1 节错误码表与 4.2 校验说明、`docs/frontend-interaction-states.md`（B1 状态矩阵）。
> **本轮定位**：A 阶段 → P1-8 闭环 → B1 之后，按既定顺序进入 B2。改动只落在 `apps/web` 与本文件；`apps/api`、`docs/api.md`、24 个接口契约、路由与依赖均零改动（C7 / T7 / T12）。
> 事实来源：`apps/web/src/api/error-messages.ts`、`client.ts`、6 个 `views/*.vue` 及其组件测试。

---

## 1. 错误码 → 可见文案对照表

统一入口为 `describeError(error, fallback)`（`apps/web/src/api/error-messages.ts`）。它用**结构化判定**（Error + `code` + `status`）识别接口信封错误，不 import `client.ts`，因此不受组件测试里 `vi.mock('../api/client')` 影响。

| HTTP | code | 展示文案（`问题 + 恢复动作`） | 依据 |
| --- | --- | --- | --- |
| 429 | `RATE_LIMITED` | `操作太频繁，已暂时限制请求。请约 N 秒后重试。`（`N` 来自 `Retry-After`；无该头时为「请稍等片刻再重试。」） | T8 差异化；`client.ts` 现已解析该响应头 |
| 413 | `FILE_TOO_LARGE` | `附件或导出内容超出大小上限。请减小文件、分开提交，或分批导出后重试。` | T8 差异化 |
| 503 | `SERVICE_UNAVAILABLE` | `服务暂时不可用。请稍后重试；若一直无法使用，请联系教师检查运行环境。` | T8 差异化；不猜测具体成因 |
| 400 / 422 | `BAD_REQUEST` / `VALIDATION_ERROR` | `填写内容未被接受：{message} 请核对信息后重试；若仍无法完成，请联系教师。` | T8 沿用统一 `message`；422 仅兼容映射 |
| 401 | `UNAUTHORIZED` | `管理密钥无效或未保存：{message} 请到「班级名单」重新保存管理密钥后重试。` | 同上 + T11（不消费 `/health`） |
| 403 | `FORBIDDEN` | `当前操作没有权限：{message} 请确认使用的是教师入口，且管理密钥正确。` | 同上 |
| 404 | `NOT_FOUND` | `未找到对应的作业、提交或文件：{message} 请检查分享链接或回执链接是否完整；若作业已停止收取，请联系教师。` | 同上；公开接口无效码仍为 404，不判断资源是否存在 |
| 409 | `CONFLICT` | `当前状态与操作冲突：{message} 请刷新页面，确认最新状态后再试。` | 同上 |
| 500 | `INTERNAL_ERROR` | `服务处理时出错：{message} 请稍后重试；若一直无法使用，请联系教师。` | 同上 |
| 其它状态 | `REQUEST_FAILED` 等 | `操作未能完成：{message} 请核对信息后重试；若仍无法完成，请联系教师。` | 兜底，不吞掉错误码 |
| 客户端下载 / 导出 | `DOWNLOAD_FAILED` / `EXPORT_FAILED` | 保留既有中文并补恢复动作，如 `附件暂时无法下载，请稍后重试；若持续失败，请联系教师。` | 非接口信封错误，原样透传给 `describeError` |
| 普通 `Error` / 非 Error | — | 原样保留其既有中文；非 Error 用调用方的兜底文案 | 保持 B1 新增测试与既有手写文案不变 |

> `{message}` 是后端统一信封的 `message` 字段。T8 定案「其余沿用统一 `message`」，因此**没有**为每条业务错误编造中文翻译；只补状态级问题标签与恢复动作，符合「不编造业务事实」。

## 2. 接线范围（全站统一）

6 个视图共 20 处 `catch` 全部由 `error instanceof Error ? error.message : 兜底` 改为 `describeError(error, 兜底)`：

| 视图 | 覆盖的操作 |
| --- | --- |
| `TeacherHomeView.vue` | 作业列表读取 |
| `ClassSetupView.vue` | 班级读取、建班、分组、名单导入 |
| `AssignmentCreateView.vue` | 班级名单读取、作业创建 |
| `AssignmentDashboardView.vue` | 看板读取、状态切换、线下登记、反馈保存、导出、附件下载、版本历史读取 |
| `StudentAssignmentView.vue` | 作业读取、提交 / 签到 / 接龙的 `perform()` |
| `StudentReceiptView.vue` | 回执读取、附件下载 |

`client.ts` 的 `ApiRequestError` 增加只读字段 `retryAfter`（由 `Retry-After` 解析，缺失为 `null`），构造签名向后兼容；统一信封解包、`data: null` 与 Blob 下载路径均未改动。

## 3. 空态与首次使用对照表

| 场景 | 位置 | 文案 | 是否给出下一步 |
| --- | --- | --- | --- |
| 班级未初始化 | `ClassSetupView.vue` | 「创建唯一班级」区块 + 说明「demo 只支持一个班级」 | 是：填写名称并「建立班级」 |
| 空名单 / 手动分组无学生 | `ClassSetupView.vue`（本轮新增） | `班级名单还是空的，请先在上方导入学生名单，再来整理分组。` | 是 |
| 还没有分组 | `ClassSetupView.vue`（本轮新增） | `还没有分组；用上面的方式保存一次即可建立小组，发布作业时就能按分组选择对象。` | 是 |
| 发布作业时无分组 / 指定名单为空 | `AssignmentCreateView.vue` | `还没有分组，请先到"班级名单"创建分组。` / `当前目标名单没有学生，请先整理班级名单。` | 是（既有） |
| 工作台没有作业 | `TeacherHomeView.vue` | `还没有发布作业` + `先建立班级名单，再发布第一项作业…` + 两个入口按钮 | 是（既有） |
| 接龙还没有人 | `StudentAssignmentView.vue` | `还没有同学加入，从你开始。` | 是（既有） |
| 教师尚未批改 | `StudentReceiptView.vue` | `老师尚未添加反馈，稍后可以使用此回执链接再查看。` | 是（既有） |
| 版本历史为空 | `AssignmentDashboardView.vue`（本轮改写） | `这项目前只有一版提交；重新提交后才会出现历次修改。` | 是；并由 `role="alert"` 改为 `role="status"`，不再把空态误报为错误 |
| 版本历史读取失败 | `AssignmentDashboardView.vue` | 走 `describeError`，按钮回到「查看历次修改」可重试 | 是（B1 已有测试） |

B1 只读盘点中 `StudentAssignmentView.vue` 的 `empty` 关键字为 0 的线索已核对：接龙空态使用「还没有同学加入，从你开始。」，属**有引导**的空态，不是「暂无数据」式空白；无需改动。

## 4. 术语与鉴权边界

- 沿用既有术语：应交 / 已完成 / 未完成 / 迟交、未完成名单、分享链接、回执码、分组、目标名单、管理密钥、班级名单。未新增业务名词，未新增功能说明。
- C7 自检：文案中不出现管理令牌的值、`shareCode`、`receiptCode` 的具体值或全班名单；404 文案只提示「链接是否完整」，不判断资源是否存在、不回显能力链接。新增的 503 / 429 文案同样不含凭据。
- T9：不做多语言 / RTL / 深色模式 / 文本放大，保持简体中文；T11：前端不消费 `GET /health`。

## 5. 改动面清单

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/api/error-messages.ts` | 新增：`describeError()` 与状态级文案映射 |
| `apps/web/src/api/client.ts` | `ApiRequestError` 增加 `retryAfter`；`request()` 解析 `Retry-After`；3 处下载 / 导出失败文案补恢复动作 |
| `apps/web/src/views/*.vue`（6 个） | 20 处错误展示改走 `describeError`；版本历史空态改写并改用 `role="status"`；班级名单 / 分组空态补引导 |
| `apps/web/src/api/error-messages.spec.ts` | 新增：覆盖全部错误码、Retry-After、透传与兜底的 8 项单元测试 |
| `apps/web/src/views/StudentReceiptView.spec.ts` | 新增 2 项：429 限流文案 + 503 可恢复文案且不泄露回执码 |
| `apps/web/src/views/AssignmentDashboardView.spec.ts` | 空态断言同步新文案，并断言不再被标记为错误 |
| `apps/web/src/views/StudentAssignmentView.spec.ts` | 移除已不再使用的 `ApiRequestError` mock 导出 |
| `docs/frontend-ux-copy.md` | 本文件 |

> `apps/api/**`、`docs/api.md`、`docs/handoff-prompt.md`、设计 spec / plan 零改动；未新增路由、依赖、状态库、UI 库、字体或图片资源。

## 6. 完成标准自检与未决项

| B2 完成标准 | 本轮状态 |
| --- | --- |
| 每个错误码都有可读且可恢复的提示 | 对照表第 1 节逐码覆盖，8 项单元测试 + 2 项组件测试佐证 |
| 空态不出现「暂无数据」式无引导文案 | 第 3 节逐场景核对；版本历史空态改写并修正 `role` |
| 术语与现有中文一致 | 第 4 节；未新增业务名词 |
| 未新增业务事实 | 其余错误码仅补状态级标签与恢复动作，沿用后端 `message` |
| demo 鉴权边界未被文案破坏 | 第 4 节自检；组件测试断言 503 页面不出现回执码 |

**待确认 / 后续项（不属本轮阻塞）**

- **U1（需项目所有者拍板）**：后端 `message` 全部为英文，与 T9「保持简体中文」存在张力。T8 已定案「其余沿用统一 `message`」，本轮据此保留英文原文。若要统一本地化，需后端改文案或前端维护逐条翻译表（涉及业务语义判断），超出 B2 边界，未擅自实施。
- **U2（归 C3）**：下载 / 导出是二进制端点，失败时后端仍返回 JSON 错误信封，但前端目前折叠为客户端统一中文文案，未解析 `code` / `status`，因此这三类差异化文案暂未覆盖下载 / 导出路径。属 C3「下载、导出一致性收口」范围，按既定顺序后续处理。
- **B3 响应式与信息层级**：需要 1440 / 1024 / 768 / 390（及 320）四档**渲染实测**才能给客观结论，测量能力在 D2；本轮未宣称通过。
- **C1 / C3 / D1 / D2 / D3**：按 A→B→C→D 顺序待办；D2 需 H3 交接的最新构建产物 + root 与本机 Edge（T10）；D3 需 D1 / D2 报告与 waivers 后跑完整交付级验证门槛。
