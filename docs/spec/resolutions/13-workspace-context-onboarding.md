---
reference: ROTARIS-CRW-001
domain: workspace-context-onboarding
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 13, Workspace Handling, Context Injection, and Project Onboarding

This record disposes of every open question raised in the draft of
[`../13-workspace-context-onboarding.md`](../13-workspace-context-onboarding.md) (requirement prefix
`REQ-WORKSPACE`). The body of that specification has been amended so that each decision below is
stated normatively in place; the original open-question numbering is preserved here so that the
draft and the resolved specification can be read against one another.

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
   that did to this domain. Running external programs — the code-intelligence setup commands, git,
   lifecycle hooks, tool servers on the stdio transport — remains fully in scope; what is removed is
   any way for a *user* to drive the product from a shell or a text-mode interface.
5. **No legacy-directory adoption.** A clean-room product has no earlier directory to migrate from,
   so the one-time rename of a previously-named state directory is withdrawn.
6. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (a digest payload field, an enum, a parseable format). Open questions
   asking for the exact phrasing of a *human-readable* message are resolved by stating what the
   message must convey and leaving the wording to the implementation.

Cross-domain vocabulary was taken from `04-model-providers-auth.md` (the provider catalog, the
provider snapshot file), `05-tools-permissions-approvals.md` (permission-mode vocabulary, the
outside-workspace opt-out, the status-strip flag set), `12-desktop-shell-windows.md` (the seven
primary views, the composer slash catalogue, the native-dialog contract, the per-user preference
store), `15-settings-configuration.md` (the minimal starter document, the desktop save key set,
save validation, the Settings category identifiers) and `06-git-worktrees-checkpoints.md`
(generated worktree branch names). No other source was consulted.

New requirements added by these resolutions: **REQ-WORKSPACE-148** through **REQ-WORKSPACE-153**.
Seventeen requirements are withdrawn. No requirement identifier was renumbered, reused, or deleted.
Of the 32 open questions raised in the draft, 29 are resolved, 3 are moot, none are omitted, and
none are escalated. The "Open Questions" section of the specification is consequently empty of
outstanding items.

## Parts

Since 2026-10-26 the rest of this document is in [`13-workspace-context-onboarding/`](13-workspace-context-onboarding/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](13-workspace-context-onboarding/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](13-workspace-context-onboarding/02-dispositions.md) | Dispositions |
| [03](13-workspace-context-onboarding/03-new-requirements.md) | New requirements |
| [04](13-workspace-context-onboarding/04-escalations.md) | Escalations |
