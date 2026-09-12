# Request log

Every request the owner makes that could change what the product does, logged **when it is made** —
before it is classified, and before any code is written.

The log exists because the failure it prevents is silent: a request arrives in conversation, an agent
builds it, and the behaviour lands in the product with no identifier against it, invisible to
traceability and to the clean-room argument. A row here is cheap. Reconstructing one afterwards is
not possible.

**Declined and deferred requests stay.** A refusal with no record can be asked again in three weeks
and answered differently, and nobody can see that it happened. The reason is part of the row.

- Identifiers: `R-NNN`, contiguous from 1, never renumbered and never reused.
- **Classification** is one of the five in [`README.md`](README.md)'s table: `covered`, `question`,
  `escalation`, `defect`, `directive`.
- **Disposition** names where it landed — a `PD`, a `REQ` it turned out to be covered by, an `OQ`, an
  `ESC`, or `declined` / `deferred` with the reason.
- A row is **appended and never rewritten**. A request that changes gets a new row citing the old one.

## Count

**None yet.** This log was created 2026-09-12 and holds no request. The count is the number of rows
below.

---

| # | Date | The request, in the owner's terms | Classification | Disposition |
|---|---|---|---|---|
| | | | | |

<!--
Row shape:

| <a id="r-001"></a>R-001 | 2026-09-12 | "the composer should show which model the next run uses" | directive | [`PD-CHAT-001`](directives.md#pd-chat-001) |
| <a id="r-002"></a>R-002 | 2026-09-12 | "add a dark-mode toggle to the title bar" | covered | REQ-SHELL-128 already states it; nothing minted |
| <a id="r-003"></a>R-003 | 2026-09-12 | "let a run write outside the workspace" | declined | crosses REQ-SANDBOX-001's confinement; the owner withdrew it the same day |
-->
