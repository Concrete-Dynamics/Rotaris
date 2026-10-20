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

Seen again by plan loc1's bundle `loc1-terminal-kill` (2026-10-20/21): its builder met the same refusal in four runs, two in `C:/dev/Rotaris-crw-wt-loc1-terminalkill` at `0c1b3641` and two at the fork point `0d89e971` (CPU load 52 to 100 %, 8 to 27 Electron processes of other trees), with Git for Windows' `core.autocrlf=true` in its system configuration (`C:/Program Files/Git/etc/gitconfig`, the installer's default), and its reviewer once more in the landing tree `C:/dev/Rotaris-crw-wt-integ-loc1-loc1-terminalkill` at `edd65901` (CPU 100 %, 12 others). That bundle had recorded it as `injection-proofs-isolated-run-reads-a-crlf-instruction-file-under-core-autocrlf.md`; the copy was folded into this note at its landing.

**Also seen 2026-10-20 by loc1's `rename` bundle (`loc1-rename`)**, `C:/dev/Rotaris-crw-wt-loc1-rename` at `983a6baf`, running the
suites `pnpm verify:plan` named for its diff: `node apps/desktop/scripts/injection-proof.mjs --skip-build` failed at its fourth launch
with the same "isolated: PRESENCE" message (CPU load 62 % at the start, thirteen other trees' Electron alive). There the conversion
came from Git for Windows' own system configuration (`core.autocrlf=true` in `C:/Program Files/Git/etc/gitconfig`). That bundle
recorded it under another name, which its review folded into this note at landing (one defect, one note).

## Specs

None contradicted by the product, as far as the reading goes; whether an injected instruction file's CRLF endings should be
normalized is not stated (REQ-WORKSPACE-050 names the execution root's files).

## Relevant files

- `apps/desktop/scripts/injection-proof.mjs` — `assertReceived` (`blockOf`) and the `isolated` launch's `isoText` (the committed text).
- the scratch workspace's Git repository, created by the proof, which inherits the host's `core.autocrlf`.
