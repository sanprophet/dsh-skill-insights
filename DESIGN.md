# dsh-skill-insights — 设计

列出本机所有 skill，并统计每个 skill 的调用量。只读本机数据，走 DSH 自己的回环 Web 服务，不额外开端口、不联网。

**已确认的前提**：`C:\Users\CSYANGA\Desktop\dsh-usage-insights` 是你已经跑通的同构插件（token 用量），本设计完全复用它验证过的四个模式：单文件 host 插件 + 手写 client bundle + `webServer.register` 同源路由 + `package.json` 的 `dsh.bundle` / `dsh.client`。新插件是它的兄弟，不是新架构。

---

## 0. 现状调研（2026-10-13）

社区已经有人做了同一件事 —— **但恰好不兼容你这台机器**。这个结论直接决定了"要不要自己写"。

本机 DSH 版本：`D:\software\deepseek-harness\package.json` 声明 `@deepseek-ai/dsh: ^0.1.5-rc.2`，实装 `0.1.5-rc.2`。

| 插件 | 定位 | 版本要求 | 你的 0.1.5-rc.2 |
|---|---|---|---|
| **`dsh-skill-hub`** | **每个 skill 的调用次数 + 最近使用时间**（读会话日志），另有目录浏览/启停/市场/诊断/脚手架 | `>=0.1.7-alpha.1 <0.3` | ❌ 老于下限，**完全不加载** |
| `@michengai/dsh-skills-manager` | 目录管理、导入导出、启停 | peerDeps 显式列出 `0.1.5-rc.2` | ✅ 可装，**但无用量统计** |
| `@linxin666/dsh-client-ui-skill-explorer` | 按来源浏览 skill、启停、增删 | `>=0.2.0-rc.2` | ❌ |
| `@weibaohui/skills-management` | 技能市场 + **注入开销统计**（≈token/字符，非调用次数） | `>=0.1.7-rc.2` | ❌ |

三条结论：

1. **"每个 skill 被调用了多少次"这个功能，社区只有 `dsh-skill-hub` 做了**（它的 README 明写 *Stats — per-skill call counts + last-used times from session logs (incremental cache)*，路由 `/api/skill-hub/stats`）。
2. **它要求 DSH ≥ 0.1.7-alpha.1，你是 0.1.5-rc.2，不满足。** 它的 README 明确说过："On dsh older than 0.1.7-alpha.1 this plugin does not load at all (the settings API it targets does not exist there)"。
3. 兼容你版本的 `@michengai/dsh-skills-manager` 只做目录管理，**没有用量统计**。所以在你的版本区间里，这个功能确实是空的。

**它同时验证了本设计的技术路线**：`dsh-skill-hub` 的 host 侧只用 `ctx.skills.snapshot/get` + `ctx.webServer.register`，用量来自会话日志，路由全是回环。和下面第 2、3 节独立推导出的方案一致 —— 说明这套 API 是这条路线的正解，不是绕路。

**先想清楚再动手**：如果升级 DSH 到 ≥0.1.7 是可接受的，那就直接 `dsh plugin --profile desktop add dsh-skill-hub`，零代码。本设计只在"不想动 DSH 版本"或"只想要那一列调用次数、不要一整套技能市场"时才划算。

从 `dsh-skill-hub` 抄一条经验（它的 README 明写）：**不要用同一个 `DSH_HOME` + cwd 起两个 `dsh web` —— 没有会话日志锁，会造成 `seq gap` 损坏。**

---

## 1. 目标与验收

| 目标 | 验收方式 |
|---|---|
| 列出当前可用 skill | 面板出现全部 skill 名（含从未调用的），数量与系统提示里的 skill 目录一致 |
| 统计每个 skill 调用量 | 数字可由会话日志独立复算；同一 skill 的模型调用与用户 `/skill` 调用都计入 |
| 历史可用 | 插件装好前发生的调用也能统计出来（回溯扫描） |
| 只读 | 不写 skills 目录、不写会话日志；唯一写盘是插件自己的缓存 |

非目标（明确不做）：跨机器/团队聚合、token 成本分摊、skill 内容预览、在线安装卸载 skill。

---

## 2. 数据来源（全部已核实）

### 2.1 有哪些 skill

`ctx.skills.list(options)` → `SkillSummary[]`

- 服务键 `ctx.skills`，来自 `@deepseek-ai/dsh-skill`（`lib/types/index.d.ts:268`），已在 profile 根层挂载（`profiles/desktop/cordis.yml` 里 `id: skill`）。
- `SkillSummary` 字段：`name` / `description` / `whenToUse?` / `invocation.modelInvocable` / `invocation.userInvocable` / `source` / `provider`。
- `source` 是 prompt 可见的来源桶，直接拿来当"来源"列：`user-agents`（即 `C:\Users\CSYANGA\.agents\skills`）、`project-dsh`、`project-agents`、`bundled`、`custom`、`runtime`。
- 想要"发现是否完整"用 `ctx.skills.snapshot(options)` → `{ skills, complete }`，`complete === false` 时面板显示"目录可能不完整"，不要静默吞掉。

**cwd 敏感是这里唯一的坑**：`list()` 接受 `cwd`，项目级 skill 随工作目录变化。host 插件的 `process.cwd()` 是应用目录，不是工作区。做法：

1. 先扫一遍会话（见 2.2），从每个 `SessionHeader.cwd` 收集出去重后的 workspace 列表；
2. 对每个 cwd 调一次 `list({ cwd })`，按 `name` 求并集，记下每个 skill 出现在哪些 cwd；
3. 用户级 skill（`user-agents`）在所有 cwd 下都一样，自然去重；项目级 skill 只有匹配的 cwd 才有。

### 2.2 用了多少次

两条调用路径，都落在会话日志里：

**路径 A — 模型调用。** `skill` 工具由 `@deepseek-ai/dsh-tool-skill` 注册（`lib/index.js:167`），会话日志里留下一条 `tool/call` 事件：

```
{ turn, step, callId, name: 'skill', arguments: '<原始 JSON 字符串>' }
```

定义见 `@deepseek-ai/dsh-session/lib/types/types.d.ts:333`。注意 `arguments` 是**未解析的字符串**，必须 `JSON.parse` 后取 `.name`。

**路径 B — 用户显式调用（`/skill-name`）。** 由同一个包的 `agent/pre-step` 钩子注入（`lib/index.js:168-202`），注入的消息带 source：

```
{ kind: 'skill-invocation', name, form: 'instructions' }
```

它作为 `user/message` 事件持久化（`dsh-session/lib/types/types.d.ts:281` 的 `'user/message': UserMessage`；`UserMessage.source: MessageSource` 见 `@deepseek-ai/dsh-llm/lib/types/message.d.ts:94,118,131`）。所以扫描条件：

```
event.type === 'user/message' && event.data.source?.kind === 'skill-invocation'
  → event.data.source.name
```

**读取会话的 API**（`ctx.sessionQuery`，`@deepseek-ai/dsh-session-query/lib/types/index.d.ts`）：

| 调用 | 用途 |
|---|---|
| `listSessions(signal?)` → `SessionRecord[]` | 全量会话，newest-first。`record.header` 是 `SessionHeader`（含 `createdAt`、`cwd`、`id`） |
| `readSession(id)` → `{ session, events }` | 一个会话的完整原始事件流。**不用自己解 zstd** —— 解压/校验都在 persistence 后端里 |

`readSession` 明确是"backend-independent concrete behavior"，不依赖全文索引，因此 `session-query-sqlite` 配成 `openAt: never` 也不影响它。这条是整个设计成立的关键：**不需要手工解 zstd，也不需要重新发明日志格式。**

### 2.3 为什么不用 `tools/result` 事件做实时计数

`ctx.on('tools/result', ...)`（`@deepseek-ai/dsh-tools/lib/types/index.d.ts:83`）确实是模型调用路径的干净观测点，但只用它会有三个缺口：用户 `/skill` 调用根本不经过工具、装插件前的历史全是空的、两套计数逻辑要各自去重。所以**统一走日志扫描**，一个数据源、一套逻辑。实时性靠缩短扫描间隔解决，不靠事件。

---

## 3. 核心决策：全量重算，不做增量

每次扫描**从零重算整张计数表并整体替换**，不累加 delta。

`dsh-usage-insights` 的复杂度几乎全在增量上：首次见到计整天、之后只记增量、倒退要 clamp 再 rebase、日桶还要 prune（它的 `index.js:235-286`）。那是因为 token 总量只有 DSH 内部才知道，过去的部分无法复现。

skill 调用不一样：**日志是完整的、可重放的、幂等的**。重算一遍就得到正确答案，于是上面那一整类 bug（负增量、重复计数、跨重启漂移）直接不存在。代价是每次扫全部日志，用一条 `ponytail:` 注释标出上限和升级路径即可：

```js
// ponytail: 每次全量重扫；当前 21 个会话 / 约 6MB(压缩) 无感。
// 若会话量涨到扫描超时，改用 SessionObservation.cursor 做会话级水位，只读尾部增量。
```

持久化只剩一个用途：`<DSH_HOME>/skill-insights/state.json` 存上次结果，让面板重启后立刻有内容，而不是空白等首扫。它**不是真相来源**，删掉不影响正确性。

---

## 4. 计数规则（唯一定义真相的地方）

纯函数 `countSkills(events)`，输入一个会话的事件数组，输出该会话的计数。

1. **失败不算用量。** `tool/result` 事件带 `data.error` 时，记下它的 `callId`（`dsh-session/lib/types/types.d.ts:351-361`）。若某次 `skill` 调用拿到过失败的 result，说明 skill 没真正加载（`dsh-tool-skill/lib/index.js:139-150` 的三种 throw），不计入。做法：先收集失败 `callId` 集合，再排除。
2. **路径 A**：`tool/call` 且 `name === 'skill'` 且 `callId` 不在失败集合 → `JSON.parse(arguments).name`。解析失败或没有 `name` → 计入 `malformed` 计数，不静默丢弃。
3. **路径 B**：`user/message` 且 `source.kind === 'skill-invocation'` → `source.name`。
4. **名字可能已经不存在**：历史调用过、现在已删除或改名的 skill，单独归入"已卸载 / 未知"分组，不合并进某个现存 skill，也不丢掉计数。
5. 每个 skill 累积：`calls`（总）、`byKind: {model, user}`、`sessions`（去重会话数）、`firstUsedAt`、`lastUsedAt`、`byDay`（`YYYY-MM-DD` → 次数，本地时区，用于迷你趋势条）。

---

## 5. 文件与职责

新目录 `C:\Users\CSYANGA\Desktop\dsh-skill-insights\`，与兄弟插件同名同构。

```
package.json          dsh.bundle.patch + dsh.client{platform:web, immediately:true}
cordis.patch.yml      insert 一行插件，config 与扫描间隔
index.js              host：扫描器 + 路由（唯一有逻辑的文件）
client.js             手写浏览器 bundle：侧栏项 + 主面板
locale/zh.json        `package.json.meta` 的翻译覆盖（**用途未经验证**，见下）
locale/en.json
icon.svg              四角星（skill）+ 小伴星，与兄弟插件的柱状图区分
README.md             配置项与已知限制
DESIGN.md             本文件
```

### 5.1 `index.js`

```js
export const name = 'skill-insights'
export const inject = []
```

插件本身不硬声明数据依赖，缺服务时仍然挂载、面板照常打开——沿用兄弟插件的写法（它的 `index.js:424`）。

但**扫描器不能裸读 `ctx.sessionQuery` / `ctx.skills`**。cordis 里读一个本上下文未声明的服务是**抛异常**
（`cannot get property "sessionQuery" without inject`），不是返回 `undefined`；异常又会被扫描器自己的
catch 吞掉，于是首扫必失败、`state.json` 永不写出、接口恒返回 `generatedAt: 0` 的空快照——0.1.0 的真实故障，
面板上只表现为"什么都是 0"。

正确写法是让扫描器借一个**声明过这两个服务**的子上下文：

```js
ctx.inject(['sessionQuery', 'skills'], (dataCtx) => {
  dataCtx.effect(() => { /* mkdir → loadCache → scan(dataCtx) → setInterval */ }, 'skill-insights: scanner')
})
```

这样两个目的同时满足：缺服务时插件仍挂载（回调不触发，面板是空的而不是消失），有服务时读取合法。
`scan()` 及其两个 scanner 都以这个 `dataCtx` 为参数，不再闭包捕获插件自身的 `ctx`。

- 启动：`mkdir` 数据目录 → 读缓存（`loadCache`，坏了就当作空）→ 立刻首扫 → 起 `setInterval`。
- 扫描器 `scan(dataCtx)`：
  - `const records = await dataCtx.sessionQuery.listSessions()`；一个会话读失败 → `failed += 1` 后 `continue`，绝不让整轮扫描抛出去。
  - 对每个 `record.header.id` 调 `readSession(id)`，`countSkills(events)` 累加到总会话表。
  - 目录：按 2.1 的 cwd 并集调 `dataCtx.skills.snapshot({ cwd })`。
  - 组装 `{ generatedAt, catalog, usage, uninstalled, totals, tracked }` 整体替换内存快照，然后异步写缓存。
    **先发布、后落盘**，所以任何"看到 `generatedAt > 0` 就断言缓存文件已存在"的调用方都要轮询文件，而不是假设 rename 已经完成。
  - 定时器的异步 tick 必须吞掉自身异常（`void scan(dataCtx).catch(() => {})`）——timer 回调 reject 会杀掉整个应用，这点兄弟插件的注释已经写明。
- 路由：`GET /skill-insights/summary`，同源、回环、`cache-control: no-store`。返回上面那个快照，含 `catalog`（全量 skill 目录）与 `usage`（按 `calls` 降序）两份，客户端做合并。
- 配置：`scanIntervalSeconds`（默认 300，范围 10–3600）、`includeUserInvocations`（默认 true）、`includeFailedCalls`（默认 false）。

### 5.2 `client.js`

复制兄弟插件的壳：`window.__ModuleLoader__.load({ id, factory(require) })`，只从模块表要 `react`，无构建步骤，样式只用 `--dsw-alias-*` 主题变量，数据取自 `fetch('/skill-insights/summary')`。

挂载点（兄弟插件 `client.js:687-700` 已验证可用）：

```js
const inject = ['slots', 'locale']
ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-insights: dictionaries')
ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, ... }, SkillPage))
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
  { name: 'sidebar.panellist', id: PANEL_ID, order: 13, label: () => t('panel') }, ...))
```

面板内容：一张表 —— **技能 | 来源 | 调用次数 | 模型/用户 | 会话数 | 最近使用 | 趋势**。默认按次数降序；顶部一个过滤框；一个开关显示"从未使用"的目录内 skill（默认关，否则 70 多个 skill 里绝大多数是 0，噪声压过信号）；底部一行 `tracked`（扫描了 N 个会话、失败 M、扫描时间），让"数字不对"一眼能看出是扫描没跑完。

`order: 13`（兄弟插件用 12）避免侧栏顺序冲突。

### 5.3 安装接线

和兄弟插件完全一样，改 `D:\software\deepseek-harness-data\profiles\desktop\package.json`：

```json
"dependencies": { "dsh-skill-insights": "link:C:/Users/CSYANGA/Desktop/dsh-skill-insights" },
"dsh": { "profile": { "bundles": [ ..., "dsh-skill-insights" ] } }
```

然后重启 DSH。

---

## 6. 边界与失败模式

| 情况 | 行为 |
|---|---|
| 会话日志损坏 / 读不出 | 跳过该会话，`tracked.failed++`，面板可见；不中断扫描 |
| 实时会话正在跑 | `readSession` 是时间点切片，下轮重算自动补齐；因为重算，不会重复计数 |
| 会话被删除 | 其历史调用随之消失。当前接受（重算模型的固有代价）；若要永久保留，加一份只增不减的 lifetime 高水位表 |
| skill 改名/删除 | 归入"已卸载/未知"分组 |
| `ctx.skills.snapshot` 报 `complete:false` | 面板提示目录可能不完整 |
| 某 composition 没有 `sessionQuery` | 插件不挂载该路由（守卫），日志里 warn 一行，不崩 |
| `tool/call` 的 `arguments` 不是合法 JSON | 计入 `malformed`，不猜 |

---

## 7. 验证

1. **单元级**：`countSkills` 是纯函数，配一个 `demo()` 自检 —— 构造三段事件（模型成功调用 X、用户 `/X` 注入、失败调用 Y），断言表里 X 为 2、Y 为 0、`malformed` 为 0。不需要起 harness。
2. **接口级**：重启后 `curl http://127.0.0.1:19387/skill-insights/summary`，确认 `catalog.length` 与系统提示里的 skill 数一致，`totals.sessions > 0`。
3. **交叉核对**：手动数一个最近用过的 skill（例如本会话的 `ponytail`）在日志里的 `tool/call` 次数，与面板数字对齐。
4. **回归**：确认兄弟插件的 `/usage-insights/summary` 面板不受影响。

---

## 8. 明确留给以后的决定

- **不实时**：默认 5 分钟延迟。要秒级就把扫描间隔调到 10s，或补一个 `tools/result` 监听器只做"立刻刷新面板"，不动计数逻辑。
- **不做单 skill 明细下钻**（哪个会话、哪一轮用的）。`readSession` 已经带 `turn`/`step`，加起来不难，但先不做。
- **不持久化历史**：会话删了计数就没了。等真出现"删会话导致数字掉下来"的困扰，再加 lifetime 表。
- **图标/README 先最简**：先让面板跑起来，视觉打磨放最后。

---

## 9. 实现记录：与设计的差异

已按本设计实现并接线完成。实际落地时改了四处，都偏向更小的实现：

| 设计稿 | 实际 | 原因 |
|---|---|---|
| 配对 `tool/result` 的 `callId`，排除失败调用 | **统计全部尝试** | 配对要读进 `ToolResultMessage` 的内容块才拿得到 `callId`；而"尝试调用一个已改名的 skill"恰恰是要暴露的信号，它落在「已卸载 / 未知」栏里 |
| `byDay: { 'YYYY-MM-DD': n }` 字典 | `trend: number[]`，长度 30 | 面板只需要一根迷你柱，不需要日期键；数组直接把载荷压到 30 个数字 |
| 配置项 `includeFailedCalls` | 删除，改为 `includeUserInvocations` | 不区分失败就不需要前者 |
| 只有 `index.js` 一个检查 | 多了 `check-client.mjs` | 面板是这个插件的全部表面，而它的错误只在重启后表现为一片空白，值得单独一个无依赖的加载/渲染检查 |

另外两处按设计落地：目录按会话 `header.cwd` 求并集（`ctx.skills.snapshot()` 是 cwd 敏感的，host 插件没有 agent 作用域），以及 `tracked` 里带 `failed` / `malformed` 两个计数器，让"数字不对"能一眼看出是扫描没跑完。

**已完成的验证**：

1. `node index.js` —— `countSkills` 纯函数自检通过。
2. `node check-client.mjs` —— 模块契约、slot 注册、中英文字典 key 一致、四条渲染路径，全部通过。
3. `cordis.patch.yml` 用 `yaml` 解析通过，结构为 `[{ insert: [{ id, name, config }] }]`。
4. 从 profile 目录 `import('dsh-skill-insights')` 解析成功，导出 `name = 'skill-insights'`、`apply`、`countSkills`。
5. junction 已建立：`profiles\desktop\node_modules\dsh-skill-insights` → `C:\Users\CSYANGA\Desktop\dsh-skill-insights`；`profiles\desktop\package.json` 已加入依赖与 bundles。

**未验证**：路由 `/skill-insights/summary` 的实际返回与面板渲染 —— 需要重启 DSH 才会加载新 bundle。

---

## 10. 开源发布形态

从"本机私有插件"改成"可发布、可开源"的正式包：

| 改动 | 内容 |
|---|---|
| 去掉 `private: true` | 否则 npm 拒绝发布 |
| 补元数据 | `license: MIT`、`author`、`repository` / `bugs` / `homepage`、9 个 `keywords`（含 `dsh-plugin`，市场靠它检索）、`publishConfig.access: public` |
| `engines` | `node: ^22.19.0 \|\| >=24.0.0`、`dsh: >=0.1.5-rc.2` |
| `files` | 加上 `README.zh.md`、`CHANGELOG.md`；`check-client.mjs` 与 `DESIGN.md` 刻意**不发布**（前者是开发检查，后者是内部设计文档） |
| `LICENSE` | MIT，版权人 CSYANGA |
| `README.md` + `README.zh.md` | 英文为主（npm 落地页 + GitHub 门面），中文保留 |
| `CHANGELOG.md` | 带社区约定的 **DSH 版本兼容表** —— 这是这个生态应对版本漂移的实际做法 |
| `.gitignore` + `.gitattributes` | 后者统一 LF，避免 Windows 协作者把整个文件重写成 CRLF |
| git 仓库 | `main` 分支，首次提交已完成；**per-repo** 身份设为 `sanprophet / yangchaosan1@163.com`，避免全局配置里的工作邮箱进入公开提交历史 |

`engines.dsh` 是**社区约定，不是启动器校验的字段** —— 官方 schema 只读 `bundle` / `profile` / `client`。所以版本兼容性同时写进 README 与 CHANGELOG 的验证表，不能只靠这一个字段。

**发布前的完整验证**（全部通过）：

| 检查 | 结果 |
|---|---|
| `node index.js` | 通过（计数逻辑） |
| `node check-host.mjs` | 通过（假 Cordis 上下文 + 临时 `DSH_HOME`，跑通扫描 → 快照 → 路由 → 缓存全链路） |
| `node check-client.mjs` | 通过（模块契约、slot 注册、字典 key 一致、四条渲染路径） |
| `npm pack --dry-run` | 11 个文件，`check-*.mjs` / `DESIGN.md` 正确排除，`LICENSE` 自动带上 |
| 打包 → 装进干净目录 → 从**装好的副本**运行 | 三个检查全部通过 |
| 清单里每个 `dsh.bundle.patch` / `icon` / `exports` 目标 | 在装好的副本里都存在 |
| 从 profile 目录 `import('dsh-skill-insights')` | 解析成功，导出 `name` / `apply` / `countSkills` |

倒数第二条最要紧：它证明了 **`files` 是完整的** —— 这正是只有第一个安装的人才会撞上的那类 bug。

### 本机安装与 lockfile

桌面 profile **只能由 Electron 应用自己管**：`dsh plugin --profile desktop add` 会被拒绝，报 `profile "desktop" is managed exclusively by the Electron application`。所以本机安装只能走应用内的插件管理器，或像本次这样手工接线。

手工改 `package.json` 会留下一个隐患：`pnpm-lock.yaml` 里没有新增的 `link:` 记录，package.json 与 lockfile 不同步，而启动时若跑 `--frozen-lockfile` 就会 `ERR_PNPM_OUTDATED_LOCKFILE`。修法是用应用自带的 pnpm 对齐（`runtime.json` 记的 11.7.0，也是插件管理器日志里那一版）：

```powershell
# 先备份 profile 的 package.json 与 pnpm-lock.yaml
& "<runtime>\dependencies\node\bin\node.exe" `
  "<runtime>\dependencies\pnpm\bin\pnpm.cjs" install --prefer-offline
```

跑完 lockfile 的 `importers` 里会出现两条 `link:` 记录，之后三个状态一致：package.json、pnpm-lock.yaml、node_modules 的 junction。

## 11. 视觉系统（0.1.2 重做）

旧面板被评为"太 low"。用 `ui-ux-pro-max` 重做，但**不照抄它的输出** —— 先分清哪些能核实、哪些不能。

### 11.1 依据的来源与取舍

`search.py --design-system`（density 8 / variance 3 / motion 2）给出的：

| 项 | 采用 | 理由 |
|---|---|---|
| Style: Minimalism & Swiss | ✅ | 网格、高对比、功能性，正对数据面板 |
| Typography: Fira Code / Fira Sans（mood: dashboard, data, precise） | ✅（取其意） | 结论是**数字列用等宽 + 表格数字**，而不是真去加载 Google Fonts |
| Avoid: "Ornate design + No filtering" | ✅ | 本来就已有筛选 |
| **Pattern: "Enterprise Gateway"**（Hero 视频 / Contact Sales / 客户 logo 墙） | ❌ **弃用** | 这是营销落地页套路，与应用内嵌数据面板无关。技能本身要求"没匹配上就说明白"，所以这里明说：这一项没匹配上 |
| Colors（`#1E40AF` 等原始 hex） | ❌ **弃用** | 插件必须只用 `--dsw-alias-*` 主题 token，不能写死 hex |

另外两条 `--domain` 查询给出了可直接落地的条目：

- **UX · Table Handling**：宽表需要横向滚动或卡片化 → 促成了 11.3 的窄屏列裁剪。
- **UX · Font Size Scale**：用一致的模块化字号阶，别随手写 → 11.2。
- **Chart · Trend Over Time**：**"fewer than 4 data points（use stat card）"** 与 **"never distinguish series by hue alone / A11y fallback: visible data table plus concise trend summary"** → 11.4。

### 11.2 真实的 DSH 设计基线（已核实，不是猜的）

与其自创一套，不如对齐宿主。`@deepseek-ai/dsh-client-ui-theme/lib/client.js` 里读到的：

- 正文 `font-size: 14px; line-height: 22px`，次要 `12px / 18px`
- 边框是 **`0.5px`** 细线，不是 `1px`
- 圆角：胶囊 20px、步进器 18px、小控件 3px
- 原生就用 `font-variant-numeric: tabular-nums`
- hover 用 `--dsw-alias-interactive-bg-hover`
- `color-mix(in srgb, …)` 可用

同一文件里也拿到了**完整的别名 token 表**（`body{…}` 为明色，`body[data-ds-dark-theme]{…}` 为暗色），
这正是 11.5 的预览能可信的前提。

因此字号收敛为五级固定阶：`--si-fs-2xs` 11 / `--si-fs-xs` 12 / `--si-fs-sm` 13 / `--si-fs-md` 14 /
`--si-fs-xl` 28，不再出现 12.5 / 11.5 / 10.5 这类随手值。边框全部换成 `0.5px`。

**强调色不是 `brand-primary`。** 这是个反直觉但已核实的坑：

| token | 解析值 | 用途 |
|---|---|---|
| `--dsw-alias-brand-primary` | **`#0f1115`** = `neutral-bluish-1000` | 就是正文色。**拿它当强调色等于没强调** |
| `--dsw-alias-state-business-primary` | **`#4176e6`** = `deepseek-500` | DeepSeek 蓝，DSH 自己用于焦点环与选中强调 |
| `--dsw-alias-link` / `--dsw-alias-button-info-fill` | `#4176e6` | 链接 / info 按钮 |
| `--dsw-alias-brand-primary-new-colorprimary-new-color` | `#5686fe` | 名字是生成产物，**不要用** |

依据：在 `@deepseek-ai` 全树检索 `state-business-primary`，DSH 用它做 `:focus-visible` 的 outline
（`dsh-client-ui-settings-plugins`、`-workflow-run`、`-trajectory`）、cordis 工具卡片的图标与标题、
会话里的技能 chip、日程状态点、todo 进度环。全部 13 个"有彩色值的 alias"里，它是唯一语义上表示
"主要强调"的那一个。因此面板内统一为 `--si-accent`，侧栏图标处直接写 token（图标渲染在侧栏，
不在 `.ui-page` 子树内，取不到 `--si-accent`）。

### 11.3 表格

- **`table-layout: fixed` 是功能开关，不是样式偏好。** 真实运行环境里曾出现"表格只剩一列、描述文字
  冲出卡片"：默认的 `auto` 布局下，`white-space: nowrap` 的文字把 **min-content 宽度**贡献为整句话
  的长度，`width: 50%` 被静默忽略 —— 第一列吞掉整张表，其余六列被挤出视口。
  更麻烦的是 `max-width: 100%` 在 auto 布局下是**循环依赖**（元素宽度取决于 `td`，`td` 宽度又取决
  于内容），所以 `overflow: hidden` 和 `text-overflow: ellipsis` **同时失效** —— 我最初判断"少写了
  `overflow: hidden`"是错的，读文件才发现那行本来就在，光加它并不解决问题。
  `fixed` 布局只从**表头行**读取列宽，所以 `width` 必须写在 `th` 上；而且六列平分剩余 50% 时每列只
  有 ~94px，时间戳会折成两行把行高翻倍 —— 因此按 `nth-child` 显式给出 44 / 9 / 9 / 9 / 7 / 14 / 8%。
  窄屏隐藏某列时其百分比不参与计算，剩余空间自动重分配，无需额外规则。
  描述同时带 `title`：截断是 Medium 级的可接受取舍，但按 UX 规范"区分性文字必须能读到全文"是
  Critical 级，所以必须留一条完整路径。
  `check-client.mjs` 断言了这三条声明 —— 无 DOM 的渲染检查看不见布局，但 CSS 随渲染树一起产出。
- **行高节奏（旧面板最难看的地方）**：描述固定单行省略，并且**始终渲染**、用 `min-height: 16px` 预留行高。
  有描述的行两行、无描述的行一行，这个参差是"廉价感"的主因。现在每行等高。
- **表头 sticky**：`.ui-page` 才是纵向滚动容器，所以 `th` 能贴住视口顶。代价是**不能**给表格套
  `overflow-x` 容器 —— 那会成为新的滚动容器并劫持 sticky 轴。窄屏改为按优先级隐藏列
  （`≤900px` 隐藏「来源」「会话数」，`≤680px` 再隐藏「模型/用户」「最近使用」），这也是上面那条
  Table Handling 条目的落地方式。
- **调用次数列**：数字下方垫一条按 `calls / peak` 计算的占比条，条只是复述数字、从不替代数字，因此
  不违反"不要只靠颜色传达信息"。占比按**整个目录**而非筛选后的视图计算，避免一筛选就把所有条拉满。
- 其余数字列降一级颜色，把视觉重量留给调用次数；数字全部等宽 + `tabular-nums`。

### 11.4 趋势列

旧版画 30 根柱子，绝大多数是 1px 的空桩 —— 是噪声不是信息。现在：活动天数 **< 4** 时只显示
`3 天` / `1d`；**≥ 4** 才画柱。两种情况都带 `aria-label`（`近 30 天里有 N 天发生调用`），
所以不读图形也能拿到信息。

### 11.5 可访问性与验证

清单逐条对照后的落地：焦点环**始终可见**（旧版 `.ui-input:focus { outline: none }` 直接抹掉了它，是实打实的
缺陷）、`cursor: pointer`、hover 过渡 150–300ms、`prefers-reduced-motion` 下关掉全部过渡、`th` 带
`scope="col"`、加载/空/错误态带 `role="status"` / `role="alert"`、颜色全部取自语义 token 因而明暗两套
各自达标。

**怎么看得到**：插件要重启 DSH 才加载新 bundle，而重启会杀掉当前会话 —— 所以改完不能靠"重启看看"。
`TEMP` 下留了一个一次性预览台（`preview-skill-insights.mjs`，**不进仓库**）：它用最小 React 桩件驱动
**真实的 `client.js`**，把组件树序列化成 HTML，套上从 bundle 里抽出的真实主题 CSS，再用无头 Chrome 出图。
明色 / 暗色各一张，均已核对。

```powershell
node "$env:TEMP\preview-skill-insights.mjs"
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --force-device-scale-factor=2 --window-size=1600,1000 --virtual-time-budget=6000 `
  --screenshot="$env:TEMP\si-light.png" `
  "file:///$($env:TEMP -replace '\\','/')/si-preview-light.html"
```

注意 PowerShell 里写 `"si-$theme.html"` 会被当成属性访问、静默拼出错误的 URL，要写 `"si-${theme}.html"`。

### 11.6 密度与权重（第二轮）

第一轮解决的是"有 bug"，第二轮解决的是"权重分配不对"。截图评审逐条列出的问题与处理：

- **零值 KPI 占位。** `已卸载 / 未知 → 0` 用 1/4 画幅报告"什么都没发生"，是全页最空也最显眼的一格。
  现在**为零时整格不渲染**，有值时以 `--dsw-alias-state-warn-primary` 出现 —— 面板只在真该出声时出声。
  因此 KPI 条从固定 `repeat(4, 1fr)` grid 改成 flex（`flex: 1 1 0`），格子数变化时自动均分。
  这**违反了"预留空间避免 CLS"** 的一般建议，但该建议针对的是加载过程中的跳动；这里是"健康态少一格、
  异常态多一格"的语义变化，用一点重排换取"零值不占位"是划算的，特此记录取舍。
- **纵向节奏。** 数字 28 → 22px，格子内边距 14/15 → 11/12px，标签/数字/说明三段间距 8 → 4/5px，
  标题区下边距 22 → 14px，KPI 条到卡片 16 → 12px，卡片内边距 14/18 → 12/16px，表格行 9 → 7px、
  表头 8 → 6px。整页少约 60px。
- **行层次。** 占比条 `.16 → .26`。原来 4 次调用和 1 次调用的行视觉重量完全相同，`调用次数` 这一列
  没有承担起面板存在的理由。
- **`来源` 列语义。** 空值实际是"从本机技能根目录发现"，渲染成 `—` 与 `已卸载` 徽章的"未知"混淆。
  改为 `bundled → 内置`、空值 / `user-agents → 本机`；无法识别的来源**保留原始值**，不做猜测。

密度取向明确选了"更紧"，对齐 DSH 自身插件卡片的观感：靠对比而不是空白建立层次。

### 11.7 仍可改进

- **`locale/*.json` 的用途没验证成功。** 这两个文件（内容形如 `{"meta":{"title","description"}}`，即
  `package.json.meta` 的翻译覆盖）在本插件里**没有任何代码读它们**：`client.js` 的字典是内联的，由
  `ctx.locale.register(NS, { zh, en })` 注册。兄弟插件 `dsh-usage-insights` 带同样两个文件，说明它可能是
  某个约定，但在 `@deepseek-ai/*` 全树检索 `locale.{0,30}\.json` / `join(…,'locale',…)` 只命中
  `locale/change` 事件、源码注释里的路径和 PDF.js 噪声，**没有找到读取插件目录 locale 的代码**；官方
  `dsh` 清单 schema 也只读 `bundle` / `profile` / `client` / `configTrees` / `sessionFormatMigration` /
  `moduleFallback`，没有 `locale` 字段。Electron 主进程 bundle 不在可检索路径上，无法穷尽排除。
  因此：**保留**（382 字节，且有旁证），但不再声称它"插件管理页用"。要么找到读者，要么在下个版本删掉。
- **表格没有排序控件。** 参考图没有，当前 80 行的量级下按调用次数排序也够用；上千行时会需要。
- **页签用 `aria-pressed` 而不是 `role=tablist`。** 这是有意的：它们是筛选组，真 tablist 需要配套的
  `tabpanel` 和方向键导航，只有在外观之下真的做成面板切换时才该补上。

第四轮之前列在这里的三条已随结构消失：KPI 竖分隔线（改成独立卡片）、暗色下偏弱的占比条（改成实心轨道）、
未虚拟化的 30 根趋势柱（整列删除）。

### 11.8 按参考图重做（第四轮）

参考图是一份技能管理器的设计稿，不是风格板。本轮按图重做，并明确砍掉了做不到的部分。

#### 不做的部分，以及为什么

参考图的核心能力是"停用技能"。DSH 没有这个 API：

- `SkillRegistry`（`dsh-skill`）只暴露 `list()` / `snapshot()` / `get()` / `register()` / `registerProvider()`。
- `SessionSkillCatalog`（`dsh-api-session-controller`）只暴露 `list(request, signal)`。
- `SkillInvocationPolicy` 的 `modelInvocable` / `userInvocable` 是 provider 从技能自身 frontmatter
  解析出的**结果**，不是运行时可写的状态。

唯一的停用路径是改写每个技能的 `SKILL.md` frontmatter（`dsh-skill-filesystem` 带 `watch` +
`observeHostMutation`，改了确实会生效），但那是通过非受支持路径改用户的技能库。

因此**没做**状态开关列和已停用计数。**一并砍掉多选复选框** —— 它存在的唯一理由是驱动批量停用，留下来
就是一组按下去不会发生任何事的控件。这是工艺红线，不是省事。

#### 取色方法论错误（已修正）

第三轮把画布定成 `neutral-bluish-100`（#ebeef2），依据是从参考图取色。但参考图是一页演示文稿截图，
`#eef2f6` 是**幻灯片背景**，不是应用页面。实测应用区域为 `rgb(247,248,250)` ≈ `#f7f8fa`，
`neutral-bluish-50` 是最接近的 DSH token —— 原值偏深约三倍。

教训：**取色前先确认采样的是被测界面还是它的容器。** 同一次错误还漏掉了参考图里琥珀色的「72」：几像素的
小号粗体落在了取色阈值以下。

定义感来自那 10% 的描边（`border-l2`），不是画布与白卡的明度差。

#### 结构对照

| 参考图 | 本插件 |
|---|---|
| 顶部统计区 | 三张独立统计卡：`可用技能 = 用过的技能 + 从未使用`，值得动手的一格用 `state-warn-primary` |
| 状态页签 | `全部 n` / `使用过 n` / `从未使用 n`，选中态实心反色（不用强调蓝，蓝色留给占比条） |
| 筛选行 | 搜索 + 来源 + 使用时间；每个选项自带维度名 |
| 表格 | 4 列：技能 / 使用次数 / 最近使用 / 来源 |
| 状态开关列 | **不适用**，见上 |

**参考图自身的排版缺陷没有照抄**：「最近使用」表头会从词中间折行，「使用时间」的 ▾ 会掉到第二行。
那是 mockup 的事故，不是设计意图。

#### 删掉的

- **30 天趋势列。** 只在活动天数 ≥ 4 时画柱，而本机每个用过的技能都只有 1–2 天 —— 它从未画过图，只是
  占 10% 宽度打印一个天数。整列连同 `.ui-spark` 一起删。
- **模型·用户拆分 / 会话数两列**，移进调用次数的 `title`。它们回答追问，不是第一眼的问题；顺带解决了
  评审的认知负荷条目（7 列、每行 8 个事实）。

#### 行密度与字重（用户反馈）

- **描述不再单独占一行**，改为整行悬停文本，一屏可见从 ~10 行涨到 ~16 行。描述没丢：同时保留在无障碍树
  （`.ui-sr`）和搜索范围内，只是不再被印出来 —— 标题属性挂在 `div` 上并不总能被读屏软件播报，所以补了
  一个 clip 的隐藏文本节点。
- **技能名 12px/500 → 13px/600 等宽。** 之前它比旁边的调用次数（14px/600）更细更小，导致每行的**主键是
  全行最轻的元素**，层次是倒的。

