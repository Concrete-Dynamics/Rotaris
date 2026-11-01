# ADR-0048 — Windows, views and the three modality levels — Two omitted entries return — reported back 2026-10-13 (fin41, N71)

Part 13 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## Two omitted entries return — reported back 2026-10-13 (fin41, N71)

*The defect note is [`search-transcript-and-the-reasoning-toggle-are-withheld-for-reasons-no-longer-true`](../../../defects/fixed/search-transcript-and-the-reasoning-toggle-are-withheld-for-reasons-no-longer-true.md);
the proof is `pnpm palette-proof`'s stage 6 and `pnpm settings-proof`'s Display launches.*

**The falsified reasons, kept beside their replacements.** `OMITTED_COMMANDS` withheld "Search transcript" because "no
transcript search panel exists yet" and "Toggle reasoning bodies" because "the display/showReasoning preference … is not
registered". Both were true on 2026-09-06 and false from 2026-09-07. Nothing re-read the list when the panel and the key
landed, so the vocabulary stayed short by two entries while each surface that could have offered them existed.

**What one vocabulary required, measured.** Ctrl+F had been bound privately by the transcript pane's own window listener,
the shape this record's first execution replaced for every other chord: it fired only while the Workspace view was
mounted, so from the other six views the chord did nothing, and keyboard help, which lists the registry, did not list it.
It is now the registry's `transcript.search`, the one binding: the command switches to Workspace and calls the opener the
pane registers in `shell-state` (`transcriptSearch`), through `nowOrAfterMount` like `Ctrl+L`. The pane binds no chord,
and `/search` runs the same command instead of dispatching a synthetic Ctrl+F at the window. Built from Mission, the
proof read the view switch to Workspace and the caret in the search field 600 ms after the chord.

`display.toggleReasoning` flips `display/showReasoning` through the renderer's binding (`display-host.ts`, the shape
`workspace-host.ts` took for the same reason: the context carries no command channel), so the palette, the slash mirror
`/toggle-reasoning-bodies` and Settings → Display's new switch write one key through one function, and the palette and
slash routes acknowledge the state the key now holds (`REQ-CHAT-167`). The proof read "Reasoning bodies shown" and
`display/showReasoning: true` in the preference file; `settings-proof` read the switch on after a relaunch. Placing the
switch in Display, which `REQ-CONFIG-403` says "holds two transcript toggles", is a reading taken and raised as
[OQ-264](../../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-264).

**Still not built.** "Open demo window" (`REQ-SHELL-162`, no demo mode). The search panel's Escape slot (the note linked
above), and `REQ-CHAT-074`'s toolbar control for search
([`the-transcript-has-no-toolbar-control-for-search`](../../../defects/fixed/the-transcript-has-no-toolbar-control-for-search.md)),
both noticed by this change and recorded, not repaired. *Both repaired 2026-10-14 (fin43, `fin43-transcript-and-prefs`):*
the toolbar's search control runs this registry's `transcript.search`, so it is one more way in to the same command and
no second binding, its tooltip carrying the chord as `REQ-SHELL-058` formats it; the slot is filled as the first execution
above now says. "Open demo window" is the one entry still not built.
