# 前端渲染可测量基线与规则停用清单（A3）

> 依据 `docs/frontend-skill-prompts.md` 的 A3 提示词产出，调用 `design-taste-frontend`（tasteskill 2.5.1）**只读参考文档**中可客观测量的部分。
> 事实来源：该 skill 的 `SKILL.md` 第 5 节 Checklist、`SKILL.md` 第 30–56 行 House rules、`SKILL.md` 第 365–377 行 Never、`references/gate.md`、`scripts/consistency.mjs` 的阈值注释，以及本项目 `DESIGN.md` / `docs/frontend-stage-a.md` / `apps/web/src/styles.css` 中已存在的值。
>
> **本文件是只读清单，不是改动方案**：不含视觉方向建议、不含实现代码、不含操作步骤教程；`apps/web` 与 `.taste-skill/` 均零改动，未运行 gate，未复制任何 skill 资产。
> **用途**：按 H1 交 `impeccable` 供 B1 / B3 / C1 与 D2 共用同一口径；按 H2，一致性基准仍是 `DESIGN.md`，本文件只提供渲染测量口径，不覆盖设计契约。
> **本轮约束**：C1（唯一写入方）、C2（唯一事实来源）、C3（规则限缩）、C4（验收分层）、C5（零无关资产）、C8（待确认优先）。

---

## 0. 本文档的边界

- 只记录**可客观测量**的项：能被无头浏览器在固定宽度下判定为通过 / 不通过、或能给出确定数值阈值的项。
- 不记录任何「应该是什么风格」的判断：配色方向、字体气质、图片选择、版式野心、品牌表达一律不属于本文件，仍归 `DESIGN.md` 与待确认项 T5。
- 不宣布任何页面「已通过」。本文件只定义口径；实际测量由 D2 在 H3 交接的构建产物上执行，结论按 H4 回交。
- 不替代项目既有验证命令（C4）：功能 / 类型 / 构建 / 迁移校验 / 依赖审计 / diff 仍由项目命令负责。
- 下列待确认项未获答复前，本文件不把假设写成既定事实（C8）：**T6**（设备与断点优先级、320px 是否必测）、**T9**（多语言 / RTL / 深色模式 / 文本放大）、**T10**（Node 22+ 与 Chrome/Edge/Chromium 可用性、gate 采用 dev server URL 还是构建页面 + root）。

---

## 1. 测量口径与运行范围（skill 的客观事实）

### 1.1 固定断点集合

以下宽度是 `design-taste-frontend` 检查脚本**内置固定**的测量档位，不是本项目新提出的断点要求：

| 来源 | 固定宽度 / 尺寸 |
| --- | --- |
| Checklist「Every visual draws」 | 1440 / 1024 / 768 / 390 |
| Checklist 手机段 | 820 / 768 / 390 / 320 |
| gate 的 `consistency.mjs --quick --widths` | 1440、390 |
| gate 的 `assets/layout/check.mjs --sizes` | 1440x900、390x844 |
| 手机窄屏 pass（`--narrow 320`，手机宽度时默认开启） | 320x640 |
| 首屏 sweep | 1280 / 1152 / 1024 / 896 / 768 |
| section rhythm | 1440x900 / 768x1024 / 390x844 |

本项目既存事实（仅作测量起点，不构成改动建议）：`styles.css` 使用 `@media (max-width: 760px)` 与 `@media (max-width: 430px)` 两个断点，`body { min-width: 320px }`。两者与 skill 固定档位不一致，此差异是**待测量的客观事实**，不是本文件要求修改的内容；是否调整断点、是否必测 320px 属 T6。

### 1.2 gate 的检查覆盖（决定 D2 不能误报通过）

按 `references/gate.md` 第 32–41 行，gate 每次以全新 profile 的无头 Chrome 逐项运行：

- `consistency.mjs --quick --widths 1440,390`，其中含 `basics` 块（names、alt、labels、heading order、Tab 走查、lang、head 标签、map links、assumed facts）与 `empty-area`。
- `assets/layout/check.mjs --sizes 1440x900,390x844`。
- 390 宽度带出手机检查 `collide` / `tap-size`，并在 320 走查 `off-viewport`；`hidden-content` 以关闭脚本的方式加载页面。
- `copy-lint.mjs --json --kind <kind>`：页面文件无 sections 时（构建产物 / dev server）改为对浏览器渲染出的页面执行；两者皆无时列为「未检查」，**从不计为通过**。
- 另有两项纯文件读取检查：`kit-edited`、`checker-gaming`（`gaming-suspect` 可豁免）。

**关键覆盖缺口（客观事实，D2 必须显式记录「未检查」而非默认通过）**：`--quick` 明确不含 `forms`、`reduced-motion`、`hover-move`、`hover-spill`、`loop-pause`、`hidden-visual` 与 scroll walks。因此本清单的 **B7（prefers-reduced-motion）与 B9 中的 hover 位移检查不在 gate 默认 quick 覆盖内**；若 D2 只跑默认 gate，这两项须按「未检查」列出，或另行执行完整一致性检查。

### 1.3 判定级别

- `FAIL` 阻断；`WARN` 不阻断（`skip-link`、`share-meta`、`action-repeat`、`assumed`、表单 `.example` 占位等）。
- 两个例外：`hero-enter` 与 `moment-none` 本为 WARN，但 gate **按 FAIL 持有**（见第 3 节 S9）。
- 误判的 FAIL 只能写入 `.taste-skill/waivers.json` 并给出理由；`kit-edited`、`checker-gaming` 不可豁免；**超过 5 条 waivers 本身即为 FAIL**（`too many waivers: fix instead`）。
- `GATE:` 状态取值：`PASS` / `FAIL` / `OPEN` / `QUICK` / `SETUP` / `ERROR` / `OFF` / `DONE`；`ERROR` 或 `OFF` 时不得重跑，须据实写入报告。

---

## 2. 《渲染可测量基线清单》

> 每条格式：测量项 / 对应检查 id / 客观判定阈值 / 既有代码可核对事实（仅作测量起点，不构成结论或改动建议）/ gate 覆盖。
> 判定阈值全部取自 skill 自身的脚本与 Checklist，不是本项目新设的标准。

| 编号 | 测量项 | 主要检查 id | 默认 gate 是否覆盖 |
| --- | --- | --- | --- |
| B1 | 固定断点与窄屏无溢出 | `off-viewport`、`spill`、`visual-empty`、`empty-visual`、`collide` | 部分（1440/390/320） |
| B2 | 等边距与对齐 | `container-edges`、`row-lines`、`off-grid`、`right-edge`、`col-edge`、`spill`、`off-viewport`；`check.mjs` 的 `edge-left`、`edge-right`、`spill`、`bleed-one-side`、`one-sided`、`lines` | 是 |
| B3 | 单一按钮 / 卡片 / 圆角 / 字号体系 | `button-styles`、`button-shape`、`card-family`、`card-layout`、`link-styles`、`nesting`、`heading-scale`、`font-load` | 是 |
| B4 | 触摸点击区 | `tap-size`、`collide` | 是（390 / 320） |
| B5 | 键盘焦点与标题层级 | `a11y-name`、`img-alt`、`field-label`、`heading-order`、`tabindex`、`skip-link`、`focus-ring`、`focus-visible`、`focus-hidden`、`menu-toggle`、`lang`、`page-meta`、`share-meta` | 是（`basics` 块） |
| B6 | 文本对比度 | `text-contrast`、`contrast`、`body-size` | 是 |
| B7 | `prefers-reduced-motion` | `reduced-motion`、`hidden-content`、`hidden-visual`、`loop-pause` | **否**（`--quick` 排除） |
| B8 | 无占位文案 | `placeholder`、`sample-label`、`copy-residue`、`copy-slop-word`、`copy-stock-phrase`、`form-fields` | 部分（`copy-lint` 的 FAIL 阻断） |
| B9 | hover 反馈 | `hover`、`motion-layer`、`tilt`、`hover-move`、`hover-spill` | 部分（`hover-move` / `hover-spill` 不在 `--quick`） |

### B1 固定断点与窄屏无溢出

- **客观判定**：在 1.1 的固定档位逐档渲染；任何区块越过屏幕右缘记为 `off-viewport`，`body` 裁剪隐藏横向滚动不算通过；320 宽度整页走查到页脚，每屏检查 `collide` 与 `tap-size`；每个视觉在 1440 / 1024 / 768 / 390 都必须实际绘制，不得出现空底（`visual-empty` / `empty-visual`）。
- **既有代码事实**：`body { min-width: 320px }`；760px 以下统计网格 4→2 列、看板隐藏 `.student-table-wrap` 并显示 `.mobile-student-list`；430px 以下公有页两列表单堆叠、接龙行三列→两列。
- **待确认**：T6（手机第一优先、320px 是否必测、是否指定实测机型）未答复前，本条不把任一档位定为「必测」，只记录 skill 内置档位。

### B2 等边距与对齐

- **客观判定**：所有区块对齐到同一内容边缘或网格列（`container-edges`、`col-edge`、`right-edge`、`off-grid`）；`check.mjs` 的 `edge-left` / `edge-right` / `bleed-one-side` / `one-sided` 判定单侧出血；无横向滚动（`spill`、`off-viewport`）。
- **既有代码事实**：教师页 `.page-wrap` 为 `width: min(1180px, 100%)` + `padding: 38px clamp(18px, 4vw, 52px) 76px`；顶栏内边距 `clamp(18px, 5vw, 76px)`；学生页 `.public-frame` 为 `width: min(720px, 100%)` + `padding: 22px clamp(16px, 5vw, 42px) 36px`。教师页与学生页的左右内边距公式不同，是待测量的客观事实。
- **范围说明**：`stagger` / `top-stagger`（禁止错落排列）属于排列风格约束，不计入本项目的可测量基线；`section-height` / `one-section` / `screen-short` 等属于「一屏一节」节奏规则，见 S2 停用。

### B3 单一按钮 / 卡片 / 圆角 / 字号体系

- **客观判定**：一套按钮配对（`button-styles`、`button-shape`）、一种卡片样式（`card-family`、`card-layout`）、一套圆角标尺、一种链接外观（`link-styles`）；嵌套至多两层（`nesting`）；一套标题字号阶梯且字体已加载（`heading-scale`、`font-load`）。
- **既有代码事实**：`.button` 基类 + `primary` / `secondary` / `quiet` / `danger` 四个变体；`.surface` / `.panel` / `.public-panel` / `stat-block` / `assignment-row` 等多种容器；`border-radius` 共 12 种取值，`:root` 仅 `--radius: 16px` 且仅 1 处引用；h1 使用 `clamp(28px, 4vw, 40px)`，公有页 `clamp(27px, 7vw, 37px)`。以上均为既存漂移证据（见 `docs/frontend-stage-a.md` A2），本条不作是否收敛的判断。

### B4 触摸点击区

- **客观判定**：正文之外的链接 / 按钮 / 输入 / summary / tab，高度低于 44px 记为 `tap-size`；**高度低于 32px 或宽度低于 24px 且 8px 内存在另一目标时为 FAIL，否则为 WARN**；透明伪元素外扩计入，复选框按 label 盒子计；`collide` 判定文字叠压、固定栏覆盖内容。
- **既有代码事实**：`.button` `min-height: 42px`、表单控件 `min-height: 43px`、`.icon-button` 为 `36×36px`。与 44px 阈值的差额及「8px 内是否有邻近目标」只能由 D2 实测判定，本条不预判结论。

### B5 键盘焦点与标题层级

- **客观判定**：每个控件有可访问名称、图片有 alt、表单有可见 label；标题逐级递增不跳级（`heading-order`）；无 `tabindex > 0`；Tab 首先到达 skip link 且其焦点环立即可见、不被顶栏遮挡；菜单按钮说明自身状态；`lang` / `title` / `description` / share meta 齐备。
- **既有代码事实**：`:focus-visible` 为 `outline: 3px solid #438d7d` + `outline-offset: 3px`（硬编码，未入 `:root`）；输入框聚焦另有 `box-shadow: 0 0 0 3px rgb(82 141 125 / 12%)`；视图中已使用 `role="alert"` / `role="status"` / `aria-live="polite"`；`.eyebrow` 为标题上方小标签（共 14 处）。
- **判定级别提示**：`skip-link`、`share-meta` 为 WARN，不阻断；`heading-order` / `field-label` / `a11y-name` 等属 `basics` 块，其 FAIL 阻断。`lang` 取值与多语言 / RTL 需求属 T9，未获答复前不扩展判定范围。

### B6 文本对比度

- **客观判定阈值**（取自 `consistency.mjs` 第 67–68、7859 行）：纯色底上的正文文字 ≥ **7:1**；说明文字、标签、弱化行 ≥ **4.5:1**；大字号（≥24px，或 ≥18.66px 且 ≥700 字重）正文 ≥ **4.5:1**、非正文 ≥ **3:1**；`body-size` 对小于 16px 的正文仅 WARN；文字压在图片 / 效果上时按像素读取（`contrast`），纯色底才走 `text-contrast`。
- **既有代码事实**：`--ink #1b2b31`、`--muted #66777b` 于 `--canvas #f2f5f3` / `--paper #fff`；正文 14px / 400；辅助文字 11–13px。具体比值需 D2 在渲染产物上测量。
- **范围说明**：`button-contrast`（填充按钮与周围底色至少 1.3:1，否则 WARN）为 skill 自有检查，客观可测但不在 A3 指定九项内，本轮只记录不纳入判定。

### B7 `prefers-reduced-motion`

- **客观判定**：开启 reduced-motion 后所有动效静止（`reduced-motion`），且无任何内容因动效而保持隐藏（`hidden-content` 会在关闭脚本时加载页面复核；`hidden-visual`、`loop-pause` 属完整运行）；超过 5s 的循环须有暂停按钮。
- **既有代码事实**：`styles.css` 的 `@media (prefers-reduced-motion: reduce)` 将全局 `transition-duration` 设为 `.01ms!important`、`scroll-behavior: auto!important`；过渡集中在 `.15s–.16s`。
- **覆盖缺口**：`reduced-motion`、`hidden-visual`、`loop-pause` **不在 gate 默认 `--quick` 覆盖内**；D2 若只跑默认 gate，本项须列为「未检查」，不得计为通过。
- **待确认**：T9（是否要求文本放大等维度）会影响本项是否需要追加测量，未答复前不扩展。

### B8 无占位文案

- **客观判定**：不得出现占位文本、示例说明、印刷出来的 `.example` 地址（`placeholder`、`sample-label`）；`copy-lint` 的 `copy-residue`、`copy-slop-word`、`copy-stock-phrase` 及超出预算的文案套路命中记为 FAIL；表单错误须落在各自字段下（`form-fields`）。
- **保留与停用的分界**：本项**只保留「无占位 / 无残留 / 无模板套话」这一客观可测部分**。至于「h1 必须命名品类与买家」「首屏必须有硬事实」「假设内容必须标 `data-assumed`」，属营销站点文案规则，见 S5 / S6 停用；`assumed`、`open-now` 在 gate 中本就是 WARN、不阻断。
- **既有代码事实**：项目中文术语固定为「应交 / 已完成 / 未完成 / 迟交、缺交名单、分享链接、回执码、分组、目标名单、管理密钥」；`docs/api.md` 定义了错误码语义。文案是否命中 `copy-lint` 词表，须由 D2 在渲染页面上实测；`copy-lint` 无浏览器时不足 1 秒即可完成，但若页面文件与渲染页面皆不可读，则计为「未检查」而非通过（`references/gate.md` 第 53–61 行）。

### B9 hover 反馈

- **客观判定**：每个按钮、链接、可点击卡片对指针有可见响应（`hover`、`motion-layer`）；无倾斜（`tilt`）；`hover-move`、`hover-spill` 检查位移与溢出，属完整运行而非 `--quick`。
- **既有代码事实**：`.button`、`.nav-link`、`.assignment-row` 有 `.15s–.16s` 过渡；`:disabled` 为 `opacity: .55` + `cursor: wait`；当前无阴影体系、无卡片抬升、无滚动联动动效。
- **范围说明**：House rule 5 要求的「卡片抬 2px、照片缩放 1.02–1.03、卡片循环 2.5–4s」是营销站点的具体动效配方，不作为本项目测量阈值；本项只测「是否有可见响应」与「是否倾斜 / 溢出」，具体幅度不设判定。与 B7 的交集（reduced-motion 下仍需可感知反馈）由 D1 / D3 在报告与修复阶段判断，本清单不代为决定。

---

## 3. 《停用规则清单》

> 逐条写明本项目为何停用。理由对应 `docs/frontend-skill-prompts.md` 1.3 的能力限制与 0.2 / 0.3 的项目事实。
> 共同前提：本项目 6 条路由全部是 **Operate 型任务界面**，访客来完成一件事；项目**没有**「业务类型 / 卖什么 / 买给谁 / 唯一主行动 / 真实素材 / 价格 / 地址」这类 brief 输入，且 `PRODUCT.md` 已明确不存在 Logo 文件、品牌规范、真实照片、客户评价、案例数据与定价声明（1.3 输入边界）。按 C2，skill 的抽签结果不得作为决策依据；按 C5，不得为其补造资产；按 C7，公开页面不得渲染全班名单。

| 编号 | 停用的营销规则 | 对应检查 id | 停用理由（对应 1.3 能力限制） | D2 处置 |
| --- | --- | --- | --- | --- |
| S1 | hero 独占首屏 | `hero-screen`、`hero-fill`、`fold-action`、`fold-cut`、`hero-fold` | 1.3 明列「hero 独占首屏」是营销站点 house rule。本项目首屏是统计卡 / 作业列表 / 表单 / 提交区，没有可售卖对象，也没有 hero 这一页面类型；强行套用会挤掉主任务入口，且与 C3（taste-skill 营销规则整体停用）冲突。 | 不采集；若 gate 触发 FAIL，写入 waiver 并引用本行理由 |
| S2 | 一屏一节 | `section-height`、`one-section`、`one-screen`、`section-gaps`、`section-air`、`empty-area`、`screen-short`、`screen-height`、`sparse`、`fold-card` | 1.3 明列「一屏一节」为营销节奏规则；1.3 亦指出 gate 只检查渲染 DOM、不感知 Vue 路由与组件状态。任务界面的信息密度由数据量决定（名单、看板、接龙列表可长可短），按屏幕高度切分既无意义也会截断主任务。 | 不采集；触发时写 waiver |
| S3 | 真实照片 | `photo-set`、`photo-repeat`、`photo-upscale`、`photo-credit`、`visual-caption`、`caption`、`credit-wall`、`product-shown`、`no-visual`、`empty-visual` 的照片部分 | 1.3 要求「真实照片」且 house rule 6/7 要求更多更好的照片与全彩图标；本项目 `PRODUCT.md` 明确不存在真实照片与产品截图，C5 禁止新增图片资源与复制 skill 的 `assets/`，C7 禁止引入与业务无关的展示内容。 | 不采集；触发时写 waiver |
| S4 | 抽签调色板与高光时刻 | `effect-kind`、`effects-fit`、`photo-print`、`grounds`、`moment-none`、`loop-cycle`、`webgl`、`shader-lint`、`gl-fallback` | 1.3 指出该 skill 按业务类型「抽签」决定版式与配色、每页 1–2 个高光时刻，且不产出设计系统文档；本项目视觉事实以 `DESIGN.md` 为唯一基准（C2 / H2），抽签调色板、hero 类型、moments 一律不作为决策依据，Shader / WebGL 场景对任务界面无对应业务含义。 | 不采集；`moment-none` 见 S9 |
| S5 | h1 必须命名品类与买家 | `copy-headline`、`copy-headings`、`copy-buttons`、`copy-actions`、`action-count`、`copy-virtue`、`copy-two-fragment`（`copy-lint` 品类 / 买家规则） | 1.3 明列 `copy-lint` 要求「h1 命名品类与买家」，并指出这些对任务型界面不适用且会误导。本项目 h1 是页面任务名（如「班级设置」「发布作业」），没有品类与买家；C7 也要求沿用既有中文术语、不编造业务事实。 | 不采集；`copy-lint` 相关 FAIL 写 waiver 并逐条记录理由 |
| S6 | 硬事实与 `data-assumed` | `copy-fact`、`fact-agree`、`assumed`、`open-now`、`data-assumed` 标记要求 | 1.3 明列「首屏有硬事实、假设内容标 `data-assumed`」为营销文案规则。本项目首屏展示的是实时接口数据（统计、名单、状态），不是需要证明的营销主张；标注 `data-assumed` 会把真实业务数据误标为假设。`assumed` / `open-now` 在 gate 中本为 WARN、不阻断。 | 不采集；B8 仅保留「无占位 / 无残留文案」的客观部分 |
| S7 | 地址与联系方式格式 | `street-number`、`postcode`、`coordinates`、`company-number`、`phone-number`、`map-link` | 1.3 明列「地址与联系方式格式」为 house rule 9，输入 brief 需要真实地址 / 价格；本项目是校内作业收发 demo，不存在门店、地址、电话或地图，且 C7 禁止引入真实敏感学生数据等无关业务细节。 | 不采集；触发时写 waiver |
| S8 | 紫色禁令 | `SKILL.md` 第 373–374 行 Never 条目（violet / lavender 作为 accent、ground、gradient、effect colour、tint） | 1.3 明列「禁用紫色」为营销站点 house rule；它服务于 skill 自己的抽签调色板（见 S4）。本项目配色以 `DESIGN.md` 中已存在的 `--ink` / `--sea` / `--navy` 等为事实来源（C2），是否引入某颜色应由项目契约决定，而非由 skill 的配色禁令反向约束。`docs/frontend-stage-a.md` 中出现的 `#89669a` 属既存硬编码漂移，按 B3 记录、不在本条判定。 | 不采集；不因本条改动任何颜色 |
| S9 | `hero-enter` / `moment-none` 必过项 | `hero-enter`、`moment-none` | 1.3 明列「gate 把 `hero-enter` / `moment-none` 当作必须项，对后台界面属误报」；`references/gate.md` 第 66–68 行确认这两项本为 WARN，却被 gate **按 FAIL 持有**。本项目没有 hero，也不设高光时刻（S1 / S4），这两个检查无法被真实满足。 | 必须写 waiver；且注意 **waivers 超过 5 条本身即为 FAIL**，D2 需合并同因由的条目并控制数量 |

**处置总则**：以上停用项若在 D2 触发 FAIL，一律写入 `.taste-skill/waivers.json` 并逐条给出理由（H4 报告须区分「真实缺陷」与「营销规则误报」）。按 1.3 与 C5，不得修改 skill 自带 kit、不得规避检查、不得为通过 gate 而反向改造业务界面（例如新增 hero、照片、抽签配色或高光时刻）。

---

## 4. 本基线不采集的检查（及理由）

以下项目虽客观可测或带确定结论，但不属于 A3 指定的九项，或其判定隐含营销 / 风格前提，故本轮**只记录存在，不纳入 D2 的通过判定**：

- `perf.mjs` 的 image weight / contexts / layout shift（Checklist「Fast」）：属性能维度，且本项目无图片资产与 WebGL 上下文；C4 下性能由项目既有验证命令与 `impeccable audit` 分别负责。
- `section-height` / `rhythm` 系列、`stagger` / `top-stagger` / `centre-axis` / `split-align`：排列节奏与风格约束，见 S2。
- `kit-edited` / `checker-gaming` / `gaming-suspect`：针对 skill 自带 kit 的完整性检查；本项目不复制 kit（C5），这两项无对应检查对象，且不可豁免。
- `button-contrast`、`body-size`（<16px 正文）：客观可测但为 WARN 级 / 非 A3 指定项；B6 已记录其存在。
- `forms` / `form-send` / `links`：涉及真实提交与跳转，属 C1 数据边界用例与项目测试的范围，且 `forms` 不在 gate `--quick` 覆盖内。

---

## 5. H1 交接与 D2 使用口径

- **H1 交接判定**：本文件只含可客观测量项（第 2 节），并已逐条列出停用的营销规则及理由（第 3 节），满足 H1 的交接条件；B1 / B3 / C1 与 D2 共用本清单的同一口径。
- **H2 优先**：一致性基准仍是 `DESIGN.md`；与 `docs/api.md` 冲突时以后者与 `docs/handoff-prompt.md` 优先。本文件不覆盖、不修订设计契约。
- **D2 输入**：须有 H3 交接的最新构建产物（dev server URL 或构建页面 + root；用构建产物时每次 gate 前必须重新构建）；本文件；`DESIGN.md`；以及 T10 确认后的浏览器环境。
- **D2 输出要求**：报告首行 `GATE:` 状态；列出全部开放 FAIL、全部 waiver（含理由）与**未能检查项**；明确区分真实缺陷与营销规则误报；对第 1.2 节指出的 `--quick` 覆盖缺口（B7、B9 部分）按「未检查」记录，不得宣称通过。
- **环境未确认时**：若 T10 未答复或本机无可用 Chrome / Edge / Chromium，按 A3 / D2 要求据实记录 `GATE` 状态与未检查项，不得宣称通过；`GATE: ERROR` / `OFF` 时不得重跑。
- **写入边界**：D2 只写 `.taste-skill/` 下的检查产物，`apps/web` 零改动；本 A3 阶段未创建也未写入 `.taste-skill/`。

---

## 6. 待确认项对本文档的影响

| 编号 | 影响 | 未答复时的处理 |
| --- | --- | --- |
| T6 | 设备 / 断点优先级、320px 是否必测、是否指定机型 | 只记录 skill 内置固定档位（1.1），不指定任何档位为「必测」；B1 / B4 的优先级留空 |
| T9 | 多语言 / RTL / 深色模式 / 文本放大 | B5 的 `lang` 范围、B7 的追加测量不扩展；深色模式不进入 B6 对比度判定 |
| T10 | 浏览器与 gate 运行方式 | 不运行 gate，不预设 dev server URL 或 root；D2 据实记录未检查项 |
| T7 | 是否允许新增依赖 / 资源 | 本文件按 C5「否」处理，不因停用规则而要求补图、补字体或补动效库 |
| T5 | 既有配色 / 字体 / 「收」是否升格为品牌承诺 | 本文件只引用 `DESIGN.md` 中的既存数值，不作方向判断 |
| T12 | 提交与推送策略 | 本文件为未跟踪的设计产物，不提交、不推送，留工作区供确认 |

---

## 7. A3 完成标准自检

| 完成标准（A3 提示词） | 现状 |
| --- | --- |
| 清单只含可客观测量项，不含任何视觉方向建议 | 第 2 节九项均为可测项；方向性判断统一归入 S1–S9 停用或 T5 / T6 待确认 |
| 停用理由逐条对应 1.3 的能力限制 | 第 3 节 S1–S9 逐条注明对应的 1.3 条目与 `references/gate.md` 依据 |
| `apps/web` 与 `.taste-skill/` 均零改动 | 未修改任何页面文件；未运行 gate；未创建 `.taste-skill/`；未复制 skill 的 `assets/` |
| 不运行 gate | 未运行 |
| 产出交 H1、作为 D2 唯一验收口径 | 第 5 节给出交接与处置口径 |
