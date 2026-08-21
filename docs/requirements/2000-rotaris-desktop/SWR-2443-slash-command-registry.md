---
req-id: SWR-2443
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2438
title: "Framework-free slash command registry"
epic: SWR-2000
date: 2026-08-07
---

# SWR-2443 — Framework-free slash command registry

The slash command model — parsing, registration, matching, availability, and
dispatch — shall live in a Qt-free module under `apps/rotaris/src/rotaris/models/`
and shall not import from `rotaris_core.tui`.

Two reasons force this. First, `apps/rotaris/AGENTS.md` forbids Rotaris UX work
from reaching into `src/rotaris_core/tui/`, and the existing TUI registry
(`tui/widgets/slash_commands.py`) types every handler as
`Callable[[str, RotarisTuiApp], None]` — it cannot be reused without dragging the
Textual app into the desktop host. Second, keeping the model free of Qt lets the
parsing and ranking rules be tested without a `QApplication`, which is where the
behaviour that actually breaks (ranking order, escape handling) lives.

Handlers are plain `Callable[[str], None]` taking only the argument string. View
and window code supplies closures over its own state.

## Test coverage

Unit tests exercise the registry directly with plain callables and no Qt import:
registration and case-insensitive lookup, `parse_slash_input` accepting `/name`
and `/name args` while rejecting `/ escaped` and multi-line text, prefix-first
`match` ordering, `classify_slash_token` state transitions, availability
predicates, and `execute` reporting whether a command was found. An import-level
test asserts the module pulls in neither `PySide6` nor `rotaris_core.tui`.

Integration coverage arrives through the product flow this seam enables:
[SWR-2438](SWR-2438-composer-slash-command-execution.md) drives the same registry
from the real composer, so no separate user-flow E2E test is required here.

Derived from: [SWR-2438 — Composer slash commands execute instead of starting a run](SWR-2438-composer-slash-command-execution.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
