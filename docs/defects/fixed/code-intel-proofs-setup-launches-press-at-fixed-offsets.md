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

## Repaired 2026-09-28 under R-062

*The heading carries the date this repair round was set under. The defect was recorded, repaired and measured on
2026-09-29.*

**What changed.** `apps/desktop/scripts/code-intel-proof.mjs` only. Each setup launch now presses `MCP Servers` again
at 3 s and at 6 s, if it is still not the selected category. The selector is
`.nav-list__item:not(.is-selected)>>MCP Servers`, so a press that finds it selected matches nothing and presses
nothing. The seam's own press, at about 800 ms, stays as it is; it is shared, and its note stays open
(`docs/defects/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`). Start is pressed as soon as
`button[data-action="setup-start"]:not([disabled])` is drawn, which is once the setup status has arrived, with a 30 s
deadline. `setup-cancel` presses Cancel as soon as it is drawn, with the same deadline. That is when the run host has
reported `create` running, and the step's child is spawned in the same turn as that report. No assertion changed.

**What pins it.** The proof is harness code with no unit beside it. Two runs show the repair works:
- **The correction path, forced.** A temporary copy of the proof pointed the seam's press at `Instructions`. It was
  run once as `--steps=5` (238 s) and then deleted. All five setup launches passed. In each, the 3 s press moved Settings
  back to MCP Servers; the 6 s press found it selected and pressed nothing. In the first launch, Start was drawn only
  after that correction, and was pressed then.
- **Three consecutive runs** of the whole proof on 2026-09-29 (522 s, 521 s, 524 s), as root under Xvfb, Node 24,
  `--skip-build`. Every section passed. In run 1's `setup-broken`, the notice banner came 95 ms after Start was pressed.
  It deflected the seam's category press again, and the 3 s press put Settings back on MCP Servers before the probe
  read the card. Another agent's Electron proofs were running on the host during runs 2 and 3 (8 and 14 of its
  processes at the runs' ends), and none during run 1.

**Not shown:** anything on Windows.
