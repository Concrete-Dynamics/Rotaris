## assertOpened compares the working directory as JavaScript's realpath spells it, not as the app does

## Outcome: repaired 2026-10-20 (plan `loc1`, `proof-cwd`; fin47's review finding `fin47-accept1-3`)

**Measured first, on this branch at `65c38641`**, on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64. Node's
JavaScript `realpathSync` answers a path in the letter case and the 8.3 short names it is given:
`c:\dev\rotaris-crw-wt-loc1-proofcwd\.proof` reads back as given, and `C:\dev\ROA627~1` (the tree's short name) as itself.
`realpathSync.native` answers `C:\dev\Rotaris-crw-wt-loc1-proofcwd\.proof` and the long name for both. The app logs the
workspace a window opened in `canonicalPath`'s spelling (`packages/platform/src/canonical.ts`: `realpathSync.native`, an
upper-case drive letter), while `emptyWorkingDirectory` returned `realpathSync`'s and `assertOpened` compared the two
exactly.

- Started as the brief starts it (`node apps/desktop/scripts/settings-proof.mjs --skip-build` from the tree, which
  spells the tree as the disk does), `settings-proof`'s launches 1 and 1′ passed `assertOpened`, and so did
  `workspace-proof`'s `cold` and `gone` and `updater-proof`'s stage 1 (task 1 of the same bundle). The temporary
  directory on this host, `C:\Users\ganga\AppData\Local\Temp`, has no short name in its spelling, so it raised nothing.
- Started through a path spelled in lower case (`node c:/dev/rotaris-crw-wt-loc1-proofcwd/apps/desktop/scripts/settings-proof.mjs
  --skip-build`), `settings-proof` failed at its first launch, which had opened exactly its working directory: "Error:
  no-workspace opened C:\dev\Rotaris-crw-wt-loc1-proofcwd\.proof\settings-proof\profile\working-directory, not its empty
  working directory c:\dev\rotaris-crw-wt-loc1-proofcwd\.proof\settings-proof\profile\working-directory".

**Repaired in the harness** (`apps/desktop/scripts/lib/working-directory.mjs`). `spelledAsTheAppDoes` spells a path as
`canonicalPath` does: resolved under the platform's rule, `realpathSync.native` where it exists on this host, no trailing
separator, an upper-case drive letter on Windows. `sameDirectory` compares two paths so spelled, without regard to letter
case on Windows (the rule `samePath` applies) and exactly elsewhere. `emptyWorkingDirectory` returns the app's spelling,
and `assertOpened` compares with `sameDirectory`, takes the platform as a parameter, and names the directory "its own
working directory" (it is empty for a proof's first such launch only).

**Pinned by** `apps/desktop/scripts/lib/working-directory.test.ts`, 5 new cases: `sameDirectory` under the Windows rule
(letter case, separators, a trailing separator) and the POSIX rule (letter case names another directory);
`assertOpened` passing the Windows pair the lower-case run read and still failing the checkout; and, on a Windows host,
`emptyWorkingDirectory` answering the disk's spelling for a lower-cased path and the long name for a parent given by its
8.3 short name, where JavaScript's `realpathSync` does not. With the old `realpathSync` and exact comparison put back,
those three cases fail.

**Shown by** `settings-proof` started through the lower-case path after the repair: launches 1 and 1′ passed
`assertOpened`. `workspace-proof` started the same way passed its `cold` and `gone` checks, which go through
`assertOpened`; five of its other checks compare app-reported folders with the proof's own spelling exactly and read red
that way, recorded, not repaired, in
[`workspace-proofs-path-checks-compare-its-own-spelling-with-the-apps-canonical-one.md`](../workspace-proofs-path-checks-compare-its-own-spelling-with-the-apps-canonical-one.md).
`settings-proof` does not run
to its end on this host: it stops at launch 1″ on a Windows-only geometry red, recorded in
[`settings-proofs-minimum-size-launch-reads-1000x682-at-150-percent-display-scale.md`](../settings-proofs-minimum-size-launch-reads-1000x682-at-150-percent-display-scale.md),
so its fourth launch with no workspace argument (`tools`) was not reached here.

---

`apps/desktop/scripts/lib/working-directory.mjs` (fin47) made a proof's working directory with Node's JavaScript
`realpathSync` and compared the workspace a launch's log names with it exactly. On Windows the two sides can spell one
directory differently: the drive letter's case, the letter case of any component, and 8.3 short names, which the
JavaScript `realpathSync` keeps as given and the app's `canonicalPath` resolves. A proof started through such a spelling
reports a launch that opened exactly its working directory as having opened another. The three proofs that use it
(`settings-proof`, `workspace-proof`, `updater-proof`) would read red for the shell's spelling, not the product.

## Specs

None is contradicted by the product: REQ-SHELL-010 (c) is what it does, and the spelling it logs is the canonical one
(constraint W-27, OQ-49, ADR-0058 rule 6: one canonical spelling, compared case-insensitively on Windows). The harness
compared with another spelling.

## Relevant files

- `apps/desktop/scripts/lib/working-directory.mjs`: `emptyWorkingDirectory`, `assertOpened`, and since this repair
  `spelledAsTheAppDoes` and `sameDirectory`.
- `packages/platform/src/canonical.ts`: `canonicalPath` and `samePath`, the app's spelling and rule.
- `apps/desktop/src/main/index.ts`: `currentDirectory: () => canonicalPath(process.cwd())`.
