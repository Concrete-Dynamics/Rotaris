## ui-audit's stash dialog was opened by the toolbar's manage control, never by `/pop`

**Outcome (repaired 2026-11-03, with the worktree-dialog note's repair).** The prelude now presses the composer strip's
own Stash control (`[data-testid="composer-stash"]`, REQ-CHAT-042: the trimmed text onto the stash, the composer
cleared), so `/pop` reads available and opens the dialog by its own route; the sweep's new wait for an available row is
what found it. Measured on the three `pnpm ui-review -- --iteration=1 --views=1` runs that note's outcome records:
`/pop` read available 107 to 124 ms after the typing, the stash dialog CLEAN at both sizes (4 of 4 controls tested,
560×360), and the toolbar reads "Apply stash (1)" in the packs' screenshots.

Found 2026-11-03 while repairing
`docs/archive/defects/ui-audits-worktree-dialog-reads-unreached-until-the-git-view-has-read-the-enclosing-checkout.md`.
The overlay table's stash row typed `/pop` after a prelude meant to stash a prompt "through the composer's own control":
it typed text and pressed `[data-testid="transcript-stash"]`. That control is the transcript toolbar's "Manage prompt
stash" button (`packages/ui/src/WorkspaceView.tsx`, `onOpenStash`), which OPENS the stash dialog; the control that
stashes is the composer strip's `[data-testid="composer-stash"]` (`onStash`). So the dialog the sweep then measured was
the one the prelude's press had opened, over an empty stash; the `/pop` typed afterwards was listed unavailable
(`STASH_EMPTY`, "No stashed prompts. Use Stash beside the composer first.") and its Enter ran nothing — invisible, since
the root the sweep waited for was already on screen. Once the sweep submitted a slash command only when its row read
available (2026-11-03), `/pop` never did: the stash dialog read `UNREACHED` at both sizes in three runs, with no `/pop`
row in the popup at all, the open dialog holding the focus.

## Specs

None is contradicted by the product. `/pop`'s refusal over an empty stash is REQ-CHAT-031's shape, which `slash-proof`
asserts. What was wrong was the evidence: a dialog measured under an opener's name that had not opened it.

## Relevant files

- `apps/desktop/scripts/ui-audit.mjs`: the overlay table's stash row and its prelude.
- `packages/ui/src/WorkspaceView.tsx`: `transcript-stash` (`onOpenStash`) against `composer-stash` (`onStash`).
- `packages/ui/src/slash/catalogue.ts`: the `pop` row's availability over `stashCount`, and `STASH_EMPTY`.
