---
reference: ROTARIS-CRW-001
domain: desktop-shell-windows
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 12, Desktop Shell, Navigation, and Window Management

> ## Amendment, 2026-09-29 — a non-zero cost that would read as zero renders as a floor (ESC-42)
>
> `REQ-SHELL-045` keeps its property — "a cost that is small but not nothing is never rendered as zero" — and now names
> what delivers it: the single money rule's floor, `< 0.0001`, which `REQ-PROVIDER-121` gains in the same round. Item 22
> below gave four decimal places as the reason the property holds, and it does not: half-up rounding to four places
> renders every amount above zero and below 0.00005 as `0.0000`. The reason is kept in the row beside its correction.
>
> **Why this is an amendment and not a directive.** Two live requirements disagreed: `REQ-PROVIDER-121` stated a rule,
> and `REQ-SHELL-045` claimed a property that rule could not deliver. The owner ruled ESC-42 option (b) as it recommended
> ([R-067](../../product/requests.md#r-067)); `owner-decisions.md` holds the ruling and the four details it settles.

> ## Amendment, 2026-09-02 — "the folder that is already open" is decided by one rule for the product
>
> **No disposition below is reversed.** This domain makes two decisions that turn on whether two
> directory strings name the same directory: REQ-SHELL-010 (a) resolves a workspace a window was
> explicitly built for before persisting it, and REQ-SHELL-021 does nothing when the folder selected in
> the chooser is the one already open. Both stated their own rule, and REQ-SHELL-010's — "normalized to
> an absolute path" — was weaker than the rules the startup domain and the hooks domain applied to the
> same question. Which of two outcomes a user gets (a second window, or nothing at all) depended on
> which document an implementer read.
>
> REQ-STARTUP-163 is now the product's **single definition** of when two directory strings name the same
> directory, and states in its own text that a document needing the rule cites it rather than restating
> it. Both requirements above now cite it. The rule resolves symbolic and directory links, expands
> home-relative prefixes and relative segments, gives a trailing separator no meaning, resolves
> abbreviated alternate spellings the filesystem itself keeps, and compares case-sensitively or not
> according to the filesystem holding the paths. It deliberately does **not** reconcile spellings that
> reach one directory only through a mapping the user configured outside the filesystem, and the cost of
> that is bounded to a second window opened on one folder — which is a better outcome than silently
> merging two workspaces.
>
> **Nothing here decides workspace identity.** What binds a workspace to its sessions is the identifier
> REQ-SESSION-197 fixes, which is carried in the workspace and never derived from a path.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - Any disposition locating **prompt history and stash** at a file under `<workspace>/.rotaris/` is
>   superseded: they are held in the durable store the application keeps for the workspace
>   (REQ-LIBRARY-138, REQ-SHELL-157). The per-workspace scoping, the caps, the no-partial-state guarantee
>   and the "Could not save prompt history" degradation all stand.
> - **OQ 36**'s 400 ms composer-draft debounce is **unaffected**. It is a preference-store write, not a
>   session save, and is recorded here only so it is not confused with the persistence debounce SR-4
>   withdrew.


This record disposes of every open question raised in the draft of
[`../12-desktop-shell-windows.md`](../12-desktop-shell-windows.md) (requirement prefix `REQ-SHELL`).
The body of that specification has been amended so that each decision below is stated normatively in
place; the original open-question numbering is preserved here so that the draft and the resolved
specification can be read against one another.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, surface, exit codes, or event vocabulary. Where a case was
   under-determined, this record chooses; awkward or arbitrary behavior is never preserved for
   compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved to the reading more
   coherent with the rest of the document; where no coherent reading exists, the behavior is omitted
   rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent rather than something known to work.
4. **The product is one Electron desktop application with no command-line interface and no
   terminal user interface.** Not deferred — removed. Domains 17 and 18 are retired and the
   `REQ-TUI` and `REQ-CLI` identifiers are withdrawn. See the graphical-only sweep below for what
   that did to this domain. Running external programs — the agent's own terminal commands, lifecycle
   hooks, tool servers on the stdio transport, version-control invocations — remains fully in scope;
   what is removed is any way for a *user* to drive the product from a shell.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable format). Open questions
   asking for the exact phrasing, punctuation, separators, or grammatical inflection of a
   *human-readable* message are resolved by stating what the message must convey and leaving the
   wording to the implementation.

Cross-domain vocabulary was taken from `04-model-providers-auth.md` (money rendering, cloud credit
states), `06-git-worktrees-checkpoints.md` (generated worktree branch names, collision suffixes),
`07-sessions-persistence.md` (execution-status vocabulary), `10-sandbox-network-egress.md` (sandbox
mode vocabulary), `11-startup-distribution-updates.md` (diagnostics run-directory location) and
`15-settings-configuration.md` (Settings category identifiers, desktop preference keys). No other
source was consulted.

New requirements added by these resolutions: **REQ-SHELL-162** and **REQ-SHELL-163** (rescued
capabilities, see the sweep below), and **REQ-SHELL-164** through **REQ-SHELL-167** (open questions
9, 11, 12 and 13). Four requirements — REQ-SHELL-001 through REQ-SHELL-004 — are withdrawn. No
requirement identifier was renumbered, reused, or deleted. **The sixth reconciliation round added
one further requirement, REQ-SHELL-168**, which was not raised by an open question: domain 01's
resolution record had recorded the plan gate (REQ-ORCH-153, REQ-ORCH-154) and the surface set closed
by REQ-ORCH-155 as new obligations on this domain, and no round between that record and the sixth
executed them. REQ-SHELL-168 states that this window hosts those surfaces, that each is presented
inside the primary view its run belongs to and offers its actions in the one action vocabulary of
REQ-SHELL-048, that this document holds no copy of what any of them must convey, that window-level
Escape does not answer the gate, and that a session waiting at the gate is not an active run for the
close guard of REQ-SHELL-119. Of the 36 open questions raised in the
draft, 34 are resolved, 2 are moot, none are omitted, and none are escalated. The "Open Questions"
section of the specification is consequently empty of outstanding items.

## Parts

Since 2026-10-26 the rest of this document is in [`12-desktop-shell-windows/`](12-desktop-shell-windows/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](12-desktop-shell-windows/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](12-desktop-shell-windows/02-dispositions.md) | Dispositions |
| [03](12-desktop-shell-windows/03-dispositions-2.md) | Dispositions *(continued, from "36 \| RESOLVED \| The interval is 400 ms after the last keystroke, with an immediate …")* |
