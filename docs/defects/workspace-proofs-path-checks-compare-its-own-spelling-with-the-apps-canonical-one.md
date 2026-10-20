## workspace-proof's path checks compare its own spelling of a folder with the app's canonical one

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-proofcwd` at `65c38641` plus plan `loc1`'s `proof-cwd` working tree (2026-10-20). Recorded, not
repaired: that bundle repaired the same class in `lib/working-directory.mjs`'s `assertOpened`
([`assertopened-compares-the-working-directory-as-javascripts-realpath-spells-it.md`](fixed/assertopened-compares-the-working-directory-as-javascripts-realpath-spells-it.md)),
and these checks are outside its task.

`workspace-proof` spells its project folders from `evidenceDirectory`, which resolves the repository from the script's
own path, and so in whatever letter case the proof was started with. The app writes and reports a folder in
`canonicalPath`'s spelling (`realpathSync.native`, an upper-case drive letter). Started from the tree, the two agree and
the proof passed 50 checks. Started through a lower-cased path
(`node c:/dev/rotaris-crw-wt-loc1-proofcwd/apps/desktop/scripts/workspace-proof.mjs --skip-build`, no other Electron at its
start), it read 45 passed, 5 failed, 5 skipped; `cold` and `gone`, which go through `assertOpened`, passed. The five reds
each compare an app-reported path with the proof's spelling exactly:

- REQ-SHELL-035 / REQ-WORKSPACE-016: the chip's description, "Current project: C:\\dev\\Rotaris-crw-wt-loc1-proofcwd\\…",
  against the proof's lower-cased folder;
- REQ-SHELL-017 and PD-SHELL-001 / REQ-WORKSPACE-005: `workspace/lastOpened` (`"C:\\dev\\Rotaris-crw-wt-loc1-proofcwd\\.proof\\workspace-proof\\project-b"`)
  against the proof's `B`;
- the `concurrent` check (four windows on `project-a` to `project-d`) and REQ-SHELL-011 / REQ-WORKSPACE-008's "answering one
  window cancels only its deferred offer", which find a window by its folder.

Other checks already fold case (`toLowerCase()`), which is the Windows rule; these do not. A proof launched from Git Bash
or a script that spells the drive or the tree in another case reads red for the shell, not the product.

## Specs

None is contradicted by the product: the folder it reports is the canonical spelling (constraint W-27, OQ-49, ADR-0058
rule 6), compared case-insensitively on Windows.

## Relevant files

- `apps/desktop/scripts/workspace-proof.mjs`: the checks named above, and its folders, spelled from `evidenceDirectory`.
- `apps/desktop/scripts/lib/working-directory.mjs`: `sameDirectory`, the comparison those checks could use.
