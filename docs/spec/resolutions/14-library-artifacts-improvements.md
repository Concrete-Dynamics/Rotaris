---
reference: ROTARIS-CRW-001
domain: library-artifacts-improvements
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 14, Library, Artifacts, and Improvement Proposals

> ## Amendment, 2026-09-29 — a child report's artifact falls back to the canonical name only without a task id (OQ-113)
>
> `REQ-LIBRARY-092` read "idempotent keyed on the task id (falling back to the canonical agent name)". Read as a fallback
> taken whenever the task-id lookup finds nothing, it let a later child whose name repeats an earlier child's rewrite the
> earlier child's report artifact in place, so that report was no longer materialized — against the requirement's own
> "Every terminal child report is materialized". The parenthesis now says the fallback serves only a record that carries
> no task id, so two children with different task ids never share or overwrite one artifact.
>
> **Why this is an amendment and not a directive.** The requirement disagreed with itself under the reading built; a
> clause that says when a fallback applies corrects it without changing what it was written to guarantee. The owner ruled
> OQ-113 as it recommended ([R-067](../../product/requests.md#r-067)); `open-questions.md` holds the ruling.

> ## Amendment, 2026-09-14 — history states gaps truthfully
>
> REQ-LIBRARY-168's statement that every artifact history is nonempty is superseded for an artifact
> whose ADR-0061 best-effort version operation failed. REQ-LIBRARY-051 continues to synthesize version
> 1 only for a pre-history artifact whose `versions_due` is zero. Once a write allocated a due version,
> an absent row is reported through `versions_never_recorded`; the history surface may therefore contain
> zero retained rows while stating the gap count. This keeps the inspection surface and REQ-LIBRARY-176's
> export aligned with REQ-LIBRARY-047's successful artifact write.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **Row 33** resolves the Windows retry ladder for the improvement store — "the attempt count is
>   contractual and so is the total bound; all 5 attempts must complete within 1 second". REQ-LIBRARY-043
>   no longer states any ladder, because no writer outside this application can reach a record in this
>   store. **This row must not be cited as evidence that a ladder survives anywhere:** OQ-44 forbids
>   borrowing a neighbouring store's constants to pretend one exists. The corpus states exactly one ladder,
>   REQ-SESSION-033's, and it governs the session summary file alone.
> - **Row 8** — the read-modify-write disposition stands; the **accepted interleaving loss it closed on
>   does not**. Under **ESC-18** the read-modify-write takes effect as one indivisible step, so two
>   genuinely interleaved review decisions on different proposals can no longer lose one another. ESC-3's
>   last-writer-wins semantics on the **same** proposal are untouched.
> - Any row treating `<workspace>/.rotaris/improvement_artifacts/<artifact_id>.json`, the
>   `history/<artifact_id>/<version>.json` layout, `rotaris-prompts.json` or `<session_dir>/artifacts/` as
>   settled file layouts now describes withdrawn mechanism. Every guarantee attached to those layouts was
>   re-homed before the mechanism went; see REQ-LIBRARY-042, -043, -047, -049, -087 and -138.
> - **The gap that block leaves is closed as of 2026-09-01.** Improvement artifacts were readable JSON
>   files a user could open for themselves before SR-4 made them records, and nothing replaced that.
>   **SR-9(a)**, ruled again under **ESC-20**, mints the export: REQ-LIBRARY-176 requires the workspace's
>   improvement artifacts to be obtainable as a file the user chooses, per artifact and for the whole
>   workspace, carrying the artifact container, each proposal with its evidence entries in stored order,
>   and the recorded version history REQ-LIBRARY-168 calls "the audit trail the write path keeps" — in
>   recorded order, none omitted, and with a statement where retention has pruned intermediate versions.
>   It cites REQ-EVENTS-166 for what an export must guarantee rather than restating it, and applies it on
>   the terms REQ-SESSION-199 fixes.
> - **Its boundary is worth reading before anyone widens it.** ESC-20 draws the export line on redaction
>   safety, not readership: a record gains an export when it carries no unredacted user or tool content.
>   REQ-LIBRARY-176 therefore carries the artifact exactly as stored and MUST NOT resolve an evidence
>   entry's `source_session_id`, `source_artifact_id` or `source_task_id` into the material those ids
>   name, because that material is REQ-SESSION-136's tool-call evidence, which never gains an export
>   (REQ-TOOLS-190). **This domain states no redaction obligation over an evidence entry's own excerpt**,
>   which REQ-LIBRARY-010 allows to hold quoted source text. That is not a defect introduced here — it
>   predates the export — but the export is what makes it consequential, and it is the one thing in this
>   area that may still need a product ruling.


This record disposes of every open question raised in the draft of
[`../14-library-artifacts-improvements.md`](../14-library-artifacts-improvements.md) (requirement
prefix `REQ-LIBRARY`). The body of that specification has been amended so that each decision below
is stated normatively in place; the original open-question numbering is preserved here so the draft
and the resolved specification can be read against each other.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application, with no command-line interface and no
   terminal user interface.** Domains 17 and 18 are retired and the `REQ-TUI` and `REQ-CLI`
   identifiers are withdrawn. Requirements of this domain whose only observable surface was a shell
   invocation or a full-screen text-mode interface are **withdrawn**, and every capability they
   carried has been rescued into a new desktop-reachable requirement. See the graphical-only sweep
   below.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking only for phrasing of a human-readable message are resolved by fixing what the
   message must convey and leaving the wording to the implementation.

Cross-domain coherence was checked against `01-run-orchestration.md` (check auto-detection, check
status and completion-gate vocabularies, gate lifecycle record), `05-tools-permissions-approvals.md`
(probe verdicts), `06-git-worktrees-checkpoints.md` (integration runs, REQ-GIT-131),
`07-sessions-persistence.md` (the persisted run-type marker, REQ-SESSION-021),
`12-desktop-shell-windows.md` (view order REQ-SHELL-023, the shortcut table REQ-SHELL-049, the
single action vocabulary REQ-SHELL-048, demo mode REQ-SHELL-005 and REQ-SHELL-162, the per-user
preference store REQ-SHELL-006), `15-settings-configuration.md` (the `verifier` configuration
section, the check-entry schema, the improvement-collector keys REQ-CONFIG-118) and
`19-notifications-errors-recovery.md` (REQ-NOTIFY-254, no failure is reported by silence). No other
document was consulted.

New requirements added by this record: **REQ-LIBRARY-165** through **REQ-LIBRARY-175**. No
requirement identifier was renumbered, reused, or deleted.

## Parts

Since 2026-10-26 the rest of this document is in [`14-library-artifacts-improvements/`](14-library-artifacts-improvements/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](14-library-artifacts-improvements/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](14-library-artifacts-improvements/02-dispositions.md) | Dispositions |
