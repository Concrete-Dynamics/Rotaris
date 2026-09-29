## The setup dialog takes a background run as its own, draws its progress and refuses Escape

The coordinator keeps one run report per workspace and publishes it with the initialization state, whichever run it
describes. The setup dialog (`packages/ui/src/ProjectSetupDialog.tsx`) reads its state from that report alone:
`setupDialogState` answers `running` whenever `report.running` is true. So when the **background** run of
REQ-WORKSPACE-083 is live while the consent dialog is open, the dialog switches to its running state for a run the user
never asked for. The card reads "Running", the intro is removed, both buttons lock, the progress log is drawn, and the
Escape handler and `dismiss` both return early on `running`. The same report also puts an open dialog into its error
state when a background run fails. Beside it, the window's two readings of "the prompt is due"
(`apps/desktop/src/renderer/main.tsx`: the auto-open effect and the composer gate) treat any run in progress as
withdrawing the prompt. While the background run is live the composer gate is lifted, and a mount read taken in that
interval does not open the dialog.

It shows in two orders, both reproduced red by the fix round's verifier on 2026-09-29 (`init-proof`, Linux as root
under Xvfb, Node 24, `--skip-build`, at `0551f33`, with another agent's Electron proofs on the host). Six runs gave
PASS, PASS, red, red, PASS, PASS, so the proof was never green three times in a row.

1. **The skip's own resolution (new with `10fb898`).** A skip that arrives before the open's resolution now performs that
   resolution first (OQ-109). The resolution starts the background run and publishes `running: true` while the skip is
   still in flight. The dialog stays mounted until `onSkip` answers, so it redraws as running under the user's own
   Escape. Run 3: Escape at .321, `running code-intelligence-setup … (background)` at .329, the proof's dialog probe at
   .353 reading `{headline: 'Set up this project?', intro: null, word: 'Running', send: false}`, then `skipped
   verification-consent` at .359. It failed with "the dialog intro read null". The builder's own passing runs had the
   probe 2 ms and 5 ms after the same line.
2. **The resolution first (on `main` as well).** Run 4: the slot's resolution at .635, the background run at .655, the
   dialog (auto-opened from the mount read) matched at .796, and Escape at .797. The dialog was already in its running
   state, so Escape was ignored and **no skip was ever recorded**. The consent decision was dropped, and the run failed
   with "the dialog intro read null".

The branch's records claimed more than this. AGENTS.md's `init-proof` row said scenario 3 holds "whichever comes first,
the dialog from the window's mount read or the resolution". The repaired note and ADR-0064 listed the resolution-first
order only as "not shown" on Windows. Order 2 was reproduced red here, on Linux.

## Specs

- **REQ-WORKSPACE-103**: background tasks start "without any dialog …; nothing renders their progress live", and a
  failed background run reaches a banner. The dialog drew the background run's status word, locked buttons, status line
  and log live, and would take its failure as its error state.
- **REQ-WORKSPACE-107**: "dismissing with Escape … SHALL resolve as a skip". In order 2, Escape resolved as nothing.
- **REQ-WORKSPACE-110**: "Pressing Initialize while a run is already live SHALL start nothing and flip the dialog to its
  in-progress state." The dialog reaches its in-progress state for a run it did not start **when Initialize is
  pressed**. It is not already in that state beforehand, and a dialog that shows a live run already offers no Initialize to
  press.
- **REQ-WORKSPACE-106**: the four states run prompt → running → done | error, and running follows the user's
  Initialize. Here the dialog went from prompt to running with no answer.
- **REQ-WORKSPACE-083**: the background start list is produced "regardless of whether a prompt is also due", so the
  prompt and a live background run coexist. The window read "a run is in progress" (REQ-WORKSPACE-105) as withdrawing
  the prompt for the background run too. That lifted the composer gate of REQ-WORKSPACE-112 while the consent task was
  unanswered, and made the dialog's opening depend on when the mount read landed. Which run REQ-WORKSPACE-105's "no run
  is in progress" means is the next open question on this branch, OQ-110.

## Relevant files

- `packages/ui/src/ProjectSetupDialog.tsx`: `setupDialogState`, `dismiss`, the Escape handler, `taskWord` over the shared
  report.
- `apps/desktop/src/main/initialization.ts`: `run` (one `report` per workspace, background or not), `viewFor`, and
  `skip` → `resolve(true)` since `10fb898`.
- `packages/contracts/src/initialization.ts`: `InitializationStateSchema`, which carries the report with nothing saying
  which run it describes.
- `apps/desktop/src/renderer/main.tsx`: `promptDue` and `setupPromptDue`, the composer gate's and the auto-open's
  readings.
- `apps/desktop/scripts/init-proof.mjs`: scenario 3, whose probe and Escape both fire when the dialog matches, so their
  order was not fixed.
