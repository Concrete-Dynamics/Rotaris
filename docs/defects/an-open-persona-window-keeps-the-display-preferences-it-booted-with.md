## An open persona window keeps the display preferences it booted with

Every renderer reads the three transcript display preferences (`display/showReasoning`, `display/autoCollapseTools`,
`display/groupTools`) once, at boot (`readDisplayPrefs` in `apps/desktop/src/renderer/main.tsx`, before the role
branch), into its own module store `displayPrefs`. A change is written by `writeDisplayPref`, which updates only the
store of the window that wrote it: main stores the value (`prefs.set`) and tells no other window, the way it does for
the theme (`CHANNEL.themeChanged`). A persona window (REQ-SHELL-073, `renderer/windows.tsx`) that is already open
therefore keeps drawing its transcript under the values it booted with: turning "Toggle reasoning bodies" on from the
main window's palette, its slash mirror or Settings → Display opens the reasoning rows in the main window and leaves
those in the open persona window closed until that window is opened again. The two `REQ-CONFIG-403` switches have had
the same gap since Part AA; it became reachable for the reasoning preference on 2026-10-13, when fin41 (N71) gave
`display/showReasoning` its first writers.

Noticed 2026-10-13 by the reviewer of fin41's `fin41-palette-and-hooks` while checking `REQ-CHAT-167` against the code;
outside that bundle's tasks (which made the preference writable and reported), so recorded and not fixed. A repair
needs main to announce a stored display preference to every window and each renderer to fold it into its store — a new
push message on the seams view's channel path, not a change inside the writer.

## Specs

- `REQ-CHAT-167` — the preference "is global to the transcript — changing it changes every reasoning row at once", and
  toggling "MUST take effect immediately on the rows already on screen"; a persona window's reasoning rows are on screen.
- `REQ-CONFIG-403` — the Display category's two toggles are each wired to the stored preference and to "a live
  re-render notification"; the notification reaches only the window that wrote.
- [`PD-CONFIG-004`](../product/directives.md#pd-config-004) (2026-10-13, the ruling of OQ-264) — makes the live re-render
  clause explicit for the reasoning switch: Display › Transcript's third switch is wired "like the first two, to the stored
  preference and to the live re-render notification". The note stays open; the directive authorizes no repair, and the gap
  is owed its own repair before release.

## Relevant files

- `apps/desktop/src/renderer/shell.ts` — `displayPrefs`, `readDisplayPrefs` (boot only) and `writeDisplayPref` (this
  window's store only).
- `apps/desktop/src/renderer/windows.tsx` — the persona window reads `displayPrefs` for `PersonaWindow`'s rows.
- `apps/desktop/src/main/commands/shell.ts` — `prefs.set` stores the value and announces nothing; `theme.set` beside it
  sends `CHANNEL.themeChanged` to every live window.
- `packages/ui/src/display-host.ts` — its header says the change takes effect on the rows already on screen, which holds
  for the window that toggled.
