# Architecture proposals — UI slice

**Status:** proposal, for the Architecture Gate. Nothing here is decided.
**Slice:** the desktop application shell and its rendering, state, and IPC.
**Domains owned:** 03 (`REQ-CHAT`), 11 (`REQ-STARTUP`), 12 (`REQ-SHELL`), 13 (`REQ-WORKSPACE`),
19 (`REQ-NOTIFY`), 21 (`REQ-UIBENCH`).

## Parts

Since 2026-10-26 the rest of this document is in [`ui/`](ui/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](ui/01-1-scope-of-this-slice.md) | 1. Scope of this slice |
| [02](ui/02-2-extracted-constraints.md) | 2. Extracted constraints; 2.1 Process topology, windows, and modality; 2.2 State synchronisation: the renderer ↔ runtime contract; 2.3 Transcript: rendering, residency, and identity; 2.4 Structural determinism — the benchmark's grip on the UI architecture; 2.5 Preferences, drafts, and per-workspace files; 2.6 Theming, accessibility, and motion |
| [03](ui/03-27-notices-acknowledgements-and-dialogs.md) | 2.7 Notices, acknowledgements, and dialogs; 2.8 The terminal panel and grid; 2.9 Startup, distribution, and updates; 2.10 Diagnostics |
| [04](ui/04-3-adr-proposals.md) | 3. ADR proposals; ADR-UI-01 — Where authoritative UI state lives, and how the renderer stays in step; ADR-UI-02 — The IPC contract between the renderer and the rest of the system; ADR-UI-03 — What paints the transcript; ADR-UI-04 — The transcript apply pipeline, and where determinism is enforced |
| [05](ui/05-adr-ui-05-window-and-view-management-and-the.md) | ADR-UI-05 — Window and view management, and the three modality levels; ADR-UI-06 — The desktop preference store; ADR-UI-07 — The benchmark harness: how an iteration renders offscreen; ADR-UI-08 — One instrumentation layer for the benchmark, the diagnostics recorder, and the budgets |
| [06](ui/06-adr-ui-09-notices-acknowledgements-and-the.md) | ADR-UI-09 — Notices, acknowledgements, and the recovery surfaces; ADR-UI-10 — The terminal grid and the fan-out of one stream to three views; ADR-UI-11 — Theming, design tokens, and how the accessibility floors are actually enforced; ADR-UI-12 — Packaging, and how the application updates itself |
| [07](ui/07-adr-ui-13-startup-sequencing-and-the-first.md) | ADR-UI-13 — Startup sequencing and the first-paint budget; ADR-UI-14 — Markdown rendering and the bounded render cache; ADR-UI-15 — The renderer build toolchain |
| [08](ui/08-4-how-the-design-meets-the-domain-21-budgets.md) | 4. How the design meets the domain 21 budgets |
| [09](ui/09-5-open-questions.md) | 5. Open questions |
| [10](ui/10-6-dependencies-on-other-slices.md) | 6. Dependencies on other slices |
