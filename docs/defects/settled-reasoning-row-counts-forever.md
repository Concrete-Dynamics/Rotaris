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
