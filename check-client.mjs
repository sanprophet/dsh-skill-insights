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

/** Flatten a fake element tree into a searchable string. */
function flatten(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  return `${String(node.type)} ${flatten(node.children)}`
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
assert.match(ready, /调用次数/, 'table headers rendered')
assert.match(ready, /10月13日/, 'last-used timestamp formatted')
assert.doesNotMatch(ready, /never-used/, 'unused skill hidden by default')
assert.doesNotMatch(ready, /MISSING:/, 'no locale key is missing')

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
