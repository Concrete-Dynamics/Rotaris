# Resolution Record — Domain 12, Desktop Shell, Navigation, and Window Management — Graphical-only sweep

Part 1 of 3 of [domain 12's resolutions](../12-desktop-shell-windows.md), which indexes every part.

## Graphical-only sweep

Five requirements in the draft had a command line as their only observable surface. Each is
withdrawn in place; every capability that reached the user through it is carried by a
desktop-reachable requirement, two of which are new.

*Count corrected on re-verification: four **requirement identifiers** are withdrawn here —
REQ-SHELL-001 through REQ-SHELL-004 — and the table's fifth row is a Data & Formats block, not a
requirement. The domain's withdrawn count is four throughout, and that is the figure the index and
the gate document carry.*

| Withdrawn | What it specified | Capability now carried by |
| --- | --- | --- |
| REQ-SHELL-001 | The whole argument vocabulary: positional workspace, `--demo`, `--version`, `--diagnostics [light\|deep]`, `--diagnostics-output DIR` | Workspace selection: REQ-SHELL-010, REQ-SHELL-021. Demo mode: **REQ-SHELL-162** (new). Diagnostics capture: **REQ-SHELL-163** (new). Running version: REQ-SHELL-033, REQ-SHELL-140. |
| REQ-SHELL-002 | `--version` prints `Rotaris {version}` on stdout and exits 0 without a window | REQ-SHELL-033 (title-bar `v{version}` label) and REQ-SHELL-140 (About page Version row, selectable text, announced as "{name}: {value}") |
| REQ-SHELL-003 | Rejected diagnostics invocation: usage message naming the rejected option, exit code 2, nothing written | **REQ-SHELL-163** (new) — the level control offers only `off`/`light`/`deep` and the folder comes from the platform chooser, so an invalid selection is unreachable and no error for one is defined |
| REQ-SHELL-004 | The process exit code of a normal interactive run | No capability to rescue — a process exit code is only observable to a script. The shutdown obligations that were observable to a user stay in REQ-SHELL-121, which was amended to drop its reference to the exit code. |
| Data & Formats, "Command-line grammar" | The argv grammar block and `--version` output format | Replaced by "Application entry" (a statement that no such surface exists and where each capability lives) and "Diagnostics capture vocabulary" (the `off`/`light`/`deep` enum and the output-folder value) |

Two further amendments follow from the sweep rather than from an open question:
REQ-SHELL-005 now reads "In demo mode (REQ-SHELL-162)" instead of "Under `--demo`", keeping the whole
of the demo-mode behavior it specified; and REQ-SHELL-010 branch (a) now names the folder a window
was explicitly built for through REQ-SHELL-017 instead of a command-line argument, keeping the
precedence ladder intact. The section heading "Command line and process lifecycle" became
"Application entry, demo mode, and preference store".
