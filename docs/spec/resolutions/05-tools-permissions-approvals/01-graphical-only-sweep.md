# Resolution Record — Domain 05, Agent Tooling, Terminal Execution, Permissions, and Approvals — Graphical-only sweep

Part 1 of 3 of [domain 05's resolutions](../05-tools-permissions-approvals.md), which indexes every part.

## Graphical-only sweep

Domain 05 is almost entirely about what an *agent* may do, so the sweep touched few requirements:
no requirement in this domain existed solely to describe a shell entry point, and none was withdrawn
outright. Four requirements carried a shell-surface clause inside otherwise in-scope behavior; each
clause was struck and, where it was the only route to a capability, that capability was rescued into
a new desktop requirement. One section heading and one configuration-table note were corrected to
match.

| Shell surface struck | Where it was | Capability now carried by |
| --- | --- | --- |
| The `--unsafe-outside-workspace` launch flag "on both CLI front ends", the only non-file way to enable `runtime.allow_outside_workspace` | REQ-TOOLS-130 | **REQ-TOOLS-191** (new) — a confirmed toggle in the `runtime` settings category under the Save/Discard flow of REQ-TOOLS-186, plus the existing status-strip flag REQ-TOOLS-131 |
| "Before **a surface** starts an unattended run it computes an advisory string" — an advisory whose only reader was text a shell front end printed at launch | REQ-TOOLS-072 | **REQ-TOOLS-192** (new) — the advisory is shown in the desktop interface at run start with the effective mode and sandbox status, is dismissible, and never blocks the launch |
| "including the text-mode interface, which registers no approval capability" as the exemplar of a host with no approval UI | REQ-TOOLS-064 | Restated surface-neutrally: a session for which no approval presenter is registered, i.e. one for which the dialog of REQ-TOOLS-063 cannot be shown. No capability lost — the headless approval policy of REQ-TOOLS-065 is unchanged |
| "Runs launched in the background from the CLI, headless runs, and runs driven from the text-mode interface cannot prompt anyone" as the definition of an unattended run | REQ-TOOLS-069 | Restated: an unattended run is a desktop-started run whose session never gained, or has lost, an approval presenter. The downgrade machinery of REQ-TOOLS-067/068 and the advisory of REQ-TOOLS-072 are unchanged and now reach the user through REQ-TOOLS-192 |
| "the headless CLI is configuration-driven only (no launch flag)" | REQ-TOOLS-114 | The per-session sandbox selector in the desktop session dialog, which the same requirement already specified; the mode vocabulary now cites REQ-SANDBOX-048 |
| Section heading "28. Desktop and CLI Surfaces"; configuration-table note naming the launch flag | §28 heading, Data & Formats | Heading is now "28. Desktop Surfaces"; the table note points at REQ-TOOLS-191 |

No behavior was lost to the sweep. In particular the whole of sections 10–14 (terminal foreground
execution, background sessions, outcome classification, the OS-level sandbox, live streaming) is
untouched by it: those describe the application running programs on the user's behalf, which
decision 4 explicitly preserves.
