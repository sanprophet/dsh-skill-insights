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
 *   - Numbers are tabular (font-variant-numeric) so columns align and compare;
 *     monospace is reserved for genuinely code-shaped text and nothing else.
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
    const BUILD = 'skill-insights-5'
    /** Same-origin route registered by the Host half. */
    const ROUTE = '/skill-insights/summary'

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
      today: '今天',
      yesterday: '昨天',
      daysAgo: '{days} 天前',
      calls: '使用次数',
      lastUsed: '最近使用',
      never: '从未',
      callsDetail: '模型 {model} 次 · 用户 {user} 次 · 来自 {sessions} 个会话',
      kpiSkills: '可用技能',
      kpiUsed: '用过的技能',
      kpiNever: '从未使用',
      kpiOrphans: '已卸载 / 未知',
      kpiSkillsSub: '全部可解析的技能',
      kpiUsedSub: '共 {calls} 次调用',
      kpiNeverSub: '适合优先检查',
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
      today: 'Today',
      yesterday: 'Yesterday',
      daysAgo: '{days}d ago',
      calls: 'Calls',
      lastUsed: 'Last used',
      never: 'Never',
      callsDetail: '{model} model · {user} user · across {sessions} sessions',
      kpiSkills: 'Available skills',
      kpiUsed: 'Skills used',
      kpiNever: 'Never used',
      kpiOrphans: 'Uninstalled / unknown',
      kpiSkillsSub: 'everything resolvable',
      kpiUsedSub: '{calls} calls in total',
      kpiNeverSub: 'worth a look first',
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
}

/* ---- stats ---- */
/* Kept as its own card because the brief is explicit about the shape: stats on
   top, table below. Flex rather than a fixed grid so the strip still drops the
   orphan cell when it is zero — a metric that reports "nothing happened" does
   not deserve a quarter of the panel. */
/* Three separate cards with a gap between them, not one card cut by dividers.
   That is how the reference draws its stat row, and it lets each number keep its
   own surface when the row wraps on a narrow window. */
.ui-kpis { display: flex; gap: 10px; margin-bottom: 12px; }
.ui-kpi {
  flex: 1 1 0; min-width: 0; padding: 13px 16px 14px;
  border: 0.5px solid var(--si-edge); border-radius: 12px;
  background: var(--si-card);
}
.ui-kpi-label { font-size: var(--si-fs-2xs); color: var(--dsw-alias-label-secondary); margin-bottom: 5px; }
.ui-kpi-value {
  font-size: 22px; line-height: 1; font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.ui-kpi-sub { font-size: var(--si-fs-2xs); line-height: 15px; color: var(--dsw-alias-label-secondary); margin-top: 6px; }
/* The one KPI that is a problem rather than a statistic announces itself by its
   number's colour alone. It deliberately does NOT also take a background tint:
   the pale accent tint is blue and the warning is amber, and two signal colours
   in one cell disagree about what kind of problem this is. */
.ui-kpi.is-alert .ui-kpi-value { color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-primary)); }

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
   session count that used to hold three more columns now ride the call count's
   tooltip — they answer follow-up questions, not the first one. */
.ui-table th:nth-child(1) { width: 46%; }
.ui-table th:nth-child(2) { width: 17%; }
.ui-table th:nth-child(3) { width: 20%; }
.ui-table th:nth-child(4) { width: 17%; }
/* One line per skill: the name, plus any badges. The description moved into the
   row's tooltip, which is what lets the table show twice as many rows — the
   second line was the whole reason a reader could only ever see a dozen. */
.ui-skill { display: flex; align-items: center; gap: 7px; min-width: 0; }
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
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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

/* ---- narrow layouts ---- */
/* Nothing is hidden any more. The table is down to four columns that all answer
   a question, and at 680px the narrowest of them still gets ~110px, so the old
   rules that dropped columns by class were removing information to solve a
   problem that the column cut had already solved. */
@media (max-width: 900px) {
  .ui-inner { padding: 20px 18px 40px; }
  .ui-kpis { flex-wrap: wrap; }
  .ui-kpi { flex: 1 1 42%; }
}
@media (max-width: 680px) {
  .ui-kpi { flex: 1 1 100%; }
}
`

    function formatCount(value) {
      return (Number(value) || 0).toLocaleString()
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
      if (row.cataloged === false) return '—'
      if (row.source === 'bundled') return t('srcBuiltin')
      if (!row.source || row.source === 'user-agents') return t('srcLocal')
      return row.source
    }

    /**
     * How long ago, in words.
     *
     * The cell used to print an absolute, year-less timestamp ("10月13日 10:45"),
     which needed ~104px it did not have at sidebar-open widths and overflowed
     into its neighbour — fixed layout means a percentage column never grows to
     fit its content. A relative form answers the question the column actually
     asks ("is this still alive?"), fits anywhere, and the absolute timestamp
     stays reachable as the native tooltip.
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

    // The trailing-30-day sparkline used to live here and is gone. It rendered
    // bars only once four or more days had activity, and on this machine every
    // used skill has one or two — so it never drew a chart, it just printed a
    // day count in a column that cost 10% of the table's width. The reference
    // has no such column and the table is better for it.

    function Kpi({ label, value, sub, alert }) {
      return h(
        'div',
        { className: alert ? 'ui-kpi is-alert' : 'ui-kpi' },
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
      // Three independent narrowings, the way the reference splits them: which
      // bucket, where it came from, and when it last ran. The bucket replaced a
      // "show unused" checkbox — a checkbox can only say yes or no, and the
      // question here is really "which of these three piles am I looking at".
      const [tab, setTab] = React.useState('all')
      const [sourceFilter, setSourceFilter] = React.useState('all')
      const [timeFilter, setTimeFilter] = React.useState('all')

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

      const rows = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        const now = Date.now()
        return allRows.filter((row) => {
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
      }, [allRows, query, tab, sourceFilter, timeFilter])

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
      const neverUsed = Math.max(0, (Number(totals.skills) || 0) - (Number(totals.used) || 0))

      const kpis = h(
        'div',
        { className: 'ui-kpis' },
        h(Kpi, { key: 'skills', label: t('kpiSkills'), value: formatCount(totals.skills), sub: t('kpiSkillsSub') }),
        h(Kpi, {
          key: 'used',
          label: t('kpiUsed'),
          value: formatCount(totals.used),
          sub: format(t('kpiUsedSub'), { calls: formatCount(totals.calls) }),
        }),
        h(Kpi, {
          key: 'never',
          label: t('kpiNever'),
          value: formatCount(neverUsed),
          sub: t('kpiNeverSub'),
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
              onClick: () => setTab(key),
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
          onChange: (event) => setQuery(event.target.value),
        }),
        h(
          'select',
          {
            className: 'ui-select',
            value: sourceFilter,
            'aria-label': t('filterSource'),
            onChange: (event) => setSourceFilter(event.target.value),
          },
          h('option', { value: 'all' }, pick('filterSource', 'optAll')),
          h('option', { value: 'local' }, pick('filterSource', 'optLocal')),
          h('option', { value: 'builtin' }, pick('filterSource', 'optBuiltin')),
        ),
        h(
          'select',
          {
            className: 'ui-select',
            value: timeFilter,
            'aria-label': t('filterTime'),
            onChange: (event) => setTimeFilter(event.target.value),
          },
          h('option', { value: 'all' }, pick('filterTime', 'optAll')),
          h('option', { value: 'today' }, pick('filterTime', 'optToday')),
          h('option', { value: 'week' }, pick('filterTime', 'optWeek')),
          h('option', { value: 'month' }, pick('filterTime', 'optMonth')),
        ),
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
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', { scope: 'col' }, t('skill')),
                  h('th', { scope: 'col' }, t('calls')),
                  h('th', { scope: 'col' }, t('lastUsed')),
                  h('th', { scope: 'col' }, t('source')),
                ),
              ),
              h(
                'tbody',
                null,
                rows.map((row) => {
                  const calls = Number(row.calls) || 0
                  const share = peakCalls > 0 ? Math.round((calls / peakCalls) * 100) : 0
                  // The model/user split and the session count used to hold three
                  // columns between them. They answer follow-up questions rather
                  // than the first one, so they ride the call count's tooltip.
                  const detail = format(t('callsDetail'), {
                    model: formatCount(row.model),
                    user: formatCount(row.user),
                    sessions: formatCount(row.sessions),
                  })
                  return h(
                    'tr',
                    { key: row.name },
                    h(
                      'td',
                      null,
                      h(
                        'div',
                        { className: 'ui-skill', title: row.description || undefined },
                        h('span', { className: 'ui-skill-name' }, row.name),
                        row.cataloged ? null : h('span', { className: 'ui-badge ui-badge-warn' }, t('orphanBadge')),
                        row.cataloged && row.modelInvocable === false
                          ? h('span', { className: 'ui-badge' }, t('userOnly'))
                          : null,
                        row.cataloged && row.userInvocable === false
                          ? h('span', { className: 'ui-badge' }, t('modelOnly'))
                          : null,
                        // The description is the row's hover text now. This keeps
                        // it readable without a mouse, and searchable.
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
                        ? h('span', { title: formatTime(row.lastAt, locale) }, formatRelative(row.lastAt, t))
                        : t('never'),
                    ),
                    h('td', { className: 'ui-source' }, sourceLabel(row, t)),
                  )
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
        h('div', { className: 'ui-inner' }, header, warning, kpis, tabs, filters, body, footer),
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
