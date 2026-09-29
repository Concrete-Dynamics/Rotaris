## code-intel-proof's setup launches press their controls at fixed offsets

Section 5's five setup launches reach the MCP Servers card in three steps. The capture seam's `ROTARIS_CAPTURE_VIEW=7`
presses Ctrl+7 at 600 ms and the `MCP Servers` category 200 ms later, both at fixed times. The proof then presses
`button[data-action="setup-start"]` at 2500 ms, and `setup-cancel` presses Cancel at 3300 ms, also at fixed times.
None of the three waits for what it presses.

Measured 2026-09-29 on Linux as root under Xvfb, Node 24, in the second of three consecutive runs in
`/home/user/Rotaris-crw-wt-prfb5` (the fix round for R-062). No other Electron process was running when the run
ended. `setup-again` failed with `setup-again: the launch logged no setup step within its window; exit unknown,
5790 log bytes`. Its log shows the window loaded at +0 ms and main logged `notice: No model provider is authenticated
yet` at +976 ms. At +2676 ms the log reads `capture: no "button[data-action="setup-start"]" control on screen`. Its
screenshot shows Settings open on **Instructions**, two rows above MCP Servers. The notice banner drawn above the
Settings view is about two rows tall. It arrived at the same moment as the category press and moved the list down
between the seam's read of the point and the press. In the four other setup launches of that run, and in every launch
of runs 1 and 3, the notice came at +970 to +1000 ms and the press landed. The builder's four passing runs had the same
timings. So this red is a race at a fixed offset, not a product fault: the setup itself was never started.

Two more presses in the same launches have the same shape. The start control is drawn **disabled** until the setup
status arrives (`SetupCard`, `disabled={setup === null}`), so a press at 2500 ms on a slow host clicks nothing. Cancel
at 3300 ms means "800 ms after start" only while start lands at exactly 2500 ms.

## Specs

None contradicted: the product drew the card and would have run the setup. The proof stands for REQ-MCP-099 and
REQ-MCP-112 (setup, its steps, cancel while running) and ADR-0035's consequences, and a red here says nothing about
them.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs`: `SETUP_ENV`'s `ROTARIS_CAPTURE_CLICKS` and `setup-cancel`'s override.
- `apps/desktop/src/main/capture/seams.ts`: the `ROTARIS_CAPTURE_VIEW=7` category press, which nine other proofs share
  (`docs/defects/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`).
- `packages/ui/src/settings/McpSettings.tsx`: `SetupCard`, where the start control is disabled until the status arrives.
