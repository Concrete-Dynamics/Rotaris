## The same MCP validation block repeated once per connection attempt in the launch log

Observed live 2026-09-18, run `cc6191a2` (logged as R-039): the launch log carried the identical ~80-line
validation traceback several times over — once per connection attempt — on top of the per-connection burst
ADR-0033's first execution already measured (55 lines per connection).

OQ-63's ruling stands — no level is filtered, and the application log still keeps every level. What changed
is only the repetition: consecutive repeats of a line already logged collapse to one line plus a count (the
first occurrence is always written, so a line not written cannot be recovered), a single line longer than
500 chars is truncated with its length named, and `stderrTail` (REQ-MCP-107's root-cause text) keeps
everything regardless. The summary flushes on close too, so it is in the log before `close()` resolves.

## Specs

No requirement contradicted — a volume repair inside OQ-63's "the log keeps every level" ruling.

## Relevant files

- `packages/mcp/src/transport.ts` — the dedupe counter, the truncation, the close flush.
- `packages/mcp/src/mcp.test.ts` — the repeat-collapse test.
- `apps/desktop/scripts/fixtures/mcp-fixture-server.mjs` — `--stderr-repeat`/`--stderr-count`.

Noticed 2026-09-18 by the run-autopsy of run `cc6191a2`; repaired on the same branch.

*Confirmed landed and filed 2026-09-22: the repeat counter and its flush are in
`packages/mcp/src/transport.ts:152-165`, and `stderrTail` is kept whatever the log does with the line.
The note recorded its own repair and was never moved.*

*Superseded in part 2026-09-27: "OQ-63's ruling stands — no level is filtered" is no longer true. OQ-63 was ruled on
2026-09-23 as [`PD-MONITOR-002`](../../product/directives/pd-monitor-002.md#pd-monitor-002) and built, so the application log records
`info` and above unless `ROTARIS_APP_LOG_LEVEL` restores `debug`, and a child's stderr — `debug` — is not written at the
default. The collapse and the truncation above still shape what a `debug` log holds; `stderrTail` is unchanged.*
