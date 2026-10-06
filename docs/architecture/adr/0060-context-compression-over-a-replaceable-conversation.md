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
   *Modelling the pass on `produceReport` went further than this decision said: it read the report's own
   `transcriptText`, REQ-ORCH-110's 12,000 characters from the head at 2,000 per event, so the summary could not
   state what the model was never shown (acceptance finding A12, 2026-09-30). That reason is kept here; the pass
   now reads the slice through a reader of its own, whole up to the compressing model's own threshold (OQ-156, the
   section "The compressor's reading, repaired" below).*

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

**Measured** (`pnpm chat-controls-proof`, four launches a run; **three green runs on the final build**, the figures
identical. Stated plainly rather than smoothed: they were not three *in a row*. Two runs in between died mid-launch —
`compress-partial exited 4294967295`, and `EPERM` on the proof's own output-directory wipe — because a second process
outside this agent's control ran the same proof inside this worktree at the same time; the handoff's §10 records it, and
the orphaned Electron processes it left had to be cleared before a run could start. The record before the repair was two
consecutive runs, which was not enough, and is how AO-2 below was found):
with a root in a `wait` model call after delegating and its child in a `wait` after one `read`, **one press compressed
both** — `orchestrator` 7 → 3 messages and `child-a` 3 → 2 in every one of the three runs, 4–8 ms each on the scripted
compressor (4/5/5 ms for the root and 5/5/8 ms for the child — the only figures that move), the two compressor
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

**Found — AO-2, in AO-1's own fix and in the proof that read it.** The prompt-file commands are registered on the
catalogue's registry from an effect, and the popup's list is a `useMemo` of the composer's text and that registry
(`WorkspaceView.tsx`, a line this part may not edit) — so a registration landing after that list was built shows only at
the next keystroke. Two things followed. A read still in flight when the registry was rebuilt was applied through the
closure that had started it, so the answer landed on the registry the composer had already replaced and the live one kept
nothing until something else rebuilt it; the newest applier is held in a ref now and every resolution calls that one, and
the reader's last answer is kept beside the reader in `slash/prompts.ts`, so a rebuilt registrar takes it in the same tick
instead of reading three directories again. And the proof typed `/` at a fixed millisecond, which measured the machine: it
went red in one launch of three with the workspace service's answer already in that launch's log (the popup listed the 28
built-ins and palette mirrors and neither `greet-me` nor `prompts:greet-me`). The registrar now publishes what it has put
on the registry the composer currently holds — a hidden `[data-testid="prompt-commands"]` carrying the count and whether
the roots have been read at all — and the proof waits for that signal before it types, then asserts it beside the popup, so
a red there is the product's list and never the schedule's luck.

**That repair was measured, was not enough, and the reason it was wrong is kept here beside its replacement.** It treated
the registrar's registration as what the popup reads. The popup reads a `useMemo` of the composer's text and the
registry, so a registry REBUILT after a registration is a registry without the prompt commands until an effect refills
it — and the list the popup shows is the one built at that moment. The run measured straight after that repair was red
with the new signal reading `{count: 2, roots: 'read', waitedMs: 0}`: the roots read, both names registered, the typer
not waiting at all, and neither of them in a popup of 28. That is the verifier's one-in-three red, this time with the
evidence that says why rather than a guess about the machine. **The fix belongs where the registry is made.** `buildCatalogue` now registers the
cached answer as it builds, last, after the built-ins and the palette mirrors, so every registry carries the prompt
commands from the moment it exists and a rebuild loses nothing; and a name held by a `kind: 'prompt'` command is
replaceable by this module alone, so the build-time registration and the registrar's re-application compose instead of
each skipping the other's work as a holder it must respect. One banner block and one import in `slash/catalogue.ts`,
declared in the handoff as a ruling request.

**Found later — AO-3, in AO-1's own repair, by a launch log rather than by the proof.** AO-1's paragraph above says the
disk is read "once when nothing is cached". It was read twice: two effects start a read as a window settles — the
registrar's, when nothing is cached, and the configuration key's, which always reloads — and neither can see the other,
so before the first answer there is nothing for the second to find. The repair kept the reader's last ANSWER and not the
read still in flight, which is the whole of the gap. A launch on 2026-09-16 shows two `prompts.roots.read` round trips in
the same millisecond and two more within 16 ms (`/tmp/rotaris-launch.log`, lines 20–23), each an IPC and three directory
listings. `readPromptRoots` now holds the in-flight read beside the cached answer, so a second caller in the same window
joins it; the handle is cleared when the read settles, so focus and configuration changes still read afresh, and binding a
reader drops both. The correction is written here rather than in place, and AO-1's sentence stands as it was measured.
The skill catalog's reader, modelled on this one (ADR-0063 §5), had the gap verbatim and with three starters rather than
two, so it joins reads now as well. The note is
`docs/defects/fixed/the-prompt-roots-are-read-twice-as-a-window-settles.md`; the coalescing itself has a regression test
on both readers and has not yet been seen in a launch of the built app.

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
- The proof's `controls` launch no longer types `/` on the clock. Everything after that step moved by 2900 ms to leave
  the typer the whole wait it can take; the schedule was widened, never reordered (the rule wave 1 left for wave 2).
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

## Fourth execution — 2026-09-11 (Part C″), the manual arm re-measured on the build three lanes merged into

*Recorded under GD-10; the proof is `pnpm chat-controls-proof`, evidence under `.chat-controls-proof/`. Defects are
numbered `C2-n`; the manager assigns the ordinals at merge.*

**What this wave owed this record.** Nothing new was built on the compression mechanism — wave 3 is proof and
measurement. What it owes is whether the third execution's arm still does what it said once every lane's wave-2 work
is under it, and whether its figures move when the machine is busy.

**Measured** (four launches, the scripted provider, ~2.1 GB free with two other agents building on the same machine;
the proof PASSED **twice consecutively**): one press with two live conversations compressed both — `orchestrator`
7 → 3 messages and `child-a` 3 → 2; "Compressing…" with the control disabled and `data-pending=1`, recorded by the
MutationObserver armed before the click; the completion toast "Compressed context for 2 active agent(s)."; the label
restored and no persistent notice; one `context_compressed` entry per agent with `trigger: manual` and no threshold
field. With `fail-if:CHILD-SLICE-MARKER` the root compressed alone, the persistent notice read "1 of 2 active agent
context(s) compressed; 1 failed." with `child-a: the compressing pass failed: scripted compressor failure (HTTP 500)`
in its copyable detail block, and no completion toast. Idle: the header control disabled with "Start or continue a run
to enable run controls.", the palette entry toasting "No run is active.", and `/compress` refused through the one
persistent slot as "Command not run" / "No run is active.". **Every structural figure is the third execution's
exactly.** What moved is the scripted compressor's latency — 4–8 ms there, **25 ms and 16 ms** here — which is the
machine, not the mechanism, and is recorded rather than smoothed.

**The catalogue's route to the same arm** is measured beside it in `pnpm slash-proof`: `/compress` typed during a live
run reaches the ARMED control and never wave 1's "the run host does not support forceCompression yet", in both of that
proof's consecutive runs.

**Found — nothing.** No defect in the compression arm on this build.

**Still not exercised, carried forward unchanged from the third execution:** a manual pass against a real provider;
the single-flight join with the automatic trigger's pass in flight; `REQ-MONITOR-091`'s `no_active_conversations`
refusal (a scripted run always holds a live turn while it runs); a pass during a parent resume; REQ-CHAT-084's
busy-transcript limb, which the store's synchronous transactions give no producer.

## The compressor's reading, repaired — 2026-09-30 (acceptance finding A12)

Decision 4 gave the pass "only the compressible slice" and said nothing of how much of it; the build read it through
`children/report.ts`'s `transcriptText`, the report pass's reader, so the model saw 12,000 characters from the head of a
slice that is some 636,000 at the default trigger, and each event to 2,000. Everything else left the conversation absent
from the summary. The pass now reads `compressorTranscript` (`run/compression.ts`): each event whole, the slice whole up
to the compressing model's own effective threshold at `chars_per_token` (`CompressorDeps.inputTokens`, which
`Run.compressionFor` resolves through the same `triggerFor` the trigger reads), and past it the start and the most recent
part with the omission marked. The bound is OQ-156's reading; `transcriptText` is removed. The decision stands otherwise:
the three survivors are still never sent.

**What was measured.** `compression.test.ts`: the default trigger's shape (150 reads of 4,000 characters, over 600,000 in
all) reaches the model whole where it reached it as an ask of 12,301 characters; a slice past the bound keeps its start
and most recent part with the count of what was left out exact; and through `Sessions`, a run whose compressing model's
threshold is 4,000 tokens reads 16,000 characters of an 18,100-character slice, its most recent result whole past 2,000,
and a run with a configured `compressor.model` whose threshold is 2,000 tokens reads 8,000 — the agent's own threshold
there fails it. Each fails on the previous code. *Found by the branch's verification and repaired before merge:* the
reader first held the start to half the bound in every case, so a first event longer than half before a short most
recent part wrote a second marker with a negative count and left the rest of the bound unused; a case now pins that
the most recent part is then whole, unmarked, and the start has what it leaves. `pnpm compression-proof` on the built app, its four scenarios unchanged, is the
regression. **Not measured:** a live run — none of the live-run scenarios reaches the compression trigger (the largest
prompt of the duress runs was 64,038 and 77,043 tokens against a trigger of 157,286), so a real model's summary over a
whole slice has not been read. The row is in [`../first-executions.md`](../first-executions.md).

## The compressing model follows the agent's cell — 2026-10-02 (fin10)

*The repair of [`the-root-compresses-on-the-model-its-turn-started-on-after-its-cell-moves.md`](../../defects/fixed/the-root-compresses-on-the-model-its-turn-started-on-after-its-cell-moves.md).
Found a defect in the first execution's mechanism.*

The first execution resolved the trigger "for the model THIS agent calls" and took the compressing model from the agent's
own when `compressor.model` is not configured (REQ-MONITOR-080) — both once, when a turn started: the root's from its
ladder cell, a child's from its persona's configured model. That reason is kept beside its replacement: the ladder moves a
cell within a turn (a same-tier or unresponsive fallback, a wait's choice, a session override followed before a call,
ADR-0027), so after a move a pass called the pair the cell had left — possibly one recorded out of quota (REQ-MONITOR-194)
— at that pair's threshold, and a child under a session override compressed on the pair the override replaced from its
first pass. `TurnCompression.compressor` and `trigger` are now read at each pass (`CompressionRunner.due()` and
`runOnce`, the manual pass included) from the pair the agent's cell calls next, the session's overrides followed
(`Run.callsOn` for the root; the child's own cell from `forChild`); a configured `compressor.model` still wins.

**What was measured.** `ladder.test.ts` ("REQ-MONITOR-078/080: compression follows the model the agent's cell is on"): a
root moved from `a1` to `b1` by a same-tier fallback compresses on `b1` at `b1`'s 100-token trigger; a root that follows a
child's wait choice of `c1` compresses on `c1`; a child of a configured `a1` started under an override to `c1` compresses
on `c1` from its first pass — each with no pass at all before the repair (the trigger stayed `a1`'s 1,000). In the built
app, `compression-proof`'s new `after-a-move` scenario: the root starts on alpha (10,000 tokens), meets insufficient quota,
moves to beta (1,000), and its 900-token step compresses on beta at beta's 600-token trigger. The row is in
[`../first-executions.md`](../first-executions.md).

**Corrected at the bundle's first repair round, 2026-10-03.** "From the pair the agent's cell calls next, the session's
overrides followed" left the exclusion out: `Run.callsOn` follows an override but not a pair the session holds out of quota,
and the turn's automatic check ran before the ladder's pre-call move, so a root resumed on a pair its child had just excluded
compressed on it at its threshold and then moved. That reason is kept beside its replacement: `runTurn` settles the cell
(`settleBeforeCall`, ADR-0027's ninth execution as corrected) before the check, so the pass reads the pair the step will
call; and `TurnCompression.withheld`, read at each pass, makes no call when the compressing model is the agent's own pair and
the session holds it out of quota — reachable only by a manual pass while the agent awaits a tool or a child, which then fails
with the reason (`due()` answers false for the automatic one). A configured `compressor.model` is still called as configured
(OQ-189). Measured in `ladder.test.ts` (a root stepping again after the exclusion makes no pass; with no candidate it waits,
then compresses on the model chosen at its trigger; a manual pass in the span calls nothing — each red before) and by
`compression-proof`'s `excluded-before-pass` scenario (red before: a pass at alpha's 600-token trigger; after: none, the root
on beta, whose trigger is 60,000).

*Ruled 2026-10-06 (OQ-189, [R-071](../../product/requests.md#r-071), [`PD-MONITOR-005`](../../product/directives.md#pd-monitor-005)),
reported back in place; the sentence above that a configured `compressor.model` "is still called as configured" is kept as it
was written and no longer holds.* A configured compressing model is now a helper call: it is resolved through the session's
overrides at each pass (`Run.helperModel`, `helperChoiceOf`), and where the pair it ends on is held out of quota the pass
compresses on the agent's own model (`compressing` in `Run.compressionFor`), REQ-MONITOR-080's default. `withheld` is read for
whichever model the pass would call, so a manual pass whose configured compressor and agent pair are both excluded makes no
call and fails naming both (before: `if (c.model) return null`, and the configured pair was called). Measured in
`ladder.test.ts` (a configured compressor held out of quota yields to the root's own model; one following a wait choice's
override; a manual pass with both excluded calls nothing, red with the old guard) and by `compression-proof`'s
`after-a-move` scenario (the compressor's model `scripted/beta`, before `scripted/alpha`).
