# Resolution Record — Domain 13, Workspace Handling, Context Injection, and Project Onboarding — Graphical-only sweep

Part 1 of 4 of [domain 13's resolutions](../13-workspace-context-onboarding.md), which indexes every part.

## Graphical-only sweep

Sixteen requirements in the draft had a command line or a full-screen text-mode interface as their
only observable surface. Each is withdrawn in place; every capability that reached the user through
one is carried by a desktop-reachable requirement, six of which are new. A seventeenth requirement,
REQ-WORKSPACE-035, is withdrawn under the no-legacy-directory decision rather than by this sweep:
a clean-room product has no earlier directory to migrate from, and `<workspace>/.rotaris/`
(REQ-WORKSPACE-034) is the only per-workspace state directory the product ever reads or writes.

| Withdrawn | What it specified | Capability now carried by |
| --- | --- | --- |
| REQ-WORKSPACE-001 | The launcher's whole argument vocabulary: positional workspace, `--demo`, `--version`, `--diagnostics [light\|deep]`, `--diagnostics-output` | Workspace selection: REQ-WORKSPACE-009 and REQ-WORKSPACE-016 (title-bar control opening the folder chooser). Demo mode: REQ-SHELL-162. Diagnostics capture: REQ-SHELL-163. Running version: REQ-SHELL-033 and REQ-SHELL-140. |
| REQ-WORKSPACE-002 | `-w/--workspace <path>` on the run subcommand and most other subcommands | REQ-WORKSPACE-005 (amended: a window built for an explicitly selected folder), REQ-WORKSPACE-013 (workspace switch), REQ-WORKSPACE-016 |
| REQ-WORKSPACE-003 | `--config <path>` merged over the layered configuration | No capability to rescue. The configuration surface is the five layers of REQ-WORKSPACE-036, authored through the Settings view or by hand; an ad-hoc sixth overlay named per invocation is only reachable from a shell and adds nothing a scope layer does not already give. |
| REQ-WORKSPACE-004 | `--unsafe-outside-workspace` widening the file-access boundary | **REQ-WORKSPACE-148** (new) — the boundary is the configuration setting `runtime.allow_outside_workspace` (REQ-TOOLS-130), edited in the Settings Runtime category and shown by the status-bar flag of REQ-WORKSPACE-022 |
| REQ-WORKSPACE-023 | The terminal status bar's three-part layout and home-directory path collapsing | **REQ-WORKSPACE-149** (new) — home-directory collapsing and literal rendering wherever the window chrome shows a workspace path or branch name |
| REQ-WORKSPACE-024 | Middle-elision arithmetic against a character budget in a terminal bar | **REQ-WORKSPACE-149** (new) — middle elision to a single `…` against the rendered width available, with the full path in tooltip and accessible description |
| REQ-WORKSPACE-025 | Branch detection by `git rev-parse --abbrev-ref HEAD` with a 1.0 s timeout for the terminal bar | REQ-WORKSPACE-029 (the workspace git snapshot, which already carries the branch name and its degradation rules) and **REQ-WORKSPACE-150** (new, the refresh cadence) |
| REQ-WORKSPACE-026 | The terminal bar's 10 s re-probe cadence, workspace re-sync, stale-result guard and non-overlap rule | **REQ-WORKSPACE-150** (new) — the same cadence, stale-result guard and non-overlap rule for the desktop status bar's git readings |
| REQ-WORKSPACE-027 | Literal rendering of markup-like characters in a terminal bar; teardown failures swallowed | **REQ-WORKSPACE-149** (new) — paths and branch names are rendered as literal text and never interpreted as markup |
| REQ-WORKSPACE-074 | The `/skills` listing command and its per-skill output lines | REQ-WORKSPACE-067 (amended) — the Settings Skills tab table, which now also shows each skill's `SKILL.md` path and marks session-scoped `manual` rows |
| REQ-WORKSPACE-075 | The `/skill <path>` manual-load command | **REQ-WORKSPACE-151** (new) — a "Load skill file…" action in the Settings Skills tab opening the platform file chooser, applying REQ-WORKSPACE-057 |
| REQ-WORKSPACE-076 | Registration of one terminal command per cataloged skill | REQ-WORKSPACE-072 — the same registration into the desktop composer's slash catalogue |
| REQ-WORKSPACE-077 | The `[SKILL.md]` steering payload injected by a terminal skill command | REQ-WORKSPACE-073 and REQ-WORKSPACE-062 — invoking a skill's slash command force-loads its body as an always-active block for the session |
| REQ-WORKSPACE-123 | Hooks arriving through `--config <path>` resolving as built-in scope | No capability to rescue; the override it depended on was itself withdrawn. The two scopes that bypass review remain `default` and `global` (REQ-WORKSPACE-116). |
| REQ-WORKSPACE-134 | The run subcommand auto-launching login once, exit code 1, `--background` suppression | REQ-WORKSPACE-137 (the desktop refusals and their "Open Settings" action) and **REQ-WORKSPACE-152** (new, where the guided provider setup is reached from) |
| REQ-WORKSPACE-136 | The `rotaris-cli login` subcommand, its positional provider and `--reauth` flag | **REQ-WORKSPACE-152** (new) — the same two entry points (start for a named provider; start in re-authenticate mode) as desktop controls in the Settings Models category |

Three further amendments follow from the sweep rather than from an open question. REQ-WORKSPACE-005,
REQ-WORKSPACE-006 and REQ-WORKSPACE-007 no longer speak of "an explicit workspace argument on the
desktop command line" but of a window built for an explicitly selected folder, keeping the whole
resolution ladder intact. REQ-WORKSPACE-014 now names demo mode (REQ-SHELL-162) instead of the
`--demo` flag. REQ-WORKSPACE-038's third comment line, which told the reader to run a login
subcommand, now points at the Settings Models category. The section heading "Application Launch and
Command-Line Surface" became "Application Launch and File-Access Boundary"; "Terminal-UI Status Bar"
became "Workspace and Branch Label Rendering"; "Typeable Commands from Skills (Desktop Composer and
TUI)" became "Typeable Commands from Skills (Desktop Composer)"; and the Data & Formats block "TUI
skill listing and steering payload" was replaced by "Skill listing and force-loaded body".
