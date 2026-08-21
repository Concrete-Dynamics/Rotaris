---
req-id: SWR-2615
status: approved
trace: required
test: required
title: "Gate authoring for a workspace that starts empty"
epic: SWR-2600
priority: P0
date: 2026-08-12
---

# SWR-2615 — Gate authoring for a workspace that starts empty

A workspace that starts from nothing has no markers to detect and therefore no
gate — and the choice of techstack is exactly what a first run produces. The
system MUST author a gate once the techstack has settled, and MUST be honest
about running ungated until then.

- The **techstack event** fires on the gate-state transition from a workspace
  with no recognized marker to one that has one (SWR-2612): the first
  `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, or conventional test
  root an iteration creates. It fires once per transition, not once per
  iteration, and is evaluated from the post-iteration fingerprint so it never
  pre-empts the scaffolding it depends on.
- On that event the system schedules gatekeeper authoring (SWR-2614): the
  persona reads the freshly created manifest, proposes the suite, probes it
  (SWR-2613), and writes the surviving checks to `verifier.checks`. Authoring
  runs after the iteration reaches its terminal state, never inside it.
- While the state is `pending`, completion classification is **not** blocked — an
  early scaffolding run must be able to finish — but the absence of a gate MUST
  be visible rather than silent:
  - the child report carries the gate state, so `verifier_results: skipped` can
    no longer be read as "verified nothing to verify";
  - the desktop run header and the session summary show a "no quality gate"
    warning for the duration.
- An explicit `verifier.checks: []` ends the warning permanently: the user has
  stated that this workspace runs no verification, and that decision is not
  re-litigated on every run. An explicit non-empty `verifier.checks` likewise
  ends authoring: a stated suite is never re-authored.
- **`verifier.author_gate` (default `true`) is the kill switch.** Set to `false`,
  detection and probing continue and every write is routed to an approval-gated
  proposal instead (SWR-2617): off means "a person approves each change", not
  "the gate stops adapting".
- Authoring runs **detached**, beside the loop rather than in front of it. It is
  a model call, and awaiting it would put its latency on the critical path of an
  iteration whose outcome it cannot change. The write lands within seconds and
  binds the next iteration to resolve a suite; if it lands later than that, the
  one after binds it.
- The "no quality gate" sentence is rendered once, by the verifier, and carried
  to every host. A sentence three hosts compose for themselves is one three hosts
  eventually disagree about, and the desktop is deliberately barred from reaching
  into the verifier to ask.
- Authoring covers the whole workspace, not just its root: sub-projects detected
  under the workspace root contribute their own checks to the one root gate
  (SWR-2618), so an iteration still runs a single bounded suite.
- Authoring that produces nothing bindable leaves the state `pending` with the
  reason recorded, and does not retry on every subsequent iteration — the next
  attempt waits for the next fingerprint change.

Derived requirements: [SWR-2618 — Per-check working directory for multi-project workspaces](SWR-2618-per-check-working-directory.md)

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The techstack event fires once on the no-marker → marker transition and not on subsequent iterations; authoring that binds nothing leaves `pending` without a retry loop | Gate lifecycle API | `tests/unit/verifier/test_gate_state.py`, `tests/unit/verifier/test_gate_authoring.py` |
| Integration | An iteration that scaffolds a project triggers authoring after it terminates, and the written suite binds the following iteration; a `pending` run reports its gate state in the child report | Ralph loop → gatekeeper → config → next run | `tests/integration/test_verifier_gate_lifecycle.py` |
| User-flow E2E | A run in an empty workspace scaffolds a project, finishes with a visible "no quality gate" warning rather than a silent pass, and the next run is gated by the authored suite | Public product boundary → user-observable result | `tests/integration/test_verifier_gate_lifecycle.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
