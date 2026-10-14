## Every link in the Library artifact inspector's Preview is drawn disabled

An artifact's Preview tab renders its Markdown through the shared renderer, which draws each `http(s)` link (and each
image reference) as a button that asks for an external open through `onOpenLink`, and draws it **disabled** when no
opener is given. Neither mount of `ArtifactInspector` passes one: the main window's Library
(`apps/desktop/src/renderer/main.tsx`, the `open.map(...)` under the Library view) and the persona window
(`apps/desktop/src/renderer/windows.tsx`, `artifactsOpen.map(...)`). So every link in every artifact preview is inert:
it shows its target as a tooltip and cannot be activated.

The comment above the main window's mount gives a reason that stopped being true on 2026-09-07: "No such command exists
yet … Until then no opener is passed … Recorded as owed." Part AA added `shell.openExternal` that day, and ADR-0051's
second execution records "The owe of note 4 above is closed". The transcript, `PersonaWindow` and `RowProof` were given
the shared `openLink` (`apps/desktop/src/renderer/shell.ts`); the two inspector mounts were left behind.

Found 2026-10-13 by the survey of what is left to do (item N70, verified at `main` `6de2a67`); recorded by fin41 before
the repair.

## Specs

No requirement that names the inspector fails in its own words: REQ-LIBRARY-132 asks only for "rendered Markdown" in the
Preview tab, and REQ-CHAT-076 / REQ-CHAT-056, which make a link open in the system browser with an acknowledgement and a
reported failure, govern transcript rows. The gap is against **ADR-0051 decision 4** ("links are elements that request
an external open through the command channel"), whose "until then" condition was met by Part AA, so the inert link is
the stand-in that decision allowed only while no command existed.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — the Library's `<ArtifactInspector>` mount and its stale "Recorded as owed" comment.
- `apps/desktop/src/renderer/windows.tsx` — the persona window's `<ArtifactInspector>` mount.
- `apps/desktop/src/renderer/shell.ts` — `openLink`, the shared opener (sends `shell.openExternal`, acknowledges the outcome).
- `packages/ui/src/library/ArtifactInspector.tsx` — forwards the optional `onOpenLink` to the Preview's `<Markdown>`.
- `packages/ui/src/markdown/Markdown.tsx` — draws a link `disabled={onOpenLink === undefined}`.
- `apps/desktop/src/main/commands/shell.ts` — the `shell.openExternal` handler.
- `docs/architecture/adr/0051-markdown-rendering-and-the-render-cache.md` — decision 4 and the second execution's "owe closed".

## Outcome

*Repaired 2026-10-13 (fin41).* Both mounts pass the window's shared `openLink`: `onOpenLink={openLink}` on the Library's
`<ArtifactInspector>` in `apps/desktop/src/renderer/main.tsx` and on the persona window's in
`apps/desktop/src/renderer/windows.tsx`. A Preview link is now an enabled control that sends `shell.openExternal`, and its
outcome is acknowledged or its failure reported exactly as a transcript link's is. The stale "No such command exists yet …
Recorded as owed" comment is replaced. ADR-0051's second execution is corrected in place: its "owe closed" held for the
transcript only.

**Pinned by** `apps/desktop/src/renderer/artifact-inspector-links-wiring.test.ts` (each root's one mount carries
`onOpenLink={openLink}`, the opener is `shell.ts`'s, and the stale comment is gone; red on both mounts before) and
`packages/ui/src/library/ArtifactInspector.test.ts` (a Preview link is enabled with an opener and disabled only without one).
**Shown by** `pnpm artifacts-proof` launch 4, which publishes the scripted plan with one Markdown link, returns to the
Preview after the save and the re-raise, presses the link and reads `capture: open-external https://example.com/reference`
from main (green 2026-10-13 at load 2.3 to 3.5; with the Library mount's opener removed the same launch fails on that
line). The persona window's mount is pinned by the wiring test only: no proof opens an artifact inspector in a persona
window and presses a link there.

Met beside it: the acknowledgement the open raises stands over the inspector's footer, and so over Save, while it shows
(`docs/defects/fixed/an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md`, recorded, not repaired; repaired 2026-10-14 by fin43).
