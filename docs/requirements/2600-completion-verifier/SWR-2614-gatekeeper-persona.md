---
req-id: SWR-2614
status: approved
trace: required
test: required
title: "Gatekeeper persona and its sole write authority over the gate"
epic: SWR-2600
priority: P1
date: 2026-08-12
---

# SWR-2614 — Gatekeeper persona and its sole write authority over the gate

Authoring a quality gate is judgement work — which command represents this
project's tests, which tooling is real and which is vestigial — but it must not
be done by the persona whose completion the gate constrains. The system MUST
carry a dedicated `gatekeeper` persona that owns every automatic write to the
gate.

- `gatekeeper` is a built-in persona with its own system prompt and its own
  model slot (`gatekeeper_model`, resolving through the existing
  `small_model`/`fallback_model` chain like `default_summary_model`), so gate
  authoring is cheap and its model is configurable independently of the task
  personas.
- Its tool surface is bounded to what authoring needs: workspace read and
  search, the SWR-2613 probes, and writing the `verifier:` section of
  `<workspace>/.rotaris/agents.yaml`. It has no delegation and no general edit
  authority.
- The two gate tools are **internal**: absent from the public tool-name map that
  a persona's `tools:` list is validated against, so no configuration can grant
  them to anybody else. They are attached to the gatekeeper's agent for the
  length of one authoring turn and to no other agent ever.
- It is the **only** component that writes the gate. Detection, the runner's
  deterministic repair (SWR-2616), and an approved improvement proposal
  (SWR-2617) all reach the config through the gatekeeper's write path, so the
  same constraints and the same audit trail hold whoever initiated the change.
- A write replaces the `verifier:` section as a whole and leaves the rest of the
  file — models, personas, MCP servers, and their comments — untouched. Git is
  the audit trail for the change. In a workspace where the file is not tracked
  by git, a `.rotaris/agents.yaml.bak` copy is written first, so an unversioned
  workspace still has a way back.
- The persona MUST NOT weaken the gate on its own authority: it may add a check,
  and it may replace a check's command with a probed equivalent of the same role
  and severity, but removing a role's only check, lowering a check from
  `blocking` to `advisory`, or emptying the suite is outside its authority and
  MUST be routed to an approval-gated proposal (SWR-2617). This holds for
  hand-written checks and previously authored ones alike.
- **That rule is enforced inside the write tool, not asked for in the prompt.**
  The tool evaluates it before it touches the file and refuses *in band*,
  returning a sentence that says the change has to go through an approval —
  phrased as a routing instruction so the persona does not treat it as an
  obstacle to work around. A prompt instruction not to weaken the gate is one a
  model can lose track of; this one it cannot reach, which is what makes it safe
  to give an agent the pen.
- What the turn changed is read from the **write tool**, never from the persona's
  own account of itself — the same structural reason `verifier_results` is
  runner-owned and stripped from LLM output (SWR-2603).
- A check may state its `role`, so the authority rule has something to be per. A
  check that states none is its own slot: a hand-written suite is stating exactly
  what it wants run, and treating two unrelated unstated checks as
  interchangeable would let one silently replace the other.
- It runs detached from the task loop, like the improvement collector: it never
  participates in the running task's decisions, it runs at most once per session
  per gate-state transition, and a gatekeeper failure leaves the gate exactly as
  it was — an unwritable gate is never an aborted run.
- Every write emits a `verifier_gate_written` timeline event carrying the
  before/after `verifier:` section and the reason for the change, and the change
  is named in the run's report so the user learns their gate moved.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The persona resolves with its own prompt and model slot, falling back through the existing chain when the slot is unset | Persona registry / model resolution | `tests/unit/test_gatekeeper_persona.py`, `tests/unit/test_persona_runtime_resolution.py` |
| Unit | A write replaces only the `verifier:` section and preserves the rest of the file; an untracked workspace gets a `.bak` first; a proposed weakening (dropped role, lowered severity) is rejected and routed to a proposal | Gate writer API | `tests/unit/verifier/test_gate_writer.py` |
| Integration | A gatekeeper failure leaves the gate unchanged and the run unaffected; a successful write emits `verifier_gate_written` with the section diff | Gatekeeper → config → timeline | `tests/integration/test_verifier_gate_lifecycle.py` |
| User-flow E2E | Covered by the SWR-2615 authoring flow (the written gate is visible to the user and binds the next run) | Public product boundary → user-observable result | shared with SWR-2615 |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
