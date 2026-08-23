---
req-id: SWR-2454
status: draft
trace: required
test: required
title: "The live view keeps up with the run"
epic: SWR-2000
date: 2026-08-22
---

# SWR-2454 — The live view keeps up with the run

While a run is executing, the desktop's live surfaces shall reflect new run
activity promptly, and the work the desktop does per update shall be
proportional to what changed rather than to how much the session has
accumulated.

Both halves are required. A view that is fast on a short session and slow on a
long one has not satisfied this; neither has one that is cheap but a second and
a half behind.

This requirement states the properties, not the means. It does not prescribe a
transport, a delivery mechanism, a data format, or whether the current
mechanism is kept, replaced or supplemented; the implementation plan chooses
that. Several of the criteria below are deliberately written as *preserved*
properties — they are what any chosen design has to keep, and they are the
reason the obvious rewrite is not automatically the right one.

## Why

A long session is the normal case for this product: a Ralph loop runs for
hours. The user's experience of it should not degrade as the session earns its
length. Today the per-update cost grows with accumulated session size, so the
sessions that matter most are the ones served worst.

## Acceptance criteria

### Latency

- Run activity becomes visible on the focused session's live surfaces within
  **250 ms** of the engine producing it, at the 95th percentile, measured on a
  session of any length. The current worst case is approximately 1.25 s; the
  budget is the number to review, and a measured baseline must be recorded
  alongside the first implementation.
- The budget applies to the focused session. An unfocused or foreign session
  (§ Reach) may lag further, but must not lag unboundedly.

### Cost

- The work the desktop performs to apply one update is bounded by the size of
  the change, not by the number of events, agents, todos or artifacts the
  session has accumulated. A session holding 3000 events costs the same per
  update as one holding 30, within a small constant.
- This must hold end to end, not only in the view. SWR-2452 already made the
  transcript's *layout* incremental; a design that satisfies this requirement
  in the view while re-reading and re-deriving whole-session state upstream has
  not satisfied it.
- Idle costs nothing: a run producing no activity produces no repeated work
  beyond a bounded liveness check.

#### Scope of the cost criterion, as of 2026-08-23

One limitation, dated, and not a permission: the criteria above are the
obligation, and a design that makes the gap structurally permanent has chosen
wrongly.

**A session executing in another process** is reached only through the
filesystem, and is on the bounded-cost path for its transcript since 2026-08-23.
Three things had to be true, and the order they were false in is worth keeping.

*The run had to write a transcript at all.* It did not. Only the desktop built
transcript rows, from callbacks the desktop installed, so a CLI or headless
session's `state/ui_transcript.json` stayed near-empty until the run ended —
a **content** gap, not a cost one, which no amount of cheap reading would have
fixed. `rotaris_core.session.transcript.TranscriptRecorder` is the one writer
now, below every host, so every session records the same conversation.

*The record had to be followable.* The state files are rewritten whole and offer
no position. The append-only log a run leaves — `evidence/events.jsonl`
(SWR-2901) — now carries each transcript row as it is written (SWR-1829), and can
be read from a recorded position (SWR-2902), so following a run costs what it
added.

*And it had to stay one transcript.* The rows on the wire are the run's own rows,
carried verbatim and put back at the index they came from, then projected by the
same `TranscriptProjector` the local path uses. A session watched from outside
and the same session reopened afterwards are two runs of one function over one
set of rows; they cannot disagree about what was said.

*What is still whole-read.* Everything that is **not** the transcript — todos,
the agent tree, artifacts, token counts — still reaches a foreign session's
viewer through a whole-state read, as does the reconciliation that repairs
anything the store missed. Those surfaces are bounded by how much is happening at
once rather than by session length, so the read is bounded too; the latency
ceiling in § Reach is what keeps its *frequency* honest.

*And what a foreign viewer sees less of.* A row reaches the store when it is
created and again when it settles, not on every mutation — a streamed row changes
once per token, and a store recording each of those would spend its whole cap on
one message. So a foreign viewer sees a streaming row's first token and then its
finished text, rather than the growth between. A local viewer still sees every
character.

**Within this process, two channels carry two shapes of change.** The transcript
is the only surface whose cost grew with the session, so it travels as a delta:
the earliest row that can still change, and everything after it. Every other
surface — child states, todos, pending approvals, verifier progress, token
counts — is bounded by how much is happening at once rather than by how long the
session has run, so it travels whole. Both come from the run itself; neither
waits for a read. With that, the desktop no longer shortens the persistence
debounce, which is what SWR-2130's scope note asks for.

**What the view layer still reads whole.** Two stages downstream of the store
rewrite which rows exist, so a boundary in recorded rows is not a boundary in
displayed ones: filtering the transcript to one agent (SWR-2099) and grouping
consecutive tool calls (SWR-2432). Both are refused by the incremental path
rather than approximated, and the whole-list refresh runs instead — correct, and
no more expensive than it was before. With neither in effect, which is the
default, the bounded path holds from the run to the painted row.

### Reach — what must keep working

- A session executing in **another process** — a CLI or headless run, a second
  desktop window, a detached background session — remains observable from the
  desktop, showing the same content as a session executing in this one. Only
  the latency may differ.
- A session that has **finished** remains inspectable with the same content, as
  does one whose producing process died mid-run.
- Parallel sessions (SWR-2415) keep their per-session behaviour, and unfocused
  sessions keep their summaries live (SWR-2434).

### Correctness — what must not regress

- What the live view shows never contradicts what resuming that session would
  restore. Where the two could diverge, the durable record wins and the view
  converges on it.
- No run-driven work occupies the Qt event loop (SWR-2066).
- A slow, failing or absent view consumer degrades the view only. It never
  fails, stalls or alters the run.
- A run producing activity faster than the view can render it does not starve
  the UI. Coalescing is permitted wherever the latency budget still holds; data
  loss is not — every event that reaches the durable record must be reachable
  by the view.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Applying one update to a projected session touches work proportional to the change: asserted by counting the per-update work over sessions of 30, 300 and 3000 events and requiring the count not to grow with length | the desktop's session-update seam | `apps/rotaris/tests/test_live_update_cost.py` (new) |
| Unit | A view consumer that raises, blocks or is absent leaves the run's own progress and terminal status untouched | the engine→view boundary | `apps/rotaris/tests/test_live_update_cost.py` (new) |
| Unit | The run's own transcript: which rows it reports as settled, what reaches the wire and when, and that a broken watcher leaves the record intact | the transcript recorder | `tests/unit/session/test_transcript_recorder.py` (new) |
| Unit | Following a session in another process: only the addition is read, a settled row replaces the one it opened, a shortened store restarts the view, and a lost line does not misplace the tail | the foreign-session follower | `apps/rotaris/tests/test_session_follower.py` (new) |
| Integration | A run emitting activity has it visible on the focused session within the latency budget on both a fresh and a long session; a session driven by a second process is observed with the same content; a session whose producer died is still inspectable | desktop host ↔ a live run, and ↔ a foreign run | `apps/rotaris/tests/test_live_view_latency.py` (new), `apps/rotaris/tests/test_session_follower.py::test_what_the_follower_shows_is_what_the_session_recorded` |
| User-flow E2E | A user watches a long-running task in the desktop: new transcript rows, todos and agent state appear promptly throughout, the transcript stays readable as it grows, and the session the user was watching resumes to exactly what was on screen | Public product boundary → user-observable result | `apps/rotaris/tests/test_long_session_liveness_e2e.py` (new) |

Related: [SWR-2453 — Every run the desktop starts is the same run as a CLI run](SWR-2453-desktop-runs-on-the-shared-run-lifecycle.md)
(the lifecycle half of the same boundary; the two are independent — the main
desktop run paths already call the shared lifecycle, so this requirement does not
wait on that one),
SWR-2066, in the [Rotaris Desktop epic](../2000-rotaris-desktop.md) (the
off-event-loop property this requirement preserves, and the refresh assumption
it narrows — that entry carries the scope note),
[SWR-2452 — Transcript geometry is incremental](SWR-2452-incremental-transcript-geometry.md)
(the same bounded-cost property, already satisfied in the view layer),
[SWR-2901 — Session event store](../2900-event-store/SWR-2901-session-event-store.md)
and [SWR-2130 — Debounced session persistence](../1500-sessions-diagnostics/SWR-2130-debounced-session-persistence.md)
(the durable record this requirement must stay consistent with),
[SWR-1829 — Versioned event schema](../1800-cli-headless/SWR-1829-event-schema.md)
(the prerequisite named in § Scope of the cost criterion, met on 2026-08-23: the
wire stream now carries what the agents said. Adding an event type is
backward-compatible by that requirement's own rule and did not bump the schema
version),
[SWR-2902 — Query and replay API](../2900-event-store/SWR-2902-query-and-replay.md)
(the other half of that prerequisite: a store can be read from where a reader
last got to, which is what makes following a running session cost what it added).

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
