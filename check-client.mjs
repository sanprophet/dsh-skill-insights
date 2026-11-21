/**
 * Load/render check for client.js. Run with `npm test`.
 *
 * The panel is the whole surface of this plugin, and a mistake in it only shows
 * up as a blank panel after a DSH restart, so it gets its own check. A minimal
 * React stand-in keeps this dependency-free. Verified here: the module-loader
 * contract, the slot registrations, that every locale key the panel uses exists
 * in both dictionaries, and that the loading, ready, error and hostile-payload
 * render paths all build a tree without throwing.
 */
import { strict as assert } from 'node:assert/strict'

let captured
globalThis.window = { __ModuleLoader__: { load: (spec) => { captured = spec } } }

await import('./client.js')
assert.equal(captured.id, 'dsh-skill-insights', 'module id')

// Minimal React stand-in. State is seeded by call index so the ready path can
// be exercised without a real re-render loop.
const seeds = new Map()
let stateIndex = 0
const react = {
  Fragment: 'fragment',
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => {
    const index = stateIndex++
    const value = seeds.has(index) ? seeds.get(index) : typeof initial === 'function' ? initial() : initial
    return [value, () => {}]
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
}

const mod = captured.factory((name) => {
  if (name === 'react') return react
  throw new Error(`unexpected module request: ${name}`)
})

assert.deepEqual(mod.inject, ['slots', 'locale'], 'inject list')
assert.equal(typeof mod.apply, 'function', 'apply exported')

let dictionaries
let MainComponent
const slots = []
const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (ns, dicts) => {
      assert.equal(ns, 'skill-insights', 'locale namespace')
      dictionaries = dicts
      return () => {}
    },
    // Resolve against the real dictionary so a missing key shows up as
    // MISSING:<key> in the rendered tree instead of silently passing.
    bind: () => (key) => {
      const value = dictionaries && dictionaries.zh ? dictionaries.zh[key] : undefined
      return value === undefined ? `MISSING:${key}` : value
    },
  },
  slots: {
    inject: (_name, fn) => fn(),
    register: (spec, component) => {
      slots.push({ name: spec.name, id: spec.id || spec.key, order: spec.order ?? null })
      if (spec.name === 'main') MainComponent = component
    },
  },
}

mod.apply(ctx)

assert.deepEqual(
  slots,
  [
    { name: 'main', id: 'skill-insights', order: null },
    { name: 'sidebar.panellist', id: 'skill-insights', order: 13 },
  ],
  'slot registrations',
)
assert.equal(typeof MainComponent, 'function', 'main slot component')
assert.ok(dictionaries && dictionaries.zh && dictionaries.en, 'both dictionaries registered')

const zhKeys = Object.keys(dictionaries.zh).sort()
const enKeys = Object.keys(dictionaries.en).sort()
assert.deepEqual(zhKeys, enKeys, 'zh and en expose the same keys')

/** Flatten a fake element tree into a searchable string. `title` and `aria-label`
 * are both included: a tooltip holds text a reader can reach (truncated
 * descriptions, absolute timestamps), and aria-label names a control that has no
 * visible label of its own (the two filter selects, the sort buttons). Without
 * them the accessible names would be unassertable from a DOM-free render.
 *
 * `className` is included for a different reason: a region's place in the reading
 * order is a structural fact this check can verify, but only if the classes are
 * in the string. That is also what made the closing `</style>` marker below real
 * — flatten used not to emit one, so `styleCss` was silently the whole render
 * tree rather than the stylesheet, and every stylesheet assertion was passing
 * against markup that merely happened to contain the same class names. */
function flatten(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  // A function element has to be *called*, the way a real renderer does it. It
  // used not to be: the stand-in emitted `String(node.type)` instead, i.e. the
  // component's own source code, so the rail's cards and the chart were never
  // rendered by this check at all — and any string that happened to appear inside
  // a component body (a class name, a label) counted as if it were on screen.
  // Every component reached this way is deliberately hook-free, which is what
  // keeps calling it here equivalent to React calling it.
  if (typeof node.type === 'function') {
    const props = { ...(node.props && typeof node.props === 'object' ? node.props : {}) }
    const children = node.children
    if (children && children.length === 1) props.children = children[0]
    else if (children && children.length > 1) props.children = children
    return flatten(node.type(props))
  }
  if (node.type === 'style') return `<style>${flatten(node.children)}</style>`
  const props = node.props && typeof node.props === 'object' ? node.props : {}
  const attrs = ` ${props.className || ''} ${props.title || ''} ${props['aria-label'] || ''}`
  const state = ` ${props['aria-sort'] || ''} ${props['aria-expanded'] || ''}`
  return `${String(node.type)} ${flatten(node.children)}${attrs}${state}`
}

/** Everything after the stylesheet: the rendered markup on its own. */
function markupOf(text) {
  return text.slice(text.indexOf('</style>') + '</style>'.length)
}

function render(seedValues) {
  stateIndex = 0
  seeds.clear()
  for (const [index, value] of seedValues) seeds.set(index, value)
  return flatten(MainComponent({ ctx }))
}

// Loading path: no data yet.
assert.match(render([[0, 'zh']]), /正在读取技能用量/, 'loading path renders')

// Ready path: one used skill, one orphan, one unused skill.
const payload = {
  catalogComplete: true,
  totals: { skills: 2, used: 1, calls: 3, model: 2, user: 1, orphans: 1, orphanCalls: 1, sessions: 4, failed: 0 },
  skills: [
    {
      name: 'ponytail',
      calls: 3,
      model: 2,
      user: 1,
      sessions: 2,
      lastAt: 1791850000000,
      trend: [0, 1, 0, 2],
      cataloged: true,
      description: 'laziest solution that works',
      source: 'user-agents',
      modelInvocable: true,
      userInvocable: true,
    },
    {
      name: 'never-used',
      calls: 0,
      model: 0,
      user: 0,
      sessions: 0,
      lastAt: 0,
      trend: [0, 0],
      cataloged: true,
      description: 'dormant',
      source: 'user-agents',
      modelInvocable: true,
      userInvocable: true,
    },
  ],
  orphans: [
    {
      name: 'ghost-skill',
      calls: 1,
      model: 1,
      user: 0,
      sessions: 1,
      lastAt: 1791850000000,
      trend: [1, 0],
      cataloged: false,
      description: '',
      source: '',
      modelInvocable: false,
      userInvocable: false,
    },
  ],
  tracked: { home: 'D:\\software\\deepseek-harness-data', scannedAt: 1791850000000, malformed: 0 },
}

const ready = render([
  [0, 'zh'],
  [1, 'ready'],
  [2, payload],
])
assert.match(ready, /ponytail/, 'used skill rendered')
assert.match(ready, /ghost-skill/, 'orphan rendered')
assert.match(ready, /已卸载/, 'orphan badge rendered')
assert.match(ready, /使用次数/, 'table headers rendered')
assert.match(ready, /今天|昨天|天前/, 'last-used renders a relative age')
assert.match(ready, /10月13日/, 'absolute timestamp kept as the tooltip')
// The default tab is the whole catalog, not just the used skills. The reference
// opens on 全部, and the counts printed on each tab are what make narrowing
// cheap — so a tab that displayed a count it did not honour would be worse than
// no tab at all. Fixture: 2 cataloged + 1 orphan, of which 2 have calls.
assert.match(ready, /never-used/, 'the default tab shows the whole catalog')
assert.match(ready, /全部 3/, 'the all tab carries its count')
assert.match(ready, /使用过 2/, 'the used tab carries its count')
assert.match(ready, /从未使用 1/, 'the never-used tab carries its count')
assert.match(ready, /搜索技能名称或说明/, 'the search field is offered')
assert.match(ready, /使用时间/, 'the last-used filter is offered')
// The description is no longer visible table text, so it has to reach the render
// two other ways to still count as present: as the row's hover text, and as text
// a screen reader can reach without a mouse.
assert.match(ready, /laziest solution that works/, 'the description survives as the row tooltip')
assert.doesNotMatch(ready, /MISSING:/, 'no locale key is missing')

// The stylesheet travels inside the rendered tree, so the invariants that a
// DOM-free render check cannot see are still assertable here. These declarations
// belong together: without `table-layout: fixed`, the widest cell contributes
// its whole content as column one's min-content width, the other three columns
// are pushed clean out of the viewport, and the panel reads as a one-column
// table with text spilling off the card.
const styleCss = ready.slice(0, ready.indexOf('</style>'))
assert.ok(styleCss.includes('table-layout: fixed'), 'table uses fixed layout')
assert.match(styleCss, /\.ui-skill-name\s*\{[^}]*overflow: hidden/, 'the skill name clips its overflow')
assert.match(styleCss, /\.ui-skill-name\s*\{[^}]*text-overflow: ellipsis/, 'the skill name ellipsises')
assert.ok(styleCss.includes('ui-tablewrap'), 'table sits in a padded wrap inside the card')
assert.ok(styleCss.includes('ui-sr'), 'the description stays in the accessibility tree')
assert.ok(!styleCss.includes('ui-skill-desc'), 'the description line is gone from the table')
// The structure the reference added, and the structure it replaced. Both
// directions are pinned, so a later edit cannot quietly bring back a checkbox
// that can only say yes or no, or a sparkline that never draws.
assert.ok(styleCss.includes('ui-tabs') && styleCss.includes('ui-chip'), 'status tabs are rendered')
assert.ok(styleCss.includes('ui-select'), 'source and time filters are rendered')
assert.ok(styleCss.includes('ui-calls-track'), 'the call count keeps its share track')
assert.ok(styleCss.includes('--si-edge'), 'card edges come from a token')
assert.ok(styleCss.includes('neutral-bluish-50'), 'the light canvas is a theme static')
assert.ok(!styleCss.includes('ui-toolbar'), 'the old card toolbar is gone')
assert.ok(!styleCss.includes('ui-check'), 'the show-unused checkbox is gone')
assert.ok(!styleCss.includes('ui-spark'), 'the sparkline is gone')
assert.ok(!styleCss.includes('ui-col-split'), 'the split column is gone')
// A mistyped theme token does not error — var() just falls back, which is how the
// warning colour went quietly neutral for two releases. Both directions are
// pinned: the misspelling must not return, the real name must be present.
assert.ok(!styleCss.includes('--dsw-alias-state-warning-primary'), 'no misspelled warning token')
assert.ok(styleCss.includes('--dsw-alias-state-warn-primary'), 'warning token resolves against the theme')
// Typography. --dsw-font-family-mono does not exist in this theme, so a stack
// built on it fell through to the generic monospace keyword, which on a Chinese
// Windows install is NSimSun — a bitmap-era face that every number and skill name
// was silently rendering in. Only Chrome's own platform-font report caught it; no
// assertion on the stylesheet could have, which is why the token is pinned by
// name here and the *use* is what gets tested, not the mention.
assert.ok(!/font-family:\s*var\(--dsw-font-family-mono/.test(styleCss), 'no use of the invented mono token')
assert.ok(!/--si-num:[^;]*--dsw-font-family-mono/.test(styleCss), 'the numeric stack names no undefined token')
assert.ok(/--si-num:[^;]*--ds-font-family-code/.test(styleCss), 'the numeric stack uses the theme code font')
assert.ok(/--si-num:[^;]*Microsoft YaHei/.test(styleCss), 'the code stack keeps a CJK fallback')
// The reference draws its skill names and its numbers in the UI face, and so does
// DSH — the host reserves the code stack for markdown code. Monospace here was
// this file's own idea, and it read as cramped long before the font resolved
// correctly, because hyphenated identifiers at uniform advance width have no
// rhythm. Alignment is kept by tabular-nums instead.
assert.ok(!/\.ui-skill-name\s*\{[^}]*font-family/.test(styleCss), 'the skill name uses the UI face')
assert.ok(!/\.ui-calls-num\s*\{[^}]*font-family/.test(styleCss), 'the call count uses the UI face')
assert.ok(!/\.ui-kpi-value\s*\{[^}]*font-family/.test(styleCss), 'the KPI value uses the UI face')

// ---- §12: the insight rail, the expanded row, sorting ----------------------
// The rail carries the evidence the table cannot, and entering the reading order
// only *after* the record is a structural promise rather than a stylistic one: a
// supporting region that came first would take the top of the page from the
// table. Both the promise and each card are pinned here.
assert.ok(styleCss.includes('ui-railcard'), 'the rail card surface exists')
assert.ok(styleCss.includes('ui-trend-bar'), 'the activity chart draws bars')
assert.ok(styleCss.includes('ui-dist-track'), 'the distribution cards draw magnitude bars')
assert.ok(styleCss.includes('ui-detail-row'), 'the expanded row has a surface of its own')
assert.ok(styleCss.includes('ui-caret'), 'the disclosure caret is drawn, not typeset')
assert.ok(styleCss.includes('ui-sort-icon'), 'the sort arrow is drawn, not typeset')
// The split asks the panel its own width, because the shell's sidebar and the
// panel's 1200px cap both change how much room the table actually has and a media
// query can see neither. The fallback keeps the complete single-column order for a
// browser without container queries rather than collapsing the layout.
assert.ok(styleCss.includes('container-type: inline-size'), 'the split queries a container, not the viewport')
assert.ok(styleCss.includes('@container si'), 'the two-column split is a container query')
assert.ok(styleCss.includes('@supports not (container-type: inline-size)'), 'a browser without container queries still gets the split')
// One elevation declaration per surface. A border under a wide shadow is the
// ghost card the craft floor names, and this panel has enough surfaces already.
assert.ok(!/\.ui-railcard\s*\{[^}]*box-shadow/.test(styleCss), 'rail cards carry no shadow')
assert.ok(!/\.ui-card\s*\{[^}]*overflow:\s*hidden/.test(styleCss), 'the card is never a scrollport, which would kill the sticky header')

const markup = markupOf(ready)
const tableAt = markup.indexOf('ui-table')
const railAt = markup.indexOf('ui-railcard')
assert.ok(tableAt > -1, 'the record is rendered')
assert.ok(railAt > tableAt, 'the rail follows the record in DOM order, it never precedes it')
assert.equal((markup.match(/ui-railcard/g) || []).length, 3, 'three rail cards: activity, source, invocation mode')
assert.match(markup, /近 30 天活动/, 'the activity card is titled')
assert.match(markup, /来源分布/, 'the source split is titled')
assert.match(markup, /调用方式/, 'the invocation-mode split is titled')

// The chart. Fixture trends [0,1,0,2] + [0,0] + [1,0] sum to [1,1,0,2] over four
// trailing days: 4 calls, 3 active days, peak 2. Every one of those has to be
// printed as well as drawn — a bar is not a quantity a reader can look up, and the
// per-row sparkline this panel deleted failed for exactly that reason.
assert.equal((markup.match(/ui-trend-bar/g) || []).length, 4, 'one bar per trailing day in the payload')
assert.match(markup, /共 4 次 · 活跃 3 天 · 最高 2 次/, 'the chart states every number its bars encode')
assert.match(markup, /10月\d+日 · \d+ 次/, 'each bar names its own day and count')

// The two distribution cards, and the sentence that makes the second one worth
// having: a skill the model cannot pick has never been offered to it.
assert.match(markup, /本机 2 · 内置 0/, 'the available-skills tile splits local from bundled')
assert.match(markup, /占可用技能的 50%/, 'the used tile reports a share rather than repeating another tile')
assert.match(markup, /模型 2 · 用户 1/, 'the calls tile carries the model/user split of the total')
assert.match(markup, /模型与用户/, 'the invocation-mode card names a mode')
assert.match(markup, /模型可自行选用，也能用 \/名称 显式调用/, 'the mode card explains itself')

// Sorting. The header control names its own state: an arrow alone is a direction
// with no dimension, and the accessible name is the only place that can say which
// column is active.
assert.match(markup, /按使用次数排序，当前降序/, 'the active sort column names dimension and direction')
assert.match(markup, /按技能排序/, 'an inactive column still offers itself as sortable')
assert.match(markup, /descending/, 'the active column carries aria-sort')

// The expanded row. One at a time, and exercised by seeding the last useState.
// This is where the facts the four columns deliberately do not carry — first use,
// provider, the model/user split, and the whole description — become readable text
// instead of hover text.
assert.ok(!markup.includes('ui-detail-row'), 'nothing is expanded until a row is opened')
const expanded = render([[0, 'zh'], [1, 'ready'], [2, payload], [9, 'ponytail']])
const expandedMarkup = markupOf(expanded)
assert.equal((expandedMarkup.match(/ui-detail-row/g) || []).length, 1, 'one row at a time')
assert.match(expanded, /ui-caret is-open/, 'the open row shows the open caret')
assert.ok(!markup.includes('ui-caret is-open'), 'the closed row shows the closed caret')
assert.match(expanded, /laziest solution that works/, 'the expanded row prints the full description')
assert.match(expanded, /首次使用/, 'the expanded row reports first use')
assert.match(expanded, /涉及会话/, 'the expanded row reports the session count')
assert.match(expanded, /提供者/, 'the expanded row reports the provider')
assert.match(expanded, /收起 ponytail 的详情/, 'the open disclosure offers to close')
assert.match(markup, /展开 ponytail 的详情/, 'the closed disclosure offers to open')
assert.doesNotMatch(expanded, /MISSING:/, 'the expanded row uses only real locale keys')

// The never-used tile is only honest if it says *why*. A skill with
// modelInvocable:false can never be chosen by the model, so counting it as
// neglected would be reading a flag as a verdict; both the tile and the mode card
// have to say so instead of folding it into a total.
const userOnly = render([
  [0, 'zh'],
  [1, 'ready'],
  [
    2,
    {
      ...payload,
      skills: [
        ...payload.skills,
        {
          name: 'hand-only',
          calls: 0,
          model: 0,
          user: 0,
          sessions: 0,
          lastAt: 0,
          firstAt: 0,
          trend: [],
          cataloged: true,
          description: '',
          source: 'user-agents',
          modelInvocable: false,
          userInvocable: true,
        },
      ],
    },
  ],
])
assert.match(userOnly, /其中 1 个只能用 \/名称 调用/, 'the never-used tile says why a skill is idle')
assert.match(userOnly, /只能用 \/名称 显式调用，模型不会自己选它/, 'the mode card explains the user-only case')
assert.match(userOnly, /1 个从未被调用/, 'the mode card counts the idle ones')
assert.match(userOnly, /仅用户/, 'the row badge marks a user-only skill')
assert.doesNotMatch(userOnly, /MISSING:/, 'the user-only path uses only real locale keys')

// A catalog that failed discovery must announce itself.
assert.match(render([[0, 'zh'], [1, 'ready'], [2, { ...payload, catalogComplete: false }]]), /技能目录可能不完整/)

// Hostile payloads must degrade, not throw.
assert.doesNotThrow(() => render([[0, 'zh'], [1, 'ready'], [2, {}]]), 'empty payload')
assert.doesNotThrow(() => render([[0, 'zh'], [1, 'ready'], [2, null]]), 'null payload')
assert.doesNotThrow(() => render([[0, 'zh'], [1, 'error'], [3, 'boom']]), 'error payload')

// The error path must show the underlying message and never leak a MISSING key.
const errored = render([[0, 'zh'], [1, 'error'], [3, 'HTTP 500']])
assert.match(errored, /HTTP 500/, 'error detail surfaced')
assert.match(errored, /读取技能用量失败/, 'error title rendered')
assert.doesNotMatch(errored, /MISSING:/, 'error path locale keys resolve')

console.log(`client.js load/render check passed (${zhKeys.length} locale keys)`)
