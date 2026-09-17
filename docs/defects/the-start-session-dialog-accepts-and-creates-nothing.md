## Accepting the Start session dialog with isolation chosen creates no session, and says nothing

`pnpm checkpoint-proof`'s isolated-session scenario drives the product's own gestures — click
`New session`, click `start-session-isolation`, click `start-session-accept`, type a prompt into the
composer — and nothing happens. The launch log records all four gestures and then ninety seconds of
silence:

```
capture: clicked "New session"
capture: clicked "[data-testid="start-session-isolation"]"
capture: clicked "[data-testid="start-session-accept"]"
capture: typed "Write the notes in a worktree."
capture: wait for result timed out after 90000 ms
```

The store confirms that the silence is real, not a display problem: the workspace's `sessions` table
holds only the two sessions earlier scenarios created (`21:08:11` and `21:09:59`) and **no row at all**
for the accept at `21:10:55`. No refusal is logged, no notice is raised, and no error appears anywhere
in the launch. The proof then fails at `the isolated session carries no binding`, which is the symptom
rather than the defect — `latestSession()` is reading the previous scenario's session, because the
isolated one was never created.

Reproduced twice, on two runs of the built application.

**The cause is not established, and this note does not guess at one.** Two candidates, both cheap to
test: the isolation control is a `DesignCheckbox` since the design-system migration, so the click may
land on the wrapper rather than toggling the box, and the accept may then be submitting a dialog whose
submit handler returns early; or the accept is refused inside `onAccept` and the refusal is swallowed.
What is NOT a candidate is branch validation, the obvious suspect: the scenario's workspace holds only
`main` and one worktree (its own), so `defaultSessionBranch` collides with nothing and `branchError`
should be null.

**A third candidate arrived from `pnpm ui-audit` the same day, and it is the strongest**: the dialog
measures 560 × **904** and does not fit any supported window — at the minimum 1000 × 680 its run-start
selector, its `Cancel` and its `Start session` are all measured OFF SCREEN
(`the-start-session-dialog-does-not-fit-the-minimum-window.md`). A synthesized click at a control's
computed centre lands nowhere when that centre is outside the window, which would produce exactly what
the log shows: the seam reports the click, and nothing happens.

Either way the user-visible behaviour is the same and is wrong on its own terms: a dialog that accepts
a gesture and produces neither a session nor a reason.

**Why it has been invisible.** `checkpoint-proof` failed earlier in the script — at a stale assertion
over a timeline entry name (`docs/defects/fixed/the-proofs-assert-a-timeline-name-the-audit-corrected.md`)
— so it has not reached this scenario since that name was corrected. The failure here is at scenario
`isolated`, and `isolated-restore` after it has been unmeasured for the same period.

## Specs

REQ-SESSION-084 (the create path creates the record and then binds the worktree), REQ-GIT-118 and
REQ-SHELL-125 (the dialog's isolation choice and its branch), and the refusal discipline that covers
everything else the product declines to do: a refusal is reported, never silent.

## Relevant files

- `packages/ui/src/StartSessionDialog.tsx` — `start-session-isolation` (a `DesignCheckbox`),
  `start-session-branch`, `start-session-accept`, and the `accept()` early return.
- `apps/desktop/src/main/commands/` — the session-create command the dialog's acceptance reaches.
- `apps/desktop/scripts/checkpoint-proof.mjs` — the `isolated` scenario (and `isolated-restore` behind
  it), with the evidence under `.proof/checkpoint-proof/isolated.log`.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) after repairing the stale assertion that had been
hiding this scenario. Not repaired here: it is a session-creation path this part does not touch, and
diagnosing it belongs with whoever owns that dialog's next change.
