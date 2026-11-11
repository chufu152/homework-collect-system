# Product

<!-- impeccable:product-schema 1 -->

> 阶段 A 草案，依据 `docs/frontend-skill-prompts.md` 的 A1 提示词产出。
> **方法说明**：`impeccable` 的 `init` 原生流程要求先做一轮访谈；项目提示词 A1 明确要求「不要发起多轮访谈」，且本轮用户要求「仅推进可确定的内容」。因此本文件只写入仓库证据可确认的事实，未确认项一律以「待确认」显式标注，不视为既定事实。
> **运行说明**：`impeccable context` launcher 在本机超时（引擎二进制下载未完成），按 skill 的 Launcher unavailable 兜底，直接读取项目现有上下文。项目原先不存在 `PRODUCT.md` / `DESIGN.md`。

## Platform

web

## Users

- **教师（唯一管理角色）**：在班级工作台维护名单与分组、发布作业、查看完成情况、批改反馈、导出结果。凭据是由运行环境提供的 `DEMO_ADMIN_TOKEN`，前端以 `X-Demo-Admin-Token` 请求头携带、仅保存在浏览器会话（`sessionStorage`）中。
- **学生（匿名访客）**：不注册、不登录，通过教师分享的 `shareCode` 链接提交线上作业/签到/接龙，通过 `receiptCode` 回执链接查看本人提交与教师反馈。身份以学号 + 姓名与冻结名单匹配；同名需学号消歧。
- **无匿名管理访客**：未持有管理令牌者不能读写任何管理数据，只能打开教师工作台的静态页面。

来源：`docs/handoff-prompt.md` 1.1、1.2；`docs/api.md` 第 1、3、4 节；设计 spec 角色与权限表。

## Product Purpose

做一个「班级作业收发」Web 系统，用于验证完整业务链路的**单班级、免账号登录 demo**：教师把名单、作业、收取进度、批改与导出集中在一处；学生用一条链接完成提交或参与，无需账号。成功标准是四种作业类型（线上提交、线下登记、签到、接龙）都能走通「发布 → 参与 → 看板/回执 → 导出」链路。

正式版的多班级、账号体系不在当前范围。

来源：`docs/handoff-prompt.md` 1.1、1.2；设计 spec 阶段表。

## Positioning

以下机制由现有代码与接口契约确认，可作为与通用表单/网盘工具区分的产品事实（非营销主张）：

- **能力链接替代身份核验**：`shareCode` / `receiptCode` 是学生侧唯一凭据，公开接口不返回全班名单；无效码统一返回不可区分的 404。
- **发布时冻结目标名单**：`AssignmentTarget` 在发布瞬间固定为全员 / 指定分组 / 指定学生，缺交统计与身份校验均以该集合为准，后续分组变动不影响已发布作业。
- **版本化提交**：同一学生重复提交递增 `version`、保留历史版本与附件、复用同一 `receiptCode` 并清除旧反馈。
- **统一响应契约**：JSON 成功/失败都走 `{ code, message, data, requestId }` 信封，空结果为 `data: null`；二进制下载/导出不走信封。

来源：`docs/api.md` 第 1、3.8、3.10、3.16、4.2、4.6、5 节；`docs/handoff-prompt.md` 1.2。

## Operating Context

- 单班级、无账号、无多租户；`POST /demo/bootstrap` 只能执行一次。
- 管理令牌是静态环境变量（≥32 位、非示例值），轮换需重启服务；前端仅在会话内保存。
- `shareCode` / `receiptCode` 长期有效，无过期与撤销；关闭作业只停止公开操作。
- 前端为 Vue 3 + TypeScript + Vite 6 + Vue Router，6 条既有路由、组合式 API 局部状态、全局 `styles.css`、统一 `api/client.ts`；组件测试 Vitest + @vue/test-utils。
- 接口与前端布局需适用于手机浏览器；后端另有单实例限流与结构化审计日志。
- 本地 Docker Compose：postgres / migrate / api / web + nginx 反代；生产对象存储可切 S3 兼容桶。
- **明确禁止承载真实敏感学生数据**；试点前需补齐能力链接过期/撤销、令牌轮换等。

来源：`docs/handoff-prompt.md` 1.2、1.3、2.2、5；`docs/api.md` 第 1、2、5、6 节；`apps/web/src/router.ts`、`apps/web/package.json`。

## Capabilities and Constraints

已确认能力：唯一班级初始化、名单导入（学号唯一、重复更新姓名）、手动/均分随机分组；作业类型 `online | offline | checkin | relay` 与状态 `draft | published | closed`；线上文本 + 附件（扩展名/MIME/签名/数量/大小校验）；教师看板统计与 `@姓名` 未完成名单、批改评分与反馈、CSV/DOCX/ZIP 导出；线下完成登记（可撤销）、签到幂等、接龙稳定序号且禁止重复占位；学生回执页。

术语（前端文案必须沿用）：应交 / 已完成 / 未完成 / 迟交、缺交名单、分享链接、回执码、分组、目标名单、管理密钥。

技术约束：npm workspaces；Node ESM 相对导入带 `.js`；NestJS 控制器/服务/DTO 分层；Vue 组合式 API；24 个 `/api/v1` 接口；接口或数据模型变更必须同步 `docs/api.md` 与 spec 并补测试；Prisma 迁移 SQL 是数据库结构单一事实来源。

本轮前端约束（`docs/frontend-skill-prompts.md` 0.3、C1–C8）：只改 `apps/web` 与本轮设计产物；不改 `apps/api` 与接口契约；不新增路由、依赖、UI 库、状态库、字体或图片资源；不扩展示例边界；不改变 6 条路由；不把 skill 示例资产复制进 `apps/web`；不推送 `main`。

## Brand Commitments

本文件不记录任何用户确认过的品牌承诺。**待确认**：`apps/web/src/styles.css` 中现存的配色、`@import` 在线字体（DM Sans / Noto Sans SC）、文字标记「收」是否应被认定为绑定约束（见 `DESIGN.md` 与待确认清单 T5）。在这些得到确认前，它们只按「代码中既存的实现值」处理，不升级为品牌事实。

## Evidence on Hand

- 需求与契约：`docs/handoff-prompt.md`、`docs/api.md`、`docs/superpowers/specs/2026-11-08-homework-collect-demo-design.md`、`docs/superpowers/plans/2026-11-08-homework-collect-demo.md`。
- 前端实现：`apps/web/src/router.ts`、`apps/web/src/api/client.ts`、`apps/web/src/styles.css`、`apps/web/src/views/*.vue`（6 个视图）、`apps/web/src/views/*.spec.ts`（5 个组件测试）。
- 验证基线（2026-11-09 本轮实跑）：`npm test` 全量 67 项通过（API 54 / Web 10 / contracts 3），18 个测试文件。
- 明确不存在、后续不得虚构：Logo 文件、品牌规范、真实照片/产品截图、客户评价、案例数据、定价或部署声明、设计系统文档、PRODUCT.md / DESIGN.md 的历史版本、视觉回归基准图。

## Product Principles

1. **单班级、免登录**：不以任何形式引入账号体系或跨班级概念。
2. **能力链接即凭据**：学生侧所有可见数据都必须能由单个 `shareCode` / `receiptCode` 解释，公开接口不泄露全班名单。
3. **名单以发布时刻为准**：看板统计、提交/签到/接龙身份校验都以冻结目标集合为准。
4. **提交可追溯**：重复提交保留版本与历史附件，不覆盖历史。
5. **demo 不承载真实敏感数据**：安全边界以文档明示为准，不用设计手段掩盖。

## Accessibility & Inclusion

已确认：接口与前端布局适用于手机浏览器（设计 spec 验收标准 6）；现有样式含 `:focus-visible` 焦点环与 `prefers-reduced-motion` 媒体查询。
**待确认**：WCAG 目标等级、文本放大、多语言 / RTL / 深色模式是否需要（T9）；是否以手机浏览器为第一优先、是否要求 320px 溢出检查（T6）。

## 待确认（未纳入既定事实）

- T1 本轮前端目标：现有 6 页质量提升，还是优先补齐 P1-8「查看历次修改」UI。
- T2 / T3 版本历史 UI 的入口、可见范围，以及 `client.ts` 是否允许新增 `versions` 字段与客户端方法。
- T4 是否允许 `PRODUCT.md` / `DESIGN.md` / `.taste-skill/` 纳入版本控制（当前 `.gitignore` 未配置，三者此前均不存在）。
- T5 既有配色、在线字体、文字标记「收」是否升格为品牌承诺。
- T6 设备与断点优先级、320px 是否必测。
- T9 多语言 / RTL / 深色模式 / 文本放大范围。
- T12 设计产物与代码改动的提交策略与推送时机。
