# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — The restore, and the identifier question that is the sharp edge (continued)

Part 10 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

**And OQ-47's copied-folder direction is not closed by this.** The previous version noted that the same
dead end is reached from two independent routes — a restore into a re-cloned workspace, and two copies of
one folder — and that reaching it twice was evidence. ESC-26 answers the restore route only, deliberately
and in terms: the exception exists "only inside the restore action. No other path gains it — not workspace
open, not repair, not a migration, not a future convenience." A user who copies a folder and wants the copy
to have an identity of its own still has no product action, and OQ-47 stays open on that side *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): this behaviour ratified, the hand edit accepted for the first release)*.

**Then the target store.** Cases (a) and (b), and case (c) under outcome 3, all end holding the artifact's
identifier; case (c) under outcome 2 ends holding it without the workspace pointing at it, which changes
what the user is told and nothing about what follows here. A store for that identifier either exists on
this machine or does not.

**It does not exist.** The store directory is created and the artifact's contents written into it — the
same operation as an ordinary first open of an identifier, with contents. Nothing is displaced and there is
nothing further to decide.

**It exists, and merge is not offered at all.** `REQ-SESSION-201` forbids a restore that combines an
artifact with an existing store, and requires that neither a session present only in the target nor one
present only in the artifact changes state without that having been stated first. This record goes further
than "not silently": **there is no merge, silent or stated, and that is a decision rather than an
omission.** Session ids are never reused (`REQ-SESSION-012`), so two stores can only collide on a session
in exactly one situation — a backup and the store it was taken from, where the target has since recorded
*more* of the same sessions. Merging those means reconciling rows inside one session between two divergent
histories, and there is no correct answer: the result is a session neither the artifact nor the target ever
recorded, which is the requirement's own "an artifact that restores to a store no run could have left
behind", produced by the restore instead of by the backup. A merge would be a feature every use of which
is its worst case.

**So a restore is whole-store replacement, and the choice the user is given is what becomes of what is
there now — where the answer is never deletion.** The displaced store is **moved aside, renamed with a UTC
timestamp, and kept.** That is this record's existing rule — the application never deletes a store and
never repairs one in place — applied to a second operation, and under SR-9(b) it is not merely tidy: a
store the restore deleted is history that existed nowhere else, and the user was mid-recovery when they
lost it. Before confirming, the user is told: the artifact's workspace identifier, when it was taken, how
many sessions it holds, how many the target holds, that the target's store is set aside rather than
deleted and where it goes, and how many sessions will arrive needing repair (below). A user who restores
the wrong artifact has then lost nothing.

It also feeds a surface this record already owes rather than creating a new leftover kind: a displaced
store is a store nothing points at, which is exactly what the reclamation surface below exists to show.

**Lock rows are corrected on the way in, and ADR-0005 owns the rule.** `REQ-SESSION-201` requires the
backup to be valid while runs are live, so an artifact routinely carries lock rows for sessions that were
mid-run. Rows whose `host` is not this machine are **dropped**; rows naming this machine are kept. A
dropped row costs nothing: the session's `execution_status` still asserts a run, so with no lock it is
**stale** by `REQ-SESSION-057` and the ordinary explicit repair settles it to `interrupted`, which is what
in fact happened to it. Keeping them would instead make every such session report live and unreapable
forever on any machine but the original (`REQ-SESSION-056`, `REQ-SESSION-047`), needing
`REQ-SESSION-183`'s explicit release once per session. The count is disclosed in the pre-restore summary,
so the correction is stated and not silent.

**The swap, and the one window that is not atomic.** No connection may be open on **either** directory a
rename touches — not the one being renamed, and not the one being renamed onto. *(Corrected 2026-09-02. The
rule read "No connection may be open on the target while it is replaced", and that phrasing is precisely
what let the whole mechanism fail: the staging store is not the target until the rename it is blocking has
happened, so the rule was satisfied and the restore still could not complete. See step 7.)* The Windows
writer-handle spike is the evidence for files — a rename over a file with a held descriptor failed in every
one of 115 attempts, and here there are three such files (`workspace.db`, `-wal`, `-shm`) across two
processes. `../spikes/backup-restore-mechanism.md` is the evidence one level up: a **directory** holding a
single open handle cannot be renamed at all, 0 of 30 in every shape tried — a plain descriptor, a connection
in this process, a connection in another process, and a process's current directory alike.

**The order below is the mechanism, and several steps exist only because of where they sit. It has now been
run, and the three things it got wrong were all orderings and omissions rather than predicates. A
reordering that reads more tidily is the failure this section has already had.**

1. The workspace service tells the run host to **refuse new runs** against this identifier. Only that; the
   close is not asked for yet, because a close must not be asked of a run that liveness has not yet cleared.
2. **Liveness is judged, with the refusal in force** — gate 3's predicate, against the target store, on the
   workspace service's own still-open connection. If any session is live the restore is abandoned here, by
   4a, with nothing moved.
3. The run host **closes its connection** for this identifier and acknowledges (ADR-0002 consequence 11).
   The workspace service still holds its own.

   3a. **That acknowledgement is bounded, and the bound's expiry refuses the restore rather than
   proceeding without it.** *(Added 2026-09-02, defect D3.)* As written, steps 1 and 3 stated the
   acknowledgements and neither stated a deadline; measured twice — the run host deaf, and the run host
   exited without answering — the workspace service produced **no result and no error inside a 15,000 ms
   watchdog**, while the application kept running and a window kept painting. A user sees a restore that
   never finishes and never fails, which is the one outcome worse than a refusal. The bound is **2,000 ms**
   from the instruction being sent, which is three orders of magnitude above the acknowledgement's measured
   cost and is a deadline for a process that has stopped answering rather than a budget for a slow one.

   **Expiry takes 4a and nothing else.** This is the whole of the correction and it is not obvious: a bound
   alone makes the defect worse, not better. Measured with a 2,000 ms bound and the service proceeding on
   expiry, step 9's rename failed `EPERM` — because the connection the run host never closed is still open
   on the directory being renamed onto — so the restore failed later, after mutation, in the one place this
   mechanism has no good failure. **An unanswered close is indistinguishable from a run host still writing,
   and must be treated as one.** The refusal names the run host as unresponsive rather than naming a live
   session, because what is known is that the question was not answered.

   3a-measured. *(`../spikes/corrected-restore-rerun.md`, 2026-09-02.)* Against a run host that
   acknowledges the refusal and then ignores the close entirely, the bound terminated the action in
   **2,008–2,020 ms** in 10 of 10, **refused** in 10 of 10, left the target byte-identical in 10 of 10 and
   left no staging copy behind. Against the same condition without the bound, spike 22 measured no result
   and no error inside a 15,000 ms watchdog.

   3b. **The run host's refusal to start runs is a lease, not a state it enters.** *(Added 2026-09-02, the
   other half of D3.)* Step 4a releases the run host on a refusal the workspace service reaches, and that
   is not enough, because the measured dual failure has no workspace service left to reach it: kill the
   workspace service after step 3 and **the run host stays closed and refuses every launch for ever, with
   the store held by nobody and nothing in the sequence that would ever clear it.** So step 1's instruction
   carries an expiry the run host itself enforces — **30,000 ms**, generous against the whole action's
   measured 2.67 s at 313 MB — after which the run host resumes accepting runs on its own. The workspace
   service renews it if a restore is genuinely still running. The asymmetry is deliberate: a restore that
   takes longer than expected is renewed and costs nothing, and a workspace service that has died releases
   the workspace by doing nothing at all, which is the only behaviour available to a process that is gone.
4. **Liveness is judged a second time**, after that acknowledgement and before the workspace service gives
   up its own connection — which is the only place it can be judged, because judging it needs an open
   connection and step 5 closes the last one. **This is the evaluation the swap rests on.** Step 1's
   instruction is not instantaneous: until the run host acknowledges, launches are still being admitted, and
   a run admitted in that window holds a lock and is mid-write. Measured, that run's session and all of its
   rows were destroyed by the swap. Here it is caught instead, at a cost of 3.1 to 3.8 ms.

   4a. **If either evaluation refuses, the restore is abandoned before any mutation** — nothing renamed,
   nothing expanded, nothing written, the target store byte-identical — the refusal names the sessions found
   live, and **the run host is released**: told that it may accept runs again and, if step 3 has already
   closed it, told to re-open. The release is not optional and is not tidiness. A run host left closed and
   refusing is a workspace in which no session can ever start again, with the store held by nobody and
   nothing in the sequence that would ever clear it; that state has been measured, from the other direction,
   and it persists for the life of the instance.
   4-measured. *(`../spikes/corrected-restore-rerun.md`, 2026-09-02, discharging IC-1.)* A run admitted
   inside step 1's window, taking its lock **after** step 2 had already passed and before step 3
   acknowledged — the exact position of the run spike 22 measured being destroyed. **The second evaluation
   caught it in 30 of 30**, at 0.23 / 0.42 / 1.27 ms; the restore abandoned in 30 of 30; the sessions
   already in the store were unchanged in 30 of 30; no displaced store and no staging copy were left behind
   in 30 of 30; **the raced session and every row it had written survived in 30 of 30**; and step 4a's
   release returned the run host to accepting runs, with its store re-opened, in 30 of 30. **The
   counterfactual is what makes this evidence**: the identical race against the mechanism with step 4
   removed completed the restore in 10 of 10 and destroyed the raced session and all of its rows in 10 of
   10. Step 4 is not defence in depth; it is the step that does the work.

   3b-measured. *(`../spikes/corrected-restore-rerun.md`, 2026-09-02.)* With the run host told to refuse,
   its store closed, and the workspace service then dying with nothing left to release it: a launch was
   refused while the lease held in 10 of 10, **accepted once the lease expired in 10 of 10**, and the run
   host re-opened the store by itself in 10 of 10. Spike 22 measured this state persisting for the life of
   the instance. The lease is the exit.

5. The workspace service **closes its own connection**. Both closes are now acknowledged and nothing has
   moved.
6. The artifact is expanded into a sibling staging directory in the same parent, in full, and **arranged
   into the store's own layout there** — the container's names are the container's and the store's names are
   this ADR's, and step 9a states what that conversion covers. The expanded store is then **opened
   read-write once there** — which performs any log recovery and lets the integrity check run against the
   thing that will actually be used rather than against the copy inside the container. That reason is
   unchanged, and it is why the open is deliberate rather than incidental. *("In full" originally stood
   alone here and step 9 renamed the result into place; read exactly as written that installs the
   container's layout as the store's. See step 9.)*
7. **The staging connection is closed.** *(Added 2026-09-02. Without this step the restore fails in 30 of 30
   attempts and the feature does not work at all.)* Step 6's open is what makes step 9 impossible: staging is
   the directory step 9 renames, and on this platform a directory holding an open handle cannot be renamed —
   `EPERM`, 30 of 30, against 30 of 30 succeeding with the connection closed first. This is ADR-0004 rule 1
   one level up: replace-by-rename "fails against *any* open handle on the target", and the reason the rule
   above did not reach it is that staging is not the target yet. The close is also what makes the directory
   renameable rather than merely tidy — measured, an open store directory holds `workspace.db`, `-shm` and
   `-wal`, and only after a clean close does it hold `workspace.db` alone. **This step is not hygiene and
   not redundant with step 5. Deleting it as a duplicate close reproduces, exactly, the defect that made this
   mechanism fail every time it was run.**
8. `<identifier>` → `<identifier>.displaced-<UTC timestamp>`. **The timestamp is milliseconds, and the
   rename onto that name is itself the claim.** *(Granularity stated 2026-09-02, defect D6; the claim
   corrected from "an exclusive create" on the same date after measurement.)* At second granularity two
   displacements inside one second collide and this step fails `EPERM` in **30 of 30** — a one-word omission
   that stops the mechanism dead. Milliseconds do not make a collision impossible, so **the granularity is
   not the guarantee**: where the rename fails because the name is taken, a decimal counter is appended and
   the claim retried, up to a small fixed number of attempts, after which the restore is refused with nothing
   moved. **A name assumed unique is not unique**, and this is the same rule ADR-0004 applies to any other
   name the product mints. **No separate create is needed and none should be added** —
   `../spikes/corrected-restore-rerun.md` measured that a directory cannot be renamed onto an existing
   directory here, so the rename fails on a taken name rather than merging into it; writing this as a create
   invites a create-then-rename pair, which has a gap between its two halves that the single rename does not.
   **The counter is the load-bearing half.** Forced to collide, the corrected name needed the counter in
   **30 of 30** and kept both displaced stores, openable and distinguishable; the pre-correction name —
   second granularity, bare rename, no counter — failed `EPERM` in **30 of 30** and lost a displaced store
   every time. The
   stamp's granularity binds every name of this shape in this record, not only this one: the recovery
   ladder's displaced store and the reversal's `.obstruction-` aside both reuse it deliberately, so it is
   fixed once here and inherited rather than restated three times and drifting.
9. staging → `<identifier>`. **What is renamed is a store in the store's layout, which is not the layout the
   artifact carries.** *(Corrected 2026-09-02, defect D7.)* Step 6 said the artifact is expanded "in full"
   and this step made the expansion the store, which — read exactly as written, and it was — produces a
   restored store holding `store.db` where the layout block fixes `workspace.db`, with `manifest.json`
   sitting inside the live store after every successful restore. The container's layout is the container's,
   the store's layout is fixed by this ADR, and **the restore converts between them rather than assuming
   they are the same**: staging is arranged into the store layout before this rename, the manifest and
   anything else belonging to the container stay outside the store, and the rename installs a directory that
   is already a valid store. The measured harness had to insert this conversion as an unspecified step to
   proceed at all, which is the plainest possible evidence that the record was missing one.

   9a. **`origin.txt` is written by the restore, because it is correctly not in the artifact.** The store's
   record of which project it belongs to is machine-local metadata and the backup is right to exclude it —
   but nothing put it back, so it was absent from **every** restored store, and it is the reclamation
   surface's only means of saying which project a store belongs to. A restore that produces a store the
   reclamation surface cannot describe has produced an orphan on the recovery path. It is written from the
   workspace the restore was initiated for, before step 9's rename, so the installed directory is complete
   at the moment it becomes the store.
10. Both processes re-open; migrations run in the workspace service exactly as at any other open; the run
    host is told the workspace is open again and may accept runs.

**Steps 8 and 9 are two renames and no platform offers a primitive that makes them one. The record says so
rather than implying atomicity.** What a reader observes between them is that the store directory is
**absent** — now measured, in 20 of 20 observations that caught the gap, which is 3 to 5 ms wide at every
store size from 68 KB to 313 MB, and never once anything mixed — and this record already fixes what that
means: a workspace for which this machine holds no store lists no sessions, which `REQ-SESSION-043` makes an
ordinary state and not an error. So the worst observable in the gap is an empty list, in a window whose
store is closed anyway; it is not a corrupt store and not a half-restored one, which is what the requirement
actually forbids.

**A process cut in the gap, and the journal that names it.** *(Added 2026-10-14, [OQ-266](../../open-questions/57-spikes-and-later-questions-24.md#oq-266)
ruled 2026-10-13 under R-072; the paragraph above holds for a restore that reaches step 9, and the 2026-10-13 measurement in
"Not exercised" below is what it did not cover.)* The gap is milliseconds for a restore that runs on, and indefinite for a
process that dies in it: the next open met an empty target name and created a fresh store there, 10 of 10. So the restore
writes **`<identifier>.restore-pending`** after 9a and before step 8 — `{stamp, stagingN, targetExisted}`, replaced where a
stale one is there, the file and its directory flushed — and removes it once step 9 has succeeded (before the run host is told
to reopen) or the R1/R2 reversal has; a failed R2 keeps it. A journal that cannot be written fails the restore before step 8 as any failure that leaves the store as it was
(the staging copy discarded, OQ-265), and one that cannot be removed is left, harmless beside a present store, for the next
open to remove *(both added 2026-10-14 by fin43's review, which found the write and the removal escaping `restoreStore` as
rejections)*. **The workspace service's next open acts on it before anything is
created** (`recoverCutRestore`, `packages/store/src/recover.ts`, from `openWorkspaceStore`): a journal beside a present store
is a restore that finished, or a stale journal, and is removed with nothing touched; a journal beside an absent store puts back
the highest `<identifier>.displaced-<journal stamp>[.n]` where there was a store before, and otherwise lets the ordinary
creating open follow; nothing from the backup is applied either way, the staging copy stays where it is, and the user is told
once (`workspace.opened`'s `cutRestore`, raised by main as an info notice). A rename back that fails keeps the journal and
refuses the open with both paths, creating nothing. While the service's own restore is in flight its opens skip the check and
refuse rather than create beside the journal. **This is not a restore run by itself** — the rule below is untouched: the open
reverses step 8, which is REQ-SESSION-201's failure clause carried out, and installs nothing from any artifact.

**The reversal, rewritten 2026-09-02, because as written it failed in exactly the case it exists for.** If
step 9 fails after step 8 succeeded, step 8 is reversed before the failure is reported. This record
previously made that reversal a single rename of `<identifier>.displaced-<stamp>` back to `<identifier>` —
and step 9 has two failure families: a handle held inside staging, which leaves the target name free, and
**an occupied target name**, which does not. In the second family the reversal renames onto the very name
whose occupancy failed step 9, and it fails with the identical error. Measured, `EPERM` both times, and the
end state was a store directory holding no database, the real store sitting under a timestamped name, and
the workspace service's re-open throwing `unable to open database file`. **This record had written "if the
reversal also fails" as though it were a rarer, independent event. It is neither: on this platform the two
failures are the same failure, and the family that guarantees both is half the failure space.**

**So the reversal takes the same displace-then-rename shape the forward path already needs on this
platform.** It is two renames for the same reason steps 8 and 9 are two:

  R1. If `<identifier>` exists, it is renamed aside to `<identifier>.obstruction-<the same UTC timestamp
  step 8 used>`. The same stamp deliberately: the two leftovers of one failed restore are then legible as a
  pair, and the reversal mints no second name whose freshness would have to be argued separately. The
  obstruction is kept, never deleted — the product does not know what it is, and this record's rule that the
  application never deletes a store applies with more force to a directory it cannot identify.

  R2. `<identifier>.displaced-<stamp>` → `<identifier>`, which now renames onto a name that does not exist,
  and a rename onto a free name succeeded in 30 of 30 attempts.

**The rule this is an instance of, written out because it generalises past this mechanism: a reversal must
be at least as robust as the step it undoes.** A reversal that works only when nothing went wrong is not a
reversal — it is a second copy of the failing step, sharing its assumptions, and it will be exercised for
the first time on the one day it is needed. Anything added to a forward path to survive this platform
belongs in the path that undoes it.

**The reversal has now been run against the case it exists for, and it holds.**
*(`../spikes/corrected-restore-rerun.md`, 2026-09-02, discharging IC-1.)* With the install rename forced to
fail on an occupied name — the family in which the old reversal failed with the identical error —
displace-then-rename returned the target store **byte-identical in 30 of 30**, re-openable in 30 of 30, and
reached a store directory holding no database in **0 of 30**. R1 cost 3.15–3.75 ms and the whole reversal
6.43–7.36 ms. The counterfactual was run in the same harness: the single-rename reversal failed `EPERM` in
10 of 10 and reached the forbidden end state in 10 of 10, with the error naming both paths each time. **Two
leftovers, not one, were observed on every corrected run**: the `.obstruction-` aside this reversal mints,
which is intended and kept, and the staging copy, which is defect D5 and is still open. *(2026-10-14, [OQ-265](../../open-questions/57-spikes-and-later-questions-24.md#oq-265)
as ruled under R-072: a reversal that puts the store back now deletes the staging copy; only the `.obstruction-` aside is left,
and E2 asserts both. A reversal that fails keeps the copy and lists it.)*

**And the end state that must not be reachable, named so that it is testable: a store directory that exists
and holds no database.** The old reversal produced precisely that, in 20 of 20 observations, and it is not a
gap of milliseconds but the durable state the user is left in — it survives the failure, the re-open and the
restart. `REQ-SESSION-043` fixes what an *absent* store directory means and no requirement fixes what a
present, empty one means, so every reader in the product would meet a state nothing describes and nothing
was written for. R1 removes it: after a reversal the store directory either holds the store or does not
exist, and those are the only two states this record admits.

**The last resort survives untouched, because it is what stands between a failure and a lost store.** If R1
itself cannot run — the obstruction holds a handle of its own — the failure names both directory paths so a
person can finish a rename the product could not. That text was specified before it was ever run, it worked
when it was, and it was the only reason the measured end state was recoverable by hand at all.

**Two things a restore never does.** *(2026-10-14: the open-time reversal of a cut restore, above, is not one — it applies
nothing from an artifact and only undoes step 8.)* It never runs by itself — not at startup, not on finding an artifact,
not as a repair, and **not as a step of the recovery ladder below**, which may *name* it as a remedy the
user can choose but may never perform it. And it never reads an artifact except as part of a restore the
user asked for, so nothing scans for artifacts or offers to use one it noticed.

**And one thing nothing else in the product may ever do, which is the containment ESC-26's exception rests
on.** *No other path establishes a workspace identifier over one the product can read.* Not workspace open,
not the repair action, not a schema migration, not the recovery ladder below, not the reclamation surface,
not a store-not-found condition, and not a later convenience that would "just fix it up". Case (b)'s
exclusive-create mint stays available everywhere, because it replaces nothing; **replacement is confined to
one confirmed choice inside one user-initiated action.** This is written as a prohibition on the rest of
the product rather than as a permission for the restore, because that is the direction it will be tested
in: the next reader meets an identifier that does not match a store they can see and reaches for the write
that would resolve it, and the answer is no, everywhere but here. The reason is the one ESC-19's survey
supplies — three comparable products carry a filed, reproduced, painful defect where a folder rename
orphans a user's sessions, and `REQ-SESSION-197` is what keeps this product out of it.
