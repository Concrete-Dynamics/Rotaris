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
  (`docs/defects/fixed/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`, repaired 2026-09-29 under R-067).
- `packages/ui/src/settings/McpSettings.tsx`: `SetupCard`, where the start control is disabled until the status arrives.

## Repaired 2026-09-28 under R-062

*The heading carries the date this repair round was set under. The defect was recorded, repaired and measured on
2026-09-29.*

**What changed.** `apps/desktop/scripts/code-intel-proof.mjs` only. Each setup launch now presses `MCP Servers` again
at 3 s and at 6 s, if it is still not the selected category. The selector is
`.nav-list__item:not(.is-selected)>>MCP Servers`, so a press that finds it selected matches nothing and presses
nothing. The seam's own press, at about 800 ms, stays as it is; it is shared, and its note stays open
(`docs/defects/fixed/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`; repaired 2026-09-29 under R-067). Start is pressed as soon as
`button[data-action="setup-start"]:not([disabled])` is drawn, which is once the setup status has arrived, with a 30 s
deadline. `setup-cancel` presses Cancel as soon as it is drawn, with the same deadline. That is when the run host has
reported `create` running, and the step's child is spawned in the same turn as that report. No assertion changed.

**What pins it.** The proof is harness code with no unit beside it. Two runs show the repair works:
- **The correction path, forced.** A temporary copy of the proof pointed the seam's press at `Instructions`. It was
  run once as `--steps=5` (238 s) and then deleted. All five setup launches passed. In each, the 3 s press moved Settings
  back to MCP Servers; the 6 s press found it selected and pressed nothing. In the first launch, Start was drawn only
  after that correction, and was pressed then.
- **Three consecutive runs** *(corrected below: this repair did not hold, and the three runs were not what the branch
  does)* of the whole proof on 2026-09-29 (522 s, 521 s, 524 s), as root under Xvfb, Node 24,
  `--skip-build`. Every section passed. In run 1's `setup-broken`, the notice banner came 95 ms after Start was pressed.
  It deflected the seam's category press again, and the 3 s press put Settings back on MCP Servers before the probe
  read the card. Another agent's Electron proofs were running on the host during runs 2 and 3 (8 and 14 of its
  processes at the runs' ends), and none during run 1.

**Not shown:** anything on Windows.

## Reopened by the fix round's verifier, and repaired again 2026-09-29 under R-062

**What the verifier found.** On the build at `1b969b4`, with no sweep-worktree Electron running, three full runs went
red, pass, pass, and four `--steps=5` runs went red, pass, red, pass. All three reds were in `setup-cancel`:
`[create succeeded, skipped-no-code, skipped-no-code] — 'Completed…'`. Each log shows one mechanism. Start, pressed as
soon as it was drawn enabled, was pressed at about the same instant as the open's notice and the seam's shared category
press. Cancel matched (`…setup-cancel"] matched`), the notice drew 5 ms later, and 23 ms after that the press found
`no "button[data-action="setup-cancel"]" control on screen`. The seam's press, read before the notice and delivered
after it, had put Settings on a category above, so the card and its Cancel had left the screen. The press gave up.
The 3 s correction put Settings back 2.3 s later, but `create` had succeeded by then (about 1.8 s), and there was nothing
left to cancel. So the first repair made the presses wait for their controls, but did not make `setup-cancel` measure
REQ-MCP-112's cancel reliably. The "three consecutive runs" above were true of the runs made, not of the branch.

**What changed.** `apps/desktop/scripts/code-intel-proof.mjs` only; no assertion changed. The setup launches no longer
use `ROTARIS_CAPTURE_VIEW=7`, whose category press is the shared seam's (its note stays open, since nine proofs still
use it). They open Settings with the `Ctrl+7` chord (`ROTARIS_CAPTURE_CHORDS`), which has no point to miss. Every press
in them waits for the open's persistent notice to have drawn: the selectors start `body:has([data-testid="notice"])`,
so no point is read before the one shift of the launch. `MCP Servers` is pressed only if it is not the selected
category; Start is pressed when it is drawn enabled; Cancel when it is drawn. The 3 s and 6 s corrections are gone,
since nothing now presses the list before the notice. Every one of the 20 setup launches measured below had exactly
one notice. A launch whose Start was never pressed now fails with that fact, and says whether the notice drew
(`settledPresses`), instead of an unexplained step list.

**What pins it.** Harness code, no unit beside it; measured as root under Xvfb, Node 24, `--skip-build` on the build
at `a8761f0`:
- **Four `--steps=5` runs in a row** passed (238 s, 239 s, 242 s, 239 s). In all 20 setup launches Start was pressed
  31 to 123 ms after the notice drew. In each run's first launch Settings opened on another category and `MCP Servers`
  was pressed after the notice; in the other four it opened on MCP Servers and the category step matched nothing.
  Cancel was pressed in all four `setup-cancel` launches, while `create` ran, and each read `failed, not-attempted,
  not-attempted — Cancelled`. Another agent's Electron processes (8) were on the host at the start or end of three.
- **Three full runs in a row**, after those four, passed (529 s, 528 s, 524 s). Every section passed, the window
  check recorded not measured on linux with its reason, and the drift was refused. In their 15 setup launches Start
  was pressed 41 to 128 ms after the notice, each launch had one notice, and each `setup-cancel` pressed Cancel and
  read `Cancelled`. Another agent's Electron processes were on the host at the end of runs 1 and 2 (8 and 16) and at
  the start of runs 2 and 3.

**Not shown:** anything on Windows. The notice is the launch's precondition here: a profile with an authenticated
provider raises no such notice, and these presses would wait for it until their deadline and fail by name.

