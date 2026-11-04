## The autopsy reader leaves WAL sidecars in a live-run pack, which then fails `pnpm evidence verify`

Acceptance finding AF-23 of plan hrda (2026-11-04), harness-defect, cosmetic. `apps/desktop/scripts/autopsy.mjs` opened
the store it was given with `new Database(dbPath, { readonly: true, fileMustExist: true })`. The product's store runs in
WAL mode (`packages/store/src/open.ts`), and SQLite opening a WAL database, even read-only, creates `workspace.db-shm`
and `workspace.db-wal` beside it and leaves them there when a read-only connection closes, since it cannot checkpoint.
A live-run pack holds a checkpointed `workspace.db` with no sidecars, and its `evidence-manifest.json` names none, so
`verifyEvidenceManifest` then fails the pack on both ("not in the manifest"). The run-autopsy skill tells every
acceptance to run this reader on the pack, so following the skill broke the pack's verification.

Observed by the acceptance's autopsy of `.live-run/runs/2026-11-04T18-23-14-351Z` in `C:/dev/Rotaris-wt-accept`: both
files appeared at 19:58 local (`workspace.db-shm` 32,768 B, `workspace.db-wal` 0 B); `workspace.db` still hashed to its
manifest value. Reproduced on branch `hrda-accept1-5` at `9c0e8cc4` (Windows 11 ARM64, Node 26.13.0) on a copy of that
pack without the sidecars: `pnpm evidence verify` PASS (8 files), `node apps/desktop/scripts/autopsy.mjs <copy>/workspace.db`,
then `pnpm evidence verify` FAIL with the two lines above.

## Specs

None contradicted. The reader's own header promises a read-only pass that "writes nothing"; the evidence manifest
(`pnpm evidence`) records a pack as written.

## Relevant files

- `apps/desktop/scripts/autopsy.mjs` — the read-only open (line 97 at `9c0e8cc4`).
- `apps/desktop/scripts/lib/evidence-manifest.mjs` — `verifyEvidenceManifest`, which fails a file the manifest does not name.
- `.agents/skills/run-autopsy/SKILL.md` — Step 1 runs the reader on the pack.

## Outcome — repaired 2026-11-04 (plan hrda, bundle `hrda-accept1-5`)

The reader opens its store through `openStoreForReading` (`apps/desktop/scripts/lib/autopsy-store.mjs`). Every
connection to a WAL database holds its `-shm` open while it lives, so where no `-shm` stands beside the store nothing has
it open: the reader copies the store (and a `-wal` a crash left, whose committed frames are part of it) into a temporary
directory, reads the copy and removes the directory, also when the read throws. Where a `-shm` stands a connection may be
live, the running application's, and copying the store and its log one after the other could tear a write, so the store
is opened in place read-only as before; its sidecars were already there.

Pinned by `apps/desktop/scripts/lib/autopsy-store.test.ts`: a pack read by the reader still lists only its own files and
verifies against its manifest; a plain read-only open, the old one, leaves both sidecars and fails it; a store a writer
holds open is read in place, rows still in its log included; a crash's log is carried into the copy. With the copy
forced off (in-place open always), the first and the fourth fail. Shown on the pack the finding named: a copy of
`.live-run/runs/2026-11-04T18-23-14-351Z` without the sidecars verified (8 files), the reader ran over it, and it verified
again with no file added; and on a store with a started session (`C:/dev/Rotaris/.live-run/runs/2026-10-31T21-12-56-701Z`'s
`workspace.db` with a manifest written for it), the reader printed its autopsy and the directory verified after it.
