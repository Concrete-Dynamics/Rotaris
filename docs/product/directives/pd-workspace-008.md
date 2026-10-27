[Product directives](../directives.md) › PD-WORKSPACE-008

<a id="pd-workspace-008"></a>

### PD-WORKSPACE-008 — the strip's branch item names the states in which there is no branch to show

*Renumbered before landing: built as `PD-WORKSPACE-007` on its branch, it took the next free number, `PD-WORKSPACE-008`, when `PD-WORKSPACE-005` (the project-setup banner, OQ-171) landed on `main` first; its citations followed.*

Where REQ-WORKSPACE-020 renders the status strip's branch item as empty text with no tooltip, the item SHALL instead convey
the state, as REQ-GIT-161 asks, in these words, each its tooltip and its accessible description:

- a detached HEAD: `detached HEAD`, "This workspace is on no branch (detached HEAD).";
- a folder that is not a Git repository: `no git repository`, "This folder is not a Git repository.";
- Git unavailable: `no git`, "Git is not installed or not on PATH.";
- before the first read: `—`, "Branch this workspace is on: not read yet".

The detached and absent states are set in italics, and none of these draws the branch icon, which stands before a branch
name only. A branch name keeps REQ-WORKSPACE-020's sentences, the full stop and the agreeing noun included: "Branch this
workspace is on: {branch}.", "…, 1 commit ahead.", "…, {n} commits ahead."; REQ-GIT-122's backticked tooltip is read as a
template of those three, so it gains the full stop and never renders its "(s)". Every other clause of REQ-WORKSPACE-020 and
REQ-GIT-122 still governs, the worktree branch's included.

**As built.** `branchStripItem` and `branchSentence` (`packages/ui/src/GitView.tsx`), placed by `stripItems`
(`packages/ui/src/composer.ts`). An unborn branch and a repository whose branch could not be read are not among the states
above: REQ-WORKSPACE-020's empty item still governs them. Until 2026-10-06 (fin22) the build departed from it there, drawing
the branch icon, `—` and "Branch this workspace is on: —."; it now draws the empty item, no text, icon, tooltip or
description (repaired in
[`the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md`](../../defects/fixed/the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md)).

**Why, and what it costs.** OQ-193: REQ-GIT-161 requires a detached checkout and a non-repository to be conveyed, each
distinct from a branch name and from the other, and REQ-WORKSPACE-020 requires the item to be empty in exactly those cases.
One item cannot do both. The owner kept the visible words and tooltips as built. What it costs: the strip spends width on a
state that has no branch, and the item is no longer empty text that a reader of REQ-WORKSPACE-020 would expect there.

> **Narrows:** REQ-WORKSPACE-020, REQ-GIT-122

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-193.*
