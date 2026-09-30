## The driver's `shot` can return a stale frame

`pnpm app:drive shot` taken right after a click, a navigation or a dialog's close can return the frame from before the
change: twice in one drive a PNG was byte-identical to an earlier one while `eval` in the same step showed the new DOM,
and once it showed the Git view after the Workspace was active. A one-pixel resize before the shot forces a repaint and
cures it. A drive that trusts `shot` alone can record false evidence; the JSON probes of the same step are authoritative.

Found 2026-09-28 by the built-app drive of the merged revision 4 build (R-065).

## Specs

None: the driver is a verification tool (AGENTS.md, "Driving the built app").

## Relevant files

- `apps/desktop/src/main/driver.ts` — `shot`, which calls `webContents.capturePage()` with no repaint first.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Confirmed first on the unrepaired build (`9afe66f`): in one launch, 39 navigations
across the rail were each shot straight after the click. The first one, Overview to Workspace, returned the Overview's
bytes.

The cause is not a stale document. When the paint wait began, the document already showed the Workspace. The cause is
the frame pipeline: `capturePage()` copies the frame the renderer last submitted, and the Workspace's first paint is
still being rastered after the next frame begins. In fresh launches, a shot straight after the first navigation to the
Workspace showed the Overview:

| Frames waited | Stale shots | Machine |
| --- | --- | --- |
| 1 | 16 of 20 | quiet |
| 2 | 12 of 52 | quiet |
| 3 | 0 of 40 | quiet |
| 3 | 1 of 20 | three of four cores busy |
| 4 | 0 of 55 | 20 quiet, 20 with three cores busy, 15 at a load average near 20 |

`screenshot` in `apps/desktop/src/main/driver.ts` now waits for four of the renderer's frames (`PAINT_FRAMES`,
`PAINTED_SCRIPT`), and then captures. A window that presents no frame is captured after `PAINT_BOUND_MS` (1 s), and the
reply's `painted` says whether the paint was confirmed. `webContents.invalidate()` was not used: Electron documents it
for offscreen rendering only.

Pinned by `driver.test.ts`: the paint is asked for before the capture, and a window that never paints is captured at
the bound with `painted: false`. Both fail on the unrepaired code. `driver-proof` shoots each of the seven views
straight after its click, and every shot differs from the one before it. It also shoots the second launch's first
navigation to the Workspace, the measured case, and that shot differs from the Overview's.

**What the wait cost a neighbour.** `theme-proof` reads a view's text metadata and then shoots it. Before this repair
the capture came straight after the read. The four frames opened a gap between the two, and a surface that mounted in
that gap moved every text below it. The startup notice "No model provider is authenticated yet" put the Workspace's
texts about ninety pixels lower in the picture than in the metadata, and 2 to 4 of the 15 theme × scale runs read
contrast ratios of 1:1. The same build without this repair passed 15 of 15. `theme-proof` now reads the metadata on
both sides of the shot, retakes it (at most three times) until the two readings agree, and measures the second one. A
capture that never agrees is reported as `incoherentCaptures` and fails the contrast item. With that change it passed
15 of 15, with no incoherent capture.
