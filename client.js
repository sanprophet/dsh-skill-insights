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
 * Visual system notes (see DESIGN.md §11):
 *   - Type scale is a fixed five-step ramp, never ad-hoc sizes.
 *   - Borders are 0.5px hairlines, matching the host shell's own language.
 *   - Every number is tabular and monospaced so columns align and compare.
 *   - Colour never carries a meaning on its own; the value always says it too.
 *   - Focus is always visible, and motion always yields to reduced-motion.
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
    const BUILD = 'skill-insights-2'
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
      trendDays: '{days} 天',
      trendActive: '近 30 天里有 {days} 天发生调用',
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
      basis: '统计口径',
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
      trendDays: '{days}d',
      trendActive: 'Used on {days} days in the last 30',
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
      basis: 'How these numbers are derived',
      footnote:
        'Counts come from this machine\'s DSH session logs: every model load through the skill tool, plus every explicit /skill-name injection. Attempts are counted, not successes. Deleting a session also deletes its recorded usage.',
    }

    // Five-step ramp, shared by every rule below. Values are deliberately close
    // together: a dashboard reads better when few sizes compete.
    const CSS = `
.ui-page {
  --si-fs-2xs: 11px;
  --si-fs-xs: 12px;
  --si-fs-sm: 13px;
  --si-fs-md: 14px;
  --si-fs-xl: 28px;
  --si-num: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  /* The one accent every focus ring, bar and active glyph shares.
     NOT --dsw-alias-brand-primary: in the default theme that resolves to
     #0f1115, i.e. the same near-black as body text, so an accent built on it
     is invisible. --dsw-alias-state-business-primary is the DeepSeek blue and
     is what DSH itself uses for focus rings and selection emphasis. */
  --si-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  height: 100%; overflow: auto;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.ui-inner { max-width: 1200px; margin: 0 auto; padding: 26px 32px 52px; box-sizing: border-box; }

@media (prefers-reduced-motion: reduce) {
  .ui-page * { transition: none !important; }
}

/* ---- header ---- */
.ui-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.ui-title { font-size: 19px; line-height: 26px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.005em; }
.ui-subtitle { font-size: var(--si-fs-xs); line-height: 18px; color: var(--dsw-alias-label-tertiary); margin: 0; }
.ui-actions { display: flex; align-items: center; gap: 10px; }

.ui-btn {
  appearance: none; font: inherit; font-size: var(--si-fs-xs); line-height: 18px;
  padding: 5px 13px; border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  cursor: pointer; transition: background-color .18s ease, border-color .18s ease;
}
.ui-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l4); }
.ui-btn:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-btn:disabled { opacity: .5; cursor: default; }

/* ---- kpi strip ---- */
/* One ruled strip rather than four floating cards: it keeps the grid edge
   aligned with the table below, and the hairlines give the numbers a rhythm
   that separate boxes did not. */
.ui-kpis {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1); margin-bottom: 16px; overflow: hidden;
}
.ui-kpi { padding: 14px 18px 15px; border-left: 0.5px solid var(--dsw-alias-border-l1); }
.ui-kpi:first-child { border-left: 0; }
.ui-kpi-label { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-tertiary); margin-bottom: 8px; }
.ui-kpi-value {
  font-size: var(--si-fs-xl); line-height: 1; font-weight: 600;
  font-family: var(--si-num); font-variant-numeric: tabular-nums;
}
.ui-kpi-sub { font-size: var(--si-fs-2xs); line-height: 16px; color: var(--dsw-alias-label-tertiary); margin-top: 8px; }

/* ---- card + toolbar ---- */
.ui-card {
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1); padding: 14px 18px 4px; margin-bottom: 16px;
}
.ui-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
/* Bounded: a search field stretched across the whole card reads as unfinished. */
.ui-input {
  flex: 0 1 380px; min-width: 160px; font: inherit; font-size: var(--si-fs-sm);
  padding: 6px 11px; border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  transition: border-color .18s ease;
}
.ui-input:focus { border-color: var(--si-accent); }
.ui-input:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 1px; }
.ui-check {
  display: inline-flex; align-items: center; gap: 7px; font-size: var(--si-fs-xs);
  color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none;
  padding: 4px 2px; border-radius: 6px; margin-left: auto;
}
.ui-check:focus-within { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-check input { accent-color: var(--si-accent); cursor: pointer; margin: 0; }

/* ---- table ---- */
/* The page is the vertical scroller, not this card, so the header can stick to
   the top of the viewport. That is also why the table has no horizontal scroll
   wrapper: an overflow container would capture the sticky axis and kill it.
   Narrow layouts drop low-priority columns instead. */
.ui-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--si-fs-sm); }
.ui-table th {
  position: sticky; top: 0; z-index: 2;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: inset 0 -0.5px 0 var(--dsw-alias-border-l1);
  text-align: right; font-weight: 500; font-size: var(--si-fs-2xs);
  color: var(--dsw-alias-label-tertiary);
  padding: 8px 10px; white-space: nowrap;
}
.ui-table td {
  text-align: right; padding: 9px 10px; vertical-align: middle;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  font-variant-numeric: tabular-nums;
  transition: background-color .18s ease;
}
.ui-table tbody tr:hover td { background: var(--dsw-alias-interactive-bg-hover); }
.ui-table tbody tr:last-child td { border-bottom: 0; }
.ui-table th:first-child, .ui-table td:first-child { text-align: left; padding-left: 0; width: 50%; }
.ui-table th:last-child, .ui-table td:last-child { padding-right: 0; }

.ui-skill { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ui-skill-name {
  display: flex; align-items: center; gap: 7px;
  font-family: var(--si-num); font-size: var(--si-fs-xs); font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
/* Fills its cell rather than stopping short and leaving a void before the
   numeric columns. */
.ui-skill-desc {
  font-size: var(--si-fs-2xs); line-height: 16px; min-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.ui-badge {
  font-family: inherit; font-size: var(--si-fs-2xs); line-height: 15px; font-weight: 500;
  padding: 0 6px; border-radius: 999px; white-space: nowrap;
  border: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.ui-badge-warn { border-color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-border-l2)); color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }

.ui-source { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-tertiary); }
.ui-muted { color: var(--dsw-alias-label-tertiary); }

/* Numeric cells other than the call count recede: the count is the column that
   answers the question the panel exists to answer. */
.ui-table td.ui-num { color: var(--dsw-alias-label-secondary); }
.ui-table td.ui-num-zero, .ui-table td.ui-calls.is-zero { color: var(--dsw-alias-label-tertiary); }

/* The call count, drawn over a share bar. The bar restates the number, never
   replaces it, so nothing here depends on colour alone. */
.ui-calls-wrap { position: relative; display: inline-flex; align-items: center; justify-content: flex-end; width: 78px; padding: 2px 6px; box-sizing: border-box; }
.ui-calls-bar { position: absolute; right: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--si-accent); opacity: .16; }
.ui-calls-num { position: relative; font-family: var(--si-num); font-weight: 600; font-size: var(--si-fs-sm); }

/* ---- trend ---- */
.ui-spark { display: inline-flex; align-items: flex-end; gap: 1px; height: 18px; }
.ui-spark i { display: block; width: 3px; border-radius: 1px; background: var(--si-accent); }
.ui-spark i[data-empty="true"] { background: var(--dsw-alias-border-l2); height: 2px; }
.ui-trend-none { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

/* ---- states ---- */
.ui-empty, .ui-error {
  border: 0.5px dashed var(--dsw-alias-border-l2); border-radius: 12px;
  padding: 28px; text-align: center; font-size: var(--si-fs-sm);
  color: var(--dsw-alias-label-tertiary);
}
.ui-error { border-style: solid; border-color: var(--dsw-alias-state-error-primary, var(--dsw-alias-border-l2)); color: var(--dsw-alias-label-primary); }
.ui-error code { font-family: var(--si-num); font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-tertiary); }
.ui-actions-row { margin-top: 14px; }
.ui-warn {
  display: flex; gap: 8px; align-items: flex-start; font-size: var(--si-fs-xs); line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  border: 0.5px solid var(--dsw-alias-state-warning-primary, var(--dsw-alias-border-l1));
  border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
}

/* ---- footer ---- */
.ui-footer { font-size: var(--si-fs-2xs); line-height: 17px; color: var(--dsw-alias-label-tertiary); }
.ui-footer code { font-family: var(--si-num); }
.ui-basis { margin-top: 8px; }
.ui-basis summary { cursor: pointer; border-radius: 6px; width: fit-content; padding: 1px 0; }
.ui-basis summary:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-basis-text { margin: 6px 0 0; max-width: 76ch; }

/* ---- narrow layouts ---- */
@media (max-width: 900px) {
  .ui-inner { padding: 20px 18px 40px; }
  .ui-col-source, .ui-col-sessions { display: none; }
  .ui-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ui-kpi:nth-child(odd) { border-left: 0; }
  .ui-kpi:nth-child(n + 3) { border-top: 0.5px solid var(--dsw-alias-border-l1); }
}
@media (max-width: 680px) {
  .ui-col-split, .ui-col-last { display: none; }
  .ui-skill-desc { max-width: 30ch; }
}
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

    /**
     * The sidebar glyph: one sparkle for the skill, a smaller one for its use.
     *
     * Deliberately NOT a pure `currentColor` glyph. The host marks the selected
     * row only by switching text colour, and in the collapsed rail it sets every
     * row to `--dsw-alias-label-primary`, so a glyph that merely inherits looks
     * identical whether this panel is open or not.
     *
     * The accent is `state-business-primary`, NOT `brand-primary`: the latter
     * resolves to #0f1115 in the default theme — literally the body-text colour
     * — so an "accent" built on it is indistinguishable from the inactive state.
     * The token is spelled out here rather than reusing the panel's `--si-accent`
     * because this glyph renders in the SIDEBAR, outside `.ui-page`, where that
     * variable is not in scope.
     */
    function SkillIcon({ size, active }) {
      const unit = size || 18
      const style = { display: 'block', opacity: active ? 1 : 0.72 }
      if (active) style.color = 'var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))'
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: unit,
          height: unit,
          'aria-hidden': true,
          style,
        },
        h('path', {
          d: 'M11 3C11.5 7.9 14.6 10.2 19.5 11.5C14.6 12.8 11.5 15.1 11 20C10.5 15.1 7.4 12.8 2.5 11.5C7.4 10.2 10.5 7.9 11 3Z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M19.6 15.2C19.8 17.4 20.8 18.4 23 18.6C20.8 18.8 19.8 19.8 19.6 22C19.4 19.8 18.4 18.8 16.2 18.6C18.4 18.4 19.4 17.4 19.6 15.2Z',
          fill: 'currentColor',
          opacity: 0.5,
        }),
      )
    }

    /**
     * Trailing-30-day activity.
     *
     * The chart guidance is explicit that fewer than four data points is a stat,
     * not a chart — and most skills here fire on one or two days, so drawing 30
     * mostly-empty stubs is noise rather than information. Bars appear only once
     * there is a shape to see; below that the active-day count states the same
     * fact in far less ink. Either way the accessible name carries the value, so
     * nothing depends on reading the bars.
     */
    function Trend({ trend, t }) {
      const values = (Array.isArray(trend) ? trend : []).map((value) => Number(value) || 0)
      const activeDays = values.filter((value) => value > 0).length
      const summary = format(t('trendActive'), { days: activeDays })

      if (values.length === 0) return h('span', { className: 'ui-muted' }, '—')

      if (activeDays < 4) {
        return h(
          'span',
          { className: 'ui-trend-none', title: summary },
          activeDays === 0 ? '—' : format(t('trendDays'), { days: activeDays }),
        )
      }

      const peak = values.reduce((max, value) => Math.max(max, value), 0) || 1
      return h(
        'span',
        { className: 'ui-spark', role: 'img', 'aria-label': summary, title: summary },
        values.map((value, index) =>
          h('i', {
            key: index,
            'data-empty': value === 0 ? 'true' : 'false',
            style: { height: `${value === 0 ? 2 : Math.max(3, Math.round((value / peak) * 18))}px` },
          }),
        ),
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

      // Share bars are scaled against the whole catalog, not the filtered view,
      // so a filter does not silently restate every bar.
      const peakCalls = React.useMemo(
        () => allRows.reduce((max, row) => Math.max(max, Number(row.calls) || 0), 0),
        [allRows],
      )

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
              { className: 'ui-error', role: 'alert' },
              h('div', null, t('errorTitle')),
              h('div', { className: 'ui-actions-row' }, h('code', null, error)),
              h(
                'div',
                { className: 'ui-actions-row' },
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
          h(
            'div',
            { className: 'ui-inner' },
            header,
            h('div', { className: 'ui-empty', role: 'status' }, t('loading')),
          ),
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
        // Rendered even at zero: a card that vanishes reflows the strip, and the
        // grid is meant to be a stable frame you learn once.
        h(Kpi, {
          key: 'orphans',
          label: t('kpiOrphans'),
          value: formatCount(totals.orphans),
          sub: format(t('kpiOrphansSub'), { calls: formatCount(totals.orphanCalls) }),
        }),
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
          'aria-label': t('search'),
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
          ? h('div', { className: 'ui-empty', role: 'status' }, t('empty'))
          : h(
              'table',
              { className: 'ui-table' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', { scope: 'col' }, t('skill')),
                  h('th', { scope: 'col', className: 'ui-col-source' }, t('source')),
                  h('th', { scope: 'col' }, t('calls')),
                  h('th', { scope: 'col', className: 'ui-col-split' }, t('split')),
                  h('th', { scope: 'col', className: 'ui-col-sessions' }, t('sessions')),
                  h('th', { scope: 'col', className: 'ui-col-last' }, t('lastUsed')),
                  h('th', { scope: 'col' }, t('trend')),
                ),
              ),
              h(
                'tbody',
                null,
                rows.map((row) => {
                  const calls = Number(row.calls) || 0
                  const share = peakCalls > 0 ? Math.round((calls / peakCalls) * 100) : 0
                  return h(
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
                        h('div', { className: 'ui-skill-desc' }, row.description || ''),
                      ),
                    ),
                    h('td', { className: 'ui-source ui-col-source' }, row.source || '—'),
                    h(
                      'td',
                      { className: calls === 0 ? 'ui-calls is-zero' : 'ui-calls' },
                      h(
                        'span',
                        { className: 'ui-calls-wrap' },
                        h('span', { className: 'ui-calls-bar', style: { width: `${share}%` } }),
                        h('span', { className: 'ui-calls-num' }, formatCount(calls)),
                      ),
                    ),
                    h(
                      'td',
                      { className: `ui-num ui-col-split${calls === 0 ? ' ui-num-zero' : ''}` },
                      `${formatCount(row.model)} / ${formatCount(row.user)}`,
                    ),
                    h(
                      'td',
                      { className: `ui-num ui-col-sessions${calls === 0 ? ' ui-num-zero' : ''}` },
                      formatCount(row.sessions),
                    ),
                    h(
                      'td',
                      { className: `ui-num ui-col-last${calls === 0 ? ' ui-num-zero' : ''}` },
                      row.lastAt ? formatTime(row.lastAt, locale) : t('never'),
                    ),
                    h('td', null, h(Trend, { trend: row.trend, t })),
                  )
                }),
              ),
            ),
      )

      const footer = h(
        'div',
        { className: 'ui-footer' },
        h(
          'div',
          null,
          format(t('tracked'), { home: tracked.home || '—' }) +
            ' · ' +
            format(t('trackedDetail'), {
              sessions: formatCount(totals.sessions),
              at: tracked.scannedAt ? formatTime(tracked.scannedAt, locale) : '—',
            }) +
            (totals.failed > 0 ? format(t('trackedFailed'), { failed: formatCount(totals.failed) }) : '') +
            (tracked.malformed > 0 ? format(t('trackedMalformed'), { malformed: formatCount(tracked.malformed) }) : ''),
        ),
        // The long explanation is a disclosure, not a wall of grey under the
        // table: the provenance line above is what most readers want.
        h(
          'details',
          { className: 'ui-basis' },
          h('summary', null, t('basis')),
          h('p', { className: 'ui-basis-text' }, t('footnote')),
        ),
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
