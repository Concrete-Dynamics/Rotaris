## plan-gate-proof's Tab from the edit toggle does not reach the capped "You asked for" line on Windows

`pnpm plan-gate-proof` stops on this host at its keyboard check of the capped "You asked for" line: "Tab from the part before
the capped "You asked for" line did not reach it … focus went to {"reached":false,"active":"strip-btn"} from
"plan-gate-toggle-edit"". Focus left the gate for the strip, so either a keyboard user cannot reach that line, or the proof's
window does not make the line overflow and so never gives it a tab stop. Which of the two is not established. Seen 2026-11-01 on
Windows 11 ARM64 (build 26300), Node 26.13.0, both on `fix/workspace-open-warmup-off-the-loop` and on a control build of `main`
at `a9e1f29b`, so that branch did not cause it. The proof stops here, so its later checks did not run. The note on this proof's
window height, `plan-gate-proofs-window-reads-1000x682-where-1000x680-is-asked-on-windows.md`, is a different reading and may
or may not be related.

## Specs

PD-ORCH-002 revision 3, as the proof quotes it: the line scrolls inside itself, and a keyboard user must reach it.

## Relevant files

- `apps/desktop/scripts/plan-gate-proof.mjs`: the check, at line 494 on `a9e1f29b`.
- `packages/ui/`: the plan gate's surface, which draws the toggle and the capped line.
