# 收发作业系统 demo 实施计划

> **For agentic workers:** Follow this plan task by task. Use TDD for business behavior and verify each task before moving on.

**Goal:** 在当前空项目中创建可运行的单班级收发作业 Web demo。

**Architecture:** Vue 3/TypeScript/Vite 前端调用 NestJS REST API；NestJS 通过 Prisma 访问 PostgreSQL，文件开发态存本地私有目录、生产态可配置 S3 兼容存储。业务核心放在可单测的服务/纯函数中，管理端以一次性令牌保护，学生使用作业分享码。

**Tech Stack:** Node.js、npm workspaces、Vue 3、TypeScript、NestJS、Prisma、PostgreSQL、Vitest/Jest、对象存储适配器。

**Spec:** `docs/superpowers/specs/2026-11-08-homework-collect-demo-design.md`

## Global Constraints

- demo 固定单班级，不提供账号注册、密码或登录页。
- 管理接口使用一次性 `X-Demo-Admin-Token`；学生公开接口通过 `shareCode`；本人提交回执通过 `receiptCode`。
- 作业类型仅为 `online | offline | checkin | relay`；状态为 `draft | published | closed`。
- 发布时冻结目标学生集合；缺交统计基于该集合。
- 使用 PostgreSQL + Prisma；不以 localStorage 或内存数组替代持久化。
- 上传在服务端限制类型和大小，文件名经安全化；本轮不推送共享分支、不部署。

## Review Focus

- 无效/缺失管理令牌及错误分享码不得读写他人数据。
- 学号重复、空名单、目标名单重复成员必须有明确校验结果。
- 已关闭作业、未纳入目标名单的学生、重复提交和迟交必须得到确定状态。
- 文件路径穿越、伪造 MIME、超限文件和重复原始文件名不得覆盖或越权访问文件。
- 姓名不唯一、重复签到/接龙、跨时区截止时间必须有稳定处理。

---

### Task 1: 建立仓库基线、共享领域模型与工程骨架

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`
- Create: `packages/contracts/src/domain.ts`, `packages/contracts/src/domain.spec.ts`, `packages/contracts/package.json`, `packages/contracts/tsconfig.json`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/web/package.json`, `apps/web/tsconfig.json`

**Interfaces:**
- Produces shared enums and pure functions for assignment type/state, target deduplication, and missing-name formatting.
- Produces npm workspaces `apps/*` and `packages/*` with `npm test`, `npm run build`, and `npm run typecheck` scripts.

- [x] Write domain tests first for accepted assignment type/state, deduplicated target selection, and ordered `@姓名` output.
- [x] Run `npm test --workspace @homework/contracts`; confirm expected missing-module/test failures.
- [x] Implement the minimum contracts and workspace configuration.
- [x] Run contracts tests and workspace typecheck; expect all pass.
- [x] Commit the repository baseline on `feature/homework-collect-demo`.

### Task 2: Implement persistent REST API and assignment workflows

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/demo/**`, `apps/api/src/classes/**`, `apps/api/src/assignments/**`, `apps/api/src/submissions/**`, `apps/api/src/checkins/**`, `apps/api/src/relay/**`, `apps/api/src/exports/**`
- Create: API unit and controller tests under each module's `*.spec.ts`
- Create: `apps/api/src/storage/storage.service.ts` and local/S3-compatible adapter configuration

**Interfaces:**
- Consumes Task 1 contracts.
- Produces `POST /api/v1/demo/bootstrap`, class/roster/group, assignment publish/list/state, public assignment detail, online submission, dashboard, feedback, receipt, completion, check-in, relay, and export routes as specified in the spec.
- Prisma models represent class, student, groups/membership, assignment/targets, submission/versions/files, feedback, completion, and relay entries.

- [x] Write failing service tests for frozen audience, submission authorization/deadline, dashboard counts, ambiguous name, completion toggling, relay duplicate prevention, and safe file naming.
- [x] Run the targeted API tests and verify they fail because behavior is absent.
- [x] Implement Prisma schema, service methods, DTO validation, controllers, management-token guard, and storage/export services.
- [x] Run API unit tests, Prisma schema validation, and API typecheck; expect all pass.
- [x] Commit API implementation.

### Task 3: Implement teacher and student web flows

**Files:**
- Create: `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/router.ts`, `apps/web/src/api/client.ts`
- Create: `apps/web/src/views/ClassSetupView.vue`, `TeacherHomeView.vue`, `AssignmentCreateView.vue`, `AssignmentDashboardView.vue`, `StudentAssignmentView.vue`, `StudentReceiptView.vue`
- Create: shared components/styles and Vue component tests under `apps/web/src/**/*.spec.ts`

**Interfaces:**
- Consumes the Task 1 contracts and Task 2 REST paths/response envelopes.
- Produces mobile-friendly class setup, teacher dashboard/publish/feedback/export, student assignment submission/check-in/relay, and receipt-feedback flows without a login page.

- [x] Write component tests first for empty class setup, assignment type selection, public online submit form, check-in identity validation display, and missing-name copy output.
- [x] Run targeted component tests and verify failure on absent components/behavior.
- [x] Implement responsive views, API client, loading/error/empty states, and form validation.
- [x] Run frontend tests, typecheck, and production build; expect all pass.
- [x] Commit web implementation.

### Task 4: Validate deployment configuration and end-to-end critical paths

**Files:**
- Modify: root scripts and Docker Compose/environment examples as needed
- Create: `apps/api/test/**` integration tests and `apps/web` critical-path tests where feasible

**Interfaces:**
- Consumes Tasks 1–3; no API contract changes without a matching test and spec update.

- [x] Run full unit/component suites and both production builds.
- [x] Validate Prisma schema and generated client.
- [x] When PostgreSQL is available, run bootstrap → import roster → publish → student submit → dashboard/feedback/export end-to-end; otherwise report the environment blocker and keep PostgreSQL-backed configuration intact.
- [x] Review file access, public roster exposure, management-token handling, and mobile layout; fix any critical/important defects with regression tests.
- [x] Commit final verification fixes and report commands/results plus unverified environment-dependent checks.

---

## 验收证据（2026-11-09 首次回填；最新结果见文末「后端补齐轮次验收证据」）

下方数字为首次回填时的快照（41 项测试、2 组 E2E）；经过后端补齐轮次后，当前为 **67 项测试、3 组 E2E**（API 54 / Web 10 / contracts 3）。
上方 Task 1–4 的复选框在交付时未回填，实际均已实现并通过验证，故统一标记为完成。证据如下：

- `npm test`：**41 项全部通过**（API 28 / Web 10 / contracts 3），其中两组 PostgreSQL 协议 E2E 覆盖
  初始化→名单→发布→提交→看板→批改→回执→导出→重复提交→关闭后拒绝，以及线下登记、签到、接龙、定向目标与鉴权隔离。
- `npm run typecheck`、`npm run build`、`npm run db:validate`、`npm ci --dry-run` 全部通过；
  `npm audit --omit=dev` 为 0 漏洞。
- 两组 E2E 现直接执行 `prisma/migrations/*/migration.sql`（经 `apps/api/test/migrations.ts` 按序加载），与 `db:deploy` 共用同一份 DDL；手写 `schema.sql` 已删除。
- 组件测试现有 5 个 spec / 10 项：班级设置、作业创建、教师看板（含导出按钮与附件下载）、学生提交（含签到、接龙、版本化重交）、提交回执。
- **仍未验证**：本机无 Docker / 独立 PostgreSQL，Task 4 中「真实数据库端到端」与镜像构建未执行；
  由 PGlite 协议端点覆盖业务链路，部署配置见 `docker-compose.yml` 与 `docs/api.md` 第 2 节。
- 全量 `npm audit` 仍有 4 个 dev 依赖链中危告警（`js-beautify → glob/minimatch`），
  已评估并记为「仅开发依赖、生产 0 漏洞、接受风险」，详见 `docs/handoff-prompt.md` 第 5 节 P0-2。
- 版本化迁移已于 2026-11-09 补齐（`prisma/migrations` + `db:deploy` + E2E 单一事实来源）；后续改进（真实部署验证、限流、流式导出、版本历史 UI、正式版）按 `docs/handoff-prompt.md` 第 5 节的优先级推进。

### 后端补齐轮次验收证据（2026-11-09，本轮不动前端）

- 完成 P1 中的后端部分：基础限流 + 结构化审计日志、提交版本历史接口与回执 `versions`、单文件附件流式下载、
  `GET /health` 就绪检查、优雅关闭；同步修复 multipart 提交 DTO 校验、上传超限 413 信封、
  `text` 模式误收附件、管理令牌强度不一致（`/files` 路由不再接受示例/短令牌）、ZIP 同名附件去重、分页上限。
- 修复统一响应信封的最后一处例外：`GET /classes/current` 未初始化时不再返回空响应体，而是 `{ code:'OK', data:null }`；
  新增 `response.interceptor.spec.ts`（4 项）与 `core.e2e.spec.ts` 的回归断言。`@Res()` 二进制下载保持信封外直通。
- 新增 `test/backend-completion.e2e.spec.ts` 覆盖健康检查、字段校验、413、版本历史、历史附件流式下载、
  同名附件 ZIP 导出与凭据隔离；新增后端 spec 覆盖限流器、审计、令牌、DTO、ZIP、存储流、健康检查与响应信封。
- 额外做了编译产物运行时验收：以 PGlite 提供 PostgreSQL 协议端点，直接启动 `apps/api/dist/main.js`，
  验证 health 200 / 无令牌 401 / 空班级 `data:null` / 初始化 201 / 作业列表 200 / 名单导入 200 / 发布作业 201；
  脚本在 `apps/api/var/`（已忽略），非仓库交付物。
- 接口由 22 个增至 24 个（新增 `GET /health`、`GET /submissions/{id}/versions`）；`docs/api.md`、本文件、
  spec 与 `.env.example`、`docker-compose.yml` 已同步；**未改动 `apps/web` 下任何文件**。
- 仍待确认/遗留：真实 Docker + PostgreSQL 上的 `migrate deploy` 与 shadow diff；ZIP 导出仍为内存组装；
  能力链接过期/撤销、管理令牌轮换、失败账号锁定、多实例共享限流与集中日志（正式版范围）。
