# `live-run` — The evidence pack, and what it is for

Part 6 of 12 of [the live-run record](../live-run.md), which indexes every part.

## The evidence pack, and what it is for

Evidence lands in `.live-run/runs/<stamp>/` (gitignored). **Packs accumulate** — `.live-run/latest.txt` names the
newest and `--keep-runs` (default 10) prunes the oldest — so two runs can be compared, which they could not be
while each run emptied the directory.

At the pack's root — whatever ended the run, a launch that overran or threw and a signal included (`results.json`'s
`ended` says which, `lib/run-ending.mjs`) — `results.json` with every check, the accounting kind and the spend; `agents.yaml` as the run
saw it; `build.log`; **`workspace.db`, the store copied out of the sandbox before it is deleted**; and
**`evidence-manifest.json`** — the platform, node and Electron, the git head and dirty flag, the measured build's
freshness against its sources, and every file's size and sha256, written last so `results.json` itself is covered
(`pnpm evidence verify <dir>` re-hashes a pack; `pnpm evidence write <dir>` writes one for any other evidence
directory). Then one directory per scenario:

| file | what it holds |
|---|---|
| `app.log` | the launch verbatim, key substituted out and asserted free of a bearer, at `--app-log-level` (`debug` or `info`; default: the product's own, `info`; `warning` and `error` are refused before any launch, since the run's readings read the `info` lines they drop) |
| `app.filtered.log` | the same log with consecutive repeats collapsed and the sandbox path shortened, and a child MCP server's stderr dropped where the log holds any — two thirds of a launch log used to be one language server booting. Since `PD-MONITOR-002` the product's own log records `info` and above and that stderr is `debug`, so a live-run log carries none of it unless the run names `--app-log-level=debug` or a scenario sets `ROTARIS_APP_LOG_LEVEL=debug`, the one switch that restores it |
| `autopsy.txt` | `apps/desktop/scripts/autopsy.mjs` over that scenario's session |
| `session.log` | the product's own per-session log, at `--session-log-level` (default `INFO`) |
| `summary.md` | the product's own human-readable summary of the session (REQ-SESSION-140), as it stood when the scenario ended; the run checks it carries the requirement's sections in their order and that its Tool errors line agrees with its Issues line (`lib/summary-sections.mjs`; since finacc3's F10 the line reads `at least N` past the issues record's cap, and the agreement is read in either form); since fin25 a summary step that throws (the credential guard, the write, the check itself) records a failed check rather than none |
| `transcript.md` | every transcript row in full, not the 400 characters `results.json` keeps |
| `model-traffic.jsonl` | **what the model was sent and what came back** — request and response bodies, status and duration per call, in the file of the scenario that made the call, each naming how it ended (`outcome`: `complete`, `aborted` when the product let go — the endpoint is let go with it — `in-flight at close`, `stalled`, `released`, `cut`, `upstream-error`, `unreachable`). The product logs a method and a URL and nothing else, so this exists nowhere else |
| `*.png` | the end of the scenario, plus one a fifth and one three fifths through its wait |
| `node-test.log`, `diff.txt`, `changed/` | where the scenario produces them |

**That shape is the run-autopsy skill's input.** `.agents/skills/run-autopsy/SKILL.md` asks for a launch log, the
session store and a session id; the live run produced all three and used to delete two of them with the sandbox,
which is why every defect that skill has found came from a session somebody drove by hand. Read a pack with
`pnpm autopsy .live-run/runs/<stamp>/workspace.db <session-id>`, or point the skill at the pack directory.
The pack stays out of the repository; an autopsy the record cites is kept in
[`docs/architecture/live-runs/`](../../architecture/live-runs/README.md) (since 2026-10-13), with no host, URL, key or token in it.

The sandbox itself is deleted at the end unless `--keep`. The record of what happened in it is not.
