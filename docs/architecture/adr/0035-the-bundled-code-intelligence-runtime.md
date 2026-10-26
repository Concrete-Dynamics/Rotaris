# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-10)
- **Depends on:** ADR-0002, ADR-0033, ADR-0054
- ~~**Blocked by an open question (OQ-23) about what the sentinel branch must do.**~~ *OQ-23 resolved 2026-09-06 with
  the recommended reading; built and first executed the same day (Part T), see "First execution" below (corrected
  2026-10-13, fin41).*

## Parts

Since 2026-10-26 the rest of this document is in [`0035-the-bundled-code-intelligence-runtime/`](0035-the-bundled-code-intelligence-runtime/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0035-the-bundled-code-intelligence-runtime/01-context.md) | Context |
| [02](0035-the-bundled-code-intelligence-runtime/02-alternatives-considered.md) | Alternatives considered |
| [03](0035-the-bundled-code-intelligence-runtime/03-decision.md) | Decision |
| [04](0035-the-bundled-code-intelligence-runtime/04-open-question-carried.md) | Open question carried |
| [05](0035-the-bundled-code-intelligence-runtime/05-consequences-accepted.md) | Consequences accepted |
| [06](0035-the-bundled-code-intelligence-runtime/06-revisit-if.md) | Revisit if |
| [07](0035-the-bundled-code-intelligence-runtime/07-first-execution-2026-09-06-part-t-the-two.md) | First execution — 2026-09-06, Part T (the two spikes, the bundle, the branch, the manifest, the client's owed halves, the setup) |
| [08](0035-the-bundled-code-intelligence-runtime/08-first-execution-2026-09-06-part-t-the-two-2.md) | First execution — 2026-09-06, Part T (the two spikes, the bundle, the branch, the manifest, the client's owed halves, the setup) *(continued, from "The fix round, 2026-09-29.")* |
| [09](0035-the-bundled-code-intelligence-runtime/09-the-bundle-is-built-for-the-artifacts.md) | The bundle is built for the artifact's architecture — 2026-10-15 (OQ-400, ruled under R-072) |
| [10](0035-the-bundled-code-intelligence-runtime/10-the-proof-on-windows-11-arm64-2026-10-21-the.md) | The proof on Windows 11 ARM64 — 2026-10-21 (the Windows ARM64 session's F2) |
