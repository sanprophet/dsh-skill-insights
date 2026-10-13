# dsh-skill-insights

[中文](README.zh.md)

Lists **every skill** a DSH installation can resolve, and **how often each one was actually used**. Reads this machine only, serves over DSH's own loopback web server: no extra port, no network egress, no skill is ever modified.

## Why this exists

[`dsh-skill-hub`](https://github.com/cheshireez/dsh-skill-hub) already tracks per-skill call counts, but it requires `dsh >= 0.1.7-alpha.1` and **does not load at all** on older versions. The skill-management plugins that *do* install on older versions (such as `@michengai/dsh-skills-manager`) manage the catalog without ever counting usage.

This plugin fills that gap, and deliberately does one thing only: no market, no enable/disable toggles, no scaffolding, no diagnostics. Just the numbers.

## Where the data comes from

Both skill invocation paths are recorded in the session log, so the log is the single source of truth:

| Path | Shape in the log |
|---|---|
| Model-invoked | a `tool/call` event with `name: 'skill'`, whose `arguments` is the **unparsed** JSON string (read `.name`) |
| User-invoked `/skill-name` | a `user/message` event with `source: { kind: 'skill-invocation', name }` |

Reading goes through `ctx.sessionQuery.readSession()`, so decompression and replay validation stay inside the persistence backend — this plugin never touches zstd and never parses the log format.

**Attempts are counted, not successful loads.** Telling them apart means pairing each `tool/call` with its `tool/result` content blocks, and an attempt at a skill that has since been renamed is exactly the signal you want surfaced — so it is kept, in the *Uninstalled / unknown* bucket.

**The whole table is recomputed from scratch on every scan.** The log is complete and replayable, so a full recount *is* the right answer: no watermark, no negative deltas, no drift across restarts. The cost is re-reading every log per scan; see the config table below.

## Install

```bash
dsh plugin --profile web add dsh-skill-insights
```

Use whichever profile name you run (`web`, `desktop`, …), then **restart DSH**. The panel appears in the sidebar, next to Usage Insights.

Verifying the data without the GUI — the panel reads exactly this route:

```
http://127.0.0.1:19387/skill-insights/summary
```

## Configuration

In your profile's `cordis.patch.yml`:

| Field | Default | Range | Meaning |
|---|---|---|---|
| `scanIntervalSeconds` | `300` | 10–3600 | Scan interval. Every scan re-reads all session logs. No need to touch this until scanning outgrows the interval |
| `includeUserInvocations` | `true` | — | Turn off to count model invocations only and ignore `/skill-name` injections |

## The panel

- **KPIs** — available skills, skills used, total calls (split model / user), uninstalled / unknown.
- **Table** — skill · source · calls · model/user · sessions · last used · a 30-day mini trend. Sorted by call count descending, with **uninstalled skills pinned first** (they are the most actionable row).
- **Filter box** and a **Show unused skills** toggle, off by default: with 70+ skills, most are zeros and they drown out the signal.
- A `tracked` footer line reports how many sessions were scanned, how many were unreadable, and how many events failed to parse — so a wrong number points straight at an unfinished scan.

## Known limitations

- **Not real-time** — a 5-minute delay by default.
- **Deleting a session deletes its recorded usage**, because counts are recomputed from the logs. Keeping them forever would need an append-only lifetime table.
- **Failed calls still count as usage.** See above.
- **The catalog is the union over workspaces.** `ctx.skills.snapshot()` is cwd-sensitive and a host plugin has no agent scope, so it queries once per workspace that has a session, then merges. User-level skills resolve identically everywhere and collapse to one row; project-level skills only appear in their own workspace.
- **The catalog can be incomplete** when a provider fails during discovery. `snapshot.complete === false` is reported at the top of the panel rather than silently dropping rows.

## Development

```bash
npm test
```

- `node index.js` — self-check for the pure `countSkills` function. Builds a synthetic event stream (two model invocations, one user invocation, one uninstalled skill, several noise events) and asserts counts, first/last use, day bucketing and the malformed-event counter; then feeds an empty array and a bare `{ type }` event to confirm it degrades instead of throwing.
- `node check-host.mjs` — host integration check. A fake Cordis context and a throwaway `DSH_HOME` exercise the whole path a restart takes: folding two sessions into one table, the cwd union that drives catalog discovery, an unreadable session being counted instead of fatal, the snapshot the route serialises, the `405` guard, and the durable cache.
- `node check-client.mjs` — load/render check for `client.js`. A minimal React stand-in keeps it dependency-free; it asserts the module-loader contract, both slot registrations, that the zh and en dictionaries expose identical keys, that all render paths build a tree, and that the output contains no `MISSING:` (i.e. every copy key the panel uses exists).

`client.js` is a hand-written browser bundle: `window.__ModuleLoader__.load` plus `react` from the frozen module table. No build step, no client package dependency.

> ⚠️ Never run two `dsh web` instances against the same `DSH_HOME` and cwd — session logs are not locked, and that corrupts them with a `seq gap`.

## License

MIT
