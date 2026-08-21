---
req-id: SWR-1285
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1203
title: "Deterministic lorem and mock-LLM test/demo data generators"
epic: SWR-1200
date: 2026-07-20
---

# SWR-1285 — Deterministic lorem and mock-LLM test/demo data generators

The TUI testing standards (SWR-1203/SWR-1204/SWR-1205) require reproducible
full-workflow, alternative-workflow, and random-interaction tests, and demo mode
needs representative content without a live model. That requires deterministic,
seed-driven generators for markdown content and for a scriptable mock LLM. This
is test/demo substrate; it carries no product behavior of its own.

The layer comprises:

- **`LoremMarkdownGenerator`** — seed-deterministic lorem-ipsum markdown (across
  configurable `MarkdownProfile`s) for tests and demo data; the same seed always
  yields identical output.
- **`LoremLLM`** — a scriptable, deterministic mock LLM that emits scripted text,
  thinking, and tool-call parts, raising `LoremScriptExhaustedError` when a
  script is over-consumed.

## Acceptance criteria

- `LoremMarkdownGenerator` produces identical output for a given seed and
  differing output across seeds.
- `LoremLLM` replays a script's text/thinking/tool-call parts in order and
  signals script exhaustion explicitly.

Derived from: [SWR-1203 — Test Category: Full User Workflow Paths](../1200-tui-transcript.md)

Epic: [TUI Transcript & Rendering Performance](../1200-tui-transcript.md)
