# 收发作业系统 demo — API 接口文档（v1）

本文档与 `apps/api/src` 中的实现一一对应，覆盖全部 22 个接口。设计说明见
[设计规格](superpowers/specs/2026-11-08-homework-collect-demo-design.md)，实施阶段见
[实施计划](superpowers/plans/2026-11-08-homework-collect-demo.md)。

## 1. 通用约定

- **前缀**：所有接口以 `/api/v1` 开头。
- **响应信封**：JSON 接口成功时返回

  ```json
  { "code": "OK", "message": "ok", "data": { }, "requestId": "..." }
  ```

  前端只消费 `data`。`GET /classes/current` 在尚未初始化班级时返回 `null`（空响应体），这是唯一的信封例外。
  文件下载接口直接返回二进制流，不使用信封，通过 `Content-Disposition: attachment; filename*=UTF-8''...` 给出文件名。
- **错误信封**：

  ```json
  { "code": "NOT_FOUND", "message": "Assignment not found.", "details": [], "requestId": "..." }
  ```

  | HTTP | code | 常见原因 |
  | --- | --- | --- |
  | 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | 业务规则不满足、参数不合法（校验失败时 `details` 列出原因） |
  | 401 | `UNAUTHORIZED` | 管理令牌缺失或错误 |
  | 403 | `FORBIDDEN` | 权限不足 |
  | 404 | `NOT_FOUND` | 分享码/回执码/资源不存在，或作业已关闭 |
  | 409 | `CONFLICT` | 班级重复初始化、重复接龙、作业状态冲突、分组重名 |
  | 413 | `FILE_TOO_LARGE` | 上传或导出超过上限 |
  | 422 | `VALIDATION_ERROR` | DTO 校验失败 |
  | 503 | `SERVICE_UNAVAILABLE` | 服务端未配置 `DEMO_ADMIN_TOKEN` |
  | 500 | `INTERNAL_ERROR` | 未预期错误 |

- **鉴权方式**（每个接口在下文单独标注）：
  - `管理令牌`：请求头 `X-Demo-Admin-Token: <DEMO_ADMIN_TOKEN>`。服务端要求该环境变量长度 ≥ 32 且不是示例值，否则所有管理接口返回 503。比较使用恒定时间算法。
  - `分享码`：路径参数 `shareCode`（24 字节随机数，base64url）。只暴露单条作业信息，不返回全班名单。
  - `回执码`：路径/查询参数 `receiptCode`（24 字节随机数）。只能读取本人提交与反馈。
  - `无`：无需任何凭据。
  - 公开接口若使用无效分享码/回执码，一律返回 404，不泄露资源是否存在。

- **作业类型**：`online`（线上提交）、`offline`（教师线下登记）、`checkin`（签到）、`relay`（接龙）。
- **作业状态**：`draft` → `published` → `closed`；关闭不可重开。仅 `published` 的公开接口可用。
- **目标名单**：发布时冻结 `AssignmentTarget`，缺交统计、提交/签到/接龙身份校验均以该集合为准。
- **时间**：所有时间为 ISO 8601 UTC 字符串（如 `2026-11-20T12:00:00.000Z`）。

## 2. 快速开始

本地开发（Node.js 22、PostgreSQL 14+）：

```bash
npm install
cp .env.example .env          # 填写 POSTGRES_PASSWORD、DATABASE_URL、DEMO_ADMIN_TOKEN（≥32 位随机值）
npm run db:generate           # 生成 Prisma Client 到 apps/api/src/generated/prisma
npm run db:deploy             # 应用 prisma/migrations 下的版本化迁移（推荐）
npm run dev:api               # http://127.0.0.1:3000/api/v1
npm run dev:web               # http://127.0.0.1:5173（已配置 /api 代理）
```

浏览器打开 `http://127.0.0.1:5173/class/setup`，先填入与 `.env` 一致的 `DEMO_ADMIN_TOKEN` 并保存到会话，再建立班级、导入名单。
`db:push` 仍保留，仅供本地快速试改 schema；已部署的环境一律用 `db:deploy` 应用版本化迁移。

Docker 部署（前端 nginx 反代 `/api` 到 API 服务）：

```bash
cp .env.example .env          # 填写强密码与强管理令牌
docker compose up --build     # 访问 http://localhost:8080
```

Compose 会依次启动 PostgreSQL、`migrate`（`prisma migrate deploy`）、API、Web；API 带健康检查，Web 在 API 健康后才启动，避免启动竞态导致首次访问 502。上传文件保存在 `homework-uploads` 卷。nginx 的 `client_max_body_size` 设为 `210m`，与后端 `files: 10` × `MAX_UPLOAD_BYTES`（默认 20 MiB）对齐，避免合法的多个大附件被反向代理以 413 拒绝；若调大 `MAX_UPLOAD_BYTES`，需同步调整 `apps/web/nginx.conf`。
数据库结构由 `apps/api/prisma/migrations/` 下的版本化 SQL 管理：在 `apps/api` 目录执行
`npx prisma migrate dev --name <change>` 生成新迁移并提交 `migration.sql`，部署时由 `db:deploy` 按序应用。
两组 E2E 通过 `apps/api/test/migrations.ts` 按目录顺序执行同一批迁移 SQL，测试库结构与部署结果一致，无需再维护手工建表脚本。

生产环境应把 `STORAGE_DRIVER=s3` 并配置私有 S3 兼容桶（`S3_ENDPOINT`、`S3_BUCKET`、`S3_REGION`、
`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`），对外通过 HTTPS 反向代理，数据库与对象存储均需持久化与备份。

关键环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL 连接串，必填 |
| `DEMO_ADMIN_TOKEN` | — | 教师管理令牌，必填且 ≥ 32 位 |
| `DB_POOL_MAX` | `10` | Prisma/pg 连接池上限 |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `3000` | API 监听地址 |
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | CORS 允许来源，多个用逗号分隔 |
| `PUBLIC_WEB_URL` | `http://127.0.0.1:5173` | 生成学生分享链接的站点根地址 |
| `STORAGE_DRIVER` | `local` | `local` 或 `s3` |
| `UPLOAD_DIR` | `var/uploads` | 本地私有上传目录 |
| `MAX_UPLOAD_BYTES` | `20971520` | multer 单文件上限 |
| `MAX_EXPORT_BYTES` | `209715200` | ZIP 导出总大小安全上限 |

验证命令：`npm test`（单元 + 组件 + PostgreSQL 协议 E2E）、`npm run typecheck`、`npm run build`、`npm run db:validate`、
`npm audit`、`npm ci --dry-run`。端到端测试使用 PGlite 提供的 PostgreSQL 协议端点，无需独立数据库服务；
建表来源是 `prisma/migrations`，与 `db:deploy` 应用的是同一批 SQL。

## 3. 管理端接口

### 3.1 `POST /demo/bootstrap` — 初始化唯一班级

- **鉴权**：管理令牌
- **请求体**：`{ "className": string (1–80) }`
- **响应 201**：`{ id, name, createdAt, _count: { students: 0 } }`
- **错误**：`409` 已存在班级（demo 只允许一个班级）；`400` 名称为空/超长。

### 3.2 `GET /classes/current` — 查询当前班级

- **鉴权**：管理令牌
- **响应 200**：`{ classId, name, studentCount }`；未初始化时返回 `null`。
- **错误**：`401` 令牌无效。E2E 以此接口验证无令牌访问被拒。

### 3.3 `GET /classes/{classId}/students` — 分页查询名单

- **鉴权**：管理令牌
- **查询参数**：`keyword`（学号/姓名模糊匹配，可选）、`groupId`（按小组筛选，可选）、`page`（默认 1）、`pageSize`（默认 50，最大 100）
- **响应 200**：

  ```json
  { "items": [ { "id": "...", "classId": "...", "studentNo": "2026001", "name": "张三", "createdAt": "...", "groups": [ { "id": "...", "name": "第 1 组" } ] } ],
    "total": 3, "page": 1, "pageSize": 50 }
  ```

- **错误**：`404` 班级不存在。

### 3.4 `PUT /classes/{classId}/students` — 导入/更新名单

- **鉴权**：管理令牌
- **请求体**：`{ "students": [ { "studentNo": string (1–40), "name": string (1–80) } ] }`，至少 1 行
- **响应 200**：`{ created: number, updated: number, rejected: [ { row: number, reason: string } ] }`
- **规则**：`(classId, studentNo)` 唯一；重复学号更新姓名，不新增记录；同一批次内学号重复、学号或姓名为空的行会被拒绝并给出行号；全部非法时返回 `400`。
- **错误**：`404` 班级不存在；`400` 无有效行；`422` DTO 校验失败。

### 3.5 `GET /classes/{classId}/groups` — 查询分组

- **鉴权**：管理令牌
- **响应 200**：`[ { id, classId, name, strategy: "manual"|"balanced_random", createdAt, memberCount } ]`
- **错误**：`404` 班级不存在。

### 3.6 `POST /classes/{classId}/groups` — 创建分组

- **鉴权**：管理令牌
- **请求体**：

  | 字段 | 类型 | 说明 |
  | --- | --- | --- |
  | `name` | string (1–40) | 必填，班级内唯一；均分随机时自动追加序号 |
  | `strategy` | `manual` \| `balanced_random` | 可选，默认 `manual` |
  | `studentIds` | string[] | `manual` 模式的成员 ID，至少 1 人 |
  | `groupCount` | number ≥ 2 | `balanced_random` 模式的小组数量，不得超过人数 |

- **响应 201**：`manual` 返回单个分组对象；`balanced_random` 返回分组对象数组，结构同 3.5。
- **错误**：`400` 成员为空/不在本班、组数大于人数、缺少 `groupCount`；`409` 分组重名；`404` 班级不存在。

### 3.7 `GET /assignments` — 作业列表

- **鉴权**：管理令牌
- **查询参数**：`type`（`online|offline|checkin|relay`）、`state`（`draft|published|closed`）、`page`（默认 1）、`pageSize`（默认 20，最大 100）
- **响应 200**：

  ```json
  { "items": [ { "id": "...", "title": "周五数学练习", "type": "online", "state": "published",
                  "dueAt": "...", "instructions": "...", "submissionMode": "both",
                  "allowedTypes": ["pdf", "docx"], "maxFileCount": 5, "maxFileBytes": 20971520,
                  "createdAt": "...", "publishedAt": "...", "closedAt": null,
                  "expectedCount": 3, "submittedCount": 1, "missingCount": 2,
                  "shareUrl": "http://.../a/<shareCode>" } ],
    "total": 1, "page": 1, "pageSize": 20 }
  ```

  `submittedCount` 按类型取线上提交数 / 线下完成数 / 签到数 / 接龙数。
- **错误**：`400` 类型或状态取值非法。

### 3.8 `POST /assignments` — 创建并可选发布作业

- **鉴权**：管理令牌
- **请求体**：

  | 字段 | 类型 | 说明 |
  | --- | --- | --- |
  | `title` | string (1–120) | 必填 |
  | `type` | `online\|offline\|checkin\|relay` | 必填 |
  | `instructions` | string ≤ 5000 | 可选 |
  | `dueAt` | ISO 8601 字符串或 null | 可选；迟交仍可提交，看板标记 `late` |
  | `submissionMode` | `text\|file\|both` | 仅 `online` 有效，默认 `both` |
  | `allowedFileTypes` | string[] | 白名单子集 `pdf,doc,docx,jpg,jpeg,png,txt,zip`，默认全部 |
  | `maxFileCount` | 1–10 | 默认 5 |
  | `maxFileSizeMB` | 1–20 | 默认 20 |
  | `target` | object | 必填：`{ "mode": "all" }` / `{ "mode": "groups", "groupIds": [...] }` / `{ "mode": "students", "studentIds": [...] }` |
  | `publishNow` | boolean | 默认 `false`（`draft`）；`true` 直接 `published` |

- **响应 201**：`{ id, title, type, state, dueAt, shareCode, shareUrl, expectedCount }`
- **规则**：发布时冻结目标名单；目标成员去重；目标为空、名单为空、小组/学生不属于本班均返回 `400`。
- **错误**：`400` 业务校验失败；`422` DTO 校验失败；`401` 令牌无效。

### 3.9 `PATCH /assignments/{assignmentId}/state` — 发布 / 停止收取

- **鉴权**：管理令牌
- **请求体**：`{ "state": "published" | "closed" }`
- **响应 200**：`{ id, state, shareUrl }`
- **规则**：`closed` 不可重开；只有 `published` 能关闭。
- **错误**：`404` 作业不存在；`409` 状态非法；`400` state 取值非法。

### 3.10 `GET /assignments/{assignmentId}/dashboard` — 教师看板

- **鉴权**：管理令牌
- **响应 200**：

  ```json
  { "assignment": { "id": "...", "title": "...", "type": "online", "state": "published", "dueAt": "...", "shareUrl": "..." },
    "summary": { "expected": 3, "submitted": 1, "missing": 2, "late": 0 },
    "missingMentionText": "@李四 @王五",
    "items": [ { "studentId": "...", "studentNo": "2026001", "name": "张三",
                 "submissionId": "...", "status": "submitted", "submittedAt": "...",
                 "textContent": "答案：42",
                 "files": [ { "id": "...", "originalName": "answer.pdf", "sizeBytes": 42 } ],
                 "score": 95, "feedbackText": "步骤清晰。" } ] }
  ```

  `status` 取值：`missing|submitted|late`（线上）、`missing|completed`（线下）、`missing|checked_in`（签到）、
  `missing|joined`（接龙）。`textContent` 与 `files` 为当前最新版本的提交内容与附件，供教师批改时查看。
  非目标学生不会出现在 `items` 中。
- **错误**：`404` 作业不存在。

### 3.11 `PATCH /submissions/{submissionId}/feedback` — 批改反馈

- **鉴权**：管理令牌
- **请求体**：`{ "score": number (0–100, 可选), "feedbackText": string ≤ 5000 }`
- **响应 200**：`{ submissionId, feedback: { id, submissionId, score, feedbackText, reviewedAt } }`
- **规则**：同一提交重复批改会更新反馈并刷新 `reviewedAt`；学生重新提交会清除旧反馈。
- **错误**：`404` 提交不存在；`422` 分数越界或缺少反馈文本。

### 3.12 `PUT /assignments/{assignmentId}/completions/{studentId}` — 线下完成登记

- **鉴权**：管理令牌
- **请求体**：`{ "completed": boolean }`
- **响应 200**：`{ studentId, completed, completedAt }`
- **规则**：可重复切换（撤销时 `completedAt` 置空）；只对 `offline` 类型、且被冻结名单包含的学生生效。
- **错误**：`400` 类型不符或学生不在目标名单；`404` 作业不存在。

### 3.13 `GET /assignments/{assignmentId}/exports` — 导出

- **鉴权**：管理令牌
- **查询参数**：`format=csv|zip|docx`（必填）；`submissionId`（`docx` 必填）
- **响应 200**：二进制文件

  | format | 内容 | Content-Type |
  | --- | --- | --- |
  | `csv` | 全班状态、提交时间、分数、反馈（带 BOM、防公式注入） | `text/csv; charset=utf-8` |
  | `zip` | 每位学生按「学号-姓名-作业名」目录归档的最新版附件 | `application/zip` |
  | `docx` | 指定提交的文本、学生信息、教师反馈生成的 Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

- **错误**：`400` format 非法或缺少 `submissionId`；`404` 提交/作业不存在；`413` ZIP 超过 `MAX_EXPORT_BYTES`。

### 3.14 `GET /assignments/{assignmentId}/submissions/{submissionId}/download` — 教师下载附件

- **鉴权**：管理令牌
- **查询参数**：`fileId`（必填）
- **响应 200**：附件二进制流，文件名经安全化处理。
- **规则**：校验 `fileId` 同时属于该作业和该提交，防止跨作业越权。
- **错误**：`401` 无令牌；`404` 文件不存在。

### 3.15 `GET /files/{fileId}/download` — 通用附件下载

- **鉴权**：`receiptCode`（查询参数）或 `X-Demo-Admin-Token`（请求头），任一有效即可
- **响应 200**：附件二进制流；**404** 凭据不匹配或文件不存在（不泄露文件是否存在）。

## 4. 学生端公开接口

### 4.1 `GET /public/assignments/{shareCode}` — 查看作业

- **鉴权**：分享码（路径参数）
- **响应 200**：

  ```json
  { "id": "...", "title": "...", "type": "online", "instructions": "...", "dueAt": "...",
    "submissionMode": "both", "allowedFileTypes": ["pdf", "docx"],
    "maxFileCount": 5, "maxFileSizeMB": 20, "state": "published" }
  ```

  响应中**不包含**班级名单、目标学生、`shareCode` 之外的任何管理数据。
- **错误**：`404` 分享码无效或作业不为 `published`。

### 4.2 `POST /public/assignments/{shareCode}/submissions` — 提交线上作业

- **鉴权**：分享码
- **Content-Type**：`multipart/form-data`

  | 字段 | 说明 |
  | --- | --- |
  | `studentNo` | 学号（前端表单必填）；API 允许只凭唯一姓名匹配 |
  | `studentName` | 姓名（前端表单必填）；与学号同时提供时必须一致 |
  | `textContent` | 文本答案，按 `submissionMode` 要求 |
  | `files` | 0–N 个附件（字段名重复多次），受数量、大小、类型白名单与内容签名校验 |

- **响应 201**：

  ```json
  { "submissionId": "...", "receiptCode": "...", "version": 1, "submittedAt": "...",
    "folderName": "2026001-张三-周五数学练习",
    "files": [ { "id": "...", "originalName": "answer.pdf", "sizeBytes": 42 } ] }
  ```

- **规则**：学号 + 姓名必须与冻结名单匹配（同名不唯一时要求提供学号）；同一学生重复提交会递增 `version`、
  保留历史版本文件、复用同一 `receiptCode` 并清除旧反馈；文件按随机对象键存储，原始文件名只用于下载显示。
- **错误**：`400` 身份不匹配/姓名歧义/非目标学生/类型或大小不符/内容为空；`404` 分享码无效或作业已关闭；
  `409` 并发冲突；`413` 超过 `MAX_UPLOAD_BYTES`。

### 4.3 `POST /public/assignments/{shareCode}/check-ins` — 签到

- **鉴权**：分享码
- **请求体**：`{ "studentNo"?: string, "studentName"?: string }`（至少提供一项，同名时用学号消歧）
- **响应 201**：`{ studentId, displayName, checkedInAt, alreadyCheckedIn }`
- **规则**：幂等，重复签到返回首次时间且 `alreadyCheckedIn=true`。
- **错误**：`400` 作业不是签到类型、姓名歧义、身份不匹配或非目标学生；`404` 分享码无效或作业已关闭。

### 4.4 `GET /public/assignments/{shareCode}/relay-entries` — 查看接龙

- **鉴权**：分享码
- **响应 200**：`{ items: [ { entryId, position, displayName, content, createdAt } ], total }`，按 `position` 升序。
- **错误**：`400` 作业不是接龙类型；`404` 分享码无效或作业已关闭。

### 4.5 `POST /public/assignments/{shareCode}/relay-entries` — 加入接龙

- **鉴权**：分享码
- **请求体**：`{ "studentNo"?: string, "studentName"?: string, "content"?: string (≤1000) }`
- **响应 201**：`{ entryId, position, createdAt }`
- **规则**：位置按加入顺序递增（可串行化事务保证）；同一学生重复占位返回 `409`。
- **错误**：`400` 身份不匹配或非目标学生；`409` 重复占位；`404` 分享码无效或作业已关闭。

### 4.6 `GET /public/submissions/{receiptCode}` — 查看本人回执与反馈

- **鉴权**：回执码（路径参数）
- **响应 200**：

  ```json
  { "assignment": { "id": "...", "title": "...", "type": "online", "dueAt": "..." },
    "submittedAt": "...", "version": 2, "textContent": "答案：43",
    "files": [ { "id": "...", "originalName": "answer-v2.pdf", "contentType": "application/pdf", "sizeBytes": 42 } ],
    "feedback": { "id": "...", "score": 95, "feedbackText": "步骤清晰。", "reviewedAt": "..." } }
  ```

  `feedback` 未批改时为 `null`；`files` 仅为最新版本的附件。
- **错误**：`404` 回执码无效。

### 4.7 `GET /public/files/{fileId}/download` — 本人附件下载

- **鉴权**：`receiptCode`（查询参数）
- **响应 200**：附件二进制流。
- **错误**：`404` 回执码与文件所属提交不匹配（阻止越权下载他人作业）。

## 5. 安全与边界说明

- demo 无账号体系：管理令牌是唯一的教师凭据，分享码/回执码是能力链接（capability URL），**不适合承载真实敏感学生数据**；
  正式版需引入账号登录、JWT/RBAC 与学生身份绑定。
- 上传校验包含扩展名白名单、MIME 匹配、文件内容签名（`file-type`）、空文件与控制字符检查；存储键由服务端生成，
  本地写入时校验路径不越出私有目录；下载名经过 NFKC 规范化与危险字符替换。
- CSV 导出对以 `= + - @` 开头的单元格加前缀，避免表格软件公式注入；ZIP 目录名同样做过安全化。
- 公开接口不提供全班名单；身份错误、非目标学生、无效分享码统一返回不可区分的错误，避免枚举。
- 所有响应带 `requestId`（由中间件生成），便于日志追踪。
- **未实现速率限制与防爆破**：管理令牌、分享码、回执码的尝试次数不受限；公网暴露前必须补充限流与失败锁定。
- **能力链接无过期与撤销机制**：`shareCode` / `receiptCode` 生成后长期有效；关闭作业只停止公开操作，不作废已有回执码，链接泄露后无法单独吊销。
- **管理令牌无轮换、无审计日志**：`DEMO_ADMIN_TOKEN` 是静态环境变量，轮换需重启服务；除 `requestId` 外没有操作审计记录。
- 上述三项是 demo 明确接受的安全边界，**试点承载真实学生数据前必须补齐并重新评估**。

## 6. 已知限制

- 单班级、无登录、无多租户；`POST /demo/bootstrap` 只能执行一次。
- 已提供版本化迁移（`apps/api/prisma/migrations/`，Compose 用 `prisma migrate deploy`），但**尚未在真实 PostgreSQL
  实例上执行过 `migrate deploy`**；本机无 Docker/独立 PostgreSQL，迁移 SQL 由 PGlite 直接执行并驱动全部 E2E，
  建表、枚举、外键与索引均生效。`prisma migrate diff --from-migrations` 的 shadow database 一致性校验因
  PGlite 协议端点与 Prisma CLI 引擎不兼容（P1001）未能离线完成，需在真实部署验证中补做。
- 本环境未安装 Docker/独立 PostgreSQL 服务，因此未执行镜像构建与真实数据库部署验证；
  E2E 使用 PGlite 提供的 PostgreSQL 协议端点覆盖完整业务链路。
