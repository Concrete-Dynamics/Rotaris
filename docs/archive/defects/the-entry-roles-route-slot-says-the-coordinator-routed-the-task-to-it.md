## The entry role's ROUTE slot says the coordinator routed the task to it

Every playbook the run renders comes from `resolvePlaybooks`, which renders every role in the vocabulary, the entry role
included, through the same `resolveCell`. No built-in row names a ROUTE variant, so every routed cell, the entry role's
too, takes the slot's default `routed`, whose text addresses a specialist a coordinator delegated to: "Your assignment is
inside the standard flow: the coordinator routed it to you by need and the rest of the run expects the outcome named in
the task." The entry role is the coordinator, and nothing routed the request to it: the user sent it. On a run the
intent-to-tools mapping grants the direct-work bundle ([`PD-ORCH-006`](../../product/directives/pd-orch-006.md#pd-orch-006)) the same
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

## Outcome — repaired 2026-10-06 (finacc3, bundle `finacc3-accept1-8`)

The catalogue gains a third ROUTE variant, `entry` ("Your assignment is the request itself: it came to you from the user,
not from a coordinator, and the outcome the run reports rests with you."), worded to hold on a coordinating run and on a
direct-work one alike. `entryCell` (`packages/engine/src/playbooks/matrix.ts`) gives a cell that resolves `routed` the
`entry` variant and leaves a not-routed cell its narrow text (REQ-ORCH-023). `resolvePlaybooks` renders each role twice,
`perRole` as a delegated child of the role is given it and `asEntry` as the run's entry role is given it; the pre-flight's
`playbookFor(role, asEntry)` hands the root turn (`Run`, `packages/engine/src/run/run.ts`) the entry form, every delegated
child keeps `routed` (a delegated `orchestrator` included, which a coordinator did route), and the launch audit records the
entry role's cell as the root was given it, ROUTE `entry` (REQ-ORCH-027). The BUDGET clamp is read from the same row and
is unchanged.

*Corrected in place by repair round 1 (the verifier's blocking finding):* the sentence above held only for a run whose
entry persona is `orchestrator`. The pre-flight (`apps/desktop/src/run-host/intent.ts`) took the entry role as the literal
`'orchestrator'` while the root turn asks for `playbookFor(config.persona, true)`, `config.persona` being the run's
`default_persona` (which the composer sets per run) or the open iteration's root persona a continue restores. A run
started as `coding-agent` was given ROUTE `entry`, audited with `routed` for `coding-agent` and with an `entry` cell for
`orchestrator` that no agent received, and clamped by the orchestrator's BUDGET cell (REQ-ORCH-024, the older half of
the same literal). Now `PreflightDeps.entryRole` carries the persona the root runs on (`run.model.config.persona`, from
`apps/desktop/src/run-host/host.ts`), and it names the audited entry cell, the root's form and the BUDGET row alike; an
entry persona with no row (REQ-ORCH-023) has no cell and so no budget, and the configured child policy stands unchanged
(`resolvePlaybooks`, `budgetTier` `none`), where it had clamped at `normal`. Pinned by
`apps/desktop/src/run-host/intent.test.ts` (an entry persona of `coding-agent`: its audited cell and text are the
root's entry form, the orchestrator's is `routed`, the clamp is `coding-agent`'s `normal`, not the orchestrator's
`tight`) and `packages/engine/src/playbooks/playbooks.test.ts` (no entry row, no clamp), both red before. The variant is in the catalogue the settings interface lists, so an override may re-word it (REQ-ORCH-026).

**Pinned by** `packages/engine/src/playbooks/playbooks.test.ts` (the entry form on a coordinating, a direct-work and an
answer intent; a delegated child keeps `routed`; an override re-words `entry` with no warning; a not-routed entry cell
stays narrow), `apps/desktop/src/run-host/intent.test.ts` (the pre-flight's root and child forms and the audit cell) and
`packages/engine/src/run/preflight.test.ts` (the root's request carries the entry form, never the routed one, on a
coordinating and a direct-work run). All four cases were red on the code before the repair. **Shown by** `pnpm
fetch-proof`, whose `explicit_trivial` launch now also reads the root's ROUTE line from the instructions the model port
received (green, load about 1), and by the live run's `frictions` scenario, which now reads the root's requests from the
recorded traffic: against the pack of `c2fdd6a` the check reads 5 of 5 root requests misrouted; on this build
(`pnpm live-run --confirm --skip-build --only=frictions`, endpoint `katalyst`, pack `2026-10-06T22-08-32-573Z`) it passed,
"4 root request(s)", and the scenario passed whole.
