# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported

- **Status:** proposed
- **Date:** 2026-09-02
- **Origin:** EXEC (ADR-EXEC-11), UI (ADR-UI-10, on terminal input)
- **Authority:** `owner-decisions.md` **SR-4**, **SR-6**, **SR-9(a)** and **ESC-20**; and the
  specification as amended on 2026-09-01, which minted `REQ-SESSION-199`, put the audit's integrity
  properties inside `REQ-SESSION-137`, and made the ring trim part of the operation that records the entry
- **Revised 2026-09-02** against ESC-20 as the specification now carries it. **The export boundary is a
  security property of this record and it now carries the mechanism as well as the reason** — see *The
  export boundary, and the one line that must never move*. The gap the previous version reported is
  **closed**: `REQ-TOOLS-190` now states the redaction-safety test and grants the verification-gate record
  an export, `REQ-EVENTS-163` has been narrowed because it had accidentally granted one to a record that
  must never have it, and SR-9(a)'s two exports have landed as `REQ-LIBRARY-176` and `REQ-TRACE-514`.
  Consequence 6 was stale in three places and is rewritten.
- **Revised again 2026-09-02**, against `../spikes/commit-on-the-publish-path.md` and
  `../spikes/remote-and-synchronised-storage.md`. Three things land here. **The pairing this record makes
  between an entry and its two durable side effects is measured to be free** — a second insert inside a
  transaction that is already committing costs **−4 to +31 µs at p50**, so `REQ-EVENTS-072`'s indivisible
  step is not a cost this design absorbs. **The first of the two unmeasured export dependencies is now
  partly measured and the answer is favourable** — see *Two dependencies of this record's export design*
  at the end. And **this record must stop treating a successful store open as evidence of a working
  store**, because every write on this path is best-effort with respect to the caller and a store that
  opens and then fails is the one configuration in which a security record goes silent without anything
  refusing.
- **Depends on:** ADR-0003 (the line between a file and a row), ADR-0058 (the workspace store),
  ADR-0005, ADR-0007, ADR-0008
- **Supersedes** the line-delimited-file form of this record dated 2026-08-31, preserved below as
  alternative A
- **Contains an unresolved conflict between slices** over which process holds the pen for terminal input

## Parts

Since 2026-10-26 the rest of this document is in [`0024-evidence-and-audit-files/`](0024-evidence-and-audit-files/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0024-evidence-and-audit-files/01-context.md) | Context; What the audit now has to prove, and to whom; Which records export, and why that is not a list |
| [02](0024-evidence-and-audit-files/02-alternatives-considered.md) | Alternatives considered |
| [03](0024-evidence-and-audit-files/03-decision.md) | Decision; What an entry is; How append-only is enforced, and why it is stronger than the file gave; Retention: the ring for a table; The export boundary, and the one line that must never move; How the export carries the record's integrity properties; The side effects, and `REQ-EVENTS-072`; Failure |
| [04](0024-evidence-and-audit-files/04-consequences-accepted.md) | Consequences accepted |
| [05](0024-evidence-and-audit-files/05-unresolved-conflict-between-slices.md) | Unresolved conflict between slices |
| [06](0024-evidence-and-audit-files/06-revisit-if.md) | Revisit if |
| [07](0024-evidence-and-audit-files/07-first-execution-2026-09-03-the-rings-under-the.md) | First execution — 2026-09-03, the rings under the first gate |
| [08](0024-evidence-and-audit-files/08-third-execution-2026-09-06-the-audits-export.md) | Third execution — 2026-09-06, the audit's export (Part U) |
| [09](0024-evidence-and-audit-files/09-the-crash-record-settles-the-ring-2026-09-30-r.md) | The crash record settles the ring — 2026-09-30 (R-067) |
