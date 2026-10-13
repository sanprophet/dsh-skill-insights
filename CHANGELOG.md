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
