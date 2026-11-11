# C3 改动面清单（下载、导出与鉴权一致性收口）

> 状态：C3 产出；H3 交接用，可直接交给 D2。本轮工作区产物，未提交、未推送。依据 `docs/frontend-skill-prompts.md` §3.3 C3、`docs/api.md` §3.13–3.15 / 4.7 与 C1 用例表整理。调用 `impeccable`（`polish`，受控范围）；未做视觉重设计，未引入新鉴权方式、状态库或依赖。

## 一、本轮改动（C3 增量）

| 文件 | 改动 | 行为说明 |
| --- | --- | --- |
| `apps/web/src/api/client.ts` | 新增 `parseErrorBody()` / `retryAfterFrom()` / `downloadFailure()`；JSON `request()` 错误分支与三个二进制端点（`downloadSubmissionFile`、`download`、`exportFile`）的失败分支统一走信封解析 | 下载/导出失败时保留错误信封 `code` / `message` / `Retry-After`（HTTP 状态始终保留）；信封缺失、不可解析或字段类型异常时退回原 `DOWNLOAD_FAILED` / `EXPORT_FAILED` 兜底中文文案。`parseErrorBody` 只接受字符串类型 `code` / `message`，并同步收紧了 JSON `request()` 的解析（原实现未校验字段类型）。成功路径（Blob、`Content-Disposition` 文件名解码、空 Blob 拒绝）零改动 |
| `apps/web/src/api/client.spec.ts` | 新增 6 条用例 | 下载 429 信封 + `Retry-After`、导出 413、教师附件 503、非 JSON 504/502 兜底、信封字段类型异常兜底 |
| `apps/web/src/views/AssignmentDashboardView.spec.ts` | 新增 1 条用例 | 导出被 429 限流时视图展示 T8 差异化文案「操作太频繁…约 23 秒后重试」 |
| `docs/frontend-data-boundaries.md` | C1-17 与「明确保留的边界」更新 | 下载/导出错误信封解析从「留待 C3」改为「已收口」，证据指向本轮用例 |
| `docs/frontend-version-history-brief.md` | C2 产出（同批工作区） | 不影响下载/导出行为，纯方案文档 |

## 二、行为变化与兼容性

- **变化**：二进制端点失败且服务端返回 JSON 信封时，错误对象携带信封 `code`（如 `RATE_LIMITED` / `FILE_TOO_LARGE` / `SERVICE_UNAVAILABLE`）与 `retryAfter`，`describeError()` 因此能在这些路径上输出 T8 差异化文案（429 带重试秒数、413、503）。
- **兼容**：信封缺失/不可解析 → 与 C1 行为完全一致（兜底 code + 中文文案，`describeError` 原样展示）。
- **需知**：信封中出现 `ENVELOPE_CODES` 内的其它 code（如 `NOT_FOUND`）时，下载/导出文案由固定中文改为「状态标签 + 服务端 message + 恢复动作」结构化文案——这是 T8 既有规则的自然延伸，非新增翻译表。
- 成功下载/导出、文件名解码、空 Blob 判定、并发去重（`exclusive` / `downloading`）均与既有实现一致。

## 三、鉴权与边界确认（C3 完成标准逐项核对）

| 确认项 | 结论 | 证据 |
| --- | --- | --- |
| 管理令牌仅存于会话 | ✅ `sessionStorage`（`hcs.teacher-key`），无 localStorage / cookie | `client.ts` `setAdminToken` / `getAdminToken` |
| 能力链接只在路由参数中使用 | ✅ `shareCode` → `/a/:shareCode`；`receiptCode` → `/receipt/:receiptCode`；仅作为请求路径/查询参数，不落存储 | `router.ts`；`client.ts` 各方法签名 |
| 公开页面不渲染全班名单 | ✅ 学生作业页仅展示作业信息、接龙名单（契约 4.4/4.5 明确公开）与本人相关状态；回执页仅本人提交 | `StudentAssignmentView.vue`、`StudentReceiptView.vue` |
| 不新增依赖 / 鉴权方式 / 路由 | ✅ 零新增；无新状态库 | `package.json` 未动；`router.ts` 未动 |
| `apps/api` 与 `docs/api.md` 零改动 | ✅ | `git diff --stat -- apps/api docs/api.md` 为空 |

## 四、验证结果（C3 全量重跑）

| 命令 | 结果 |
| --- | --- |
| `npm test` | ✅ api 18 文件 / web 8 文件（67 用例）/ contracts 1 文件全部通过 |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅（web 产物 162.71 kB / gzip 56.42 kB） |
| `npm run db:validate` | ✅ Prisma schema 有效 |
| `git diff --check` | ✅ |

## 五、D2 / 后续注意事项

- 本清单连同 `docs/frontend-data-boundaries.md`（21 条用例）构成 D2 的数据边界口径；C1–C3 均未运行 design-taste-frontend gate，D2 渲染验收需另行执行。
- U1（英文 message 保留原文）与 T9 排除项维持不变。
- 工作区含 A / P1-8 / B1–B3 / C1–C3 全部未提交改动；提交与推送仍待项目所有者明确指示（T12）。
