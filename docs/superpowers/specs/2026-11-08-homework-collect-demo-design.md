# 收发作业系统 demo 设计说明

## 意图

基于项目描述实现一个单班级作业收发 Web demo：教师维护学生名单与分组，发布线上/线下/签到/接龙作业；学生通过分享链接提交或登记；教师查看完成情况、复制缺交名单、批改反馈并导出。

## 范围

- 单个班级；提供一次性初始化与名单导入、名单查询、手动或均分随机分组。
- 线上作业支持文本、附件或两者；学生通过分享页提交，得到个人回执码；允许的重新提交保存版本。
- 线下作业由教师登记完成/撤销；签到由学生提交学号或姓名；接龙支持学生按分享链接参与并显示顺序。
- 教师看板显示应交、已交、缺交、迟交，输出可复制的 `@姓名` 缺交文本；可反馈、导出 CSV、ZIP 和 DOCX。
- demo 无账号/密码登录；管理接口使用一次性 `X-Demo-Admin-Token`，学生公开接口使用不可预测的 `shareCode`，个人反馈用 `receiptCode`。生产版本再引入账号登录、JWT/RBAC 与学生身份绑定。

## 技术约束

- 前端 Vue 3 + TypeScript + Vite；后端 NestJS REST API + TypeScript。
- PostgreSQL + Prisma 为正式数据层，不以浏览器 localStorage 或内存数组替代持久化。
- 开发环境文件存本地私有目录；生产环境使用私有 S3 兼容对象存储。下载通过受控接口或短时签名 URL。
- 文件仅接受明确白名单类型和大小上限；客户端文件名不能成为实际文件系统路径。
- 不实现多班级正式账号系统；不推送至共享 GitHub 分支，也不发布公网应用。
- demo 不提供速率限制、能力链接过期/撤销、管理令牌轮换与操作审计日志；这些边界在 `docs/api.md` 第 5 节显式列出，试点使用前必须补齐。

## 核心数据和状态

- 班级唯一约束：`Student(classId, studentNo)`。
- 作业类型：`online | offline | checkin | relay`；作业状态：`draft | published | closed`。
- 发布时冻结目标学生集合；线上提交按学生保留当前提交并保留版本；缺交统计只按冻结目标集合。
- 线上学生身份在 demo 中通过学号和姓名与名单匹配，不提供公开全班名单 API；相同姓名不唯一时要求补学号。

## API 基线

统一前缀 `/api/v1`。管理 API：`X-Demo-Admin-Token`；学生操作：路径中的 `shareCode`；本人反馈查询：`receiptCode`。

- `POST /demo/bootstrap`
- `GET /classes/current`
- `GET|PUT /classes/{classId}/students`
- `POST /classes/{classId}/groups`
- `GET|POST /assignments`
- `PATCH /assignments/{assignmentId}/state`
- `GET /public/assignments/{shareCode}`
- `POST /public/assignments/{shareCode}/submissions`
- `GET /assignments/{assignmentId}/dashboard`
- `PATCH /submissions/{submissionId}/feedback`
- `GET /public/submissions/{receiptCode}`
- `PUT /assignments/{assignmentId}/completions/{studentId}`
- `POST /public/assignments/{shareCode}/check-ins`
- `GET|POST /public/assignments/{shareCode}/relay-entries`
- `GET /assignments/{assignmentId}/exports?format=zip|csv|docx`

## 验收标准

1. demo 初始化只建立一个班级；未提供有效管理令牌时不能读取或修改管理数据。
2. 教师能发布全员/分组/指定学生作业；公开学生页不泄露全班名单。
3. 目标学生提交后，已交/缺交统计、`@姓名` 文本和导出一致；截止时间后按迟交规则显示。
4. 文件上传不能越权写入任意路径，文件类型/大小经过服务端校验；文本可生成 DOCX。
5. 线下登记可撤销；签到无法唯一识别时明确报错；接龙排序稳定并阻止同一学生重复占位。
6. 接口和前端布局适用于手机浏览器；测试、类型检查及生产构建通过。

## 技术栈选型与部署架构

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + Vue Router；组合式 API 局部状态 | 单班级 demo 页面数量有限，组合式 API 足够，无需引入额外状态库；Vite 构建快、产出小，移动端浏览器可直接访问 |
| 后端 | Node.js 22 + NestJS 12 + REST + class-validator/class-transformer | 控制器/服务/守卫分层清晰，DTO 校验与统一响应/异常信封便于前端对接与后续演进 |
| 数据 | PostgreSQL 16 + Prisma 7 | 名单、目标名单、提交版本、反馈等是强关联数据；唯一约束与事务保证「学号唯一」「重复提交保留版本」「接龙顺序稳定」，不用浏览器存储代替持久化 |
| 文件 | 本地私有目录（开发）/ 私有 S3 兼容对象存储（生产） | 大文件不入库；服务端生成对象键、生成下载名，避免路径穿越与覆盖；生产用服务端加密与私有桶 |
| 共享契约 | `packages/contracts` npm workspace | 作业类型/状态、目标名单、缺交名单等纯函数前后端共用，避免规则漂移 |
| 测试 | Vitest + @vue/test-utils + PGlite（PostgreSQL 协议端点） | 业务规则单测、组件测试与完整 HTTP 链路 E2E 均可在无独立数据库服务的环境运行 |
| 部署 | Docker Compose（postgres / migrate / api / web）+ nginx 反代 `/api` | 单命令启动、数据卷持久化；生产在前面加 HTTPS 反向代理，并配置数据库备份 |

本环境没有 Docker 与独立 PostgreSQL 服务，因此镜像构建与真实数据库部署未执行验证；Compose、Dockerfile、nginx 配置与环境变量模板均已就绪，E2E 用 PGlite 覆盖了完整业务链路。

## 角色与权限设计

| 角色 | 凭据 | 允许 | 禁止 |
| --- | --- | --- | --- |
| 教师 / 管理员 | 请求头 `X-Demo-Admin-Token`（≥32 位随机值，仅存当前浏览器会话） | 初始化班级、名单与分组、发布/关闭作业、看板、批改、线下登记、导出、下载全部提交 | 无凭据或弱令牌时所有管理接口返回 401/503 |
| 学生 | 分享码 `shareCode`（能力链接） | 查看单条作业、提交/重新提交、签到、接龙、查看接龙顺序 | 读取全班名单、访问其他作业、通过猜测 ID 下载他人附件 |
| 本人回执 | 回执码 `receiptCode` | 查看本人最新提交内容与附件、教师反馈、下载本人附件 | 访问他人回执或附件（返回 404，不泄露存在性） |
| 匿名访客 | 无 | 打开教师工作台静态页面 | 任何管理数据读写 |

demo 不做账号与身份核验，能力链接一旦泄露即可冒用，因此**不得用于真实敏感学生数据**。正式版引入账号登录、
JWT + RBAC、学生与账号绑定、按班级的数据隔离与审计日志。完整接口与鉴权标注见 [API 接口文档](../../api.md)。

## 开发阶段与交付物

| 阶段 | 主要内容 | 交付物 | 状态 |
| --- | --- | --- | --- |
| 0 规划 | 需求边界、技术选型、接口基线、阶段拆分 | 本设计说明、`docs/api.md`、`docs/superpowers/plans/2026-11-08-homework-collect-demo.md` | 完成 |
| 1 基线 | npm workspaces、共享领域模型、Docker/env 模板 | `packages/contracts`、根配置、纯业务规则单测 | 完成 |
| 2 后端 | Prisma schema、22 个 REST 接口、上传存储、导出、管理守卫 | `apps/api`、单元与 E2E 测试 | 完成 |
| 3 前端 | 班级设置、发布、看板/批改/导出、学生提交/签到/接龙/回执 | `apps/web`、组件测试、移动端样式 | 完成 |
| 4 验收 | 全链路回归、安全审查、类型检查与生产构建 | `npm test` / `npm run typecheck` / `npm run build` / `npm run db:validate` 结果 | 完成 |
| 5 正式版 | 多班级、账号登录与 JWT/RBAC、版本化 migration、对象存储与 HTTPS 上线、审计与备份 | 待立项 | 未开始 |

阶段 4 的 E2E 覆盖：初始化→导入名单→发布→伪造附件拒绝→线上提交→看板/缺交名单→批改→回执→附件下载→
CSV/DOCX/ZIP 导出→教师查看提交内容与附件→重复提交保留版本并清除反馈→关闭后拒绝提交，以及线下登记可撤销、
签到幂等与姓名歧义、接龙顺序与重复占位、定向目标名单与关闭后停止公开操作、无效令牌/分享码/回执码隔离。
