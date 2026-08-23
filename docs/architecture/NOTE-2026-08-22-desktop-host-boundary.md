# Note — the desktop/engine boundary, as found on 2026-08-22

Observations from tracing how the Rotaris desktop talks to the engine, written
while scoping SWR-2453 and SWR-2454. No frontmatter: this is an analysis note,
not a requirement, and tooling ignores it.

It records what is true today and why, so that the implementation plan does not
have to re-derive it — and so the parts that looked like defects but are not
survive contact with a rewrite.

## The short version

The backend is already a library. There is no IPC, no server, no RPC, and — as
of today — no second process per session. The desktop imports `rotaris_core` and
calls into it directly. The filesystem round-trip that prompted this note is not
a transport chosen for the GUI/engine boundary. It is the *persistence layer*,
which the desktop reads because it never registered itself as a consumer of the
event stream its own run publishes.

So the question is narrower than "why is the architecture like this": it is "why
does the one host that shares a process with the run learn about it the same way
a host in a different process would?"

## Correcting a first reading

The first pass at this note asserted that the desktop does not go through
`run_host.execute_run` at all. **That is out of date, and the codebase itself is
what made it easy to believe.** Recorded here rather than quietly fixed, because
the trap is still armed for the next reader:

- `RunLifecycleExtras` in `run_bridge.py` opens with "Rotaris does not go through
  `rotaris_core.run_host.execute_run`: its workers drive `cli.background._run_task`
  directly." That sentence is stale.
- Roughly a thousand lines below it, `_RunWorker._execute` calls `execute_run`,
  and its own docstring says so: "The desktop **used to** drive
  `cli.background._run_task` one layer below it and keep its own copy of the
  surrounding lifecycle."
- The stale claim is repeated in the module docstrings of
  `apps/rotaris/tests/test_desktop_hook_wiring.py` and
  `test_desktop_event_store.py`.
- **And once in the engine.** A comment *inside `execute_run` itself*, above the
  event-store attach, scoped SWR-2901 to "the CLI and the Python SDK" and said
  "Rotaris' desktop run bridge drives `cli.background._run_task` directly and is
  not wired here". That is the worst of the four: it is in the function the
  desktop calls, and it tells a reader the store is not attached for a desktop
  run when it is.

Four statements of an obsolete fact, one statement of the current one, and the
obsolete ones are the ones you meet first. Worth fixing as part of the work.

## What is actually there

**One process, one lifecycle, several hosts.** `run_host.execute_run`
(`src/rotaris_core/run_host.py`) is the host-neutral run lifecycle: it returns a
value instead of exiting, prints nothing, and registers the event sink. Its
docstring says it was extracted because "a second host could only reach it by
forking it, and a forked lifecycle is exactly the drift SWR-1830 forbids".

**The desktop's main paths use it.** `_RunWorker._execute` (ordinary runs) and
`requirements_actions.py` (requirement-driven runs) both call `execute_run`. The
migration's own account of what the fork had cost is worth keeping: the second
copy had a gap the shared one did not, and "a run that died during intent
classification was stored without its `session.start`."

**One path still forks.** `services/worktree_integration.py` — the agent that
merges selected session worktrees — creates and persists its own session, calls
`install_run_lifecycle_extras` to hand-compose hooks and checkpoints, and then
drives `cli.background._run_task` directly. It therefore does not attach the
event store, publish session start/end, or derive its terminal result the way
every other run does. It is the last consumer of `RunLifecycleExtras`, and the
reason that class still exists.

**A push channel exists and the desktop declines it.** `events/bus.py` defines
`EventSink = Callable[[RotarisEvent], None]` with per-session registration, and
`publish` is forgiving by construction: "a broken consumer degrades the stream,
it does not fail the run." `execute_run` takes an `event_sink` parameter that
defaults to `None`, documented as: "the run still publishes and still persists
its events (SWR-2901), they simply reach no consumer." **Every desktop call site
leaves it defaulted.** The live channel is not missing; it is unsubscribed.

**Durability and push are not alternatives here.** The sink registered by
`execute_run` is the event store's tee (SWR-2901): it appends to
`evidence/events.jsonl` *and* forwards to the host's sink, "so a run without a
stream still leaves a history and a run with one leaves the *same* history its
consumer saw." That already answers the objection that a live channel and a
durable record would drift.

**So observation was built out of the persistence layer instead:**

| Stage | Where | Cadence |
| --- | --- | --- |
| engine writes state | `session/persister.py` → `session/persistence.py` | 0.5 s debounce (desktop-configured), fans out to several atomic files |
| desktop polls | `RunBridge._poll` | 750 ms `QTimer` |
| read + project | `_SessionRefreshWorker` on its own `QThread` | whole `SessionState`, every tick |
| apply | `WorkspaceStore` + ~25 signals | Qt thread |

Nothing under `apps/rotaris/src/rotaris/` references the event store or the
event bus at all.

## Three things this note wants to preserve

These read like accidents and are not. Each is the reason a plausible rewrite
would be worse than what is there.

1. **The view cannot drift from what a resume restores.** Because the UI reads
   the same record a restart reads, "what the user saw" and "what resuming gives
   you" are equal by construction rather than by test. Any push-based design has
   to re-establish that equality some other way; SWR-2454 makes it a criterion
   rather than leaving it to be rediscovered.

2. **Cross-process observation is real, today.** Not sessions started by the
   desktop — those are threads — but CLI and headless runs, second windows, and
   sessions whose producing process died. `session/liveness.py` carries a whole
   `OpenProcess`/`GetExitCodeProcess` branch for Windows precisely because
   another process's pid has to be probed without signalling it. Disk is the only
   medium those hosts share. **The poll must survive the rewrite**, demoted
   rather than deleted.

3. **No Qt object holds a reference into a live run.** Given this repo's history
   of teardown-ordering crashes, that isolation is doing real work. A push design
   has to keep the sink's only job "emit a queued signal" — the discipline
   `services/terminal_stream_bridge.py` already documents and follows, and the
   existence proof that the pattern works here.

## Costs, as measured by reading

- **Latency.** 0.5 s debounce + 750 ms poll ≈ 1.25 s worst case for data produced
  by a sibling thread.
- **Per-update work grows with session length.** Every tick re-reads, re-parses
  and re-projects the *whole* `SessionState`. Meanwhile `evidence/events.jsonl`
  is an append-only delta log the live view does not read.
- **SWR-2452 fixed the second half of this problem only.** The transcript's
  layout is incremental and bounded. Its input is not. A long session can satisfy
  every SWR-2452 criterion and still update slowly.
- **Double write.** `save_snapshot` writes the split state files *and* a whole
  `snapshot.json` kept as a "compatibility copy for tooling/tests". Worth costing
  separately; it is not load-bearing for anything in this note.
- **A durability knob is being used for liveness.** The desktop constructs
  `SessionManager(..., persist_debounce_seconds=0.5)` — the comment above the
  call says outright that it is shortened because the desktop polls the snapshot
  to drive a live view. SWR-2130 now says explicitly that this is not what the
  window is for.

## A traceability observation, filed rather than fixed

`src/rotaris_core/runchannel/` — the narrowed control surface, `RunControl` /
`RunSurface` / `InProcessRunControl` — carries `@traces(SWR.SWR_2426)`. SWR-2426
is *Per-agent runtime tool binding isolation*, whose text is entirely about
`Tool.params`, binding keys and the process-global SDK registry. It does not
mention a control surface. The id appears to have been stretched to cover the
runchannel during the change that landed both.

This is spec drift of the quieter kind: the trace resolves, the build is green,
and the requirement does not describe the code. Not fixed *in the requirements
change*, because re-homing traces is implementation work. **Fixed in the
implementation**: the four `@traces` sites and the seven `@verifies` sites in
`tests/unit/test_run_control.py` now name SWR-2453 — the runchannel *is* the
host/run boundary that requirement owns. SWR-2426 keeps its real traces in
`agents/tool_registration.py` and `agents/factory.py`, which is what its text
actually describes.

Worth noting the runchannel is otherwise the healthiest thing at this boundary:
flat, scalar, no live objects in or out, and explicitly built so that "a second
implementation — a run in its own process — is then a swap rather than a
rewrite". If sessions ever do become processes, the control half is ready and the
observation half is the one that would need the work.

## What SWR-2453 and SWR-2454 deliberately do not say

Both were written as properties, not designs, at the user's instruction: the
implementation plan is a separate exercise and should be free to choose. So
neither requirement names a transport, a delivery mechanism, a data format, an
entry point, a module boundary, or a migration order — and neither mandates
deleting the poll.

The obvious shape — pass a Qt `EventSink` to the `execute_run` calls that already
exist, move the integration run onto the same lifecycle, keep the poll as a
reconciler for foreign sessions — is *a* way to satisfy them, and the one the
existing pieces point at. It is not the only one, and this note is not an
endorsement. Recorded only so the plan starts from something concrete to argue
with.

## The design that was chosen, and the two readings it corrected

Written after a second pass over the same code, on the same day. Two things the
first pass got wrong are what shaped the answer.

**The push channel is not the event bus. It is `_SessionObserver`.** The bus
(`events/bus.py`) is a module-level dict with no IPC, and the wire schema's 22
event types carry no assistant text or reasoning — so a live view cannot be
folded from the stream even in this process. But `_SessionObserver`
(`services/run_bridge.py`) *already* receives every delta the run produces:
streamed text, thinking bursts, tool rows, verifier rows, todos. It holds live
references into `state.transcript_events`, mutates rows in place, and calls
`persister.request_save` at each change. It deliberately never touches Qt, which
is why its deltas go to disk and are read back. **Nothing was missing; nothing
subscribed.** So the design connects that observer to Qt rather than inventing a
channel — and passing an `EventSink` to `execute_run`, the shape the section
above points at, would not have carried the transcript at all.

**The cost is one surface, not all of them.** Per update there are four O(N)
stages, N = accumulated transcript rows: `read_session_snapshot` parses
`resume.json` + `ui_transcript.json` whole; `_project_transcript` walks every
row; `WorkspaceStore.set_transcript` compares the whole list;
`TranscriptListModel.sync` prefix-scans it. Everything else the refresh derives —
agents, todos, KPIs, verifier, approvals — is bounded by *concurrency*, not by
session length, and was never the problem.

The design, then:

| | |
| --- | --- |
| Local session | observer → deep-copied delta → queued Qt signal → incremental projector → `TranscriptListModel.apply_delta`. O(change). |
| Foreign / finished session | whole-state read, slower cadence. O(N) per read, deferred (see § Scope in SWR-2454). |
| Bootstrap, focus change, run end | one whole-state read, always. This is also where `session_live` flipping rewrites rows retroactively. |
| The poll | survives, demoted: it serves foreign sessions *and* is the correctness backstop — a delta the push path misses is repaired on the next reconcile, so a missed emit costs latency, never content. |

One derivation is preserved by construction rather than by test: the incremental
path runs the *same* `_project_transcript` logic, as a stateful projector, over
the *same* rows the persister writes. `_project_transcript`'s cross-row carry is
only three values — `last_thinking` per agent, `emitted_ids` for diff dedup, and
the diff index — which is what makes an incremental form possible at all.

**And SWR-2453 turned out smaller than its own note.** `prepare_integration`
needs the session **id**, not the session — the locks it takes are the *source*
sessions'. So the host mints an id, prepares the worktree, and passes
`new_session_id` + `worktree_path`; `_bind_worktree` already handles the latter
through `attach_existing`. No worktree seam is needed. What *is* needed is two
scalar fields on `RunRequest`: `run_type` and `internal`.

Recorded because a plausible alternative is a trap: passing the pre-created
session as `RunRequest.session_id` deadlocks. `create_session` acquires the lock,
and `persistence.acquire_lock` is `O_CREAT|O_EXCL` behind a stale-pid reaper, so
a lock held by a *live* pid — our own — returns `False`.

### What the implementation landed, and what it left standing

Both requirements are satisfied for the case they were written about, and three
things are left standing on purpose. Written down here because the second is
easy to mistake for an oversight.

Landed: every desktop run path goes through `execute_run`, the integration run
included; the transcript reaches the view through `_SessionObserver`'s delta
sink rather than through a snapshot read, at a cost bounded by the change from
the run's own thread all the way to `TranscriptListModel.apply_delta`. The poll
is now that surface's *reconciler* — the backstop for a delta the projector
refuses — rather than its source. `apps/rotaris/tests/test_live_view_latency.py`
pins that by stopping the timer: with no poll running, the rows still arrive.

Left standing:

1. **A foreign session is still whole-state per read** — the SWR-1829
   prerequisite above.
2. **Two stages inside the view still read the whole list.** An agent filter
   (SWR-2099) and tool grouping (SWR-2432) each rewrite which rows exist, so a
   boundary in source rows is not a boundary in displayed rows. Both are
   *refused* by `TranscriptScrollArea.apply_events_delta` rather than
   approximated, and the whole-list refresh runs instead — correct, and merely
   as expensive as it always was. With neither on, which is the default, the
   cheap path holds end to end.

### The second channel, and the debounce it freed (SWR-2130)

Written a day later, and worth separating from the above because the first pass
left it as a limitation and it turned out to be a small change.

The transcript was the only surface whose cost grew with the session, so it was
the only one that needed a *delta*. Everything else the view shows — child
states, todos, pending approvals, verifier progress, token counts — is bounded
by how much is happening at once, so it can travel whole. `_SessionObserver`
now publishes both: `_touch` sends the transcript delta and the facts, `_save`
sends the facts alone.

The facts payload is the session record with its unbounded lists emptied, rather
than a hand-listed set of fields. That is deliberate: `build_session_projection`
reads a great many fields, and a list here would be a second statement of what
it needs, wrong the first time someone adds a field to either. The consumer runs
that same projection over the payload, so a live view and a reloaded one cannot
disagree about what a snapshot means.

With that, the desktop stopped constructing its `SessionManager` with a 0.5 s
persistence debounce. That override existed only because the view read the
snapshot; the window is now chosen on durability grounds alone, which is all
SWR-2130 ever asked.

**One thing this pass found rather than built.** The approval and
question-stepper rows are *not* transcript history — they are derived from what
is pending right now, and they always sit after every recorded row. The delta
path had bypassed them, so during a live run the approval row a user has to
click was silently absent. `transcript_trailer` is now one function both paths
call, and `ConfigService` re-appends it on every write of the transcript. The
regression is covered by
`apps/rotaris/tests/test_approval_flow.py::test_a_live_run_still_shows_the_approval_row_it_is_blocked_on`.

## Open questions for the implementation plan

1. **The 250 ms budget in SWR-2454 is a proposal, not a measurement.** It comes
   from "clearly better than the current ~1.25 s and defensible as
   imperceptible", not from user research. Record a real baseline first and
   revise the number if it should be different.
2. **What does the integration run actually need that kept it off `execute_run`?**
   It creates its session before the run, sets `run_type`, and prepares a merged
   worktree via `GitWorktreeService.prepare_integration` — so the question is
   which of those the lifecycle can host and which need a seam. This is the whole
   of SWR-2453's remaining work and it is smaller than the original migration was.
3. ~~**`_run_task` is still a patch point for three test modules.**~~
   **Answered, and the premise was wrong.** `execute_run` imports `_run_task`
   *inside its own function body* — a deliberate late import — so
   `monkeypatch.setattr("rotaris_core.cli.background._run_task", …)` intercepts
   runs that go through the shared lifecycle just as well as runs that drive the
   runtime directly. That is why the desktop tests pass today despite the
   migration having already happened. Moving the integration run onto
   `execute_run` retires no patch point: `execute_run` is itself a production
   consumer of `_run_task`.

   It is also not three modules. Eight files patch or call it —
   `test_worktree_integration_e2e.py`, `test_sandbox_toggle.py`,
   `test_run_wiring_e2e.py`, `test_parallel_runs_e2e.py`,
   `test_desktop_hook_wiring.py`, `test_desktop_event_store.py`,
   `tests/integration/test_stale_session_repair.py`, and (as direct callers)
   `tests/capability/harness.py` and `test_resume_intent_carry_over.py`.

   The one real consequence: `test_worktree_integration_e2e.py` asserts on the
   `extra_observers` kwarg the *host* passes today. After the move those
   observers come from the lifecycle, so that assertion belongs there instead.
4. **Which surfaces beyond the transcript need the latency budget?** Todos, agent
   tree, KPIs, artifacts, verifier progress and pending approvals all ride the
   same refresh today. They do not obviously all need the same freshness, and
   treating them uniformly is what makes the update whole-state.
5. ~~**Does the `snapshot.json` compatibility copy still have readers?**~~
   **Answered: the *write* has none, the *read* is a requirement.** It is
   written at `session/persistence.py:42-44` and read back at `:96`. Outside
   that load path nothing in production reads it; four tests do
   (`test_session_manager.py` asserts it exists, and
   `test_session_diagnostics.py`, `test_search_tools.py`,
   `test_session_recovery.py` each write one as a fixture).

   But SWR-1550 is approved and requires legacy `snapshot.json` sessions to
   remain **loadable**, which governs the read, not the write. So: stop writing
   it, keep reading it. That halves the persistence fan-out and keeps SWR-1550.
   It also needs the 1500 epic's line saying the copy is written "for one
   release" updated — that release has passed.

   Filed as its own change rather than folded into SWR-2453/SWR-2454: it touches
   session persistence, which nothing else in that work does.

   **Done on 2026-08-23.** The write is gone, the read stays, SWR-1550 says in
   its own words that it governs the load path, and the epic's "for one release"
   line is dated. `test_session_manager.py` now asserts the copy is *not* there,
   and a legacy session that gets resumed and saved is pinned to read back from
   `state/` while its old copy is left untouched on disk.
6. **Migration order.** SWR-2453 and SWR-2454 are separable, and now that the
   main paths already call `execute_run`, SWR-2454 no longer waits on SWR-2453 —
   the `event_sink` parameter is there to be passed on the ordinary run path
   today. SWR-2454 is probably the earlier win; decide explicitly rather than by
   requirement number.
7. **Fix the stale docstrings** (see "Correcting a first reading"). Cheap, and it
   stops the next reader spending an hour on a fact that changed.

## Provenance

Read on 2026-08-22 at master `27e025bc`: `run_host.py`, `events/bus.py`,
`runchannel/{__init__,control}.py`, `session/{persistence,persister,manager,liveness}.py`,
`cli/background.py`,
`apps/rotaris/src/rotaris/services/{run_bridge,run_coordinator,session_projection,terminal_stream_bridge,worktree_integration,requirements_actions}.py`,
`apps/rotaris/src/rotaris/models/store.py`. Line numbers deliberately omitted —
they will rot; the symbol names will not.
