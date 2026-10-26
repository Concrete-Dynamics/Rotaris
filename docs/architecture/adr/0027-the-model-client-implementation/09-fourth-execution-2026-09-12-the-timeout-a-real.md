# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Fourth execution — 2026-09-12, the timeout a real run found (REQ-CONFIG-115, REQ-ORCH-092)

Part 9 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

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
