## A held run is never told it is producing a plan, so it tries to do the work and asks for approval in the conversation

`Run.parkAtPlanGate` takes exactly one turn and treats that turn's final text as the plan
(`packages/engine/src/run/run.ts`). On the first cycle the task it gives that turn is the
user's own prompt, unchanged. Nothing in the turn said a plan was what was wanted, that the
final message *is* the plan, or that the decision is taken in the product — so the entry role
read the prompt as what it says and set about doing the work.

Observed live on 2026-09-16 (session `6696f6ed`, eighteen minutes, 592k prompt tokens, one
plan cycle opened at the very end):

- the orchestrator issued withheld call after withheld call, each refused with
  `plan_gate_withheld` whose only remedy read *"Finish the plan; the user's approval releases
  these tools"* — advice a role that believes it is working cannot act on, because no visible
  mechanism "finishes" anything;
- it then asked the user for approval through `ask_questions`, the user answered
  **"Approve — implement SPEC-0011"**, and nothing happened: that answer settles a tool call
  (`Sessions.answerQuestions` → `PendingQuestions.resolve`) and never reaches
  `Sessions.planDecision`. The two paths share no state, correctly — but the role had no way
  to know which one the product reads;
- three `delegate` calls to an implementer role were rejected, each with the same sentence;
- the user stopped the run rather than answer a second time.

Every part of the mechanism did what its requirement says. What was missing was the telling.

## Specs

- `REQ-ORCH-153` — "the run MUST produce a plan"; the plan is presented verbatim as the
  producing role wrote it, and the three answers are the user's, taken in the product. A run
  that never learns it is at the gate cannot satisfy the first clause except by accident.
- `REQ-ORCH-154` — the revise cycle is told what it inherits (`planSection`); the first cycle
  was told nothing, which is the asymmetry this note is about.
- `REQ-TOOLS-013` — a refusal states why the call was not executed; a remedy that names no
  act the role can perform is a refusal that does not discharge that requirement in substance.
- `REQ-TOOLS-157/158`, `REQ-CHAT-092..097` — `ask_questions` is a question channel. It is
  correctly not withheld at the gate (it declares no facet), and correctly approves nothing.

## Relevant files

- `packages/engine/src/run/plan-text.ts` — new; holds `planRequestSection` (what a cycle is
  asked for) beside `planSection` (what it is handed back). It lives under `run/` rather than
  beside the session manager because `sessions.ts` imports the run and the run now needs the
  first of the two.
- `packages/engine/src/run/run.ts` — `parkAtPlanGate` wraps the task **and** the initial
  content parts. The content matters: an initial turn built from `taskContent` never reads the
  task string, and `Sessions.start` always builds one, so wrapping the string alone would have
  changed nothing the model sees. `turn()` gained a content override for this.
- `packages/engine/src/sessions.ts` — `planSection` moved out; re-exported so the package's
  surface is unchanged.
- `packages/agent-tools/src/planning-grants.ts` — `planGateRefusal`'s remedy now names the
  act: write the plan as the final message of this turn and stop.
- `packages/engine/src/children/orchestration.ts` — the child-admission refusal carries the
  same remedy, for the same reason.

## Repaired — 2026-09-16

Regression tests: `packages/engine/src/run/plan-gate.test.ts` — "the producing role is told
what a plan cycle is: the task carries the request, and so does the content", which reads the
scripted client's first request and asserts both the request and the user's own prompt reached
it, in that order. `packages/agent-tools/src/gate.test.ts` — "the remedy names the act that
ends the hold, not the state".
