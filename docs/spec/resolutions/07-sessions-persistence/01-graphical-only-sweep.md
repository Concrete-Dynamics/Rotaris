# Open-Question Resolutions — Session Persistence, Resume, and Background Sessions — Graphical-only sweep

Part 1 of 4 of [domain 07's resolutions](../07-sessions-persistence.md), which indexes every part.

## Graphical-only sweep

Every requirement whose only observable surface was a command line, a subcommand, a flag, a process
exit code, a script-oriented output stream, or a full-screen text-mode interface has been withdrawn.
No capability was lost with the surface: each row below names the desktop requirement that now
carries it.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-SESSION-075 | Terminal run-result status → process exit-code mapping | REQ-SESSION-187 — the terminal run-outcome vocabulary and its totality rule, with no exit codes |
| REQ-SESSION-097 | Two command-line front-ends and the headless subcommand inventory | REQ-SESSION-182 (session management), REQ-SESSION-184 (starting runs), REQ-SESSION-188 and REQ-SESSION-189 (event history, replay, export). `version`/`setup`/`login`/`logout`/`providers` belong to domains 15 and 04; `requirements` to domain 08; `checkpoints` to domain 06 |
| REQ-SESSION-098 | `run` command flags | REQ-SESSION-184, together with REQ-SHELL-125 (start-session dialog), REQ-GIT-005 and REQ-GIT-007 (worktree storage and branch defaults) |
| REQ-SESSION-099 | `--output-format stream-json` stdout contract | REQ-SESSION-189 — the raw stored event lines are obtainable as a file export, byte-identical to the history |
| REQ-SESSION-100 | Refusal of worktree options on an interactive invocation | REQ-SESSION-184 — worktree choices are collected only where a task is being started, so the refused combination is unreachable |
| REQ-SESSION-101 | Headless `run` task/session requirement and config-error output | REQ-SESSION-184 — a launch with neither a task nor a session to resume is refused before a session exists |
| REQ-SESSION-102 | `Created session <id>` / `Resuming session <id>` announce line | REQ-SESSION-185 — the session id is displayed as soon as the session exists, distinguishing created from resumed |
| REQ-SESSION-103 | Outcome printing and process exit code | REQ-SESSION-186 — one run outcome presented from the same derivation as the `result` event |
| REQ-SESSION-104 | Ctrl-C handling (first graceful, second forced) | REQ-SESSION-186 — the stop control: first activation requests a graceful stop, second forces cancellation |
| REQ-SESSION-105 | `sessions` listing and `sessions --repair` | REQ-SESSION-182 — the session list marks stale sessions and offers repair, per session and for all |
| REQ-SESSION-117 | Terminal-UI `/resume`, command-palette and cheatsheet entries | REQ-SESSION-182, opened through the session browser of REQ-SHELL-126 and the action vocabulary of REQ-SHELL-048 |
| REQ-SESSION-119 | Terminal-UI `/background` hand-off that did not detach | REQ-SESSION-190 — a real background hand-off that detaches the view and leaves the run and its lock alive |
| REQ-SESSION-152 | `events list` / `replay` / `export` command | REQ-SESSION-188 (browse and replay with filters) and REQ-SESSION-189 (export, warnings, destination, batch shape) |
| REQ-SESSION-165 | `checkpoints list` / `restore` command | REQ-GIT-096 and the desktop checkpoint browser of domain 06; the session-side refusal stays in REQ-SESSION-164 |

Shell-surface clauses were struck from, and the requirement kept in, REQ-SESSION-001, 002, 003, 041,
055, 064, 066, 073, 080, 082, 087, 091, 092, 096, 106, 107, 109, 110, 120, 131, 151, 154, 159 and
181.

### Legacy-layout removal

Two further withdrawals are not about a shell surface but about compatibility with a predecessor
this product does not have. A clean-room product has no earlier on-disk version to fall back to, and
naming one would require a forbidden source (product-owner decision 1, and decision B on legacy
directories).

| Withdrawn | What it was | Replacement |
| --- | --- | --- |
| REQ-SESSION-005 | Legacy whole-state `snapshot.json` fallback file | None needed — `state/resume.json` is the only resumable-state file |
| REQ-SESSION-008 | `run.log` backward-compatible alias for `evidence/debug.log` | REQ-SESSION-191 — the session log and the session directory are opened from the desktop |

REQ-SESSION-037, REQ-SESSION-039 and REQ-SESSION-179 were narrowed accordingly; forward tolerance
for *absent optional keys* in directories written by other versions of this product (REQ-SESSION-015,
REQ-SESSION-030, REQ-SESSION-038) is unaffected and remains binding.
