## The PowerShell shell-exit case exceeds its wall-clock bound under full-gate load

`packages/agent-tools/src/terminal/terminal.test.ts` — "REQ-TOOLS-097/098/100/103 (OQ-144): a command that ends the
session's shell ends at once as an execution_error, never a soft pause, and the next call reports the respawn with the
shell state restored" — asserts that each of its five PowerShell enders returns within 5,000 ms (line 1031, `PS ? 5_000
: 1_500`) and measured **5,323.8 ms** for the first of them, `exit 3`:

```
AssertionError: exit 3: 5323.802800000001 ms: expected 5323.802800000001 to be less than 5000
 ❯ packages/agent-tools/src/terminal/terminal.test.ts:1031:48
```

Seen 2026-10-19 in `pnpm check` (started 21:30:56, 278.9 s) of the `handoff-truthfulness` worktree at `10bf3c55`:
one failure in 6,805 tests — one file red, 461 green, 6 skipped. The host was carrying its parallel work: thirteen
further worktrees with their agents' bundles, 18 node processes and a sampled processor load of 99 % right after the
run, on eight logical processors (this Windows ARM64 host). The reading before the bound was right — the assertion at
line 1030 (`outcome_kind` is not `soft_pause`) passed; the call was told it ended the session's shell — only the wall
clock missed: the case's comment (lines 1011 to 1013) records ConPTY reporting the shell's end in "about 1.5 s
(measured under pwsh 7.6.6 and 5.1)" on this host, inside the 6,000 ms window the case arms (line 1015), and under the
suite's load the same detection took about 3.5 times that figure.

Run alone straight after, the case **passed three times in a row** (`pnpm exec vitest run
packages/agent-tools/src/terminal/terminal.test.ts -t "ends at once"`; 11.5 to 18.1 s each including boot and
collection; sampled load 100 % before and 16 % after). It is the load shape OQ-144's family has met twice before —
[the argc-0 note](fixed/the-argc-0-identity-test-reads-cmdline-before-the-exec-has-set-its-arguments.md) and
[the soft-pause under-load note](fixed/a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md)
— both recorded from an unrelated bundle's gate and both left unrepaired until their own work took them.

Seen again 2026-10-31 in `pnpm check` (295.3 s, 7,233 tests, this the one failure) of the `confident-kepler-16f989`
worktree on the owner's Windows 11 Home ARM64 host (build 26300, Node 26.13.0 arm64, 8 logical processors), gating a change to the adoption suite only:
the fifth ender, `Write-Output 'bye'; exit 3`, measured **6,526.0 ms** against the same 5,000 ms bound, and the
reading before it was again right (`outcome_kind` not `soft_pause`). The file alone took 293 s inside the suite; rerun alone straight after (`pnpm vitest run` on the file, 231 s), 93 passed and 42 skipped, the case among the green.

Not repaired: noticed while gating an unrelated change; recording only. Whether the bound should move — it can be
exceeded by the host's load alone, with the reading itself correct — is a decision for the work that owns this case.

## Specs

None contradicted: REQ-TOOLS-097, REQ-TOOLS-098, REQ-TOOLS-100 and REQ-TOOLS-103 with OQ-144
([docs/architecture/open-questions.md](../architecture/open-questions.md)) held. What failed is the test's wall-clock
bound under load, the same timing sensitivity the two notes above record.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the case (line 1014), its ender loop and bound (lines 1020
  and 1031), the idle measurement in its comment (lines 1011 to 1013).
- `packages/agent-tools/src/terminal/foreground.ts` — the shell-exit detection whose wall time the bound measures.
