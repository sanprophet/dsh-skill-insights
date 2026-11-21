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
 * Visual system notes (see DESIGN.md §11–§12):
 *   - Type scale is a fixed five-step ramp, never ad-hoc sizes.
 *   - Borders are 0.5px hairlines, matching the host shell's own language.
 *   - Numbers are tabular (font-variant-numeric) so columns align and compare;
 *     monospace is reserved for genuinely code-shaped text and nothing else.
 *   - Colour never carries a meaning on its own; the value always says it too.
 *   - Focus is always visible, and motion always yields to reduced-motion.
 *
 * Reading order (§12): status strip → bucket tabs → the record → one skill in
 * full. A supporting rail carries the machine-level evidence (recent activity,
 * where the catalog comes from, which skills the model can even pick), and it is
 * deliberately weaker than the table in ink and in area, because the table is
 * the primary path.
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
    const BUILD = 'skill-insights-7'
    /** Same-origin route registered by the Host half. */
    const ROUTE = '/skill-insights/summary'
    /**
     * Trailing days the Host puts in every `row.trend`. Read from the row itself
     * rather than assumed, so a payload from an older Host still draws a chart of
     * whatever length it actually sent.
     */
    const TREND_DAYS = 30
    /**
     * Page sizes offered by the list footer, smallest first — the default is the
     * first entry. 20 is the default because it is roughly what fits in the panel
     * without the table needing its own scrollbar, so the record arrives whole
     * rather than cut off mid-row. 100 is effectively "everything" for a catalog
     * of this size, which is the honest way to offer an escape from paging.
     */
    const PAGE_SIZES = [20, 50, 100]

    const zh = {
      panel: '技能管理',
      title: '技能管理',
      subtitle: '查看本机可解析的每个技能，以及各自被调用了多少次',
      refresh: '刷新数据',
      refreshing: '刷新中…',
      loading: '正在读取技能用量…',
      empty: '没有匹配的技能。',
      errorTitle: '读取技能用量失败',
      errorHint: '请确认插件已启用并重启过 DSH。错误：{detail}',
      retry: '重试',
      search: '搜索技能名称或说明',
      filterSource: '来源',
      filterTime: '使用时间',
      optAll: '全部',
      optLocal: '本机',
      optBuiltin: '内置',
      optToday: '今天',
      optWeek: '近 7 天',
      optMonth: '近 30 天',
      pick: '{dim}：{value}',
      tabAll: '全部 {count}',
      tabUsed: '使用过 {count}',
      tabNever: '从未使用 {count}',
      skill: '技能',
      source: '来源',
      srcBuiltin: '内置',
      srcLocal: '本机',
      buildTag: '构建 {build}',
      pagerLabel: '技能列表分页',
      pagerRange: '第 {from}–{to} 条，共 {total} 条',
      pagerPrev: '上一页',
      pagerNext: '下一页',
      pagerPage: '第 {n} 页',
      pagerCurrent: '第 {n} 页，当前页',
      pageSizeOption: '每页 {n} 条',
      pageSizeAria: '每页显示数量',
      today: '今天',
      yesterday: '昨天',
      daysAgo: '{days} 天前',
      calls: '使用次数',
      lastUsed: '最近使用',
      never: '从未',
      callsDetail: '模型 {model} 次 · 用户 {user} 次 · 来自 {sessions} 个会话',
      kpiSkills: '可用技能',
      kpiUsed: '用过的技能',
      kpiCalls: '调用次数',
      kpiNever: '从未使用',
      kpiOrphans: '已卸载 / 未知',
      kpiSkillsSub: '本机 {local} · 内置 {bundled}',
      kpiUsedSub: '占可用技能的 {pct}%',
      kpiCallsSub: '模型 {model} · 用户 {user}',
      kpiNeverSub: '其中 {userOnly} 个只能用 /名称 调用',
      kpiNeverSubPlain: '适合优先检查',
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
      // ---- rail: recent activity ----
      trendTitle: '近 30 天活动',
      trendWindow: '截至最近一次扫描',
      trendEmpty: '近 30 天没有任何技能调用。',
      trendSummary: '共 {calls} 次 · 活跃 {days} 天 · 最高 {peak} 次（{peakDay}）',
      barLabel: '{day} · {count} 次',
      daySpan: '{from} 起',
      // ---- rail: where the catalog comes from ----
      sourceTitle: '来源分布',
      sourceSub: '{n} 个技能',
      sourceRow: '{n} 个 · {calls} 次调用',
      // ---- rail: how a skill can be invoked ----
      modeTitle: '调用方式',
      modeSub: '{n} 个技能',
      invBoth: '模型与用户',
      invBothNote: '模型可自行选用，也能用 /名称 显式调用',
      invUserOnly: '仅用户',
      invUserOnlyNote: '只能用 /名称 显式调用，模型不会自己选它',
      invUserOnlyNever: '{n} 个从未被调用',
      invModelOnly: '仅模型',
      invModelOnlyNote: '只能由模型调用',
      // ---- row detail ----
      expandHint: '展开 {name} 的详情',
      collapseHint: '收起 {name} 的详情',
      detailHeading: '{name} 详情',
      noDescription: '（该技能没有提供说明）',
      factFirst: '首次使用',
      factLast: '最近使用',
      factSessions: '涉及会话',
      factSplit: '模型 / 用户',
      factSource: '来源',
      factProvider: '提供者',
      factInvocation: '可调用方式',
      factCalls: '调用次数',
      none: '—',
      // ---- sorting ----
      sortBy: '按{dim}排序',
      sortActive: '按{dim}排序，当前{dir}',
      sortAsc: '升序',
      sortDesc: '降序',
    }

    const en = {
      panel: 'Skills',
      title: 'Skills',
      subtitle: 'Every skill this machine resolves, and how often each one was called',
      refresh: 'Refresh data',
      refreshing: 'Refreshing…',
      loading: 'Reading skill usage…',
      empty: 'No skill matches.',
      errorTitle: 'Could not read skill usage',
      errorHint: 'Check that the plugin is enabled and DSH has been restarted. Error: {detail}',
      retry: 'Retry',
      search: 'Search skill name or description',
      filterSource: 'Source',
      filterTime: 'Last used',
      optAll: 'All',
      optLocal: 'Local',
      optBuiltin: 'Bundled',
      optToday: 'Today',
      optWeek: 'Last 7 days',
      optMonth: 'Last 30 days',
      pick: '{dim}: {value}',
      tabAll: 'All {count}',
      tabUsed: 'Used {count}',
      tabNever: 'Never used {count}',
      skill: 'Skill',
      source: 'Source',
      srcBuiltin: 'Bundled',
      srcLocal: 'Local',
      buildTag: 'build {build}',
      pagerLabel: 'Skill list pagination',
      pagerRange: '{from}–{to} of {total}',
      pagerPrev: 'Previous page',
      pagerNext: 'Next page',
      pagerPage: 'Page {n}',
      pagerCurrent: 'Page {n}, current page',
      pageSizeOption: '{n} per page',
      pageSizeAria: 'Rows per page',
      today: 'Today',
      yesterday: 'Yesterday',
      daysAgo: '{days}d ago',
      calls: 'Calls',
      lastUsed: 'Last used',
      never: 'Never',
      callsDetail: '{model} model · {user} user · across {sessions} sessions',
      kpiSkills: 'Available skills',
      kpiUsed: 'Skills used',
      kpiCalls: 'Calls',
      kpiNever: 'Never used',
      kpiOrphans: 'Uninstalled / unknown',
      kpiSkillsSub: '{local} local · {bundled} bundled',
      kpiUsedSub: '{pct}% of available skills',
      kpiCallsSub: 'model {model} · user {user}',
      kpiNeverSub: 'of which {userOnly} can only be called by hand',
      kpiNeverSubPlain: 'worth a look first',
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
      trendTitle: 'Last 30 days',
      trendWindow: 'up to the last scan',
      trendEmpty: 'No skill was called in the last 30 days.',
      trendSummary: '{calls} calls · {days} active days · peak {peak} on {peakDay}',
      barLabel: '{day} · {count} calls',
      daySpan: 'since {from}',
      sourceTitle: 'Where they come from',
      sourceSub: '{n} skills',
      sourceRow: '{n} skills · {calls} calls',
      modeTitle: 'How they can be called',
      modeSub: '{n} skills',
      invBoth: 'Model and user',
      invBothNote: 'the model may pick it, or you can call it with /name',
      invUserOnly: 'User only',
      invUserOnlyNote: 'only reachable through an explicit /name call — the model never picks it',
      invUserOnlyNever: '{n} have never been called',
      invModelOnly: 'Model only',
      invModelOnlyNote: 'only the model can call it',
      expandHint: 'Show details for {name}',
      collapseHint: 'Hide details for {name}',
      detailHeading: 'Details for {name}',
      noDescription: '(this skill provides no description)',
      factFirst: 'First used',
      factLast: 'Last used',
      factSessions: 'Sessions',
      factSplit: 'Model / user',
      factSource: 'Source',
      factProvider: 'Provider',
      factInvocation: 'Can be called by',
      factCalls: 'Calls',
      none: '—',
      sortBy: 'Sort by {dim}',
      sortActive: 'Sorted by {dim}, currently {dir}',
      sortAsc: 'ascending',
      sortDesc: 'descending',
    }

    // Five-step ramp, shared by every rule below. Values are deliberately close
    // together: a dashboard reads better when few sizes compete. The title is the
    // single display size and is a token like everything else — it used to be a
    // hard-coded 18px, which quietly contradicted the ramp it sat above.
    const CSS = `
.ui-page {
  --si-fs-2xs: 11px;
  --si-fs-xs: 12px;
  --si-fs-sm: 13px;
  --si-fs-md: 14px;
  --si-fs-title: 19px;
  /* NOT --dsw-font-family-mono. That token does not exist in this theme, so the
     whole stack missed and fell through to the generic "monospace" keyword,
     which on a Chinese Windows install resolves to NSimSun (新宋体) — a
     bitmap-era face that every number and every skill name in this panel was
     silently rendering in. Chrome confirms it: CSS.getPlatformFontsForNode
     reported NSimSun, not any font we actually asked for. --ds-font-family-code
     is the theme's real code stack and lands on Consolas here; it is spelled out
     again as a fallback so the panel survives a rename of the token.

     Family names are unquoted on purpose. CSS allows a multi-word family to be a
     sequence of identifiers, and this value sits inside a JS template literal
     that gets serialised into a <style> element — one round of HTML escaping is
     all it takes to turn "Liberation Mono" into &quot;Liberation Mono&quot; and
     kill the declaration silently, leaving the text to inherit from nowhere. */
  --si-num: var(--ds-font-family-code, Consolas, Menlo, Courier, Microsoft YaHei, monospace);
  /* The one accent every focus ring, bar and active glyph shares.
     NOT --dsw-alias-brand-primary: in the default theme that resolves to
     #0f1115, i.e. the same near-black as body text, so an accent built on it
     is invisible. --dsw-alias-state-business-primary is the DeepSeek blue and
     is what DSH itself uses for focus rings and selection emphasis. */
  --si-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  height: 100%; overflow: auto;
  background: var(--si-canvas); color: var(--dsw-alias-label-primary);
  caret-color: var(--si-accent);
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-border-l4, var(--dsw-alias-border-l2)) transparent;
  /* The query container for the two-column split below. It is deliberately the
     scroller itself: putting it on .ui-inner would wrap the sticky table header
     in a layout-containment box for no gain, and this element's inline size
     already equals the width the shell gave the panel — which is the number the
     layout actually cares about, media queries cannot see it. */
  container-type: inline-size;
  container-name: si;
}
/* The canvas is what was making the light theme read as unfinished. DSH resolves
   bg-base AND bg-layer-1 to the same pure white in light mode, so layer-1 cards
   on a bg-base page were white on white, separated by a 0.5px line and nothing
   else. Dark separates them (#151517 vs #232324) which is why dark always read
   better. neutral-bluish-50 is DSH's own static for a canvas behind white
   surfaces. The reference design is restrained here — its page measures
   rgb(247,248,250) against a pure-white card — so the grey stays a whisper and
   the card edge does the separating. It is applied through
   body:not([data-ds-dark-theme]) so a future rename of the dark attribute can
   only ever lose the grey — never paint a light grey over dark mode. */
.ui-page { --si-canvas: var(--dsw-alias-bg-base); }
body:not([data-ds-dark-theme]) .ui-page {
  --si-canvas: var(--dsw-static-neutral-bluish-50, var(--dsw-alias-bg-base));
}
.ui-inner { max-width: 1200px; margin: 0 auto; padding: 26px 32px 52px; box-sizing: border-box; }

/* Browser surfaces: selection, the caret and the scrollbar ship defaults that
   belong to no design system. They are the cheapest signal that a surface was
   built for its host rather than assembled inside it, and the one thing that is
   almost always skipped. The @supports split is deliberate — color-mix against a
   theme token is the only way to tint the accent without hard-coding a hex, and
   the fallback is a solid accent rather than no selection styling at all. */
.ui-page ::selection { background: var(--si-accent); color: var(--dsw-alias-bg-base); }
@supports (background: color-mix(in srgb, red 20%, transparent)) {
  .ui-page ::selection {
    background: color-mix(in srgb, var(--si-accent) 24%, transparent);
    color: var(--dsw-alias-label-primary);
  }
}
.ui-page::-webkit-scrollbar { width: 10px; height: 10px; }
.ui-page::-webkit-scrollbar-track { background: transparent; }
.ui-page::-webkit-scrollbar-thumb {
  background-color: var(--dsw-alias-border-l4, var(--dsw-alias-border-l2));
  border-radius: 999px; border: 3px solid transparent; background-clip: content-box;
}
.ui-page::-webkit-scrollbar-thumb:hover { background-color: var(--dsw-alias-label-tertiary); }

@media (prefers-reduced-motion: reduce) {
  .ui-page * { transition: none !important; }
}

/* ---- header ---- */
.ui-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.ui-title { font-size: var(--si-fs-title); line-height: 26px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
.ui-subtitle { font-size: var(--si-fs-xs); line-height: 19px; color: var(--dsw-alias-label-secondary); margin: 0; }
.ui-actions { display: flex; align-items: center; gap: 10px; }

.ui-btn {
  appearance: none; font: inherit; font-size: var(--si-fs-xs); line-height: 18px;
  padding: 5px 13px; border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--si-card); color: var(--dsw-alias-label-primary);
  cursor: pointer; transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.ui-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l4); }
.ui-btn:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-btn:disabled { opacity: .5; cursor: default; }
/* The primary action is the solid dark button the reference uses. label-primary
   is the darkest ink in this theme and bg-base is its inverse, which is the same
   pair the selected tab uses — so the two strongest signals on the page agree. */
.ui-btn-primary {
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-label-primary); font-weight: 500;
}
.ui-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary);
  opacity: .88;
}

/* ---- surfaces ---- */
/* One elevation declaration per surface, as the craft floor asks. The shadow is
   DSH's own lv1 — real offset and real blur, so it reads as lift rather than as
   a decorative halo — and the 0.5px stroke stays because on a grey canvas the
   hairline is what keeps a white card crisp at its edges. */
.ui-page {
  --si-card: var(--dsw-alias-bg-layer-1);
  /* The edge, not a shadow. The reference separates its white surfaces with a
     visible hairline; at a canvas this close to white a 4% border disappears and
     the page goes flat again, which was the original complaint. l2 is 10% black. */
  --si-edge: var(--dsw-alias-border-l2);
  /* The expanded row's surface. An inset tint, not another card: the detail
     belongs to the row above it, and giving it a card of its own would have made
     it read as a separate object that happened to be inserted mid-table. In light
     mode layer-2 resolves to the same white as the card, so the tint is the
     accent at 6% instead of a neutral — the only way to say "this is the row you
     opened" without inventing a shadow. */
  --si-inset: var(--dsw-alias-interactive-bg-hover);
}
@supports (background: color-mix(in srgb, red 20%, transparent)) {
  .ui-page { --si-inset: color-mix(in srgb, var(--si-accent) 6%, var(--si-card)); }
}

/* ---- stats ---- */
/* Kept as its own card because the brief is explicit about the shape: stats on
   top, table below. Flex rather than a fixed grid so the strip still drops the
   orphan cell when it is zero — a metric that reports "nothing happened" does
   not deserve a quarter of the panel. */
/* Three separate cards with a gap between them, not one card cut by dividers.
   That is how the reference draws its stat row, and it lets each number keep its
   own surface when the row wraps on a narrow window. */
.ui-kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
/* A 190px basis rather than 1 1 0: a zero basis makes every tile always fit, so
   the fifth (orphans) would squeeze five cards into one row on a narrow window
   instead of wrapping. Wrapping is the honest answer to "there is more to say".
   min-width keeps a single tile from being crushed below legibility. */
.ui-kpi {
  flex: 1 1 190px; min-width: 170px; padding: 13px 16px 14px;
  border: 0.5px solid var(--si-edge); border-radius: 12px;
  background: var(--si-card);
}
.ui-kpi-label { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-secondary); margin-bottom: 5px; }
.ui-kpi-value {
  font-size: 24px; line-height: 1; font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.ui-kpi-sub { font-size: var(--si-fs-2xs); line-height: 15px; color: var(--dsw-alias-label-secondary); margin-top: 6px; }
/* The one KPI that is a problem rather than a statistic announces itself by its
   number's colour alone. It deliberately does NOT also take a background tint:
   the pale accent tint is blue and the warning is amber, and two signal colours
   in one cell disagree about what kind of problem this is. */
.ui-kpi.is-alert .ui-kpi-value { color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-primary)); }

/* ---- layout ---- */
/* One column by default, table first. The rail is a *supporting* region: it must
   never take the top of the reading order, so when there is not enough width for
   both, it moves below the record rather than above it. */
.ui-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.ui-main { min-width: 0; }
/* auto-fit does both jobs with one rule: inside a 320px column it collapses to a
   single file, and when the rail has been pushed full-width underneath the table
   it lays the three cards out side by side. min(100%, 230px) is what stops it
   from overflowing a column narrower than the track's own minimum. */
.ui-rail {
  display: grid; gap: 12px; align-content: start;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
}
.ui-railcard {
  border: 0.5px solid var(--si-edge); border-radius: 12px;
  background: var(--si-card); padding: 12px 14px 13px; min-width: 0;
}
.ui-railhead {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin-bottom: 10px;
}
.ui-railtitle { font-size: var(--si-fs-sm); font-weight: 600; margin: 0; }
.ui-railsub { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.ui-railsummary {
  margin: 8px 0 0; font-size: var(--si-fs-2xs); line-height: 16px;
  color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums;
}

/* ---- rail: recent activity ---- */
/* A real chart, not a sparkline. The per-row 30-day sparkline this panel used to
   carry never drew anything on this machine (every used skill has one or two
   active days, and it needed four), which is why it was deleted. Summed across
   the whole catalog the same data is dense — 29 calls over 7 days, with a peak of
   11 — so the time axis moves from the row, where it was noise, to the rail,
   where it is the only view of it and earns a baseline, dated ticks and a
   sentence that states every number the bars encode. */
.ui-trend { display: flex; align-items: flex-end; gap: 2px; height: 74px; }
/* Zero days keep a 3px stub in the track colour so the axis reads as a
   continuous month instead of a row of gaps. */
.ui-trend-bar {
  display: block; flex: 1 1 0; min-width: 0; align-self: flex-end;
  border-radius: 2px; background: var(--dsw-alias-border-l2);
}
.ui-trend-bar.is-on { background: var(--si-accent); }
.ui-trend-axis {
  display: flex; justify-content: space-between; gap: 8px;
  margin-top: 6px; font-size: var(--si-fs-2xs);
  color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums;
}

/* ---- rail: distributions ---- */
/* One row shape serves both rail cards: a label with its numbers on the right, a
   magnitude bar underneath, and an optional sentence. The bar only restates the
   number printed next to it, which is what keeps the rail readable without
   reading any length. */
.ui-dist { display: flex; flex-direction: column; gap: 11px; }
.ui-dist-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
.ui-dist-label { font-size: var(--si-fs-xs); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-dist-nums { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ui-dist-track {
  display: block; height: 5px; border-radius: 999px;
  background: var(--dsw-alias-border-l2); overflow: hidden;
}
.ui-dist-bar { display: block; height: 100%; border-radius: 999px; background: var(--si-accent); }
.ui-dist-note { margin-top: 5px; font-size: var(--si-fs-2xs); line-height: 15px; color: var(--dsw-alias-label-secondary); }

/* ---- card ---- */
/* No overflow:hidden here, deliberately. It would turn the card into a
   scrollport, and a sticky table header sticks to its nearest scrolling
   ancestor — the page, which is what we want. Any clipping-based tidy-up here
   would silently kill the sticky header. The frame is closed with padding. */
.ui-card {
  border: 0.5px solid var(--si-edge); border-radius: 12px;
  background: var(--si-card); margin-bottom: 14px;
}
/* ---- tabs + filters ---- */
/* Status tabs that carry their own counts, not a "show unused" checkbox. The
   count is the point: it says how big each bucket is before you spend a click on
   it, and it is what makes the panel's answer actionable. They sit on the canvas
   above the card, the way the reference draws them — inside the card they would
   read as part of the table. */
.ui-tabs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.ui-chip {
  appearance: none; font: inherit; font-size: var(--si-fs-xs); line-height: 18px;
  padding: 6px 14px; border-radius: 999px;
  border: 0.5px solid var(--si-edge);
  background: var(--si-card); color: var(--dsw-alias-label-primary);
  cursor: pointer; font-variant-numeric: tabular-nums;
  transition: background-color .18s ease, border-color .18s ease, color .18s ease;
}
.ui-chip:hover:not(.is-active) { background: var(--dsw-alias-interactive-bg-hover); }
.ui-chip:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
/* The selected chip is the solid inverse rather than accent blue: blue is already
   the colour of every bar below it, and a blue chip competes with them. */
.ui-chip.is-active {
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-label-primary); font-weight: 500;
}

.ui-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ui-input {
  flex: 1 1 240px; min-width: 170px; font: inherit; font-size: var(--si-fs-sm);
  padding: 7px 12px; border-radius: 8px; box-sizing: border-box;
  border: 0.5px solid var(--si-edge);
  background: var(--si-card); color: var(--dsw-alias-label-primary);
  transition: border-color .18s ease;
}
.ui-input::placeholder { color: var(--dsw-alias-label-secondary); }
.ui-input:focus { border-color: var(--si-accent); }
.ui-input:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 1px; }
/* A native select, restyled to sit beside the search field. appearance: none plus
   two gradient wedges is the whole custom arrow — no icon font, no background
   image, and the wedges are painted in currentColor so they follow the theme. */
.ui-select {
  font: inherit; font-size: var(--si-fs-sm); padding: 7px 30px 7px 12px;
  border-radius: 8px; border: 0.5px solid var(--si-edge);
  background-color: var(--si-card); color: var(--dsw-alias-label-primary);
  cursor: pointer; appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 16px) 53%, calc(100% - 11px) 53%;
  background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  transition: border-color .18s ease;
}
.ui-select:focus { border-color: var(--si-accent); }
.ui-select:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 1px; }
/* Bottom padding closes the card under the last row, whose own border is
   removed; at 2px the table used to bleed into the card's lower edge. */
.ui-tablewrap { padding: 0 14px 8px; }
/* The list footer sits inside the card, under the last row, and its top rule
   doubles as the table's bottom edge — the last row deliberately has none. The
   side padding matches .ui-tablewrap so the range text lines up with the first
   column rather than with the card's edge. */
.ui-pager {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px;
  padding: 8px 14px 9px; border-top: 0.5px solid var(--si-edge);
  font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-secondary);
}
.ui-pager-range { margin-right: auto; font-variant-numeric: tabular-nums; }
.ui-pager-size { flex: none; height: 26px; padding: 0 26px 0 9px; background-size: 5px 5px, 5px 5px; }
.ui-pager-nav { display: flex; align-items: center; gap: 1px; }
.ui-page-btn {
  min-width: 26px; height: 26px; padding: 0 7px;
  border: 0.5px solid transparent; border-radius: 7px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: var(--si-fs-2xs);
  font-variant-numeric: tabular-nums; cursor: pointer;
  transition: background-color .18s ease, border-color .18s ease;
}
.ui-page-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.ui-page-btn:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 1px; }
/* Three cues for "you are here" — a rule, a tint and weight — because the border
   alone is a hairline and the tint alone is a whisper. */
.ui-page-btn[aria-current='page'] { border-color: var(--si-edge); background: var(--si-inset); font-weight: 600; }
.ui-page-btn:disabled { opacity: .4; cursor: default; }
.ui-page-gap { min-width: 14px; text-align: center; }
/* The two text buttons are the first thing to go when the row runs out of width:
   the numbers still say where you are, and 上一页 / 下一页 are two CJK characters
   each of pure chrome next to them. */
@media (max-width: 560px) {
  .ui-pager-range { flex: 1 1 100%; margin-right: 0; }
}

/* ---- table ---- */
/* The page is the vertical scroller, not this card, so the header can stick to
   the top of the viewport. That is also why the table has no horizontal scroll
   wrapper: an overflow container would capture the sticky axis and kill it. */
/* table-layout: fixed is load-bearing, not cosmetic. Under the default auto,
   the widest cell contributes its whole content as that column's min-content
   width, so an explicit percentage on column one is silently ignored: the column
   swallows the table and the rest are pushed clean out of the viewport — which
   reads as a one-column table with text spilling off the card. Fixed layout is
   what makes the percentage widths and the ellipsis take effect. */
.ui-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: var(--si-fs-sm); }
.ui-table th {
  position: sticky; top: 0; z-index: 2;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: inset 0 -0.5px 0 var(--dsw-alias-border-l1);
  text-align: left; font-weight: 500; font-size: var(--si-fs-2xs);
  color: var(--dsw-alias-label-secondary);
  padding: 6px 10px; white-space: nowrap;
}
.ui-table td {
  text-align: left; padding: 7px 10px; vertical-align: middle;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  font-variant-numeric: tabular-nums;
  transition: background-color .18s ease;
}
.ui-table tbody tr:hover td { background: var(--dsw-alias-interactive-bg-hover); }
.ui-table tbody tr:last-child td { border-bottom: 0; }
.ui-table th:first-child, .ui-table td:first-child { text-align: left; padding-left: 0; }
.ui-table th:last-child, .ui-table td:last-child { padding-right: 0; }
/* Explicit widths: with table-layout: fixed these are read from the header row
   only. Four columns, matching the reference: the skill, how much it is used,
   when it was last used, and where it came from. The model/user split and the
   session count that used to hold three more columns still answer follow-up
   questions rather than the first one, so they live in the expanded row and in
   the call count's tooltip — the row itself stays four facts wide. */
.ui-table th:nth-child(1) { width: 44%; }
.ui-table th:nth-child(2) { width: 17%; }
.ui-table th:nth-child(3) { width: 19%; }
.ui-table th:nth-child(4) { width: 20%; }

/* Sortable headers. The whole label is the control, so the hit target is the
   text rather than a 9px arrow, and the arrow is drawn as SVG rather than as a
   Unicode glyph — a triangle character is a font's idea of an arrow and changes
   shape with the family we are least sure about on this machine. */
.ui-sort {
  appearance: none; background: none; border: 0; margin: 0; padding: 0;
  display: inline-flex; align-items: center; gap: 4px;
  font: inherit; font-size: inherit; font-weight: inherit; color: inherit;
  cursor: pointer; border-radius: 4px;
}
.ui-sort:hover { color: var(--dsw-alias-label-primary); }
.ui-sort:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-sort-icon { display: block; flex: none; width: 9px; height: 9px; color: var(--si-accent); }

/* One line per skill: the name, plus any badges. The description moved into the
   row's tooltip and the expanded row, which is what lets the table show twice as
   many rows — the second line was the whole reason a reader could only ever see
   a dozen. */
.ui-skill { display: flex; align-items: center; gap: 7px; min-width: 0; }
/* The disclosure owns the first cell: the caret AND the name are one button, so
   a row is one focus stop rather than two, and the target is the thing you were
   already aiming at. */
.ui-disclosure {
  appearance: none; background: none; border: 0; margin: 0; padding: 0;
  display: flex; align-items: center; gap: 7px; min-width: 0;
  font: inherit; color: inherit; cursor: pointer; border-radius: 6px;
}
.ui-disclosure:hover .ui-skill-name { color: var(--si-accent); }
.ui-disclosure:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-caret { display: block; flex: none; width: 12px; height: 12px; color: var(--dsw-alias-label-tertiary); transition: transform .18s ease; }
.ui-caret.is-open { transform: rotate(90deg); }
/* Sans, not monospace. The reference draws its skill names in the UI face at a
   bold weight, and so does DSH itself: the host reserves the code stack for
   markdown code and sets everything else in --dsw-font-family. Monospace here
   was this file's own idea, and it is what made the names feel wrong — the
   identifiers carried hyphens at uniform advance width, which reads as cramped
   even once the font resolved correctly. Alignment still holds where it matters,
   because every numeric cell carries tabular-nums. */
.ui-skill-name {
  font-size: var(--si-fs-sm); font-weight: 600;
  color: var(--dsw-alias-label-primary);
  flex: 0 1 auto;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: color .18s ease;
}
/* The description is a tooltip now, so it is no longer visible text. This keeps
   it in the accessibility tree, where a bare title attribute on a div is not
   reliably announced. */
.ui-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.ui-badge {
  font-family: inherit; font-size: var(--si-fs-2xs); line-height: 15px; font-weight: 500;
  padding: 0 6px; border-radius: 999px; white-space: nowrap;
  border: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.ui-badge-warn { border-color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l2)); color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-secondary)); }

.ui-source { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-secondary); }

/* The call count with its share bar underneath, the way the reference draws it:
   the number first, the magnitude second. The bar restates the number and never
   replaces it, so nothing here depends on reading a length. A zero draws an
   empty track rather than no bar, so the column keeps its rhythm. */
.ui-calls-wrap { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.ui-calls-num { font-weight: 600; font-size: var(--si-fs-md); line-height: 1; font-variant-numeric: tabular-nums; }
.ui-calls-track {
  display: block; width: 68px; max-width: 100%; height: 4px;
  border-radius: 999px; background: var(--dsw-alias-border-l2); overflow: hidden;
}
.ui-calls-bar { display: block; height: 100%; border-radius: 999px; background: var(--si-accent); }

/* ---- expanded row ---- */
/* The detail opens inside the record, under the row it belongs to. Not a modal:
   nothing here needs protected focus, and a modal would hide the table that is
   the reason you opened it. */
.ui-detail-row td { background: var(--si-inset); border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.ui-table tbody tr.ui-detail-row:hover td { background: var(--si-inset); }
.ui-detail-cell { padding: 12px 10px 14px 19px; }
.ui-detail-desc {
  margin: 0 0 12px; max-width: 78ch;
  font-size: var(--si-fs-sm); line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.ui-detail-facts {
  display: grid; gap: 10px 18px; margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
}
.ui-fact { min-width: 0; }
.ui-fact dt { font-size: var(--si-fs-2xs); line-height: 15px; color: var(--dsw-alias-label-secondary); margin-bottom: 3px; }
.ui-fact dd { margin: 0; font-size: var(--si-fs-xs); line-height: 18px; font-variant-numeric: tabular-nums; }

/* ---- states ---- */
.ui-empty, .ui-error {
  border: 0.5px dashed var(--dsw-alias-border-l2); border-radius: 12px;
  padding: 28px; text-align: center; font-size: var(--si-fs-sm);
  background: var(--si-card);
  color: var(--dsw-alias-label-secondary);
}
.ui-error { border-style: solid; border-color: var(--dsw-alias-state-error-primary, var(--dsw-alias-border-l2)); color: var(--dsw-alias-label-primary); }
.ui-error code { font-family: var(--si-num); font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-tertiary); }
.ui-actions-row { margin-top: 14px; }
.ui-warn {
  display: flex; gap: 8px; align-items: flex-start; font-size: var(--si-fs-xs); line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  border: 0.5px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l1));
  border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
}

/* ---- footer ---- */
/* Secondary, not tertiary — and this one is not negotiable. The footer reads as
   disposable grey, but it carries provenance: which home was scanned, how many
   sessions, when, and how many could not be read. On the grey canvas tertiary
   measures 3.18:1, which is worse than it was on white. Provenance is the one
   thing this panel exists to be trusted about. */
.ui-footer { font-size: var(--si-fs-2xs); line-height: 17px; color: var(--dsw-alias-label-secondary); }
.ui-footer code { font-family: var(--si-num); }
.ui-basis { margin-top: 8px; }
.ui-basis summary { cursor: pointer; border-radius: 6px; width: fit-content; padding: 1px 0; text-underline-offset: 2px; }
.ui-basis summary:focus-visible { outline: 2px solid var(--si-accent); outline-offset: 2px; }
.ui-basis-text { margin: 6px 0 0; max-width: 76ch; }
/* Small, monospace, and honest about being machinery rather than content. */
.ui-build {
  margin-top: 10px; font-family: var(--si-num); font-variant-numeric: tabular-nums;
  font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-tertiary);
}

/* ---- the two-column split ---- */
/* Asked of the panel's own width, not the viewport's: the shell's sidebar and the
   panel's 1200px cap both change how much room the table really has, and a media
   query can see neither. 1060px is where the table still keeps ~660px for four
   columns after the rail takes its 320px. Below that the rail drops under the
   table and lays itself out three across, so nothing is ever hidden to fit. */
@container si (min-width: 1060px) {
  .ui-layout { grid-template-columns: minmax(0, 1fr) 320px; }
}
/* A browser without container queries gets the single-column reading order,
   which is complete — just taller. */
@supports not (container-type: inline-size) {
  @media (min-width: 1280px) {
    .ui-layout { grid-template-columns: minmax(0, 1fr) 320px; }
  }
}

/* ---- narrow layouts ---- */
/* Nothing is hidden. The table is down to four columns that all answer a
   question, and at 680px the narrowest of them still gets ~110px, so the rules
   that once dropped columns by class were removing information to solve a problem
   the column cut had already solved. */
@media (max-width: 900px) {
  .ui-inner { padding: 20px 18px 40px; }
  .ui-kpi { flex: 1 1 42%; }
}
/* Two up, not one up. Full-width tiles put four stacked cards between the title
   and the table and pushed the record — the thing this panel is *for* — below the
   fold on the very widths where scrolling is most expensive. Two columns still
   fits every sub-line, and the row stays a strip rather than becoming a list. */
@media (max-width: 420px) {
  .ui-kpi { flex: 1 1 100%; }
}
`

    function formatCount(value) {
      return (Number(value) || 0).toLocaleString()
    }

    /**
     * A bar's width in percent. Clamped at 100 because the rail's denominators
     * come from `totals` while its numerators come from the rows, and a payload
     * where the two disagree would otherwise paint a bar straight out of its
     * track. The clamp is a guard, not a correction: nothing here is silently
     * rounded towards a nicer number.
     */
    function shareOf(part, whole) {
      const total = Number(whole) || 0
      if (total <= 0) return 0
      return Math.min(100, Math.round(((Number(part) || 0) / total) * 100))
    }

    /**
     * The page numbers worth drawing, as numbers with `null` standing for an
     * elided run: the first page, the last page, and the current one with one
     * neighbour either side.
     *
     * Up to seven pages are all drawn. Eliding a five-page list down to "1 2 … 5"
     * saves two buttons and costs the reader two clicks, and the two pages it
     * hides are ones they could otherwise just look at; the window only starts
     * earning its keep once the count outgrows a row. This catalog offers at most
     * five pages at its smallest page size, so in practice nothing is ever elided
     * — the branch exists for the catalog that eventually does outgrow it.
     */
    function pageWindow(page, count, span) {
      const keepAll = count <= 7
      const out = []
      let previous = 0
      for (let n = 1; n <= count; n += 1) {
        if (!keepAll && n !== 1 && n !== count && Math.abs(n - page) > span) continue
        if (previous && n - previous > 1) out.push(null)
        out.push(n)
        previous = n
      }
      return out
    }

    /**
     * Where a skill came from, in words.
     *
     * The registry says `bundled` for skills shipped with DSH and leaves the
     * field empty for everything found under the local skill roots. Printing that
     * empty string as `—` was worse than useless: a dash in that column is
     * indistinguishable from "unknown", which is precisely what the orphan badge
     * next to the name already means. Anything genuinely unrecognised keeps its
     * raw value rather than being guessed at.
     */
    function sourceLabel(row, t) {
      // A skill that no longer resolves has no source to report: anything printed
      // here would be a guess, and "本机" is the guess that reads as a fact.
      if (row.cataloged === false) return t('none')
      if (row.source === 'bundled') return t('srcBuiltin')
      if (!row.source || row.source === 'user-agents') return t('srcLocal')
      return row.source
    }

    /**
     * How long ago, in words.
     *
     * The cell used to print an absolute, year-less timestamp ("10月13日 10:45"),
     * which needed ~104px it did not have at sidebar-open widths and overflowed
     * into its neighbour — fixed layout means a percentage column never grows to
     * fit its content. A relative form answers the question the column actually
     * asks ("is this still alive?"), fits anywhere, and the absolute timestamp
     * stays reachable as the native tooltip and in the expanded row.
     */
    function formatRelative(ts, t) {
      const n = Number(ts) || 0
      if (n <= 0) return ''
      const days = Math.floor((Date.now() - n) / 86400000)
      if (days <= 0) return t('today')
      if (days === 1) return t('yesterday')
      return format(t('daysAgo'), { days: formatCount(days) })
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

    /**
     * The same instant with its year and without its time-of-day ambiguity. Used
     * only in the expanded row, where there is room for it: "首次使用" is a fact
     * about this skill's whole history, and a year-less answer to "when did I
     * first use this" is not an answer.
     */
    function formatFullTime(ts, locale) {
      const n = Number(ts) || 0
      if (n <= 0) return ''
      try {
        return new Date(n).toLocaleString(String(locale).startsWith('zh') ? 'zh-CN' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return new Date(n).toISOString().slice(0, 16).replace('T', ' ')
      }
    }

    /** A chart tick / tooltip date: `10月24日` / `Oct 24`. */
    function formatDay(date, locale) {
      try {
        return date.toLocaleDateString(String(locale).startsWith('zh') ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
        })
      } catch {
        return `${date.getMonth() + 1}/${date.getDate()}`
      }
    }

    /**
     * The day each slot in a `trend` array stands for, oldest first.
     *
     * Anchored to the scan time rather than to `Date.now()`: the array was built
     * by the Host from its own clock, and a panel left open across midnight would
     * otherwise slide every label one day without any data changing. The Host's
     * rule is local midday minus N days, which is also what keeps this correct
     * across a DST boundary.
     */
    function trendDates(count, anchor) {
      const base = new Date(Number(anchor) || Date.now())
      base.setHours(12, 0, 0, 0)
      const out = []
      for (let i = count - 1; i >= 0; i -= 1) out.push(new Date(base.getTime() - i * 86400000))
      return out
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
     * The row caret and the sort arrow. Drawn, not typeset: `▸` and `▲` are a
     * font's idea of an arrow, they change silhouette with whichever family
     * actually resolved, and on this machine the fallback for a missing glyph is
     * exactly the kind of surprise the font defect in §11.9 came from. One
     * authored triangle each, 1.25px stroke, painted in currentColor so both
     * follow the theme and both inherit from the control that owns them.
     */
    function CaretIcon({ open }) {
      return h(
        'svg',
        { className: open ? 'ui-caret is-open' : 'ui-caret', viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', {
          d: 'M4.2 2.2L8.1 6L4.2 9.8',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function SortIcon({ dir }) {
      return h(
        'svg',
        { className: 'ui-sort-icon', viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', {
          d: dir === 'asc' ? 'M6 2.5L9.4 7.8H2.6Z' : 'M6 9.5L2.6 4.2H9.4Z',
          fill: 'currentColor',
        }),
      )
    }

    function Kpi({ label, value, sub, alert }) {
      return h(
        'div',
        { className: alert ? 'ui-kpi is-alert' : 'ui-kpi' },
        h('div', { className: 'ui-kpi-label' }, label),
        h('div', { className: 'ui-kpi-value' }, value),
        sub ? h('div', { className: 'ui-kpi-sub' }, sub) : null,
      )
    }

    function RailCard({ title, sub, children }) {
      return h(
        'section',
        { className: 'ui-railcard' },
        h(
          'div',
          { className: 'ui-railhead' },
          h('h2', { className: 'ui-railtitle' }, title),
          sub ? h('span', { className: 'ui-railsub' }, sub) : null,
        ),
        children,
      )
    }

    /**
     * One row of a rail distribution: label, numbers, magnitude bar, and an
     * optional list of sentences. Shared by both distribution cards so the two
     * read as the same kind of statement rather than as two different widgets.
     *
     * Each sentence is its own element rather than one joined string. The mode
     * card has two things to say about its user-only bucket, and at rail width the
     * join wrapped mid-phrase with the last three characters stranded on a line of
     * their own — a widow is a layout defect, not a reason to delete the fact.
     */
    function DistRow({ label, value, notes, share }) {
      return h(
        'div',
        { className: 'ui-dist-row' },
        h(
          'div',
          { className: 'ui-dist-top' },
          h('span', { className: 'ui-dist-label', title: label }, label),
          h('span', { className: 'ui-dist-nums' }, value),
        ),
        h('span', { className: 'ui-dist-track' }, h('i', { className: 'ui-dist-bar', style: { width: `${share}%` } })),
        ...(notes || []).map((note, index) => h('div', { key: index, className: 'ui-dist-note' }, note)),
      )
    }

    /**
     * The trailing-30-day chart.
     *
     * Every value the bars encode is also printed in the sentence underneath —
     * total, active days, peak and the day it happened — so the chart is a second
     * statement of the same facts, never the only one. Each bar carries its own
     * `aria-label`, which is how a reader without a mouse gets a single day.
     */
    function TrendChart({ counts, dates, locale, t }) {
      const total = counts.reduce((sum, n) => sum + n, 0)
      if (total <= 0) return h('p', { className: 'ui-railsummary' }, t('trendEmpty'))

      const peak = counts.reduce((max, n) => Math.max(max, n), 0)
      const peakIndex = counts.indexOf(peak)
      const activeDays = counts.filter((n) => n > 0).length
      const barLabel = (index) =>
        format(t('barLabel'), { day: formatDay(dates[index], locale), count: formatCount(counts[index]) })

      const bars = counts.map((value, index) =>
        h('span', {
          key: index,
          className: value > 0 ? 'ui-trend-bar is-on' : 'ui-trend-bar',
          style: { height: value > 0 ? `${Math.max(8, Math.round((value / peak) * 100))}%` : '3px' },
          title: barLabel(index),
          role: 'img',
          'aria-label': barLabel(index),
        }),
      )

      // Three dated ticks, one per visible edge of the axis. More than three
      // collides at rail width, and the tooltips carry every other day.
      const last = counts.length - 1
      const ticks = [0, Math.floor(last / 2), last].map((index) =>
        h('span', { key: index }, formatDay(dates[index], locale)),
      )

      return h(
        'div',
        null,
        h('div', { className: 'ui-trend', role: 'group', 'aria-label': t('trendTitle') }, bars),
        h('div', { className: 'ui-trend-axis', 'aria-hidden': true }, ticks),
        h(
          'p',
          { className: 'ui-railsummary' },
          format(t('trendSummary'), {
            calls: formatCount(total),
            days: formatCount(activeDays),
            peak: formatCount(peak),
            peakDay: formatDay(dates[peakIndex], locale),
          }),
        ),
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
      // Three independent narrowings, the way the reference splits them: which
      // bucket, where it came from, and when it last ran. The bucket replaced a
      // "show unused" checkbox — a checkbox can only say yes or no, and the
      // question here is really "which of these three piles am I looking at".
      const [tab, setTab] = React.useState('all')
      const [sourceFilter, setSourceFilter] = React.useState('all')
      const [timeFilter, setTimeFilter] = React.useState('all')
      // Sorting arrived with the rail: the "从未使用" pile is 79 rows of names
      // that all share the same call count, which is exactly the pile where
      // alphabetical order is the only useful order and no fixed one is right.
      const [sort, setSort] = React.useState({ key: 'calls', dir: 'desc' })
      // One row at a time. The detail is long (a 900-character description is
      // normal here), so allowing several open would turn the table into a
      // document; one is what keeps the record scannable.
      const [expanded, setExpanded] = React.useState(null)
      // Paging is client-side and deliberate: the Host already sends the whole
      // catalog because the KPI strip and the rail are statements about all of it,
      // so a Host-side page would make those numbers depend on which page you are
      // looking at. At 98 rows the slice costs nothing.
      //
      // Every setter that changes *what is listed* — tab, any filter, the search
      // box, the sort key, the page size — also resets this to 1, because page 3
      // of the old listing means nothing in the new one. The clamp in `safePage`
      // below is a separate job: it is the invariant that an empty page can never
      // be rendered, whatever the state does.
      const [page, setPage] = React.useState(1)
      const [pageSize, setPageSize] = React.useState(PAGE_SIZES[0])

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
        // Orphans are a partition of the same table, not a separate section.
        return [...orphans, ...skills]
      }, [data])

      /** One definition of "used", shared by the tabs and the filter, so a tab
          count can never disagree with the rows it reveals. */
      const isUsed = (row) => (Number(row.calls) || 0) > 0

      const tabCounts = React.useMemo(
        () => ({
          all: allRows.length,
          used: allRows.filter(isUsed).length,
          never: allRows.filter((row) => !isUsed(row)).length,
        }),
        [allRows],
      )

      /**
       * How many trailing days the payload actually carries. Read from the rows
       * rather than assumed, because a Host that predates the chart sends a
       * shorter array (and the render check feeds one), and a chart drawn from
       * `TREND_DAYS` would then read past the end and print `NaN`.
       */
      const trendLength = React.useMemo(
        () => allRows.reduce((max, row) => Math.max(max, Array.isArray(row.trend) ? row.trend.length : 0), 0),
        [allRows],
      )

      /** The catalog's activity per day, summed across every row. */
      const trendCounts = React.useMemo(() => {
        if (trendLength <= 0) return []
        const out = new Array(trendLength).fill(0)
        for (const row of allRows) {
          const trend = Array.isArray(row.trend) ? row.trend : []
          for (let i = 0; i < trendLength; i += 1) out[i] += Number(trend[i]) || 0
        }
        return out
      }, [allRows, trendLength])

      const tracked = (data && data.tracked) || {}
      const trendAxis = React.useMemo(
        () => (trendLength > 0 ? trendDates(trendLength, tracked.scannedAt) : []),
        [trendLength, tracked.scannedAt],
      )

      const rows = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        const now = Date.now()
        const filtered = allRows.filter((row) => {
          if (tab === 'used' && !isUsed(row)) return false
          if (tab === 'never' && isUsed(row)) return false
          if (sourceFilter === 'bundled' && row.source !== 'bundled') return false
          if (sourceFilter === 'local' && row.source === 'bundled') return false
          if (timeFilter !== 'all') {
            const lastAt = Number(row.lastAt) || 0
            // A skill that never ran has no last-used date, so it cannot match a
            // recency window. That is the honest answer, not a zero.
            if (lastAt <= 0) return false
            const days = (now - lastAt) / 86400000
            if (timeFilter === 'today' && days >= 1) return false
            if (timeFilter === 'week' && days > 7) return false
            if (timeFilter === 'month' && days > 30) return false
          }
          if (!needle) return true
          return (
            String(row.name).toLowerCase().includes(needle) ||
            String(row.description).toLowerCase().includes(needle)
          )
        })

        const compare = {
          name: (a, b) => String(a.name).localeCompare(String(b.name)),
          calls: (a, b) => (Number(a.calls) || 0) - (Number(b.calls) || 0),
          lastAt: (a, b) => (Number(a.lastAt) || 0) - (Number(b.lastAt) || 0),
          source: (a, b) => sourceLabel(a, t).localeCompare(sourceLabel(b, t)),
        }[sort.key]

        return filtered.sort((a, b) => {
          // Orphans stay pinned above the catalog no matter which key is active.
          // It is one documented rule rather than a per-key exception, and the
          // row that says "you called something that no longer exists" is worth
          // more than any sort order it would otherwise be buried in.
          if (Boolean(a.cataloged) !== Boolean(b.cataloged)) return a.cataloged ? 1 : -1
          const base = compare ? compare(a, b) : 0
          const directed = sort.dir === 'asc' ? base : -base
          return directed !== 0 ? directed : String(a.name).localeCompare(String(b.name))
        })
      }, [allRows, query, tab, sourceFilter, timeFilter, sort, t])

      // Which slice of `rows` is on screen. The clamp is what makes an empty page
      // impossible: if a narrowing drops the listing to 30 rows while the reader
      // sits on page 5, the last real page is shown rather than a blank table with
      // a page number in it.
      const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
      const safePage = Math.min(Math.max(1, page), pageCount)
      const pageStart = (safePage - 1) * pageSize
      const pageRows = React.useMemo(
        () => rows.slice(pageStart, pageStart + pageSize),
        [rows, pageStart, pageSize],
      )

      // Share bars are scaled against the whole catalog, not the filtered view,
      // so a filter does not silently restate every bar.
      const peakCalls = React.useMemo(
        () => allRows.reduce((max, row) => Math.max(max, Number(row.calls) || 0), 0),
        [allRows],
      )

      const totals = (data && data.totals) || {}

      /** The catalog split by where it was found. */
      const sourceRows = React.useMemo(() => {
        const buckets = new Map()
        for (const row of allRows) {
          const label = sourceLabel(row, t)
          const entry = buckets.get(label) || { label, skills: 0, calls: 0 }
          entry.skills += 1
          entry.calls += Number(row.calls) || 0
          buckets.set(label, entry)
        }
        return [...buckets.values()].sort((a, b) => b.skills - a.skills || a.label.localeCompare(b.label))
      }, [allRows, t])

      /**
       * The catalog split by who is allowed to call it.
       *
       * This is the card that answers the question the "从未使用" tile raises: a
       * skill the model cannot pick can only ever be reached by typing its name,
       * so counting it as neglected would be reading the flag as a verdict. On
       * this machine all 20 of them have never been called, which is exactly the
       * fact worth printing rather than one worth hiding behind a total.
       */
      const modeRows = React.useMemo(() => {
        const rowsOut = []
        const add = (key, notes, mine) => {
          const matched = allRows.filter(mine)
          if (matched.length === 0) return
          rowsOut.push({ key, label: t(key), skills: matched.length, notes: notes(matched) })
        }
        add('invBoth', () => [t('invBothNote')], (row) => row.modelInvocable !== false && row.userInvocable !== false)
        add(
          'invUserOnly',
          (matched) => {
            const never = matched.filter((row) => !isUsed(row)).length
            const out = [t('invUserOnlyNote')]
            // Only said when it is true. "0 of them have never been called" is not
            // a fact worth a line, and printing it would train the reader to skip
            // the line that matters.
            if (never > 0) out.push(format(t('invUserOnlyNever'), { n: formatCount(never) }))
            return out
          },
          (row) => row.userInvocable !== false && row.modelInvocable === false,
        )
        add('invModelOnly', () => [t('invModelOnlyNote')], (row) => row.modelInvocable !== false && row.userInvocable === false)
        return rowsOut
      }, [allRows, t])

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
              className: 'ui-btn ui-btn-primary',
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

      // Available = used + never used. The tiles are a partition of one number,
      // not three unrelated figures, and the one worth acting on carries the
      // colour the reference gives it.
      const never = Math.max(0, (Number(totals.skills) || 0) - (Number(totals.used) || 0))
      const bundled = allRows.filter((row) => row.source === 'bundled').length
      const local = Math.max(0, (Number(totals.skills) || 0) - bundled)
      // The tile is honest about *why* a skill is idle: one that only a human can
      // invoke has never been offered to the model in the first place.
      const idleUserOnly = allRows.filter((row) => !isUsed(row) && row.userInvocable !== false && row.modelInvocable === false).length

      const kpis = h(
        'div',
        { className: 'ui-kpis' },
        h(Kpi, {
          key: 'skills',
          label: t('kpiSkills'),
          value: formatCount(totals.skills),
          sub: format(t('kpiSkillsSub'), { local: formatCount(local), bundled: formatCount(bundled) }),
        }),
        h(Kpi, {
          key: 'used',
          label: t('kpiUsed'),
          value: formatCount(totals.used),
          // Shares rather than repeats. The call total used to sit here as well,
          // which printed 64 twice in one strip once the calls tile arrived; a
          // proportion says something the tiles beside it do not.
          sub: format(t('kpiUsedSub'), {
            pct: totals.skills > 0 ? Math.round(((Number(totals.used) || 0) / totals.skills) * 100) : 0,
          }),
        }),
        // The strip is four tiles wide by design: three left a 1136px row holding
        // 370px cards with room for eight characters, which read as dead space
        // rather than as calm. The fourth carries the model/user split of the call
        // total — a fact that was not on the panel anywhere before, and the one
        // that says how much of this catalog the model is actually choosing.
        h(Kpi, {
          key: 'calls',
          label: t('kpiCalls'),
          value: formatCount(totals.calls),
          sub: format(t('kpiCallsSub'), { model: formatCount(totals.model), user: formatCount(totals.user) }),
        }),
        h(Kpi, {
          key: 'never',
          label: t('kpiNever'),
          value: formatCount(never),
          sub: idleUserOnly > 0 ? format(t('kpiNeverSub'), { userOnly: formatCount(idleUserOnly) }) : t('kpiNeverSubPlain'),
          alert: true,
        }),
        // Rendered only when there is something to report. A zero here is the
        // healthy case, and a permanent quarter-panel reading "0" was the single
        // biggest source of dead space in the strip; when it does appear it is
        // coloured as a problem, so the panel gets louder exactly when it should.
        totals.orphans > 0
          ? h(Kpi, {
              key: 'orphans',
              label: t('kpiOrphans'),
              value: formatCount(totals.orphans),
              sub: format(t('kpiOrphansSub'), { calls: formatCount(totals.orphanCalls) }),
              alert: true,
            })
          : null,
      )

      const warning =
        data && data.catalogComplete === false ? h('div', { className: 'ui-warn' }, t('catalogIncomplete')) : null

      // Status tabs with counts. aria-pressed rather than role=tab: a real tab
      // strip owes the reader a tabpanel and arrow-key handling, and this is a
      // filter group that happens to look like tabs.
      const tabs = h(
        'div',
        { className: 'ui-tabs' },
        ...[
          ['all', 'tabAll'],
          ['used', 'tabUsed'],
          ['never', 'tabNever'],
        ].map(([key, label]) =>
          h(
            'button',
            {
              key,
              type: 'button',
              'aria-pressed': tab === key ? 'true' : 'false',
              className: tab === key ? 'ui-chip is-active' : 'ui-chip',
              onClick: () => {
                setTab(key)
                setPage(1)
              },
            },
            format(t(label), { count: formatCount(tabCounts[key]) }),
          ),
        ),
      )

      // Both dropdowns would otherwise read "全部" side by side, with the
      // dimension buried in an aria-label that no sighted reader ever sees. The
      // reference spells the dimension into the control itself, so this does.
      const pick = (dim, value) => format(t('pick'), { dim: t(dim), value: t(value) })

      const filters = h(
        'div',
        { className: 'ui-filters' },
        h('input', {
          className: 'ui-input',
          type: 'search',
          value: query,
          placeholder: t('search'),
          'aria-label': t('search'),
          onChange: (event) => {
            setQuery(event.target.value)
            setPage(1)
          },
        }),
        h(
          'select',
          {
            className: 'ui-select',
            value: sourceFilter,
            'aria-label': t('filterSource'),
            onChange: (event) => {
              setSourceFilter(event.target.value)
              setPage(1)
            },
          },
          h('option', { value: 'all' }, pick('filterSource', 'optAll')),
          h('option', { value: 'local' }, pick('filterSource', 'optLocal')),
          // 'bundled', not 'builtin'. The label says 内置 and the filter compares
          // `row.source === 'bundled'`; the value in between said neither, so
          // choosing 内置 matched no branch and returned the whole catalog — a
          // filter that silently meant 全部. Pinned by a check now.
          h('option', { value: 'bundled' }, pick('filterSource', 'optBuiltin')),
        ),
        h(
          'select',
          {
            className: 'ui-select',
            value: timeFilter,
            'aria-label': t('filterTime'),
            onChange: (event) => {
              setTimeFilter(event.target.value)
              setPage(1)
            },
          },
          h('option', { value: 'all' }, pick('filterTime', 'optAll')),
          h('option', { value: 'today' }, pick('filterTime', 'optToday')),
          h('option', { value: 'week' }, pick('filterTime', 'optWeek')),
          h('option', { value: 'month' }, pick('filterTime', 'optMonth')),
        ),
      )

      const columns = [
        { key: 'name', label: 'skill' },
        { key: 'calls', label: 'calls' },
        { key: 'lastAt', label: 'lastUsed' },
        { key: 'source', label: 'source' },
      ]

      const onSort = (key) => {
        setPage(1)
        setSort((previous) =>
          previous.key === key
            ? { key, dir: previous.dir === 'asc' ? 'desc' : 'asc' }
            // Numbers and dates are read largest-first; names and sources are
            // read from the top. Opening on the useful end is the whole point of
            // having a default direction.
            : { key, dir: key === 'name' || key === 'source' ? 'asc' : 'desc' },
        )
      }

      const head = h(
        'thead',
        null,
        h(
          'tr',
          null,
          ...columns.map((column) => {
            const active = sort.key === column.key
            return h(
              'th',
              {
                key: column.key,
                scope: 'col',
                'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
              },
              h(
                'button',
                {
                  className: 'ui-sort',
                  type: 'button',
                  onClick: () => onSort(column.key),
                  title: active
                    ? format(t('sortActive'), { dim: t(column.label), dir: t(sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') })
                    : format(t('sortBy'), { dim: t(column.label) }),
                  'aria-label': active
                    ? format(t('sortActive'), { dim: t(column.label), dir: t(sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') })
                    : format(t('sortBy'), { dim: t(column.label) }),
                },
                t(column.label),
                active ? h(SortIcon, { dir: sort.dir }) : null,
              ),
            )
          }),
        ),
      )

      // The list footer. It lives inside the record's own card rather than
      // floating below it, so it reads as part of the table's chrome instead of as
      // a third thing between the card and the panel footer.
      //
      // `nav` with a label is the right landmark for paging, and the range
      // sentence is deliberately NOT a live region: it changes on every keystroke
      // in the search box, and a live region there would narrate the whole of a
      // word being typed. The numbers carry `aria-current` so the current page is
      // announced, and the active button is marked by border, tint *and* weight —
      // no cue here is colour alone.
      const pager =
        rows.length === 0
          ? null
          : h(
              'nav',
              { className: 'ui-pager', 'aria-label': t('pagerLabel') },
              h(
                'span',
                { className: 'ui-pager-range' },
                format(t('pagerRange'), {
                  from: formatCount(pageStart + 1),
                  to: formatCount(Math.min(pageStart + pageSize, rows.length)),
                  total: formatCount(rows.length),
                }),
              ),
              h(
                'select',
                {
                  className: 'ui-select ui-pager-size',
                  value: String(pageSize),
                  'aria-label': t('pageSizeAria'),
                  onChange: (event) => {
                    setPageSize(Number(event.target.value) || PAGE_SIZES[0])
                    setPage(1)
                  },
                },
                ...PAGE_SIZES.map((n) =>
                  h('option', { key: n, value: String(n) }, format(t('pageSizeOption'), { n: formatCount(n) })),
                ),
              ),
              pageCount > 1
                ? h(
                    'span',
                    { className: 'ui-pager-nav' },
                    h(
                      'button',
                      {
                        className: 'ui-page-btn',
                        type: 'button',
                        disabled: safePage <= 1,
                        onClick: () => setPage(safePage - 1),
                      },
                      t('pagerPrev'),
                    ),
                    ...pageWindow(safePage, pageCount, 1).map((n, index) =>
                      n === null
                        ? h('span', { key: `gap-${index}`, className: 'ui-page-gap', 'aria-hidden': 'true' }, '…')
                        : h(
                            'button',
                            {
                              key: n,
                              className: 'ui-page-btn',
                              type: 'button',
                              'aria-current': n === safePage ? 'page' : undefined,
                              'aria-label':
                                n === safePage
                                  ? format(t('pagerCurrent'), { n: formatCount(n) })
                                  : format(t('pagerPage'), { n: formatCount(n) }),
                              onClick: () => setPage(n),
                            },
                            formatCount(n),
                          ),
                    ),
                    h(
                      'button',
                      {
                        className: 'ui-page-btn',
                        type: 'button',
                        disabled: safePage >= pageCount,
                        onClick: () => setPage(safePage + 1),
                      },
                      t('pagerNext'),
                    ),
                  )
                : null,
            )

      const body = h(
        'div',
        { className: 'ui-card' },
        h(
          'div',
          { className: 'ui-tablewrap' },
          rows.length === 0
            ? h('div', { className: 'ui-empty', role: 'status' }, t('empty'))
            : h(
              'table',
              { className: 'ui-table' },
              head,
              h(
                'tbody',
                null,
                ...pageRows.flatMap((row, index) => {
                  const calls = Number(row.calls) || 0
                  const share = shareOf(calls, peakCalls)
                  const open = expanded === row.name
                  // `index` is page-local, so an id can repeat across pages. Only
                  // one page is ever mounted and only one row is ever open, so the
                  // pair an aria-controls points at is always the one on screen.
                  const detailId = `si-detail-${index}`
                  // The model/user split and the session count used to hold three
                  // columns between them. They answer follow-up questions rather
                  // than the first one, so they ride the call count's tooltip and
                  // the expanded row rather than the row itself.
                  const detail = format(t('callsDetail'), {
                    model: formatCount(row.model),
                    user: formatCount(row.user),
                    sessions: formatCount(row.sessions),
                  })
                  const invocation =
                    row.cataloged === false
                      ? t('none')
                      : row.modelInvocable !== false && row.userInvocable !== false
                        ? t('invBoth')
                        : row.userInvocable !== false
                          ? t('invUserOnly')
                          : t('invModelOnly')

                  const main = h(
                    'tr',
                    { key: row.name },
                    h(
                      'td',
                      null,
                      h(
                        'div',
                        { className: 'ui-skill', title: row.description || undefined },
                        h(
                          'button',
                          {
                            className: 'ui-disclosure',
                            type: 'button',
                            'aria-expanded': open ? 'true' : 'false',
                            'aria-controls': detailId,
                            'aria-label': format(open ? t('collapseHint') : t('expandHint'), { name: row.name }),
                            onClick: () => setExpanded(open ? null : row.name),
                          },
                          h(CaretIcon, { open }),
                          h('span', { className: 'ui-skill-name' }, row.name),
                        ),
                        row.cataloged ? null : h('span', { className: 'ui-badge ui-badge-warn' }, t('orphanBadge')),
                        row.cataloged && row.modelInvocable === false
                          ? h('span', { className: 'ui-badge' }, t('userOnly'))
                          : null,
                        row.cataloged && row.userInvocable === false
                          ? h('span', { className: 'ui-badge' }, t('modelOnly'))
                          : null,
                        // The description is the row's hover text and the expanded
                        // row's first line. This keeps it readable without a mouse,
                        // and searchable.
                        h('span', { className: 'ui-sr' }, row.description || ''),
                      ),
                    ),
                    h(
                      'td',
                      null,
                      h(
                        'span',
                        { className: 'ui-calls-wrap', title: detail },
                        h('span', { className: 'ui-calls-num' }, formatCount(calls)),
                        h(
                          'span',
                          { className: 'ui-calls-track' },
                          h('i', { className: 'ui-calls-bar', style: { width: `${share}%` } }),
                        ),
                      ),
                    ),
                    h(
                      'td',
                      null,
                      row.lastAt
                        ? h(
                            'span',
                            { title: formatFullTime(row.lastAt, locale) },
                            formatRelative(row.lastAt, t),
                          )
                        : t('never'),
                    ),
                    h('td', { className: 'ui-source' }, sourceLabel(row, t)),
                  )

                  if (!open) return [main]

                  const fact = (label, value) =>
                    h('div', { className: 'ui-fact' }, h('dt', null, label), h('dd', null, value))

                  return [
                    main,
                    h(
                      'tr',
                      { key: `${row.name}-detail`, id: detailId, className: 'ui-detail-row' },
                      h(
                        'td',
                        { colSpan: 4, className: 'ui-detail-cell' },
                        h(
                          'p',
                          { className: 'ui-detail-desc' },
                          row.description || t('noDescription'),
                        ),
                        h(
                          'dl',
                          { className: 'ui-detail-facts', 'aria-label': format(t('detailHeading'), { name: row.name }) },
                          fact(t('factCalls'), formatCount(calls)),
                          fact(t('factSplit'), `${formatCount(row.model)} / ${formatCount(row.user)}`),
                          fact(t('factLast'), row.lastAt ? formatFullTime(row.lastAt, locale) : t('never')),
                          fact(t('factFirst'), row.firstAt ? formatFullTime(row.firstAt, locale) : t('none')),
                          fact(t('factSessions'), formatCount(row.sessions)),
                          fact(t('factSource'), sourceLabel(row, t)),
                          fact(t('factProvider'), row.provider || t('none')),
                          fact(t('factInvocation'), invocation),
                        ),
                      ),
                    ),
                  ]
                }),
              ),
            ),
        ),
        pager,
      )

      const rail = h(
        'div',
        { className: 'ui-rail' },
        h(
          RailCard,
          { key: 'trend', title: t('trendTitle'), sub: t('trendWindow') },
          trendCounts.length > 0
            ? h(TrendChart, { counts: trendCounts, dates: trendAxis, locale, t })
            : h('p', { className: 'ui-railsummary' }, t('trendEmpty')),
        ),
        h(
          RailCard,
          { key: 'source', title: t('sourceTitle'), sub: format(t('sourceSub'), { n: formatCount(totals.skills) }) },
          h(
            'div',
            { className: 'ui-dist' },
            ...sourceRows.map((row) =>
              h(DistRow, {
                key: row.label,
                label: row.label,
                value: format(t('sourceRow'), { n: formatCount(row.skills), calls: formatCount(row.calls) }),
                share: shareOf(row.skills, totals.skills),
              }),
            ),
          ),
        ),
        h(
          RailCard,
          { key: 'modes', title: t('modeTitle'), sub: format(t('modeSub'), { n: formatCount(totals.skills) }) },
          h(
            'div',
            { className: 'ui-dist' },
            ...modeRows.map((row) =>
              h(DistRow, {
                key: row.key,
                label: row.label,
                value: format(t('modeSub'), { n: formatCount(row.skills) }),
                notes: row.notes,
                share: shareOf(row.skills, totals.skills),
              }),
            ),
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
        // Rendered, not just exported. A panel whose code changes on disk but
        // whose window keeps showing an earlier bundle is undiagnosable from the
        // inside — the reader cannot tell a styling change from a stale load.
        // The build id closes that: if this string does not match the last
        // commit, the app is serving an older bundle and no amount of re-reading
        // the stylesheet will change what is on screen.
        h('div', { className: 'ui-build' }, format(t('buildTag'), { build: BUILD })),
      )

      return h(
        'div',
        { className: 'ui-page' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'ui-inner' },
          header,
          warning,
          kpis,
          h('div', { className: 'ui-layout' }, h('div', { className: 'ui-main' }, tabs, filters, body), rail),
          footer,
        ),
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
