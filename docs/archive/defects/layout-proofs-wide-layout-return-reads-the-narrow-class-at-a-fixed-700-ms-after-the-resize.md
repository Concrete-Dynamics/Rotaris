## layout-proof's wide-layout return reads the narrow class at a fixed 700 ms after the resize

`apps/desktop/scripts/layout-proof.mjs` step 4 ("Back up, to prove the breakpoint is not a one-way trip") resized the
maximized window to 1400×900, slept 700 ms and read the Workspace's class once. On 2026-11-04 at 00:15, in `pnpm
worktree:land`'s proof run on `c06e8f17` (Windows 11 ARM64, Node 26.13.0, the host at 97 % CPU with four Electron and
fourteen Node processes of two sibling sessions), the read came 700 ms after the resize and still held `workspace--narrow`
with 1 column track against 1 declared — the layout had not caught up with the un-maximize and the resize — so the landing
stopped with nothing pushed. The same script on the same head and tree alone, 90 s later: 28 passed, 0 failed, 20 s. The
step's earlier transitions (1400 → 1000, the maximize) read after the same fixed sleep and passed; the breakpoint itself is
sound (REQ-MONITOR-051). A fixed offset where a condition should be waited for: the shape `AGENTS.md`'s "Driving the built
app" names as the reason the driver's `waitFor` exists ("fixed offsets have produced false reds three times"). Noticed
2026-11-04 while landing the Overview audit's execution (R-093).

## Specs

- REQ-MONITOR-051 (the drawer layout below 1180 px) holds: the narrow class engaged at 1000×680 and the wide layout returned,
  read alone 20 s later; what failed was the harness's reading time.
- `AGENTS.md`, "Driving the built app — `pnpm app:drive`": a step that needs a condition should `waitFor` it rather than sleep.

## Relevant files

- `apps/desktop/scripts/layout-proof.mjs` — step 4, the `sleep(700)` before the "1400×900 again" check.
- `apps/desktop/scripts/lib/driver.mjs` — `until`, the bounded wait the step takes instead.
- `docs/defects/the-windows-gate-goes-red-on-a-different-test-each-time-on-one-tree.md` — the same day's loaded-host readings
  of the unit gate.

## Outcome — repaired 2026-11-04 (the Overview audit's execution branch, with the landing it stopped)

Step 4 waits for the wide layout with `until`, bounded at 10 s — the measurement it accepts: no `workspace--narrow` and every
column track declared — and reads once more if the bound passes, so the check fails with the reading rather than with a
thrown wait. The first green of the repaired step: `pnpm layout-proof -- --skip-build` on the rebased head in the branch's
tree, 28 passed, 0 failed; then the landing's own run on the same head.
