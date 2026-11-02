# The overhaul backlog — what the research proposes for the adopted material

**Review date:** 2026-11-02
**Status:** recommendations only. Nothing here changes a token, a component, a requirement or a directive; each row names the open question that decides it, or the §4.2 gap that already records it.

Collected from every guide's section 8 and from [`docs/design/README.md` §4.2](../../design/README/04-4-component-inventory-against-the-specification.md) (G1–G16), ranked by user harm × breadth × effort. The owner chose to have this list on 2026-11-01 (`docs/product/requests.md`, the design-system overhaul).

The fourteen guides raise 192 disagreements; 93 of them, near-duplicates across or within guides, merge into 38 rows, so 137 rows carry them, and the 16 gaps of [§4.2](../../design/README/04-4-component-inventory-against-the-specification.md#42-affordances-with-no-component-at-all) add 16 more: 153 rows.

**Ranking rule:** user harm first (misleads or blocks a step of an operator's journey, or falls below an accessibility floor), then breadth (how many primary views and windows it reaches), then inverse effort; a record note with no visible effect ranks last.

| Rank | Item | What it meets | Decided by | Executes once ruled |
|---|---|---|---|---|
| 1 | An acknowledgement's lifetime is a time limit (SC 2.2.1): its content and its one action ("Start a new session") must be reachable after it withdraws, or it pauses on hover and focus | `REQ-NOTIFY-003`, `-011`, `-015`, `REQ-SHELL-112`, `PD-WORKSPACE-001` | open question to raise — D05-5, D09-5, D11-5, D13-1, D13-2, D13-3 | build-ui, the acknowledgement stack |
| 2 | [G2 — approval dialog][g] | `REQ-TOOLS-063` | §4.2 G2 — a build task, no ruling owed | build-ui, approval dialog |
| 3 | [G7 — transcript row and virtualised transcript][g] | `REQ-CHAT-046`, `-055`–`-067`, `-163`–`-165`, `-175`–`-178` | §4.2 G7 — a build task, no ruling owed | build-ui, transcript |
| 4 | A pulse lasting a whole run needs a pause, stop or hide (SC 2.2.2); does the in-app reduced-motion setting stop the pulse and the spinner mid-run? | §1.8, `REQ-SHELL-135` | open question to raise — D11-2, D13-8 | debug-ui, every `StatusDot` and `Spinner` |
| 5 | Text enlargement to 200 % and renderer zoom lay a 1000 px window out below every threshold | `REQ-SHELL-022`, `-030`, `-160`(d) | open question to raise — D09-12, D14-6 | debug-ui, every primary view at 1000×680 |
| 6 | [G1 — persistent notice below the title bar][g] | `REQ-SHELL-114`, `-116`, `-118`, `REQ-NOTIFY-034`–`-043` | §4.2 G1 — a build task, no ruling owed | build-ui, the notice slot |
| 7 | A tool row awaiting approval reads like one executing, within `running`/`ok`/`failed`/`blocked` | `REQ-MONITOR-105`, `REQ-CHAT-060` | open question to raise — D13-13 | build-ui, tool row |
| 8 | The filled Approve once may draw the eye toward approving an unread call | §1.7 (one filled control), `REQ-TOOLS-063` | open question to raise — D04-10 | design-ui, approval dialog |
| 9 | The approval dialog says nothing of what a session-wide approval lets through, or whether the call can be undone | `REQ-TOOLS-063` | open question to raise — D04-9, D06-6 | design-ui, approval dialog |
| 10 | Where a returning operator, or one with a closed overlay drawer, finds every pending approval, question and finished run | `REQ-SHELL-023`, `-061`, `REQ-NOTIFY-003` | open question to raise — D04-3, D13-4, D14-4 | design-ui, Overview's sessions card and the status strip |
| 11 | [G14 — question stepper][g] | `REQ-TOOLS-158`, `REQ-CHAT-046` | §4.2 G14 — a build task, no ruling owed | build-ui, question stepper |
| 12 | Which surface owns a live region for streamed rows and terminal output, at what politeness, how often, capped | `REQ-SHELL-144`, `-146`, `REQ-CHAT-178` | open question to raise — D09-9, D09-10 | build-ui, transcript and terminal window |
| 13 | The 300 s question timeout is a hidden limit an absent or screen-reader operator returns to expired | `REQ-CHAT-093`, `REQ-SHELL-144`..`-168` | open question to raise — D06-4 | build-ui, question stepper |
| 14 | [G3 — delegation tree][g] | `REQ-MONITOR-036`–`-043`, `-304` | §4.2 G3 — a build task, no ruling owed | build-ui, delegation tree |
| 15 | Persona hues sit one stop from the state hues: is a `--rt-viz-2` label told from a `--rt-run` dot without the word? | §1.3, `PD-CHAT-005` | open question to raise — D06-15 | debug-ui, transcript rows and delegation tree |
| 16 | Accent and Z `done` share hue 292: a selected row, a link and a `done` `StatusDot` on one surface | §1.2, §1.3 | open question to raise — D07-7, D08-15 | debug-ui, delegation tree and `Table` rows |
| 17 | Running teal and info cyan at 6 px | §1.3, `StatusDot` | open question to raise — D07-8 | debug-ui, `StatusDot` |
| 18 | A selected board card or graph node told apart without colour (SC 1.4.11) | §1.2, G15, G16 | open question to raise — D09-6 | build-ui, Requirements board and graph |
| 19 | A divider owes a single-pointer route (SC 2.5.7) | `REQ-SHELL-066`–`-070` | open question to raise — D08-21 | build-ui, pane divider |
| 20 | No command moves between the window's regions (F6) | `REQ-SHELL-049` | open question to raise — D09-13 | build-ui, main window regions |
| 21 | [G10 — status strip][g] | `REQ-SHELL-038`–`-047`, `REQ-TOOLS-184` | §4.2 G10 — a build task, no ruling owed | build-ui, status strip |
| 22 | [G8 — split pane and divider][g] | `REQ-SHELL-066`–`-071` | §4.2 G8 — a build task, no ruling owed | build-ui, pane divider |
| 23 | [G9 — compact overlay drawer][g] | `REQ-SHELL-059`–`-063` | §4.2 G9 — a build task, no ruling owed | build-ui, overlay drawers |
| 24 | Under forced colours, what marks a `Dialog` or drawer as floating, and does the shell defer or switch theme? | §1.7, `REQ-SHELL-128`, `-160`(b) | open question to raise — D08-12, D09-11 | debug-ui, `Dialog` and overlay drawers |
| 25 | The first pending approval auto-opens at once rather than at the operator's next breakpoint | `REQ-CHAT-103`, `PD-CHAT-002` | open question to raise — D06-1 | design-ui, approval dialog |
| 26 | The next request appears as the dialog closes, one at a time, while other agents go unwatched | `REQ-TOOLS-063` | open question to raise — D05-16, D06-2 | design-ui, approval queue |
| 27 | A habituated approval dialog: a distinct presentation for a high-impact request, still or moving | §1.7, §1.8, `REQ-TOOLS-063` | open question to raise — D05-3, D06-3, D10-9 | design-ui, approval dialog |
| 28 | Title `Allow <agent> to run <tool>?` beside Approve once; is `<tool>` the name or the description? | `REQ-TOOLS-063`, `REQ-CHAT-175` | open question to raise — D10-13 | design-ui, approval dialog |
| 29 | The undeliverable-answer sentences give the cause and no next step | `REQ-CHAT-102`, `-103` | open question to raise — D10-22 | build-ui, approval dialog and question stepper |
| 30 | A live agent-message row draws no mark until the ten-second stall | `PD-CHAT-006`, `REQ-CHAT-164` | open question to raise — D06-9 | build-ui, transcript |
| 31 | Stopping is not reached where the run started; the composer's button reads `Queue` | `REQ-CHAT-005` | open question to raise — D06-8 | build-ui, composer |
| 32 | An unavailable command omitted or shown disabled with its reason; context menus per platform | `REQ-SHELL-048`, `-053`, `REQ-NOTIFY-008` | open question to raise — D05-6, D08-16 | build-ui, command palette |
| 33 | A crash relaunch's repair announced as a non-modal notice with a notice action | `REQ-MONITOR-210` | open question to raise — D04-7 | build-ui, the notice slot |
| 34 | Unsaved Settings edits are lost on quit, where the draft survives | the OQ-298 ruling, `REQ-CHAT-015` | open question to raise — D04-8 | build-ui, Settings |
| 35 | The safety flags are stated only in the status strip | `REQ-SHELL-024`, `-041` | open question to raise — D08-19 | design-ui, status strip |
| 36 | The one-colour ring on a hovered, focused row and against accent ink | §1.7, `--rt-focus` | open question to raise — D05-4, D09-1 | debug-ui, focus ring |
| 37 | [G11 — title-bar chips][g] | `REQ-SHELL-033`–`-037` | §4.2 G11 — a build task, no ruling owed | build-ui, title bar |
| 38 | [G6 — diff rendering][g] | `REQ-CHAT-050`, the Git view | §4.2 G6 — a build task, no ruling owed | build-ui, transcript and Git |
| 39 | [G15 — board column and card][g] | `REQ-TRACE-232`–`-235`, `-242`, `-281`, `-303`, `-358` | §4.2 G15 — a build task, no ruling owed | build-ui, Requirements board |
| 40 | [G4 — evidence indicator][g] | `REQ-TRACE-258`–`-261` | §4.2 G4 — a build task, no ruling owed | build-ui, requirement card |
| 41 | Deferred Save beside Interface applying at once: how a control shows its commit policy | `REQ-CONFIG-270`, `-286`, `-399`, `REQ-SHELL-124` | open question to raise — D03-2 | design-ui, Settings |
| 42 | An arrow key through the delegation tree may open a persona window | `REQ-MONITOR-304`, `REQ-SHELL-073`, `-153` | open question to raise — D09-8 | build-ui, delegation tree |
| 43 | The overlay drawers have no command with a shortcut | `REQ-SHELL-048`, `-049`, `-062` | open question to raise — D14-7 | build-ui, overlay drawers |
| 44 | Ctrl+Return from anywhere meets a control or the terminal window that answers it | `REQ-CHAT-001` | open question to raise — D05-11 | debug-ui, composer and terminal window |
| 45 | [G5 — terminal character grid and its controls][g] | `REQ-SHELL-087`–`-095` | §4.2 G5 — a build task, no ruling owed | build-ui, terminal window |
| 46 | A 2 px inset ring fails SC 2.4.13's area (AAA) | §1.8 note 3, `REQ-SHELL-148`, `-160`(c) | open question to raise — D08-9, D09-2 | debug-ui, focus ring |
| 47 | One elided line may not identify a tool row in a narrow window | `REQ-CHAT-175`, §7.4 | open question to raise — D14-8 | debug-ui, tool row |
| 48 | Strip controls shortened to an icon: does the tooltip carry the label for a keyboard user? | `PD-CHAT-001` rev. 3 | open question to raise — D14-9 | debug-ui, composer strip |
| 49 | Without weight, do size, colour and space separate row headers, `Table` group headers, the tool name? | §1.4 | open question to raise — D01-2, D02-3, D03-3, D07-1 | design-ui, `Table` and transcript rows |
| 50 | Flat secondary `Button`s and icon controls may not read as controls | §1.7 | open question to raise — D02-10, D07-6 | design-ui, `Button` |
| 51 | The pulse marks running, which needs nobody; should it mark what needs the operator, or grow with waiting? | §1.8, `REQ-MONITOR-171` | open question to raise — D02-7, D03-10, D04-4 | design-ui, `StatusDot` and sessions card |
| 52 | [G12 — indeterminate non-cancellable progress dialog][g] | `REQ-SHELL-117` | §4.2 G12 — a build task, no ruling owed | build-ui, progress dialog |
| 53 | The progress dialog appears at once with no delay, and past 10 s says nothing of how far | `REQ-SHELL-117` | open question to raise — D11-6, D13-5 | build-ui, progress dialog |
| 54 | [G13 — keyboard-help dialog][g] | `REQ-SHELL-054` | §4.2 G13 — a build task, no ruling owed | build-ui, keyboard help |
| 55 | Closing a persona window or the main window does not say the run continues | `REQ-SHELL-076` | open question to raise — D04-2 | build-ui, persona window |
| 56 | A `fail` acknowledgement carries an error a transient surface carries badly | `REQ-NOTIFY-018`, `REQ-SHELL-155` | open question to raise — D10-14 | design-ui, the acknowledgement stack |
| 57 | `Notice` as an acknowledgement's kind word, "Type an action…" in the palette | `REQ-NOTIFY-019`, `REQ-SHELL-051`, the glossary | open question to raise — D10-15 | build-ui, acknowledgement stack and palette |
| 58 | A 9 px rail label against macOS's 10 pt floor | `REQ-SHELL-029`, `--rt-rail-label-size` | open question to raise — D09-7 | debug-ui, navigation rail |
| 59 | What the main window opens at when the work area cannot hold 1440×900 | `REQ-SHELL-022`, `-167` | open question to raise — D08-20 | debug-ui, main window |
| 60 | What a persona window or the terminal window shows at its smallest drag size | `REQ-SHELL-022`, `-167` | open question to raise — D14-10 | debug-ui, persona and terminal windows |
| 61 | Compact mode triggers on the view's, the viewport's or the window's width | `REQ-SHELL-047`, `-059`, `REQ-MONITOR-051` | open question to raise — D14-2 | debug-ui, Workspace |
| 62 | Is 700 px the centre's floor at every docked width? | `REQ-SHELL-064`, `-065` | open question to raise — D14-3 | debug-ui, Workspace |
| 63 | Which positions stay predictable as panes become overlay drawers | `REQ-SHELL-059` | open question to raise — D05-7 | build-ui, Workspace |
| 64 | Below 1180 px the delegation tree no longer sits beside the transcript | `REQ-SHELL-059`, `-060` | open question to raise — D14-5 | design-ui, Workspace |
| 65 | At 1000 px a board drag must keep the lifted card's column and the target in view | `REQ-TRACE-318` | open question to raise — D14-13 | build-ui, Requirements board |
| 66 | Focus crossing graph nodes without re-centring | `REQ-TRACE-326`, `-327` | open question to raise — D05-13 | build-ui, graph presentation |
| 67 | The built stepper keeps superseded "Agent Questions" and a step-pill row | `PD-CHAT-002`, `REQ-CHAT-099` | open question to raise — D10-16, D10-17 | debug-ui, question stepper |
| 68 | Confirm buttons read Yes, and Submit, rather than naming the outcome | `REQ-GIT-117`, `REQ-LIBRARY-115`, `PD-CHAT-002`, `ConfirmDialog` | open question to raise — D05-14, D10-18 | build-ui, `ConfirmDialog` and question stepper |
| 69 | The copy painting done from `--rt-ok` and pulsing at `--rt-duration-slow` | §7.2, `.agent-row__dot` | open question to raise — D12-11 | debug-ui, agent row |
| 70 | Undo instead of confirmation for a deletion the store can restore | `REQ-NOTIFY-009`, `REQ-LIBRARY-115`, `-116` | open question to raise — D05-15, D13-7 | design-ui, Library |
| 71 | The question stepper offers no reply the agent can read, only Escape | `PD-CHAT-002`, `REQ-CHAT-101` | open question to raise — D06-7 | design-ui, question stepper |
| 72 | Up to 10 steps of 8 options sit above the composer at once | `REQ-CHAT-092`, `PD-CHAT-002` | open question to raise — D06-5 | design-ui, question stepper |
| 73 | Standard as the default for reviewing a finished run | `REQ-CHAT-061`, `PD-CHAT-010` | open question to raise — D06-10 | design-ui, transcript |
| 74 | Which row the first Up reaches in a popup above the composer | `REQ-CHAT-024`, `-026` | open question to raise — D05-12 | debug-ui, composer popup |
| 75 | Enter's meaning is fixed, a long draft included | `REQ-CHAT-001` | open question to raise — D05-9, D05-10 | design-ui, composer |
| 76 | Seven tab stops on the navigation rail before a view's content | `REQ-SHELL-028`, `-032` | open question to raise — D05-8 | design-ui, navigation rail |
| 77 | A run waiting on the approval dialog posts no OS notification | `REQ-SHELL-161` | open question to raise — D08-17 | design-ui, approval dialog |
| 78 | F1 alone for keyboard help on every desktop, laptops included | `REQ-SHELL-049` | open question to raise — D08-18 | design-ui, keyboard help |
| 79 | macOS highlights a focused row instead of ringing it | §1.2, §1.7 | open question to raise — D08-8 | debug-ui, `Table` and transcript rows |
| 80 | [G16 — relationship graph][g] | `REQ-TRACE-322` | §4.2 G16 — a build task, no ruling owed | build-ui, graph presentation |
| 81 | Following one run across a persona window and the main window splits attention | `REQ-SHELL-072`–`-079` | open question to raise — D03-9 | design-ui, persona window |
| 82 | What weight a model critic's usability finding carries without a journey walk | rubric F1, D3; `review-ui` | open question to raise — D01-6 | review-ui, the rubric |
| 83 | No check shows a surface took a region from the mockup rather than `REQ-SHELL-023` | §2, §7 | open question to raise — D01-7 | build-ui, step 1 on every surface |
| 84 | Where a sanctioned interim drawing lives while a gap is unfilled | `check-ui-language`, seams §8 | open question to raise — D12-3 | build-ui, any G1–G16 surface |
| 85 | A seconds digit past an hour, and strip figures repainted every 120 ms | `REQ-CHAT-158`, `REQ-SHELL-150`, `PD-CHAT-008` | open question to raise — D13-9, D13-12 | debug-ui, run header and status strip |
| 86 | A non-emergency notice replaces the current one at once, no hold | `REQ-NOTIFY-024`, `-268`, `PD-STARTUP-010` | open question to raise — D13-11 | build-ui, the notice slot |
| 87 | The agents card prints every count, zeros included | `REQ-MONITOR-169`, `PD-ORCH-005` | open question to raise — D03-11 | design-ui, Overview agents card |
| 88 | A tab that is not selected does not say it holds matches | `REQ-LIBRARY-103`, `-104` | open question to raise — D03-12 | build-ui, Library |
| 89 | No stated links between a requirement, its commits and the run that made them | `REQ-SHELL-023` | open question to raise — D03-1 | design-ui, Requirements and Git |
| 90 | Do the board's columns answer an all-requirements-against-evidence overview? | `REQ-TRACE-232`, `-293`, `-322` | open question to raise — D04-6 | design-ui, Requirements |
| 91 | Motion for rearranged structure: board reorder, graph re-centring, a re-sorting tree | §1.8, `REQ-TRACE-322`, `-327` | open question to raise — D03-8, D05-1, D05-2, D07-11 | build-ui, board and graph presentation |
| 92 | A pane becoming an overlay drawer drawn in one frame | §1.8, `REQ-TRACE-318` | open question to raise — D14-1 | build-ui, overlay drawers |
| 93 | Is an overlay drawer among the surfaces allowed to float? | §1.7, `--rt-shadow-lg` | open question to raise — D14-12 | debug-ui, overlay drawers |
| 94 | The hairline above the button row as the only cue a `Dialog` body scrolls | §1.7 | open question to raise — D14-11 | debug-ui, `Dialog` |
| 95 | Instant expansion of a reasoning row or folded tool group | §1.8 | open question to raise — D06-11 | build-ui, transcript |
| 96 | Paced release of streamed text, and in a hidden persona window | §1.8, `REQ-SHELL-151` | open question to raise — D06-12 | build-ui, transcript |
| 97 | Which component compares several fill-of-capacity values | `ContextRing`, `MeterBar` | open question to raise — D07-12 | design-ui, Overview |
| 98 | A summary level beside the exact figure | §1.11, `KpiCard`, `MeterBar` | open question to raise — D11-3 | design-ui, Overview |
| 99 | One glance crossing the status strip and the delegation tree mixes teal and amber meanings | §1.3, §7.3 | open question to raise — D11-4 | debug-ui, status strip and delegation tree |
| 100 | `Spinner` or a layout-shaped placeholder; more than the pulse during long tool work | §1.8, `Spinner` | open question to raise — D01-5, D11-1 | design-ui, transcript and dense views |
| 101 | Rows of equal `KpiCard`s and mono labels: generated habits or earned on a data surface? | §1.4, §1.7, `REQ-MONITOR-165`–`-169` | open question to raise — D02-6, D02-18 | design-ui, Overview |
| 102 | `tok` carries no expanded accessible name (AAA) | §1.11 | open question to raise — D10-5 | build-ui, status strip and `KpiCard` |
| 103 | Weight 300 for large mono numerals on the Linux renderer | §1.4 | open question to raise — D08-13 | debug-ui, `KpiCard` on Linux |
| 104 | A notice about uncertain agent output in the agent's first person | §1.11 | open question to raise — D06-14, D10-10 | design-ui, notices about agent output |
| 105 | Does the glossary bind what slash-command matching accepts? | `REQ-CHAT-018`, `REQ-SHELL-053` | open question to raise — D10-11 | build-ui, slash commands |
| 106 | Coined terms reaching visible copy, each explained where first met | `packages/ui/CONTEXT.md` | open question to raise — D10-12 | design-ui, the copy of every view |
| 107 | Warmth on first launch, on a failure, on cleared work | §1.7, §1.10, §1.11 | open question to raise — D04-5, D10-1, D13-10 | design-ui, first launch and `EmptyState` |
| 108 | The user row's fill may read as an edit affordance | §7.2 item 2 | open question to raise — D02-16 | design-ui, transcript user row |
| 109 | Empty-state text over the grid motif | §1.10, `REQ-SHELL-160`(a) | open question to raise — D02-17 | debug-ui, `EmptyState` |
| 110 | A board card lifted while dragged; press feedback | §1.7 | open question to raise — D02-9 | build-ui, board card |
| 111 | The transcript's measure in pixels, not characters | §7.2 item 4, `--rt-prose-measure` | open question to raise — D07-13 | debug-ui, transcript |
| 112 | Onset motion in the command palette's listing | §1.8, `REQ-SHELL-051` | open question to raise — D03-7 | build-ui, command palette |
| 113 | Windows' Snap flyout and window menu are absent from the title bar | `PD-SHELL-003` | open question to raise — D08-2, D08-3 | build-ui, title bar |
| 114 | Whose caption controls the macOS main window carries, and who measures it | `PD-SHELL-003`, IC-3 | open question to raise — D08-1 | build-ui, title bar on macOS |
| 115 | What the macOS menu bar holds | `PD-SHELL-003` | open question to raise — D08-4 | build-ui, macOS menu bar |
| 116 | A 44 px title bar against Windows' 32 px | `REQ-SHELL-033`, `-129` | open question to raise — D08-5 | debug-ui, title bar |
| 117 | Native-framed auxiliary windows show the host's face | §1.4 | open question to raise — D08-7 | debug-ui, auxiliary windows |
| 118 | Exact numbers for forecasts as well as counts | §1.11, `REQ-CHAT-062`, `REQ-NOTIFY-043` | open question to raise — D10-7 | design-ui, the copy of progress |
| 119 | An animated or accelerating `MeterBar` feels faster; decline it on the record | §1.8, §1.11, `REQ-NOTIFY-043` | open question to raise — D10-6, D10-8, D13-6 | — a note in §1.8 |
| 120 | §1.11's `waiting`, `done` beside `REQ-NOTIFY-048`'s `paused`, `completed` | §1.3, §1.11, `REQ-NOTIFY-048` | open question to raise — D10-21 | — a note in §1.11 |
| 121 | The imperative against "you" in instructing sentences | §1.11 | open question to raise — D10-2 | — a note in §1.11 |
| 122 | One tone on Overview and on the approval dialog | §1.11 | open question to raise — D10-4 | — a note in §1.11 |
| 123 | `s` as the unit wherever it is left open | `REQ-CHAT-060`, `-062` | open question to raise — D10-19 | — a note in §1.11 |
| 124 | A one-sentence status line with or without its period | §1.11 | open question to raise — D10-20 | — a note in §1.11 |
| 125 | A second control in an empty state | `REQ-NOTIFY-006`, `EmptyState` | open question to raise — D10-23 | — a note in §1.11 |
| 126 | Sentence case against macOS and Linux title case | §1.11 | open question to raise — D10-3 | — a note in §1.11 |
| 127 | A light theme for long sessions of small mono text | §1.1, `REQ-SHELL-128` | open question to raise — D02-15, D07-10, D08-10, D09-4 | — a note in §1.1 |
| 128 | Following the OS appearance and accent on macOS and GNOME | §1.2, `REQ-SHELL-128` | open question to raise — D08-11, D08-14 | — a note in §1.2 |
| 129 | A perceptual contrast figure beside the WCAG 2 ratios, as information | `REQ-SHELL-144`, `-145` | open question to raise — D02-13, D09-3 | — `pnpm theme-proof` |
| 130 | Line-heights on the 8 px module, or only gaps | §1.5 | open question to raise — D07-3 | — a note in §1.5 |
| 131 | An optical correction off the module, recorded so the audit passes it | §1 | open question to raise — D07-4 | — `pnpm ui-audit` |
| 132 | An operator-tailored navigation rail | `REQ-SHELL-023`, `-027` | open question to raise — D03-4 | — a specification question |
| 133 | Prompts as the Library's default tab | `REQ-SHELL-152`, `REQ-LIBRARY-103` | open question to raise — D03-5 | — a specification question |
| 134 | A tree test of the fixed labels as sanitized evidence | `REQ-SHELL-023`, `REQ-CONFIG-268`, `REQ-LIBRARY-103` | open question to raise — D03-6 | — a specification question |
| 135 | How the approval dialog and the Git view divide the safeguard | `REQ-TOOLS-063` | open question to raise — D05-17 | — a note in the record |
| 136 | A marker for agent-made content, where nearly every row is one | §1.7, §7.2, §7.3 | open question to raise — D02-12, D04-1, D06-13 | — a note in §1.7 |
| 137 | Losing Windows' translucent title-bar material and platform translucency | §1.1, §1.7 | open question to raise — D02-11, D08-6 | — a note in §1.7 |
| 138 | Resting surfaces carry no shadow beside native ones that do | §1.7 | open question to raise — D07-5 | — a note in §1.7 |
| 139 | Do the shadow tokens have an ambient and a direct layer? | §1.7, `--rt-shadow-md`, `-lg` | open question to raise — D02-8 | — a note in §1.7 |
| 140 | A reading face for the transcript in the preference store | §1.4, `REQ-SHELL-006` | open question to raise — D02-14 | — a note in §1.4 |
| 141 | Does the display-versus-body split earn its place on dense surfaces? | §1.4 | open question to raise — D07-2 | — a note in §1.4 |
| 142 | The chroma-0 ground's reason, recorded so it can be weighed | §1.1 | open question to raise — D07-9 | — a note in §1.1 |
| 143 | Space Grotesk and violet are named generator defaults; record why they were chosen | §1.2, §1.4 | open question to raise — D01-1, D02-1, D02-2 | — a note in §1.2, §1.4 |
| 144 | Layered gradients and patterns, and a global aesthetics skill's precedence | §1.7, §1.10 | open question to raise — D01-3, D02-4 | — a note in §1.7 |
| 145 | An entrance animation for a view or the first paint | §1.8, `REQ-SHELL-135` | open question to raise — D01-4, D02-5 | — a note in §1.8 |
| 146 | Fill tokens named by axis, not by waiting and running | §1.3, `--rt-fill-x`, `--rt-fill-y` | open question to raise — D12-4 | build-ui, `.tag-run`, `.tag-wait` |
| 147 | Which governs where `themes.ts` and the adopted sheet disagree | §1.12 | open question to raise — D12-1 | — `pnpm theme-proof` |
| 148 | A known divergence inside the adopted sheet as a defect note | §1.2, §1.12 | open question to raise — D12-10 | — a defect note |
| 149 | Which design-language checks block and which belong to review-ui | `check-ui-language` | open question to raise — D12-7 | — `pnpm lint` |
| 150 | The pixel half of token enforcement on a burn-down, said in the adopted text | §1, `ui-language-baseline.json` | open question to raise — D12-8, D12-9 | — a note in §1 |
| 151 | A deprecated stage for `--rt-*` tokens and component props | `AGENTS.md` | open question to raise — D12-6 | — a note in §1.12 |
| 152 | The single-home rule's reason, the measured drift of copies | `AGENTS.md` | open question to raise — D12-2 | — a note in the record |
| 153 | A generator of the three themes from few inputs | `REQ-SHELL-128` | open question to raise — D12-5 | — a note in §1.12 |

[g]: ../../design/README/04-4-component-inventory-against-the-specification.md#42-affordances-with-no-component-at-all

## What this backlog is not

Recommendations only. Nothing here changes a token, a component, a requirement or a directive. A row is decided by the open question it names, once that question is filed and ruled, or is already recorded as a §4.2 gap; the rank orders the asking, not the answer. Where a ruling departs from a requirement it is minted as a directive, and the requirement keeps its text.
