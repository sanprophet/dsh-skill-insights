# Changelog

## 0.1.0

首个发布。

- 扫描本机全部会话日志，统计每个 skill 的调用次数（模型通过 `skill` 工具加载 + 用户 `/技能名` 显式注入），
  数据经 `ctx.sessionQuery.readSession()` 读取，不自行解压 zstd。
- 技能目录取各工作区 `ctx.skills.snapshot()` 的并集，因此项目级 skill 也能列出。
- 每轮从头重算整张计数表（无增量、无水位），并缓存上次快照以便重启后立刻出画面。
- 面板：KPI、按调用次数排序的表格、筛选框、「显示未使用的技能」开关、30 天趋势、`tracked` 状态行。
- 两个零依赖检查：`node index.js`（计数逻辑）、`node check-client.mjs`（客户端加载与渲染）。

### DSH 版本兼容

`package.json` 的 `engines.dsh` 声明最低支持版本；下表记录**实际验证过**的版本。注意 `dsh` 清单的官方 schema
（`@deepseek-ai/dsh-package-manifest`）只读 `bundle` / `profile` / `client`，`engines.dsh` 是社区约定、不是启动器校验的字段。

| 插件版本 | 验证于 dsh 版本 | 备注 |
|---|---|---|
| 0.1.0 | 0.1.5-rc.2 | 初始版本；`ctx.skills.snapshot()` / `ctx.sessionQuery.readSession()` / `ctx.webServer.register` 均在该版本可用 |
