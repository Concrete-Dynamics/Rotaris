---
req-id: SWR-3007
status: draft
trace: required
test: required
type: product
title: "Instruction file toggles in Settings"
epic: SWR-2000
date: 2026-08-13
---

# SWR-3007 — Instruction file toggles in Settings

The Rotaris Settings → Instructions view MUST replace its read-only table with
an interactive list of the agent instruction files present in the active
workspace — `ROTARIS.md`, `AGENTS.md`, and `AGENTS.override.md`. Each row MUST
show the file name, source, and absolute path, plus an on/off toggle reflecting
whether that file's content is currently injected into newly constructed agents.

Toggling a file off MUST exclude that file's content from the instruction block
of subsequently constructed agents; toggling it on re-includes it. The state
MUST persist to the workspace configuration and survive restart. The existing
workspace-wide instruction-injection switch (SWR-455) MUST remain
authoritative: when off, no instruction file is injected regardless of
per-file toggles.

Toggles MUST participate in the save/discard lifecycle (SWR-2094). With no
workspace configured, the view MUST construct without error and show its
empty state.

## Acceptance criteria

- Instructions shows `ROTARIS.md`, `AGENTS.md`, and `AGENTS.override.md` with a
  per-file toggle.
- Disabling one file excludes only that file from the next agent's injected
  instruction block; the others remain injected.
- The toggle state is restored after restart and after re-opening Settings.
- With the workspace-wide switch off, every per-file toggle is shown disabled
  and no instruction file is injected.

## Test portfolio

| Level         | Productive scenario                                                                                                       | Exercised boundary                                 | Planned/covering test |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| Unit          | Toggle state reads/writes the workspace configuration; disabled file is excluded from the merged instruction block        | Config persistence, per-file exclusion             | planned               |
| Integration   | Turning a toggle off in Settings saves the config and the next agent construction omits that file                         | UI → config → agent construction                   | planned               |
| User-flow E2E | User opens Settings → Instructions, disables `AGENTS.md`, saves, starts a run → the run's agents lack `AGENTS.md` content | Public boundary: Settings → run → injected context | planned               |

Derived from: [SWR-2424 — Settings inventory tabs](SWR-2424-settings-inventory-tabs.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
