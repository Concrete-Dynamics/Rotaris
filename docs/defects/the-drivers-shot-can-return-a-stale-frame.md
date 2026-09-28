## The driver's `shot` can return a stale frame

`pnpm app:drive shot` taken right after a click, a navigation or a dialog's close can return the frame from before the
change: twice in one drive a PNG was byte-identical to an earlier one while `eval` in the same step showed the new DOM,
and once it showed the Git view after the Workspace was active. A one-pixel resize before the shot forces a repaint and
cures it. A drive that trusts `shot` alone can record false evidence; the JSON probes of the same step are authoritative.

Found 2026-09-28 by the built-app drive of the merged revision 4 build (R-064).

## Specs

None: the driver is a verification tool (AGENTS.md, "Driving the built app").

## Relevant files

- `apps/desktop/src/main/driver.ts` — `shot`, which calls `webContents.capturePage()` with no repaint first.
