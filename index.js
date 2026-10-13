/**
 * dsh-skill-insights — Host half.
 *
 * Lists every skill this DSH can resolve, and how often each one was actually
 * used. Two invocation paths exist and both are recorded in the session log, so
 * the log is the single source of truth:
 *
 *   1. Model-invoked — the `skill` tool appends a `tool/call` event with
 *      `name: 'skill'` and the raw, UNPARSED `arguments` JSON string. See
 *      @deepseek-ai/dsh-tool-skill.
 *   2. User-invoked — `/skill-name` is injected by that same package's
 *      `agent/pre-step` hook as a `user/message` carrying
 *      `source: { kind: 'skill-invocation', name }`.
 *
 * Reading the log goes through `ctx.sessionQuery`, whose `readSession()` returns
 * a session's complete event stream with decompression and replay validation
 * handled by the persistence backend. This plugin never decodes zstd itself and
 * never writes to skills or session logs.
 *
 * The count table is RECOMPUTED FROM SCRATCH on every scan and swapped in
 * whole. No deltas, no watermarks, no negative-delta rebasing: the log is
 * complete and replayable, so a full recount is the correct answer and the
 * entire class of double-counting bugs does not exist here. The token plugin
 * (dsh-usage-insights) cannot do this because token totals are only knowable
 * from inside DSH, which is why it owns a far more intricate scanner.
 *
 * Read-only, loopback-only, no upload.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'skill-insights'
export const inject = []

/** Bump only when the cached snapshot shape actually changes. */
const SCHEMA_VERSION = 1
const SUMMARY_PATH = '/skill-insights/summary'
/** Days of trailing history sent per skill for the mini trend column. */
const TREND_DAYS = 30

function str(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Clamp a config number, falling back when it is missing or unusable. A
 * malformed value must fall back rather than clamp to the minimum, or junk
 * config silently becomes a real setting.
 */
function bounded(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    scanIntervalSeconds: bounded(c.scanIntervalSeconds, 300, 10, 3600),
    includeUserInvocations: c.includeUserInvocations !== false,
  }
}

/** `<DSH_HOME>`, else `~/.dsh` — the same rule the harness uses. */
function resolveHome() {
  const env = process.env.DSH_HOME
  if (typeof env === 'string' && env.trim()) return env.trim()
  return join(homedir(), '.dsh')
}

/** Local-time `YYYY-MM-DD` for one epoch-millisecond instant. */
function dayKey(ts) {
  const d = new Date(ts)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** The last `count` local-time day keys, oldest first, ending today. */
function lastDates(count) {
  const out = []
  const base = new Date()
  base.setHours(12, 0, 0, 0)
  for (let i = count - 1; i >= 0; i -= 1) out.push(dayKey(base.getTime() - i * 86400000))
  return out
}

// ---------------------------------------------------------------------------
// Counting — the only place that decides what "usage" means.
// ---------------------------------------------------------------------------

function bump(counts, skillName, kind, at) {
  const row = counts[skillName] ?? (counts[skillName] = { model: 0, user: 0, firstAt: 0, lastAt: 0, byDay: {} })
  row[kind] += 1
  if (at > 0) {
    if (row.firstAt === 0 || at < row.firstAt) row.firstAt = at
    if (at > row.lastAt) row.lastAt = at
    const key = dayKey(at)
    row.byDay[key] = (row.byDay[key] ?? 0) + 1
  }
}

/**
 * Count skill invocations within one session's event stream.
 *
 * Deliberately counts ATTEMPTS, not successful loads: pairing each `tool/call`
 * with its `tool/result` would require reaching into the tool-result message's
 * content blocks, and an attempt at a skill that has since been renamed is
 * exactly the signal the caller wants to see surfaced.
 *
 * @param events - one session's raw events, as returned by `readSession()`.
 * @returns per-skill counts plus how many recognizable-shaped events failed to yield a name.
 */
export function countSkills(events) {
  const counts = {}
  let malformed = 0
  const list = Array.isArray(events) ? events : []

  for (const event of list) {
    if (!event || typeof event !== 'object') continue
    const data = event.data
    if (!data || typeof data !== 'object') continue
    const at = Number.isFinite(event.time) ? Number(event.time) : 0

    if (event.type === 'tool/call') {
      if (str(data.name) !== 'skill') continue
      let parsed
      try {
        parsed = JSON.parse(str(data.arguments))
      } catch {
        malformed += 1
        continue
      }
      const skillName = parsed && typeof parsed.name === 'string' ? parsed.name.trim() : ''
      if (!skillName) {
        malformed += 1
        continue
      }
      bump(counts, skillName, 'model', at)
      continue
    }

    if (event.type === 'user/message') {
      const source = data.source
      if (!source || typeof source !== 'object' || source.kind !== 'skill-invocation') continue
      const skillName = typeof source.name === 'string' ? source.name.trim() : ''
      if (!skillName) {
        malformed += 1
        continue
      }
      bump(counts, skillName, 'user', at)
    }
  }

  return { counts, malformed }
}

// ---------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------

/**
 * Fold every persisted session log into one count table.
 *
 * A session that cannot be read is skipped and counted, never allowed to abort
 * the scan: one corrupt log must not blank the whole panel.
 */
async function scanUsage(ctx, config) {
  const result = { counts: {}, sessions: 0, failed: 0, malformed: 0, cwds: [] }
  const query = ctx.sessionQuery
  if (!query || typeof query.listSessions !== 'function') return result

  let records
  try {
    records = await query.listSessions()
  } catch {
    return result
  }
  if (!Array.isArray(records)) return result

  const seenCwds = new Set()
  for (const record of records) {
    const header = record && record.header
    if (!header || typeof header.id !== 'string') continue
    if (typeof header.cwd === 'string' && header.cwd && !seenCwds.has(header.cwd)) {
      seenCwds.add(header.cwd)
      result.cwds.push(header.cwd)
    }

    let snapshot
    try {
      snapshot = await query.readSession(header.id)
    } catch {
      result.failed += 1
      continue
    }

    const counted = countSkills(snapshot && snapshot.events)
    result.sessions += 1
    result.malformed += counted.malformed

    for (const [skillName, row] of Object.entries(counted.counts)) {
      const acc =
        result.counts[skillName] ??
        (result.counts[skillName] = { model: 0, user: 0, sessions: 0, firstAt: 0, lastAt: 0, byDay: {} })
      acc.model += row.model
      acc.user += config.includeUserInvocations ? row.user : 0
      acc.sessions += 1
      if (row.firstAt > 0) acc.firstAt = acc.firstAt === 0 ? row.firstAt : Math.min(acc.firstAt, row.firstAt)
      if (row.lastAt > acc.lastAt) acc.lastAt = row.lastAt
      for (const [key, value] of Object.entries(row.byDay)) acc.byDay[key] = (acc.byDay[key] ?? 0) + value
    }
  }

  return result
}

/**
 * Resolve the skill catalog across every workspace that has a session.
 *
 * `ctx.skills.snapshot()` is cwd-sensitive, and a host-level plugin has no
 * agent scope, so the only honest answer is the union over the workspaces this
 * machine has actually worked in. User-level skills (the common case) collapse
 * to one entry because they resolve identically for every cwd.
 */
async function scanCatalog(ctx, cwds) {
  const skills = ctx.skills
  if (!skills || typeof skills.snapshot !== 'function') return { list: [], complete: false }

  const roots = cwds.length > 0 ? cwds : ['']
  const byName = new Map()
  let complete = true

  for (const cwd of roots) {
    let snapshot
    try {
      snapshot = await skills.snapshot(cwd ? { cwd } : undefined)
    } catch {
      complete = false
      continue
    }
    if (!snapshot || !Array.isArray(snapshot.skills)) {
      complete = false
      continue
    }
    if (snapshot.complete === false) complete = false

    for (const skill of snapshot.skills) {
      if (!skill || typeof skill.name !== 'string') continue
      const existing = byName.get(skill.name)
      if (existing) {
        if (cwd && !existing.cwds.includes(cwd)) existing.cwds.push(cwd)
        continue
      }
      byName.set(skill.name, {
        name: skill.name,
        description: str(skill.description),
        source: str(skill.source),
        provider: str(skill.provider),
        modelInvocable: skill.invocation ? skill.invocation.modelInvocable !== false : true,
        userInvocable: skill.invocation ? skill.invocation.userInvocable !== false : true,
        cwds: cwd ? [cwd] : [],
      })
    }
  }

  return { list: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), complete }
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function emptySnapshot() {
  return {
    version: SCHEMA_VERSION,
    generatedAt: 0,
    catalogComplete: false,
    totals: { skills: 0, used: 0, calls: 0, model: 0, user: 0, orphans: 0, orphanCalls: 0, sessions: 0, failed: 0 },
    skills: [],
    orphans: [],
    tracked: { scannedAt: 0, malformed: 0 },
  }
}

/** Merge catalog + usage into the payload the panel renders. */
function buildSnapshot(catalog, usage, home) {
  const dates = lastDates(TREND_DAYS)
  const cataloged = new Map(catalog.list.map((skill) => [skill.name, skill]))

  const trendOf = (byDay) => dates.map((date) => Number(byDay[date]) || 0)

  const rows = []
  for (const [skillName, entry] of Object.entries(usage.counts)) {
    const skill = cataloged.get(skillName)
    rows.push({
      name: skillName,
      calls: entry.model + entry.user,
      model: entry.model,
      user: entry.user,
      sessions: entry.sessions,
      firstAt: entry.firstAt,
      lastAt: entry.lastAt,
      trend: trendOf(entry.byDay),
      cataloged: Boolean(skill),
      description: skill ? skill.description : '',
      source: skill ? skill.source : '',
      provider: skill ? skill.provider : '',
      modelInvocable: skill ? skill.modelInvocable : false,
      userInvocable: skill ? skill.userInvocable : false,
    })
  }

  // Unused catalog entries: a zero row, so the panel can show them behind a toggle.
  const usedNames = new Set(rows.map((row) => row.name))
  for (const skill of catalog.list) {
    if (usedNames.has(skill.name)) continue
    rows.push({
      name: skill.name,
      calls: 0,
      model: 0,
      user: 0,
      sessions: 0,
      firstAt: 0,
      lastAt: 0,
      trend: dates.map(() => 0),
      cataloged: true,
      description: skill.description,
      source: skill.source,
      provider: skill.provider,
      modelInvocable: skill.modelInvocable,
      userInvocable: skill.userInvocable,
    })
  }

  rows.sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))

  const skills = rows.filter((row) => row.cataloged)
  const orphans = rows.filter((row) => !row.cataloged)

  let calls = 0
  let model = 0
  let user = 0
  for (const row of rows) {
    calls += row.calls
    model += row.model
    user += row.user
  }

  return {
    version: SCHEMA_VERSION,
    generatedAt: Date.now(),
    catalogComplete: catalog.complete,
    totals: {
      skills: catalog.list.length,
      used: skills.filter((row) => row.calls > 0).length,
      calls,
      model,
      user,
      orphans: orphans.length,
      orphanCalls: orphans.reduce((sum, row) => sum + row.calls, 0),
      sessions: usage.sessions,
      failed: usage.failed,
    },
    skills,
    orphans,
    tracked: { home, scannedAt: Date.now(), malformed: usage.malformed },
  }
}

// ---------------------------------------------------------------------------
// Durable snapshot cache
// ---------------------------------------------------------------------------

/**
 * The cache exists so a restart paints instantly instead of showing an empty
 * panel until the first scan finishes. It is not a source of truth: deleting it
 * changes nothing but the first-paint latency.
 */
async function loadCache(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION) return null
    if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.orphans)) return null
    return parsed
  } catch {
    return null
  }
}

async function saveCache(file, snapshot) {
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(snapshot), { mode: 0o600 })
  await rename(tmp, file)
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

// ---------------------------------------------------------------------------
// Cordis entry point
// ---------------------------------------------------------------------------

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const home = resolveHome()
  const dataDir = join(home, 'skill-insights')
  const cacheFile = join(dataDir, 'state.json')

  let snapshot = emptySnapshot()
  let timer

  const log = (level, message) => {
    try {
      ctx.logger[level](`[skill-insights] ${message}`)
    } catch {
      /* logging is best effort */
    }
  }

  async function scan() {
    const usage = await scanUsage(ctx, config)
    const catalog = await scanCatalog(ctx, usage.cwds)
    snapshot = buildSnapshot(catalog, usage, home)
    await saveCache(cacheFile, snapshot)
    return snapshot
  }

  ctx.effect(() => {
    ;(async () => {
      try {
        await mkdir(dataDir, { recursive: true })
        const cached = await loadCache(cacheFile)
        if (cached) snapshot = cached
        const fresh = await scan()
        log(
          'info',
          `catalog ${fresh.totals.skills} skill(s), ${fresh.totals.used} used, ` +
            `${fresh.totals.calls} call(s) over ${fresh.totals.sessions} session(s)`,
        )
      } catch (error) {
        log('warn', `initialization failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })()

    // A timer callback that throws or rejects is fatal to the whole application,
    // so every asynchronous tick swallows its own failure.
    timer = setInterval(() => {
      void scan().catch(() => {})
    }, config.scanIntervalSeconds * 1000)

    return () => {
      clearInterval(timer)
    }
  }, 'skill-insights: scanner')

  // Served over DSH's own web server, which binds loopback. No separate port,
  // so nothing is exposed to the LAN and no token is needed.
  try {
    ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(
        () =>
          webCtx.webServer.register({
            kind: 'exact',
            path: SUMMARY_PATH,
            handler: (req, res) => {
              try {
                if (req.method !== 'GET') {
                  sendJson(res, 405, { error: 'method not allowed' })
                  return
                }
                sendJson(res, 200, snapshot)
              } catch (error) {
                sendJson(res, 500, { error: error instanceof Error ? error.message : 'internal error' })
              }
            },
          }),
        `skill-insights: GET ${SUMMARY_PATH}`,
      )
    })
  } catch {
    /* no web server in this composition */
  }
}

// ---------------------------------------------------------------------------
// Self-check — `node index.js`
// ---------------------------------------------------------------------------

/**
 * The smallest thing that fails if the counting logic breaks. Runs only when
 * this file is executed directly, never when Cordis loads it as a plugin.
 */
async function selfCheck() {
  const { strict: assert } = await import('node:assert/strict')

  const events = [
    // Model-invoked, twice.
    { type: 'tool/call', time: 1000, data: { name: 'skill', arguments: '{"name":"ponytail"}' } },
    { type: 'tool/result', time: 1100, data: { message: {} } },
    { type: 'tool/call', time: 2000, data: { name: 'skill', arguments: '{"name":"ponytail"}' } },
    // User-invoked via /ponytail.
    { type: 'user/message', time: 3000, data: { source: { kind: 'skill-invocation', name: 'ponytail' } } },
    // A different skill the model tried but which is no longer installed.
    { type: 'tool/call', time: 4000, data: { name: 'skill', arguments: '{"name":"ghost-skill"}' } },
    // Noise that must not be counted.
    { type: 'tool/call', time: 5000, data: { name: 'read', arguments: '{"path":"x"}' } },
    { type: 'user/message', time: 6000, data: { source: { kind: 'user' } } },
    { type: 'tool/call', time: 7000, data: { name: 'skill', arguments: 'not json' } },
    { type: 'tool/call', time: 8000, data: { name: 'skill', arguments: '{"nope":1}' } },
    { type: 'assistant/message', time: 9000, data: {} },
    null,
  ]

  const { counts, malformed } = countSkills(events)

  assert.equal(counts.ponytail.model, 2, 'model invocations of ponytail')
  assert.equal(counts.ponytail.user, 1, 'user invocation of ponytail')
  assert.equal(counts.ponytail.firstAt, 1000, 'first use')
  assert.equal(counts.ponytail.lastAt, 3000, 'last use')
  assert.equal(counts.ponytail.byDay[dayKey(1000)], 3, 'same-day bucketing spans both invocation kinds')
  assert.equal(counts['ghost-skill'].model, 1, 'orphan skill still counted')
  assert.equal(counts.read, undefined, 'other tools ignored')
  assert.equal(Object.keys(counts).length, 2, 'exactly two skills')
  assert.equal(malformed, 2, 'unparseable and name-less arguments both flagged')

  // An empty or hostile log must degrade, not throw.
  assert.deepEqual(countSkills(undefined).counts, {})
  assert.deepEqual(countSkills([{ type: 'tool/call' }]).counts, {})

  console.log(`skill-insights self-check passed (${Object.keys(counts).length} skills counted)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await selfCheck()
}
