---
req-id: SWR-2446
status: approved
trace: required
test: required
title: "Thinking rows show duration and a live token estimate"
epic: SWR-2000
date: 2026-08-10
---

# Thinking rows show duration and a live token estimate

Thinking rows shall summarise themselves as a monospace `▸ reasoning · 7s · ~230 tok`
header — the word `reasoning` in the accent family (tools own the teal), metrics dim,
`tok` as the token unit per the design comp — instead of a bare "Show reasoning" link.
While reasoning is still streaming the row reads `◉ reasoning… 7s · ~230 tok` with a
pulsing dot and both numbers counting upward. The expanded reasoning body renders as a
quote block behind a 2px accent rail in italic secondary text.

The run bridge stamps `started_at` (wall clock) and accumulates `chars` — the total streamed
reasoning length, counted past the persisted 4 000-character content cap — on every reasoning
delta, and stamps `duration` when the thinking burst ends (visible text arrives, a tool call
flushes, or the segment closes). The token figure is an estimate (`chars / 4`) because
providers do not stream usage; exact totals continue to land in the session KPIs.

One burst is one row. The complete `reasoning_content` the SDK attaches to the action event
repeats what was already streamed; the bridge folds it into the burst's existing row
(reconciling `chars` and content) instead of appending a duplicate. Reasoning that was never
streamed arrives whole, so its row is created complete — without `started_at` — and can never
render live. A session that is not running streams nothing: on projection, unstamped rows
(killed runs, duplicates persisted by older bridges) lose their liveness, and a row that
merely duplicates the previous burst's content is dropped.

## Acceptance criteria

- A streamed thinking row carries `started_at` and a `chars` counter that grows with every
  reasoning delta, including deltas beyond the content cap.
- Ending the burst by visible text, by a tool call, or by closing segments stamps `duration`
  once; the value approximates the streaming window in seconds.
- A finished row renders a mono `▸ reasoning` header with the accent-coloured keyword plus
  `· <n>s · ~<n> tok` metrics when known; rows from older sessions without these fields
  fall back to a plain `▸ reasoning` header.
- A live row (no duration yet) renders `reasoning…` with a pulsing dot, elapsed seconds
  derived from `started_at` at paint time, and the current token estimate.
- Clicking the header still toggles the full reasoning body (same anchor interaction as
  before); the body renders behind an accent-coloured rail in italic secondary text.
- A streamed burst followed by the action event carrying the same `reasoning_content`
  yields exactly one thinking row, duration stamped and `chars` covering the full text;
  never-streamed reasoning yields one complete row without `started_at`.
- Projecting a session that is not running renders no live thinking rows: unstamped
  `started_at` values are dropped, as are rows duplicating the preceding burst's content.
