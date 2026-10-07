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
[OQ-216](../architecture/open-questions.md) under the owner's delegation (R-072), built as `PD-TOOLS-006` revision 4.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — `delegateTool`'s description, a fixed list of the built-in persona
  names.
- `apps/desktop/src/run-host/tools.ts` — `createToolPort`, where each agent's `delegate` executor is built and where a
  delegated child's grant is resolved.
- `packages/engine/src/children/personas.ts` — `ROUTING`, the built coordinator's routing table.
- `packages/engine/src/children/write-scope.ts` — `writesFiles` / `fileWriters`, revision 3's after-the-fact refusal.
