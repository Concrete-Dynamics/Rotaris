# Note — the desktop/engine boundary, as found on 2026-08-22

Observations from tracing how the Rotaris desktop talks to the engine, written
while scoping SWR-2453 and SWR-2454. No frontmatter: this is an analysis note,
not a requirement, and tooling ignores it.

It records what is true today and why, so that the implementation plan does not
have to re-derive it — and so the parts that looked like defects but are not
survive contact with a rewrite.

## The short version

The backend is already a library. There is no IPC, no server, no RPC, and — as
of today — no second process per session. The desktop imports `rotaris_core`
and calls into live engine objects directly. The filesystem round-trip that
prompted this note is not a transport chosen for the GUI/engine boundary. It is
the *persistence layer*, which the desktop reads because it never registered
itself as an observer of the run it is executing.

So the question is narrower than "why is the architecture like this": it is
"why does the one host that shares a process with the run learn about it the
same way a host in a different process would?"

## What is actually there

**One process, one lifecycle, three hosts.** `run_host.execute_run`
(`src/rotaris_core/run_host.py`) is the host-neutral run lifecycle: it returns a
value instead of exiting, prints nothing, and registers the event sink. Its own
docstring says it was extracted because "a second host could only reach it by
forking it, and a forked lifecycle is exactly the drift SWR-1830 forbids".

**A push channel already exists.** `src/rotaris_core/events/bus.py` defines
`EventSink = Callable[[RotarisEvent], None]` with per-session registration.
`publish` is forgiving by construction: "a broken consumer degrades the stream,
it does not fail the run."

**Durability and push are not alternatives here.** The sink registered by
`execute_run` is the event store's tee (SWR-2901): it appends to
`evidence/events.jsonl` *and* forwards to the host's sink, "so a run without a
stream still leaves a history and a run with one leaves the *same* history its
consumer saw." That design already answers the objection that a live channel
and a durable record would drift.

**The desktop opted out of all three.** From
`apps/rotaris/src/rotaris/services/run_bridge.py`: "Rotaris does not go through
`rotaris_core.run_host.execute_run`: its workers drive `cli.background._run_task`
directly, because the desktop owns the event loop, the observer slot and the
session identity in ways the headless lifecycle does not model."

Having opted out, it had no sink — so observation was rebuilt out of the
persistence layer:

| Stage | Where | Cadence |
| --- | --- | --- |
| engine writes state | `session/persister.py` → `session/persistence.py` | 0.5 s debounce (desktop-configured), fans out to several atomic files |
| desktop polls | `RunBridge._poll` | 750 ms `QTimer` |
| read + project | `_SessionRefreshWorker` on its own `QThread` | whole `SessionState`, every tick |
| apply | `WorkspaceStore` + ~25 signals | Qt thread |

## Three things this note wants to preserve

These read like accidents and are not. Each is the reason a plausible rewrite
would be worse than what is there.

1. **The view cannot drift from what a resume restores.** Because the UI reads
   the same record a restart reads, "what the user saw" and "what resuming
   gives you" are equal by construction rather than by test. Any push-based
   design has to re-establish that equality some other way; SWR-2454 makes it a
   criterion rather than leaving it to be rediscovered.

2. **Cross-process observation is real, today.** Not sessions started by the
   desktop — those are threads — but CLI and headless runs, second windows, and
   sessions whose producing process died. `session/liveness.py` carries a whole
   `OpenProcess`/`GetExitCodeProcess` branch for Windows precisely because
   another process's pid has to be probed without signalling it. Disk is the
   only medium those hosts share. **The poll must survive the rewrite**, demoted
   rather than deleted.

3. **No Qt object holds a reference into a live run.** Given this repo's history
   of teardown-ordering crashes, that isolation is doing real work. A push
   design has to keep the sink's only job "emit a queued signal" — the
   discipline `services/terminal_stream_bridge.py` already documents and
   follows, and the existence proof that the pattern works here.

## Costs, as measured by reading

- **Latency.** 0.5 s debounce + 750 ms poll ≈ 1.25 s worst case for data
  produced by a sibling thread.
- **Per-update work grows with session length.** Every tick re-reads, re-parses
  and re-projects the *whole* `SessionState`. Meanwhile `evidence/events.jsonl`
  is an append-only delta log that the live view does not read.
- **SWR-2452 fixed the second half of this problem only.** The transcript's
  layout is incremental and bounded. Its input is not. A long session can
  satisfy every SWR-2452 criterion and still update slowly.
- **Double write.** `save_snapshot` writes the split state files *and* a whole
  `snapshot.json` kept as a "compatibility copy for tooling/tests". Worth
  costing separately; it is not load-bearing for anything in this note.
- **A durability knob is being used for liveness.** The desktop constructs
  `SessionManager(..., persist_debounce_seconds=0.5)` to make its view feel
  live. SWR-2130 now says explicitly that this is not what the window is for.

## Duplication the fork has already cost

`RunLifecycleExtras` in `run_bridge.py` exists only to re-compose, by hand, what
`execute_run` composes: lifecycle-hook dispatch (SWR-2701) and the per-iteration
checkpoint writer (SWR-2436). Its docstring is candid that until it was written
the desktop — the primary interface — was the one host with neither. That is
SWR-1830's predicted drift, already realised once. It is the strongest single
argument for SWR-2453 and the reason the requirement is about *sameness* rather
than about performance.

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
rewrite". If sessions ever do become processes, the control half is ready and
the observation half is the one that would need the work.

## What SWR-2453 and SWR-2454 deliberately do not say

Both were written as properties, not designs, at the user's instruction: the
implementation plan is a separate exercise and should be free to choose. So
neither requirement names a transport, a delivery mechanism, a data format, an
entry point, a module boundary, or a migration order — and neither mandates
deleting the poll.

The obvious shape — register a Qt `EventSink`, move to `execute_run`, keep the
poll as a reconciler for foreign sessions — is *a* way to satisfy them, and the
one the existing pieces point at. It is not the only one, and this note is not
an endorsement. Recording it only so the plan starts from something concrete to
argue with.

## Open questions for the implementation plan

1. **The 250 ms budget in SWR-2454 is a proposal, not a measurement.** It comes
   from "clearly better than the current ~1.25 s and defensible as
   imperceptible", not from user research. Record a real baseline first and
   revise the number if it should be different.
2. **What does `execute_run` need in order to accept a host that owns its event
   loop, its worker thread and its session identity?** That is the actual
   engineering in SWR-2453, and the honest reason the fork happened. It is not
   an afternoon.
3. **`_run_task` has three consumers bound to its import path** — the desktop
   bridge, worktree integration, and the headless stream tests, which install
   their fake run by patching that module attribute (`run_host.py` says so
   explicitly). Moving it has a blast radius outside the module. Plan the seam
   before the move.
4. **Which surfaces beyond the transcript need the latency budget?** Todos,
   agent tree, KPIs, artifacts, verifier progress and pending approvals all ride
   the same refresh today. They do not obviously all need the same freshness,
   and treating them uniformly is what makes the update whole-state.
5. **Does the `snapshot.json` compatibility copy still have readers?** If it is
   only tests, retiring it is cheap and unrelated to the rest.
6. **Migration order.** SWR-2453 and SWR-2454 are separable and 2453 does not
   strictly require 2454. Doing 2453 first gets the sink for free and makes 2454
   mostly a matter of using it — but it is the larger and riskier of the two,
   so a plan that wants an early win may prefer the reverse. Decide explicitly.

## Provenance

Read on 2026-08-22 at master `27e025bc`: `run_host.py`, `events/bus.py`,
`runchannel/{__init__,control}.py`, `session/{persistence,persister,manager,liveness}.py`,
`apps/rotaris/src/rotaris/services/{run_bridge,run_coordinator,session_projection,terminal_stream_bridge}.py`,
`apps/rotaris/src/rotaris/models/store.py`. Line numbers deliberately omitted —
they will rot; the symbol names will not.
