## The entry role's ROUTE slot says the coordinator routed the task to it

Every playbook the run renders comes from `resolvePlaybooks`, which renders every role in the vocabulary, the entry role
included, through the same `resolveCell`. No built-in row names a ROUTE variant, so every routed cell, the entry role's
too, takes the slot's default `routed`, whose text addresses a specialist a coordinator delegated to: "Your assignment is
inside the standard flow: the coordinator routed it to you by need and the rest of the run expects the outcome named in
the task." The entry role is the coordinator, and nothing routed the request to it: the user sent it. On a run the
intent-to-tools mapping grants the direct-work bundle ([`PD-ORCH-006`](../product/directives.md#pd-orch-006)) the same
line sits beside the statement that the entry role does the work itself.

Found by the default live run at `c2fdd6a` (finding K3, 2026-10-06): every orchestrator request in all eight sessions
carried the line, the `frictions` scenario's direct-work request among them. No reasoning row cited it, so no cost was
measured. Recorded 2026-10-06 by acceptance round 1 of finacc3 (finding F13), before the repair.

## Specs

- REQ-ORCH-019: the rendered playbook is part of the instructions every role with a row is given, so the coordinator's
  instructions carry its ROUTE line.
- REQ-ORCH-020, REQ-ORCH-026: the eight slots and their semantics are fixed and the variant text is the product's own; the
  text the entry role is given describes a delegation that did not happen. No requirement fixes the wording, so nothing in
  the specification is contradicted outright: the line misstates the run to the model that reads it.
- PD-ORCH-006: a coordinator granted the direct-work bundle is told it does the work itself; the ROUTE line tells it a
  coordinator routed the work to it.

## Relevant files

- `packages/engine/src/playbooks/catalogue.ts` — the `ROUTE.routed` text and `SLOT_DEFAULT_VARIANT.ROUTE`.
- `packages/engine/src/playbooks/matrix.ts` — `resolveCell`, which fills every unnamed slot with its default variant.
- `packages/engine/src/playbooks/resolve.ts` — `resolvePlaybooks`, which renders the entry role like any other role.
- `apps/desktop/src/run-host/intent.ts` — the pre-flight's `playbookFor`, read by the root turn
  (`packages/engine/src/run/run.ts`) and by each delegated child (`packages/engine/src/children/orchestration.ts`).
