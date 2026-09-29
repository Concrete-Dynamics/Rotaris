## `delegate` reads no alias on the built-in table's path

`IterationChildren.delegate` (`packages/engine/src/children/orchestration.ts`) looks the persona up through
`personaOf`, whose path for a run with no configured persona catalogue reads `BUILT_IN_PERSONAS[name]` and never
`ROLE_ALIASES`. The ledger resolves the same name through `resolveRole`, which honours the aliases. So on that path an
alias (`coder`, `playwright`) reads as no persona at admission and is then accepted by the ledger as its target
(`coding-agent`, `ui-verifier`). Three admission facts are taken from the missing persona:

- REQ-ORCH-153's admission refusal reads `persona?.tools ?? []`, so a held plan gate admits `playwright` (whose target
  holds `terminal`) or `coder` (which holds the file-writing tools). The tool gate's dispatch check still refuses each
  withheld call, so the child starts and fails call by call, the outcome the admission refusal exists to spare.
- The ledger row's `granted_tools` is recorded empty, and its model key is the run's model rather than the persona's.

The write-scope refusal of `PD-TOOLS-006` revision 3 met the same lookup and reads the ledger's resolution since
the D6 repair; the three uses above were left as they are. Noticed 2026-09-29 by the verification of that repair
(branch `fix-child-report`); recorded, not repaired.

## Specs

- `REQ-ORCH-153`: "While the gate is held the run MUST NOT spawn a child whose role holds such a tool". An alias names
  the role it resolves to.
- `REQ-ORCH-034`: "Role aliases MUST be resolved before spawn". Admission reads them unresolved on this path.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `personaOf`, and its reader at the head of `delegate` (the plan
  gate's check, `grantedTools`, `modelKey`).
- `packages/engine/src/children/personas.ts` — `resolveRole` and `ROLE_ALIASES`.
- `packages/engine/src/children/ledger.ts` — `ChildLedger.spawn`, which resolves through `resolveRole`.
