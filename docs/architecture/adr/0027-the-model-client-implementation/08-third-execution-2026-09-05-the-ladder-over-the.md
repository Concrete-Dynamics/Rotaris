# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Third execution — 2026-09-05, the ladder over the port (Part Q: REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..093/263)

Part 8 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Third execution — 2026-09-05, the ladder over the port (Part Q: REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..093/263)

*Recorded under GD-10. Three defects found on first execution (the manager numbers them); the error mapping extended.*

**The error mapping, extended.** This record said an error "preserves the HTTP status and the provider's own message"; it
did for the SDK's `APICallError` and for nothing else — a timeout, a `TypeError` from `fetch`, an unknown shape reached the
engine as a headline alone, so REQ-NOTIFY-091/094's substring matching had nothing to read. `providerMessage` now travels
for every shape (cut to 500). The `retry-after` header travels in **both** forms: integer seconds parsed in the adapter
(`retryAfterMs`, as before) and the raw value (`retryAfter`) for the engine, which reads an HTTP date against **its** clock
and the `<n>s` / `<n>m` suffixes — the adapter has no clock port and computes no instant. `try again in N <unit>` is read from
the message in the engine. `rate-limit-reset` headers are not read; nothing in the pinned SDK exposes them by name and no
provider answered one in this record's executions. `TurnSink.started()` is new: the backend reports the FIRST part of any
kind, so REQ-ORCH-090's "any model event" counts a tool-call-only step and an error the provider answered with.

**The ladder** (`packages/engine/src/run/resilience.ts`, `ladder.ts`, `waits.ts`; ADR-0010's and ADR-0012's notes carry the
control reading and the child routes): classification in the order quota → rate limit → context window → validation →
transient → fatal, table-tested over 32 recorded shapes; the wait computation (provider retry-after, floor 1 s, else
60·2^(n−1) s capped at 300 s — measured 60 s then 120 s on consecutive attempts); the same-tier candidate rule over the run
host's catalogue (`configuration.ts` `catalogueOf`: provider identity = `auth_provider` else the family, roles from the three
configured slots plus each authenticated provider's own picks in the discovery snapshot); the session-wide memory persisted
as timeline entries (the wire-event catalogue is closed at 23, REQ-EVENTS-041 — the plan's `model.exhausted` and
`model.override` **events** could not be added; `model_exhausted` / `model_override` **timeline entries** carry the same facts
and are rehydrated on resume). The suspended wait resolves by the clock port's timer, by `cancel`, or by `setModel`.

**Found — the transient retry sat at the wrong level (defect, pre-existing).** `turnWithRetry` re-ran the whole *turn* on a
transient failure. A turn is many steps; a tool call executed in step 1 would have been re-requested from scratch when step
2 failed transiently, under fresh call ids REQ-ORCH-141's replay guard cannot recognise. The reason the first execution
gave — "a transient failure is retried up to `transientRetries` times after min(2, n) s" — was true of the count and the
delay and silent about the unit of retry. Every retry now happens at the **step** (`resilientStep`): the model call is
re-issued over the conversation as it stands. Kept as the falsified reason beside `turnWithRetry`, which now delegates.

**Found — `runtime.child_timeout` never reached the run (defect, pre-existing).** Loaded since Part C, typed on the engine
since ADR-0012's first execution, passed by no root: every child ran under 1,200 s whatever the file said. Wired
(`RuntimePosture.childTimeoutMs`); the proof's child timed out at the configured 8 s. ADR-0012's note carries it.

**Found — the run header's model list was empty in the built app (defect, pre-existing).** Main's `config.read` answered
`workspace.none` when the renderer asked as it mounted, before the argv workspace had opened; `repository.read` awaited the
workspace and `config.read` did not. REQ-MONITOR-144's selector had offered nothing since Part J, unnoticed because no proof
ever chose a model from it; the wait header's "Change model" was the first surface to need it. One awaited promise.

**Found — a continuation on a loaded session forwarded no events (defect, pre-existing).** `Sessions.resume` opened the
writer with a commit hand-off to the projection owner only; `start` hands commits to the owner **and** the run. A run
launched on a resumed session therefore never fed its bus: `run.result` never reached main, no terminal notice, and any
blocking consumer would have waited forever. Every earlier resume proof read the store, not the notice, and the store was
right. Caught because the proof's relaunch waited for the result and hit its bound; the run is now fed as `start` feeds it,
and the engine test asserts `onRunResult` fires for a resumed session's continuation.

**Measured** (`pnpm resilience-proof`, 9 launches, scripted dialect; `packages/engine/src/run/ladder.test.ts`, FakeClock):
a 429 with `retry-after: 2` waited 2 s — the header read "Resumes automatically in 0:02" at 1.7 s, auto-resumed, the run
completed, `model_wait {wait_seconds: 2, auto_resume: true}`, no `transient_llm_error`; a 429 with no header waited 60 s
locally (header "1:00", the wording naming no interval), `cancel` from the header ended the run `user_cancelled` / `paused`
with the condition as its error and main raised REQ-NOTIFY-063's notice with "Open Models settings"; quota with a
snapshot-recorded candidate moved `scripted/alpha → scripted-b/beta` transparently (`model_fallback` — *`quota_fallback_model` since 2026-10-01, A29* — `model_exhausted`,
the warning issue, no wait); quota with no candidate waited indefinitely ("Resumes only when you decide", provider marked
exhausted), `setModel` from the header rebuilt and completed on `beta`, `model_override` persisted, and the relaunched
session's continuation called `scripted-b/beta` and nothing else; an unresponsive model fell back after exactly 30 s
(`unresponsive_model_fallback` — *`llm_unresponsive` since 2026-10-01, A29*), and with no fallback the call was still open at 36 s; a child hung under `child_timeout: 8`
was retried once on the role's fallback and succeeded, and failed with `Child timed out after 8s` without one; a 503 took one
transient retry after 1 s and a 401 failed at once with no retry and the ordinary failure notice.

**Not measured here, said so.** What a real 429 from OpenRouter looks like — its status, body, `retry-after` form and
whether it carries a `rate-limit-reset` — is not measured: no key on the build machine and the boundary forbids borrowing
one. `pnpm slice-proof` can carry the scenario for the owner (a burst against a free-tier model until the provider limits
it) and the mapping's raw-header path is the one to watch. REQ-ORCH-093's context-window condensation is classified and
left failing as before; REQ-NOTIFY-062's hosted-credit branch has no hosted provider; the stall watchdog (REQ-ORCH-089) is
not built; the Copilot/codex native loop (REQ-ORCH-146) is not built.

**Re-run on Linux as root, 2026-09-28 (R-062): the proof's override launch driven, every launch bounded.** Scenario
4 had stopped measuring. Its seam addressed `.wait-header select`, but the header draws the design system's
`SearchableSelect`, so no model was chosen. The run kept REQ-NOTIFY-092's indefinite wait, as it should, and the
launch outlived its 180 s `spawnSync` timeout. The first launch is now driven: the chooser is operated by two real
clicks, and the run is waited for in the store. Every launch is bounded: the ten the capture seams drive go through
`lib/bounded-launch.mjs`'s `spawnBounded`, and the driven one ends through the driver's `stopApp` (the closing picture
and the quit each within a bound, then the same `endOverrun`). Either way an overrun is ended by SIGTERM, a grace, then
SIGKILL and reported with its log tail. Every scenario now runs to its end. **Found nothing new about the ladder:** all ten scenario blocks passed, and the numbers match the measurements
above (the indefinite wait's header, `model_override` → `beta`, the resumed session on `scripted-b/beta`, the 30 s
unresponsive fallback, the 8 s child timeout with and without a fallback, the 503's one retry, the 401's none).
**Found a product loop in the quit path while tracing the overrun.** The signal was not ignored: `spawnSync` had
closed the pipes, and the quit's first log line met EPIPE, which main's uncaught-exception handler logs to the same
closed stream without end
([note](../../../defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md), recorded and not repaired
then; repaired 2026-09-29 under R-067).
The repair is in [the proof's note](../../../defects/fixed/resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md).
**Could not show:** the ladder against a real provider's 429 (unchanged from above); anything on Windows (IC-3 — *corrected 2026-10-14: a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).
