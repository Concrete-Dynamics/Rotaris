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

## Outcome — repaired 2026-10-01 (R-067)

**The product was at fault, not the proof's 400 ms.** The intermediate shape is ADR-0047's defect fifty-five come back.
Its repair silenced the resize observer only while a re-measure was pending, and the pending flag was raised by the
layout effect React runs for the theme change. React renders that change in a scheduler task of its own, so a frame
falling between the root's style change and that task lays out the grown header and runs the observer first. The
observer then measured the shrunk host against the cell the library still drew with the 12 px face. Its cols stayed
118 because the header grew in height only, and its rows went from 26 to 25.

**Reproduced.** Twelve runs of the proof beside six busy loops (load average 6.8 to 17, the other plan's agents on the
host too) all passed `theme.remeasureReportsOnce`. A face change made inside a `requestAnimationFrame` callback forces
the order. On the code before the repair it reported `118×26`, `118×25`, `89×19` on three runs out of three.

**Repaired.** `packages/ui/src/terminal/geometry.ts`'s `RemeasureGate` remembers the face it last gave the library. A
resize or visibility observation whose face differs from the root's applies the new face first and measures once, in
the frame after. `TerminalGrid.tsx` sends both the layout effect and the observers through it.

**Pinned.** `packages/ui/src/terminal/terminal.test.ts`, "geometry — a face change re-measures against the new cell
only": five cases, two of which fail with the face comparison removed (the first reports `118×25`).
`apps/desktop/scripts/terminal-proof/main.cjs` has a second check, `theme.remeasureReportsOnceAtFrame`, which makes the
face change inside the frame. It failed on the code before (two runs out of two). On the repair as committed it passed three runs alone and twelve beside
the busy loops (load average 4.8 to 14.9), as did `theme.remeasureReportsOnce`; an earlier wiring of the same gate
passed twelve more at 11.6 to 18. The reasoning
is reported back in [ADR-0047](../../architecture/adr/0047-the-terminal-grid-surface.md), "The re-measure under load —
2026-10-01".
