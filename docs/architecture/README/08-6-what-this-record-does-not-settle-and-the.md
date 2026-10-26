# Rotaris-crw — system architecture — 6. What this record does not settle, and the Architecture Gate verdict

Part 8 of 13 of [the architecture README](../README.md), which indexes every part.

## 6. What this record does not settle, and the Architecture Gate verdict

> **THE GATE CLOSED ON 2026-09-03 AND IMPLEMENTATION IS AUTHORISED, BOUNDED.** This section is the verdict
> the gate was decided on and it is kept as it stood, because a decision is only readable against what it
> was given. The decision itself is [`../clean-room/architecture-gate.md`](../../clean-room/architecture-gate.md)
> and the five rulings are **GD-6 to GD-10** in [`owner-decisions.md`](../owner-decisions.md). What they changed
> in this record: the three closures that rested on argument are bound as **IC-4, IC-5 and IC-6**; the
> unstarted spikes are bound to the work each prices, with spike 8, spike 18 and the power-loss test named
> as the ones a build reaches first; **ADR-0058 now states its own open defects** in a new consequence 18,
> and its consequence 5 tabulates all five leftover shapes where it had been tracking three; and the
> first-execution recording rule is standing policy, in section 5 above.

**The specification is done, every owner escalation is ruled, and the architecture has caught up on
evidence but not on obligations.** All thirty-one escalations have landed in `docs/spec/`, and every one of
the 1,214 requirement identifiers the ADRs cite resolves — re-checked mechanically after this round, against
a corpus of 4,397, with **zero dangling citations**. **What changed on 2026-09-02, across three
measurement rounds, is not the balance of work outstanding but which side of the record carries it.** Five
spikes reported. Every owner ruling survived. Several records reached the right conclusion by reasoning the
measurements have since disproved, and those reasons are corrected in place with the falsified claim kept
beside its replacement, because a record whose conclusions are right and whose reasons are false is a record
that gets "simplified" back into the defect by the next reader. **And the last of the five ran a mechanism
this record had decided and never executed, and the mechanism did not work at all.**

**Read the next five sections as one thing.** A list of outstanding items reads as a list of equal debts,
and the gate turns on distinctions that such a list destroys: **what is a defect a builder would inherit**;
**what measurement is still owed and whether any of it is a gate condition**; **what needs a build host
rather than reasoning**; and **what is an owner's decision**. Implementation is authorised off the back of
this verdict, so an optimistic verdict costs more than a pessimistic one. All four categories are stated
separately below, **nothing is moved between them for tidiness**, and a fifth section states the one finding
that spans them: **four mechanisms decided on paper have now been built for the first time, and every one
of the four contained a defect no reading had caught.**

### The escalations: twenty-nine ruled, two answered by amendment, NONE open

***This heading previously read "twenty-two ruled, two answered by amendment, seven open" and that is
withdrawn.*** **ESC-1 to ESC-22, ESC-24 and ESC-26 to ESC-31 all carry a decision** in
[`owner-decisions.md`](../owner-decisions.md), alongside nine structural rulings SR-1 to SR-9, and the
amendment passes those rulings authorised **have landed**. The seven this section listed as open —
ESC-22, ESC-24 and ESC-27 to ESC-31 — were **ruled together on 2026-09-02** and all seven are applied:
`REQ-MONITOR-306` bounds the aggregate terminal-frame rate, `REQ-SHELL-169` refuses a launch inside the
force-exit allowance, `REQ-CONFIG-216` fixes `secrets.yaml` at `0600` explicitly on every write,
`REQ-CONFIG-183` reports and carries on for a withdrawn key in either scope, `REQ-LIBRARY-047` with
`REQ-LIBRARY-176` makes a never-recorded version distinguishable from a pruned one, and `REQ-TOOLS-079`
puts the permission-audit identifier in the entry. **ESC-31's architecture consequence is thereby
discharged**: ADR-0024's choice of what identifies a permission-audit entry is no longer
permitted-and-unblessed, and the ground is `REQ-EVENTS-056`'s obligation that a locator resolve through the
export on a machine carrying none of this product's code.

**ESC-19, ESC-20 and ESC-21 were ruled against comparative evidence**, at the owner's direction, by
examining how seven other coding harnesses solve the same problems. That comparison is in
`owner-decisions.md` with its sources and it is evidence this record may use. Three of its findings bear
on decisions already taken: machine-local session storage is **universal** — not one of the seven keeps
history inside the user's project, so ESC-15 is the field's position rather than a deviation; a store
engine is the **majority and the direction of travel**, with three of the four users having *migrated to
it*; and the path-keyed products have a **documented, filed, painful bug** this record already avoided,
one report recording 63 sessions lost across 10 projects after a reorganisation and even a change of a
folder name's case orphaning everything. That last is a decision to protect against a later
simplification, not to revisit.

**ESC-23 and ESC-25 needed no ruling in the end, and ESC-25 was answered against what this record
argued.** ESC-23's antecedent is restored: `REQ-CONFIG-288` now *takes* ESC-1's decision in its own voice
rather than stating the coupling in the present tense, and `REQ-CONFIG-423` now says a change to the
permission mode made "by **any** other surface" lands in the pending settings state — the dependence on
the shared save path is gone. ESC-25 argued that `REQ-STARTUP-152` and `REQ-STARTUP-035` made a detached
signature file unpublishable, so the signature had to live inside the manifest. **The specification took
the third option and amended both requirements individually.** `SHA256SUMS.txt.sig` is now a published
asset; `REQ-STARTUP-122` fixes verify-then-parse so untrusted bytes reach no parser of ours; and
`REQ-STARTUP-168` holds rotation in the **build** as a key set, decided at the release gate, which is the
operational commitment ESC-25 asked the owner to see stated.

**ESC-26 is ruled, applied, and is the largest single thing that changed in this round.** It asked whether
the workspace identifier may ever be re-established. The answer is one narrow exception, bound by five
conditions, available only inside `REQ-SESSION-201`'s restore and nowhere else; `REQ-SESSION-197` carries
the whole of it and `REQ-SESSION-201` carries a pointer, because a contract has exactly one home. The
recovery journey ESC-19 minted the backup for — machine dies, clone the repository, open it once, restore
the backup — now completes without a hand-edited file. What it does **not** do is give a user with a copied
folder any product action, and that half of OQ-47 stays open on purpose *(ruled 2026-10-06,
[R-071](../../product/requests.md#r-071): ADR-0058's behaviour ratified, the hand edit accepted for the first
release)*.

**No escalation is open.** The seven bullets that stood here, each stating an open question for the owner,
are removed rather than kept as tombstones, because every one is answered by a requirement and
[`../clean-room/specification-gate.md`](../../clean-room/specification-gate.md) carries what each amendment
says, clause by clause. Two of the seven are worth naming here because they changed something this record
had leaned on. **ESC-22's bound is now `REQ-MONITOR-222`'s condition rather than a smoothness concern**:
1,000 frames per second **in aggregate**, counted per delivery so a stream shown in two windows counts
twice, not widenable and not configurable unless `REQ-MONITOR-222` is re-measured at the new rate — which
closes the one place a conformance budget rested on a user-writable key with no ceiling. **ESC-28 and
ESC-29 were ruled *report and carry on***, which is a deliberate departure from `REQ-CONFIG-183`'s hard
load failure for an unknown key, on the ground that a key the product itself invited a user to write must
never make their workspace unopenable — and in the global scope would make *every* workspace unopenable at
once, from one line, with no surface of the product reachable to repair it.

### THE GATE VERDICT

*Rewritten 2026-09-02 after the restore measurement. **Four categories. Nothing is in more than one and
nothing has been moved between them for tidiness**, because the gate turns on exactly the distinctions such
a move destroys: what is a **defect** a builder would inherit, what is a **measurement** nobody has taken,
what needs a **build host** rather than reasoning, and what is an **owner's decision**. The one question the
gate turns on is answered at the end and it is answered **no**.*

*A structural change a returning reader should see. The previous version of this section had four lists and
one of them was "unmeasured architecture", whose entire content was spike 22. **That spike has been run and
the mechanism it measured did not work**, so the category is empty and what came out of it is distributed
into A and B by kind. **The balance has moved**: the specification side is now nearly clean and the
**architecture** side carries the build-wrong defects, which is the reverse of every previous round.*
