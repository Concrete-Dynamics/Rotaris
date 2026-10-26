# Resolution Record — Domain 21, UI Performance Benchmark — Graphical-only sweep

Part 1 of 3 of [domain 21's resolutions](../21-ui-performance-benchmark.md), which indexes every part.

## Graphical-only sweep

Fourteen requirements had no surface other than a command-line invocation, its argument grammar, its
standard streams, or its exit codes. Each is withdrawn in place, and every capability any of them
carried is now reachable from the desktop interface.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-UIBENCH-001 | A standalone console program installed alongside the desktop package by a package manager, absent from bundled installers. | **REQ-UIBENCH-110** (new) — the benchmark is a built-in capability of the desktop application, present in every installation without exception, started from a performance-benchmark card in the Settings view's About tab (REQ-SHELL-138) beside the diagnostics card of REQ-SHELL-163, every control keyboard-reachable, named, and usable at the minimum window size (REQ-SHELL-022). |
| REQ-UIBENCH-002 | The program-name token prefixing every usage, help, and argument-error message. | No capability: there is no usage or help text to identify. Failure identification is carried by **REQ-UIBENCH-114** (new), which names the operation, the cause, and the offending path or value. |
| REQ-UIBENCH-003 | "Purely non-interactive": no prompts, no progress output, no colour, no terminal detection, no window of its own. | **REQ-UIBENCH-112** (new) — iterations render offscreen; no benchmark window ever appears, takes focus, or disturbs the user's windows, and no iteration prompts. The suppression of progress output is deliberately *inverted*: **REQ-UIBENCH-116** (new) requires the interface to show progress and offer cancellation, which is right for a desktop surface and was only ever wrong for a pipe. |
| REQ-UIBENCH-004 | The published four-subcommand surface, the "no alias, no abbreviation" rule, and the exit-2 argument-error class. | **REQ-UIBENCH-111** (new) — exactly four operations (capture, replay, inspect, compare) are the whole benchmark surface; an operation with an unchosen input is a disabled control naming what is missing, so no argument error is reachable. |
| REQ-UIBENCH-005 | The subcommand grammar: `capture SESSION_DIR --output PATH`, `replay FIXTURE --output PATH [--iterations N]`, `inspect RUN_DIR`, `compare BASE_RUN CANDIDATE_RUN`. | **REQ-UIBENCH-111** (new) — the same four operations with their inputs chosen through the product's own session list and the platform file choosers. |
| REQ-UIBENCH-006 | `--output` mandatory for capture and replay. | **REQ-UIBENCH-111** (new) — capture and replay cannot start until a destination has been chosen. |
| REQ-UIBENCH-007 | `--iterations` parsing and its default of 3. | **REQ-UIBENCH-113** (new) — an integer control defaulting to 3; a non-integer value is unreachable. |
| REQ-UIBENCH-008 | The `--iterations must be at least 1` line, exit 1, and the no-filesystem-effect guarantee. | **REQ-UIBENCH-113** (new) — the control's smallest offerable value is 1, so a value below 1 is unreachable and the product defines no message for it. |
| REQ-UIBENCH-009 | Exit code 0 for every successful subcommand and healthy child. | **REQ-UIBENCH-114** (new) for the user-visible outcome; the child's zero termination status survives as an internal signal in REQ-UIBENCH-052 and REQ-UIBENCH-041. |
| REQ-UIBENCH-010 | Reports printed to stdout as 2-space-indented, sorted-key JSON and nothing else. | **REQ-UIBENCH-115** (new) — reports are presented in the interface showing every value, and exportable by clipboard copy or file save as exactly that JSON, byte-identical between the two routes and locale-independent. |
| REQ-UIBENCH-011 | Which subcommand may write what to stdout, and uncaptured child stream inheritance. | The capture privacy notice moves to the interface in the amended **REQ-UIBENCH-022**; child output handling becomes **REQ-UIBENCH-117** (new), which captures it, retains it as `iteration-NNN.log` for crashed iterations, and forbids it reaching the user unasked. Resolves OQ 3. |
| REQ-UIBENCH-094 | The exit-0 inventory. | **REQ-UIBENCH-114** (new) — the success outcome of each operation is reported in the interface. |
| REQ-UIBENCH-095 | The exit-2 argument-error class with usage text on stderr. | **REQ-UIBENCH-111** and **REQ-UIBENCH-113** (new) — no argument list exists to be wrong. |
| REQ-UIBENCH-096 | Exit 1 with one clean stderr line for an iteration count below 1. | **REQ-UIBENCH-113** (new) — unreachable through the control. |

Further requirements kept their capability but had shell-shaped text removed and are amended in
place: REQ-UIBENCH-012 to REQ-UIBENCH-017, REQ-UIBENCH-022 to REQ-UIBENCH-024 and REQ-UIBENCH-033
(exit codes and fixed diagnostic strings replaced by the failure reporting of REQ-UIBENCH-114 and by
stated information content); REQ-UIBENCH-035, REQ-UIBENCH-041, REQ-UIBENCH-043, REQ-UIBENCH-044,
REQ-UIBENCH-052, REQ-UIBENCH-092, REQ-UIBENCH-093, REQ-UIBENCH-097, REQ-UIBENCH-101,
REQ-UIBENCH-104, REQ-UIBENCH-105 and REQ-UIBENCH-109 (same). REQ-UIBENCH-037 now states that the
mechanism starting an iteration process is internal and not user-invocable. The document title, the
Overview, seven section headings (`Identity and desktop surface`, `Benchmark operations`,
`The capture operation`, `The replay operation — orchestration`, `The inspect operation`,
`The compare operation`, `Failure reporting and error inventory`) and the Data & Formats section were amended accordingly; Data & Formats gains a *Benchmark surface*
block stating that no command-line surface exists and where each capability lives, and its
*Environment contract* block no longer promises externally observable variable names.

Nothing in this domain touched the retired `REQ-TUI` or `REQ-CLI` series, and no requirement here
cites them.
