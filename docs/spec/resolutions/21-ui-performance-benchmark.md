---
reference: ROTARIS-CRW-001
domain: ui-performance-benchmark
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 21, UI Performance Benchmark


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 7** — "capture supports exactly the layouts the sessions domain defines". That disposition is the
>   right one and now points somewhere else: there is no layout, and capture reads the session's resumable
>   state plus three optional bulk parts on the precedence of REQ-SESSION-036 (REQ-UIBENCH-015). The
>   principle — capture follows the sessions domain and never defines a second route — is preserved
>   verbatim.
> - **OQ 16** — "a symbolic link beneath `SESSION_DIR` contributes nothing to `source_checksum`, whatever
>   it points at, and is never traversed". There is no directory to walk and no link to follow.
>   `source_checksum` is now taken over the canonical serialization of the session's own recorded state
>   (REQ-UIBENCH-019). Both properties the link rule bought are kept by construction: nothing outside the
>   session can enter the digest, and no cycle can be entered.
> - **ESC-13 is ruled and its amendment is not yet applied.** If OQ-28 resolves to the framework-neutral
>   reading, REQ-UIBENCH-054 is relaxed; the canvas is refused outright either way. The amendment is
>   drafted and deliberately withheld until OQ-28 is resolved.
>   >
>   > **Closed 2026-09-01. OQ-28 is resolved to the framework-neutral reading, and the withheld
>   > amendment is applied.** The resolution is recorded in REQ-UIBENCH-050 itself rather than left to be
>   > inferred from this record: the counting rule is operative and framework-neutral, `widgets` counts
>   > every element that occupies layout space and can be painted whatever produced it — including a
>   > rendered paragraph, code block or list item inside a transcript row — and the interface-framework
>   > clause explains only why absolute numbers do not travel between revisions. Rows 13 and 29 of the
>   > table below are the evidence that pointed one way, and they are now load-bearing rather than
>   > incidental.
>   >
>   > REQ-UIBENCH-054's element-count invariant is therefore relaxed, as option 2 of the ruling
>   > required. The withdrawn rule is quoted in place inside the requirement and marked **unsatisfiable
>   > by any admissible implementation** rather than merely unmet, because the only structure that
>   > satisfies it is the canvas the ruling refuses (REQ-CHAT-075, REQ-CHAT-077, REQ-CHAT-065,
>   > REQ-SHELL-144). What replaces it is a bound on the count's variation across two comparisons in
>   > which the displayed state is known not to change, plus one retained absolute — a later record
>   > below the `construct_window` figure means structure was destroyed rather than content drawn. Row
>   > 14's principle survives the relaxation: REQ-UIBENCH-054 stays canonical and REQ-UIBENCH-085
>   > reports it.
>   >
>   > **This record never carried draft text for the withheld amendment**, only the fact that one
>   > existed. A reader looking here for the wording the amendment was going to take will not find it,
>   > and should not conclude it was lost: the applied relaxation was written from the ruling, from rows
>   > 13, 14 and 29 below, from REQ-UIBENCH-050, and from spike 1's measurements.
>   >
>   > Three further defects in this domain were corrected in the same pass and are not consequences of
>   > ESC-13: `settle_timed_out` is now read by the invariants that depend on a settled interface
>   > (REQ-UIBENCH-087, REQ-UIBENCH-085, REQ-UIBENCH-119, REQ-UIBENCH-081); REQ-UIBENCH-118's and
>   > REQ-UIBENCH-099's claim to hold the only absolute threshold is withdrawn as untrue of the document;
>   > and REQ-UIBENCH-059's `unchanged_state` phase now applies the state actually displayed, so it
>   > measures an unchanged application as its name promises.
> - The benchmark's **own outputs** — `fixture.json`, `iteration-NNN.jsonl`, `summary.json`, `summary.md` —
>   are unaffected. They are material a developer reads with stock tools, which is exactly what SR-4 keeps
>   as files.


This record disposes of every open question raised in the draft of
[`../21-ui-performance-benchmark.md`](../21-ui-performance-benchmark.md) (requirement prefix
`REQ-UIBENCH`), and records the graphical-only sweep applied to that draft first.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite owes no format, surface,
   exit code, or field name to any other implementation. Where a case was under-determined, this
   record chooses, and awkward or arbitrary behavior is never preserved for compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved to the reading more
   coherent with the rest of the document; where no coherent reading exists the behavior is omitted.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. Every requirement
   whose only surface was a shell invocation is withdrawn, and every capability such a requirement
   carried is rescued into a desktop-reachable requirement. See the "Graphical-only sweep" below.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (a JSON field name, an enum value, a parseable file format). Open
   questions asking for the exact phrasing of a human-readable message are resolved by fixing what
   the message must convey and leaving the wording to the implementation.

**Does this domain survive?** It **survives reduced**. Its title named a command and its whole
invocation surface was a console program, but what that program did was not a terminal-interface
benchmark: it measured the *desktop* interface's own rendering path. That capability is real, is
worth keeping, and is now a built-in feature of the desktop application reachable from the Settings
view's About tab. Fourteen requirements — the entire command identity, grammar, standard-stream and
exit-code surface — are withdrawn; the measurement, fixture, replay, statistics, invariant, and
report machinery survives intact and gains one new invariant that reports the interface against the
product's own 100 ms responsiveness budget.

Cross-domain coherence was checked against `02-run-monitoring-steering.md` (presentation agent
states), `03-conversation-composer-transcript.md` (transcript row roles),
`04-model-providers-auth.md` (the money-arithmetic rule), `07-sessions-persistence.md` (session
on-disk layouts, schema-version refusal, `execution_status`), `12-desktop-shell-windows.md` (the
About tab and its diagnostics card, bundled fonts, built-in themes, the responsiveness budget,
accessibility floors), `14-library-artifacts-improvements.md` (artifact `kind` and `status`
vocabularies) and `15-settings-configuration.md` (settings categories). No other source was
consulted.

New requirements added by these resolutions: **REQ-UIBENCH-110** through **REQ-UIBENCH-119**. No
requirement identifier was renumbered, reused, or deleted.

## Parts

Since 2026-10-26 the rest of this document is in [`21-ui-performance-benchmark/`](21-ui-performance-benchmark/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](21-ui-performance-benchmark/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](21-ui-performance-benchmark/02-open-question-dispositions.md) | Open-question dispositions |
| [03](21-ui-performance-benchmark/03-escalated-to-the-product-owner.md) | Escalated to the product owner |
