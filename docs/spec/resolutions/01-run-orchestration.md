---
reference: ROTARIS-CRW-001
domain: run-orchestration
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 01, Multi-Agent Run Orchestration

> ## Amendment, 2026-10-20 — the same action compares the arguments as one JSON value (OQ-364)
>
> `REQ-ORCH-101` gains a dated note beneath its text, which is kept unchanged. "The whole of their arguments" is their
> value read as JSON: every member of every object at every depth, arrays in order, nothing trimmed, cased, cut or
> disregarded. The order in which an object's members were written is no part of that value, so one argument object sent
> with its keys in another order is the same action, and two calls whose values differ anywhere stay two actions, the two
> long edits differing near their end among them. Arguments that do not parse as JSON are compared whole as text and never
> equal a parsed value. The repetition trigger, the cycle trigger and `PD-ORCH-016`'s raw-count evidence take the one
> comparison together; the thresholds of `REQ-ORCH-100`, the fallbacks of `REQ-ORCH-104`, the comparison of assistant
> messages and the text forwarded to a tool are unchanged.
>
> **Why this is a note and not a directive.** The requirement's ban on "a normalized rendering" states its own reason:
> each such rendering "makes the two long edits above compare equal". An encoding that keeps every member whole cannot
> make two different values equal, so the reading builds `REQ-ORCH-101` as written and departs from nothing; the build's
> comparison of the text in its emitted key order was the defect
> [`the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies`](../../defects/fixed/the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md)
> records. Ruled under the owner's delegation ([R-072](../../product/requests.md#r-072)) with no directive; the ruling, its
> evidence and its reopening condition are in [`open-questions.md`](../../architecture/open-questions/66-spikes-and-later-questions-33.md#oq-364).

> ## Amendment, 2026-09-14 — one persisted run vocabulary
>
> The two-value `task` / `maintenance` clause in disposition 31 and REQ-ORCH-137 is superseded by
> the persisted marker owned by REQ-SESSION-021 and made exact by REQ-LIBRARY-002:
> `task_run`, `improvement_run`, and `integration_run`. Ordinary user runs carry `task_run` and are
> eligible for post-run collection. Library-launched application runs carry `improvement_run`, and
> hidden worktree-integration runs carry `integration_run`; both are analysis-ineligible. The
> gate-authoring work of REQ-ORCH-126 remains a detached internal task and creates no durable session,
> so it introduces no fourth run type. This amendment preserves disposition 31's behavioural boundary
> while removing its duplicate vocabulary.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 3** — records "the product's 100 ms budget: a state change the run has recorded appears on these
>   surfaces within 100 ms" with no percentile. Under **SR-8** that figure is a **95th percentile**
>   (REQ-ORCH-155). A single update beyond 100 ms is not by itself non-conformant. The absolute reading is
>   not merely expensive but unsatisfiable in principle, so it was never the intended one.
> - **The note on REQ-ORCH-087** records only the "in background mode" → "where no view is attached"
>   rewrite. The `.message_limit_paused` signal file that requirement also wrote is now gone under **SR-4**:
>   the durably recorded execution status `paused_message_limit` is the whole of the signal, and no marker
>   is written anywhere for another process to find (REQ-ORCH-087, REQ-SESSION-107, REQ-NOTIFY-248).
> - Any disposition below that locates a check's full output, a child transcript or an artifact body by a
>   path under a session directory describes a layout that no longer exists. The guarantees survive in
>   REQ-ORCH-123, REQ-ORCH-140 and REQ-ORCH-149; the paths do not.


This record disposes of every open question raised in the draft of
[`../01-run-orchestration.md`](../01-run-orchestration.md) (domain 01, requirement prefix
`REQ-ORCH`). The body of that specification has been amended so that each decision below is stated
normatively in place; the numbering of the original open questions is preserved here so the draft
and the resolved specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent. This is what decided open question 2: the plan gate is specified and built.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. A requirement in this
   domain whose only observable surface was a shell invocation or a text-mode screen is
   **withdrawn**, and every capability that reached a user only through such a surface is carried by
   a desktop-reachable requirement instead. Running external programs stays fully in scope: check
   suites, terminal command execution by an agent, and version-control invocations are unaffected.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract. Statuses, stop reasons, state names, event names, issue
   kinds, task-id and canonical-name grammars, and configuration keys stay exact; the sentences a
   user reads do not.

## Parts

Since 2026-10-26 the rest of this document is in [`01-run-orchestration/`](01-run-orchestration/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](01-run-orchestration/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](01-run-orchestration/02-dispositions.md) | Dispositions |
| [03](01-run-orchestration/03-cross-domain-consequences.md) | Cross-domain consequences |
| [04](01-run-orchestration/04-a4-the-root-execution-record-and-the-planning.md) | A4 — the root execution record and the planning execution path (2026-09-13) |
