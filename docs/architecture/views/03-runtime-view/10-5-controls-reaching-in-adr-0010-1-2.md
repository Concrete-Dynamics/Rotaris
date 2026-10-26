# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 5. Controls reaching in (ADR-0010 #1, `Sessions.control`) (continued)

Part 10 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

A **paused** session has no live run: `session.continue {action}` is a session command — at the message limit
it resolves the pause (continue → `idle`; double → the limit ×2; cancel → `paused`, stop reason
`message_limit_reached`) and, for continue/double and for a manually paused session, launches a **continuation
run** on the same session with no new user row (Part H's route, the previous intent carried over, the
continuation payload built to REQ-SESSION-115's budgets, its artifact the latest one the most recent iteration's root
published that nothing supersedes — known by its root task id as the artifact's `conversation_id`, and none when a
plan cycle opened its gate after that iteration opened — else the latest of any kind that nothing supersedes
(PD-ORCH-005 clause 20, OQ-106), id first and cut to 6,000 characters, an artifact a person edited carried as its
document below its frontmatter and marked `edited`, read through the session's `ArtifactStore` (PD-LIBRARY-003 (e)) —
`latestArtifactText`, read once at the continue, so a later iteration of that run, and the plan cycle held after a
resumed iteration, are re-sent it as it stood then —, its "Recent iterations" the last five `iteration_end` timeline entries
each closed iteration writes after `endIteration` ("Iteration <n> (<task title>): <outcome> — <summary>", REQ-ORCH-139's word
with REQ-ORCH-067's fields; nothing wrote one before 2026-10-07 and the block read "(none recorded)", live-run finding P4) —
and its progress context listing the continuation offers
no child has taken up, the newest ten — `openOffersText` (`run/offers.ts`), which a continue that resumes an open
iteration records for its root instead, OQ-99; and which `Run.turn()` adds to the first message of every execution
iteration's root as a text part after the launch content, naming only the offers that content does not already hold
and the offers open when its handoff was built, named or left out (`RunDeps.handoffOffers`, `openOfferIds` at the
continue) —
so a continuation's first iteration, which reads them in its handoff, is told nothing more, each later iteration of
the same run is told those raised since, whichever child raised them, and a plan cycle is told none; the continue
that resumes a root tells it only the offers its record does not hold (`offersHeldIn`: those it names, and those a
list it holds left out and the record shows raised no later than that list was recorded): `PD-ORCH-004` revision 4,
OQ-107). **PD-ORCH-005:** where the last run left an iteration open,
that run resumes it first (§2), and `session.continue`'s `withoutPaused` declines it instead — clause 6's "continue
without them" (renderer `continueSession(action, {withoutPaused})` → main → run host → `Sessions.continueSession`). The
Continue action states what it resumes from `SessionRecord.resumable` (`resumableOf`: the open iteration, and its root
plus every agent of it not in a terminal state — the paused ones after a rest, and the ones a crash not yet recorded
left, which its record will pause — read from the store as `planGate` is) — the count in the composer's notices row,
describing every continue that resumes them, on a `paused` session, on one a crash left `interrupted` and on one in
REQ-CHAT-008's recovery state, and "Continue without them" beside it, behind a confirmation. A session a crash left —
`interrupted`, or in the recovery state (`not-live` by REQ-GIT-093's predicate) — offers both continues and the decline
as a `paused` one does, and `Sessions.continueSession` accepts it, refusing a busy session whose process may still be
running it (`run-active`) and, first of all, one whose store has failed (`store-failed`, as `prompt` and `planDecision`
refuse it: a run ended on a recording failure reads `not-live` too, but did not crash, OQ-42); either choice records the
crash first, in `launchContinuation` (PD-ORCH-005 clause 18, OQ-103). The strip
keeps its one band, its two continues showing short labels as the send pill does — `Continue` and `Send`, named
`Continue run` and `Continue with a message` (`PD-CHAT-001` revision 4) — and draws them in the send pill's place on a
crash-left session too, which that revision prescribes only on a paused one (OQ-103's reading, confirmed 2026-10-06 by R-071 and stated by `PD-ORCH-005` clause 26, revision 6).
