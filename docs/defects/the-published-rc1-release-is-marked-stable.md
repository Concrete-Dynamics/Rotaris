## The published rc1 release is marked stable

Read through GitHub's release API on 2026-10-24: release `v0.1.0rc1`, id `421896384`, is public
(`draft: false`) and reports `prerelease: false`.
[API source](https://api.github.com/repos/Concrete-Dynamics/Rotaris/releases/tags/v0.1.0rc1).
The current source already classifies rc tags as prerelease and conditionally passes `--prerelease` when
creating a draft. This observation does not identify which historical workflow or later action changed the
release metadata. T2 strengthens the future draft arguments; it does not change this existing public release.

Since [R-086](../product/requests.md#r-086) (T2) the draft stage passes `--prerelease=true` or `--prerelease=false`
from `release:pipeline draft-args` and refuses a draft whose read-back disagrees (`release-state … draft`), and
`release-state … published` checks a published release the same way. Run 39962292417's draft log names the draft
created with `prerelease`, so the flag was most likely lost at publication, outside the workflow. The note stays
open: correcting `v0.1.0rc1` is a publication act and the owner's.

## Specs

REQ-STARTUP-027 and REQ-STARTUP-029 classify rc tags as prerelease. The GitHub release's stable flag disagrees
with that channel. This is an observed metadata discrepancy, not evidence of a signature or digest defect.

## Relevant files

- `.github/workflows/release.yml` — draft creation.
- `tools/release-pipeline/body.mjs` — tag metadata and prerelease classification.
- `tools/release-pipeline/cli.mjs` — `draft-args` and the `release-state` read-back.
- `apps/desktop/src/main/updater/feed.ts` — release-feed consumer.
