# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — What its first execution found — 2026-09-17

Part 6 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## What its first execution found — 2026-09-17

`pnpm retrospective-proof` was written and run against the built application: six launches over four scratch
profiles, **29 checks, all green on the third attempt**, evidence under `.proof/retrospective-proof/`. Every
scenario this record owed was measured — the capture reading three seeded sessions, the artifact stored with
`source_kind: 'retrospective'` and a null `source_session_id`, `considered_session_ids` naming exactly the
sessions read, the proposals on the Proposals tab and on the Overview card, an approval writing through, the
no-model refusal answering each gesture with its own notice, the timeout taking the empty-artifact outcome
inside its five-second bound while the composer still accepted input, shutdown leaving nothing behind, and both
indicators present while a pass ran and absent when none did.

**Three things it found that reading had not.**

1. **The Proposals tab drew a blank cell for a retrospective artifact.** The detail card's "Source session"
   value was `artifact.source_session_id` rendered directly, so a retrospective — which has none by
   construction — showed an empty cell where a session id belongs. This is consequence 3 of this decision
   arriving in the one place the type change did not force a compiler error, because `string | null` renders as
   nothing rather than failing. An empty cell reads as a record that failed to name its session, not as a pass
   that never had one. Repaired in the same commit: the cell is "Source", and a retrospective names the
   workspace's history and the number of sessions it read. **The hundred and nineteenth defect**, found by drawing
   the assertion rather than by running it.
2. **A gesture made in the first second after launch can have its answer replaced before it is read.** Exactly
   one notice is current (`REQ-NOTIFY-024`), and a launch with no authenticated provider publishes "No model
   provider is authenticated yet" about a second in. The no-model refusal's own notice was published and then
   replaced roughly 80 ms later, so the proof's first run read the startup notice and reported a failure
   against correct behaviour. **This is not a defect** — both notices behave exactly as `REQ-NOTIFY-024`
   specifies, and the second gesture's answer stood — but it is worth recording that the retrospective's
   refusal is as replaceable as any other notice, and that a proof which waits for a notice and then re-reads
   the DOM is reading whatever arrived in between. The proof now waits for the launch's own notices to settle
   and captures each notice *as it matched*.
3. **No proof had ever exercised the improvement analyst in the built application.** The scripted client
   recognises a role by its system text, and the analyst matched none of the five it knew — so every scripted
   post-run analysis since Part AF had been answered by the *child* script, parsed as unparsable output, and
   recovered into an empty artifact. The lifecycle's own proof is six Vitest lanes, so nothing noticed. The
   client now has an `improvement analyst` branch driven by `ROTARIS_IMPROVEMENT_SCRIPT`, and it serves both
   passes. The finding is against the harness rather than the product, and it is the reason this record's
   first execution is worth more than the 1,976 unit tests that were already green.

**What the WIDER sweep found, which is the part of the rule that pays.** Running the suite this part touches
rather than the script named after it turned up four defects that have nothing to do with the retrospective
and everything to do with the fact that nobody had run them: three proofs left red on `main` by the change
that moved what they measure — `palette-proof`'s hand-written command count (**121**), `config-proof`'s
`.seg-opt` selector for a control `PD-CHAT-001` turned into a press-revealed chip (**122**), and the timeline
entry name and severity OQ-46's audit corrected in the product and the unit tests but not in
`sessions-proof` and `checkpoint-proof` (**123**) — all three repaired here. Each failed PART WAY THROUGH its
script, so everything after the failing line had been unmeasured for as long as the miss stood, which is how
the fourth stayed hidden: past the corrected name, `sessions-proof` reports that `plan_cycles` (v17) is the
only session-scoped table in the store with no `REFERENCES sessions(session_id) ON DELETE CASCADE`, so
deleting a session leaves its plan text — stored VERBATIM by `REQ-ORCH-154` — behind for good (**125**,
`docs/defects/fixed/a-session-delete-leaves-its-plan-cycles-behind.md`). That one is NOT repaired here: it needs an
appended migration rebuilding a table this part does not own, and the note carries the repair's shape. Past the same
corrected name, `checkpoint-proof` reaches a scenario nothing had run in weeks and finds the Start session dialog
accepting a gesture and producing NOTHING — no session row, no refusal, no notice, reproduced twice (**126**,
`docs/defects/fixed/the-start-session-dialog-accepts-and-creates-nothing.md`). `pnpm ui-audit`, run for this part's own
surfaces, then measured the likely reason and a defect of its own beside it: that dialog stands 560 × **904** and
fits NO supported window — at the minimum 1000 × 680 its run-start selector, its `Cancel` and its `Start session`
are all off screen (**127**, `docs/defects/fixed/the-start-session-dialog-does-not-fit-the-minimum-window.md`), and a
click at a control's computed centre lands nowhere when that centre is outside the window. Two
defects, both hidden behind one stale string, which is the argument for running the whole suite rather than the
script named after the part.

**And one defect in the sibling this pass is built beside (124).** `REQ-LIBRARY-124` fixes the completion
notice's wording, its action and its zero-proposal outcome, and the built notice matched none of the three:
no count in the title, no action at all, and a success-shaped notice reading `0 proposals collected` where
the requirement fixes an informational one. The retrospective's own completion notice branches off that same
call, so the three were repaired here rather than worked around. A fourth limb of the same requirement stays
open and is recorded rather than fixed: a job that ends without an artifact for any reason but cancellation
owes a warning notice, and the coordinator writes a log line at each of its three failure points and posts
nothing — repairing it means separating cancellation from failure in the coordinator, which `REQ-LIBRARY-127`
makes a decision rather than an edit.

**What went right, and is therefore evidence rather than luck.** Decision 1 — one job, one analyst, two passes
— held without a single downstream change: the FIFO, the save, the canonical reread, the review, the history
and the Overview card all carried a retrospective artifact without knowing it existed. Decision 2's attribution
clause was measured in both directions in the built product: the analyst's answer cited one session the capture
had read and one it had not, and the stored artifact carries `["planted-03", null]` — the invented citation was
stripped rather than persisted.
