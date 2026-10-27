# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Execution — 2026-10-13: a proposed technical requirement is accepted from the review

Part 16 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Execution — 2026-10-13: a proposed technical requirement is accepted from the review

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`accept-proposal-and-accept-change-work-refuse-citing-oq-45-which-closed-on-2026-09-11.md`](../../../defects/fixed/accept-proposal-and-accept-change-work-refuse-citing-oq-45-which-closed-on-2026-09-11.md)
(fin41).*

**What the record said and what was true.** Both actions were refused with "needs the improvement store, which has no
owning decision yet (OQ-45)". OQ-45 closed on 2026-09-11 (ADR-0061), the improvement store was built on 2026-09-14, and
neither action needs it: `accept-proposal` writes into the requirement source, and `accept-change-work` needs the
change-analysis offer of REQ-TRACE-411..413. The "Not built here" passage of the second execution is corrected in place.

**`accept-proposal`, built.** It travels the board's one write path, `requirements.act`, on the reviewed requirement with
`payload {proposal: <position in the run's file>, title}`. `decide` admits it only in `review`, as a record that moves
nothing, and only with a proposal named. The writer's `beforeCommit` slot carries the write, between that admission and
the commit, so the act of acceptance is what causes it (REQ-TRACE-429), and a refused write records nothing and leaves the
requirement where it was (REQ-TRACE-432). The workspace service's `acceptProposal` re-reads the proposal from the file,
refuses one that is not there, reads differently or was already accepted, and refuses a read-only store in the probe's
words. It then writes a `type: technical` document through `requirements.source.write`'s units (`nextIdentifier`,
`createLocation`, `composeRequirementDocument`, `writeSourceDocument`) with `derived-from` naming the proposal's origin,
or the reviewed requirement when the proposal names none the store holds. *Corrected at the bundle's review, 2026-10-13:
the review first named and confirmed the run's own `derivedFrom` while the write linked the reviewed requirement whenever the
store did not hold that id, so the confirmation stated a link the write did not make. The payload's proposals now carry
`origin`, the link the write makes, and the review names and confirms that one, with the run's naming beside it
(`accept-proposal.test.ts`'s and `panes.test.ts`'s REQ-TRACE-428/429 origin cases, red on the code before).*
`requirements.human_in_the_loop.confirm_source_writes` is not read (REQ-TRACE-431). `BeforeCommitOutcome` gained `reason`, so the history and audit entry name the identifier the
write created. The pass then re-reads the store and records a `create` on the new requirement.

**Already accepted is read from the store, not from the history.** The review's payload marks each proposal `acceptedAs`
when a technical requirement with its title that derives from its origin exists. History retention prunes, and a
proposal offered twice would write two requirements. The review pane offers one `Accept "<title>"` control per proposal
still only proposed, below REQ-TRACE-428's sentence on how an execution unit and a technical requirement differ, and
confirms it with the review's own confirmation dialog. Pinned by `transition.test.ts`, `accept-proposal.test.ts` (the real
service, store and traceability engine over the fixture store) and `panes.test.ts`, each red on the code before.
`accept-change-work` is refused naming REQ-TRACE-411/412's offer and staleness guard, which this build does not make.
