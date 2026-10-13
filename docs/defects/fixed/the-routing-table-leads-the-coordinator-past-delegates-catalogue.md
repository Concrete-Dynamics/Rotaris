## The routing table leads the coordinator past `delegate`'s catalogue

The coordinator gives the work a route implies to the route's persona whatever that persona's catalogue entry says. In the
duress live run at `a68f121` (pack `2026-10-07T07-09-30-708Z`, session `e6747bd0`; the duress autopsy's finding D3) all 35
coordinator requests carried `PD-TOOLS-006` revision 4's catalogue ("architect (reads workspace files)", "docs-writer (reads
workspace files, writes workspace files)" and "Ask a persona only for work its tools allow …"), and still:

- `#115`: request 71 delegated `docs/decisions.md` to `architect` with `write_scope ["docs/decisions.md"]` — the only routing in
  force was "design → architect". Revision 3's refusal answered in 170 ms, and request 77 (19.4 s) re-briefed a docs-writer.
- `#114`: d's brief said "`node --test` is available if you want to confirm a claim about the test run" to a docs-writer, which
  holds no terminal; d called `run_command` (`#164`), refused at the gate in a 2.5 s step (issues 3 and 4).
- 16 of 117 docs-writer requests carry a one-sentence missing-shell aside (a 2 of 11, c 3 of 24, d 9 of 41, e 2 of 41).

At `c2fdd6a` the same `docs/decisions.md` task went to `codebase-analyst` (`#107`): the misroute follows the route that matches
the subject. OQ-216's measured target for revision 4 was 0 such refusals and 0 such briefs; the run missed it (1 and 1).

## Specs

None contradicted. It misses `PD-TOOLS-006` revision 4's measured target (OQ-216). REQ-ORCH-028's routing table names the
persona whose judgement a need calls for and says nothing of who does the work a route implies; REQ-TOOLS-001's facets and
revision 4's catalogue say what each persona can do.

## Relevant files

- `packages/engine/src/children/personas.ts` — `ROUTING`, the coordinating instructions' routing table.
- `packages/agent-tools/src/tools/delegation.ts` — `renderDelegateCatalogue`, the catalogue's closing instruction.

## Outcome

Repaired 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`) as [OQ-250](../../architecture/open-questions.md) rules it,
`PD-TOOLS-006` revision 8: the routing table closes with one fixed sentence (`ROUTING_WORK_SENTENCE`,
`packages/engine/src/children/personas.ts`) sending the work a route implies to a persona whose catalogue entry allows it and the
route's persona's answer on to one that has the tools, and the catalogue's closing instruction forbids a brief offering a command
or tool the persona's entry lacks (`renderDelegateCatalogue`). Pinned by `packages/engine/src/children/personas.test.ts` and
`packages/agent-tools/src/tools/delegation.test.ts`, both red on the code before; the live run counts both measures
(`apps/desktop/scripts/lib/routing-misses.mjs`). The measure is the next duress live run, against OQ-216's target of zero.
