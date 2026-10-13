## The transcript has no toolbar control for search

`REQ-CHAT-074` opens the transcript search panel "by toolbar button or Ctrl+F". The Workspace toolbar above the
transcript (the scope toggle, the terminal control) carries no search control, so the panel is reached only by Ctrl+F,
`/search` and, once the registry carries it, the palette's "Search transcript". A reader who does not know the chord has
no visible way to search the transcript.

Noticed 2026-10-13 by fin41 while routing Ctrl+F through the command registry (N71); outside that task, so recorded and
not fixed. The control is a drawn surface: the mockup's `WORKSPACE` → transcript column is the craft reference
(`docs/design/README.md` §7).

## Specs

- `REQ-CHAT-074` — "opened by toolbar button or Ctrl+F as an inline panel".

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — the transcript toolbar (`ScopeToggle`, `TerminalToolbarControl`); no search control.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the panel the control would open.
