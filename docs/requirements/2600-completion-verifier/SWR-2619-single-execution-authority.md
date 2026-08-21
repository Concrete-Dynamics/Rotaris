---
req-id: SWR-2619
status: approved
trace: required
test: required
title: "Single execution authority for the bound check suite"
epic: SWR-2600
priority: P1
date: 2026-08-13
---

# SWR-2619 — Single execution authority for the bound check suite

The bound check suite MUST be executed by the deterministic runner and by
nothing else. Today the `verifier` persona is instructed to run `make lint`,
`make typecheck`, and `make test` itself (`agents/prompts/verifier.md`, Step 3),
which are the same roles detection binds — so a task that reaches delegated
acceptance pays for the whole suite twice, in two terminals, with two chances to
disagree about what the exit code was. The duplication is pure cost: the
deterministic run already happened before the orchestrator could delegate.

- The suite runs once per code-modifying iteration, in the runner (SWR-2602).
  No persona re-runs a check that is part of the bound suite.
- The delegated payload for an acceptance check carries that iteration's
  verifier evidence (SWR-2603): the verdict, the per-check results with exit
  codes, and the paths to the full logs under `<session_dir>/evidence/verifier/`.
  The persona reads that evidence; it does not reproduce it.
- A persona MAY run a **targeted** command that the bound suite does not cover,
  and MUST then name the role the suite lacks. That observation is gate-drift
  evidence and is carried into a gate-update proposal (SWR-2617) — a persona
  needing a check the gate does not have is a fact about the gate, not a licence
  to run suites.
- The orchestrator delegates the acceptance check only for a slice whose gate is
  green, and this is **enforced in the delegation path** rather than asked of the
  orchestrator: a rule the orchestrator can simply not follow is one that
  eventually is not followed. Only the acceptance persona is withheld — refusing
  to delegate the repair itself would deadlock the loop this rule speeds up. While an iteration is gated, the bounded repair loop owns it
  (SWR-2605); spending a model call to re-narrate a red check the runner already
  reported is waste, and the repair context already carries the failing output.
- Fallback, so nothing goes ungraded: when no verifier evidence exists for the
  slice — the suite was `exempt`, the gate is `pending` (SWR-2615), or the
  iteration changed no files — the persona may run validation commands itself,
  and says in its report that it did so and why.
- The persona's role statement changes with its duty. The deterministic gate is
  the final gate (SWR-2604); the persona grades what the gate cannot see —
  request-clause coverage, todo items against the code on disk, scope creep, and
  regressions in intent. Prompts and the orchestrator's delegation table MUST NOT
  describe the persona as the final gate, and MUST NOT instruct it to establish
  exit codes the runner owns.
- Verdicts stay separable in the report: a persona `GAPS FOUND` on green checks,
  and a gated iteration with a clean acceptance reading, are both expressible and
  neither overwrites the other.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The delegated acceptance payload carries the iteration's verifier evidence and log paths; a slice whose gate is red is not offered for acceptance delegation; the no-evidence fallback is signalled to the persona | Delegation payload builder | `tests/unit/test_delegate_tool.py`, `tests/unit/verifier/test_acceptance_delegation.py` |
| Unit | Persona prompt composition states the evidence-reading duty and omits the suite-running instruction and the "final gate" claim | Prompt composition | `tests/unit/test_prompt_composition.py` |
| Integration | A task that modifies code and reaches acceptance executes the bound suite exactly once across the whole task; a gated iteration reaches repair without an acceptance delegation | Ralph loop → runner → orchestrator delegation | `tests/integration/test_verifier_single_execution.py` |
| User-flow E2E | A full run whose work is verified reports acceptance and check evidence to the user while the test command ran once | Public product boundary → user-observable result | `tests/integration/test_verifier_single_execution.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
