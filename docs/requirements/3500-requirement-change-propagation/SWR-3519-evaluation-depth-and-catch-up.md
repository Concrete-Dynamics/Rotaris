---
req-id: SWR-3519
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3515
title: "An evaluation states its depth, can be stopped, and strands no requirement"
epic: SWR-3500
date: 2026-08-18
source: docs/plans/2026-08-17-requirements-refactors/01-evaluate-project-split.md
---

# SWR-3519 — An evaluation states its depth, can be stopped, and strands no requirement

SWR-3515 made one pass that runs every rule. It did not say that some of those
rules wait on a language model while others are arithmetic, and the caller
cannot tell the two apart: a board refresh triggered by a background commit
enters the same call as a user asking for one, and both may sit inside an impact
analysis, a clarification, a migration plan and a removal analysis before
returning. There is one cost model where there are two, and no way to stop
either.

Separating them exposes a hole that is already open. Step 4 analyses what step 1
moved **in the same pass** — `_costs_an_analysis` requires `outcome.moved`, which
is true only for a transition that pass accepted. A pass that moves a
requirement to `Needs Update` without analysing it therefore leaves it analysed
by nobody: the next pass's step 1 finds the requirement already in `Needs
Update`, moves nothing, and analyses nothing. The requirement carries no change
offer, because `pending_change_work` answers from the analysis log and there is
no record — so the board shows a card that looks like it needs nothing.

That is reachable today, without any of this: a workspace with
`requirements.change.analyze_changes: false` that later turns it on, or one whose
persona does not resolve when the pass runs. Depth and cancellation would widen
it from an edge case into a routine one.

Requirement: an evaluation pass states how deep it goes, can be asked to stop,
and leaves no requirement permanently unanalysed at any depth.

- A pass takes a **depth**. At full depth it runs every rule, as SWR-3515
  describes, and that is the default and what a caller that says nothing gets. At
  rules-only depth it runs the deterministic rules and reaches no analyst — no
  impact analysis, no clarification, no migration plan, no removal analysis — so
  a caller that must not wait on a provider has a call it can make.
- Depth is **per pass**; `requirements.change`'s switches are the workspace's
  standing declaration (SWR-3117). They compose: a rule the policy disables is
  disabled at every depth, and no depth re-enables it.
- A pass can be handed a **cancellation token**. It is checked between
  per-requirement analyses, so stopping costs at most one analysis. The
  deterministic rules are not cancellation points: they are fast, and a
  half-applied rule pass is worse than a finished one. A cancelled pass reports
  that it was cancelled, and everything it already applied stays applied.
- **What a pass analyses is derived from state, not from what it just did.** A
  delivered requirement whose text still differs from the delivered version and
  which has no impact analysis for its current version is analysed by the next
  full pass, whether the divergence was noticed by that pass or by an earlier one
  that did not analyse it.
- An analysis is **not repeated for a version already analysed**. Records are
  append-only (SWR-3514), so a pass that re-analysed what it had already analysed
  would cost a model call per requirement per refresh and grow the log without
  bound.
- A pass **reports what it did not analyse**, so a rules-only or cancelled pass
  is legible rather than silently partial. Nothing depends on the caller acting
  on that report — the catch-up above is what makes the guarantee hold.
- Alongside it, a pass reports **whether this workspace permits the analysis at
  all** — `requirements.change.analyze_changes` (SWR-3117). The two only mean
  something together: a caller holding a non-empty worklist is asking whether a
  full pass would pay it off, and in a workspace that switched the analysis off
  the answer is no, at every depth and however many passes run. Read from the
  policy, never inferred from what a pass did, so that an analysis which *failed*
  — and leaves the same non-empty worklist behind (SWR-3503) — is not mistaken
  for a workspace that never wanted one.

## Acceptance criteria

- A rules-only pass reaches no analyst; a full pass over the same workspace
  reaches the same analysts it reaches today.
- A cancelled pass stops before the next per-requirement analysis, says it was
  cancelled, and leaves the rules it already applied in place.
- A requirement moved to `Needs Update` by a rules-only, cancelled, or
  policy-disabled pass is analysed by the next full pass, even though that pass
  moves nothing.
- Two consecutive full passes over an unchanged workspace produce one impact
  analysis, not two.
- A policy switch that disables a rule disables it at every depth.
- A pass over a workspace with `analyze_changes` off reports the analysis as not
  permitted, at either depth; a pass over one with it on reports it permitted,
  including when an analysis failed.
- The default depth is full, so an existing caller's behaviour is unchanged.

## Test coverage

Unit coverage in `tests/unit/requirements/test_change_host.py`, over the pass
itself with a scripted `Analysts` counting invocations — the seam
`evaluate_workspace` already documents for exactly this. It covers each
acceptance criterion above: the zero-analyst rules-only pass, the cancellation
checkpoint, the catch-up across two passes, the no-repeat property, and policy
dominance at both depths. Integration coverage rides on
`tests/integration/test_requirement_change.py`, which evaluates a real workspace
and reads the analysis records back.

The originating product flow is SWR-3515's own: one evaluation, every rule, in
one order, reachable without a display — this requirement is what lets a caller
choose what that pass costs without changing what it guarantees.

Derived from: [SWR-3515 — One evaluation runs every propagation rule, in one order, without the desktop](SWR-3515-propagation-pass.md)

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
