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

- [ ] Write domain tests first for accepted assignment type/state, deduplicated target selection, and ordered `@姓名` output.
- [ ] Run `npm test --workspace @homework/contracts`; confirm expected missing-module/test failures.
- [ ] Implement the minimum contracts and workspace configuration.
- [ ] Run contracts tests and workspace typecheck; expect all pass.
- [ ] Commit the repository baseline on `feature/homework-collect-demo`.

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

- [ ] Write failing service tests for frozen audience, submission authorization/deadline, dashboard counts, ambiguous name, completion toggling, relay duplicate prevention, and safe file naming.
- [ ] Run the targeted API tests and verify they fail because behavior is absent.
- [ ] Implement Prisma schema, service methods, DTO validation, controllers, management-token guard, and storage/export services.
- [ ] Run API unit tests, Prisma schema validation, and API typecheck; expect all pass.
- [ ] Commit API implementation.

### Task 3: Implement teacher and student web flows

**Files:**
- Create: `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/router.ts`, `apps/web/src/api/client.ts`
- Create: `apps/web/src/views/ClassSetupView.vue`, `TeacherHomeView.vue`, `AssignmentCreateView.vue`, `AssignmentDashboardView.vue`, `StudentAssignmentView.vue`, `StudentReceiptView.vue`
- Create: shared components/styles and Vue component tests under `apps/web/src/**/*.spec.ts`

**Interfaces:**
- Consumes the Task 1 contracts and Task 2 REST paths/response envelopes.
- Produces mobile-friendly class setup, teacher dashboard/publish/feedback/export, student assignment submission/check-in/relay, and receipt-feedback flows without a login page.

- [ ] Write component tests first for empty class setup, assignment type selection, public online submit form, check-in identity validation display, and missing-name copy output.
- [ ] Run targeted component tests and verify failure on absent components/behavior.
- [ ] Implement responsive views, API client, loading/error/empty states, and form validation.
- [ ] Run frontend tests, typecheck, and production build; expect all pass.
- [ ] Commit web implementation.

### Task 4: Validate deployment configuration and end-to-end critical paths

**Files:**
- Modify: root scripts and Docker Compose/environment examples as needed
- Create: `apps/api/test/**` integration tests and `apps/web` critical-path tests where feasible

**Interfaces:**
- Consumes Tasks 1–3; no API contract changes without a matching test and spec update.

- [ ] Run full unit/component suites and both production builds.
- [ ] Validate Prisma schema and generated client.
- [ ] When PostgreSQL is available, run bootstrap → import roster → publish → student submit → dashboard/feedback/export end-to-end; otherwise report the environment blocker and keep PostgreSQL-backed configuration intact.
- [ ] Review file access, public roster exposure, management-token handling, and mobile layout; fix any critical/important defects with regression tests.
- [ ] Commit final verification fixes and report commands/results plus unverified environment-dependent checks.
