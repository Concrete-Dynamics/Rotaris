# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier decision that **both** locks live in one table keyed by `(kind, key)`,
  recorded under this number on 2026-08-31. `REQ-GIT-128` as amended keeps the workspace integration lock a
  **file**, deliberately. The earlier argument is preserved below as alternative **G**.
- **Revised:** 2026-09-02, to carry **ESC-21**. `REQ-GIT-128` and `REQ-GIT-124` have since been amended and
  they now decide what this record previously described as an unconnected hazard; the paragraph that said
  "no requirement currently connects the two" is **withdrawn and must not be cited**.
- **Revised again:** 2026-09-02. **Consequence 11's lock-row correction has been run, with its
  counterfactual, and is confirmed.** The consequence now states what was measured instead of predicting
  what would happen, and its subjunctive is retired. Nothing else in this record changes and no decision in
  it moves.
- **Evidence:** `../spikes/backup-restore-mechanism.md` (2026-09-02), for consequence 11. Every figure it
  contributes below is a measurement; none is estimated.
- **Authority:** `owner-decisions.md` SR-1, SR-4, **ESC-15**, **ESC-21**; the amended `REQ-SESSION-046`,
  `REQ-GIT-020`, `REQ-GIT-124` and `REQ-GIT-128`, which have settled what this ADR previously had to decide
- **Origin:** RUNTIME (ADR-RUNTIME-07, including a Windows spike), DATA (constraints C2, C3)
- **Depends on:** ADR-0002, ADR-0003, ADR-0058

## Parts

Since 2026-10-26 the rest of this document is in [`0005-the-session-lock-as-capability-token/`](0005-the-session-lock-as-capability-token/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0005-the-session-lock-as-capability-token/01-context.md) | Context |
| [02](0005-the-session-lock-as-capability-token/02-alternatives-considered-the-liveness-probe.md) | Alternatives considered — the liveness probe |
| [03](0005-the-session-lock-as-capability-token/03-alternatives-considered-where-the-session-lock.md) | Alternatives considered — where the session lock lives |
| [04](0005-the-session-lock-as-capability-token/04-alternatives-considered-the-workspace.md) | Alternatives considered — the workspace integration lock |
| [05](0005-the-session-lock-as-capability-token/05-decision.md) | Decision; The session lock is a row; The integration lock is a file, and that distinction is load-bearing; Where the integration lock does not lock, and what the product does about it (ESC-21); Why the two locks are not unified |
| [06](0005-the-session-lock-as-capability-token/06-consequences-accepted.md) | Consequences accepted |
| [07](0005-the-session-lock-as-capability-token/07-revisit-if.md) | Revisit if |
| [08](0005-the-session-lock-as-capability-token/08-first-execution-2026-09-03-the-lock-released-by.md) | First execution — 2026-09-03, the lock released by a run that ends |
| [09](0005-the-session-lock-as-capability-token/09-first-execution-2026-09-03-the-foreign-lock.md) | First execution — 2026-09-03, the foreign-lock report (IC-4, half 1) |
| [10](0005-the-session-lock-as-capability-token/10-first-execution-2026-09-05-the-lock-re-claimed.md) | First execution — 2026-09-05, the lock re-claimed on resume, and the one reap |
| [11](0005-the-session-lock-as-capability-token/11-first-execution-2026-09-06-the-explicit-repair.md) | First execution — 2026-09-06, the explicit repair on demand (Part U) |
| [12](0005-the-session-lock-as-capability-token/12-the-part-u-proof-on-linux-the-machine.md) | The Part U proof on Linux: the machine identifier where the product keeps it — 2026-09-28 (R-062) |
| [13](0005-the-session-lock-as-capability-token/13-first-execution-2026-09-29-the-lock-a-continue.md) | First execution — 2026-09-29, the lock a continue takes back |
| [14](0005-the-session-lock-as-capability-token/14-first-execution-2026-09-29-a-write-through-a.md) | First execution — 2026-09-29, a write through a loaded session outside a run |
| [15](0005-the-session-lock-as-capability-token/15-first-execution-2026-10-01-a-todo-edit-at-rest.md) | First execution — 2026-10-01, a todo edit at rest and the quit's terminal record |
