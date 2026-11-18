## A release is not drafted when one published platform fails to build

The tag workflow's `sign` job needs both `build` (windows-x64) and `build-linux` (linux-x86_64), and the manifest, the verification and the draft are all written for the whole published set (`PUBLISHED_PLATFORMS`). When one platform's build fails, nothing is signed and nothing is drafted: the platform that did build is not published.

With one published platform the question did not arise. It arose on 2026-11-17, when [`PD-STARTUP-013`](../product/directives/pd-startup-013.md#pd-startup-013) made `linux-x86_64` the second. Recorded by the change that added the job, and not repaired there: publishing a partial set means the manifest, `verify`, the body's element (4) and the read-back each taking the set that survived, and the release's first two-platform run was not the place to build that.

## Specs

REQ-STARTUP-030: "a failure on one platform SHALL NOT cancel the others. The final release SHALL publish whatever artifacts survived, and a separate overall status SHALL still report failure when any platform failed, so a partial release is visible." The first half holds — the two jobs are independent. The second does not. REQ-STARTUP-035's element (4), "Not built in this release: …", is written for exactly that case and is unreachable.

## Relevant files

- `.github/workflows/release.yml` — `sign`'s `needs: [build, build-linux]`; `status`.
- `tools/release-pipeline/assets.mjs` — `PUBLISHED_PLATFORMS`, `readReleaseDirectory`, `verifyReleaseDirectory`, which take the whole set by default.
- `tools/release-pipeline/body.mjs` — element (4), built and tested, and never reached from the workflow.
