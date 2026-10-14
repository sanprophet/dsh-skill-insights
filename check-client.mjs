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
 * visible label of its own (the two filter selects). Without them the accessible
 * names would be unassertable from a DOM-free render. */
function flatten(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  const props = node.props && typeof node.props === 'object' ? node.props : {}
  const attrs = ` ${props.title || ''} ${props['aria-label'] || ''}`
  return `${String(node.type)} ${flatten(node.children)}${attrs}`
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
