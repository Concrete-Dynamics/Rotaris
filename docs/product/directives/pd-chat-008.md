[Product directives](../directives.md) › PD-CHAT-008

<a id="pd-chat-008"></a>

### PD-CHAT-008 — the run timer counts from the newest row the run produced

While a run is active, REQ-CHAT-158's run-timing indicator SHALL count from the **newest transcript row the run produced**,
the unsettled one first, and restart from `0:00` when a newer row appears. A model call that writes no row (a summariser's,
a classifier's) does not restart it, and a call that has written nothing yet is counted from the end of the step before it.
Where several calls of one run are in flight at once, the value follows whichever of them wrote the newest row. No model
call's start is published on the record for it. Every other clause of REQ-CHAT-158 still governs: the `M:SS` and `H:MM:SS`
forms, the freeze at the run's total once it ends, no duration before a first run, the tick of at least once a second under
REQ-CHAT-063, and a tick that writes no state.

**As built.** `modelCallStartedAt` and `runTimingSeconds` (`packages/ui/src/composer.ts`), `stepStartedAt`
(`packages/ui/src/WorkspaceView.tsx`), drawn by `packages/ui/src/RunHeader.tsx`; `SessionRecord` carries `runStartedAt` and
no per-call boundary.

**Why, and what it costs.** OQ-200: a run can have several model calls out at once (the root's, each running child's, a
summariser's, a classifier's), and REQ-CHAT-158 speaks of "the model call currently in flight" as if there were one. Counting
any one of them would need the engine to publish a call's start on the record, a contracts and engine change before it is a
surface one. The owner confirmed the reading the build proceeds under. What it costs: the value can read longer than the
call in flight (the default live run at `27a5127` read 0:09 while the summariser's call was 5.5 s in), and a quick call that
writes no row is never seen to begin.

> **Narrows:** REQ-CHAT-158

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-200.*
