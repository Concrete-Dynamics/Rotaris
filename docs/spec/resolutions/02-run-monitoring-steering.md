---
reference: ROTARIS-CRW-001
domain: run-monitoring-steering
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 02, Run Monitoring and Steering


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - Every disposition that reasons about the **session directory layout** — the metadata file a listing
>   reads, the split state files, the append-only evidence file readable from a byte offset — describes a
>   layout withdrawn by **SR-4**. REQ-MONITOR-233 to REQ-MONITOR-237 now state record kinds and no paths,
>   and REQ-MONITOR-236 is withdrawn with the legacy combined snapshot file it restated (REQ-SESSION-005).
> - Any disposition that treats the **ten-second persistence debounce** as a fixed cost this domain observes
>   is superseded: the debounce is withdrawn outright (REQ-SESSION-067). A save is durable when it is
>   requested. This is what makes REQ-MONITOR-218 (publish a new row immediately) and REQ-MONITOR-221
>   (persist before publishing) simultaneously satisfiable, which they previously were not.
> - **REQ-MONITOR-299**'s entry-by-entry session-directory comparison is withdrawn as a conformance-test
>   methodology encoded as a product requirement. The behavioural guarantee it carried — an unwatched run
>   leaves everything a watched run leaves — is kept and now compares record *kinds*.


This record disposes of every open question raised in the draft of
[`../02-run-monitoring-steering.md`](../02-run-monitoring-steering.md) (requirement prefix
`REQ-MONITOR`), and records the graphical-only sweep applied to that draft. The body of the
specification has been amended so that each decision below is stated normatively in place; the
original open-question numbering is preserved here so the draft and the resolved specification can
be read against one another.

The product-owner decisions in force while this was resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, surface, exit codes, or event vocabulary. Where a case was
   under-determined, this record chooses; awkward or arbitrary behavior is never preserved for
   compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** No requirement is dropped merely for describing
   intent rather than something known to work.
4. **The product is one Electron desktop application with no command-line interface and no terminal
   user interface.** Not deferred — removed. Domains 17 and 18 are retired and the `REQ-TUI` and
   `REQ-CLI` identifiers are withdrawn. See the graphical-only sweep below for what this did to this
   domain. Running external programs — an agent's own terminal commands, lifecycle hooks, tool
   servers on the stdio transport, version-control invocations, and child processes the product
   starts for itself — remains fully in scope; what was removed is any way for a *user* to drive
   this product from a shell.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, or a parseable format). Open
   questions asking about the exact phrasing, punctuation, separators, or inflection of a
   *human-readable* message are resolved by stating what the message must convey and leaving the
   wording to the implementation.

Cross-domain vocabulary was taken from `01-run-orchestration.md` (role vocabulary REQ-ORCH-028,
model-tier resolution REQ-ORCH-019), `04-model-providers-auth.md` (money arithmetic and the
subscription-usage fetch timeout), `12-desktop-shell-windows.md` (single action vocabulary, keyboard
claims, minimum-window reachability, never-colour-alone) and `15-settings-configuration.md`
(tier-alias vocabulary REQ-CONFIG-070, REQ-CONFIG-071). No other source was consulted.

New requirements added by the sweep and these resolutions: **REQ-MONITOR-299** through
**REQ-MONITOR-305**. Seven requirements — REQ-MONITOR-001, REQ-MONITOR-095, REQ-MONITOR-196,
REQ-MONITOR-277, REQ-MONITOR-278, REQ-MONITOR-280 and REQ-MONITOR-282 — are withdrawn. No
requirement identifier was renumbered, reused, or deleted. Of the 30 open questions raised in the
draft, 29 are resolved, 1 is moot, none are omitted, and none are escalated. The "Open Questions"
section of the specification is consequently empty of outstanding items.

## Parts

Since 2026-10-26 the rest of this document is in [`02-run-monitoring-steering/`](02-run-monitoring-steering/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](02-run-monitoring-steering/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](02-run-monitoring-steering/02-dispositions.md) | Dispositions |
| [03](02-run-monitoring-steering/03-outcome.md) | Outcome |
