# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — First execution — 2026-09-03, the restore behind the real run host, and the backup from the Settings view

Part 18 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## First execution — 2026-09-03, the restore behind the real run host, and the backup from the Settings view

*Recorded under GD-10. IC-5 discharged; IC-4 discharged in its first half, prepared in its second.*

**Built and run:** `packages/workspace/src/{backup,restore}.ts` around this record's mechanism, the
workspace service performing both (ADR-0002 c.7: main supplied the save and open dialogs and the message
boxes and nothing else), and the service reaching the run host through **narrow requests back to main**
that main forwards — steps 1, 3, 4a and 10 as `runHost.refuseRuns / closeStore / release / reopen`,
each bounded, with the lease renewed every 10 s while a restore runs (3b). The restore is two-phased so
every question is asked before anything is changed (`REQ-SESSION-201`): an assessment that runs gates 1
and 2 on the artifact, reads the identifier case, and counts what the target holds including its lock
rows; then the perform. The three confirmations carry what the requirement and ESC-26 fix — which
workspace, when, what happens to the store that is there now; both identifier values and the sessions
that become unreachable, cancel the default, three outcomes; the foreign rows as one condition with the
risk stated. The two actions sit in the Settings view's Project category (`REQ-CONFIG-268`), disabled
with the reason while a run is busy (`REQ-NOTIFY-008`).

**Run in the application, six scenarios, real utility processes:** a backup taken **while a run was
streaming** — 4 sessions, 100 KB, the run finished afterwards untouched; a restore **refused while a run
was active** ("Finish the active run before restoring the session store."); a restore into the same
identifier — assessed (5 sessions in the target, 4 in the artifact), confirmed, performed in ~250 ms,
the previous store displaced and kept, `origin.txt` naming the workspace, the run host re-handed the
store; a restore into a workspace carrying a **different** identifier with ESC-26's third outcome — both
values named, the identifier replaced *after* the store was whole, the store under the old value intact,
and writing the old value back undoing it (done, on the scratch workspace); and the Settings screen.

**Found, and it is about this record: case (b) has no route in the product.** "The workspace carries no
identifier file at all" cannot be met from the restore action, because the restore is an action of an
*open* workspace and opening one mints its identifier (`REQ-SESSION-197`, W-18). The disaster-recovery
journey this section describes — machine dies, clone, open, restore — therefore always arrives as case
**(c)** with a freshly minted value on the workspace side, which is exactly the situation ESC-26 was
ruled for. The code path for (b) exists and is tested in the workspace package; it is reachable only by
a caller that restores without opening, which nothing does. The section is not wrong about what (b)
*would* do; it is wrong about (b) occurring. **The verification run found this the honest way:** the
scenario prepared for (b) was met by the second message box, which its script had no answer for, and a
real native dialog blocked the run until its capture fired.

**A second observation, not a defect.** A backup taken mid-run carries that run's session as `running`
with its lock row, as `REQ-SESSION-201`'s "a state a reader could have observed at one moment" says it
must; restored on the same machine after the run has ended, that session reads as stale (live status, a
pid that is gone) and waits for ADR-0005's reap-and-repair, which is not built. The restore's
foreign-lock drop (consequence 11) does not touch it because the row names this machine.

**IC-5 discharged** — `store.test.ts`: against an artifact in the container layout (`store.db`,
`manifest.json`), the restored directory holds `workspace.db`, no manifest, and `origin.txt` naming the
project; the counterfactual (`skipArrange`, D7 as it was) opens, works, and is missing all three.
**IC-4 half 1 discharged, half 2 prepared** — `../spikes/machine-identifier-rename.md`.

**Not exercised:** the kill-in-the-gap case (README B2); two concurrent restores of one identifier; a
restore from a network destination; D5's staging leftover (observed again: every successful restore
leaves none, every reversal leaves `.restoring-1`). *(2026-10-14: a reversal that puts the store back leaves none since
OQ-265's ruling, consequence 18.)*

> **The kill-in-the-gap case, measured 2026-10-13 (fin41); "not exercised" above is kept as what stood until then.**
> `pnpm restore-kill-proof` runs `restoreStore` in a real child process (`packages/store/src/restore-kill.child.ts`, bundled
> from these sources) and kills it with SIGKILL between step 8 and step 9, at the `betweenRenames` hook, ten times (load
> average about 4 on 4 CPUs; killed 98 to 162 ms after launch). **Ten of ten** left the same disk: the target name empty, the
> displaced store whole beside it (its two sessions, `quick_check` ok), the staging copy whole (the artifact's session,
> `quick_check` ok). Nothing is half-renamed and no connection was open — steps 5 and 7 closed both — so the corrections hold
> at the one point no process is left to reverse anything. **What follows them does not:** in ten of ten the workspace
> service's next open (`openWorkspaceStore`, from `openOwn`) created a fresh store at the target name, migrated it from 0,
> and the workspace listed no session, saying nothing — REQ-SESSION-201's "no reader may observe" a partly restored store,
> met by a reader observing a third, empty one. REQ-SESSION-202 declines this case by name (an absent place "is an absence
> and not this condition, including while a restore is under way"), so finishing, reversing or reporting it is a question:
> [OQ-266](../../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266), with the defect note
> [`../../../defects/fixed/a-restore-cut-between-its-two-renames-leaves-the-workspace-to-open-as-an-empty-store.md`](../../../defects/fixed/a-restore-cut-between-its-two-renames-leaves-the-workspace-to-open-as-an-empty-store.md).
> `store.test.ts` pins the gap state in-process, as built. Not measured: a power loss in the gap (R-071's O-8 is the
> power-loss test, a different fault), and the run host's side (its refusal lease expires by itself, 3b, untouched here).

> **The kill-in-the-gap case after OQ-266's ruling — measured 2026-10-14 (fin43); the 2026-10-13 paragraph above is kept as
> what was measured as built.** The same harness, the same ten kills (killed 93 to 152 ms after launch; load average 0.6 to
> 1.3 on 4 CPUs). **Ten of ten** left the model's disk with the journal beside the empty target name, and in **ten of ten**
> the next open (`openWorkspaceStore`, the workspace service's) put the displaced store back before creating anything: it
> listed `S-old-1` and `S-old-2`, migrated nothing, reported what it reversed, and left the reinstated `workspace.db`
> **byte-identical** to the displaced one, the journal gone and the staging copy kept. The proof now FAILs on any of those.
> The journal-less counterfactual (`skipJournal`, `store.test.ts`) reproduces the empty store. Still not measured: a power
> loss in the gap (the journal is flushed with its directory before step 8, which is the property such a test would weigh).
>
> **On Windows, 2026-10-21 (the Windows ARM64 session's E1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, bsdtar 3.8.8, at `613ee119`, `%TEMP%` 33 characters).** `pnpm restore-kill-proof`: 10 of 10, then `--trials=30`: 30 of 30 killed in the gap (none completed), each leaving the journal beside the empty target name and both stores passing `quick_check`; the next open put the displaced store back byte-identical in 30 of 30 and created an empty store in none. Kills landed 176 to 331 ms after launch. With the displaced directory held by a real holder (an SQLite connection, an `fs.openSync` handle, a `cmd /k` working directory; ten each) the next open refused with `CutRestoreError` naming the displaced store and kept the journal, and once the holder was gone it reversed the cut and listed the sessions.

**Consequence 1 confirmed under the loader, 2026-09-04** (`../spikes/native-load-proof.md`): the packaged
Electron opened `app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` — compiled
by that build, no prebuild in the artifact — and read `journal_mode` back as `wal`; the packaged application
then opened a workspace store at schema v5 in its real utility process. IC-6 is discharged.
