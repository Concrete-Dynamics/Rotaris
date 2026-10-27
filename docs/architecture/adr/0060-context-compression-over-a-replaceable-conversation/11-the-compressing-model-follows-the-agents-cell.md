# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — The compressing model follows the agent's cell — 2026-10-02 (fin10)

Part 11 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## The compressing model follows the agent's cell — 2026-10-02 (fin10)

*The repair of [`the-root-compresses-on-the-model-its-turn-started-on-after-its-cell-moves.md`](../../../defects/fixed/the-root-compresses-on-the-model-its-turn-started-on-after-its-cell-moves.md).
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
[`../first-executions.md`](../../first-executions.md).

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

*Ruled 2026-10-06 (OQ-189, [R-071](../../../product/requests.md#r-071), [`PD-MONITOR-007`](../../../product/directives/pd-monitor-007.md#pd-monitor-007)),
reported back in place; the sentence above that a configured `compressor.model` "is still called as configured" is kept as it
was written and no longer holds.* A configured compressing model is now a helper call: it is resolved through the session's
overrides at each pass (`Run.helperModel`, `helperChoiceOf`), and where the pair it ends on is held out of quota the pass
compresses on the agent's own model (`compressing` in `Run.compressionFor`), REQ-MONITOR-080's default. `withheld` is read for
whichever model the pass would call, so a manual pass whose configured compressor and agent pair are both excluded makes no
call and fails naming both (before: `if (c.model) return null`, and the configured pair was called). Measured in
`ladder.test.ts` (a configured compressor held out of quota yields to the root's own model; one following a wait choice's
override; a manual pass with both excluded calls nothing, red with the old guard) and by `compression-proof`'s
`after-a-move` scenario (the compressor's model `scripted/beta`, before `scripted/alpha`).
