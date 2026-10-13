/**
 * Host integration check. Run with `npm test`.
 *
 * `node index.js` covers the pure counting function; this covers everything
 * around it, which is the part that only fails on a real DSH restart: the scan
 * folding two sessions together, the cwd union that drives catalog discovery,
 * the snapshot the route serialises, the 405 guard, and the durable cache.
 *
 * A fake Cordis context and a throwaway DSH_HOME keep it hermetic.
 */
import { strict as assert } from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'skill-insights-check-'))
process.env.DSH_HOME = home

const { apply } = await import('./index.js')

// Two sessions in two different workspaces. Workspaces matter: catalog
// discovery is cwd-sensitive, so both must reach ctx.skills.snapshot().
const sessions = {
  s1: {
    header: { id: 's1', cwd: 'C:\\work', createdAt: 1000 },
    events: [
      { type: 'tool/call', time: 1000, data: { name: 'skill', arguments: '{"name":"ponytail"}' } },
      { type: 'user/message', time: 2000, data: { source: { kind: 'skill-invocation', name: 'ponytail' } } },
      { type: 'tool/call', time: 3000, data: { name: 'skill', arguments: '{"name":"ghost-skill"}' } },
    ],
  },
  s2: {
    header: { id: 's2', cwd: 'D:\\other', createdAt: 2000 },
    events: [
      { type: 'tool/call', time: 4000, data: { name: 'skill', arguments: '{"name":"ponytail"}' } },
      { type: 'tool/call', time: 5000, data: { name: 'read', arguments: '{"path":"x"}' } },
    ],
  },
  broken: { header: { id: 'broken' }, events: null },
}

const catalogCalls = []
const scopedCalls = []
let handler
let disposer

const webCtx = {
  effect: (fn) => fn(),
  webServer: {
    register: (route) => {
      handler = route.handler
      return () => {}
    },
  },
}

// The session-addressed catalog: the ONLY source that sees skills registered
// into an agent-preset's layer, which is where `dsh-skill-filesystem` puts
// everything discovered on this machine. Omitting it is what made every
// installed skill report as uninstalled.
const scopedCatalog = {
  list: async (request) => {
    scopedCalls.push(request.sessionId)
    return {
      skills: [
        { name: 'ponytail', description: 'laziest solution', modelInvocable: true },
        { name: 'never-used', description: 'dormant', modelInvocable: false },
        // Also visible globally: exercises the metadata-enrichment merge.
        { name: 'office-docx', description: 'Word documents', modelInvocable: true },
      ],
    }
  },
}

const ctx = {
  logger: { info() {}, warn() {} },
  effect: (fn) => {
    disposer = fn()
    return () => {}
  },
  // Two injection points: the data services the scanner must be allowed to read,
  // and the web server the route mounts on. The scanner is handed this context,
  // because that is where the stubbed services live.
  inject(names, callback) {
    if (names.length === 1 && names[0] === 'webServer') {
      callback(webCtx)
      return
    }
    assert.deepEqual(names, ['sessionQuery', 'skills'], 'injects the two data services')
    callback(this)
  },
  sessionQuery: {
    listSessions: async () => Object.values(sessions).map((session) => ({ header: session.header })),
    readSession: async (id) => {
      if (id === 'broken') throw new Error('corrupt log')
      return sessions[id]
    },
  },
  // `ctx.get` is the OPTIONAL read: absent services must answer undefined, not throw.
  get(name) {
    return name === 'sessionSkillCatalog' ? scopedCatalog : undefined
  },
  // The GLOBAL registry layer only — deployment-level bundles and nothing that
  // `dsh-skill-filesystem` registers per agent-preset scope.
  skills: {
    snapshot: async (options) => {
      catalogCalls.push(options && options.cwd ? options.cwd : null)
      return {
        complete: true,
        skills: [
          { name: 'office-docx', description: 'Word documents', source: 'bundled', provider: 'builtin', invocation: { modelInvocable: true, userInvocable: true } },
        ],
      }
    },
  },
}

apply(ctx, { scanIntervalSeconds: 3600 })

assert.ok(handler, 'route registered')

/** Drive the real route handler and decode what it wrote. */
function request(method) {
  let status
  let payload
  handler({ method, url: '/skill-insights/summary' }, {
    writeHead(code) {
      status = code
    },
    end(body) {
      payload = JSON.parse(body.toString('utf8'))
    },
  })
  return { status, payload }
}

// The first scan runs detached inside ctx.effect, so poll for it to land.
let snapshot
for (let attempt = 0; attempt < 200; attempt += 1) {
  const { payload } = request('GET')
  if (payload && payload.generatedAt > 0) {
    snapshot = payload
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 25))
}
assert.ok(snapshot, 'first scan completed')

// Both workspaces must reach catalog discovery, and the unusable fourth
// session must be counted rather than aborting the scan.
assert.deepEqual(catalogCalls.slice().sort(), ['C:\\work', 'D:\\other'], 'cwd union drives catalog discovery')
assert.equal(snapshot.totals.sessions, 2, 'two sessions scanned')
assert.equal(snapshot.totals.failed, 1, 'unreadable session counted, not fatal')

assert.equal(snapshot.totals.calls, 4, 'total calls')
assert.equal(snapshot.totals.model, 3, 'model calls')
assert.equal(snapshot.totals.user, 1, 'user calls')
assert.equal(snapshot.totals.skills, 3, 'catalog size')
assert.equal(snapshot.totals.used, 1, 'cataloged skills with any call')
assert.equal(snapshot.catalogComplete, true, 'catalog reported complete')

// The session-addressed catalog is the only source that can see preset-layer
// skills, so it must be queried once per scanned session.
assert.deepEqual(scopedCalls.slice().sort(), ['s1', 's2'], 'session catalog queried per scanned session')

const ponytail = snapshot.skills.find((row) => row.name === 'ponytail')
assert.ok(ponytail, 'ponytail listed')
assert.equal(ponytail.calls, 3, 'ponytail calls')
assert.equal(ponytail.model, 2, 'ponytail model calls')
assert.equal(ponytail.user, 1, 'ponytail user calls')
assert.equal(ponytail.sessions, 2, 'ponytail spans both sessions')
assert.equal(ponytail.trend.length, 30, '30-day trend series')
// THE REGRESSION THIS FIXTURE EXISTS FOR. ponytail is reachable only through the
// session-scoped catalog; reading the global layer alone flagged it — and every
// other locally installed skill — as "uninstalled".
assert.equal(ponytail.cataloged, true, 'preset-layer skill is cataloged, not reported uninstalled')
assert.equal(ponytail.source, '', 'the scoped shape carries no source metadata')

const unused = snapshot.skills.find((row) => row.name === 'never-used')
assert.equal(unused.calls, 0, 'unused catalog entry is still listed')
assert.equal(unused.modelInvocable, false, 'modelInvocable flag carried through')

// office-docx arrives from both sources: the global read must win the metadata
// instead of being dropped as a duplicate.
const both = snapshot.skills.find((row) => row.name === 'office-docx')
assert.equal(both.source, 'bundled', 'global source metadata survives the merge')
assert.equal(both.description, 'Word documents', 'description preserved')

assert.equal(snapshot.orphans.length, 1, 'one orphan')
assert.equal(snapshot.orphans[0].name, 'ghost-skill', 'orphan name')
assert.equal(snapshot.orphans[0].calls, 1, 'orphan calls retained')
assert.equal(snapshot.orphans[0].cataloged, false, 'orphan flagged as uncataloged')
assert.equal(snapshot.totals.orphanCalls, 1, 'orphan call total')

// Sorting: most-used first, with uncataloged rows pinned ahead of everything.
assert.equal(snapshot.orphans[0].name, 'ghost-skill', 'orphans lead the payload')
assert.equal(snapshot.skills[0].name, 'ponytail', 'skills sorted by call count')

// The route contract.
assert.equal(request('GET').status, 200, 'GET succeeds')
const rejected = request('POST')
assert.equal(rejected.status, 405, 'POST rejected')
assert.equal(rejected.payload.error, 'method not allowed', '405 body')

// The cache is what makes a restart paint instantly; it must be valid JSON
// carrying the same schema version the loader accepts. `scan()` publishes the
// snapshot before it persists it, so poll for the file instead of assuming the
// rename already landed — otherwise the check exits with only a `.tmp` behind.
let cached
for (let attempt = 0; attempt < 200; attempt += 1) {
  try {
    cached = JSON.parse(await readFile(join(home, 'skill-insights', 'state.json'), 'utf8'))
    break
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
assert.ok(cached, 'cache file written')
assert.equal(cached.version, 1, 'cache schema version')
assert.equal(cached.totals.calls, 4, 'cache carries the same totals')

// Stopping the scanner must actually clear its timer, or the process never exits.
assert.equal(typeof disposer, 'function', 'ctx.effect returned a disposer')
disposer()

console.log('host integration check passed')
