## Search transcript and the reasoning toggle are withheld for reasons no longer true

Two of the three entries `OMITTED_COMMANDS` withholds from the window's one action vocabulary are withheld for reasons
that stopped being true, so the palette, keyboard help and the slash catalogue still do not offer them:

- **"Search transcript" (Ctrl+F).** The reason given is that no transcript search panel exists; the panel has existed
  since Part Z (`TranscriptPane.tsx`, `/search`). Ctrl+F is caught only by the pane's own window listener, so it works
  only while the Workspace view is mounted: pressed on any other view it does nothing, where `REQ-SHELL-049` has it
  switch to Workspace and open the panel. Being outside the registry, it is in neither the palette nor F1's keyboard
  help (`REQ-SHELL-048`, `REQ-SHELL-054`), and `/search` reaches the panel by dispatching a synthetic Ctrl+F at the
  window rather than through a command.
- **"Toggle reasoning bodies".** The reason given is that `display/showReasoning` is not registered; it has been since
  Part AA (`platform`'s `PREFERENCE_KEYS`, the contracts' key list, main's `prefs.set`, and the renderer reads it at
  startup). Nothing anywhere writes it: no palette entry, no slash command, no switch in Settings → Display. The
  reasoning-visibility preference cannot be changed at all, so reasoning bodies can never be shown by default.

The third entry, "Open demo window", is withheld for a reason that is still true (no demo mode, `REQ-SHELL-162`).

Recorded 2026-10-13 by fin41 (item N71 of the whats-next survey at main `6de2a67`), before the repair.

## Specs

- `REQ-SHELL-049` — Ctrl+F "Search transcript" switches to Workspace and opens the search panel.
- `REQ-SHELL-048` — one vocabulary on every surface; `REQ-SHELL-054` — keyboard help lists every shortcut-bearing
  command; `REQ-MONITOR-272` — Ctrl+F is an entry of that vocabulary.
- `REQ-CHAT-167` — the reasoning-visibility preference reachable from settings, the palette and therefore slash
  (`REQ-CHAT-028`), reporting the new state on toggle and taking effect on the rows already on screen.

## Relevant files

- `packages/ui/src/commands/registry.ts` — `OMITTED_COMMANDS` and its two stale reasons; `COMMANDS` lacks both entries.
- `packages/ui/src/commands/commands.test.ts` — pins the omitted list and Ctrl+F as matching no command.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the private Ctrl+F window listener.
- `packages/ui/src/WorkspaceView.tsx` — `openSearch` dispatches a synthetic Ctrl+F for `/search`.
- `packages/ui/src/settings/DisplaySettings.tsx` — the Transcript section has two switches, not three.
- `apps/desktop/src/renderer/shell.ts` — `writeDisplayPref` accepts two of the three display keys.
- `docs/architecture/adr/0048-windows-views-and-modality.md`, `docs/architecture/codebase.md` — describe the omission
  with the old reasons.

## Outcome — repaired 2026-10-13 (fin41, `fin41-palette-and-hooks`)

- **"Search transcript" (Ctrl+F)** is the registry's `transcript.search`, in REQ-SHELL-049's place after Ctrl+,. It
  switches to Workspace and calls `openTranscriptSearch`, which reaches the opener the transcript pane registers in
  `shell-state` (`registerTranscriptSearch`) once it is mounted; an open panel takes the caret back. The pane's private
  window listener is gone and `/search` runs the same command, so Ctrl+F has one binding. Keyboard help lists it, the
  palette offers it and REQ-CHAT-028 mirrors it as `/search-transcript (Ctrl+F)`; the built-in `/search` keeps its
  own description and gating.
- **"Toggle reasoning bodies"** is `display.toggleReasoning`, shortcut-less. It flips `display/showReasoning` through
  `display-host.ts`, which the renderer binds to `writeDisplayPref` (now accepting the key), and acknowledges "Reasoning
  bodies shown" or "Reasoning bodies hidden"; a refused write is reported with main's reason. Its slash mirror is
  `/toggle-reasoning-bodies`. Settings → Display has a third Transcript switch, "Show reasoning bodies", on the same
  write — placed there as a reading taken, raised as
  [OQ-264](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-264).
- `OMITTED_COMMANDS` holds "Open demo window" alone.

**Pinned by** `packages/ui/src/commands/search-and-reasoning.test.ts` (fourteen cases red on the code before, with
`commands.test.ts`'s updated table, run order and Ctrl+F resolution), **shown by** `pnpm palette-proof` stage 6 (from
Mission, Ctrl+F lands on Workspace with the caret in the search field; the palette's toggle stores
`display/showReasoning: true` and acknowledges it; the palette lists 21 entries and keyboard help 15 rows) and
`pnpm settings-proof` (the Display switch writes the key and reads on after a relaunch). ADR-0048 reports back in place.
