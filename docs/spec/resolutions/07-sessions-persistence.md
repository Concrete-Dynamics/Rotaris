---
reference: ROTARIS-CRW-001
domain: sessions-persistence
date: 2026-08-30
status: resolved
---

# Open-Question Resolutions — Session Persistence, Resume, and Background Sessions


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 1** — "the bound already stated is the whole contract… at most twelve debounced writes per
>   minute". The debounce is **withdrawn** (REQ-SESSION-067): a save is durable when requested, nothing is
>   deferred behind a timer, and there is no write-volume bound because none is needed. The reasoning here
>   is now historical.
> - **OQ 8** — the row bound, the page size of 50 and the 8000-character `full_detail` cap all stand;
>   `state/transcript_archive.jsonl` does not (REQ-SESSION-131, REQ-SESSION-192). The `full_detail` cap now
>   exists so a single tool row cannot grow a session's record without bound, not because every save
>   rewrote a whole transcript file.
> - **OQ 9** and the legacy-layout-removal table — "`state/resume.json` is the only resumable-state file"
>   is now "the stored resumable state is the only resumable state" (REQ-SESSION-037). The disposition
>   holds; its wording names files that no longer exist.
> - **OQ 12** — the three-way configuration-snapshot resolution is preserved exactly, but is stated in terms
>   of `state/resume.json`, `state/run_config.json` and diagnostics initialization. Read it against
>   REQ-SESSION-138's launch audit. One live inconsistency it does **not** settle: REQ-SESSION-016 says the
>   audit is recorded "at session start" and REQ-SESSION-138 says once by run startup after worktree
>   binding and the sandbox verdict. OQ 12 sides with 138; the two requirements still disagree.
>   >
>   > **Closed 2026-09-01. They no longer disagree, and OQ 12's disposition is what the specification
>   > implements.** REQ-SESSION-138 is the sole owner of *when* the launch audit is recorded;
>   > REQ-SESSION-016 cites it and holds only the two-place recording, the five facts, their defaults,
>   > the moments each is stamped on the session **state**, and the no-backfill rule. Reading both
>   > requirements did not merely break the tie, it removed it: "at session start" is unsatisfiable,
>   > because two of the five facts — the sandboxed flag and the sandbox backend name — are not
>   > knowable until the sandbox verdict of REQ-SESSION-086, and because REQ-SESSION-138 with
>   > REQ-SESSION-132 already establish that a session created but never run carries no launch audit at
>   > all. That argument is now recorded inside REQ-SESSION-016 so the question cannot be reopened on a
>   > reading of the words alone. REQ-SANDBOX-108's citation of the pair stays valid and is better
>   > supported than before.
> - **OQ 3** and **OQ 13** — the `host` field and the reap-equals-liveness identity survive, but the record
>   says "lock file" and "parses as JSON" (now: carries the three fields with their stated types). Its
>   reasoning that a foreign-host lock is the ordinary consequence of a shared filesystem is **superseded by
>   ESC-15**, which makes the store machine-local: a foreign-host lock is now evidence of a fault.
> - **OQ 23** and the graphical-only sweep row for **REQ-SESSION-099** — "the raw stored lines remain
>   obtainable byte-identical". Now: obtainable as the plain event stream, one event per line, every field
>   preserved, readable by a stock parser on a machine with none of this product's code (REQ-SESSION-189,
>   REQ-EVENTS-166). The guarantee is stronger, not weaker; it moved from the write path to the export.
> - **OQ 7**'s correction note says REQ-SESSION-196 "completes the snapshot from stored `transcript.row`
>   events". That completion step is **retired**, because no save is deferred and so no recorded row is
>   missing from persisted state. The entitlement list is unchanged.
> - The **Outcome** paragraph's claim that nothing remains outstanding for the product owner in this domain
>   is still true of the original open questions, but is no longer true of the domain: see the concerns
>   raised against SR-5's near-unreachable refusal path, the backup profile of a machine-local store, and
>   the loss-of-identifier case, none of which the original questions anticipated.
>   >
>   > **The backup concern is discharged as of 2026-09-01.** SR-9(b), re-affirmed by **ESC-19**, is
>   > applied as two new requirements. REQ-SESSION-200 owns the **disclosure**: the product itself states
>   > that backing up, copying, cloning or synchronising a workspace does not carry that workspace's
>   > session history, names what is outside such a backup and what is carried, says where the two
>   > remedies are, and may not be delivered only inside a failure or remediation message — a user who
>   > has already restored a workspace and found no history in it has been told too late. REQ-SESSION-201
>   > owns the **whole-store backup and restore**: one artifact covering the store and the per-session
>   > files held with it, valid while runs are live, restored only when explicitly asked for, never
>   > silently merged, refused while any session in the target store is live, and carrying the workspace
>   > identifier it was taken from. ESC-19 **refuses** the configurable store location, so ADR-0058's
>   > location decision does not reopen.
>   >
>   > Backups and exports are deliberately different artifacts and both requirements say so: an export
>   > is a record rendered so that software knowing nothing about this product can read it, and is what
>   > discharges REQ-EVENTS-166; a backup is the store rendered so that this product can put it back.
>   > REQ-SESSION-199 gained the matching clause from the export side, so a reader arriving there cannot
>   > conclude the exports already cover the gap. The SR-5 and identifier-loss concerns are unchanged
>   > and remain open.


> ## Amendment, 2026-09-02 — the third store state, and REQ-SESSION-201's refusal made durative
>
> The restore half of REQ-SESSION-201 was executed for the first time. Two requirement gaps it exposed are
> closed here; a third reading is confirmed and left alone. **No disposition above is reversed**, and the
> whole-store backup and restore stands as SR-9(b) and ESC-19 established it.
>
> **A third store state is named, and REQ-SESSION-202 is minted for it.** REQ-SESSION-043 fixed two
> states — a store holding no sessions, and no store at all — and both answer with an empty list. A third
> exists and persists until something resolves it: **the place this machine keeps the store exists and the
> store is not in it.** It is now **a store that could not be opened**, never an absent one. Runs are
> refused on REQ-EVENTS-084's terms through REQ-SESSION-089 and REQ-SESSION-198, the listing reports the
> condition instead of asserting emptiness, and the report says what was actually found, because there is
> no store present to give a reason of its own and REQ-SESSION-089's unaltered store reason must not be
> invented for it. The product may neither create a store there nor resolve the state on its own; an
> action that establishes a new store there is one the user takes deliberately, having been told what was
> found and that it recovers nothing.
>
> **Why refusal and not the empty list.** The harm is asymmetric and only one direction is undoable. An
> empty list is a positive claim that this workspace has no history on this machine; made wrongly it is
> the exact failure REQ-SESSION-200 exists to stop a user discovering too late, and the store the product
> would then create in that place orphans whatever the old one was recorded under. Refusing costs a user a
> stated condition with an action attached. The domain already decides this way one level up:
> REQ-SESSION-197 never mints over an identifier it can read and reports one it cannot as a condition to
> resolve. The same rule now governs the store that identifier names.
>
> **It is REQ-EVENTS-179's family and answers the same way, deliberately rather than by luck.**
> REQ-EVENTS-179 governs a store that opens, reports itself usable and then fails, and resolves it into
> REQ-EVENTS-084; REQ-SESSION-202 governs a store that is not there, and resolves into the same place. The
> two are stated as one family because **REQ-EVENTS-179's check cannot reach this case**: an operation
> that reads and writes the store's own contents is answered perfectly by an empty store the attempt
> itself brought into being, so an absent store passes a check built to catch a store that does not work.
> What must be established before a store is used is therefore not only that it works, but that it is the
> store this machine already had.
>
> **REQ-SESSION-201's refusal-while-live clause did not hold through the restore, and now does.** The
> predicate was never the problem. "A restore MUST be refused while any session in the target store is
> live" was satisfiable by an implementation that answered the question once, at the request, and then
> proceeded — so a session that became live afterwards could be replaced by the action, and what became of
> it could not have been an outcome the user chose, because the user was never told it existed. The clause
> now binds from the moment the question is answered until the restore completes or is abandoned, and a
> restore that finds a session has become live in that window is refused rather than carried through.
> Which end of the window is closed — putting the refusal of new runs in force before the question, or
> re-asking the question once that refusal is in force — is left to the implementation; what is fixed is
> that no run may be admitted into the gap between them. A second clause forbids the step that precedes
> the loss rather than only the loss: **a restore MUST NOT stop, cancel, interrupt or require a live run
> to give up the store it is recording into.** The backup's obligation not to disturb a run now has its
> counterpart on the restore side, whose remedy for finding a live session is to refuse, never to clear it
> out of the way. A run asked to stand aside and then replaced has been destroyed by the restore whether
> or not it complied.
>
> **The silence on the restore's duration is confirmed, and is now stated as deliberate.** No bound is
> owed, because by the strengthened clause nothing in the target store is live for the restore's duration
> to disturb; the backup carries timing obligations only because it runs while sessions are live. The
> strengthening makes that premise firmer rather than weaker, so the reading survives the change. It is
> recorded inside the requirement so that a later reader cannot mistake it for an omission, and cannot
> read it in the other direction as permission for a restore to run alongside a live session.
>
> **One note this domain should carry.** These gaps were not in what the requirements say but in *when* an
> obligation is evaluated and in *which states* a requirement enumerates. Neither is visible from reading
> the words; both appeared the first time the mechanism was run. A clause that has never been executed is
> not thereby wrong, but it is not evidence of sufficiency either, and this domain has now been corrected
> that way twice — REQ-SESSION-089's REQ-EVENTS-179 boundary, and these two.


This record disposes of every open question raised in the draft of
[`../07-sessions-persistence.md`](../07-sessions-persistence.md) (domain 07, requirement prefix
`REQ-SESSION`), and records the graphical-only sweep applied to that draft before the questions were
answered. The body of that specification has been amended so that each decision below is stated
normatively in place; the numbering of the original open questions is preserved here so the draft
and the resolved specification can be read against each other.

The following product-owner decisions of 2026-08-30 governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   that is more coherent with the rest of the document; where no coherent reading exists, the
   behavior is withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface, no
   headless entry point, and no terminal user interface. Domains 17 and 18 are retired.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, or a parseable output
   format).

New requirements added by these resolutions: **REQ-SESSION-182** through **REQ-SESSION-196**. No
requirement identifier was renumbered, reused, or deleted.

## Parts

Since 2026-10-26 the rest of this document is in [`07-sessions-persistence/`](07-sessions-persistence/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](07-sessions-persistence/01-graphical-only-sweep.md) | Graphical-only sweep; Legacy-layout removal |
| [02](07-sessions-persistence/02-cross-domain-schema-reconciliation.md) | Cross-domain schema reconciliation |
| [03](07-sessions-persistence/03-dispositions.md) | Dispositions |
| [04](07-sessions-persistence/04-outcome.md) | Outcome |
