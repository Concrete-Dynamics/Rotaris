# EXEC slice — architecture proposals

**Slice:** tool execution and its confinement.
**Domains owned:** 05 (`REQ-TOOLS`, agent tooling, terminal execution, permissions, approvals) and
10 (`REQ-SANDBOX`, command sandboxing and network egress policy).
**Status:** proposal. Nothing here is a decision; the Architecture Gate is not open.

## Parts

Since 2026-10-26 the rest of this document is in [`exec/`](exec/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](exec/01-1-scope.md) | 1. Scope |
| [02](exec/02-2-extracted-constraints.md) | 2. Extracted constraints; 2.1 Execution host and process topology; 2.2 Tool registry and capability declarations; 2.3 The permission gate; 2.4 Command-line analysis; 2.5 Presets, mode resolution and downgrade; 2.6 Approvals; 2.7 Audit and evidence persistence |
| [03](exec/03-28-terminal-execution.md) | 2.8 Terminal execution; 2.9 Terminal streaming and the terminal window; 2.10 OS-level confinement; 2.11 Network egress |
| [04](exec/04-212-secret-redaction.md) | 2.12 Secret redaction; 2.13 Extension points: plugins and MCP; 2.14 Cross-cutting isolation and lifecycle |
| [05](exec/05-3-open-questions.md) | 3. Open questions |
| [06](exec/06-4-adr-proposals.md) | 4. ADR proposals; ADR-EXEC-01 — Tool execution runs in one long-lived runtime process, not in the Electron main process; ADR-EXEC-02 — The tool registry is a declarative capability table with a direction-aware, fail-closed accessor; ADR-EXEC-03 — The policy is an immutable ordered value with matchers compiled at build time; ADR-EXEC-04 — A purpose-built shell tokenizer and segmenter, not a general shell parser and not regular expressions; ADR-EXEC-05 — The approval wait registry lives with the gate; the presenter is a revocable remote capability |
| [07](exec/07-adr-exec-06-pty-backed-persistent-foreground.md) | ADR-EXEC-06 — PTY-backed persistent foreground sessions; pipe-backed background sessions; one shipped backend; ADR-EXEC-07 — The runtime owns the authoritative emulated screen; frames carry VT bytes with an explicit final-text frame; ADR-EXEC-08 — Confinement is a two-implementation port behind a rendering-and-quoting core, with the availability verdict owned at application lifetime; ADR-EXEC-09 — `fetch` is a hand-driven redirect loop over a manual-redirect HTTP client in the runtime |
| [08](exec/08-adr-exec-10-redaction-is-one-pure-pass-behind-a.md) | ADR-EXEC-10 — Redaction is one pure pass behind a branded type, applied at construction; ADR-EXEC-11 — Evidence files are append-and-compact JSONL behind one serialized writer per session; ADR-EXEC-12 — Custom tool plugins: the specified plugin language and the chosen stack are incompatible (ESCALATE) |
| [09](exec/09-5-summary-of-items-for-the-product-owner.md) | 5. Summary of items for the product owner |
