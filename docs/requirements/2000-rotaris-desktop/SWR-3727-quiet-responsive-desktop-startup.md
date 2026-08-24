---
req-id: SWR-3727
status: approved
trace: required
test: required
title: "Desktop startup stays visible, responsive, and console-free"
epic: SWR-2000
date: 2026-08-24
---

# SWR-3727 — Desktop startup stays visible, responsive, and console-free

When a user launches a bundled Rotaris desktop build, the complete desktop shall paint before
machine setup or workspace onboarding opens. External tool probes, MCP cache warm-ups, and Git
reads shall create no transient console windows on Windows. Git discovery shall run outside the
Qt event loop after the window is visible, update the existing workspace store when complete, and
be joined safely during shutdown.

Windows cache warming shall execute a discovered `.cmd` or `.bat` command through the system
command processor with the child window suppressed, preserving the exact pinned package arguments.
When machine setup is required, Rotaris shall open its existing setup modal after first paint,
refresh Git after setup completes, and then continue first-launch workspace onboarding. Returning
launches with a current setup record shall proceed directly to asynchronous Git discovery.

## Acceptance criteria

- **AC-001**: A bundled Windows launch creates no visible console window for Git, ripgrep, `npx`,
  or other setup subprocesses.
- **AC-002**: A discovered `npx.cmd` or `npx.bat` warms the exact configured package successfully
  through the Windows command processor.
- **AC-003**: The main desktop is visible before required machine setup or workspace-folder
  onboarding begins.
- **AC-004**: Startup Git discovery begins after the desktop is shown and does not block Qt event
  processing.
- **AC-005**: Git results reach the normal store and views, and closing the desktop safely joins
  any in-flight startup refresh.
- **AC-006**: After machine setup completes or degrades, Rotaris refreshes Git and then continues
  pending workspace onboarding.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A Windows user launches setup tools and `npx.cmd` without console flashes | Shared subprocess preparation → setup probe and warm-up invocation | `tests/unit/setup/test_setup_plan.py` |
| Integration | A visible desktop remains responsive while Git discovery is blocked, then receives the result and shuts down safely | `GitRefreshBridge` worker thread → `GitService` → `WorkspaceStore` | `apps/rotaris/tests/test_git_startup.py` |
| User-flow E2E | A first-launch user sees the desktop, then machine setup, then workspace onboarding in order | Desktop `main()` → post-show setup modal → native folder chooser | `apps/rotaris/tests/test_first_launch_workspace.py` |

Related: [SWR-3715 — A bundled install provisions the machine once during first launch](../3000-distribution-updates/SWR-3715-first-run-machine-setup.md)

Related: [SWR-2455 — First desktop launch opens a real project folder](SWR-2455-first-launch-project-folder.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
