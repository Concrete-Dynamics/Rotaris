# The overhaul backlog — ranks 1 to 50 (part 1 of 3)

Part 1 of 3 of [the backlog](../backlog.md), which indexes every part and states the ranking rule and the columns; the rows below are rank 1 to 50, moved verbatim on 2026-11-03 ([the document budget](../../../README.md#the-document-budget)). A row's "Decided by" cell names the question that decides it and, once ruled, the ruling's date and outcome; "Executes once ruled" names the skill and the surface, or says that nothing executes.

| Rank | Item | What it meets | Decided by | Executes once ruled |
|---|---|---|---|---|
| 1 | An acknowledgement's lifetime is a time limit (SC 2.2.1): its content and its one action ("Start a new session") must be reachable after it withdraws, or it pauses on hover and focus | `REQ-NOTIFY-003`, `-011`, `-015`, `REQ-SHELL-112`, `PD-WORKSPACE-001` | [OQ-498][oq-498] — D05-5, D09-5, D11-5, D13-1, D13-2, D13-3 | build-ui, the acknowledgement stack |
| 2 | [G2 — approval dialog][g] | `REQ-TOOLS-063` | §4.2 G2 — a build task, no ruling owed | build-ui, approval dialog |
| 3 | [G7 — transcript row and virtualised transcript][g] | `REQ-CHAT-046`, `-055`–`-067`, `-163`–`-165`, `-175`–`-178` | §4.2 G7 — a build task, no ruling owed | build-ui, transcript |
| 4 | A pulse lasting a whole run needs a pause, stop or hide (SC 2.2.2); does the in-app reduced-motion setting stop the pulse and the spinner mid-run? | §1.8, `REQ-SHELL-135` | [OQ-497][oq-497] — D11-2, D13-8 | debug-ui, every `StatusDot` and `Spinner` |
| 5 | Text enlargement to 200 % and renderer zoom lay a 1000 px window out below every threshold | `REQ-SHELL-022`, `-030`, `-160`(d) | [OQ-495][oq-495] — D09-12, D14-6 | debug-ui, every primary view at 1000×680 |
| 6 | [G1 — persistent notice below the title bar][g] | `REQ-SHELL-114`, `-116`, `-118`, `REQ-NOTIFY-034`–`-043` | §4.2 G1 — a build task, no ruling owed | build-ui, the notice slot |
| 7 | A tool row awaiting approval reads like one executing, within `running`/`ok`/`failed`/`blocked` | `REQ-MONITOR-105`, `REQ-CHAT-060` | [OQ-520][oq-520] — D13-13 | build-ui, tool row |
| 8 | The filled Approve once may draw the eye toward approving an unread call | §1.7 (one filled control), `REQ-TOOLS-063` | [OQ-518][oq-518] — D04-10 | design-ui, approval dialog |
| 9 | The approval dialog says nothing of what a session-wide approval lets through, or whether the call can be undone | `REQ-TOOLS-063` | [OQ-519][oq-519] (the session approval's scope); none filed; request (whether the call can be undone) — D04-9, D06-6 | design-ui, approval dialog |
| 10 | Where a returning operator, or one with a closed overlay drawer, finds every pending approval, question and finished run | `REQ-SHELL-023`, `-061`, `REQ-NOTIFY-003` | [OQ-506][oq-506] — D04-3, D13-4, D14-4 | design-ui, Overview's sessions card and the status strip |
| 11 | [G14 — question stepper][g] | `REQ-TOOLS-158`, `REQ-CHAT-046` | §4.2 G14 — a build task, no ruling owed | build-ui, question stepper |
| 12 | Which surface owns a live region for streamed rows and terminal output, at what politeness, how often, capped | `REQ-SHELL-144`, `-146`, `REQ-CHAT-178` | [OQ-507][oq-507] — D09-9, D09-10 | build-ui, transcript and terminal window |
| 13 | The 300 s question timeout is a hidden limit an absent or screen-reader operator returns to expired | `REQ-CHAT-093`, `REQ-SHELL-144`..`-168` | [OQ-521][oq-521] — D06-4 | build-ui, question stepper |
| 14 | [G3 — delegation tree][g] | `REQ-MONITOR-036`–`-043`, `-304` | §4.2 G3 — a build task, no ruling owed | build-ui, delegation tree |
| 15 | Persona hues sit one stop from the state hues: is a `--rt-viz-2` label told from a `--rt-run` dot without the word? | §1.3, `PD-CHAT-005` | [OQ-523][oq-523] — D06-15 | debug-ui, transcript rows and delegation tree |
| 16 | Accent and Z `done` share hue 292: a selected row, a link and a `done` `StatusDot` on one surface | §1.2, §1.3 | none filed; already-ruled: §1.3 (colour never carries a fact on its own) — D07-7, D08-15 | debug-ui, delegation tree and `Table` rows |
| 17 | Running teal and info cyan at 6 px | §1.3, `StatusDot` | none filed; already-ruled: §1.3, REQ-SHELL-149 — D07-8 | debug-ui, `StatusDot` |
| 18 | A selected board card or graph node told apart without colour (SC 1.4.11) | §1.2, G15, G16 | none filed; already-ruled: REQ-SHELL-149 — D09-6 | build-ui, Requirements board and graph |
| 19 | A divider owes a single-pointer route (SC 2.5.7) | `REQ-SHELL-066`–`-070` | [OQ-493][oq-493] — D08-21 | build-ui, pane divider |
| 20 | No command moves between the window's regions (F6) | `REQ-SHELL-049` | [OQ-505][oq-505] — D09-13 | build-ui, main window regions |
| 21 | [G10 — status strip][g] | `REQ-SHELL-038`–`-047`, `REQ-TOOLS-184` | §4.2 G10 — a build task, no ruling owed | build-ui, status strip |
| 22 | [G8 — split pane and divider][g] | `REQ-SHELL-066`–`-071` | §4.2 G8 — a build task, no ruling owed | build-ui, pane divider |
| 23 | [G9 — compact overlay drawer][g] | `REQ-SHELL-059`–`-063` | §4.2 G9 — a build task, no ruling owed | build-ui, overlay drawers |
| 24 | Under forced colours, what marks a `Dialog` or drawer as floating, and does the shell defer or switch theme? | §1.7, `REQ-SHELL-128`, `-160`(b) | [OQ-494][oq-494] — D08-12, D09-11 | debug-ui, `Dialog` and overlay drawers |
| 25 | The first pending approval auto-opens at once rather than at the operator's next breakpoint | `REQ-CHAT-103`, `PD-CHAT-002` | [OQ-516][oq-516] — D06-1 | design-ui, approval dialog |
| 26 | The next request appears as the dialog closes, one at a time, while other agents go unwatched | `REQ-TOOLS-063` | [OQ-516][oq-516] — D05-16, D06-2 | design-ui, approval queue |
| 27 | A habituated approval dialog: a distinct presentation for a high-impact request, still or moving | §1.7, §1.8, `REQ-TOOLS-063` | [OQ-517][oq-517] — D05-3, D06-3, D10-9 | design-ui, approval dialog |
| 28 | Title `Allow <agent> to run <tool>?` beside Approve once; is `<tool>` the name or the description? | `REQ-TOOLS-063`, `REQ-CHAT-175` | [OQ-510][oq-510] — D10-13 | design-ui, approval dialog |
| 29 | The undeliverable-answer sentences give the cause and no next step | `REQ-CHAT-102`, `-103` | [OQ-510][oq-510] — D10-22 | build-ui, approval dialog and question stepper |
| 30 | A live agent-message row draws no mark until the ten-second stall | `PD-CHAT-006`, `REQ-CHAT-164` | none filed; already-ruled: PD-CHAT-006 — D06-9 | build-ui, transcript |
| 31 | Stopping is not reached where the run started; the composer's button reads `Queue` | `REQ-CHAT-005` | [OQ-522][oq-522] — D06-8 | build-ui, composer |
| 32 | An unavailable command omitted or shown disabled with its reason; context menus per platform | `REQ-SHELL-048`, `-053`, `REQ-NOTIFY-008` | [OQ-509][oq-509] (the palette's unavailable commands); none filed; not-a-question (a drawn context menu's platform presentation) — D05-6, D08-16 | build-ui, command palette |
| 33 | A crash relaunch's repair announced as a non-modal notice with a notice action | `REQ-MONITOR-210` | none filed; already-ruled: REQ-NOTIFY-003 — D04-7 | build-ui, the notice slot |
| 34 | Unsaved Settings edits are lost on quit, where the draft survives | the OQ-298 ruling, `REQ-CHAT-015` | none filed; already-ruled: OQ-298 — D04-8 | build-ui, Settings |
| 35 | The safety flags are stated only in the status strip | `REQ-SHELL-024`, `-041` | none filed; not-a-question — D08-19 | design-ui, status strip |
| 36 | The one-colour ring on a hovered, focused row and against accent ink | §1.7, `--rt-focus` | none filed; already-ruled: REQ-SHELL-145, REQ-SHELL-160 (c) — D05-4, D09-1 | debug-ui, focus ring |
| 37 | [G11 — title-bar chips][g] | `REQ-SHELL-033`–`-037` | §4.2 G11 — a build task, no ruling owed | build-ui, title bar |
| 38 | [G6 — diff rendering][g] | `REQ-CHAT-050`, the Git view | §4.2 G6 — a build task, no ruling owed | build-ui, transcript and Git |
| 39 | [G15 — board column and card][g] | `REQ-TRACE-232`–`-235`, `-242`, `-281`, `-303`, `-358` | §4.2 G15 — a build task, no ruling owed | build-ui, Requirements board |
| 40 | [G4 — evidence indicator][g] | `REQ-TRACE-258`–`-261` | §4.2 G4 — a build task, no ruling owed | build-ui, requirement card |
| 41 | Deferred Save beside Interface applying at once: how a control shows its commit policy | `REQ-CONFIG-270`, `-286`, `-399`, `REQ-SHELL-124` | [OQ-530][oq-530] — D03-2 | design-ui, Settings |
| 42 | An arrow key through the delegation tree may open a persona window | `REQ-MONITOR-304`, `REQ-SHELL-073`, `-153` | [OQ-512][oq-512] — D09-8 | build-ui, delegation tree |
| 43 | The overlay drawers have no command with a shortcut | `REQ-SHELL-048`, `-049`, `-062` | [OQ-505][oq-505] — D14-7 | build-ui, overlay drawers |
| 44 | Ctrl+Return from anywhere meets a control or the terminal window that answers it | `REQ-CHAT-001` | none filed; already-ruled: REQ-CHAT-001 — D05-11 | debug-ui, composer and terminal window |
| 45 | [G5 — terminal character grid and its controls][g] | `REQ-SHELL-087`–`-095` | §4.2 G5 — a build task, no ruling owed | build-ui, terminal window |
| 46 | A 2 px inset ring fails SC 2.4.13's area (AAA) | §1.8 note 3, `REQ-SHELL-148`, `-160`(c) | [OQ-493][oq-493] — D08-9, D09-2 | debug-ui, focus ring |
| 47 | One elided line may not identify a tool row in a narrow window | `REQ-CHAT-175`, §7.4 | [OQ-531][oq-531] — D14-8 | debug-ui, tool row |
| 48 | Strip controls shortened to an icon: does the tooltip carry the label for a keyboard user? | `PD-CHAT-001` rev. 3 | none filed; already-ruled: PD-CHAT-001 — D14-9 | debug-ui, composer strip |
| 49 | Without weight, do size, colour and space separate row headers, `Table` group headers, the tool name? | §1.4 | [OQ-500][oq-500] — D01-2, D02-3, D03-3, D07-1 | design-ui, `Table` and transcript rows |
| 50 | Flat secondary `Button`s and icon controls may not read as controls | §1.7 | [OQ-503][oq-503] — D02-10, D07-6 | design-ui, `Button` |

[g]: ../../../design/README/04-4-component-inventory-against-the-specification.md#42-affordances-with-no-component-at-all
[oq-493]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-493
[oq-494]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-494
[oq-495]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-495
[oq-497]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-497
[oq-498]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498
[oq-500]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-500
[oq-503]: ../../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-503
[oq-505]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-505
[oq-506]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-506
[oq-507]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-507
[oq-509]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-509
[oq-510]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-510
[oq-512]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-512
[oq-516]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-516
[oq-517]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-517
[oq-518]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-518
[oq-519]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-519
[oq-520]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-520
[oq-521]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-521
[oq-522]: ../../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-522
[oq-523]: ../../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-523
[oq-530]: ../../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-530
[oq-531]: ../../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-531
