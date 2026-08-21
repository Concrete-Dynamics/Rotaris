---
req-id: SWR-3419
status: approved
trace: required
test: required
title: "The requirement's target branch is the user's to set"
epic: SWR-3400
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-board-evidence-axis.md
---

# SWR-3419 — The requirement's target branch is the user's to set

SWR-3409 already speaks of a verified integration being taken to *the
requirement's target branch*. Nothing says what that branch is. In practice
requirement work forks from, and lands on, whatever branch the workspace happens
to have checked out at the moment the run starts — which is right for a team that
works on its default branch and quietly wrong for one that does not.

A team on `dev`, or on a release branch during a stabilisation window, gets no
error: units fork from the wrong base, an integration fast-forwards onto the
wrong branch, and the verification that decides a requirement's evidence
(SWR-3221) is measured against a tree nobody ships. Every one of those is
correct-looking and wrong.

Requirement: a workspace declares the branch requirement work is based on and
lands on, and Rotaris uses that one answer everywhere.

- The target branch is configuration, with the checkout's current branch as its
  default — so a project that never sets it behaves exactly as it does today.
- Where it is set, unit branches fork from it (SWR-3405), integration promotes to
  it (SWR-3409), and a requirement's verification is measured on it (SWR-3221).
  One declaration, one answer, no call site with a branch name of its own.
- A run started while the checkout is on a different branch says so before it
  starts, rather than silently working against the branch it found.
- A target branch a workspace does not have is a stated error at the point the
  work would start, not a failure at promotion time.

## Acceptance criteria

- A workspace that declares nothing behaves as today: the current branch is the
  target.
- With a target branch set, a unit branch forks from it and an integration
  promotes to it, even when the checkout stands elsewhere.
- The verification recorded for a requirement names the target branch it was
  measured on.
- A declared branch that does not exist is refused with the branch named, before
  any worktree is created.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Default resolution, an explicit target, and the refusal for a branch that does not exist | The target-branch resolution | `tests/unit/requirements/test_target_branch.py` |
| Integration | A requirement run in a git fixture whose checkout is on another branch forks from and lands on the declared target | Execution + integration over a real repository | `tests/integration/test_requirement_integration.py` |
| User-flow E2E | A team working on `dev` runs a requirement and the work lands on `dev` | Public product boundary → user-observable result | `tests/integration/test_requirement_integration.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
