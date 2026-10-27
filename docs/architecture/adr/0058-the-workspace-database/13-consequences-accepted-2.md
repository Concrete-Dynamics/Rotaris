# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Consequences accepted (continued)

Part 13 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

18. **What in this record is known to be wrong, or known to be silent, and is not fixed. Added 2026-09-03 by
    the Architecture Gate's ruling on item 4.** The gate's standard is that a defect **stated in the record**
    that would not cause a conformant implementation to be built wrong does not block building against that
    record. The standard is only worth anything if the statement exists, and until this consequence was
    written this ADR was the one carrying open defects and not naming them. **Three are open. None is in the
    build-wrong class. A builder is expected to meet all three.** *Since 2026-10-13 one is: D8 and D11 are
    repaired, and their bullets say how; D5 is deferred with OQ-48's surface under R-071 ("after the first
    release"), and OQ-265 asks whether the restore should delete its own staging copy without that surface.*
    *OQ-265 was ruled later on 2026-10-13 (R-072) and, built on 2026-10-14, D5 split: its staging half is repaired, its obstruction half
    stays deferred with OQ-48; the bullet says which is which.*

    - **D5 — nothing deletes a leftover staging copy or an obstruction aside, and nothing knows they
      exist.** The full table is in consequence 5 above. Each is the size of a store. What is owed is
      OQ-48's inspect-and-delete surface, which the specification still does not have.

      ***The staging half, repaired 2026-10-14 (fin43; [OQ-265](../../open-questions/57-spikes-and-later-questions-24.md#oq-265) ruled under R-072); the
      bullet above is kept as what stood.*** On every failure return that leaves the store as it was — a failed
      expansion, a staging store that fails `quick_check` or does not open, a failed step-8 displacement, a step-9
      failure with no previous store, and a step-9 failure whose R1/R2 reversal put the store back — `restoreStore`
      deletes `<identifier>.restoring-<n>` before it returns (`discardStaging`, `packages/store/src/restore.ts`). A
      delete that fails is listed in `leftovers` and named in one sentence of the failure's error, which reaches the
      notice and the log. The copy is kept, and listed, only after a reversal that failed; a killed process deletes
      nothing (OQ-266). Found by building: the expansion and the layout conversion sat outside step 6's guard, so an
      artifact unreadable at step 6 rejected the whole restore, after the run host had closed its connection, with the
      partial copy left (reachable where the file changed after its assessment, which expands and checks it first);
      both are inside the guard now. Pinned by `store.test.ts`'s E2 and its OQ-265 block.

      ***The obstruction half stays deferred with OQ-48 under R-071.*** Nothing deletes
      `<identifier>.obstruction-<stamp>[.n]`: the product cannot know what occupied the target name.
    - **D8 — the three gates before the swap are not read-only at the filesystem level.** The liveness
      gate's read-only open of a write-ahead-logged store creates `workspace.db-shm` (32,768 B) and
      `workspace.db-wal` (0 B) **in the target store directory**, measured before and after. No row is
      written and the data is unchanged, so the intent of "none of them touching the target" holds and the
      literal sentence does not — **a refused restore leaves the target directory different from how it
      found it**. It is stated here rather than repaired because this record is cited for exactly this kind
      of guarantee, and it met the defect a second time inside the IC-1 harness, uninvited.

      ***Repaired 2026-10-13 (fin41); the bullet above is kept as what was measured.*** Built, the defect sat in
      one of the two gate connections and not the other. **The read-only open was the assessment's**
      (`assessRestore`, `packages/workspace/src/restore.ts`), the read the product makes before the
      confirmations; the mechanism's own gate (steps 2 and 4 in `restoreStore`) is a **read-write** open, and a
      read-write connection whose close is the last one checkpoints and removes the two files its open created —
      so the mechanism's refusals already left the target as they found it (`workspace.test.ts` compares the
      listing across a step-2 refusal; `store.test.ts`'s `treeHash` skips the two files and so never could), and
      what reached the user was the assessment's: **a restore declined or refused
      after its assessment left `workspace.db-shm` and `workspace.db-wal` in a target closed cleanly**, re-measured
      on this host (`better-sqlite3` 13.0.3, Node 24) exactly as above. *"The liveness gate's read-only open" is
      corrected to "the assessment's read-only open".* The repair is an open chosen by what the directory holds
      (`openStoreForInspection`, `packages/store/src/open.ts`): with neither file there no connection is open, so
      the assessment opens read-write and its own close removes both; with both there a connection holds them (or
      died holding them), so it opens read-only, which reads the logged rows and creates nothing; `-wal` alone opens
      read-write, the one case in which the listing changes. Neither the engine's `immutable` flag nor a copy was
      taken: the binding is compiled with `SQLITE_USE_URI=0` (`deps/defines.gypi`; a `file:…?immutable=1` name was
      refused, `SQLITE_CANTOPEN`, measured), and the engine documents an immutable open as one that turns off
      locking and change detection on a file it assumes nobody changes — the opposite of a gate whose purpose is a
      run that may be writing its lock row now; a copy is O(store) and is not one moment. Pinned by `workspace.test.ts`'s D8 block (the listing and the bytes of the target before and after
      an assessment, a refusal before the mechanism and one at step 2, and a target holding both files; the first
      two red on the read-only open) and `store.test.ts`'s two D8 cases (the read-only open as the counterfactual).
      Note: [`../../../defects/fixed/a-refused-restore-leaves-write-ahead-files-in-the-target-store-directory.md`](../../../defects/fixed/a-refused-restore-leaves-write-ahead-files-in-the-target-store-directory.md).
    - **D11 — the `.displaced-` suffix can make the kept store unreadable, and the kept store is the whole
      point.** The suffix costs +35 characters. The store binding throws `unable to open database file` on
      any statement at an absolute database path of 252–259 characters and on open at ≥ 260, **while Node's
      own filesystem calls worked at 328** and `LongPathsEnabled` was `1` on the measuring machine: the
      registry opt-in does not reach the store engine. A live store at 230–251 characters works perfectly
      and its displaced copy cannot afterwards be opened by the product at all; the rename always succeeds.
      **Not reachable at the shipped location** (96 characters, fixed-length by construction); reachable
      with a long account name, a redirected profile, or a junctioned per-user directory. *This also
      corrects consequence 13, which names the right hazard and points at the deepest path when the limit
      bites at the shallowest one, `workspace.db`, because it is the engine and not the filesystem that
      refuses.*

      ***Repaired 2026-10-13 (fin41) by a refusal, not a shorter name; the bullet above is kept as what was
      measured.*** No suffix closes it: a live store at 251 characters is one character from the limit, so any
      name longer than `<identifier>` crosses it, and the kept store's name must say what it is. **The restore now
      refuses, before its first step and before any confirmation, where a store it would create sits past the
      engine's limit**: `restorePathTooLong` (`packages/store/src/restore.ts`) measures the canonical path the engine
      would be handed, of the staging store and — where there is a store to displace — of the kept one at the widest
      name step 8 can claim (counter `.4`), against `storePathLimit` (`layout.ts`: 251 on Windows; none elsewhere,
      where nothing was measured and this host's engine opened every length its filesystem would create).
      `restoreStore` returns it as step `0-path-too-long` having asked nothing of the run host; `assessRestore` returns
      it as the refusal `path-too-long` (`RestoreAssessmentSchema`), which main raises as "The restore was refused" with
      the detail — the length, the path, the limit, and that nothing was changed. **Two corrections to the bullet,
      found by building:** the window starts at **217** characters (215 at a counter), not 230 — 230 to 251 is the
      range sampled, and 252 − 35 is the boundary; and **the staging store crosses it too**, from 240 characters
      (`.restoring-1` is 12 longer), where the restore used to fail at step 6 *after* the run host had closed its
      connection, leaving the staging copy behind. Pinned by `store.test.ts`'s D11 block (215, 230 and 251 refused with
      the target's tree and the root's listing unchanged and nothing asked of the run host; 214 proceeds and its kept
      store opens; 239 and 240 with nothing to displace; the counterfactual, no limit, keeps a store at 265) and
      `workspace.test.ts`'s D11 case (the assessment refuses at 230, and assesses as before with no limit). Not
      measured on Windows by this build: the limit is the 2026-09-02 measurement's, and the refusal is exercised on
      Linux with the limit given. Note:
      [`../../../defects/fixed/a-restore-at-a-long-store-path-keeps-a-displaced-store-the-engine-cannot-open.md`](../../../defects/fixed/a-restore-at-a-long-store-path-keeps-a-displaced-store-the-engine-cannot-open.md).

      *Measured on Windows, 2026-10-21 (the Windows ARM64 session's E1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, bsdtar 3.8.8, at `613ee119`, `%TEMP%` 33 characters).* The D11 block ran on Windows: the assessment refuses at 215, 230 and 251 with nothing touched and nothing asked of the run host, 214 proceeds and its kept store opens, 239 proceeds and 240 is refused with nothing to displace, and the counterfactual keeps a store past the limit. A scratch sweep (never committed) of absolute database paths from 240 to 265 characters and 300: `openStore` created, migrated and wrote at 241–251 and was refused at 252–259 ("unable to open database file") and at 260 and above ("could not open …"); a raw better-sqlite3 connection from a `.cjs` file refused at 252, 255 and 260 alike under Node 24.18.0 and under Electron 44.1.1 as Node (`ELECTRON_RUN_AS_NODE`); `storePathLimit()` is 251. **The arm64 boundary is the x64 value, 251.** `openWorkspaceStore` opened a store at 250, 251 and 252 and refused at 259 and 260: a first store is made in its sibling, two characters shorter (`.<32 hex>` against `v1-<32 hex>`), and renamed in, and a store that exists in WAL mode then opened and answered reads at 252 and 253 — the built app's launch at a 253-character store logged "opened … (0 sessions, 0 rows)" — so "on any statement at 252–259" holds for a store being created and was not seen for reads of one already made; writes there were not tried. A launch whose store could not be opened there (256, 263) painted its window with no workspace and told the person nothing ([the note](../../../defects/a-workspace-whose-store-cannot-be-opened-at-launch-is-left-unopened-without-a-word.md)).
      *D5 on Windows, the same day:* `discardStaging` with a real holder on the staging directory — an SQLite connection or a `cmd /k` whose working directory it was, ten times each — returned the directory as a leftover and left it, then removed it once the holder was gone; an `fs.openSync` read handle on its `workspace.db` did not stop the removal at all (Node opens with delete sharing). With the store itself held, a restore forced to `target-exists` failed at step 8 (`EPERM` under an SQLite or `openSync` holder, `EBUSY` under a held working directory), left the store byte-identical and no staging behind, thirty of thirty.

    **Two rules this record owns are not defects and are owed evidence rather than a fix**, and they are
    named here so the list is the whole list: rule 6's canonical path spelling **needs a conformance test
    that opens one store two ways and asserts the product refuses**, because its violation is silent and
    there is no error to detect (consequence 15); and ADR-0055's stand-down rule for a recovered process has
    no measurement behind it at all.
