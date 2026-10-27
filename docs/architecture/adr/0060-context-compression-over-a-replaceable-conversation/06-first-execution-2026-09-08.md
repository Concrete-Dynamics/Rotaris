# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — First execution — 2026-09-08

Part 6 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

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
