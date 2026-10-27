---
slice: MODEL
domains: ["04-model-providers-auth", "16-mcp-integration"]
status: proposal
date: 2026-08-31
---

# Architecture proposals — MODEL slice

## Parts

Since 2026-10-26 the rest of this document is in [`model/`](model/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](model/01-scope-of-this-slice.md) | Scope of this slice |
| [02](model/02-part-1-extracted-constraints.md) | Part 1 — Extracted constraints; A. Provider catalog; B. Credential store; C. Authentication flows; D. Model discovery; E. Snapshot persistence; F. Configuration, routing and slots; G. Run-time credential lifecycle; H. Money, percentages and usage; I. Secret hygiene |
| [03](model/03-j-mcp-configuration-model.md) | J. MCP configuration model; K. MCP runtime; L. MCP secrets and environment; M. Setup and packaging |
| [04](model/04-part-2-open-questions.md) | Part 2 — Open questions |
| [05](model/05-part-3-adr-proposals.md) | Part 3 — ADR proposals; ADR-MODEL-01 — The internal model boundary is two ports, not one; ADR-MODEL-02 — The Vercel AI SDK sits behind `ModelClient` for the request/stream step only; ADR-MODEL-03 — Providers are a frozen data catalog plus per-provider capability modules, not a class hierarchy; ADR-MODEL-04 — The credential store is a plain-file store with a platform protection adapter and a cross-process advisory lock |
| [06](model/06-adr-model-05-sign-in-flows-the-loopback.md) | ADR-MODEL-05 — Sign-in flows, the loopback listener and every credential read live in the main process; the renderer never holds a credential; ADR-MODEL-06 — Money is an exact-decimal type carried end to end; `number` never touches a monetary value; ADR-MODEL-07 — Discovery → snapshot → effective configuration is a pure pipeline over provenance-carrying model entries; ADR-MODEL-08 — Use the official MCP TypeScript SDK's protocol layer, but own the stdio transport |
| [07](model/07-adr-model-09-one-session-scoped-connection.md) | ADR-MODEL-09 — One session-scoped connection registry owns supervision; discovery, probing and calls are three distinct paths through it; ADR-MODEL-10 — The bundled code-intelligence runtime is reached through a general argv pass-through in the packaged binary, driven by one generated binding manifest; ADR-MODEL-11 — MCP configuration resolution is a pure pipeline with a source-tagged diagnostics channel; ADR-MODEL-12 — The connection registry lives with the session; the settings surface probes independently; ADR-MODEL-13 — Secret hygiene is one shared module exposing predicates and transformations separately (cross-slice request) |
| [08](model/08-summary-of-proposals.md) | Summary of proposals |
