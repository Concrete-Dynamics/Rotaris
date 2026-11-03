# The overhaul backlog — what the research proposes for the adopted material

**Review date:** 2026-11-02
**Status:** recommendations only. Nothing here changes a token, a component, a requirement or a directive; each row names the open question that decides it, or the §4.2 gap that already records it.

Collected from every guide's section 8 and from [`docs/design/README.md` §4.2](../../design/README/04-4-component-inventory-against-the-specification.md) (G1–G16), ranked by user harm × breadth × effort. The owner chose to have this list on 2026-11-01 (`docs/product/requests.md`, the design-system overhaul).

The fourteen guides raise 192 disagreements; 93 of them, near-duplicates across or within guides, merge into 38 rows, so 137 rows carry them, and the 16 gaps of [§4.2](../../design/README/04-4-component-inventory-against-the-specification.md#42-affordances-with-no-component-at-all) add 16 more: 153 rows.

**Ranking rule:** user harm first (misleads or blocks a step of an operator's journey, or falls below an accessibility floor), then breadth (how many primary views and windows it reaches), then inverse effort; a record note with no visible effect ranks last.

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
| 51 | The pulse marks running, which needs nobody; should it mark what needs the operator, or grow with waiting? | §1.8, `REQ-MONITOR-171` | [OQ-502][oq-502] — D02-7, D03-10, D04-4 | design-ui, `StatusDot` and sessions card |
| 52 | [G12 — indeterminate non-cancellable progress dialog][g] | `REQ-SHELL-117` | §4.2 G12 — a build task, no ruling owed | build-ui, progress dialog |
| 53 | The progress dialog appears at once with no delay, and past 10 s says nothing of how far | `REQ-SHELL-117` | [OQ-528][oq-528] (the show delay and minimum hold); [OQ-529][oq-529] (progress and interruption past 10 s) — D11-6, D13-5 | build-ui, progress dialog |
| 54 | [G13 — keyboard-help dialog][g] | `REQ-SHELL-054` | §4.2 G13 — a build task, no ruling owed | build-ui, keyboard help |
| 55 | Closing a persona window or the main window does not say the run continues | `REQ-SHELL-076` | none filed; not-a-question — D04-2 | build-ui, persona window |
| 56 | A `fail` acknowledgement carries an error a transient surface carries badly | `REQ-NOTIFY-018`, `REQ-SHELL-155` | none filed; already-ruled: REQ-NOTIFY-003 — D10-14 | design-ui, the acknowledgement stack |
| 57 | `Notice` as an acknowledgement's kind word, "Type an action…" in the palette | `REQ-NOTIFY-019`, `REQ-SHELL-051`, the glossary | [OQ-510][oq-510] — D10-15 | build-ui, acknowledgement stack and palette |
| 58 | A 9 px rail label against macOS's 10 pt floor | `REQ-SHELL-029`, `--rt-rail-label-size` | [OQ-504][oq-504] — D09-7 | debug-ui, navigation rail |
| 59 | What the main window opens at when the work area cannot hold 1440×900 | `REQ-SHELL-022`, `-167` | [OQ-508][oq-508] — D08-20 | debug-ui, main window |
| 60 | What a persona window or the terminal window shows at its smallest drag size | `REQ-SHELL-022`, `-167` | [OQ-527][oq-527] — D14-10 | debug-ui, persona and terminal windows |
| 61 | Compact mode triggers on the view's, the viewport's or the window's width | `REQ-SHELL-047`, `-059`, `REQ-MONITOR-051` | [OQ-524][oq-524] — D14-2 | debug-ui, Workspace |
| 62 | Is 700 px the centre's floor at every docked width? | `REQ-SHELL-064`, `-065` | [OQ-525][oq-525] — D14-3 | debug-ui, Workspace |
| 63 | Which positions stay predictable as panes become overlay drawers | `REQ-SHELL-059` | none filed; already-ruled: REQ-SHELL-059 — D05-7 | build-ui, Workspace |
| 64 | Below 1180 px the delegation tree no longer sits beside the transcript | `REQ-SHELL-059`, `-060` | [OQ-526][oq-526] — D14-5 | design-ui, Workspace |
| 65 | At 1000 px a board drag must keep the lifted card's column and the target in view | `REQ-TRACE-318` | [OQ-532][oq-532] — D14-13 | build-ui, Requirements board |
| 66 | Focus crossing graph nodes without re-centring | `REQ-TRACE-326`, `-327` | [OQ-512][oq-512] — D05-13 | build-ui, graph presentation |
| 67 | The built stepper keeps superseded "Agent Questions" and a step-pill row | `PD-CHAT-002`, `REQ-CHAT-099` | none filed; defect — D10-16, D10-17 | debug-ui, question stepper |
| 68 | Confirm buttons read Yes, and Submit, rather than naming the outcome | `REQ-GIT-117`, `REQ-LIBRARY-115`, `PD-CHAT-002`, `ConfirmDialog` | [OQ-510][oq-510] — D05-14, D10-18 | build-ui, `ConfirmDialog` and question stepper |
| 69 | The copy painting done from `--rt-ok` and pulsing at `--rt-duration-slow` | §7.2, `.agent-row__dot` | none filed; defect — D12-11 | debug-ui, agent row |
| 70 | Undo instead of confirmation for a deletion the store can restore | `REQ-NOTIFY-009`, `REQ-LIBRARY-115`, `-116` | [OQ-533][oq-533] — D05-15, D13-7 | design-ui, Library |
| 71 | The question stepper offers no reply the agent can read, only Escape | `PD-CHAT-002`, `REQ-CHAT-101` | none filed; request — D06-7 | design-ui, question stepper |
| 72 | Up to 10 steps of 8 options sit above the composer at once | `REQ-CHAT-092`, `PD-CHAT-002` | none filed; already-ruled: PD-CHAT-002 — D06-5 | design-ui, question stepper |
| 73 | Standard as the default for reviewing a finished run | `REQ-CHAT-061`, `PD-CHAT-010` | none filed; already-ruled: PD-CHAT-010 — D06-10 | design-ui, transcript |
| 74 | Which row the first Up reaches in a popup above the composer | `REQ-CHAT-024`, `-026` | none filed; already-ruled: REQ-CHAT-026 — D05-12 | debug-ui, composer popup |
| 75 | Enter's meaning is fixed, a long draft included | `REQ-CHAT-001` | none filed; request — D05-9, D05-10 | design-ui, composer |
| 76 | Seven tab stops on the navigation rail before a view's content | `REQ-SHELL-028`, `-032` | [OQ-505][oq-505] — D05-8 | design-ui, navigation rail |
| 77 | A run waiting on the approval dialog posts no OS notification | `REQ-SHELL-161` | none filed; request — D08-17 | design-ui, approval dialog |
| 78 | F1 alone for keyboard help on every desktop, laptops included | `REQ-SHELL-049` | [OQ-504][oq-504] — D08-18 | design-ui, keyboard help |
| 79 | macOS highlights a focused row instead of ringing it | §1.2, §1.7 | [OQ-504][oq-504] — D08-8 | debug-ui, `Table` and transcript rows |
| 80 | [G16 — relationship graph][g] | `REQ-TRACE-322` | §4.2 G16 — a build task, no ruling owed | build-ui, graph presentation |
| 81 | Following one run across a persona window and the main window splits attention | `REQ-SHELL-072`–`-079` | none filed; not-a-question — D03-9 | design-ui, persona window |
| 82 | What weight a model critic's usability finding carries without a journey walk | rubric F1, D3; `review-ui` | none filed; not-a-question — D01-6 | review-ui, the rubric |
| 83 | No check shows a surface took a region from the mockup rather than `REQ-SHELL-023` | §2, §7 | none filed; not-a-question — D01-7 | build-ui, step 1 on every surface |
| 84 | Where a sanctioned interim drawing lives while a gap is unfilled | `check-ui-language`, seams §8 | none filed; request — D12-3 | build-ui, any G1–G16 surface |
| 85 | A seconds digit past an hour, and strip figures repainted every 120 ms | `REQ-CHAT-158`, `REQ-SHELL-150`, `PD-CHAT-008` | [OQ-511][oq-511] — D13-9, D13-12 | debug-ui, run header and status strip |
| 86 | A non-emergency notice replaces the current one at once, no hold | `REQ-NOTIFY-024`, `-268`, `PD-STARTUP-010` | [OQ-511][oq-511] — D13-11 | build-ui, the notice slot |
| 87 | The agents card prints every count, zeros included | `REQ-MONITOR-169`, `PD-ORCH-005` | none filed; already-ruled: PD-ORCH-005 clause 23 — D03-11 | design-ui, Overview agents card |
| 88 | A tab that is not selected does not say it holds matches | `REQ-LIBRARY-103`, `-104` | [OQ-534][oq-534] — D03-12 | build-ui, Library |
| 89 | No stated links between a requirement, its commits and the run that made them | `REQ-SHELL-023` | none filed; request — D03-1 | design-ui, Requirements and Git |
| 90 | Do the board's columns answer an all-requirements-against-evidence overview? | `REQ-TRACE-232`, `-293`, `-322` | none filed; request — D04-6 | design-ui, Requirements |
| 91 | Motion for rearranged structure: board reorder, graph re-centring, a re-sorting tree | §1.8, `REQ-TRACE-322`, `-327` | [OQ-496][oq-496] — D03-8, D05-1, D05-2, D07-11 | build-ui, board and graph presentation |
| 92 | A pane becoming an overlay drawer drawn in one frame | §1.8, `REQ-TRACE-318` | [OQ-496][oq-496] — D14-1 | build-ui, overlay drawers |
| 93 | Is an overlay drawer among the surfaces allowed to float? | §1.7, `--rt-shadow-lg` | [OQ-513][oq-513] — D14-12 | debug-ui, overlay drawers |
| 94 | The hairline above the button row as the only cue a `Dialog` body scrolls | §1.7 | none filed; already-ruled: §1.7 — D14-11 | debug-ui, `Dialog` |
| 95 | Instant expansion of a reasoning row or folded tool group | §1.8 | none filed; already-ruled: §1.8 — D06-11 | build-ui, transcript |
| 96 | Paced release of streamed text, and in a hidden persona window | §1.8, `REQ-SHELL-151` | none filed; already-ruled: REQ-SHELL-150 — D06-12 | build-ui, transcript |
| 97 | Which component compares several fill-of-capacity values | `ContextRing`, `MeterBar` | none filed; not-a-question — D07-12 | design-ui, Overview |
| 98 | A summary level beside the exact figure | §1.11, `KpiCard`, `MeterBar` | none filed; not-a-question — D11-3 | design-ui, Overview |
| 99 | One glance crossing the status strip and the delegation tree mixes teal and amber meanings | §1.3, §7.3 | [OQ-501][oq-501] — D11-4 | debug-ui, status strip and delegation tree |
| 100 | `Spinner` or a layout-shaped placeholder; more than the pulse during long tool work | §1.8, `Spinner` | none filed; not-a-question — D01-5, D11-1 | design-ui, transcript and dense views |
| 101 | Rows of equal `KpiCard`s and mono labels: generated habits or earned on a data surface? | §1.4, §1.7, `REQ-MONITOR-165`–`-169` | none filed; not-a-question — D02-6, D02-18 | design-ui, Overview |
| 102 | `tok` carries no expanded accessible name (AAA) | §1.11 | [OQ-493][oq-493] — D10-5 | build-ui, status strip and `KpiCard` |
| 103 | Weight 300 for large mono numerals on the Linux renderer | §1.4 | none filed; already-ruled: REQ-SHELL-160 (a) — D08-13 | debug-ui, `KpiCard` on Linux |
| 104 | A notice about uncertain agent output in the agent's first person | §1.11 | [OQ-514][oq-514] — D06-14, D10-10 | design-ui, notices about agent output |
| 105 | Does the glossary bind what slash-command matching accepts? | `REQ-CHAT-018`, `REQ-SHELL-053` | none filed; already-ruled: REQ-SHELL-053 — D10-11 | build-ui, slash commands |
| 106 | Coined terms reaching visible copy, each explained where first met | `packages/ui/CONTEXT.md` | none filed; already-ruled: §1.11 — D10-12 | design-ui, the copy of every view |
| 107 | Warmth on first launch, on a failure, on cleared work | §1.7, §1.10, §1.11 | [OQ-515][oq-515] — D04-5, D10-1, D13-10 | design-ui, first launch and `EmptyState` |
| 108 | The user row's fill may read as an edit affordance | §7.2 item 2 | none filed; not-a-question — D02-16 | design-ui, transcript user row |
| 109 | Empty-state text over the grid motif | §1.10, `REQ-SHELL-160`(a) | none filed; already-ruled: REQ-SHELL-160 (a) — D02-17 | debug-ui, `EmptyState` |
| 110 | A board card lifted while dragged; press feedback | §1.7 | [OQ-513][oq-513] — D02-9 | build-ui, board card |
| 111 | The transcript's measure in pixels, not characters | §7.2 item 4, `--rt-prose-measure` | [OQ-535][oq-535] — D07-13 | debug-ui, transcript |
| 112 | Onset motion in the command palette's listing | §1.8, `REQ-SHELL-051` | [OQ-496][oq-496] — D03-7 | build-ui, command palette |
| 113 | Windows' Snap flyout and window menu are absent from the title bar | `PD-SHELL-003` | none filed; already-ruled: PD-SHELL-003 — D08-2, D08-3 | build-ui, title bar |
| 114 | Whose caption controls the macOS main window carries, and who measures it | `PD-SHELL-003`, IC-3 | none filed; already-ruled: PD-SHELL-003 revision 2 — D08-1 | build-ui, title bar on macOS |
| 115 | What the macOS menu bar holds | `PD-SHELL-003` | none filed; already-ruled: PD-SHELL-003 revision 2 — D08-4 | build-ui, macOS menu bar |
| 116 | A 44 px title bar against Windows' 32 px | `REQ-SHELL-033`, `-129` | [OQ-504][oq-504] — D08-5 | debug-ui, title bar |
| 117 | Native-framed auxiliary windows show the host's face | §1.4 | none filed; not-a-question — D08-7 | debug-ui, auxiliary windows |
| 118 | Exact numbers for forecasts as well as counts | §1.11, `REQ-CHAT-062`, `REQ-NOTIFY-043` | none filed; not-a-question — D10-7 | design-ui, the copy of progress |
| 119 | An animated or accelerating `MeterBar` feels faster; decline it on the record | §1.8, §1.11, `REQ-NOTIFY-043` | none filed; already-ruled: §1.8, §1.11 — D10-6, D10-8, D13-6 | — a note in §1.8 |
| 120 | §1.11's `waiting`, `done` beside `REQ-NOTIFY-048`'s `paused`, `completed` | §1.3, §1.11, `REQ-NOTIFY-048` | [OQ-510][oq-510] — D10-21 | — a note in §1.11 |
| 121 | The imperative against "you" in instructing sentences | §1.11 | none filed; not-a-question — D10-2 | — a note in §1.11 |
| 122 | One tone on Overview and on the approval dialog | §1.11 | none filed; not-a-question — D10-4 | — a note in §1.11 |
| 123 | `s` as the unit wherever it is left open | `REQ-CHAT-060`, `-062` | none filed; not-a-question — D10-19 | — a note in §1.11 |
| 124 | A one-sentence status line with or without its period | §1.11 | none filed; not-a-question — D10-20 | — a note in §1.11 |
| 125 | A second control in an empty state | `REQ-NOTIFY-006`, `EmptyState` | none filed; not-a-question — D10-23 | — a note in §1.11 |
| 126 | Sentence case against macOS and Linux title case | §1.11 | [OQ-504][oq-504] — D10-3 | — a note in §1.11 |
| 127 | A light theme for long sessions of small mono text | §1.1, `REQ-SHELL-128` | none filed; request — D02-15, D07-10, D08-10, D09-4 | — a note in §1.1 |
| 128 | Following the OS appearance and accent on macOS and GNOME | §1.2, `REQ-SHELL-128` | none filed; request — D08-11, D08-14 | — a note in §1.2 |
| 129 | A perceptual contrast figure beside the WCAG 2 ratios, as information | `REQ-SHELL-144`, `-145` | none filed; not-a-question — D02-13, D09-3 | — `pnpm theme-proof` |
| 130 | Line-heights on the 8 px module, or only gaps | §1.5 | none filed; not-a-question — D07-3 | — a note in §1.5 |
| 131 | An optical correction off the module, recorded so the audit passes it | §1 | [OQ-499][oq-499] — D07-4 | — `pnpm ui-audit` |
| 132 | An operator-tailored navigation rail | `REQ-SHELL-023`, `-027` | none filed; request — D03-4 | — a specification question |
| 133 | Prompts as the Library's default tab | `REQ-SHELL-152`, `REQ-LIBRARY-103` | none filed; request — D03-5 | — a specification question |
| 134 | A tree test of the fixed labels as sanitized evidence | `REQ-SHELL-023`, `REQ-CONFIG-268`, `REQ-LIBRARY-103` | none filed; not-a-question — D03-6 | — a specification question |
| 135 | How the approval dialog and the Git view divide the safeguard | `REQ-TOOLS-063` | none filed; not-a-question — D05-17 | — a note in the record |
| 136 | A marker for agent-made content, where nearly every row is one | §1.7, §7.2, §7.3 | none filed; already-ruled: PD-CHAT-005 — D02-12, D04-1, D06-13 | — a note in §1.7 |
| 137 | Losing Windows' translucent title-bar material and platform translucency | §1.1, §1.7 | none filed; not-a-question — D02-11, D08-6 | — a note in §1.7 |
| 138 | Resting surfaces carry no shadow beside native ones that do | §1.7 | none filed; not-a-question — D07-5 | — a note in §1.7 |
| 139 | Do the shadow tokens have an ambient and a direct layer? | §1.7, `--rt-shadow-md`, `-lg` | none filed; not-a-question — D02-8 | — a note in §1.7 |
| 140 | A reading face for the transcript in the preference store | §1.4, `REQ-SHELL-006` | none filed; request — D02-14 | — a note in §1.4 |
| 141 | Does the display-versus-body split earn its place on dense surfaces? | §1.4 | [OQ-500][oq-500] — D07-2 | — a note in §1.4 |
| 142 | The chroma-0 ground's reason, recorded so it can be weighed | §1.1 | none filed; not-a-question — D07-9 | — a note in §1.1 |
| 143 | Space Grotesk and violet are named generator defaults; record why they were chosen | §1.2, §1.4 | none filed; not-a-question — D01-1, D02-1, D02-2 | — a note in §1.2, §1.4 |
| 144 | Layered gradients and patterns, and a global aesthetics skill's precedence | §1.7, §1.10 | none filed; already-ruled: §2, §1.7 — D01-3, D02-4 | — a note in §1.7 |
| 145 | An entrance animation for a view or the first paint | §1.8, `REQ-SHELL-135` | [OQ-496][oq-496] — D01-4, D02-5 | — a note in §1.8 |
| 146 | Fill tokens named by axis, not by waiting and running | §1.3, `--rt-fill-x`, `--rt-fill-y` | [OQ-536][oq-536] — D12-4 | build-ui, `.tag-run`, `.tag-wait` |
| 147 | Which governs where `themes.ts` and the adopted sheet disagree | §1.12 | none filed; already-ruled: §1.12 — D12-1 | — `pnpm theme-proof` |
| 148 | A known divergence inside the adopted sheet as a defect note | §1.2, §1.12 | none filed; not-a-question — D12-10 | — a defect note |
| 149 | Which design-language checks block and which belong to review-ui | `check-ui-language` | none filed; request — D12-7 | — `pnpm lint` |
| 150 | The pixel half of token enforcement on a burn-down, said in the adopted text | §1, `ui-language-baseline.json` | [OQ-499][oq-499] — D12-8, D12-9 | — a note in §1 |
| 151 | A deprecated stage for `--rt-*` tokens and component props | `AGENTS.md` | none filed; not-a-question — D12-6 | — a note in §1.12 |
| 152 | The single-home rule's reason, the measured drift of copies | `AGENTS.md` | none filed; not-a-question — D12-2 | — a note in the record |
| 153 | A generator of the three themes from few inputs | `REQ-SHELL-128` | none filed; not-a-question — D12-5 | — a note in §1.12 |

[g]: ../../design/README/04-4-component-inventory-against-the-specification.md#42-affordances-with-no-component-at-all
[oq-493]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-493
[oq-494]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-494
[oq-495]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-495
[oq-496]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496
[oq-497]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-497
[oq-498]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498
[oq-499]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-499
[oq-500]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-500
[oq-501]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-501
[oq-502]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-502
[oq-503]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-503
[oq-504]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-504
[oq-505]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-505
[oq-506]: ../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-506
[oq-507]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-507
[oq-508]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-508
[oq-509]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-509
[oq-510]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-510
[oq-511]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-511
[oq-512]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-512
[oq-513]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-513
[oq-514]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-514
[oq-515]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-515
[oq-516]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-516
[oq-517]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-517
[oq-518]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-518
[oq-519]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-519
[oq-520]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-520
[oq-521]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-521
[oq-522]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-522
[oq-523]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-523
[oq-524]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-524
[oq-525]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-525
[oq-526]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-526
[oq-527]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-527
[oq-528]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-528
[oq-529]: ../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-529
[oq-530]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-530
[oq-531]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-531
[oq-532]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-532
[oq-533]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-533
[oq-534]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-534
[oq-535]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-535
[oq-536]: ../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-536

## What this backlog is not

Recommendations only. Nothing here changes a token, a component, a requirement or a directive. A row is decided by the open question it names, once that question is filed and ruled, or is already recorded as a §4.2 gap; the rank orders the asking, not the answer. Where a ruling departs from a requirement it is minted as a directive, and the requirement keeps its text.
