> 使用说明（给项目所有者，复制时不要包含本段）：把下方「===== 接管提示词开始 =====」之后直到文件末尾的全部内容复制，作为新 agent 的第一条消息即可。正文不依赖任何历史对话上下文。

===== 接管提示词开始 =====

# 接管任务：收发作业系统（homework-collect-system）

你是本项目的接手开发 agent。本文档是完整、自洽的交接说明，不依赖任何先前对话。
**硬性要求：在写任何代码、修改任何文件、或推送任何提交之前，必须先完成第 4 节的「接手前检查清单」，向用户报告核对结果并确认现有产出与进度，然后才按第 5 节的优先级推进。未确认前不得动手。**

---

## 1. 项目描述

### 1.1 目标

做一个「班级作业收发」Web 系统：教师维护班级名单与分组、发布作业、查看完成情况、批改反馈、导出；学生通过分享链接提交作业或参与签到/接龙。当前交付的是**单班级、免账号登录的 demo**，用于验证完整业务链路；正式版再扩展多班级与账号体系。

### 1.2 范围

已实现的 demo 功能（均在代码中，非计划稿）：

- 唯一班级初始化、名单导入（学号唯一、重复学号更新姓名）、手动/均分随机分组。
- 作业类型 `online | offline | checkin | relay`，状态 `draft | published | closed`；发布时冻结目标学生集合（全员 / 指定分组 / 指定学生）。
- 线上作业支持文本 + 附件，服务端校验扩展名白名单、MIME、文件内容签名、数量与大小；同一学生可重复提交并保留版本，复用回执码、清除旧反馈。
- 教师看板：应交/已完成/未完成/迟交统计、`@姓名` 未完成名单、分享链接、查看提交文本与附件、批改评分与反馈、导出 CSV / DOCX / ZIP。
- 线下完成登记（可撤销）、签到（幂等、同名需学号消歧）、接龙（稳定序号、禁止重复占位）。
- 学生回执页：本人最新提交内容、附件下载、教师反馈。
- 管理接口用请求头 `X-Demo-Admin-Token`（≥32 位随机值，恒定时间比较）；学生用不可预测的 `shareCode` / `receiptCode` 能力链接；公开接口不暴露全班名单。
- 移动端适配的 Vue 前端；Docker Compose 部署配置（postgres / migrate / api / web + nginx 反代）。

明确不在当前范围：多班级、账号注册/登录、JWT/RBAC、学生实名身份绑定、公网发布、真实敏感学生数据承载。

### 1.3 当前状态（截至 2026-11-09）

- 阶段 0–4（规划、基线、后端、前端、验收）**已完成并推送**；阶段 5「正式版」未开始。
- 默认分支 `main`，本地 `main` 跟踪 `origin/main`，工作区干净，远端 `main` 与本地 HEAD 一致。提交历史共 **6 个**：前四个为阶段交付，第五个加入本文，第六个为按本文 P0/P1 优先级完成的首轮改进（部署配置、共享 E2E DDL、回执页测试、计划回填与安全边界标注）。
  `000be38` 规划 → `97ffde0` 工作区与领域规则 → `d9ef8ee` 完整实现 → `ddde3a2` 接口文档 → `896430d` 接管提示词 → 第 6 个提交为 P0/P1 改进。
  请务必以 `git log --oneline -8` 与 `git ls-remote --heads origin` 的**实际输出**为准，不要假定 SHA 不变。
- 技术栈：Node.js 22 + npm workspaces；`apps/api` = NestJS 12 + Prisma 7 + PostgreSQL 16；`apps/web` = Vue 3 + TypeScript + Vite 6 + Vue Router；`packages/contracts` = 共享领域纯函数；Vitest 5 + @vue/test-utils + PGlite（提供 PostgreSQL 协议端点做 E2E）；文件存储支持本地私有目录或 S3 兼容对象存储。
- 验证结果（P0/P1 改进提交前全量重跑）：`npm test` **39 项**全部通过（API 28 / Web 8 / contracts 3，含 2 组 E2E）；`npm run typecheck`、`npm run build`、`npm run db:validate`、`npm ci --dry-run` 全部通过；编译产物 `apps/api/dist` 可正常加载；`npm audit --omit=dev` 为 0 漏洞（该命令偶发因审计端点网络卡顿，重试即可）。
- 已知限制：本机没有 Docker 与独立 PostgreSQL 服务，**镜像构建与真实数据库部署未验证**，E2E 用 PGlite 覆盖完整链路；全量 `npm audit` 仍有 4 个中危，全部来自 dev 依赖链 `@vue/test-utils@2.4.11 → js-beautify → glob/minimatch`，`npm audit fix` 与升级 test-utils 均无法在不破坏工具链的前提下消除，生产依赖不受影响；本轮评估结论为「仅开发依赖、生产 0 漏洞、接受风险」，证据见第 5 节 P0-2，待用户最终确认。
- 安全边界：demo 用能力链接替代身份核验，链接泄露即可冒用，禁止用于真实敏感数据。

---

## 2. 仓库地址与关键位置

- 仓库：`https://github.com/chufu152/homework-collect-system.git`（owner `chufu152`，默认分支 `main`）
- 本地工作目录：`C:\Users\Administrator\WorkBuddy AI\HCS`（若在其他机器接手，以实际 clone 路径为准）
- 环境与配置：`.env.example`（复制为 `.env` 后填写 `DATABASE_URL`、`POSTGRES_PASSWORD`、`DEMO_ADMIN_TOKEN` 等）、`docker-compose.yml`、`apps/api/Dockerfile`、`apps/web/Dockerfile`、`apps/web/nginx.conf`、`.dockerignore`、`.gitignore`

### 2.1 必读文档

| 路径 | 内容 |
|---|---|
| `docs/api.md` | **接口契约**：全部 22 个接口的请求方式、路径、参数、返回结构、鉴权标注、错误码；另含本地/Docker 启动步骤、环境变量表、验证命令、安全边界与已知限制 |
| `docs/superpowers/specs/2026-11-08-homework-collect-demo-design.md` | 意图、范围、技术约束、核心数据与状态、验收标准；以及技术栈选型与理由、角色与权限设计、开发阶段与交付物、E2E 覆盖范围 |
| `docs/superpowers/plans/2026-11-08-homework-collect-demo.md` | Task 1–4 的逐步实施计划与 Review Focus；Task 复选框已于 2026-11-09 全部回填，并附「验收证据」段落（含未验证项说明） |
| `docs/handoff-prompt.md` | 本接管提示词（供交接使用，不是需求文档）。**已纳入仓库并推送到 `main`**，clone 后可直接读取 |

### 2.2 已完成部分的代码位置

- 根 `package.json`：workspaces 与 `test` / `build` / `typecheck` / `db:generate` / `db:validate` / `db:push` / `dev:api` / `dev:web` 脚本。
- `apps/api/prisma/schema.prisma`：全部数据模型（班级、学生、分组/成员、作业/冻结目标、提交/版本/文件、反馈、完成记录、签到、接龙）。
- `apps/api/src/main.ts`、`app.module.ts`：全局前缀 `/api/v1`、CORS、ValidationPipe、统一异常信封。
- `apps/api/src/common/`：`admin.guard.ts`、响应拦截器、异常过滤器、requestId 中间件。
- `apps/api/src/classes/`、`assignments/`：22 个接口对应的 controller / DTO / service 与纯业务规则（`assignment-policy.ts`、`workflows.ts`）。
- `apps/api/src/storage/`、`exports/`：本地/S3 存储适配器、上传校验、ZIP/DOCX/CSV 导出。
- `apps/api/prisma.config.ts`、`src/prisma/prisma.service.ts`：Prisma 7 PostgreSQL adapter 配置。
- `apps/api/src/generated/prisma/`：**生成产物，已被 .gitignore 忽略**；新环境必须先跑 `npm run db:generate`，否则编译与运行会失败。
- `apps/api/test/core.e2e.spec.ts`、`participation.e2e.spec.ts`：用 PGlite 启动真实 Nest HTTP 服务的全链路 E2E；两者共同执行 `apps/api/test/schema.sql`。
- `apps/api/test/schema.sql`：两组 E2E 共享的建表 DDL（枚举、表、唯一约束）。**修改 `schema.prisma` 时必须同步此文件**，否则迁移与测试会漂移。
- `apps/web/src/router.ts`、`api/client.ts`、`views/*.vue`、`styles.css`：教师/学生全部页面与 API 客户端；`views/*.spec.ts` 为组件测试。
- `packages/contracts/src/domain.ts`：作业类型/状态、目标名单、缺交名单等共享纯函数及其单测。

### 2.3 环境与工具

- Node.js 22、npm、Git Bash；Windows 环境，PowerShell 5.1 执行策略为 Restricted。
- 本机**没有** Docker、没有独立 PostgreSQL 服务/CLI；数据库相关 E2E 由 `@electric-sql/pglite` + `pglite-socket` 提供协议端点，无需外部数据库。
- 不提交 `.env`、`var/`、`uploads/`、`dist/`、`node_modules/`、`apps/api/src/generated/`（均在 `.gitignore`）。

---

## 3. 推仓库规则（必须遵守）

1. **远程固定 HTTPS**：`https://github.com/chufu152/homework-collect-system.git`，默认分支 `main`。不要修改 remote URL、不要把 origin 改成 SSH、不要自行生成或注册新的 SSH key。
2. **凭据**：走 Windows 凭据管理器（`credential.helper=manager`）。不要用 `credential.helper=helper-selector`（在 agent 环境会卡死，表现为 `could not read Username ... terminal prompts disabled`）。不要关闭 npm 的完整性校验来绕过 `EINTEGRITY`。
3. **推送前门槛**（上一次交付中用户明确要求的约束，除非用户给出新指令否则默认继续遵守）：先完成并检查尚未完成的主要功能，确认实现完整、且下列验证全部通过后，才把所有变更推送到 `main`；在此之前不要推送。
   验证命令：`npm test`、`npm run typecheck`、`npm run build`、`npm run db:validate`、`npm ci --dry-run`、`npm audit --omit=dev`。
4. **提交规范**：提交信息用英文 conventional style（如 `feat:` / `fix:` / `docs:` / `test:`）；工作区保持干净；禁止 `--force`、禁止 `--no-verify`、禁止跳过 hooks；推送后用 `git ls-remote --heads origin` 核对远端 SHA 与本地 `git rev-parse HEAD` 一致。
5. **接口/数据模型变更**：必须同步更新 `docs/api.md` 与 spec 文档，并补充对应测试；E2E 中手写建表 SQL 也要同步。
6. **网络已知问题**：本机代理 `http://127.0.0.1:12272` 对 `github.com` 的 CONNECT 可能返回 502，导致 HTTPS `git push` 失败（`schannel: server closed abruptly` 或 `CONNECT tunnel failed, response 502`）；直连 443 也超时。HTTPS 的 fetch / ls-remote 通常正常。此时使用**已配置好的 SSH over 443 备用通道**推送，`~/.ssh/config` 已把 `github.com` 指向 `ssh.github.com:443` 并指定已注册的 `id_ed25519`：

   ```bash
   GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=20' \
     git push git@github.com:chufu152/homework-collect-system.git HEAD:refs/heads/main
   ```

   该命令**不修改 remote URL**，只是一次性推送目标；推送成功后再用 HTTPS 核对远端 SHA。

---

## 4. 接手前检查清单（必须先做，并在回复中逐项报告）

在继续开发之前，按顺序完成并向用户报告结果：

1. **同步与确认版本**：`git fetch origin main` → `git status --short --branch` → `git log --oneline -8` → `git ls-remote --heads origin`，确认本地与远端 `main` 一致、工作区干净；若不一致，先说明差异，不要直接覆盖。
2. **阅读已完成部分及其位置**：按 2.1 表格顺序读完前三份需求/契约文档，再按 2.2 抽查关键实现（`schema.prisma`、两个 controller、`assignments.service.ts`、`api/client.ts`、两个 E2E 文件）。重点确认：22 个接口的路径与鉴权、冻结目标名单规则、提交版本与反馈清除逻辑、上传/下载的越权防护、导出文件名安全化。
3. **复现现状验证**：在新环境先 `npm ci` → `npm run db:generate`，再跑 `npm test`、`npm run typecheck`、`npm run build`、`npm run db:validate`、`npm audit --omit=dev`。记录实际结果；若与 1.3 的状态描述不符，先报告差异与原因，不要假定文档有误或代码有误。
4. **确认现有产出与进度**：向用户输出一张简短核对表——「已完成的阶段与交付物 / 未验证项 / 已知限制 / 你接下来打算从哪一条后续计划开始」，并明确询问是否按该优先级推进。**得到用户确认后才开始写代码。**
5. **动手前的边界确认**：若用户的新需求会改变 demo 边界（引入账号体系、多班级、公网部署、真实学生数据），先出方案并确认，再实施；不要静默扩展范围。

---

## 5. 后续计划（未完成事项及优先级）

### P0 — 影响真实可用性与交付可信度，优先处理

1. **真实环境部署验证**：在具备 Docker 与 PostgreSQL 的机器上执行 `cp .env.example .env`（填强密码与 ≥32 位 `DEMO_ADMIN_TOKEN`）→ `docker compose up --build`，验证 `migrate`（当前用 `prisma db push`）→ `api` → `web` 全链路、nginx 反代 `/api`、上传目录写入权限、`PUBLIC_WEB_URL` 生成的分享链接可用、容器重启后数据卷持久化。当前环境无 Docker/psql，镜像构建与真实数据库部署**仍未验证**（本轮已复核 Docker/psql 均缺失）。**已完成的静态修复**：nginx `client_max_body_size` 由 25m 提到 210m，与后端 `files: 10` × `MAX_UPLOAD_BYTES`（20 MiB）对齐；Compose 为 API 增加 healthcheck，并让 `web` 等待 `service_healthy`，消除启动竞态导致的首次 502。
2. **处置 dev 依赖 4 个中危告警**：来源 `@vue/test-utils@2.4.11 → js-beautify → glob/minimatch`。已确认 `npm audit fix` 无效、升级 test-utils 到 2.5.1 反而变成 5 个告警。可选路径：评估 npm `overrides` 强制 `minimatch`/`glob` 到安全版本（需回归组件测试）、替换测试工具、或明确记录为「仅开发依赖、生产 0 漏洞、接受风险」并由用户确认。**本轮评估结论：采用接受风险，代码未改动**。证据：`npm audit fix` 执行后告警数不变且无文件改动；`overrides` 强制 `minimatch≥11.0.1` / `glob≥14.0.2` 时 npm 10.9.7 + workspaces 的 lockfile 无法落地（`npm ls` 报 invalid、`npm audit` 返回 400 Invalid package tree），且这两个新版为 ESM-only，会破坏 CJS 的 `editorconfig`/`js-beautify` 链。若用户要求清零，唯一稳妥路径是替换测试工具链或等待上游提供 CJS 兼容修复。

### P1 — demo 健壮性与工程化债

3. **版本化数据库迁移**：当前只有 `prisma db push`，`prisma/migrations` 为空。正式交付前应改用 `prisma migrate dev` 生成迁移，并把 Compose 的 `migrate` 服务改为 `prisma migrate deploy`。
4. ~~**消除 E2E 建表 SQL 漂移**~~ **已完成**：两个 E2E 现共同执行 `apps/api/test/schema.sql`（含枚举与约束），改 `schema.prisma` 时只需同步该文件。**剩余风险**：它仍是手写 DDL，未由 migration 自动生成，需与第 3 条一并解决。
5. **公开接口防护（文档标注已完成，代码仍待补齐）**：`docs/api.md` 第 5 节与 spec 技术约束已显式列出「无速率限制/防爆破、能力链接无过期与撤销、管理令牌无轮换与审计日志」。代码层面仍未实现，若要试点承载真实数据必须补齐。
6. **大文件与导出性能**：ZIP 导出会把全部附件读入内存（默认上限 `MAX_EXPORT_BYTES=209715200`），大班集需改为流式/后台任务；下载同样为全量读入。
7. **补齐文档与测试的一致性（部分完成）**：实施计划 Task 1–4 复选框已全部回填并附「验收证据」段落；新增 `StudentReceiptView.spec.ts`（3 项：最新提交/反馈/附件下载、无反馈占位、失败重试），前端现 5 个 spec / 8 项。**仍缺**：导出按钮、签到/接龙交互的组件测试。
8. **提交版本历史可视化**：后端保留 `SubmissionVersion` 与历史附件，但看板、回执与 ZIP 都只暴露最新版本；若用户需要「查看历次修改」，需新增受控接口与 UI。

### P2 — 正式版（阶段 5，需先出方案再动手）

9. 多班级与账号体系：账号登录、JWT + RBAC、学生与账号绑定、按班级数据隔离、权限审计。
10. 生产基础设施：私有 S3 桶 + 短时签名 URL、HTTPS 反向代理、数据库备份与恢复演练、监控告警、病毒扫描。
11. 运维与安全加固：能力链接过期/撤销、上传内容审计、日志与 `requestId` 链路追踪、负载与并发测试（接龙序号、重复提交、导出并发）。

**优先级使用规则**：用户说「继续完善 demo」→ 按 P0 → P1 推进；用户说「做正式版 / 上线」→ 先提交 P2 的架构方案与迁移路径并等待确认，不要直接改代码。

---

## 6. 工作方式与约束

- 遵循仓库现有结构与约定，不另起架构：npm workspaces、Node ESM 相对导入必须带 `.js` 扩展名、NestJS 控制器/服务/DTO 分层、Vue 组合式 API、统一响应信封 `{ code, message, data, requestId }`。
- 业务规则改动先补测试再改实现（TDD）；接口或数据模型变更必须同步 `docs/api.md`、spec 文档与 E2E 建表 SQL。
- 保持 demo 边界：单班级、免登录、能力链接鉴权；不引入真实敏感学生数据，不在公开接口返回全班名单。
- 每次交付前跑第 3 节的验证命令；推送前必须全部通过且工作区干净。
- 使用简体中文向用户汇报；重要结论（验证结果、未完成项、风险）要在最终回复中直接写清楚，不依赖折叠的工具输出。

---

## 7. 常用命令速查

```bash
npm ci                       # 干净安装（新环境第一步）
npm run db:generate          # 生成 Prisma Client 到 apps/api/src/generated/prisma（已 gitignore）
npm run db:validate          # 校验 schema
npm test                     # 全量单元 + 组件 + E2E
npm run typecheck            # contracts + api + web 类型检查
npm run build                # 三个 workspace 生产构建
npm audit --omit=dev         # 生产依赖安全审计
npm run dev:api              # http://127.0.0.1:3000/api/v1（需外部 PostgreSQL 与 .env）
npm run dev:web              # http://127.0.0.1:5173（已配置 /api 代理）
docker compose up --build    # 完整栈，访问 http://localhost:8080（需 Docker）
git ls-remote --heads origin # 核对远端 main 状态
```

===== 全文结束（以上为完整接管提示词，可整段复制）=====
