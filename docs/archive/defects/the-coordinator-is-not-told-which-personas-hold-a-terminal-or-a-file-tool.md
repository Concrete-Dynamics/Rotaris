## The coordinator is not told which personas hold a terminal or a file tool

The coordinator routes work by need (REQ-ORCH-028's table), and nothing it reads states what each persona can do. The
built routing table and `delegate`'s description name personas only: the description was a fixed list of the built-in
names (`delegateTool`, `packages/agent-tools/src/tools/delegation.ts`), the same for every caller and whatever the
workspace's configuration made of each persona. So the coordinator writes briefs a child's tools cannot carry out.

In both duress live runs of 2026-10-06 the orchestrator told `docs-writer` children, which hold the read and write tools
and no `terminal` (`BUILT_IN_ROLE_TOOLS`, `packages/contracts/src/roles.ts`), to "Run `node --test` yourself in the
terminal":

- at `c2a9444` (finding N3), the two failed children, which held 2,443.5 s of the critical path, spent 22 of 57 and
  23 of 35 rows reasoning about the missing shell; one of them wrote `.tmp-run-tests.sh` as a workaround (finding N2),
  which only a later child removed, and the answer to the user said the continuation "ran the suite";
- at `c2fdd6a` (finding L4), the same brief appeared twice, a child called a `run_command` tool that does not exist, the
  coordinator wondered aloud whether `verifier` had a shell, and the answer blamed the timeouts on the missing shell.

Each run also spent 34 to 37 s of the coordinator's time on two `write_scope` refusals (PD-TOOLS-006 revision 3), which
teach the same fact after the call, for the one shape a structured field carries. A request to run a command sits in a
free-text brief, where no refusal can see it.

Live-run findings: L4 (`c2fdd6a` duress autopsy), N3 and N2 (`c2a9444` duress autopsy).

## Specs

None contradicted: REQ-ORCH-028 asks for a routing table from need to role and states no persona's tools, and
REQ-TOOLS-152 fixes `delegate`'s fields, not its description. The question is raised and ruled as
[OQ-216](../../architecture/open-questions.md) under the owner's delegation (R-072), built as `PD-TOOLS-006` revision 4.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — `delegateTool`'s description, a fixed list of the built-in persona
  names.
- `apps/desktop/src/run-host/tools.ts` — `createToolPort`, where each agent's `delegate` executor is built and where a
  delegated child's grant is resolved.
- `packages/engine/src/children/personas.ts` — `ROUTING`, the built coordinator's routing table.
- `packages/engine/src/children/write-scope.ts` — `writesFiles` / `fileWriters`, revision 3's after-the-fact refusal.

## Repaired — 2026-10-07, under OQ-216's ruling (PD-TOOLS-006 revision 4, R-072)

`delegate`'s description is built per calling agent. `createToolPort` (`apps/desktop/src/run-host/tools.ts`) hands
`delegateTool` the agent's catalogue, which `delegateCatalogue` resolves with `resolveAgentGrant`, the declared-to-granted
function a child's own port applies; `renderDelegateCatalogue` (`packages/agent-tools/src/tools/delegation.ts`) states each
persona's REQ-TOOLS-001 facets ("docs-writer (reads workspace files, writes workspace files)", "tester (reads workspace files,
writes workspace files, runs commands)", "verifier (reads workspace files, runs commands)", "codebase-analyst (reads workspace
files)"), the aliases, that tool-server and plugin tools are not described, and tells the caller to ask a persona only for
work its tools allow and to hand command output on through `depends_on` or `inherited_context`. The write-scope refusal is
unchanged. Pinned by the "delegate — what each persona can do" cases in `delegation.test.ts` (sixteen red on the fixed
description) and by the "PD-TOOLS-006 revision 4" cases in `apps/desktop/src/run-host/tools.test.ts`, which hold the facets told
equal to each child port's grant. The statement is advice: whether the impossible briefs stop is the next duress live run's
to show.

## Measured 2026-10-07

The duress live run at `a68f121` (session `e6747bd0`) measured the repair OQ-216 named. The catalogue reached 35 of 35
coordinator requests; one `write_scope` refusal remained (`#115`, `architect` given `docs/decisions.md`, refused in 170 ms) against
2 per run before, and one brief offered `node --test` to a docs-writer (`#114`, then `run_command` refused at the gate, `#164`)
against 2 to 3 before; 16 of 117 docs-writer requests carried a one-sentence missing-shell aside against 22 to 23 rows per failed
child before, and no impossible brief sat on a failed child's path. The target of zero was missed, and the remainder is recorded
as its own defect, ruled as OQ-250:
[`the-routing-table-leads-the-coordinator-past-delegates-catalogue.md`](the-routing-table-leads-the-coordinator-past-delegates-catalogue.md).
This note stays repaired: what it described, a coordinator told nothing of each persona's tools, no longer holds.

