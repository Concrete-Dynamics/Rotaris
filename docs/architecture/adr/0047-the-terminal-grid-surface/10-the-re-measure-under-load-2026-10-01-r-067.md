# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — The re-measure under load — 2026-10-01 (R-067)

Part 10 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## The re-measure under load — 2026-10-01 (R-067)

*Defect fifty-five came back: `pnpm terminal-proof`'s `theme.remeasureReportsOnce` failed once under load with the same
three shapes, `118×26`, `118×25`, `89×19`
([note](../../../defects/fixed/a-font-change-under-load-reports-an-intermediate-terminal-geometry.md)).*

**The cause.** The repair above silenced the resize observer only once the theme-change layout effect had run. That
effect runs when React renders the root's mutation, and React renders it in a scheduler task, not in the mutation
observer's microtask. When a frame falls between the style change and that task, the frame lays out the grown header,
the observer runs with no re-measure pending, and it measures the shrunk host against the cell the library still draws
with the old face. Load made that order likely but not certain: twelve runs of the proof beside six busy loops (load
average 6.8 to 17) all passed. Making the face change inside a `requestAnimationFrame` callback forces the order, and
on the code before the repair it reported `118×25` on three runs out of three.

**The repair.** `geometry.ts`'s `RemeasureGate` sits between every measurement and the library. It remembers the face it
last gave the library, and each resize or visibility observation compares that with the face the root names now. A
different face is applied there and then, and the grid is measured once, in the frame after. The layout effect calls
the same gate, so whichever of the two paths sees the change first, one shape is reported. The library re-measures its
own cell synchronously on the option change (`CharSizeService.measure` on `fontFamily`/`fontSize`), so one frame is
enough and no settling over several frames was added.

**Pinned.** Five `terminal.test.ts` cases drive the gate over a modelled host and cell. Two of them fail with the face
comparison removed, the first reporting `118×25` exactly. The proof has a second check,
`theme.remeasureReportsOnceAtFrame`, which makes the face change inside the frame. It failed on the code before (two
runs, three reports each). On the repair as committed it passed three runs alone and twelve beside the busy loops (load
average 4.8 to 14.9), as did `theme.remeasureReportsOnce`; an earlier wiring of the same gate passed twelve more at 11.6
to 18.

**Could not show.** Windows and macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*). A face still loading when it is applied would change the cell after the
measurement. The mono face is bundled but declared `font-display: swap` (`packages/ui/src/fonts.css`), so this could
happen at first paint. The gate does not watch font loading, and this round did not measure that case.
