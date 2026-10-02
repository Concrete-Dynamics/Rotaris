# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-02)
- **Depends on:** ADR-0026, ADR-0031

## Context

An SDK can only ever serve one step. Domain 04 carries 134 live requirements and the ones an SDK could
plausibly help with are the request itself. Discovery (`REQ-PROVIDER-069` to `REQ-PROVIDER-083`), the
credential store (`REQ-PROVIDER-014` to `REQ-PROVIDER-019`), the sign-in flows (`REQ-PROVIDER-023` to
`REQ-PROVIDER-050`), the snapshot (`REQ-PROVIDER-084` to `REQ-PROVIDER-087`), slot assignment
(`REQ-PROVIDER-081`), priming (`REQ-PROVIDER-066` to `REQ-PROVIDER-068`) and usage and credit
(`REQ-PROVIDER-119` to `REQ-PROVIDER-130`) are outside any model SDK's scope and must be written
regardless.

Two dialects against one base URL, chosen per model, are **mandatory** (`REQ-PROVIDER-089`,
`REQ-PROVIDER-092`): a Copilot model discovered as responses-only is invocable, its requests go to the
responses endpoint, and it reports both per-token costs as zero.

Per-request headers vary by provider and by call: Copilot's editor-identity header set is required or
the endpoint returns nothing usable (`REQ-PROVIDER-070`); codex sends `client_version`, `originator`,
an `OpenAI-Beta` header and a conditional account-id header (`REQ-PROVIDER-076`); and the bearer must
be resolved and possibly renewed **at dispatch** (`REQ-PROVIDER-092`).

Usage must be surfaced per call including the provider's **real** input-token count, because
`REQ-MONITOR-081`'s compression trigger prefers it over an estimate and records which source it used.
Money must never be computed in binary floating point (`REQ-PROVIDER-121`), so cost must not be
delegated to a library that does it in a floating-point number. `REQ-PROVIDER-071`'s classification is
**total** and status-bearing, so whatever performs an HTTP call must expose the status code and the raw
body, the latter cut to its first 500 characters before being shown or logged.

**What was checked.** Context7, the AI SDK documentation at `ai-sdk.dev`, and the npm registry,
2026-08-31. The packages are `ai` (7.0.x), `@ai-sdk/openai` (4.0.x) and `@ai-sdk/openai-compatible`
(3.0.x), all Apache-2.0. Four facts, all confirmed against the current v7 line:
`createOpenAICompatible` accepts `baseURL`, `apiKey`, `headers`, `queryParams`, a custom `fetch`,
`includeUsage`, `transformRequestBody` and `metadataExtractor`; `createOpenAI` accepts `baseURL`,
`headers` and a custom `fetch`, and the OpenAI package exposes `openai.chat()` and `openai.responses()`
as separate constructors — its own documentation states that a custom base URL serving only the chat
dialect should be reached through `openai.chat()` or through the compatible provider, which is the
configuration the spike below exercises; and `streamText`'s `usage` carries `inputTokens`,
`outputTokens` and `totalTokens` at the top level, with `raw` carrying the provider's own record.

**One of those four moved, and it is worth recording where.** The v7 line, published 2026-06-25,
**removed** the top-level `cachedInputTokens` and `reasoningTokens` from the usage type; they are now
`inputTokenDetails.cacheReadTokens` and `outputTokenDetails.reasoningTokens`. The count
`REQ-MONITOR-081` actually depends on — the provider's real input-token count — is still top level and
still present. Three major versions in thirteen months (v5 2025-07, v6 2025-12, v7 2026-06) is the
evidence for consequence 1 below, not a hypothetical.

## Alternatives considered

**A — The AI SDK behind `ModelClient`.**

*For:* server-sent-event parsing, tool-call fragment assembly (arguments arriving split across deltas),
reasoning parts, usage extraction, abort and retry are genuinely fiddly and genuinely done. The custom
`fetch` hook is the natural seam for injecting the resolved credential, the per-provider headers, the
per-model concurrency permit and the redaction of anything logged — so provider-specific behaviour
lands in one function rather than spreading through a request builder. A responses-mode constructor
plus a `baseURL` covers the two-dialect requirement for responses-only models.

*Against:* the provider-package type surface has moved across major versions, so upgrades will cost
adapter work. The compatible-provider factory is chat-dialect only; responses mode against a
non-vendor base URL goes through the vendor package, a supported but less-travelled configuration that
should be spiked before being relied on. And the SDK contributes nothing to the rest of the domain, so
it does not reduce the slice's overall size much.

**B — Direct HTTP for everything, no model SDK.**

*For:* one fewer dependency on a fast-moving package; complete control over headers, body shape and
error classification, which `REQ-PROVIDER-071`, `REQ-PROVIDER-073` and `REQ-PROVIDER-074` demand in
unusual detail anyway; nothing to fight when a provider's payload changes, which `REQ-PROVIDER-151`
explicitly anticipates. The discovery path is hand-written regardless, so the HTTP plumbing exists
either way.

*Against:* we would re-implement streaming tool-call assembly for two dialects, and do it worse at
first. That code has **no requirement of its own to guide it** — it is pure protocol detail — so bugs in
it surface as mysterious agent misbehaviour rather than as a failed conformance test. It is the least
interesting code in the slice and the easiest to get subtly wrong.

## Decision

**Alternative A, scoped tightly, with the AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`;
Apache-2.0) as the SDK.** The selection criterion is a single seam and a single dialect pair: a provider
factory that takes a base URL, arbitrary per-request headers and a **custom `fetch`**, and a package
that exposes the two dialects `REQ-PROVIDER-089` and `REQ-PROVIDER-092` require as separate model
constructors against that base URL. It is chosen for those two properties and nothing else; the rest of
the domain does not touch it.

- `ModelClient` is implemented by an adapter that constructs an SDK language model per
  `(base URL, dialect, headers)` and calls the SDK's streaming text function. **No SDK type crosses the
  port** — including the usage type, whose shape moved between v6 and v7 and would otherwise have taken
  the port with it.
- Discovery, usage, credit, OIDC, device code, PKCE and token exchange use plain HTTP. They are not
  model calls and gain nothing from the SDK.
- **Cost is never computed by the SDK.** Usage tokens come out of it; money is computed by the decimal
  layer of ADR-0031.
- The retry count is set from the per-model value, default 5 (`REQ-PROVIDER-089`), not the SDK's own
  default.
- All provider-specific decoration — credential resolution and renewal, the concurrency permit, header
  injection, and redaction of anything reaching a log — lives in the **custom `fetch`** handed to the
  provider factory, so there is exactly one place a request is decorated.

## Consequences accepted

1. A dependency whose major versions rename core types, at a demonstrated cadence of roughly two
   majors a year. Mitigated by the port, which is mandated anyway; the blast radius is one adapter file,
   and **the version is pinned** so an upgrade is a deliberate act with the usage-field mapping
   re-checked each time.
2. **A spike is required before the gate:** responses-dialect requests against a non-vendor base URL
   with custom headers. If it does not work, the fallback is a hand-written responses-dialect
   implementation behind the same port — a contained loss, not a redesign.
3. We accept that the SDK gives little leverage overall. It is chosen for one step, on the merits of
   that step, not as a framework.
4. The custom `fetch` becomes a security-relevant chokepoint: it carries the bearer and it is where
   `REQ-PROVIDER-131`'s redaction applies before anything is logged.

## Revisit if

The responses-dialect spike fails; or a provider's request needs a body the SDK cannot express even
through its request-body transform; or the SDK's usage record stops carrying a real provider
input-token count, which `REQ-MONITOR-081` depends on.

## First execution — 2026-09-03, the adapter, and spike 6 in its structural half

*Recorded under GD-10. The spike report is `../spikes/responses-dialect.md`.*

**Built and run:** `packages/model/src/ai-sdk-client.ts` over `ai` 7.0.92, `@ai-sdk/openai` 4.0.58 and
`@ai-sdk/openai-compatible` 3.0.43, **pinned exactly**; the v7 usage shape re-checked against the current
documentation at the pin (top-level `inputTokens`/`outputTokens` are there, as this record said). `chat`
through the compatible provider and `responses` through the vendor package's responses constructor, both
against one base URL; **one decorated `fetch`** resolves the credential per request inside the request
path, adds the per-provider headers, and hands a log nothing but redacted headers (`REQ-PROVIDER-131`);
the retry count is the request's; an error keeps status and body cut to 500 characters. No SDK type
crosses the port and no money is computed.

**Spike 6, structural half, held on every assertion** (fake `fetch`): both dialects reach the right path
under one arbitrary base URL; the bearer and the headers arrive; the log never sees the bearer; usage,
finish and deltas map across; 401 keeps its body; 503 is transient and 400 is not; an abort ends the
stream as aborted. **The live half is owed**: no endpoint and no key exist on the build machine and the
boundary forbids borrowing another product's. The harness is written and gated on an endpoint the owner
supplies. Until it runs, consequence 2's fallback stays priced and not taken.

**Found: the instrument, not the adapter.** The first abort test hung for its full timeout because the
fake `fetch` ignored the request's abort signal. The adapter was right. Recorded in the spike report as
the third time a measuring instrument has held the defect.

## Second execution — 2026-09-05, the first real model call (Part K)

*The fifteenth defect of ADR-0058 consequence 17's pattern, and spike 6's live half taken at last.*

**Found before any request left the machine:** the adapter placed the run's system prompt inside `messages` as a
`system` message, and the pinned SDK (ai 7.0.92) refuses that shape in its prompt validation — *"System messages
are not allowed in the prompt or messages fields. Use the instructions option instead."* — so the first real run
failed in its pre-flight classification and again in its first turn without a byte reaching OpenRouter. Spike 6's
structural half had held on every assertion because no fake request carried a system message; the instrument
measured what it was pointed at. The system text now travels as `instructions` (every system message joined by a
blank line) and the structural test carries one and reads it back from the request body. The v7 migration note
this record wrote for the usage field applies to the prompt shape as well.

**Spike 6's live half, taken the same day:** four of four against OpenRouter — both dialects stream, first
delta in under a second, the provider's usage arrives, a bad key keeps status and body, an abort ends as
`aborted` (`../spikes/responses-dialect.md`). **Consequence 2's fallback is withdrawn from the price list.**

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
([note](../../defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md), recorded and not repaired
then; repaired 2026-09-29 under R-067).
The repair is in [the proof's note](../../defects/fixed/resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md).
**Could not show:** the ladder against a real provider's 429 (unchanged from above); anything on Windows (IC-3).

## Fourth execution — 2026-09-12, the timeout a real run found (REQ-CONFIG-115, REQ-ORCH-092)

*Found by a 22-minute run against claude-haiku-4.5 on OpenRouter, not by a test. Two defects, one shape.*

**Found — the bound capped the answer, not the wait (defect, pre-existing).** Eleven children ran; four died with
`errors:[{"message":"the call was aborted","type":"model"}]` and an empty `final_response`. Measured from the session
store, the gap between each child's last tool call and its death was 125.2 s, 125.5 s and 125.6 s — REQ-CONFIG-115's
`model_timeout` of 120 s plus report assembly. The adapter armed one `AbortSignal.timeout(req.timeoutMs)` for the whole
call, so **no generation longer than `model_timeout` could ever complete**, and the four children were writing long
documents. The reason the first execution gave — that the request carries "a per-model timeout (REQ-CONFIG-115/086)" —
was true of the figure and silent about what it measures; the requirement calls it the "global model **HTTP** timeout",
which bounds a wait, not an answer. Kept beside its replacement: `timeoutMs` is now an **idle** bound, re-armed on every
part received from `result.fullStream` — text, reasoning, tool-call arguments alike — from ADR-0006's `Timers` port,
which `AiSdkClientOptions` now requires and the run host supplies from its own clocks (`rotaris/no-bare-timers` leaves
no other way, and that is the rule earning its keep). A stalled connection still dies at the bound. Total duration is
bounded where it belongs: REQ-ORCH-090's first-part watchdog and REQ-ORCH-088's agent hard timeout.

**Found — the stream-part path hardcoded the class (defect, pre-existing).** `case 'abort'` yielded
`fromError(null, true)` whatever had fired, and the SDK reports only that the *combined* signal aborted. REQ-ORCH-092
reads `aborted` as the run stopping and classes it fatal, so the ladder did not retry, did not wait, did not try the
same tier, and discarded the text already streamed. Which signal fired now decides: the caller's `signal` is `aborted`
and fatal, the idle bound is `timeout`, which `isTransient` makes transient, and the ladder retries and falls back.
`resilience.ts` was not touched — it was right about `aborted`; it was being told the wrong thing. The `catch` path was
**not** already right, as the first reading of this defect supposed: `req.signal.aborted || timeoutSignal.aborted`
collapsed both signals into the one boolean and so reported an expired bound as an abort by that route too. Both paths
now go through one `endedEarly()`.

**Measured** (`packages/model/src/ai-sdk-client.test.ts`, a fake `fetch` and a real timer under a 300 ms bound):
a stream that falls silent past the bound yielded `{code:'aborted', headline:'the call was aborted', transient:false}`
before the fix — the production error verbatim — and `{code:'timeout', transient:true}` after; a stream still emitting
60 ms apart for 480 ms was killed at the bound before the fix and runs to `finish reason:'stop'` with all eight deltas
after it. `resilience.test.ts` carries the row for the new shape (`no stream activity for 120000 ms` → `transient`).
`pnpm resilience-proof` is unchanged and green.

**The instrument held the gap, again.** The adapter's abort test aborted `req.signal` only; nothing had ever exercised
the expiry of the other signal, which is why a hardcoded class survived three executions of this record. Both bounds are
read in **real** time on purpose: a FakeClock cannot falsify an `AbortSignal.timeout`, which reads the platform clock and
would not have noticed a controlled one advancing — so a controlled clock here would have made the red test green and
proved nothing.

## Fifth execution — 2026-09-16, the rung that never left the process (REQ-ORCH-010, REQ-PROVIDER-089)

*Found by reading one plan-mode run's log against OpenRouter (`z-ai/glm-5.3-flash`, session `6696f6ed`), not by a
test. One defect, pre-existing, and one thing this record said about the port that was never true in practice.*

**Found — the structured-output rung was replaced inside the adapter (defect, pre-existing).** The port's own
comment said "a provider that rejects the rung fails the request with an HTTP error the caller reads", and the
first execution took the SDK's `output` mapping as delivery of REQ-ORCH-010's rung 1. Neither is what happens on
the openai-compatible dialect without `supportsStructuredOutputs`: the SDK **warns and downgrades**, sending
`response_format: { type: 'json_object' }` with the schema discarded, and the call succeeds. So rung 1 reached no
openai-compatible endpoint as a schema on any provider, and every layer above recorded a `json_schema` call that
never happened. The classifier is where it showed: its rung-1 instruction names no keys *because the schema was
meant to*, so what went out was bare JSON-object mode with a one-sentence prompt — the single combination the
ladder was built to avoid, and rung 2 exists to supply.

Kept beside its replacement: the port's sentence is true of a provider's refusal and silent about the adapter's
own. `supportsStructuredOutputs: true` is now passed, so the schema leaves as a schema and an endpoint that
cannot take it answers 400 or 422, which `isRungRejection` already reads. The warning path is read too rather
than assumed gone — `outputDowngrade()` inspects the `start-step` part's `warnings`, which `stream()` had never
looked at, and yields `unsupported_output`, a code that is neither of REQ-ORCH-092's classes and descends the
ladder instead of retrying.

**The instrument held the gap, again — the same way as the fourth execution.** Every adapter test asserted what
came *back* from a fake `fetch`; none had ever asserted what went *out* in the request body, which is the only
place this was visible. The new proof reads the body.

**Not measured here.** That the schema is now *accepted* by a real provider, rather than merely sent, needs
`pnpm live-run` against a real key. It spends the owner's money and was not run; the request-body assertion is
what this execution proves.

## Sixth execution — 2026-10-02, the session-wide override taken by a second writer (REQ-NOTIFY-070, REQ-SESSION-026)

*The 401 note's part A ([`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md)).
Found nothing wrong with the mechanism; it gained a writer and a way to take a pin back.*

The third execution's session-wide memory (`ResilienceMemory`, persisted as `model_override` timeline entries and replayed
by `rehydrate`) had one writer: the user's choice during a wait. REQ-NOTIFY-070's authentication recovery is a second:
`Sessions.restartOnFallback` pins `fallback_model` keyed by the pair whose call failed authentication (`Run.failedEntryModel`,
the root cell's model at the failure) and writes the same entry with `cause: authentication`, so the pin outlives the
failed run and a reload exactly as a wait's choice does. REQ-NOTIFY-070's "where the restart cannot begin" and
REQ-NOTIFY-078's re-pinned primary need the pin taken back, which the memory could not express: `clearOverride` and an
entry carrying `cleared: true`, which `rehydrate` and the autopsy reader replay in order. No new timeline name
(`model_override` is among OQ-157's twenty-eight). Measured in the built app by `resilience-proof`'s `auth-fallback`
scenario: `scripted/alpha` refused with a 401, the override recorded `{provider: scripted, model: alpha, model_key: beta,
cause: authentication}`, the restart's one call on `scripted-b/beta`, the session `completed`; and in
`packages/engine/src/run/ladder.test.ts` — the pin honoured by a later prompt and by a fresh process, a fallback that
fails too not tried again, a restart that cannot begin taken back durably. *Corrected 2026-10-02 (the repair round):* the
first build wrote the system row "The run restarts on the fallback …" before `prompt`'s refusals, so a restart that could
not begin left that row standing beside the generic notice; the row is now written only once the restart has begun
(`promptHeld`'s `beginning` hook), and the "cannot begin" case asserts that no row claims a restart. *Corrected again
2026-10-02 (the third repair round):* `Run.failedEntryModel` was recorded only by an iteration's failed turn, so a session in
plan mode (`runtime.run_start_mode: plan`, REQ-ORCH-152/153), whose first turn is the plan cycle's, was never restarted
on the fallback — `restartOnFallback` refused it as "no model call failing" and the generic notice was published (the
verifier's reproduction in the built app). The run's last failure and the failed model are now recorded together in one
place for every root turn (`Run.recordRootModelFailure`, called by `iterate` and by `parkAtPlanGate`); the restarted plan
cycle runs on the fallback and parks at the gate. Pinned by the REQ-ORCH-153 case in `ladder.test.ts` (red before) and
shown by `auth-fallback`'s plan-mode launch. *Corrected again 2026-10-02 (the fourth repair round):* "the restarted plan
cycle runs on the fallback" held for a first cycle alone. The repair above also made a **revise** cycle's failed turn
restartable, and the restart re-submitted the last user row, so the revise came back as a fresh cycle from the original
prompt with its changes and the plan it revised dropped (the verifier's reproduction). The pin was right; what the
restart launched was not. A restart now relaunches what the failed run was launched to do
(`Sessions.relaunchAfterAuthFailure`): a run a plan decision launched as the same decision, any other by re-submitting
the prompt. The recovery dialog's restart (`Sessions.restartAfterAuthFailure`, merged beside this the same day) is a third
writer of the session-wide override (`cause: authentication`, by the user's choice) and shares the relaunch. Pinned by the
REQ-ORCH-154 cases in `ladder.test.ts` (red before) and shown by `resilience-proof`'s `auth-fallback-revise` (red on a
build of the code before, green after).

## Seventh execution — 2026-10-02, the session-wide override followed from every agent's next call (REQ-ORCH-091 a/d, REQ-MONITOR-194)

*The repair of [`a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md`](../../defects/fixed/a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md).
Found a defect in the third execution's mechanism.*

The third execution said the session-wide memory is persisted "so a later run of the session never returns to an exhausted
model and keeps the chosen one", and `setEntryModel` said the override is persisted "so later calls of the session never
return to the exhausted pair". Both were true of an agent **built** after the choice and false of one already running:
the overrides were read where a cell was made (`forChild`; `rootResilience` on a rebuild) and never by the ladder on a call.
A child's wait choice therefore left the root — on the replaced pair, and resuming after that child's report inside the
same turn — calling it, and the summariser, which has no ladder, called its configured pair whatever the session held. The
reason is kept here beside its replacement: the cell now follows the overrides before **every** call (`followOverride` in
`ladder.ts`), and the summariser's model is carried through them at each attempt (`SummariserDeps.resolve`). The move
writes nothing new: the `model_override` entry already records the replacement, and the autopsy reader already read it as
moving the root at once — which, until this repair, the run did not do.

The rule follows any override reaching the cell's pair, a rate-limit wait's choice included, not only an exhausted
pair's: REQ-ORCH-091 (d) persists both alike, and the run's own row says "the run resumes on it now and keeps it for the
rest of the session". The instant is the next call rather than the root's next turn, because the root's next call after a
child's wait is usually its resume inside the turn already running; REQ-MONITOR-194's "neither retried automatically"
rules out that call. A switch of the entry model (REQ-MONITOR-142) is not an override and still applies from the next
iteration, as OQ-177's reading says. Measured in `packages/engine/src/run/ladder.test.ts` with the note's probe: before,
the requests after the choice were child `c1`, child `c1`, summariser `a1`, root `a1`; after, all four on `c1`.
