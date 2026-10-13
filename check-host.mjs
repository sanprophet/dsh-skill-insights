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

const ctx = {
  logger: { info() {}, warn() {} },
  effect: (fn) => {
    disposer = fn()
    return () => {}
  },
  inject: (names, callback) => {
    assert.deepEqual(names, ['webServer'], 'injects the web server')
    callback(webCtx)
  },
  sessionQuery: {
    listSessions: async () => Object.values(sessions).map((session) => ({ header: session.header })),
    readSession: async (id) => {
      if (id === 'broken') throw new Error('corrupt log')
      return sessions[id]
    },
  },
  skills: {
    snapshot: async (options) => {
      catalogCalls.push(options && options.cwd ? options.cwd : null)
      return {
        complete: true,
        skills: [
          { name: 'ponytail', description: 'laziest solution', source: 'user-agents', provider: 'builtin', invocation: { modelInvocable: true, userInvocable: true } },
          { name: 'never-used', description: 'dormant', source: 'user-agents', provider: 'builtin', invocation: { modelInvocable: true, userInvocable: true } },
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
assert.equal(snapshot.totals.skills, 2, 'catalog size')
assert.equal(snapshot.totals.used, 1, 'cataloged skills with any call')

const ponytail = snapshot.skills.find((row) => row.name === 'ponytail')
assert.ok(ponytail, 'ponytail listed')
assert.equal(ponytail.calls, 3, 'ponytail calls')
assert.equal(ponytail.model, 2, 'ponytail model calls')
assert.equal(ponytail.user, 1, 'ponytail user calls')
assert.equal(ponytail.sessions, 2, 'ponytail spans both sessions')
assert.equal(ponytail.cataloged, true, 'ponytail is cataloged')
assert.equal(ponytail.trend.length, 30, '30-day trend series')

const unused = snapshot.skills.find((row) => row.name === 'never-used')
assert.equal(unused.calls, 0, 'unused catalog entry is still listed')

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
// carrying the same schema version the loader accepts.
const cached = JSON.parse(await readFile(join(home, 'skill-insights', 'state.json'), 'utf8'))
assert.equal(cached.version, 1, 'cache schema version')
assert.equal(cached.totals.calls, 4, 'cache carries the same totals')

// Stopping the scanner must actually clear its timer, or the process never exits.
assert.equal(typeof disposer, 'function', 'ctx.effect returned a disposer')
disposer()

console.log('host integration check passed')
