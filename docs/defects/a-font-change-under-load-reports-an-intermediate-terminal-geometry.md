## A font change under load reports an intermediate terminal geometry before the final one

`pnpm terminal-proof`'s `theme.remeasureReportsOnce` failed once on the `fix-terminal-output` branch (2026-09-29,
115/116, as root under Xvfb, another workflow's built app running on the host at the same time). It passed 116/116
when run again at once with nothing else in this worktree running. After `window.__terminalProof.font(16)` the proof
waits 400 ms and expects exactly one new geometry report with fewer columns. It saw two: `118×25`, then `89×19`, from
`118×26` (`data-geometry-reports` went from 1 to 3). The grid seems to have been measured once while the new face was
only partly applied, reported that shape, and then reported the final one.

It is not known whether the product or the proof is at fault. The product may report a shape that no settled layout
had, or the proof's 400 ms settle may be too short under load for the measurement to settle before it counts. The
branch's change (the renderer's `applyFrame` re-open row, live-run L9) does not touch geometry, the font or the
re-measure.

## Specs

- `REQ-SHELL-100`: after a theme change the cell size is re-measured and the grid dimensions are re-reported, "only
  when they change", and only while the grid is "meaningfully laid out". An intermediate `118×25` reported between
  the old and the new face would be a report of a shape the settled layout never had, and a running command would
  briefly be resized into it.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs`: the `theme.remeasureReportsOnce` check (font 16, `pause(400)`, then
  exactly one new report).
- `packages/ui/src/terminal/TerminalGrid.tsx` and `geometry.ts`: the grid's re-measure on a face change and its geometry
  report (`data-geometry-reports`).
