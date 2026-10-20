## injection-proof's isolated launch compares a CRLF checkout with the committed LF text

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-confinementr` at `143b2010` and `C:/dev/Rotaris-crw-wt-loc1-confinementr-base` at `0d89e971`
(2026-10-20/21, plan loc1, bundle `loc1-confinement-retro`), with the host's global `core.autocrlf=true`. Recorded, not
repaired: this plan repairs no Windows-only red.

`pnpm injection-proof`'s `isolated` launch (REQ-WORKSPACE-050) starts an isolated session, whose worktree Git checks out under the
host's configuration, and requires each workspace instruction file's block — `<!-- source: <path> -->` then the committed text —
to reach the model whole. With `core.autocrlf=true` the worktree's `AGENTS.md` is checked out with CRLF line endings (`od -c`
reads `\r\n` after its first line), so the text the model is given is the CRLF file's, and the proof's comparison with the
committed LF text fails: "isolated: PRESENCE — workspace:AGENTS.md's block (…/.rotaris/worktrees/<id>/AGENTS.md) was not received
whole". Red on both trees, three times (a loaded sweep, then alone on each at a CPU load of 48 to 65 %). The product read the file
the worktree holds, which is what REQ-WORKSPACE-050 asks; the proof's expectation does not allow for the checkout's line endings.

## Specs

None contradicted by the product, as far as the reading goes; whether an injected instruction file's CRLF endings should be
normalized is not stated (REQ-WORKSPACE-050 names the execution root's files).

## Relevant files

- `apps/desktop/scripts/injection-proof.mjs` — `assertReceived` (`blockOf`) and the `isolated` launch's `isoText` (the committed text).
- the scratch workspace's Git repository, created by the proof, which inherits the host's `core.autocrlf`.
