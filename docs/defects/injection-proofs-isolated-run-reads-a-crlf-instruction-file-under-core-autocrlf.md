## injection-proof's isolated run reads a CRLF instruction file where Git's core.autocrlf is true

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-terminalkill` at `0c1b3641` and its fork point `0d89e971` (a detached tree built for the
comparison), Electron 44.1.1 arm64, dev tree, Git for Windows with `core.autocrlf=true` set in its system configuration
(`C:/Program Files/Git/etc/gitconfig`, the installer's default). Recorded 2026-10-20 by plan loc1's builder of
`loc1-terminal-kill`, running `injection-proof` because `pnpm verify:plan` names the Tools suite for that bundle's diff;
record-only, never repaired by this plan.

`node apps/desktop/scripts/injection-proof.mjs --skip-build` went red the same way in four runs, two at each head (CPU load
52 % to 100 % before the launches, 8 to 27 Electron processes of other trees running): scenario 4, `isolated`, refuses with
`isolated: PRESENCE — workspace:AGENTS.md's block (<workspace>\.rotaris\worktrees\<sid>\AGENTS.md) was not received whole`.
Scenarios 1 to 3 passed. The isolated run works in a Git worktree the product checks out under `.rotaris/worktrees/<sid>`,
and on this host that checkout converts the committed `AGENTS.md` to CRLF: its bytes read `# workspace:AGENTS.md\r\n…`, while
the workspace's own copy, which the proof wrote, reads `…\n`. The proof compares the block the model received with the
committed text it generated, in LF (`isoText`: `body(id, 'committed')`, through `assertReceived`'s `blockOf`), so a CRLF file
the product injects as read cannot match. Whether the product should inject a CRLF instruction file's text as read (it then does what it should, and the
proof's expectation is the host-bound part) or the isolated checkout should honour the workspace's own line endings is not
decided here. The path is specific to a Windows Git configuration (`core.autocrlf=true`); not measured with it unset.

## Specs

REQ-WORKSPACE-041 and `PD-WORKSPACE-002` (which instruction files are injected, and whole); REQ-WORKSPACE-050 (an isolated
run reads the workspace files from its execution root). No requirement is
shown wrong: the red is between the host's Git line-ending conversion and the proof's byte-for-byte expectation.

## Relevant files

- `apps/desktop/scripts/injection-proof.mjs` — scenario 4 (`isolated`), `isoText`, `assertReceived`, `blockOf`.
- `.proof/injection-proof/scratch/workspace/.rotaris/worktrees/<sid>/AGENTS.md` — the CRLF checkout the run injected (proof
  evidence, not committed).
