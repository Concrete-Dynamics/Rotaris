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
unbuilt (`docs/defects/fixed/code-comments-call-built-mechanisms-unbuilt-or-owed.md`). Read from the code only; not driven in the built
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

## Outcome — repaired 2026-10-14 (fin43, `fin43-transcript-and-prefs`)

**Confirmed in the built app before the repair**, which the note above had only read from the code:
`pnpm transcript-proof --only=behaviour` with the pane's registration removed opened the panel from the toolbar, focused
its Next button and pressed Escape there; it read `{"open":true,"composerFocused":false}` and failed "window-level Escape
left the search panel open".

The pane now holds the `searchPanel` slot while its panel is open (`TranscriptPane.tsx`: `registerOverlay('searchPanel',
searchPanelCloser(searchOpen, closeSearch))`, released on close and on unmount), so the window's Escape reaches it after
the slash popup and before the drawers, as `REQ-SHELL-055` orders. The panel has one close, `closeSearch`, which closes it
and returns focus to the composer; the field's Escape, the Close button and the window's Escape all run it
(`REQ-CHAT-074`'s "Closing the panel refocuses the composer"). The window's walk over the slots is a pure function,
`resolveWorkspaceEscape` (`useCommandShortcuts.ts`), and `searchPanelCloser` (`transcript/search.ts`) is the closer the
pane registers, null while the panel is closed.

Pinned by `packages/ui/src/commands/transcript-search-control.test.ts` (four cases, red on the code before: the open
panel closes before the drawers and refocuses the composer, a closed panel leaves the slot to the drawers, the slash
popup still answers first, and the pane registers the slot with its one close). Shown by
`pnpm transcript-proof --only=behaviour` with the repair: Escape from the Next button closed the panel and the composer
held focus (`results.json` → `behaviour.searchControl.windowEscape`: `{"open":false,"composerFocused":true}`).
