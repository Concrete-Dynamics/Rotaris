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
   resolution first (OQ-118). The resolution starts the background run and publishes `running: true` while the skip is
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
  is in progress" means is the next open question on this branch, OQ-119.

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

## Repaired 2026-09-28 under R-062

*The date is the one this repair round was set under. The note was recorded, repaired and measured on 2026-09-29.*

**What changed.**
- `InitializationStateSchema` (`packages/contracts/src/initialization.ts`) carries `backgroundRun` beside the report.
  It says whether the report describes a run the resolution started for background tasks. The coordinator sets it in
  `run` and publishes it in every view (`apps/desktop/src/main/initialization.ts`). REQ-WORKSPACE-105's nine values are
  unchanged.
- The dialog draws its state from `dialogReport` (`packages/ui/src/ProjectSetupDialog.tsx`). For a background run
  that is an empty report until Initialize is pressed. Pressing it while such a run is live starts nothing and flips
  the dialog to that run (REQ-WORKSPACE-110). Before that, the dialog stays in its prompt state with Skip and Escape
  live, and a failed background run stays on its banner.
- `setupPromptDue` is now the one reading of "the prompt is due", used by the window's auto-open and by the composer
  gate (`apps/desktop/src/renderer/main.tsx`). A background run neither withdraws the prompt nor lifts the gate. The
  reading is **OQ-119**, raised.
- `init-proof`'s scenario 3 reads the dialog before its Escape: the reading marks the document and the key waits for
  the mark. No assertion changed. The AGENTS.md row no longer claims scenario 3 held in both orders.
- The fix is in what the window draws, not in holding main's publishes during a skip, because a push can reach the
  window after the command's reply whatever order main sends them in.

**The tests that pin it.**
- `packages/ui/src/settings/project-init.test.ts`, "the project setup dialog beside a background run", 4 cases:
  1. no report is drawn for a background run, live or failed;
  2. it is drawn once Initialize has been pressed, and a user-started run is always drawn;
  3. the rendered dialog stays in its prompt state, with the intro, no Running card, no log and Skip enabled;
  4. the prompt stays due beside a background run and is withdrawn by a user-started one.
  Three of the four fail against the old dialog and the old gate. The second passes because the old dialog drew every
  report.
- `apps/desktop/src/main/initialization.test.ts`, 2 cases: every view published during a skip that shows a run in
  progress says `backgroundRun`, and so does its finished report; a run the user starts is published as no background
  run.

**Measured** as root under Xvfb on Linux, Node 24, on 2026-09-29, after one `pnpm build` at `19aef49`:
`init-proof --skip-build` passed six runs in a row (175, 175, 172, 172, 173 and 173 s), all five scenarios. At the end
of the runs, another agent's Electron processes on the host numbered 0, 6, 9, 9, 16 and 16. The runs took three orders.
In run 1 the resolution came first and the background run was live 74 ms before the dialog was read: the verifier's
red order. In run 2 the dialog was read first, and the resolution and background start landed before the Escape. In
runs 3 to 6 the Escape came first, and the skip performed the resolution. Every reading gave "Set up this project?",
the two-task intro, the card word Pending, the dialog visible and Send disabled. Every Escape was recorded as `skipped
verification-consent`, and `code-intelligence-setup → success` followed 1.7 to 2.5 s later. Every reopen read "Not run
yet: Verification consent task."

**Not shown:** the Windows orders; REQ-WORKSPACE-110's flip in the built app (unit cases only). Found beside this and
first recorded, not repaired: [`a-skip-can-move-a-completed-task-into-skipped.md`](a-skip-can-move-a-completed-task-into-skipped.md).
*(2026-09-29, the fix round's verifier: this repair is what made that path reachable. With the dialog in its prompt
state for the whole background run, Skip is live while the run ends. The note was repaired on the same branch, and it
records how.)*
