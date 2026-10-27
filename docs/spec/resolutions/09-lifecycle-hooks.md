---
reference: ROTARIS-CRW-001
domain: lifecycle-hooks
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 09, User-Defined Lifecycle Hook Commands

> ## Amendment, 2026-09-02 — which workspace an approval covers is decided by one rule for the product
>
> **No disposition below is reversed, and no approval is loosened.** REQ-HOOKS-097 stated its own
> path rule — "reduced to an absolute path with symbolic links followed" — so that an approval granted
> under an absolute path still applies when the same workspace is later referred to as `.`. That is the
> same question REQ-STARTUP-163 now owns as the product's **single definition** of when two directory
> strings name the same directory, and two rules for one question meant an approval could be honoured
> under one spelling of a folder and withheld under another depending on which document was read.
> REQ-HOOKS-097 now cites that rule and states none of its own; REQ-HOOKS-092 cites REQ-HOOKS-097 for
> the resolved path it carries in the review request.
>
> **The guarantee is preserved and the safe direction is unchanged.** Relative segments are still
> expanded, so the `.` case the disposition cared about still works. Where REQ-STARTUP-163 declines to
> reconcile two spellings — a mapping the user configured outside the filesystem — they are different
> workspaces here as everywhere else, the approval does not carry across, and the set goes back under
> review, which is the conservative outcome. Nothing else about the decision changes: it stays keyed by
> the workspace together with the fingerprint of the hook set, so altering, adding, removing or
> reordering a workspace-declared hook still withdraws the approval.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 26** resolves the masking-channel list and justifies it with "the session directory is readable by
>   anyone who can look inside it". That premise is gone; **the masking is not**. Under **SR-4** the reason
>   is restated and is at least as strong: the launch audit and the timeline outlive the run, are readable
>   by anything that can reach the store, and are carried into the export of REQ-SESSION-199, so a
>   credential must never be recorded in them in the first place (REQ-HOOKS-118, REQ-HOOKS-119,
>   REQ-HOOKS-133). All six channels stand and none was dropped.
> - `<workspace>/.rotaris/hook-trust.json` (REQ-HOOKS-096) **stays a file** and no ruling moves it. It is
>   a per-workspace security decision, not high-volume, queried or transactional. That it travels with a
>   synchronised or cloned workspace, and therefore carries a trust decision to a machine that never made
>   it, is a live question no ruling has answered.


This record disposes of every open question raised in the draft of
[`../09-lifecycle-hooks.md`](../09-lifecycle-hooks.md) (domain 09, requirement prefix `REQ-HOOKS`).
The body of that specification has been amended so that each decision below is stated normatively in
place; the numbering of the original open questions is preserved here so the draft and the resolved
specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. Requirements in this
   domain whose only observable surface was a shell invocation are **withdrawn**, and every
   capability that reached a user only through such a surface is carried by a new desktop-reachable
   requirement. See the graphical-only sweep below. Running external programs is untouched: hook
   commands, agent tool execution, tool servers on the stdio transport, and version-control
   invocations all remain fully in scope — what is removed is any way for a *user* to drive this
   product from a shell.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, a parseable output format).
   Open questions asking only about phrasing, punctuation, separators, or inflection of a
   human-readable message are resolved by fixing the information the message must carry and leaving
   the wording to the implementation.

Cross-domain vocabulary was taken from `01-run-orchestration.md` (child terminal states REQ-ORCH-041,
report status REQ-ORCH-112, iteration outcome dispatch REQ-ORCH-074), `12-desktop-shell-windows.md`
(logical pixels, REQ-SHELL-022 and REQ-SHELL-030), `15-settings-configuration.md` (the per-user
global configuration directory, REQ-CONFIG-001), `19-notifications-errors-recovery.md` (hook notices
and the closed four-statement hook-trust vocabulary, REQ-NOTIFY-223 to REQ-NOTIFY-228) and
`20-event-history-replay-export.md` (run status vocabulary REQ-EVENTS-026, event catalog
REQ-EVENTS-041, hook event shape REQ-EVENTS-047). No other specification was consulted, and no
identifier, name, or phrasing was taken from any other implementation.

New requirements added by these resolutions: **REQ-HOOKS-136** through **REQ-HOOKS-139**. No
requirement identifier was renumbered, reused, or deleted. Of the 36 open questions raised in the
draft, all 36 are resolved: none omitted, none moot, and none escalated.

Two amendments fall outside the numbered questions and are recorded here for completeness. The
Data & Formats prose describing a one-off rename of directories left behind by an earlier product
name is deleted under the no-legacy-adoption decision: a clean-room product has no earlier directory
to migrate from, and both configuration directories are now addressed by their current names only.
And REQ-HOOKS-115's `<config-dir>` is restated as the per-user global configuration directory of
REQ-CONFIG-001, which resolves per platform, in place of `~/.config/rotaris` on every platform —
a direct contradiction with domain 15 about the same directory.

## Parts

Since 2026-10-26 the rest of this document is in [`09-lifecycle-hooks/`](09-lifecycle-hooks/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](09-lifecycle-hooks/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](09-lifecycle-hooks/02-dispositions.md) | Dispositions |
