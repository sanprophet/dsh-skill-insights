/**
 * dsh-skill-insights — Client half.
 *
 * Hand-written browser bundle for the DSH Web GUI. It registers a sidebar entry
 * plus the matching central panel, so the DSH sidebar owns the button and the
 * panel selection; nothing is wired by hand.
 *
 * Only the frozen shell seed is required from the module table (`react`), so
 * this file has no build step and no Harness Client package dependency: every
 * control and every style is local, and only `--dsw-alias-*` theme tokens are
 * used for colour.
 *
 * Data comes from a same-origin route on DSH's own loopback web server
 * (`/skill-insights/summary`), served by the Host half. The Host already merges
 * the catalog with the counts, so this file only filters, sorts and draws.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-insights',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Shared by the sidebar entry and the central panel it opens. */
    const PANEL_ID = 'skill-insights'
    /** Locale namespace owned by this plugin. */
    const NS = 'skill-insights'
    /** Bumped only to be visible in the served bundle. */
    const BUILD = 'skill-insights-1'
    /** Same-origin route registered by the Host half. */
    const ROUTE = '/skill-insights/summary'

    const zh = {
      panel: '技能用量',
      title: '技能用量',
      subtitle: '本机可用技能清单，以及每个技能被调用了多少次',
      refresh: '刷新',
      refreshing: '刷新中…',
      loading: '正在读取技能用量…',
      empty: '没有匹配的技能。',
      errorTitle: '读取技能用量失败',
      errorHint: '请确认插件已启用并重启过 DSH。错误：{detail}',
      retry: '重试',
      search: '按名称或描述筛选…',
      showUnused: '显示未使用的技能',
      skill: '技能',
      source: '来源',
      calls: '调用次数',
      split: '模型 / 用户',
      sessions: '会话数',
      lastUsed: '最近使用',
      trend: '近 30 天',
      never: '未使用',
      kpiSkills: '可用技能',
      kpiUsed: '用过的技能',
      kpiCalls: '总调用次数',
      kpiOrphans: '已卸载 / 未知',
      kpiSkillsSub: '当前可解析的目录',
      kpiUsedSub: '被调用过至少一次',
      kpiCallsSub: '{model} 次模型调用 · {user} 次用户调用',
      kpiOrphansSub: '{calls} 次调用指向已不在目录里的技能',
      orphanBadge: '已卸载',
      modelOnly: '仅模型',
      userOnly: '仅用户',
      catalogIncomplete: '技能目录可能不完整：某个 provider 在发现时失败了，列表里可能少了一些技能。',
      tracked: '读取自 {home}',
      trackedDetail: '扫描了 {sessions} 个会话 · 最后扫描 {at}',
      trackedFailed: ' · {failed} 个会话读取失败',
      trackedMalformed: ' · {malformed} 条事件无法解析',
      footnote:
        '调用次数来自本机 DSH 会话日志：模型通过 skill 工具加载的每一次，加上你用 /技能名 显式注入的每一次。只统计调用次数，不统计成功与否。删掉的会话会连同它的历史调用一起消失。',
    }

    const en = {
      panel: 'Skill Usage',
      title: 'Skill Usage',
      subtitle: 'Every skill this machine can resolve, and how often each one was used',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      loading: 'Reading skill usage…',
      empty: 'No skill matches.',
      errorTitle: 'Could not read skill usage',
      errorHint: 'Check that the plugin is enabled and DSH has been restarted. Error: {detail}',
      retry: 'Retry',
      search: 'Filter by name or description…',
      showUnused: 'Show unused skills',
      skill: 'Skill',
      source: 'Source',
      calls: 'Calls',
      split: 'Model / User',
      sessions: 'Sessions',
      lastUsed: 'Last used',
      trend: 'Last 30 days',
      never: 'Never',
      kpiSkills: 'Available skills',
      kpiUsed: 'Skills used',
      kpiCalls: 'Total calls',
      kpiOrphans: 'Uninstalled / unknown',
      kpiSkillsSub: 'resolvable right now',
      kpiUsedSub: 'called at least once',
      kpiCallsSub: '{model} model · {user} user',
      kpiOrphansSub: '{calls} calls name a skill no longer in the catalog',
      orphanBadge: 'uninstalled',
      modelOnly: 'model only',
      userOnly: 'user only',
      catalogIncomplete: 'The skill catalog may be incomplete: a provider failed during discovery, so some skills may be missing.',
      tracked: 'Read from {home}',
      trackedDetail: '{sessions} sessions scanned · last scan {at}',
      trackedFailed: ' · {failed} sessions unreadable',
      trackedMalformed: ' · {malformed} unparseable events',
      footnote:
        'Counts come from this machine\'s DSH session logs: every model load through the skill tool, plus every explicit /skill-name injection. Attempts are counted, not successes. Deleting a session also deletes its recorded usage.',
    }

    const CSS = `
.ui-page { height: 100%; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.ui-inner { max-width: 1120px; margin: 0 auto; padding: 28px 32px 56px; box-sizing: border-box; }
.ui-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.ui-title { font-size: 24px; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.01em; }
.ui-subtitle { font-size: 13px; color: var(--dsw-alias-label-secondary); margin: 0; }
.ui-actions { display: flex; align-items: center; gap: 10px; }
.ui-btn { appearance: none; font: inherit; font-size: 12.5px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; }
.ui-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
.ui-btn:disabled { opacity: .55; cursor: default; }
.ui-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
.ui-kpi { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 14px 16px; background: var(--dsw-alias-bg-layer-1); }
.ui-kpi-label { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
.ui-kpi-value { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ui-kpi-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); margin-top: 4px; line-height: 1.45; }
.ui-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 16px 20px 18px; margin-bottom: 18px; }
.ui-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.ui-input { flex: 1 1 240px; min-width: 180px; font: inherit; font-size: 13px; padding: 7px 11px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.ui-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.ui-check { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none; }
.ui-check input { accent-color: var(--dsw-alias-brand-primary); }
.ui-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ui-table th { text-align: right; font-weight: 500; font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 0 10px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.ui-table th:first-child, .ui-table td:first-child { text-align: left; padding-left: 0; }
.ui-table th:last-child, .ui-table td:last-child { padding-right: 0; }
.ui-table td { text-align: right; padding: 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-variant-numeric: tabular-nums; vertical-align: middle; }
.ui-table tbody tr:last-child td { border-bottom: 0; }
.ui-skill { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ui-skill-name { font-weight: 500; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12.5px; }
.ui-skill-desc { font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.5; max-width: 620px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ui-badge { font-size: 10.5px; font-weight: 500; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-family: inherit; white-space: nowrap; }
.ui-badge-warn { border-color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-border-l2)); }
.ui-source { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ui-zero { color: var(--dsw-alias-label-secondary); opacity: .65; }
.ui-spark { display: inline-flex; align-items: flex-end; gap: 1px; height: 16px; }
.ui-spark i { display: block; width: 3px; border-radius: 1px; background: var(--dsw-alias-brand-primary); min-height: 1px; }
.ui-spark i[data-empty="true"] { background: var(--dsw-alias-border-l2); }
.ui-empty, .ui-error { border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px; padding: 28px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.ui-error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary); }
.ui-error code { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ui-warn { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 10px 12px; margin-bottom: 16px; }
.ui-footer { margin-top: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.7; }
.ui-footer code { font-size: 11.5px; }
`

    function formatCount(value) {
      return (Number(value) || 0).toLocaleString()
    }

    /** `1712345678901` -> `10月9日 14:03` / `Oct 9, 14:03`. */
    function formatTime(ts, locale) {
      const n = Number(ts) || 0
      if (n <= 0) return ''
      try {
        return new Date(n).toLocaleString(String(locale).startsWith('zh') ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return new Date(n).toISOString().slice(0, 16).replace('T', ' ')
      }
    }

    /** `{placeholder}` substitution, kept small on purpose. */
    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
      )
    }

    /**
     * Active locale id from the locale snapshot, whose documented shape is
     * `{ active, locales, revision }` with `active` a plain language id such as
     * `zh`, `zh-CN` or `en`. Everything else is a defensive fallback.
     */
    function currentLocaleId(ctx) {
      try {
        const snapshot = typeof ctx.locale.getSnapshot === 'function' ? ctx.locale.getSnapshot() : undefined
        if (typeof snapshot === 'string') return snapshot
        if (snapshot && typeof snapshot === 'object') {
          const value = snapshot.active || snapshot.id || snapshot.locale || snapshot.language
          if (typeof value === 'string') return value
          if (value && typeof value.id === 'string') return value.id
        }
      } catch {
        /* the locale runtime is always present; this is only belt and braces */
      }
      return 'en'
    }

    /** The sidebar glyph: three bars, echoing the counts this panel shows. */
    function SkillIcon({ size, active }) {
      const unit = size || 18
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: unit,
          height: unit,
          'aria-hidden': true,
          style: { display: 'block', opacity: active ? 1 : 0.72 },
        },
        h('rect', { x: 3, y: 3, width: 18, height: 3, rx: 1.5, fill: 'currentColor' }),
        h('rect', { x: 3, y: 10.5, width: 12, height: 3, rx: 1.5, fill: 'currentColor', opacity: 0.72 }),
        h('rect', { x: 3, y: 18, width: 7, height: 3, rx: 1.5, fill: 'currentColor', opacity: 0.45 }),
      )
    }

    /** Trailing-30-day mini bar chart; empty days stay as faint 1px stubs. */
    function Spark({ trend }) {
      const values = Array.isArray(trend) ? trend : []
      if (values.length === 0) return null
      const peak = values.reduce((max, value) => Math.max(max, Number(value) || 0), 0)
      return h(
        'span',
        { className: 'ui-spark', title: values.join(' · ') },
        values.map((value, index) => {
          const n = Number(value) || 0
          const height = peak === 0 ? 1 : Math.max(1, Math.round((n / peak) * 16))
          return h('i', { key: index, 'data-empty': n === 0 ? 'true' : 'false', style: { height: `${height}px` } })
        }),
      )
    }

    function Kpi({ label, value, sub }) {
      return h(
        'div',
        { className: 'ui-kpi' },
        h('div', { className: 'ui-kpi-label' }, label),
        h('div', { className: 'ui-kpi-value' }, value),
        sub ? h('div', { className: 'ui-kpi-sub' }, sub) : null,
      )
    }

    /** The full-page skill usage panel. */
    function SkillPage({ ctx }) {
      const [locale, setLocale] = React.useState(() => currentLocaleId(ctx))
      React.useEffect(() => ctx.locale.subscribe(() => setLocale(currentLocaleId(ctx))), [ctx])
      const t = React.useMemo(() => ctx.locale.bind(NS), [ctx, locale])

      const [status, setStatus] = React.useState('loading')
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [showUnused, setShowUnused] = React.useState(false)

      // One same-origin route on DSH's own loopback web server. No port, no
      // CORS, no credential to carry.
      const load = React.useCallback(() => {
        setStatus((previous) => (previous === 'ready' ? 'refreshing' : 'loading'))
        let cancelled = false
        fetch(ROUTE, { headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
          })
          .then((payload) => {
            if (cancelled) return
            setData(payload)
            setError('')
            setStatus('ready')
          })
          .catch((cause) => {
            if (cancelled) return
            setError(cause && cause.message ? cause.message : String(cause))
            setStatus('error')
          })
        return () => {
          cancelled = true
        }
      }, [])

      React.useEffect(() => load(), [load])

      const allRows = React.useMemo(() => {
        if (!data) return []
        const orphans = Array.isArray(data.orphans) ? data.orphans : []
        const skills = Array.isArray(data.skills) ? data.skills : []
        // Orphans first: a skill that was used but no longer resolves is the
        // most actionable row on the page.
        return [...orphans, ...skills]
      }, [data])

      const rows = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        return allRows.filter((row) => {
          if (!showUnused && row.calls === 0) return false
          if (!needle) return true
          return (
            String(row.name).toLowerCase().includes(needle) ||
            String(row.description).toLowerCase().includes(needle)
          )
        })
      }, [allRows, query, showUnused])

      const totals = (data && data.totals) || {}
      const tracked = (data && data.tracked) || {}

      const header = h(
        'div',
        { className: 'ui-head' },
        h(
          'div',
          null,
          h('h1', { className: 'ui-title' }, t('title')),
          h('p', { className: 'ui-subtitle' }, t('subtitle')),
        ),
        h(
          'div',
          { className: 'ui-actions' },
          h(
            'button',
            {
              className: 'ui-btn',
              type: 'button',
              onClick: load,
              disabled: status === 'loading' || status === 'refreshing',
            },
            status === 'refreshing' ? t('refreshing') : t('refresh'),
          ),
        ),
      )

      if (status === 'error') {
        return h(
          'div',
          { className: 'ui-page' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'ui-inner' },
            header,
            h(
              'div',
              { className: 'ui-error' },
              h('div', null, t('errorTitle')),
              h('div', { style: { marginTop: 8 } }, h('code', null, error)),
              h(
                'div',
                { style: { marginTop: 14 } },
                h('button', { className: 'ui-btn', type: 'button', onClick: load }, t('retry')),
              ),
            ),
          ),
        )
      }

      if (status === 'loading' && !data) {
        return h(
          'div',
          { className: 'ui-page' },
          h('style', null, CSS),
          h('div', { className: 'ui-inner' }, header, h('div', { className: 'ui-empty' }, t('loading'))),
        )
      }

      const kpis = h(
        'div',
        { className: 'ui-kpis' },
        h(Kpi, { key: 'skills', label: t('kpiSkills'), value: formatCount(totals.skills), sub: t('kpiSkillsSub') }),
        h(Kpi, { key: 'used', label: t('kpiUsed'), value: formatCount(totals.used), sub: t('kpiUsedSub') }),
        h(Kpi, {
          key: 'calls',
          label: t('kpiCalls'),
          value: formatCount(totals.calls),
          sub: format(t('kpiCallsSub'), { model: formatCount(totals.model), user: formatCount(totals.user) }),
        }),
        totals.orphans > 0
          ? h(Kpi, {
              key: 'orphans',
              label: t('kpiOrphans'),
              value: formatCount(totals.orphans),
              sub: format(t('kpiOrphansSub'), { calls: formatCount(totals.orphanCalls) }),
            })
          : null,
      )

      const warning =
        data && data.catalogComplete === false ? h('div', { className: 'ui-warn' }, t('catalogIncomplete')) : null

      const toolbar = h(
        'div',
        { className: 'ui-toolbar' },
        h('input', {
          className: 'ui-input',
          type: 'search',
          value: query,
          placeholder: t('search'),
          onChange: (event) => setQuery(event.target.value),
        }),
        h(
          'label',
          { className: 'ui-check' },
          h('input', {
            type: 'checkbox',
            checked: showUnused,
            onChange: (event) => setShowUnused(event.target.checked),
          }),
          t('showUnused'),
        ),
      )

      const body = h(
        'div',
        { className: 'ui-card' },
        toolbar,
        rows.length === 0
          ? h('div', { className: 'ui-empty' }, t('empty'))
          : h(
              'table',
              { className: 'ui-table' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', null, t('skill')),
                  h('th', null, t('source')),
                  h('th', null, t('calls')),
                  h('th', null, t('split')),
                  h('th', null, t('sessions')),
                  h('th', null, t('lastUsed')),
                  h('th', null, t('trend')),
                ),
              ),
              h(
                'tbody',
                null,
                rows.map((row) =>
                  h(
                    'tr',
                    { key: row.name },
                    h(
                      'td',
                      null,
                      h(
                        'div',
                        { className: 'ui-skill' },
                        h(
                          'div',
                          { className: 'ui-skill-name' },
                          row.name,
                          row.cataloged ? null : h('span', { className: 'ui-badge ui-badge-warn' }, t('orphanBadge')),
                          row.cataloged && row.modelInvocable === false
                            ? h('span', { className: 'ui-badge' }, t('userOnly'))
                            : null,
                          row.cataloged && row.userInvocable === false
                            ? h('span', { className: 'ui-badge' }, t('modelOnly'))
                            : null,
                        ),
                        row.description ? h('div', { className: 'ui-skill-desc' }, row.description) : null,
                      ),
                    ),
                    h('td', { className: 'ui-source' }, row.source || '—'),
                    h('td', { className: row.calls === 0 ? 'ui-zero' : undefined }, formatCount(row.calls)),
                    h(
                      'td',
                      { className: row.calls === 0 ? 'ui-zero' : undefined },
                      `${formatCount(row.model)} / ${formatCount(row.user)}`,
                    ),
                    h('td', { className: row.calls === 0 ? 'ui-zero' : undefined }, formatCount(row.sessions)),
                    h(
                      'td',
                      { className: row.calls === 0 ? 'ui-zero' : undefined },
                      row.lastAt ? formatTime(row.lastAt, locale) : t('never'),
                    ),
                    h('td', null, h(Spark, { trend: row.trend })),
                  ),
                ),
              ),
            ),
      )

      const footer = h(
        'div',
        { className: 'ui-footer' },
        h('div', null, format(t('tracked'), { home: tracked.home || '—' })),
        h(
          'div',
          null,
          format(t('trackedDetail'), {
            sessions: formatCount(totals.sessions),
            at: tracked.scannedAt ? formatTime(tracked.scannedAt, locale) : '—',
          }) +
            (totals.failed > 0 ? format(t('trackedFailed'), { failed: formatCount(totals.failed) }) : '') +
            (tracked.malformed > 0 ? format(t('trackedMalformed'), { malformed: formatCount(tracked.malformed) }) : ''),
        ),
        h('div', { style: { marginTop: 6 } }, t('footnote')),
      )

      return h(
        'div',
        { className: 'ui-page' },
        h('style', null, CSS),
        h('div', { className: 'ui-inner' }, header, warning, kpis, body, footer),
      )
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-insights: dictionaries')
      const t = ctx.locale.bind(NS)

      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ ctx }) }, SkillPage),
      )
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 13, locale: NS, label: () => t('panel') },
          SkillIcon,
        ),
      )
    }

    return { inject, apply, build: BUILD }
  },
})
