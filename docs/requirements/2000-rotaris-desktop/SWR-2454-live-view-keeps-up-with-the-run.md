---
req-id: SWR-2454
status: approved
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
length. When this was written the per-update cost grew with accumulated session
size, so the sessions that mattered most were the ones served worst.

## Acceptance criteria

### Latency

- Run activity becomes visible on the focused session's live surfaces within
  **250 ms** of the engine producing it, at the 95th percentile, measured on a
  session of any length. The worst case this replaced was approximately 1.25 s;
  the budget is the number to review, and a measured baseline must be recorded
  alongside the first implementation.
- The budget applies to the focused session. An unfocused or foreign session
  (§ Reach) may lag further, but must not lag unboundedly.

#### The measured baseline, 2026-08-23

Recorded because the criterion above asks for it, and written down with its
machine because there is no CI on this platform to notice it drifting.

`apps/rotaris/tests/test_live_view_latency.py::test_a_row_is_visible_within_the_budget_however_long_the_session_is`
times the interval between the engine recording a row and that row reaching the
view, over 150 rows, with the reconciling timer stopped so a measurement cannot
be a poll that happened to land. Two runs, on Windows 11 (10.0.26200), an 8-core
/ 16-thread Intel Comet Lake, Python 3.12.7, nothing else running:

| Rows already held | Median | p95 | Max |
| --- | --- | --- | --- |
| 0 | 2.0 / 2.7 / 2.2 ms | 3.0 / 4.0 / 2.8 ms | 20.2 / 6.6 / 5.2 ms |
| 2000 | 2.0 / 2.9 / 1.9 ms | 2.9 / 5.2 / 2.5 ms | 53.0 / 122.2 / 49.2 ms |

Two things the numbers say. The budget has roughly two orders of magnitude of
headroom — 250 ms was set against a ~1.25 s worst case, and the measurement is a
few milliseconds — so it is a ceiling on the design rather than a description of
it, and a future change eating that headroom would still pass. And the p95 does
not move between an empty session and a 2000-row one, which is the § Cost claim
showing up in the latency measurement rather than only in the operation counts.

The maxima do move, and are the honest caveat: a single row occasionally takes
tens of milliseconds, sometimes over a hundred, tracking garbage collection and
OS scheduling rather than session length. That is why the criterion is written
at the 95th percentile and the test asserts there.

**The measurement is `serial`, and that is load-bearing.** Run after a few
hundred other Qt tests in one process the same code reports a p95 in the
hundreds of milliseconds: it is timing the widgets they left alive and the
garbage they left to collect. The budget belongs to the product, so it is
measured where the product's conditions hold rather than relaxed to survive a
crowded process.

**What is *not* measured here, and why the budget survives it.** Latency is
measured on rows, because a row the reader has not seen is what reads as
lateness. Growth inside a row they already have — a message or a reasoning
burst extending token by token — is deliberately coalesced to a 50 ms tick
instead (`run_bridge.py::_request_publish`), well inside this budget. Publishing
that growth per token instead was what made the window stop responding on
2026-08-23: each publication costs the Qt thread a delta *and* a whole session
projection, and a provider emits tokens far faster than either can be drawn.

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
consecutive tool calls (SWR-2432).

**The panels beside the transcript, as of 2026-08-23.** The criterion above names
agents and todos, and until this date the surfaces that draw them did not meet
it. `agents_changed` carries no payload, so every consumer answered "something
about some agent moved" by tearing its rows down and building them again — and a
running agent's elapsed time, context use and tool count move on every
publication. Six consumers were connected, three of them separate `AgentTreeList`
instances, all built at startup and never destroyed, none rate-limited, none
aware of whether anyone was looking at them.

Measured on the machine in the baseline above, before and after:

| Work | Before | After |
| --- | --- | --- |
| `AgentTreeList.refresh`, 10 agents | median 31.9 ms | median 0.57 ms |
| `AgentTreeList.refresh`, 30 agents | median 100.3 ms, max 1070.3 ms | median 1.65 ms, max 2.73 ms |
| `WorkspaceView._refresh_inspector`, 44 tool chips | 53.4 ms of chip rebuilding alone | 0.5 ms |

Three changes, in the order they matter. Rows are **reconciled** rather than
rebuilt: an agent tree keeps the row widgets it has and writes the fields that
moved, which was measured at roughly 3 ms to build a row against 0.02 ms to
update one. Strips whose *contents* have not changed — the session switcher, the
task plan, the tool chips, the artifact links — compare a snapshot of the whole
record rather than a hand-picked field list, so a forgotten field cannot silently
freeze a row. And a panel that is **not visible** holds its rebuild and catches
up on its next `Show`, which is what stops the dashboard and the mission view
from paying for a run the user is watching in the workspace.

Two things are deliberately still whole rebuilds. A theme change discards every
cached shape, because these rows carry their colours inline and a comparison
would leave them in the old theme. And an agent switch rebuilds the tool strip,
because a different agent holds different tools.

**And the surfaces behind the one on screen.** The same rule reaches the pop-outs
and the tabs, because neither is destroyed when the user looks away. An agent
pop-out is *closed*, not deleted — it stays in the main window's cache so
reopening it is instant — so it went on rebuilding its tab strip on every
publication for the rest of the session; the main window's own sweep over every
pop-out now asks each window rather than calling its rebuild. The terminal
pop-out re-labelled every open tab on every chunk a stream reported, on top of
the 120 ms tick that already repaints the visible grid. And the Git and Library
tabs each clear a table and build its rows again, driven by a run editing files,
taking checkpoints and publishing artifacts while the user is watching the
workspace.

Settings is deliberately left alone: `settings_changed` is raised only by a
person picking a persona, a reasoning level or a model, so there is no stream to
hold back — and holding a rebuild until the tab is shown could land it on top of
an edit in progress.

**And the one animation.** A status dot breathes while its state runs (SWR-3704),
and nothing about that was visibility-aware: Qt keeps a looping animation running
for a hidden widget, writing its value every frame for as long as the window
lives. Counted on the demo workspace with the dashboard and mission tabs behind
the workspace, **21 of 21** looping animations were running with two live agents,
and **40 of 41** with twenty — most of them on tabs nobody could see. A dot now
stops on `hideEvent` and resumes on `showEvent`, keeping `pulsing` as the state's
intent rather than the animation's; the same count is 5 of 21 and 22 of 41.

The breath also stopped applying itself. It was a `QGraphicsOpacityEffect`, which
makes Qt render its widget into an offscreen pixmap on every paint — an
unreasonable price for a six-pixel dot, paid for the life of the run and
multiplied by every dot on screen. The animated value is now a number the dot
mixes into its own brush in `paintEvent`, and no status dot carries a graphics
effect at all.

Two smaller ones alongside. `StatusDot.set_state` repainted on every call, which
a reconciled panel makes on every refresh with the state unchanged; it compares
first now. And the terminal pop-out's header tick was started in its constructor
and never stopped, rewriting every tab label eight times a second for the life of
the window.

*What is not claimed here.* The count is measured; the wall-clock saving is not.
Offscreen has no compositor, so an opacity effect never actually composites and
the platform cannot answer what it cost — the number would have to come from a
run on the user's own machine.

Grouping is no longer one of them, as of 2026-08-23. A row that is not a
groupable tool call is a barrier — grouping emits it verbatim and starts a fresh
run after it — so re-projecting from the start of the run containing the
boundary is both correct and bounded by the tail. This mattered more than it
looks: grouping is **on** by default, so until then the shipped configuration
was the one off the incremental path, and the whole-list fallback it was
supposed to take was written as a condition that a mutated row never met. The
transcript went stale instead. Everything measured before that date was measured
with grouping off.

The agent filter still refuses rather than approximating, and the whole-list
refresh runs instead — correct, and no more expensive than it was before. It is
off by default. With it off, the bounded path holds from the run to the painted
row.

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
| Unit | Applying one update to a projected session touches work proportional to the change: asserted by counting the per-update work over sessions of 30, 300 and 3000 events and requiring the count not to grow with length | the desktop's session-update seam | `apps/rotaris/tests/test_live_update_cost.py` |
| Unit | A view consumer that raises, blocks or is absent leaves the run's own progress and terminal status untouched | the engine→view boundary | `apps/rotaris/tests/test_live_update_cost.py` |
| Unit | A run reporting an agent's progress leaves the panels drawing it standing: the agent tree keeps its row objects, the tool strip is re-dressed rather than rebuilt, the task plan is untouched — and a hidden panel does no work at all until it is shown | the store-signal→panel boundary | `apps/rotaris/tests/test_panel_reconcile.py` |
| Unit | The surfaces the user is not looking at cost nothing: a closed agent pop-out rebuilds no tabs and is current when it reopens, a streaming command does not re-label the terminal tabs per chunk, and a tab behind the one on screen rebuilds its tables once, when it is shown | pop-outs and background tabs | `apps/rotaris/tests/test_panel_reconcile.py` |
| Unit | The one looping animation runs only where it can be seen: a dot on the tab behind this one holds its breath and resumes when that tab is shown, the breath is painted rather than applied by a graphics effect, a dot told what it already says schedules no repaint, and a session list that did not move is not republished | the animation and the store's own guards | `apps/rotaris/tests/test_panel_reconcile.py` |
| Unit | The run's own transcript: which rows it reports as settled, what reaches the wire and when, and that a broken watcher leaves the record intact | the transcript recorder | `tests/unit/session/test_transcript_recorder.py` |
| Unit | Following a session in another process: only the addition is read, a settled row replaces the one it opened, a shortened store restarts the view, and a lost line does not misplace the tail | the foreign-session follower | `apps/rotaris/tests/test_session_follower.py` |
| Integration | A run emitting activity has it visible on the focused session within the latency budget on both a fresh and a long session; a session driven by a second process is observed with the same content; a session whose producer died is still inspectable | desktop host ↔ a live run, and ↔ a foreign run | `apps/rotaris/tests/test_live_view_latency.py`, `apps/rotaris/tests/test_session_follower.py::test_what_the_follower_shows_is_what_the_session_recorded` |
| User-flow E2E | A user watches a long-running task in the desktop: new transcript rows, todos and agent state appear promptly throughout, the transcript stays readable as it grows, and the session the user was watching resumes to exactly what was on screen | Public product boundary → user-observable result | `apps/rotaris/tests/test_long_session_liveness_e2e.py` |

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
