## Window-level Escape does not close the transcript search panel

`REQ-SHELL-055` resolves window-level Escape on the Workspace view in a fixed order, and its first step is the
transcript search panel: with the panel visible, Escape closes it and focus returns to the composer. The shell has the
slot for it (`OverlayKind` `'searchPanel'`, second in `OVERLAY_ORDER`), but the transcript pane never registers a closer
there, so the window handler skips it. Escape closes the panel only while the caret is in the panel's own input
(its `onKeyDown`); with focus anywhere else on the Workspace view — a transcript row after Previous/Next, the composer —
Escape passes over the open panel and closes the compact drawers instead, or does nothing. ADR-0048's first execution
recorded the slot as empty "because neither is built"; the panel was built the next day (Part Z) and the slot was never
filled.

Noticed 2026-10-13 by fin41 while routing Ctrl+F through the command registry (N71); outside that task, so recorded and
not fixed.

## Specs

- `REQ-SHELL-055` — step (1): with the transcript search panel visible, window-level Escape closes it and focus returns
  to the composer, before the drawers.
- `REQ-CHAT-074` — closing the panel refocuses the composer.

## Relevant files

- `packages/ui/src/transcript/TranscriptPane.tsx` — the panel; Escape handled only in the input's `onKeyDown`.
- `packages/ui/src/shell-state.ts` — `OverlayKind`, `OVERLAY_ORDER`, `registerOverlay`; `searchPanel` stays null.
- `packages/ui/src/commands/useCommandShortcuts.ts` — resolves Escape over the registered closers.
- `docs/architecture/adr/0048-windows-views-and-modality.md` — "the search panel register[s] nothing because neither is
  built".
