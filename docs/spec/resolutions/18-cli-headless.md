---
reference: ROTARIS-CRW-001
domain: cli-headless
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 18, Command-Line and Headless Entry Points

> ## Amendment, 2026-09-02 — the export document shapes in row 36 are superseded
>
> **Row 36 fixed two document shapes that no longer exist and that disagreed with their live owners on
> every key name that differs.** They were REQ-CLI-237's, and that identifier was withdrawn when the
> `REQ-CLI` series was closed; the trajectory document and the batch wrapper are now fixed in domains 07
> and 20. The row is marked in place, the domain document's Data & Formats section records the
> withdrawal in place, and the half of the row that survives — the content of the two export warnings —
> is called out there so it is not lost with the shapes.
>
> This matters even though the document is retired and nothing in it is implemented. A retired document
> that *fixes* a rival key inventory is a rival key inventory: a machine-readable contract stated in two
> places is exactly the defect the 2026-09-02 round existed to close, and leaving the stale table would
> have left the corpus contradicting itself on `sessions` against `trajectories` and on
> `schema_version` against `trajectory_version`.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - This record belongs to a **retired** domain and nothing in it is normative. Its dispositions that assert
>   `evidence/debug.log`, `evidence/tool-calls.jsonl`, `<workspace>/.rotaris/sessions/` directory listing or
>   the presence of `<session_dir>/.message_limit_paused` describe a layout the corpus has withdrawn
>   (REQ-SESSION-002 to REQ-SESSION-004, REQ-EVENTS-079). None of them is a surviving contract.


This record disposes of every open question raised in the draft of
[`18-cli-headless.md`](../18-cli-headless.md) (requirement prefix `REQ-CLI`).

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, command surface, exit codes, or event vocabulary. Where a
   case was under-determined, this record chooses.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved to the reading that
   is more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **Scope: the product is one Electron desktop application.** It has no command-line interface and
   no terminal user interface — removed, not deferred. This domain is retired and every `REQ-CLI`
   identifier is withdrawn in place, never renumbered or reused. The dispositions below are kept as
   the historical record of how the domain stood when they were taken; each capability a user
   reached through a command-line or headless entry point is carried by a desktop requirement in the
   domain that owns it.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking for exact phrasing of a human-readable message are resolved by stating the
   required information content and leaving the wording to the implementation.

Cross-domain coherence was checked against `01-run-orchestration.md` (intent taxonomy and delegation
budget clamps) and `09-lifecycle-hooks.md` (the workspace hook trust gate). No other specification
document was consulted.

## Parts

Since 2026-10-26 the rest of this document is in [`18-cli-headless/`](18-cli-headless/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](18-cli-headless/01-dispositions.md) | Dispositions |
| [02](18-cli-headless/02-summary.md) | Summary |
| [03](18-cli-headless/03-the-nine-added-identifiers-are-withdrawn.md) | The nine added identifiers are withdrawn |
| [04](18-cli-headless/04-configuration-keys.md) | Configuration keys |
