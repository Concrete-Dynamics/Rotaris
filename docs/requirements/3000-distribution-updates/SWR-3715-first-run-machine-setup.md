---
req-id: SWR-3715
status: approved
trace: required
test: required
title: "A bundled install provisions the machine once during first launch"
epic: SWR-3000
date: 2026-08-22
---

# SWR-3715 — A bundled install provisions the machine once during first launch

SWR-3001 freezes Python and the application dependency graph into the shipped
bundle. SWR-3724 adds the pinned Serena runtime to that graph. The remaining
managed external programs are `git` for worktrees and checkpoints and `rg` for
the search tool. `npx` supports optional JavaScript MCP servers, including the
default Playwright server, when the user has installed Node.js. A user who
installs from `Rotaris-<v>-windows-x64-setup.exe`, the DMG, or the AppImage
therefore needs one visible setup run for Git and ripgrep after the desktop first paints and before
productive use.

Rotaris shall close that gap with a **setup run**: the first launch after a bundled install paints
the desktop, provisions what is missing, tells the user what it is doing while it does it, and then
leaves the already-visible application ready for productive use.
Every later launch skips it.

## Scope

- **In scope**: Windows, macOS and Linux bundled artifacts from SWR-3001 —
  installer, portable `.exe`, `.app`/DMG, AppImage. Detection and per-user
  provisioning of `git` and `rg`; warming JavaScript MCP package caches when
  `npx` is already available; removal of the shipped Git MCP server in
  favour of terminal Git commands; the progress window; the completion record
  that makes the run once-only; a re-runnable repair; a non-interactive
  equivalent for `rotaris-cli` and `rotaris-headless`.
- **Out of scope**: provider credentials and model choice — that is the
  first-launch guide, SWR-3716, which runs after this. Workspace initialization
  (SWR-2800). In-app updates (SWR-3003). Code signing (SWR-3001). Installing
  anything through a system package manager, and any install that needs
  administrator or root rights.

## The setup run

**It only does what is missing.** Each step first asks whether the tool is
already usable — a working Git executable on `PATH`, a satisfying ripgrep
version on `PATH`, or one Rotaris provisioned earlier — and when it is, the
step reports `already installed` and costs nothing. A machine that already has
git and ripgrep sees a setup run that completes in seconds without downloading
anything.

Any installed Git whose version command starts successfully is reused. Rotaris
records and displays the detected version when Git reports one. Git discovery
has no version floor; a missing Git executable or one that cannot run triggers
the pinned managed download.

**Steps, in order.** Detect what is present; provision `git`; provision `rg`;
warm the cache for an enabled exact JavaScript MCP package when `npx` is already
on PATH, using the executable discovered during detection (including `npx.cmd`
on Windows); record what was provisioned; hand off to the application. Node is a
user-installed prerequisite and the bundled installer never downloads it. The
default Playwright MCP server is available when `npx` is present and unavailable
when it is absent. The list is derived from the external tools Rotaris actually
resolves, not hand-maintained in the window. A user-configured `uvx` entry uses
a user-supplied executable and may contribute a warm-up when that executable is
available.

Rotaris ships no Git MCP server, pin, warm-up, persona grant, or server-specific
initialization. Agents that need Git invoke the installed `git` command through
their terminal tool.

**Nothing outside the user's own directories, and no elevation.** Provisioned
tools live under the per-user data directory (`GLOBAL_DATA_DIR`/`tools`).
Rotaris does not modify the machine's `PATH`, does not write to a system
location, does not register anything with the OS package database, and never
asks for administrator or `sudo` rights.

**Downloads are pinned and verified.** Every archive is fetched over HTTPS from
the tool's official release location at a version pinned in the Rotaris source,
and its checksum is verified against the pinned digest before anything is
unpacked. A mismatch fails that step with the expected and actual digest, and
nothing is unpacked or executed.

**It is resumable and cancellable.** Completed steps are recorded as they
complete, so a setup run interrupted by a crash, a closed lid or a cancel
resumes at the first step that has not completed instead of starting over.
Cancel stops after the running step, leaves no half-unpacked tool behind, and
offers to continue into the application.

**A failure is not a dead end.** A step that fails names the tool, the command,
the exit status and the reason, keeps a `Retry`, and offers `Continue without
it`. Continuing lands the user in the application with exactly the degradation
SWR-3001 already describes — the feature that needed the tool warns, the
application runs. Setup can never leave a user with an installed product they
cannot open.

**Offline is a first-class outcome.** With no network, detection still runs, the
steps that would download report that they cannot reach the network, and the run
ends by naming which features are degraded and opening the application anyway.

**The window says what the wait is for.** It states that this is a one-time
setup, shows `N of M steps complete` with a progress bar, lists every step in
order with the current one marked, gives each completed step its elapsed time
and a completion mark, and hides the command log behind a `Show details`
disclosure that streams it live and can be copied. It carries a `Cancel`.

**Once means once.** Completion is recorded in the per-user data directory with
the tool set and versions it satisfied. A later launch reads that record and
starts the application directly. When a Rotaris upgrade needs a tool the record
does not cover — a new MCP server, or a raised minimum for a tool that uses a
discovery floor — the next launch
runs a short top-up for that difference only, described as such, rather than the
full first-time run. A user can also start the run by hand from Settings to
repair a machine whose tools were removed.

**Headless machines get the same provisioning without a window.**
`rotaris-cli setup` performs the identical steps with line-per-step output and a
non-zero exit status when a step fails, so a server or CI machine can provision
before `rotaris-headless` runs. A headless launch never opens a GUI and never
blocks on one: it provisions if it can and otherwise reports the missing tool.

## Acceptance criteria

- **AC-001**: The first launch of a bundled Rotaris on a machine with no `git`, Node or `rg`
  paints the desktop, provisions Git and ripgrep, omits Node and every `npx` cache warm-up, and
  reaches a ready desktop without further user action.
- **AC-002**: The default Playwright MCP server is available when Node.js
  supplies `npx` and unavailable otherwise. Cache warming launches the
  discovered executable, including `npx.cmd` on Windows. The bundled installer
  never downloads Node.js to make Playwright available.
- **AC-003**: On a machine with any working Git executable and satisfying
  ripgrep version, the run reports each required tool as already installed,
  downloads nothing, and reaches the application. The pinned Git version
  applies only to Rotaris-managed downloads.
- **AC-004**: The second launch starts the application directly — no setup
  window, no re-detection cost the user can perceive.
- **AC-005**: The window shows the ordered step list, the completed count and
  percentage, per-step elapsed time on completion, the current step marked, and
  a details disclosure carrying the live command log as copyable text.
- **AC-006**: A failing step reports the tool, command, exit status and reason,
  offers `Retry` and `Continue without it`, and continuing opens the application
  with that feature degraded rather than the application refusing to start.
- **AC-007**: Cancelling stops after the running step, leaves no partially
  unpacked tool, records the steps that did complete, and the next launch
  resumes at the first incomplete step.
- **AC-008**: No step requires administrator or root rights, writes outside the
  per-user data and config directories, or alters the machine's `PATH`.
- **AC-009**: Every downloaded archive is verified against a pinned checksum
  before use; a mismatch fails the step, reports both digests, and unpacks
  nothing.
- **AC-010**: With no network reachable, the run completes by naming the
  degraded features and opening the application.
- **AC-011**: A Rotaris version that requires a tool the completion record does
  not cover runs a top-up for that tool alone and says so, rather than repeating
  the first-time run.
- **AC-012**: `rotaris-cli setup` performs the same provisioning without a GUI,
  reporting one line per step and exiting non-zero when a step fails.
- **AC-013**: The shipped MCP server map, default persona grants, setup manifest,
  and warm-up plan contain no Git MCP entry; Git-capable agents use their terminal.

## Test portfolio

| Level           | Productive scenario                                                                                                                             | Exercised boundary                                             | Planned/covering test                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Unit            | Detection reuses every working installed Git; the default setup plan omits Node, skips the Playwright warm-up when `npx` is absent, and launches the discovered `npx.cmd` on Windows | Tool probe and step planner over a faked `PATH` and MCP config  | `tests/unit/setup/test_setup_plan.py`                        |
| Unit            | Default agents start without a Git MCP server or persona grant                                                                                 | Shipped persona and MCP configuration                            | `tests/unit/test_config_defaults.py::test_git_mcp_is_absent_from_the_shipped_configuration` |
| Unit            | A pinned archive with a wrong digest is refused and nothing is unpacked; a matching one is unpacked into the per-user tool directory             | Download-and-verify step over a local HTTPS fixture             | `tests/unit/setup/test_tool_download.py`                     |
| Integration     | A cancelled, then resumed, run completes the remaining steps only; a completion record makes a later run a no-op; a raised discovery floor triggers a top-up for tools that use one | Setup runner → completion record in the data dir                | `tests/integration/test_setup_resume_and_record.py`          |
| Integration     | `rotaris-cli setup` provisions without a GUI, prints one line per step, and exits non-zero on a failing step                                     | CLI entry point → setup runner with the network faked           | `tests/integration/test_setup_cli.py`                        |
| User-flow E2E   | A first-time user with an installed Git watches the run progress, opens the details log, hits a failing step, chooses `Continue without it`, and reaches a usable app | Real setup window driven by accessible name, network faked      | `apps/rotaris/tests/test_first_run_setup_flow.py`            |

Depends on: [SWR-3001 — Cross-Platform Standalone Binaries](SWR-3001-cross-platform-standalone-binaries.md)

Related: [SWR-3724 — Standalone distributions carry the pinned Serena runtime](SWR-3724-bundled-serena-runtime.md)

Related: [SWR-3727 — Desktop startup stays visible, responsive, and console-free](../2000-rotaris-desktop/SWR-3727-quiet-responsive-desktop-startup.md)

Serves: [SWR-3716 — The first launch offers Rotaris Cloud and lets the user in without it](../2000-rotaris-desktop/SWR-3716-first-launch-provider-guide.md)

Epic: [Distribution & Updates](../3000-distribution-updates.md)
