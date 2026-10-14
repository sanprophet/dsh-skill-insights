# Changelog

## 0.1.2

修掉"所有技能都显示已卸载"，并按设计系统重做面板。

### 修复：技能目录读错了层

`ctx.skills.snapshot()` 只读**全局层**，而技能注册表是**按 agent-preset 作用域分层**的 —— 从本机技能根目录
发现技能的 `dsh-skill-filesystem` 注册在 preset 层，不在全局层。于是本机装的每一个技能都被判成"不在目录
里"：`archify` / `markitdown` / `ponytail` / `text-polisher` / `writing-for-agents` 全部被标成"已卸载"，
来源显示 `—`，而"可用技能"只剩下 4 个内置的。

主来源改成 `ctx.sessionSkillCatalog.list({ sessionId }, signal)` —— 由 `@deepseek-ai/dsh-api-session-controller`
注册的服务（即 `skills/list` Remote 的后端）。它按 `sessionId` 解析该会话的 preset 作用域，且文档明确
"without activating a cold Agent"，因此 host 侧插件不必唤起冷 Agent 就能看到这些技能。全局读保留为第二遍：
它是唯一带真实 `source` / `provider` 元数据的来源，用于给同名条目补齐元数据。

`ctx.get('sessionSkillCatalog')` 在服务缺失时返回 `undefined`（不传 `strict`），正好用作可选读取，因此插件
仍然不硬声明 `inject`。

- `check-host.mjs` 的夹具重写成**能复现该 bug 的形状**：全局层只返回 `office-docx`，本机技能只出现在
  session 作用域目录里。`ponytail.cataloged === true` 这条断言就是回归测试。
- 单个会话的目录解析失败只计数、不中断扫描；两个来源都不可用时 `catalogComplete: false`，面板据此显示
  警告，而不是把用过的技能一律标成"已卸载"。

### 面板重做

依据 `ui-ux-pro-max` 的设计系统查询及其**可核实**的 UX / 图表条目重做，详见 `DESIGN.md` §11。要点：

- 行高节奏：描述固定单行省略并**预留行高**，有描述和无描述的行不再参差 —— 这是旧面板最难看的地方。
- 表头 `position: sticky`；表格不再加横向滚动容器（那会劫持 sticky 轴），改为窄屏隐藏低优先级列。
- 调用次数列加了占位条；所有数字用等宽字体 + `tabular-nums`。
- 30 天趋势：活动天数 < 4 时不再画 30 根几乎全空的柱子，改显示"3 天"；活动天数 >= 4 才画柱，并带
  `aria-label`。依据是图表指南中"少于 4 个数据点应改用统计卡"与"不要只靠颜色传达信息"。
- 边框从 `1px` 改成 `0.5px` 细线、hover 改用 `--dsw-alias-interactive-bg-hover` —— 与 DSH 自身设计语言一致。
- 字号收敛为五级固定阶；修掉搜索框 `outline: none` 抹掉焦点环的可访问性缺陷。
- KPI 从四张独立卡片改成一条带竖分隔线的整条，右边缘与表格对齐。
- 页脚压成一行，长说明收进「统计口径」折叠项。
- 搜索框宽度受控；新增 `prefers-reduced-motion` 保护。
- **强调色改用 `--dsw-alias-state-business-primary`**：`--dsw-alias-brand-primary` 在默认主题里解析为
  `#0f1115`，也就是正文色本身，拿它当强调色等于没有强调。侧栏图标选中时现在会变成 DeepSeek 蓝；
  面板内的焦点环、占比条、趋势柱也统一走同一个 token。（`dsh-client-ui-theme` 里 13 个有彩色值的 alias
  中，`state-business-primary = #4176e6` 正是 DSH 自己用于焦点环与选中强调的那一个。）

### 表格塌成一列（严重）

`table-layout` 默认是 `auto`。此时 `white-space: nowrap` 的描述文字会成为单元格的 **min-content
宽度**，`width: 50%` 被静默忽略 —— 第一列吞掉整张表，其余六列被完全挤出视口，看上去就是"表格只有
一列、文字冲出卡片"。同时 `max-width: 100%` 在 auto 布局下是循环依赖（元素宽度取决于 `td`，而 `td`
宽度又取决于内容），所以 `overflow: hidden` 和 `text-overflow: ellipsis` 都形同虚设。

修复：`table-layout: fixed` + 显式列宽（fixed 布局只从表头行读取宽度，因此必须写在 `th` 上）。
另外给描述加 `title`，让截断不损失信息 —— UX 规范里"截断"只是 Medium 级，但"区分性文字必须能读到
全文"是 Critical 级。`check-client.mjs` 增加了这三条声明的断言，防止再次静默退化。

### 按参考设计重做（第四轮）

参考图不是风格板，而是一份**技能管理器**的设计稿（顶部统计区 + 状态页签 + 筛选行 + 表格）。按图重做，
并明确**不实现停用功能**。

**参考图里有一件事我们做不了，因此没做。** 那张图的核心能力是"停用技能"，但 DSH 没有这个 API：
`SkillRegistry`（`dsh-skill`）只暴露 `list()` / `snapshot()` / `get()` / `register()` / `registerProvider()`，
`SessionSkillCatalog`（`dsh-api-session-controller`）只暴露 `list(request, signal)`；而
`SkillInvocationPolicy`（`modelInvocable` / `userInvocable`）是 provider 从技能自身 frontmatter 解析出来的
**结果**，不是运行时可写的状态。唯一的停用路径是改写每个技能自己的 `SKILL.md` frontmatter —— 那是通过
非受支持路径改用户的技能库。所以**状态开关列、已停用计数都没做**；跟着一起砍掉的是多选复选框，因为复选框
存在的唯一理由就是驱动一个不存在的批量停用。

- **画布改回 `--dsw-static-neutral-bluish-50`（#f9fafb）。** 上一轮用了 `neutral-bluish-100`（#ebeef2），
  因为取色时把**演示文稿的背景**当成了应用页面（参考图是一页 PPT 截图）。实测应用区域是
  `rgb(247,248,250)`（≈ `#f7f8fa`）。这是一次方法论错误：采样前没有区分"幻灯片"和"界面"。
- **卡片分隔从阴影改为可见描边**（`border-l1` → `border-l2`，10% 黑）。参考图靠一条看得见的细线分隔白卡，
  不靠投影；在这么浅的画布上 4% 的边框会消失，页面重新变平。
- **统计卡改成三张独立卡片**（有间隙），不是一张卡用分隔线切开 —— 参考图就是这么画的，窄屏折行时每格也能
  各自保持完整表面。三格是一个划分：`可用技能 = 用过的技能 + 从未使用`，值得动手的那格用警告色。
- **状态页签带计数**（`全部 80` / `使用过 8` / `从未使用 72`）替换"显示未使用的技能"复选框。复选框只能说
  是/否，而真正的问题是"我现在在看哪一堆"；计数让你在点击之前就知道每堆多大。选中态是**实心反色**而不是
  强调蓝 —— 蓝色已经是下面每一根占比条的颜色，蓝色页签会和它们抢。
- **筛选行**：搜索 + 来源 + 使用时间。两个下拉原本都显示"全部"（维度藏在只有屏幕阅读器看得到的
  `aria-label` 里），现在每个选项自带维度名（`来源：全部` / `使用时间：全部`）。
- **表格 7 列 → 4 列**：技能 / 使用次数 / 最近使用 / 来源。模型·用户拆分与会话数移进调用次数的 `title`；
  它们回答的是追问，不是第一眼的问题。这也顺带解决了评审提出的认知负荷问题（7 列 / 每行 8 个事实）。
- **删掉 30 天趋势列。** 它只在活动天数 ≥ 4 时才画柱，而本机每个用过的技能都只有 1–2 天 —— 也就是说它
  从来没画过图，只是占 10% 宽度打印一个天数。
- **按钮改实心深色**（`label-primary` 底 + `bg-base` 字），与选中页签用同一对颜色。
- **行密度与字重**：描述不再单独占一行，改为整行的悬停文本，一屏可见从 ~10 行涨到 ~16 行；描述同时保留在
  无障碍树（`.ui-sr`）和搜索范围内，只是不再被印出来。技能名从 12px/500 升到 13px/600 等宽 —— 之前它比
  旁边的调用次数（14px/600）更细更小，于是每行的**主键**成了全行最轻的元素。

`check-client.mjs` 相应更新：断言页签计数、筛选器、占比条轨道、`.ui-sr`，并**反向断言**旧的复选框、
迷你趋势图和拆分列不会回来。

### 按参考设计重做（第三轮）

用户给了一张设计参考图（浅色仪表盘：冷灰底 + 白卡 + 藏青字 + 蓝强调）。程序化取色后定位到毛坯感的真正根源：

- **浅色主题下 `bg-base` 与 `bg-layer-1` 是同一个纯白。** 页面底和卡片底毫无区分，唯一的分隔是 0.5px
  边框 —— 所以怎么调间距都是平的。深色反而有分层（#151517 vs #232324），这就是深色一直看着还行的原因。
  画布改用 DSH 自己的 `--dsw-static-neutral-bluish-100`，并且**只**通过
  `body:not([data-ds-dark-theme])` 挂载：宿主将来若改名，最坏结果只是失去这层灰，而不是把浅灰刷到深色上。
  （**第四轮已修正**：该色号取自演示文稿背景而非应用页面，偏深约三倍，现已改为 `neutral-bluish-50`。）
- 卡片加宿主自己的阴影 token `--dsw-shadow-lv1`（有偏移有虚化，不是零偏移装饰光环），边框保留。
  （**第四轮已撤回**：参考图靠可见描边分隔白卡，不靠投影。）
- **警告 token 修正。** `.ui-badge-warn` 与 `.ui-warn` 用的 `--dsw-alias-state-warning-primary` 在主题里
  不存在（真实名字是 `--dsw-alias-state-warn-primary`，amber-500），两处都静默走了中性 fallback：
  已卸载徽章因此和中性徽章无法区分，目录不完整横幅也没有警告色。`check-client.mjs` 现在双向断言，
  防止再犯。
- **`最近使用` 改为相对时间**（"今天" / "3 天前"），绝对时间戳保留在 `title`。原绝对形式需要 ~104px，
  而侧栏展开时该列只有 98px，必然压到邻列；相对形式只要 26px，且该格不再 `nowrap` —— 放不下时折行是
  正确的失败，压到邻列不是。
- **浅色对比度**：列头 / 描述 / 来源 / KPI 标签与副行从 tertiary（3.71:1）升到 secondary（5.8:1）。
  footer 与「统计口径」也升 —— 它们记录溯源信息，在灰画布上只有 3.18:1。
- **调用次数 升为 14px/600**，其余数字列 13px。它是回答面板存在理由的那一列，字号应该最大。
- **补齐浏览器自带表面**：`::selection`（`@supports (color-mix)` 下用 token 调 24% 淡蓝，否则退回实色
  强调色）、`caret-color`、细滚动条、下划线偏移。
- **撤回一条评审结论**：评审认为应以「从未使用 72」打头。用户指出 DSH 刚装、72 个没用过是正常状态 ——
  那是把启动期误读成了洞察。该建议不仅优先级低，而且会误导，已弃。

### 密度与层次

第二轮的观感问题不是 bug，是**权重分配**：

- **零值 KPI 不再占位。** `已卸载 / 未知 → 0` 用掉 1/4 画幅去报告"什么都没发生"，是全页最空的一格。
  现在为零时不渲染，有值时以警告色出现 —— 面板只在真该出声时出声。KPI 条因此从固定 4 列 grid 改为
  flex，格子数变化时仍能均分。
- 数字 28px → 22px；格子内边距 14/15px → 11/12px；「标签 → 数字 → 说明」三段间距 8px → 4/5px。
- 标题区下边距 22px → 14px，KPI 条到卡片 16px → 12px，卡片内边距同步收紧。整页纵向少约 60px。
- 表格行内边距 9px → 7px，表头 8px → 6px。
- **占比条 `.16` → `.26`。** 4 次调用和 1 次调用的行原本视觉重量完全相同，这一列没有承担起"哪个技能
  重要"的职责。
- **`来源` 列不再显示 `—`。** 空值实际表示"从本机技能根目录发现"，但和 `已卸载` 徽章的"未知"读起来
  是同一件事。现在 `bundled → 内置`、空值 / `user-agents → 本机`；无法识别的来源保留原始值，不做猜测。

### 侧栏图标

侧栏条目的图标原来只跟随 `currentColor`：宿主只在**展开**时把 `color` 从 `label-secondary` 换成
`label-primary`，而**折叠成窄轨**时会 `.collapsed .panelRow { color: var(--dsw-alias-label-primary) }`
—— 该规则在样式表里更靠后、权重相同，于是覆盖掉 `panelActive`，导致窄轨下所有行同色，图标无论选中与否
都长一样。现在选中态显式取强调色，两种形态下都能区分。

## 0.1.1

修复"面板恒为 0"——0.1.0 的首扫实际上从未成功过。

- `ctx.sessionQuery` / `ctx.skills` 改为经 `ctx.inject(['sessionQuery', 'skills'], …)` 取得一个声明过这两个
  服务的子上下文再读。0.1.0 里插件 `inject = []` 却裸读这两个服务，cordis 会抛
  `cannot get property "…" without inject`（不是返回 `undefined`），异常被自身的 catch 吞掉，于是
  `<DSH_HOME>/skill-insights/state.json` 从未写出，`GET /skill-insights/summary` 一直返回
  `generatedAt: 0` 的空快照。插件仍然不硬声明 `inject`，缺服务时照旧挂载并显示空面板。
- `check-host.mjs`：缓存文件改为轮询等待。`scan()` 先发布内存快照、后落盘，判断"首扫完成"之后直接读文件
  会撞上竞态，只留下一个 `state.json.tmp`。
- 侧栏图标与插件图标换成四角星（skill）+ 小伴星，不再与兄弟插件的柱状图混淆。

## 0.1.0

首个发布。

- 扫描本机全部会话日志，统计每个 skill 的调用次数（模型通过 `skill` 工具加载 + 用户 `/技能名` 显式注入），
  数据经 `ctx.sessionQuery.readSession()` 读取，不自行解压 zstd。
- 技能目录取各工作区 `ctx.skills.snapshot()` 的并集，因此项目级 skill 也能列出。
- 每轮从头重算整张计数表（无增量、无水位），并缓存上次快照以便重启后立刻出画面。
- 面板：KPI、按调用次数排序的表格、筛选框、「显示未使用的技能」开关、30 天趋势、`tracked` 状态行。
- 三个零依赖检查：`node index.js`（计数逻辑）、`node check-host.mjs`（host 集成）、`node check-client.mjs`（客户端加载与渲染）。
### DSH 版本兼容

`package.json` 的 `engines.dsh` 声明最低支持版本；下表记录**实际验证过**的版本。注意 `dsh` 清单的官方 schema
（`@deepseek-ai/dsh-package-manifest`）只读 `bundle` / `profile` / `client`，`engines.dsh` 是社区约定、不是启动器校验的字段。

| 插件版本 | 验证于 dsh 版本 | 备注 |
|---|---|---|
| 0.1.0 | 0.1.5-rc.2 | 初始版本；`ctx.skills.snapshot()` / `ctx.sessionQuery.readSession()` / `ctx.webServer.register` 均在该版本可用 |
