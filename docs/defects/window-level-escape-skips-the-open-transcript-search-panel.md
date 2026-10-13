## Window-level Escape skips the open transcript search panel

REQ-SHELL-055's window-level Escape on the Workspace view resolves in a fixed order, and its first step is the transcript
search panel: "with the transcript search panel visible, the panel closes and focus returns to the composer". The shell
holds a slot for it (`OverlayKind` `'searchPanel'`, second in `OVERLAY_ORDER`, `packages/ui/src/shell-state.ts`), and
`useCommandShortcuts` walks the slots in that order. Nothing ever registers the `searchPanel` slot: the only
`registerOverlay` callers are `WorkspaceView.tsx`'s `slashPopup` and `drawers`.

The panel closes on Escape only from its own input's `onKeyDown` (`packages/ui/src/transcript/TranscriptPane.tsx`, the
search field). With the panel open and focus anywhere else (its Previous or Next button, a transcript row, the body),
window-level Escape finds the slot empty, skips it and closes the compact drawers instead, so the panel stays open while
the step REQ-SHELL-055 places after it runs.

Noticed 2026-10-13 by fin41 while correcting the comment in `useCommandShortcuts.ts` that called the search panel
unbuilt (`code-comments-call-built-mechanisms-unbuilt-or-owed.md`). Read from the code only; not driven in the built
app, and not repaired here.

## Specs

REQ-SHELL-055, step (1): the visible search panel closes on window-level Escape, and focus returns to the composer,
before the drawers are considered. REQ-CHAT-074's "Closing the panel refocuses the composer" is the same close.

## Relevant files

- `packages/ui/src/shell-state.ts` — `OverlayKind`, `OVERLAY_ORDER`, `registerOverlay`; the `searchPanel` slot that stays
  `null`.
- `packages/ui/src/commands/useCommandShortcuts.ts` — the window keydown handler that walks the slots.
- `packages/ui/src/transcript/TranscriptPane.tsx` — `searchOpen`, the field's own Escape; where a registration belongs.
- `packages/ui/src/WorkspaceView.tsx` — the two registrations that exist (`slashPopup`, `drawers`).
- `packages/ui/src/commands/commands.test.ts` — asserts the order and a drawers registration, never a `searchPanel` one.
