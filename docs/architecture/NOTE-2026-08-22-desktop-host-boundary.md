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

Three statements of an obsolete fact, one statement of the current one, and the
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
and the requirement does not describe the code. Not fixed here, because
re-homing traces is implementation work and this change is scoped to
requirements. The natural home is SWR-2453 — the runchannel *is* the host/run
boundary that requirement owns — and the implementation plan should re-point it
rather than widen SWR-2426 to fit.

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
3. **`_run_task` is still a patch point for three test modules** — the worktree
   integration tests, the desktop hook-wiring tests and the desktop event-store
   tests all install their fake run by patching that module attribute. Retiring
   the last production consumer means giving those tests a different seam. Plan
   it before the move.
4. **Which surfaces beyond the transcript need the latency budget?** Todos, agent
   tree, KPIs, artifacts, verifier progress and pending approvals all ride the
   same refresh today. They do not obviously all need the same freshness, and
   treating them uniformly is what makes the update whole-state.
5. **Does the `snapshot.json` compatibility copy still have readers?** If it is
   only tests, retiring it is cheap and unrelated to the rest.
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
