# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-08
- **Origin:** the map's tools row (`codebase.md`, "owes" — `REQ-ORCH-093`'s context-window condensation),
  taken as Part AH
- **Depends on:** ADR-0026 (the model boundary — the compressing pass is a second call over the same port),
  ADR-0027 (the client; `REQ-MONITOR-081` prefers the provider's own prompt-token figure), ADR-0036 (the
  `compressor:` section), ADR-0010 (the run's publications), ADR-0059 (the in-turn observer, whose position
  in the step loop the trigger shares)
- **Requirements:** `REQ-ORCH-093`, `REQ-MONITOR-076..089`, `REQ-MONITOR-281`, `REQ-CONFIG-085`,
  `REQ-CONFIG-132..135`

## Context

A model call rejected because the conversation no longer fits must be recovered by condensing and retrying
(`REQ-ORCH-093`), and an agent that has reached the effective threshold must compress **before** its next
call rather than after a failure (`REQ-MONITOR-076`). Part Q built the classification —
`classifyFailure` returns `context_window` for eight provider phrasings — and then routed it nowhere: the
ladder's comment says "context-window rejection and every other failure → the step fails as it did
(`REQ-ORCH-093` is left unbuilt)". Part AB's and Part AC's work above it made long sessions ordinary, so
the failure is now the first thing a real session hits.

Everything the reconstruction needs is decided already. `REQ-MONITOR-084` fixes the five parts and their
order; `REQ-MONITOR-082` fixes the three survivors and forbids sending them to the compressing model;
`REQ-CONFIG-134` fixes the capacity ladder and `compressionTrigger()` already computes it, uncalled.

What is **not** decided is where the conversation lives. Today it is a local array in `runTurn`
(`messages`, `turn.ts`), rebuilt from `history` at every turn and chained through `outcome.messages` by
`runWithChildren`. Nothing outside the turn can address it, and the array reference is handed straight to
`backend.runTurn`. Compression must replace that array — and one day §10's manual compression must replace
it from outside the turn entirely. This ADR decides the shape.

Two further things are undecided by the requirements and decided here because the code cannot proceed
without them: what a "conversation turn" is for `preserve_recent_turns`, and where a compression is
reported given that `REQ-EVENTS-041` closes the wire catalogue at 23 kinds and none of them reports one.

## Alternatives considered

**A — Mutate the array in place.** `messages.splice(0, n, ...rebuilt)` at the moment compression finishes.
*Against:* the same array reference is already inside `backend.runTurn` for a call in flight
(`turn.ts`'s `step` passes `messages` straight through), so a replacement can rewrite a request body while
it is being serialised. The defect would be intermittent, provider-dependent and nearly untestable. This
also makes §10's manual path — which by `REQ-MONITOR-092` compresses live conversations concurrently —
unbuildable without revisiting the same seam.

**B — Compress between turns only.** Let a turn finish, condense `history`, start the next turn from it.
*Against:* `REQ-MONITOR-076` compresses "when a new model call is about to be made", and a turn is many
model calls; a tool loop that grows past the window inside one turn would never compress. `REQ-ORCH-093`'s
retry is per **call**, not per turn.

**C — A `Conversation` object whose array is swapped, never mutated.** The turn holds one; every step takes
a `snapshot()`; a replacement installs a new array, so an in-flight request keeps the one it was given and
the next step sees the new one. Chosen.

## Decision

**Alternative C**, with the four rules below.

1. **`Conversation` owns the history** (`packages/engine/src/run/conversation.ts`). `snapshot()` returns the
   current array (frozen by type, `readonly ChatMessage[]`); `push` appends; `replace` installs a **new**
   array and never mutates the old one; `originalRequest` is the first `user` message, captured at
   construction. `runTurn` constructs one per turn from `history` plus the incoming user message;
   `TurnOutcome.messages` is `snapshot()`, so `runWithChildren`'s chaining and `report.ts`'s readers are
   unchanged. `step()` is given the snapshot, which is what makes the swap safe.

2. **A conversation turn boundary is any message that is not a `tool` message.** `preserve_recent_turns`
   (default 4, `REQ-CONFIG-132`) counts those boundaries. The specification does not define the unit, and two
   properties decide it. It must never **orphan a `tool` message from the `assistant` message that named its
   `callId`** — the shape providers reject with a 400, which would make compression produce the very failure it
   recovers from; a `tool` message always directly follows its assistant message, so cutting anywhere else is
   safe. And it must have granularity **inside** one exchange. *This decision first read "a user-rooted group,
   from one `user` message to just before the next". That was falsified by the first execution below and the
   reason is kept in `conversation.ts` beside its replacement.*

3. **The reconstruction is `REQ-MONITOR-084`'s five parts and nothing else**:
   `[original request, compression summary, todo items, ...preserved turns]`. Parts (1) — the system prompt
   and the tool definitions — **are not in the conversation at all**: they travel as `systemPrompt` and
   `tools` on every request (`turn.ts`'s `step`), so they survive character for character by construction
   rather than by being copied. `REQ-MONITOR-083`'s 300-line bound clamps **the summary alone**; the todo
   items go across one for one and the preserved turns verbatim, neither counted against it.

4. **The compressing pass is a bounded second call over the same port**
   (`packages/engine/src/run/compression.ts`), modelled on `children/report.ts`'s `produceReport`: the
   `compressor.model` when configured, else the agent's own model (`REQ-MONITOR-080`), the section's
   `timeout_seconds`, and a prompt asking for the work performed, the findings reached and the questions left
   open (`REQ-MONITOR-082`). It is given **only the compressible slice** — what lies between the original
   request and the preserved turns — because `REQ-MONITOR-082` forbids sending any of the three survivors.
   A failed or empty pass is a failed compression; nothing is discarded.

5. **Two call sites, one mechanism.**
   - *Automatic* (`REQ-MONITOR-076`): at the top of the step loop, in the position ADR-0059's `check()`
     already occupies. The count prefers the provider's real last-prompt reading, which `AgentActivity`
     already holds from the previous step, and falls back to a character estimate at `chars_per_token`;
     which source was used is recorded (`REQ-MONITOR-081`).
   - *Recovery* (`REQ-ORCH-093`, `REQ-MONITOR-077`): a `context_window` branch in `resilientStep`, at most
     **twice for one call**. Where the condensation itself fails the report is returned unchanged, so the
     original rejection is what surfaces. The ladder learns nothing about conversations: it calls an optional
     `condense()` on `TurnResilience` that `runTurn` supplies, closing over its `Conversation`.
   - The parent-resume limb of `REQ-ORCH-093` needs no third site: a resumed parent is a turn like any other
     and reaches both sites. It is distinguished only in the issue kind — `parent_resume_bad_request` when the
     failing call is the first of a resumed turn, `llm_bad_request` otherwise — and is bounded by the child
     timeout that already wraps it (`REQ-ORCH-088`).

6. **The count is the timeline's** (`REQ-MONITOR-086`). One `context_compressed` entry per completed
   compression is the durable record; `AgentActivity` holds the live figure and a session opened again
   rehydrates it by counting those entries, the shape `ResilienceMemory.rehydrate` established. Counting a
   completion twice is impossible because an entry is written once. The per-agent figure joins `AgentRecord`
   as `compressions`, which is what `REQ-MONITOR-281` asked for and Part R recorded as owed.

7. **Reporting is the timeline entry, the transcript row and the log — and an open question.**
   `REQ-CONFIG-135` requires the four inputs on the session's event stream as separate machine-readable
   fields, but `REQ-EVENTS-041` closes the wire catalogue at 23 kinds and none of them reports a compression.
   **OQ-53 is raised against `REQ-CONFIG-135`.** The interim is the one Part Q used for `model_exhausted` and
   `model_override`: the `context_compressed` timeline entry carries `threshold_percentage`, `capacity`,
   `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate metadata fields, one
   `system` transcript row is rendered from those fields, and the same figures go to the log at
   informational level. What the requirement asks for is delivered; where it is delivered is what OQ-53 asks.

8. **The capacity is the model's, not a constant.** `REQ-MONITOR-078` resolves capacity from the model's
   `context_compression_threshold`, else the smaller of its `max_input_tokens` and `default_threshold`.
   Both fields have loaded since ADR-0036 and neither has ever reached a run: `sessions.ts` records
   `contextLimitFor` as unfilled, so every agent meter has read 265,000 whatever the model. This part carries
   them from the configured run, which is also `REQ-MONITOR-049`'s limb that Part R left owed.

9. **A compression in flight is published like a wait.** `SessionRecord` gains
   `compression: { agent, startedAt } | null`, derived from the live run at each snapshot exactly as `wait`
   is (`REQ-MONITOR-085`). The run host is a separate process and keeps publishing while the pass runs, so
   no surface blocks; the added latency is recorded in the timeline entry.

## Consequences accepted

1. A compression sits on the agent's critical path for up to `timeout_seconds` (120 s by default). The agent
   is doing nothing else at that moment, and the alternative is a failed call.
2. Automatic compression fires between steps, so a single step whose own request already exceeds the window
   — one enormous tool result — is caught by the recovery path, not the trigger. Both exist for that reason.
3. Compression is per agent conversation. A run whose children each hold a large context compresses each of
   them separately, and the figures are per agent (`REQ-MONITOR-086`'s run-wide count is their sum).
4. §10's manual compression (`REQ-MONITOR-090..097`, `REQ-CHAT-078..081`) is **not built here**. Decision 1
   is what makes it buildable: a conversation registry over `Conversation` handles, addressed from the
   `forceCompression` control arm.
5. `preserve_recent_turns: 0` is accepted by the schema and leaves the conversation with no verbatim tail.
   It is not clamped, because `REQ-CONFIG-132` states its range and 0 is inside it.

## Revisit if

§10's manual compression lands (the registry of decision 1 gets its second reader), or OQ-53 is ruled such
that a compression must ride a catalogued wire event (decision 7's interim is then replaced, not repaired
quietly), or a provider begins reporting the prompt-token figure for a **rejected** call (the recovery path
could then trigger on the figure rather than on the phrasing).

## First execution — 2026-09-08

*Recorded under GD-10. Two defects of ADR-0058 consequence 17's pattern, the forty-first and forty-second.*
*The ordinals continue from ADR-0016's fortieth (Part AC, 2026-09-07), the last one the record states; Parts AD, AE
and AG recorded their findings without ordinals. Commit `cf6ad7e` puts the tally at fifty-three, which counts a wider
set than the ADRs' running number — the two figures disagree and neither is corrected here, since correcting one
means recounting the other.*

**Built and run:** `Conversation`, the compressing pass, the two call sites, the count and its timeline seed,
`SessionRecord.compression`, `compressorOf` / `compressionTriggerFor` / `contextLimitsOf` at the run-host root,
and the scripted client's `fail:context`, `tokens:<n>`, `ROTARIS_COMPRESSOR_SCRIPT=fail` and `compressor`
persona. Thirteen engine tests. In the built app (`pnpm compression-proof`, `.compression-proof/results.json`),
four launches on the scripted provider with `max_input_tokens: 1000` and `threshold_percentage: 60`, so
`REQ-CONFIG-134`'s trigger resolves to 600:

| Scenario | What happened |
|---|---|
| `rejection` | `fail:context` after four tool steps → one condensation, the retry succeeded, the run **completed**; one `context_compressed` entry, `trigger: rejection`, 10 messages → 4; one `llm_bad_request` issue; the transcript's reason row names all four inputs |
| `automatic` | a step reporting 900 prompt tokens → the next step compressed **first** (`compressor` sits between two `orchestrator` calls in the log), `trigger: automatic`, `count_source: provider`, `counted_tokens: 900` |
| `compressor-down` | the compressing model failing → **no** `context_compressed` entry, a `compression_failed` issue, the run failed, and `prompt is too long` — the provider's own rejection — is what surfaced |
| `twice-only` | a rejection that survives condensation → exactly **two** compressor calls, then the step failed |

**Found (1) — the turn unit made compression a no-op for the case it exists for.** Decision 2 first counted
**user-rooted** groups. An agent that never sees a second user message — one long tool loop, which is precisely
the shape that outgrows a context window — then holds exactly **one** turn, so "the four most recent turns" is
the whole conversation and the compressible slice is always empty. The engine test failed with *"nothing lies
between the original request and the preserved turns"* on every scenario. The rule is now the non-`tool`
boundary above, which keeps the property that mattered and gains granularity inside a single exchange. The
falsified reason is kept in `conversation.ts` beside its replacement.

**Found (2) — `REQ-MONITOR-085`'s status was invisible.** `compression` is derived from the live run exactly as
`wait` is, and a derived field is only as visible as the next publication. A compressing pass **writes nothing
for as long as it lasts**, so the field was set and cleared between two publications and no surface could ever
observe it: the requirement's "a status stating that compression is running must be visible" was met on paper
and not in the product. `onState` now calls `owner.reconcile()`, and the test asserts a published snapshot
carried it. `wait` escapes this only because the ladder writes a transcript row before parking.

**Reading recorded — a compression can make a small context BIGGER in tokens.** The proof measured 10 messages
→ 4, but 89 estimated tokens → 130: the summary and its framing have a floor a short history is already under.
It does not matter for `REQ-MONITOR-076`, which fires only at capacity. It **does** matter for `REQ-ORCH-093`,
which fires on the provider's rejection whatever the size: a call rejected for context over a genuinely small
conversation is retried with a *larger* prompt and rejected again, and the two-attempt bound is then what ends
it. No requirement asks for the pass to be skipped on that ground and none is invented here; the outcome
figures now carry `before_messages`/`after_messages` beside the token pair so a reader judges a compression by
the history it removed.

**Not exercised:** a real provider's context rejection (the scripted client supplies the phrasing); a child
agent's own compression in the app (the unit path is covered and the wiring is `compressionFor` on
`ChildrenDeps`); `preserve_recent_turns: 0`; `compressor.timeout_seconds` expiring; a compression during a
parent resume, so `parent_resume_bad_request` is implemented and unmeasured.

## Second execution — 2026-09-08, the first live run against a real provider

*Three more defects, the forty-third to the forty-fifth. All three were invisible to the scripted client and to every unit
test, and both were found by one short run on OpenRouter (`anthropic/claude-haiku-4.5`) in a scratch workspace
whose `compressor.default_threshold` was lowered to 15,000 so the trigger fell at 9,000 tokens.*

**Found (3) — a no-op was recorded as a failure, once per model step.** The trigger fired exactly as designed
and the pass then refused: with `preserve_recent_turns: 2` on a conversation holding three boundaries,
everything after the original request was already inside the preserved tail, so the compressible slice was
empty. That is not a failure — there is simply nothing to do — but it was recorded as a `compression_failed`
warning issue. And because the automatic trigger is evaluated **before every step**, the condition persists for
as long as the count stays over the threshold: a long run would carry one warning issue per remaining step, all
of them describing the same nothing. `CompressionOutcome` now carries `nothingToDo`, the runner logs it once per
agent and records no issue, and the rejection path is unaffected because `REQ-ORCH-093` surfaces the original
rejection either way. The unit tests could not have caught this: they asserted what one compression does, and
this is a property of the trigger being asked repeatedly.

**Found (4) — `REQ-MONITOR-089`'s root reading reached no surface, so every context meter drew zero.** The
requirement says "the run's synthetic root agent exposes the newest such reading so that root-level surfaces
have a context figure to show". The entry role holds no `children` row, so `toAgentRecord` never projects it,
and `runLevelAgent` in the surface hard-coded `contextUsed: 0`. A run that spawns no child — the ordinary case —
therefore showed **zero context used whatever it had spent**, and the meter that is supposed to warn at 75 % of
the threshold could never move. `AgentActivity` has held the figure since Part R; nothing carried it. The record
gains `SessionRecord.entryContext` — the latest reading and the model's own advertised limit — published from the
live run beside `wait` and `compression`, and the surface reads it. Part R's owes row named "the run-level
agent's own prompt reading" and this closes it.

**Found (5) — the trigger reads a count compression cannot lower, and looped eight times doing it.** With the
no-op fixed and `preserve_recent_turns: 1`, the second live run compressed — and then compressed again, and
again, **eight times in one run**, each costing a model call and 2.3–6.2 s. The figures say why: the provider
counted 9,264–12,826 prompt tokens against a 9,000 trigger while the conversation being rewritten was about
**500 estimated tokens**. The difference — roughly 8,800 — is the system prompt and the tool definitions, which
`REQ-MONITOR-082` keeps character for character and which are not in the conversation at all. The
incompressible floor was itself above the threshold, so every step was over it, every step compressed, and
nothing got smaller: `est 479 → 453`, `529 → 460`, and once `625 → 626`, larger than before.

`REQ-MONITOR-081` requires the provider's own count to be preferred and `REQ-MONITOR-076` requires a compression
when it reaches the threshold; **neither says what to do when compressing cannot lower it**, and the code cannot
proceed without an answer.

**The first answer was wrong, and the next live run said so.** It measured the *floor* — what the provider
counted less the conversation's own estimate — and latched only when the floor by itself reached the threshold.
Against the real numbers the floor was 9,256 − 548 = **8,708 against a 9,000 trigger**, so the guard concluded a
sufficiently good compression could still get under, and let it run: four compressions instead of eight. The
reasoning was the mistake. A compression is not perfect and cannot drive the conversation to zero — it keeps
four things by `REQ-MONITOR-084`, and their own floor put the total back over the line every time.

**The rule that replaced it measures the outcome instead of predicting it: a compression must lower the counted
prompt.** If the next provider-sourced count is not below the count that triggered the previous compression,
compressing is not working and is latched off for that agent, with both counts, the conversation's size, and
what to change (`threshold_percentage`, `default_threshold`, or the tool surface). Against the same numbers —
10,555, then 9,256, then 9,372 — that stops at two. It cannot be fooled by arithmetic about what a compression
might in principle achieve, because it only ever reads what one did achieve. The falsified floor test is kept
in the code comment beside it. `REQ-ORCH-093`'s recovery path is deliberately **not** latched: a rejection must
always be answered with an attempt, whatever a previous measurement suggested.

This is the defect that mattered most and the one furthest from anything a scripted client could produce. It
needs a real provider reporting a real prompt count, a real tool surface large enough to dominate it, and a
threshold set below that floor — which is exactly what a user lowering the threshold to see the feature work
will do.

**What the same runs proved worked**, and it is worth stating because the defects above are all about the
edges: both runs completed on a real provider with no issues; the trigger resolved from the configuration at
9,000 tokens; the count was read from the **provider's own reported prompt tokens** rather than the estimate;
the automatic evaluation happened at the right place in the step loop; the reconstruction ran against a real
model's summary and the agent carried on from it (`1,984 → 343` estimated tokens on the first pass, 5 messages
in and 5 out with six turns of history replaced by one summary); and the transcript, the timeline entry and its
four `REQ-CONFIG-135` fields were all written as specified.

**The healthy path, measured.** With `code_intelligence` off (its tool definitions were the floor) and five
32 kB documents in the workspace so the *conversation* is what grows, one run compressed **once**: counted
10,744 against a 7,200 trigger, the conversation **7,640 → 451** estimated tokens, 7 messages → 5, in 4,684 ms.
It did not fire again, because the count genuinely fell and stayed down. The run completed `tasks_complete`
with **no issues**, the `system` reason row sat in the transcript where the compression happened, and the agent
carried on across the boundary — it read three further documents and produced a correct answer.

**Reading recorded — the agent re-read a file it had already read before the compression.** `architecture.md`
was read at step 3 and again at step 6, the compression sitting between them. Nothing is wrong: `REQ-MONITOR-082`
requires the summary to state the work performed, and it did, but a summary is not a transcript and the model
judged it cheaper to re-read than to rely on it. That is the standing cost of compression rather than a defect
of this one, and it is the figure to watch if `preserve_recent_turns` or the summary prompt is ever tuned.

**The verification sweep, and what it took to attribute it.** All twenty-four runnable `*-proof` scripts ran
(`slice-proof` needs the owner's key; `code-intel-proof` is IC-7's). Four were red — `theme-proof`, `part-h-proof`,
`library-proof`, `transcript-proof` — and **each was re-run against clean HEAD with this part stashed**: all four
are red there too, so this part falsified none of them. `checkpoint-proof` was red once, green on HEAD, then
**green twice on the same tree that had just failed**. That measurement is recorded in `codebase.md`'s "verifying
a part" section, because the thing worth carrying forward is the method rather than the four names.

## Third execution — 2026-09-09 (Part AO): the manual arm, decision 1's second reader

*Recorded under GD-10; the proof is `pnpm chat-controls-proof`. Defects are numbered `AO-n`; the manager assigns the
ordinals at merge.*

**What was asked.** §10's manual compression, which consequence 4 left unbuilt and decision 1 was written to make
buildable: `forceCompression` reaching every live conversation concurrently (REQ-MONITOR-092), unconditionally
(REQ-CHAT-081, REQ-MONITOR-096), settling once (REQ-CHAT-080), every failure listed per agent (REQ-MONITOR-094); the run
header's control (REQ-CHAT-078..080), the palette entry (REQ-MONITOR-097) and `/compress`.

**Built.** `run/conversations.ts` — the **`ConversationRegistry`**: a turn registers a handle (the agent's name and one
operation, compress now through this agent's own `CompressionRunner`) on entry to `runTurn` and unregisters on every
exit, so a handle never outlives its turn; `Run.forceCompression()` compresses every registered handle at once and
reports `{compressed, unchanged, failed[]}`; `CompressionRunner.manual` is the same `compress()` call as the automatic
pass, but neither `due()` nor the futility latch is consulted, and the `context_compressed` entry carries
`trigger: manual` with **no threshold field** — a figure that was never read would be a false record, and the reason
line says so instead. The runner gained a single-flight guard: a manual pass landing while the automatic trigger's pass
runs, or the reverse, JOINS it rather than doubling it, and `due()` answers false meanwhile — two passes over one
conversation would each slice the array they were given and the second `replace` would discard the first's work.
`Sessions.controlAsync` is the one asynchronous control entry, awaited by the run host; the completion toast and the
persistent "Context compression incomplete" notice are raised by the run host, which holds the figures. Decision 9's
live field became a map, because several agents compress at once and one name could not say so. Engine tests cover the
registry's concurrency and per-agent failure, the pass through `Sessions` against a real store with a held tool
dispatch, both refusals, and the transcript clear on both of REQ-CHAT-084's routes.

**Measured** (`pnpm chat-controls-proof`, four launches; two consecutive runs, both green, the figures identical):
with a root in a `wait` model call after delegating and its child in a `wait` after one `read`, **one press compressed
both** — `orchestrator` 7 → 3 messages and `child-a` 3 → 2, 5–6 ms each on the scripted compressor, the two compressor
calls 12 ms after the click and the control's answer 23 ms after it; "Compressing…" with the control disabled was
observed by a MutationObserver (the relabel lasts the pass, ~20 ms here); "Compressed context for 2 active agent(s)."
was toasted; neither entry carries a threshold field. With the scripted compressor failing on the child's slice alone
(`fail-if:CHILD-SLICE-MARKER` matches the README the child read and the root never did), `orchestrator` compressed,
`child-a` did not, and the persistent notice read "1 of 2 active agent context(s) compressed; 1 failed." with
`child-a: the compressing pass failed: scripted compressor failure (HTTP 500)` in its copyable detail block, recorded
in the session's timeline (REQ-NOTIFY-268). Idle: the header control disabled with "Start or continue a run to enable
run controls.", the palette's entry a toast "No run is active.", `/compress` "Command not run" through the shell's one
slot.

**Found — AO-1, in this part's own renderer code.** The catalogue's registry is rebuilt by its memo several times
while a window settles (the stash count, the reachable set and the command context each arrive once), and the
prompt-roots effect read the disk on every rebuild: five `prompts.roots.read` round trips in the first 200 ms of the
first launch, each an IPC to the workspace service and three directory listings. A rebuild re-applies the last result
to the new registry now; the disk is read on composer focus, on a configuration change, and once when nothing is
cached. The reason is kept in `slash/controls.tsx` beside the fix.

**Readings recorded.**

- The scripted compressor answers in ~20 ms, so REQ-CHAT-079's "Compressing…" is invisible to any timed probe; the
  proof arms a MutationObserver on the control before the click and reads what it recorded. On a real model the relabel
  lasts seconds.
- Main's `session.control` relay bounded every control at 10 s; a concurrent pass is bounded by
  `compressor.timeout_seconds` (120 s by default, decision 4), so the reply would have timed out while the pass ran
  on and the header would have reported a failure the run host never had. The relay bounds `forceCompression` at 130 s
  now — one line in `main/index.ts` outside this part's permitted set, raised in the handoff as a ruling request. A
  larger configured bound still outlives it; stated at the site, not hidden.
- On this shared machine a scripted step took 2 s where an idle one takes 0.5 s, and a fixed click found the child with
  one completed step and one preserved turn — nothing between its request and its tail, reported **unchanged**.
  REQ-MONITOR-092's "however empty a context is" is honoured by that: the pass ran, and there was nothing to remove.
  The proof runs with `preserve_recent_turns: 0` (consequence 5's accepted value) so one step suffices, and longer
  waits; the schedule tolerates about five times the idle step time.
- `REQ-MONITOR-091`'s refusal (`no_active_conversations`) is answered when the registry is empty — a run between
  turns, or one whose configuration offers no compressor. The proof does not reach it: a scripted run always holds a
  live turn while it runs. Stated.
- REQ-CHAT-084's "Transcript is busy and could not be cleared." has no producer under the store's synchronous
  transactions: a clear cannot interleave with another write. The toast and the refusal code exist; the condition is
  stated unreachable in `sessions.ts`.

**Not exercised.** A manual pass against a real provider (every figure above is the scripted client's); the single-flight
join with the automatic trigger's pass in flight (implemented, the guard read, not measured — the automatic trigger is
off in every proof launch); a pass during a parent resume; a run configured without a compressor answering
`no_active_conversations`.
