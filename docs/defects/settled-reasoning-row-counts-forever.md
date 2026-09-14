## Settled reasoning row keeps counting upward

The engine settles a streamed-reasoning row without a duration: `packages/engine/src/run/turn.ts`
`step()` calls `writer.settleRow(reasoningIndex, reasoning)` with no settle fields, in both the
mid-stream arm (answer body starts) and the end-of-call arm. The renderer's `reasoningSummary`
(`packages/ui/src/transcript/Row.tsx`) computes settled elapsed as
`row.durationMs !== undefined && row.settled ? row.durationMs : Math.max(0, nowMs - startedAt)`,
where `nowMs` is the pane's once-a-second tick. A settled row with no stamp therefore keeps
showing rising seconds against the tick for the rest of the session — the counter the row
already stopped being live never freezes.

## Specs

Contradicts **REQ-CHAT-062**: the settled form is `▸ reasoning · <N>s · ~<T> tok` — final
figures, stated against the streamed span. Only the streaming form counts upward
("both numbers counting upward" is attached to the `◉` form). REQ-CHAT-164's stop-where-it-
stands rule says the same thing for the animation; the elapsed figure is the sibling obligation.

## Relevant files

- `packages/engine/src/run/turn.ts` — both `settleRow(reasoningIndex, ...)` call sites;
  the duration is `clocks.wall` at settle minus the row's `startedAt`, on the clock port.
- `packages/ui/src/transcript/Row.tsx` — `reasoningSummary`'s settled branch; a defensive
  fallback may freeze an unstamped settled row at `Date.parse(row.at) - startedAt`, which is
  derivable from the record alone.
- `packages/engine/src/engine.test.ts` — where a settle-fields regression sits.

## Repaired — 2026-09-14 (retrospective record)

The repair landed in commit `71dad83` on `main` (2026-09-13), which also carried the
sibling defect `estimate-counts-collapsed-thinking-body`; this section records what was
delivered, which the note itself did not carry at the time.

**Engine side (`packages/engine/src/run/turn.ts`).** `settleReasoning()` now stamps
`durationMs` on every settle — the wall span from the row's `startedAt` to the settle
instant, on the clock port, clamped at zero. A row with no readable `startedAt` settles
with no stamp rather than a fabricated one; the renderer's fallback closes that case.

**Renderer side (`packages/ui/src/transcript/Row.tsx`).** `reasoningSummary`'s settled
branch never reads the tick: a stamped row uses its `durationMs`; an unstamped settled row
(older records) freezes at the span its own record closes — `at` minus `startedAt`; a row
with neither figure reads zero. Only the streaming branch counts against `nowMs`, as
REQ-CHAT-062 attaches the upward counting to the `◉` form alone.

**Regressions.** `packages/engine/src/engine.test.ts`: a thinking row stamped with
`startedAt` settles with the `durationMs` the final figures close on (persisted
`duration_ms` asserted). `packages/ui/src/rows.test.ts`: a settled reasoning row never
reads the tick — stamped, unstamped and bare rows each asserted against a tick ten
minutes past the settle.

Verification: the three suites touched by the commit re-run green on `main`
(`engine.test.ts`, `rows.test.ts`, `transcript.test.ts` — 73 tests).
