## A window's boot read of the display preferences can overwrite a newer announcement

Every window reads the three display preferences once at boot (`readDisplayPrefs`, `apps/desktop/src/renderer/shell.ts`): three
`prefs.get` requests under one `Promise.all`, applied together when all three have answered. The same window also folds main's
`display:changed` announcement (channel 14) into the store the moment it arrives, and its own `writeDisplayPref` sets a field
once main has stored it. If another window's change (or this window's own) lands at main after one of the boot reads was
answered and before the last one was, the announcement is folded first and the stale boot answer is then applied over it: the
window keeps the value the person just changed away from, until the next change. The window is milliseconds wide, during a
window's boot. Noted by fin43's reviewer of `fin43-transcript-and-prefs`.

## Specs

- `REQ-CHAT-167` and `REQ-CONFIG-403` (with [`PD-CONFIG-004`](../../product/directives.md#pd-config-004)): a display preference
  takes effect immediately on the rows already on screen, in every window.

## Relevant files

- `apps/desktop/src/renderer/shell.ts` — `readDisplayPrefs`, the channel-14 fold, `writeDisplayPref`.
- `apps/desktop/src/renderer/display-prefs.ts` — the three writers, since the repair.

## Outcome

Repaired 2026-10-14 (fin44, `fin44-optional-findings`): the store and its three writers moved into
`apps/desktop/src/renderer/display-prefs.ts` (`createDisplayPrefs`, over the bridge; `shell.ts` makes the window's one
instance). Each boot read keeps the set of fields an announcement or this window's write has set since it began, and applies
only the others. Pinned by `display-prefs.test.ts` against a scripted bridge: an announcement folded between the gets, and the
window's own write during the read, both stand; both cases are red with the read applying every field, as it did.
