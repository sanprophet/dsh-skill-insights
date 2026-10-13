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
  const result = { counts: {}, sessions: 0, failed: 0, malformed: 0, cwds: [], refs: [] }
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
    const cwd = str(header.cwd)
    if (cwd && !seenCwds.has(cwd)) {
      seenCwds.add(cwd)
      result.cwds.push(cwd)
    }

    let snapshot
    try {
      snapshot = await query.readSession(header.id)
    } catch {
      result.failed += 1
      continue
    }

    // Reused below for the session-addressed catalog, which resolves its
    // agent-preset scope from the session id rather than from this cwd.
    result.refs.push({ id: header.id, cwd })

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
 * Fold one catalog observation into the merged table.
 *
 * A name can arrive twice — once from a session's resolved catalog and once from
 * the global registry layer — so the merge keeps the first description, ORs the
 * invocation flags, upgrades placeholder metadata when the richer source
 * arrives, and records every workspace the skill resolved in.
 */
function upsertSkill(byName, skill, cwd) {
  const existing = byName.get(skill.name)
  if (existing) {
    if (!existing.description && skill.description) existing.description = skill.description
    if (!existing.source && skill.source) {
      existing.source = skill.source
      existing.provider = skill.provider
    }
    if (skill.modelInvocable) existing.modelInvocable = true
    if (skill.userInvocable) existing.userInvocable = true
    if (cwd && !existing.cwds.includes(cwd)) existing.cwds.push(cwd)
    return
  }
  byName.set(skill.name, { ...skill, cwds: cwd ? [cwd] : [] })
}

/**
 * Resolve the skill catalog. Two sources, because neither is sufficient alone.
 *
 * 1. `ctx.sessionSkillCatalog.list({ sessionId })` is the authoritative one.
 *    The registry is LAYERED PER AGENT-PRESET SCOPE, and `dsh-skill-filesystem`
 *    — the provider that discovers skills from this machine's skill roots —
 *    registers into a preset layer, not the global one. That service resolves
 *    the session's scope for us without activating a cold agent, which is the
 *    only way a host-level plugin can see those skills at all.
 *
 * 2. `ctx.skills.snapshot()` reads the GLOBAL layer ALONE. It misses every
 *    locally discovered skill, but it is where deployment-level
 *    (bundled/repository) entries live, and it is the only source carrying real
 *    `source`/`provider` metadata, so it runs second and enriches.
 *
 * Getting this wrong is not subtle: with source 1 missing, every installed
 * skill reports as "uninstalled" — which is exactly what happened before this
 * was found.
 */
async function scanCatalog(ctx, refs, cwds) {
  const byName = new Map()
  let complete = true
  let sawScoped = false

  // `ctx.get` without `strict` returns undefined for an absent service instead
  // of throwing, which is exactly the optional read wanted here.
  const scoped = typeof ctx.get === 'function' ? ctx.get('sessionSkillCatalog') : undefined
  if (scoped && typeof scoped.list === 'function') {
    const controller = new AbortController()
    try {
      for (const ref of refs) {
        let value
        try {
          value = await scoped.list({ sessionId: ref.id }, controller.signal)
        } catch {
          // A session whose composition cannot be resolved is counted, never
          // fatal: one odd session must not blank the whole catalog.
          complete = false
          continue
        }
        sawScoped = true
        const entries = value && Array.isArray(value.skills) ? value.skills : []
        for (const entry of entries) {
          if (!entry || typeof entry.name !== 'string') continue
          // No source/provider on this shape; the global read supplies them
          // when the skill is also visible there.
          upsertSkill(
            byName,
            {
              name: entry.name,
              description: str(entry.description),
              source: '',
              provider: '',
              modelInvocable: entry.modelInvocable !== false,
              userInvocable: true,
            },
            ref.cwd,
          )
        }
      }
    } finally {
      controller.abort()
    }
  }

  const skills = ctx.skills
  const canSnapshot = Boolean(skills && typeof skills.snapshot === 'function')
  if (canSnapshot) {
    const roots = cwds.length > 0 ? cwds : ['']
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
        upsertSkill(
          byName,
          {
            name: skill.name,
            description: str(skill.description),
            source: str(skill.source),
            provider: str(skill.provider),
            modelInvocable: skill.invocation ? skill.invocation.modelInvocable !== false : true,
            userInvocable: skill.invocation ? skill.invocation.userInvocable !== false : true,
          },
          cwd,
        )
      }
    }
  }

  // Neither path usable: mark the catalog incomplete so the panel warns rather
  // than labelling every used skill "uninstalled".
  if (!sawScoped && !canSnapshot) complete = false

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

  const log = (level, message) => {
    try {
      ctx.logger[level](`[skill-insights] ${message}`)
    } catch {
      /* logging is best effort */
    }
  }

  async function scan(dataCtx) {
    const usage = await scanUsage(dataCtx, config)
    const catalog = await scanCatalog(dataCtx, usage.refs, usage.cwds)
    snapshot = buildSnapshot(catalog, usage, home)
    await saveCache(cacheFile, snapshot)
    return snapshot
  }

  // `sessionQuery` and `skills` belong to sibling plugins, and reading a service
  // this context never declared THROWS (`cannot get property "..." without
  // inject`) instead of returning undefined. So the scanner borrows a context
  // that may legally read both: taking the pair through `ctx.inject` keeps the
  // panel mounted — and serving an empty snapshot — in a composition that lacks
  // one of them, while the read itself stays legal.
  try {
    ctx.inject(['sessionQuery', 'skills'], (dataCtx) => {
      dataCtx.effect(() => {
        ;(async () => {
          try {
            await mkdir(dataDir, { recursive: true })
            const cached = await loadCache(cacheFile)
            if (cached) snapshot = cached
            const fresh = await scan(dataCtx)
            log(
              'info',
              `catalog ${fresh.totals.skills} skill(s), ${fresh.totals.used} used, ` +
                `${fresh.totals.calls} call(s) over ${fresh.totals.sessions} session(s)`,
            )
          } catch (error) {
            log('warn', `initialization failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        })()

        // A timer callback that throws or rejects is fatal to the whole
        // application, so every asynchronous tick swallows its own failure.
        const tick = setInterval(() => {
          void scan(dataCtx).catch(() => {})
        }, config.scanIntervalSeconds * 1000)

        return () => {
          clearInterval(tick)
        }
      }, 'skill-insights: scanner')
    })
  } catch {
    /* neither service in this composition: the panel keeps serving an empty snapshot */
  }

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
