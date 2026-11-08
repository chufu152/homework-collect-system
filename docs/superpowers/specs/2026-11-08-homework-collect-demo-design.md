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
