# ADR-0008 — One ordered session writer per session, owning the session's transactions

- **Status:** proposed
- **Date:** 2026-09-01
- **Origin:** RUNTIME (ADR-RUNTIME-04)
- **Authority:** `owner-decisions.md` **SR-4**, read with **SR-1**, **SR-3** and **SR-9**; and the
  specification as amended on 2026-09-01, which withdrew the persistence debounce outright
- **Depends on:** ADR-0002, ADR-0003 (the line between a file and a row), ADR-0058 (the workspace store), ADR-0004 (for the one file this writer still causes to be written), ADR-0005, ADR-0006
- **Supersedes** two earlier forms of this record dated 2026-08-31: the file-owning form, and the form
  that kept a ten-second window narrowed to the session record. Both are preserved below as the
  alternatives they now are.

## Parts

Since 2026-10-26 the rest of this document is in [`0008-one-ordered-session-writer/`](0008-one-ordered-session-writer/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0008-one-ordered-session-writer/01-context.md) | Context; The debounce is withdrawn, and that is the reason this record is being rewritten again; Transcript residency survived the move; only its stated reason changed; The rest of the surrounding contract |
| [02](0008-one-ordered-session-writer/02-alternatives-considered.md) | Alternatives considered |
| [03](0008-one-ordered-session-writer/03-decision.md) | Decision; One transaction is the unit of work; Every requested save is applied, and nothing waits; The metric aggregates are maintained, not recomputed; What the writer still owns, because a transaction does not supply it; Transcript residency, implemented rather than dissolved; The one file this writer still causes to be written; What stays a file, and what is not this writer's |
| [04](0008-one-ordered-session-writer/04-consequences-accepted.md) | Consequences accepted |
| [05](0008-one-ordered-session-writer/05-revisit-if.md) | Revisit if |
| [06](0008-one-ordered-session-writer/06-first-execution-2026-09-03-the-session-writer.md) | First execution — 2026-09-03, the session writer |
| [07](0008-one-ordered-session-writer/07-first-execution-2026-09-03-the-run-loop.md) | First execution — 2026-09-03, the run loop: aggregates, the launch audit, summary.md, the terminal transaction |
| [08](0008-one-ordered-session-writer/08-read-back-from-a-live-run-2026-09-12-the.md) | Read back from a live run — 2026-09-12: the compression aggregate was declared and never raised |
