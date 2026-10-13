# dsh-skill-insights

[English](README.md)

列出本机 DSH 能解析的**全部 skill**，以及每个 skill **被调用了多少次**。只读本机数据，走 DSH 自己的回环 Web 服务，不额外开端口、不联网、不修改任何 skill。

## 为什么是它

[`dsh-skill-hub`](https://github.com/cheshireez/dsh-skill-hub) 已经做了每个 skill 的调用次数统计，但它要求 `dsh >= 0.1.7-alpha.1`，在更老的版本上**完全不加载**。而能装在老版本上的技能管理插件（如 `@michengai/dsh-skills-manager`）只管理目录，从不统计用量。

本插件补的就是这个缺口，并且刻意只做一件事：不管市场、不管启停开关、不管脚手架、不做诊断。只要那些数字。

## 数据从哪来

两条 skill 调用路径都会写进会话日志，所以日志是唯一的事实来源：

| 路径 | 日志里的形态 |
|---|---|
| 模型调用 | `tool/call` 事件，`name: 'skill'`，`arguments` 是**未解析的 JSON 字符串**（取 `.name`） |
| 用户显式调用 `/技能名` | `user/message` 事件，`source: { kind: 'skill-invocation', name }` |

读取走 `ctx.sessionQuery.readSession()`，解压与重放校验都留在 persistence 后端里 —— 本插件不碰 zstd，也不解析日志格式。

**统计的是"调用尝试"，不是"加载成功"。** 区分二者需要把每个 `tool/call` 与其 `tool/result` 的内容块配对，而"尝试调用一个已经改名的 skill"恰恰是你想看到的信息，所以它被保留在「已卸载 / 未知」一栏。

**每轮扫描从头重算整张表。** 日志是完整可重放的，重算就是正确答案：没有水位、没有负增量、没有跨重启漂移。代价是每轮重读全部日志，见下面的配置表。

## 安装

```bash
dsh plugin --profile web add dsh-skill-insights
```

profile 名按你实际跑的填（`web`、`desktop`……），然后**重启 DSH**。面板出现在侧栏「用量分析」旁边。

想不看 GUI 就确认数据对不对 —— 面板读的就是这个路由：

```
http://127.0.0.1:19387/skill-insights/summary
```

## 配置

写在你的 profile 的 `cordis.patch.yml` 里：

| 字段 | 默认 | 范围 | 含义 |
|---|---|---|---|
| `scanIntervalSeconds` | `300` | 10–3600 | 扫描间隔。每轮重读全部会话日志。扫描快到超过这个间隔之前不用动它 |
| `includeUserInvocations` | `true` | — | 关掉就只统计模型调用，忽略 `/技能名` 注入 |

## 面板

- **KPI** —— 可用技能数、用过的技能数、总调用次数（模型 / 用户拆分）、已卸载 / 未知。
- **表格** —— 技能 · 来源 · 调用次数 · 模型/用户 · 会话数 · 最近使用 · 近 30 天迷你趋势。按调用次数降序，**已卸载的技能排在最前**（那是最可操作的一行）。
- **筛选框** + **显示未使用的技能**开关（默认关 —— 70 多个 skill 里绝大多数是 0，开着会盖住信号）。
- 底部 `tracked` 一行报告扫了多少会话、几个读不出来、几条事件解析失败 —— 数字不对时能直接定位到"扫描没跑完"。

## 已知限制

- **不实时** —— 默认 5 分钟延迟。
- **删掉会话就丢掉它记录的用量**，因为计数是从日志重算的。要永久保留得再加一张只增不减的表。
- **失败的调用也计入用量。** 见上文。
- **目录是各工作区的并集。** `ctx.skills.snapshot()` 是 cwd 敏感的，而 host 插件没有 agent 作用域，所以它对每个出现过会话的工作区各查一次再合并。用户级 skill 在所有工作区下一致，自然收敛成一行；项目级 skill 只出现在自己的工作区。
- **provider 发现失败时目录可能不全。** `snapshot.complete === false` 会在面板顶部报告，而不是静默少列几行。

## 开发

```bash
npm test
```

- `node index.js` —— `countSkills` 纯函数自检。构造一段合成事件流（模型两次、用户一次、一个已卸载的 skill、若干噪声事件），断言计数、首次/末次使用、按天分桶与畸形事件计数；再喂空数组和只有 `type` 的事件，确认降级而不是抛错。
- `node check-client.mjs` —— `client.js` 的加载与渲染检查。用一个极简 React 替身保持零依赖；断言模块契约、两个 slot 注册、中英文字典 key 完全一致、所有渲染路径都能建树，以及渲染结果里**没有 `MISSING:`**（即面板用到的每个文案 key 都存在）。

`client.js` 是手写的浏览器 bundle：`window.__ModuleLoader__.load` + 从冻结模块表取 `react`。没有构建步骤，不依赖任何 client 包。

> ⚠️ 不要用同一个 `DSH_HOME` + cwd 起两个 `dsh web` —— 会话日志没有锁，会造成 `seq gap` 损坏。

## License

MIT
