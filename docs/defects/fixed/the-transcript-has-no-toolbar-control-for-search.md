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

## Outcome — repaired 2026-10-14 (fin43, `fin43-transcript-and-prefs`)

The transcript toolbar carries a search control (`TranscriptSearchControl`, `packages/ui/src/WorkspaceView.tsx`), drawn
before the terminal control as the mockup's `WORKSPACE` → transcript column draws it: a bare `ph-magnifying-glass` on the
compact ghost button, in `--rt-text-tertiary` at rest and `--rt-text-secondary` on hover (`.transcript__search-open`,
`packages/ui/src/shell.css`). Its accessible name is the command's label, "Search transcript", and its tooltip and
accessible description carry the registry's chord formatted for the host, "Search transcript (Ctrl+F)" (`REQ-SHELL-058`;
"(⌘+F)" on macOS). A press runs the registry's "Search transcript" (`openSearch`), the command Ctrl+F, the palette and
`/search` already run, so the toolbar adds a way in and no second binding (`REQ-SHELL-048`).

Pinned by `packages/ui/src/commands/transcript-search-control.test.ts` (the three toolbar cases red on the code before:
no control in the Workspace's toolbar, no `TranscriptSearchControl`). Shown by `pnpm transcript-proof --only=behaviour`:
the control is present with that name and tooltip, and a click opens the panel with the caret in its field
(`results.json` → `behaviour.searchControl`).
