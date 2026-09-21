## The retrospective reads instruction files the user switched off

`PD-WORKSPACE-002` gave every instruction file a per-file on/off switch and widened discovery past the
workspace root. The workspace-context injection honours both: `enabledInstructionFiles` drops a file the
user switched off, and the master switch `inject_agents_md` drops all of them.

The improvement collector's retrospective pass does not. It holds its own copy of the file names —
`const INSTRUCTION_FILES = ["AGENTS.md", "AGENTS.override.md"]` — reads them straight from the workspace
root, and consults no policy at all. A user who switches `AGENTS.md` off to keep it out of what agents are
given still has its text read into the retrospective's context and cited as evidence, and may still be
offered an `agents_md_update` proposal against a file the product has been told not to use. The master
switch has the same hole: `inject_agents_md: false` stops injection and does not stop this read.

The two halves also now disagree about what an instruction file *is*. The retrospective knows two names at
one location; discovery knows four names at the workspace root and two at each of five further bases.

## Specs

`PD-LIBRARY-002` extends `REQ-WORKSPACE-041` so that the retrospective may read the file that requirement
discovers, explicitly on that requirement's discovery rule — "the two names, the workspace root, nothing
else — governs that read unchanged". `PD-WORKSPACE-002` has since **narrowed** `REQ-WORKSPACE-041`, so the
rule the retrospective was pointed at no longer says what it said, and `REQ-WORKSPACE-048`'s master switch
plus the directive's per-file policy now govern what may be read. Neither reaches this code path.

Whether the retrospective *should* honour the switches is not settled by either directive: a switch stated
as controlling "what agents are given" is not obviously a switch over what an analysis may cite. That
question belongs to the owner. What is a defect either way is that the two readers of the same files no
longer agree on the file set, and that nothing says which is intended.

## Relevant files

- `packages/engine/src/improvements/retrospective.ts` — `INSTRUCTION_FILES` and the read that uses it.
- `packages/config/src/instructions.ts` — `discoverInstructionFiles`, `enabledInstructionFiles` and
  `mergeInstructionContext`: the discovery, the policy and the merge the injection uses.
- `apps/desktop/src/run-host/skills.ts` — `workspaceContext`, which reads the policy and applies the
  master switch; the pattern a repair would follow.
- `docs/product/directives.md` — `PD-WORKSPACE-002` (the switches) and `PD-LIBRARY-002` (the read).
