---
reference: ROTARIS-CRW-001
domain: git-worktrees-checkpoints
date: 2026-08-30
status: resolved
---

# Open-Question Resolutions — Git Integration, Worktrees, and Checkpoints


> ## Amendment, 2026-10-13 — a session storage directory that contains the requirement checkout container (OQ-263)
>
> `REQ-GIT-138` gains a dated note beneath its text, which is kept unchanged. In its first sentence, "the directory of
> another" means a worktree directory of another namespace, or the fixed requirement checkout container `REQ-GIT-137` names
> (`<workspace>/.rotaris/requirements/worktrees/`), and not every directory that encloses it; a `worktree_storage_subpath` of
> `requirements` or `.`, whose session directory contains that container, loads, and the directory-side rejection is exactly
> the one the requirement states (the container itself, or a directory inside it).
>
> **Why this is a note and not a directive.** The requirement's two sentences read differently over those two values, and
> `REQ-GIT-130`'s own layout — the integration container `integrations/` inside the session storage directory — shows that
> namespace containers nest by design. Nothing the product does changes. Ruled under the owner's delegation
> ([R-072](../../product/requests.md#r-072)), confirmed as built; the ruling, with its caveat on session ids, is in
> [`open-questions.md`](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-263).

> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 10** and **OQ 14** reason about the session **lock file** and its `host` field. The lock is now a
>   record held with the session (REQ-SESSION-046, REQ-GIT-020); the `pid`/`host`/`acquired_at` field set,
>   the single-retry reap, and the resolve-ambiguity-toward-live rule are all unchanged. What changed is the
>   medium and, under **SR-5**, what a refusal must **convey**: where the lock names another machine the
>   refusal must say the session is held by a different machine, not report a lock conflict
>   (REQ-SESSION-048). Under **ESC-15** a foreign-host lock is no longer the ordinary consequence of shared
>   storage but evidence that the session store itself is reachable from more than one machine.
> - **OQ 23**'s "no session directory and no lock are created" is now "no session record and no lock are
>   created". The refusal semantics are unchanged.
> - The **integration lock** (REQ-GIT-128) deliberately stays a file at `<workspace>/.rotaris/`. It is the
>   one lock in the product that is not machine-local, because what it protects is the user's own base
>   repository, which travels with the workspace.
>   >
>   > **Still true, and incomplete after ESC-21 (2026-09-01).** The lock stays where it is for exactly
>   > the reason given, and every sentence of REQ-GIT-128's case for it is preserved. What the note
>   > omits is the boundary within which the cross-machine guarantee is actually true. Exclusive create
>   > is a genuine primitive on a network filesystem and is **not** one inside a file-synchronisation
>   > agent's tree, because such an agent replicates after creation: both machines create the lock
>   > locally, both succeed, and both believe they hold it. The product therefore does not promise
>   > mutual exclusion it cannot enforce — on storage classified as file-synchronisation-replicated
>   > (REQ-STARTUP-166) the integration is **refused before anything is attempted** and the lock is not
>   > created at all, as a pre-work refusal under REQ-GIT-157 and second in REQ-GIT-124's ordered list.
>   > REQ-GIT-145's one-integration-per-workspace limit is correspondingly no longer asserted on a lock
>   > that does not lock. The **strength** of that response — refusal against a proceed-past warning —
>   > is what spike 19 decides; the direction is settled and the spike does not reopen it.
>   >
>   > Domain 06 states no storage test of its own: the classification is REQ-STARTUP-166's and is not
>   > made a second time here. An unclassifiable or not-yet-determined answer does **not** refuse,
>   > because an inconclusive answer is a silent negative in REQ-STARTUP-166 and stays one here; that is
>   > why REQ-GIT-150's "every ambiguity about liveness resolves toward refusal" is now bounded so the
>   > two rules cannot appear to conflict.


This record disposes of every open question raised in the draft of
[`../06-git-worktrees-checkpoints.md`](../06-git-worktrees-checkpoints.md) (domain 06, requirement
prefix `REQ-GIT`). The body of that specification has been amended so that each decision below is
stated normatively in place; the numbering of the original open questions is preserved here so the
draft and the resolved specification can be read against each other.

The following product-owner decisions of 2026-08-30 governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   that is more coherent with the rest of the document; where no coherent reading exists, the
   behavior is withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. See the
   graphical-only sweep below for what that did to this domain. Running external programs stays
   fully in scope: version-control invocations, worktree creation and checkpoint capture are all
   things the application does, not ways a user drives it.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, or a parseable output
   format). Open questions asking only about phrasing, punctuation, or inflection of a human-readable
   message are resolved by fixing the information the message must carry and leaving the wording to
   the implementation.

New requirements added by these resolutions: **REQ-GIT-152** through **REQ-GIT-156**. No requirement
identifier was renumbered, reused, or deleted.

## Parts

Since 2026-10-26 the rest of this document is in [`06-git-worktrees-checkpoints/`](06-git-worktrees-checkpoints/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](06-git-worktrees-checkpoints/01-dispositions.md) | Dispositions |
| [02](06-git-worktrees-checkpoints/02-outcome.md) | Outcome |
| [03](06-git-worktrees-checkpoints/03-graphical-only-sweep.md) | Graphical-only sweep; Dispositions this sweep supersedes |
