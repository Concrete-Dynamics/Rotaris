---
req-id: SWR-2617
status: approved
trace: required
test: required
title: "Gate-drift proposals from the improvement collector"
epic: SWR-2600
priority: P1
date: 2026-08-12
---

# SWR-2617 — Gate-drift proposals from the improvement collector

Everything the automatic paths are not allowed to do to the gate MUST still
reach the user. A repo changes shape over time — a package manager is swapped, a
type checker is adopted, a sub-project appears, a tool is dropped — and the
post-run improvement loop is where those changes become a reviewable decision.

- `ImprovementProposalCategory` gains `verifier_gate_update`. A proposal in this
  category names the concrete `verifier:` block that approval would produce, so
  the user reviews the resulting configuration rather than a description of it.
- The collector's input is extended with gate evidence: the bound suite and its
  source, the gate state and any fingerprint drift (SWR-2612), the run's
  per-check outcomes including `invalid` ones (SWR-2616), the probe verdicts
  (SWR-2613), and the roles the workspace has markers for but no check.
  Proposals in this category MUST cite that evidence like any other.
- Every change outside the automatic paths' authority arrives here: removing a
  check, lowering a check from `blocking` to `advisory`, adding the first check
  for a role, replacing a command with one that is not a same-role equivalent,
  and adopting a newly appeared sub-project's suite.
- An approved gate proposal is **applied, not delegated**. Every other category
  becomes a task an agent interprets; a gate change must not, or SWR-2614's one
  writer becomes two. The improvement run writes it through the gatekeeper's path
  before any agent starts, with the authority rule disabled — the only place in
  the product that does, and only because a person has now approved precisely
  what that rule refuses. Without this route the refusals would be a wall rather
  than a routing rule, and a user could never retire a check.
- Gate proposals stay approval-gated even at `risk: low`: weakening a gate is
  never automatic, which is what makes the automatic paths safe to trust.
- Proposals are deduplicated against the artifact history (SWR-1640): an
  unapproved, unchanged gate proposal is not re-emitted every run, and is
  re-emitted when its evidence changes — a new fingerprint, a newly failing
  role, a check that became invalid. The deduplication is **post-processing over
  content keys, never a prompt instruction**: a model told not to repeat itself
  repeats itself. Each emitted proposal is stamped with a key over its block and
  the evidence it was made from, which is also the citation this requirement
  asks for. Only *pending* prior proposals suppress a new one — a rejection is a
  decision the user made and re-raising it would be nagging, and an approval has
  been applied.
- The collector still MUST NOT author or write a gate itself (SWR-1603): it
  proposes, the user approves, the gatekeeper writes.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The new category validates on the proposal schema; a gate proposal carries the resulting `verifier:` block and cites gate evidence; a proposal missing that block is rejected | Proposal schema | `tests/unit/improvement/test_proposal_schema.py` |
| Unit | Gate evidence reaches the collector's prompt payload; an unchanged unapproved gate proposal is deduplicated and a changed-evidence one is re-emitted | Collector API + history dedupe | `tests/unit/improvement/test_collector.py`, `tests/unit/improvement/test_history.py` |
| Integration | Approving a gate proposal writes the config through the gatekeeper path and the next run is gated by the new suite; rejecting it leaves the gate untouched | Approval → Improver → gatekeeper → config | `tests/integration/test_improvement_approval_flow.py` |
| User-flow E2E | A run in a repo whose techstack changed surfaces a gate-update proposal the user can review and approve, and the following run verifies with the updated suite | Public product boundary → user-observable result | `tests/integration/test_verifier_gate_drift.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
