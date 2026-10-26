# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Corrected on first execution of the run loop — 2026-09-03: a whole-session update keeps the rows

Part 8 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

## Corrected on first execution of the run loop — 2026-09-03: a whole-session update keeps the rows

*Recorded under GD-10. This corrects the note immediately above, which is kept as written.*

**The note above said** a whole-session update clears the replica's transcript, "because the attach and
the reconcile both re-deliver it … and a snapshot alone cannot say which rows survived", and that keeping
rows across a snapshot "was only safe while nothing published one". **That reasoning was wrong, and the
first run in the application showed it:** every status save the run loop makes publishes a whole-session
update (`starting`, `running`, once per iteration, `cancelling`, the terminal status), and the first
completed run painted its notice over a transcript reading "No rows yet". The rows had been cleared five
times while they were being written.

**The correction, and the reading that carries it.** `REQ-MONITOR-216` fixes that the whole-session update
carries the session record with its unbounded collections emptied — the transcript is not in it. A
snapshot therefore *cannot* speak for the rows, which is exactly why it must not clear them. The attach
and the reconcile still re-deliver the resident window on the increment channel immediately after, and
that increment **upserts by index** (`REQ-EVENTS-052`), so a surface that held rows keeps them and gains
what it lacked; rows never disappear from a session, so nothing a snapshot could have removed exists.
`packages/ui-core/src/replica.ts` keeps the rows and a test pins a status save mid-run leaving them on
display. **This is the sixth mechanism built for the first time to hold a defect no reading caught**, and
the count is kept in ADR-0058 consequence 17.

**What the earlier note got right and stands:** every attach begins with a whole-session update; the
increment that follows carries the number the surface counts on from; a genuine reset at index 0 is not
a decline.

**Third execution — 2026-09-05, the Overview view (Part M).** The whole-session record gains what REQ-MONITOR-164..171
read and nothing a view could derive: `runStartedAt`; `usageHistory` — the token history the RUN samples every 10 s
on the clock port and once at the terminal save, 120 kept, persisted on the session row (`token_samples`, store v7) so
the sparkline is the same when the session is reopened; `costLabel` with its qualifier (REQ-MONITOR-166's three; this
build configures no rate, so every label is `unknown`); `toolCalls` — the total, the agents it spans and the per-tool
counts, read from `tool_calls` by the projection owner at snapshot time through the primary key (a plan assertion
pins it). Each periodic sample is a status save and therefore a whole-session update; the Overview is mounted only
while shown, so nothing refreshes while it is hidden (REQ-MONITOR-174). The field is named `usageHistory` because
the contracts test refuses a channel field containing the word `token` — `tokenUsage` is its one named exception.
**Found: nothing** in the replica; the defect the view found was main's (ADR-0055 note).

**Fourth execution — 2026-09-05, the second replica and the record the agent surfaces read (Part R).** *Recorded under GD-10.*
The first-execution note left "several windows on one session" and "a hidden window's unsubscribe" unexercised; both ran
here. A persona window (ADR-0048 B) is a second renderer holding its own replica of the same numbered publications; the
Mission view, the inspector and the window all read the ONE record. **Found — the twenty-seventh defect:** main's
`session.subscribe` and `session.unsubscribe` subscribed **the main window's** sink whatever window asked (`wcId`, not the
sender), so a second renderer on one session would have fed the main window twice and itself never — unseen because only
the main window had ever subscribed. The sender is the subscriber now; the reason is kept beside the fix in `main/index.ts`.
**Found — the twenty-eighth:** the projection owner published the whole-session record on a **save** only, because when it
was built (2026-09-03) the run's status saves were the only thing that changed the record; from Part B on the ledger
changes it — a child spawned, claimed or settled, a tool started or finished — with no save, so every agent surface showed
a child's state up to one sampling period (10 s) late and never saw a tool as active. The owner now publishes the record
after a commit carrying `child.spawn`, `child.transition`, `tool.start` or `tool.finish` (`RECORD_CHANGING_EVENTS`),
**coalesced to one read and one publication per 80 ms tick on the clock port** — the first form published on every such
event, and the Part J proof's queue launch showed the cost at once: a read of the record per tool event slowed a scripted
iteration by about 50 ms per tool call and the run missed the proof's 9 s budget, so the tick was added and the proof passed
again; the rows are untouched (REQ-MONITOR-216), a save publishes at once and clears a pending tick, the numbers stay one
series, and a test pins the four kinds, the burst, the save and the one kind that does not publish. The Overview's tree, the Workspace sidebar and the Mission tree had trailed the ledger by that period since Part B
without any proof noticing, because every proof read the store after the run.

**The record (REQ-MONITOR-044, Part R):** `AgentRecord` gains `reasoning`, `contextUsed`, `contextLimit`, `grantedTools`,
`calledTools`, `activeTools`, `delegationSessionId`, `inheritedContext`. The called and active sets and the latest prompt
reading are kept **incrementally** beside the writer (`children/activity.ts`, fed at `tool.start`/`tool.finish` and after
every model step, seeded once from the tool-call ring when a session is loaded), so projecting the record never re-reads
the transcript (REQ-MONITOR-038). The limit is REQ-MONITOR-080's default for every agent: the run host's setup does not
carry a model's `max_input_tokens` (the loader parses it; `RunSetup` drops it), and the hook for it (`contextLimitFor`)
is left unfilled and named in the handoff. The run-level agent is not in `agents` (REQ-MONITOR-043) — the surfaces build it
from the record's status, the entry role's configured model and reasoning, and the session's tool total less the
children's; its own prompt reading and tool history are not carried, and the inspector says so.

**A reading on REQ-MONITOR-211/213:** the projection presents a non-terminal child of a session whose status neither
claims a live run nor is `idle` as settled to the run's own outcome (activity "Ended with the run.", chips cleared) — one
projection, no surface settling for itself. In this build's routes it is a belt: opening a stored session runs
REQ-ORCH-053's sweep **first**, which settles such a row `cancelled` before any surface sees it, and every exit from an
iteration leaves the children terminal; the proof's planted `running` row came back `cancelled` on every surface (the
sweep's word, not REQ-MONITOR-211's `succeeded`), which is what REQ-MONITOR-213 requires — one settled state everywhere,
none showing it running.

**Measured** (`pnpm mission-proof`): one whole-session publication carrying 23 agents applied and painted with the Mission
view visible in **11.8 ms** (REQ-MONITOR-038's 250 ms budget); the three trees (Mission, Overview, Workspace) probed within
2 s of each other carried identical ids and states; a 3-agent publication 8.8 ms.
