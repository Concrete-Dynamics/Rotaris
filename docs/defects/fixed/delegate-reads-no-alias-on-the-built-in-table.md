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

## Repaired 2026-09-30 under R-067 (acceptance finding A27)

**Confirmed first.** A case building `IterationChildren` with no persona catalogue and a held plan gate (withholding
`write_file`, `haet_edit`, `haet` and `terminal`) had `delegate({persona: 'coder'})` accepted `queued` on the unrepaired
code, where REQ-ORCH-153 refuses it. The model key this note names was not observably wrong on this path: a built-in
persona names no model, so `childModelKey` gave the run's key with or without the persona.

**What changed.** `personaOf` (`packages/engine/src/children/orchestration.ts`) resolves through `resolveRole` where no
catalogue is configured — the ledger's own resolution — so every reader at the head of `delegate` reads the role the ledger
will spawn: the plan gate's admission refusal, `grantedTools` and `modelKey`. The write-scope refusal, which had read
`resolveRole` beside `personaOf` since the D6 repair, now reads `personaOf` like the rest, and so does the delegating
agent's persona for `tool_restrictions`.

**Pinned by** `packages/engine/src/children/children.test.ts`, "REQ-ORCH-034 / REQ-ORCH-153 (the repair of
delegate-reads-no-alias-on-the-built-in-table): …": `coder` and `playwright` are refused while the gate holds, naming the
withheld tools, with no record; released, `coder` is accepted as `coding-agent` with that role's `granted_tools`. It fails on
the unrepaired code. The earlier alias case for the write-scope refusal still passes. The first execution is reported in
`docs/architecture/adr/0062-the-plan-gate-as-a-run-segment.md` and its row is in `docs/architecture/first-executions.md`.
No proof or live-run scenario shows it: the run host always supplies a configured persona resolver, which resolved aliases
already, so the built app never takes this path.
