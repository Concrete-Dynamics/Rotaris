# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Second execution — 2026-09-08, the first live run against a real provider

Part 7 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

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
