# Open questions — Spikes, and the questions raised since (24 of 35)

Part 57 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-265 – OQ-267, OQ-272.

<a id="oq-265"></a>

**OQ-265 — May the restore delete its own staging copy, without OQ-48's surface?** *(REQ-SESSION-201, whose "a restore
that fails for any reason MUST leave the store exactly as it was" speaks of the store and not of what is beside it;
ADR-0058 consequences 5 and 18, D5; OQ-48, deferred by the owner on 2026-10-06 under
[R-071](../../product/requests.md#r-071), "after the first release". Raised 2026-10-13 by fin41 while repairing D8 and D11,
task N10, as OQ-264; renumbered OQ-265 at landing, because origin/main had given OQ-264 to REQ-CHAT-167's question.
**Ruled 2026-10-13.**)*

**What is open.** D5 is that nothing deletes `<identifier>.restoring-<n>` (the staging copy, the size of a store) or
`<identifier>.obstruction-<stamp>[.n]` (what the reversal moved off the target name), and nothing knows they exist. The
record names one remedy, OQ-48's inspect-and-delete surface, and that surface is deferred, so D5 is deferred with it. A
narrower remedy exists that needs no surface and the record does not offer: **the restore deleting its own staging copy**
where it can no longer be installed — after a reversal that put the previous store back, after a staging store that
failed `quick_check` or did not open (step 6), and after a displacement that failed (step 8). The staging copy holds
nothing that is not in the artifact the user chose, which still exists, so deleting it loses nothing the user has not
got; a successful restore leaves none already (the rename consumes it). The obstruction aside is different: it is
whatever occupied the target name, and the product cannot know what that was, so deleting it is not the same question.
Measured on every reversal (IC-1, the 2026-09-03 verification run, and `store.test.ts`'s E2 on this build): `.restoring-1`
and one `.obstruction-` left beside the target.

**What the build proceeds under.** As built: neither is deleted. `restoreStore` reports both in `leftovers`, which the
workspace service hands back in `RestoreReportPayload.leftovers` and which no surface shows.

**What a ruling decides.** Whether the restore deletes its own staging copy on the failure paths above (and, if so,
whether a failure to delete it is reported or only logged), or D5 waits whole for OQ-48's surface. The obstruction aside
is outside it either way.

**What a live run then shows.** Nothing: no live scenario restores a store.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** on every failure return that leaves
the store as it was, the restore deletes its own staging copy `<identifier>.restoring-<n>` before it returns. Those returns
are a failed expansion, a staging store that failed `quick_check` or did not open, a failed step-8 displacement, a step-9
failure with no previous store, and a step-9 failure whose R1/R2 reversal put the previous store back. When the delete itself
fails, the restore lists the path in `leftovers` and adds one sentence naming it to the failure's error, which reaches both
the notice and the log. The copy is kept, and listed, only where the reversal failed, and a process killed mid-restore
([OQ-266](#oq-266)) runs no deletion at all. The obstruction aside stays deferred with OQ-48 under R-071. No directive: the
specification is silent on what lies beside the store, and the ruling builds REQ-SESSION-201 without departing from it.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "On every failure path that leaves the store as it was, the restore deletes its own staging copy
(`<identifier>.restoring-<n>`) before it returns … If the delete itself fails, the path goes into the error notice the user
already sees and into the log." **Advocate B** (the system's lens, change-behaviour): "the restore deletes its own staging copy …
on every failure return where it reports the store as it was … It keeps the staging copy only on the last-resort path, where the
reversal itself failed." Both followed: from A the expansion moved inside step 6's guard and a failed delete told to the user;
from B the reading of a `.restoring-<n>` left on disk as a restore that never returned ([OQ-266](#oq-266)) and the
first-executions row.

***Built 2026-10-14 (fin43, `fin43-restore-recovery`).*** `discardStaging` in `packages/store/src/restore.ts` deletes the copy
(`rmSync`, recursive, three retries) and returns the path when the delete throws; each failure listed above goes through it,
and the sentence it adds reads "A working copy of the backup could not be removed and is at <path>; it holds nothing the backup
file does not, and it can be deleted." The expansion and the layout conversion now sit inside step 6's guarded block, so a
throw from either is the returned failure "staging store could not be prepared: …" rather than a rejection, and the staging
handle is closed and its spelling forgotten before the delete (an open handle on Windows makes the delete fail). The
workspace service's restore line in the log names `leftovers=` when there are any. Pinned by `store.test.ts`: E2 (no
`.restoring-` on disk or listed; the `.obstruction-` aside still listed) and the six cases of its OQ-265 block (a store that
fails `quick_check`, an unreadable artifact, step 8 with every aside name taken, step 9 with no previous store, a failed
reversal that keeps and lists the copy, and a delete that fails); all six and E2 are red on the code before the change. E3a
and the kill-in-the-gap case are unchanged. The two advocates' recommendations are quoted under "The recommendations it weighed"
above (fin47, 2026-10-15); *until then this sentence read: "The two advocates' recommendations are in the orchestrator's ruling
record, not copied here."*

***Extended 2026-10-14 (fin44, `fin44-optional-findings`).*** Step 9a's write of `origin.txt` was the one failure before step 8
left outside the guard: a throw there rejected the restore after the run host had closed its store, with the copy left
behind. It now returns through the same discard, as "the restored store's origin could not be written: …"; pinned by
`store.test.ts` ([the note](../../defects/fixed/a-restores-origin-write-that-fails-rejects-with-the-staging-copy-left-behind.md)).

<a id="oq-266"></a>

**OQ-266 — What does the product do with a restore that was cut between its two renames?** *(REQ-SESSION-201, "a restore that
fails for any reason MUST leave the store exactly as it was … no reader may observe" a partly restored store;
REQ-SESSION-202's last paragraph, under which an absent place is "an absence and not this condition, including while a restore
is under way"; REQ-SESSION-043; REQ-SESSION-200; ADR-0058's restore, steps 8 and 9, and README B2; OQ-48, deferred under
[R-071](../../product/requests.md#r-071). Raised 2026-10-13 by fin41, task N42, as OQ-265, after measuring the case (renumbered OQ-266 at landing, origin/main holding OQ-264):
[`../../defects/fixed/a-restore-cut-between-its-two-renames-leaves-the-workspace-to-open-as-an-empty-store.md`](../../defects/fixed/a-restore-cut-between-its-two-renames-leaves-the-workspace-to-open-as-an-empty-store.md).
**Ruled 2026-10-13.**)*

**What is open.** `pnpm restore-kill-proof` killed a real `restoreStore` process between step 8 (the target displaced) and step
9 (the staging copy installed) ten times. Every time the target name held nothing, the previous store sat whole at
`<identifier>.displaced-<stamp>` and the restored copy whole at `<identifier>.restoring-1`; and every time the workspace
service's next open created a fresh store at the target name and the workspace listed no session, saying nothing. The
specification's two relevant sentences pull apart here: REQ-SESSION-201 forbids a reader observing anything but the store as
it was, and REQ-SESSION-202 declines to treat an absent place as the "store could not be opened" condition, so the creating
open is what REQ-SESSION-043 permits. The product can tell this case from a workspace never run here: `.restoring-<n>` is
the restore's own name and nothing else makes it (a `.displaced-*` may also be the corruption ladder's, ADR-0058 consequence
5). Which of three things it should then do is not decided
anywhere: **finish** the restore (install `.restoring-1`, which passed `quick_check` and carries `origin.txt`, so the user
gets what they confirmed); **reverse** it (rename the displaced store back, so the user gets what they had, as the R1/R2
reversal does in-process); or **report** it (refuse to create a store there, REQ-SESSION-202's way, and say what was found,
leaving the choice to the user) — and whether that happens at the workspace service's open, before it creates anything, or
only on the user's action.

**What the build proceeds under.** As built: nothing looks for the leftovers, the open creates an empty store, and both
copies stay where they are. `store.test.ts` pins that state (the kill-in-the-gap case), so a ruling turns it red.

*Cross-reference, 2026-10-14 ([OQ-265](#oq-265) as ruled 2026-10-13): the restore now deletes its own staging copy on every failure it
returns from with the store as it was, so a `<identifier>.restoring-<n>` on disk marks either a restore that never returned
(this question's case) or a copy whose delete failed and was reported in that failure's error. A copy found on disk is
therefore no evidence of a store that passed step 6, and any later "finish" option re-runs `quick_check` on it before it
installs anything.*

**What a ruling decides.** Finish, reverse or report, and where (the open, or a user's action); and whether a `.displaced-*`
left beside a store that is present (the normal successful restore) is ever touched — it must not be, since it is the store
REQ-SESSION-201 keeps.

**What a live run then shows.** Nothing: no live scenario restores a store. `pnpm restore-kill-proof` is the measurement.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** a restore cut between step 8 and
step 9 is **reversed** at the workspace service's next open of that identifier, before anything is created. The restore marks
the cut exactly with a durable journal, `<identifier>.restore-pending`, written before step 8 and removed once step 9 or the
in-process reversal has succeeded. The open then puts back the store this restore displaced, applies nothing from the backup,
and tells the user once. A `.displaced-*` beside a present store is never touched. This is REQ-SESSION-201's failure clause
carried out, so the defect is closed against that requirement and no directive is needed. The two advocates'
recommendations are quoted in the paragraph below (fin47, 2026-10-15); *until then this sentence read: "The two advocates'
recommendations are in the orchestrator's ruling record, not copied here."*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "Reverse the cut restore at the workspace service's next open, before anything is created, and tell the
user." **Advocate B** (the system's lens, change-behaviour): "Reverse, at the workspace service's open, before anything is created
… The restore marks the cut exactly with a small fsynced journal file that it writes before step 8 and removes after step 9 or
after its reversal." Both followed on the outcome; B's on how the open recognises the cut (the journal), in place of A's inference
from `origin.txt`'s modification time, which can pick the wrong folder.

***Built 2026-10-14 (fin43, `fin43-restore-recovery`).*** `restoreStore` writes the journal (`{stamp, stagingN,
targetExisted}`, replaced where a stale one is there, then the file and its directory flushed) after step 9a and before step 8
(step `8-journal`), removes it when step 9 succeeds (before the run host is told to reopen) and when the R1/R2 reversal
succeeds, and keeps it when R2 fails, whose error then says the next open will try the rename again. A journal that cannot be
written is a returned failure before step 8, through OQ-265's discard, and a removal that fails is left for the next open
rather than thrown *(added by fin43's review, 2026-10-14: both escaped `restoreStore` as rejections, the first after the run
host had closed its connection and with the staging copy left; pinned by the OQ-266 block's two "journal that cannot" cases)*.
`recoverCutRestore` (`packages/store/src/recover.ts`) acts on the journal alone: none, nothing; a journal beside a present
target (a restore that finished, or a stale journal), the journal removed and nothing else; an absent target with a store
before, the highest `<identifier>.displaced-<journal stamp>[.n]` renamed back and the journal removed; an absent target with
no store before, the journal removed and the ordinary creating open follows (REQ-SESSION-043); a journal that cannot be read
(its write cut before its flush, so step 8 never ran), removed. A rename that fails, or a displaced store that is not there,
keeps the journal and refuses the open ("the store for this workspace is at X and must be renamed to Y"), creating nothing.
`openWorkspaceStore` runs it before anything else and carries what it did as `cutRestore`; the workspace service skips it
while its own restore is in flight (`RestoreInFlight`, `apps/desktop/src/workspace-service/store-open.ts`), and then
refuses rather than create beside the journal. The flag wraps `performRestore` and not the whole request: the service's own
reopen after it runs the check, so a failed R2 with the target name free is repaired at once (and the report's error says so),
where a flag around the whole request would have had that reopen refuse (`workspace.restore-in-flight`, the journal beside
an absent store) and left the store displaced until a later open *(this read "would have let that reopen create over the empty
target" until fin43's review, 2026-10-14: an open with the check skipped refuses beside the journal and creates nothing,
`store.test.ts`'s in-flight case)*; `workspace.opened` carries `cutRestore`, and main raises one info notice
naming the stamp, whether the workspace's sessions were put back or it had none here, that nothing from the backup was
applied, that a restore from Settings applies it, and where the prepared copy is kept. REQ-SESSION-202's check (W-31) runs
after this one in the same open. Pinned by `store.test.ts` (the kill-in-the-gap case flipped, and its OQ-266 block: a stale
journal, an older aside with no journal, no store before, a failed R2 repaired at the next open, the journal absent after
success and after a reversal, a rename back that fails, the in-flight open, and the counterfactual with no journal),
`store-open.test.ts` (the in-flight flag, and its counterfactual) and `pnpm restore-kill-proof`, which now FAILs unless the
next open puts the store back: 10 of 10 on 2026-10-14 (load average 0.6 to 1.3), the reinstated `workspace.db` byte-identical
to the displaced one in 10 of 10, the journal gone and the staging copy kept in 10 of 10.

***Corrected 2026-10-14 (fin44, `fin44-optional-findings`).*** "Where the prepared copy is kept" was written from the journal
alone, so a copy deleted by hand before the next open was still named. `cutRestore.staging` is now `null` when the open does
not find the copy, and the notice then names none
([the note](../../defects/fixed/the-cut-restore-notice-says-the-prepared-copy-is-kept-without-looking.md)). The notice is now driven in
the built app: `store-resolution-proof` launch D leaves a cut restore on disk before a launch, once with the prepared copy and once
without, and reads the notice's exact detail and the store put back (green 2026-10-14, load average 1.5 to 1.9).

<a id="oq-267"></a>

**OQ-267 — When a notice's action names a workspace no window holds, does activating it add a window for that workspace?**
*(REQ-NOTIFY-044 as amended under ESC-34 — "open the hook review for a named workspace", acting "on that object without
asking the user anything further"; REQ-NOTIFY-224; ESC-34's consequences, "navigating between workspaces from a notice is
owed"; PD-SHELL-001's add route; REQ-STARTUP-163; REQ-SHELL-017/021. Raised 2026-10-13 by fin41 (item N86) while repairing
[`../../defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md`](../../defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md);
the plan's range began at OQ-261, and origin/main already held OQ-261 to OQ-266. Ruled 2026-10-13 under R-072, below.)*

**What is open.** Notices are application-wide, so the unreviewed-hooks notice of workspace A can be activated in a window
holding workspace B: a second window (PD-SHELL-001), or the window that raised it after a switch. ESC-34 says the navigation
is owed and not how it navigates. Where a window holds A the answer is REQ-STARTUP-163's, as the chooser and the hand-over
take it: surface that window. Where none does, three routes exist and the record chooses none: **add** a window for A
(PD-SHELL-001's add route: no gate, no window closed, nothing asked); **replace** the activating window with A
(REQ-SHELL-017's switch, whose REQ-SHELL-021 gates may ask — the unsaved-settings guard — or decline on an active run);
or **review without a window**, opening A's review parented to the window on screen while no window holds A.

**What the build proceeds under.** Add. Of the three it is the only one that asks nothing (REQ-NOTIFY-044's "without asking
the user anything further") and closes nothing the user has open; it is the hand-over's own rule for a workspace no window
holds. `MainWindows.reach` (`apps/desktop/src/main/main-windows.ts`) does it, `main-windows.test.ts` pins it (a run active in
the activating window gates nothing), and `pnpm notice-proof`'s `review-other` launch drives it in the built app. Like the
add route, the added workspace becomes the remembered one.

**What a ruling decides.** Add, replace (and then what a declined gate does to the action), or review without a window; and
whether the same reading binds the other members that name a workspace (the project-initialization action, OQ-262).

**What a live run then shows.** Nothing: no live scenario opens two workspaces.

**Ruled 2026-10-13 by the consortium under the owner's delegation ([R-072](../../product/requests.md#r-072)):** when a notice
action names a workspace, activating it surfaces the main window that holds that workspace under REQ-STARTUP-163's rule;
where no window holds it, activation **adds** a main window for it on PD-SHELL-001's add terms — no REQ-SHELL-021 gate is
evaluated, no window is closed, nothing is asked, the workspace is persisted as the last-opened one, and a failure is reported
under REQ-SHELL-019 — and the action's surface then opens in that window. The rule binds every REQ-NOTIFY-044 member that
names a workspace: the hook review today and, once a notice carries it, the project-initialization action of OQ-262. Both
advocates recommended the add; the ruling follows one's account of the user-facing costs and the other's form, a revision of
the directive. Recorded as [`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 2, whose closed list of add
gestures gains this reach (Extends REQ-NOTIFY-044, which gains its back-pointer; Narrows REQ-SHELL-021 and Extends
REQ-SHELL-017 and REQ-STARTUP-161 stand), disjoint from PD-SHELL-009's narrowing of REQ-SHELL-021. **No behaviour changed:**
`MainWindows.reach` has done exactly this for the hook review since 2026-10-13 (fin41, N86; `notice-proof` sections 6 and
6b); the comments that called it provisional cite the revision since 2026-10-14 (fin43, `fin43-notices-and-config`).
**Raised beside it, not ruled:** OQ-262's ruling of the same day has a project-setup banner whose project no window holds show
"Project <name> is not open in any window." and add nothing, where this rule would add a window; the build follows OQ-262's
ruling for that member, and the disagreement is [OQ-294](59-spikes-and-later-questions-26.md#oq-294).

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, confirm-as-built): "Confirm the add route as built … surface the window that holds the workspace, and add one where none
does." **Advocate B** (the system's lens, confirm-as-built): "Confirm the add reading as built … Record it as revision 2 of
PD-SHELL-001, so that the directive's closed list of add gestures stops contradicting the build." Both followed; B's on the record
work, `PD-SHELL-001` revision 2.

*Added 2026-10-14 ([OQ-294](59-spikes-and-later-questions-26.md#oq-294), ruled 2026-10-14 under R-072):* this rule now governs the project-setup member as built —
a press for a project no window holds adds a window for it and opens Settings › Project there
([`PD-WORKSPACE-005`](../../product/directives/pd-workspace-005.md#pd-workspace-005) revision 3, fin44) — and, by
[`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 3 ([OQ-292](59-spikes-and-later-questions-26.md#oq-292)), `focus-session` as well.

<a id="oq-272"></a>

**OQ-272 — Is a person's edit inside an artifact document's frontmatter kept, or rewritten away at the next re-render?**
*(PD-LIBRARY-003 (d) and (f), REQ-LIBRARY-133, REQ-LIBRARY-095, REQ-LIBRARY-092; REQ-SESSION-115. Raised 2026-10-13 by fin42
(`fin42-live-gaps`), found by building `artifacts-proof` launches 8 and 9 (item N57). Minted on its branch as OQ-271 and
renumbered OQ-272 at its landing, `origin/main` having taken OQ-271 meanwhile. Ruled 2026-10-13 under R-072, below.)*

The inspector's Markdown tab shows and edits the whole document, its leading frontmatter included (PD-LIBRARY-003 (f)), and a
re-render of an edited document rewrites that block from the record and keeps what follows it (clause (d)). So a person's edit
typed inside the frontmatter is saved, `edited_at` is stamped and the table shows ` · edited`, and the next supersession or
re-materialisation removes it without a word. Measured on the built app: launch 8's first build clicked the editor at its centre,
which lies inside the frontmatter, and typed there; the save read "Saved.", the document held the text, and after launch 9's
superseding publish the document's frontmatter was rewritten and the text was gone, while the continued run's handoff still
named the artifact `(… , edited)` and carried no edit. The directive's costs name a deleted frontmatter coming back; an edit
inside it, and a record that keeps saying `edited` once nothing edited remains, are not named.

**What the build proceeds under.** As built: the frontmatter is the record's, and an edit inside it lasts until the next
re-render. The proofs now move the caret below the frontmatter before typing (`Ctrl+End`), and the live run's `delegation-edit`
launch does the same.

**What a ruling decides.** One of: the Markdown tab keeps the frontmatter out of the person's reach (shown read-only, or not
shown), as the Preview already does (clause (f)); the tab says, when a save changes the block, that frontmatter edits are not
kept; a re-render keeps a person's changed values; or the cost stands as built and is added to PD-LIBRARY-003's list.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../product/requests.md#r-072)): the frontmatter is shown read-only, and a
save writes the record's frontmatter.** The inspector's Markdown tab shows the document's leading frontmatter block read-only, in
a height-bounded region above the editor, and the editor holds and edits the text below it. The store's save applies clause
(d)'s rule: it writes `renderFrontmatter(record)` (with the new `edited_at`) in place of the leading block it is given, or in
front of the text when no block is found. Recorded as [`PD-LIBRARY-003`](../../product/directives/pd-library-003.md#pd-library-003) revision 2,
which revises (c) and (f), replaces the cost of a deleted frontmatter coming back with two others (a person cannot change
frontmatter text from the inspector; a block an earlier edit broke is shown whole, gets a fresh block in front at the next save,
and its lines stay as text until removed), and extends REQ-LIBRARY-133; REQ-LIBRARY-132's back-pointer names revision 2 and
REQ-LIBRARY-133 gains one. REQ-LIBRARY-094, -095, -092 and REQ-SESSION-115 keep their text. **The build's earlier reading, kept
beside the ruling:** "What the build proceeds under" above (an edit inside the frontmatter lasting until the next re-render, the
proofs taking the caret below it with `Ctrl+End`) governed from fin42 until this ruling and no longer does. **Built in fin43**
(`fin43-analysis-and-artifacts`): `ArtifactStore.editBody` writes through the same `withRecordFrontmatter` as `rerender`;
`ArtifactInspector` holds the block apart (`artifact-frontmatter`) and sends it back unchanged in front of the edited text;
`artifacts-proof` launch 8 no longer takes the caret anywhere before typing. The live run's `delegation-edit` chord may stay.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "the inspector's Markdown tab shows the document's leading frontmatter block read-only above the editor,
and the editor holds and edits the text below it. Save writes the block as loaded, followed by the edited text." **Advocate B**
(the system's lens, change-behaviour): "The Markdown tab shows the frontmatter read-only above an editor that holds the rest of
the document. The store's save writes the record's frontmatter in front of whatever text it is given." Both followed on the
surface; B's on enforcing it in the store; the ruling added a height bound on the block's region of its own.
