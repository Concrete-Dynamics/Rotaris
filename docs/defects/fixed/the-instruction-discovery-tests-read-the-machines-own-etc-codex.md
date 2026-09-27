## The instruction-discovery tests read the machine's own `/etc/codex`

`PD-WORKSPACE-002`'s machine-wide base is `/etc/codex` on every platform with an `/etc` hierarchy, and
`discoverInstructionFiles` joined that path as a literal. Every test that runs discovery on such a platform — the
inventory cases in `snapshot.test.ts`, the workspace-context cases in `skills.test.ts`, and the skill-catalog cases in
the same file, because `contextUnits` always runs instruction discovery too — therefore read the real `/etc/codex` of
whatever host ran them. The scratch global directory and scratch home isolated four of the five bases, not the fifth.
On a Linux machine that holds `/etc/codex/AGENTS.md` (the OpenAI Codex CLI's own location, so not an exotic one) the
exact-list assertions fail, and a context assertion passes or fails on what that file says. Measured by bind-mounting
a private `/etc` holding `codex/AGENTS.md` over the real one (`unshare -m`): three catalog cases failed —
REQ-WORKSPACE-064 (`toEqual([])`), REQ-WORKSPACE-060/061 (`toHaveLength(2)`) and REQ-WORKSPACE-062 (`toEqual([])`).

The same literal meant no built-app proof could lay a file down at the machine-wide base without writing into the
machine's `/etc`, which is how it was found: building `pnpm injection-proof` (first-release-plan §3.3), which must
place an instruction file at every base, 2026-09-27.

## Specs

None contradicted: the product reads `/etc/codex` exactly as `PD-WORKSPACE-002` directs. The defect is the tests'
isolation, not the product's behaviour.

## Relevant files

- `packages/config/src/instructions.ts`: `discoverInstructionFiles`, the machine-wide base's path.
- `packages/config/src/snapshot.test.ts`: the inventory cases and their `isolated()` env.
- `apps/desktop/src/run-host/skills.test.ts`: `contextHost`, the workspace-context cases; `host()`, the catalog cases.

## Repaired — 2026-09-27

`InstructionDiscoveryEnv` gains `machineDir`, `/etc/codex` when absent. It moves the directory and nothing else: the
base keeps its identity (`machine-codex:`), its label and its platform rule, so Windows reads no machine-wide file
whatever it names. The built app reaches it only through `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, which is compiled
out of a packaged build.

**The first repair was partial, and the note was moved here too early.** It gave a scratch directory to
`snapshot.test.ts`'s `isolated()` and to `skills.test.ts`'s `contextHost`, but not to the older `host()` helper the
catalog cases use, so the three cases above still read the real `/etc/codex`. The gate's verification found it the
way this note describes, with an `/etc/codex/AGENTS.md` in place. `host()` now names `join(home, 'machine')` as
`contextHost` does, and the same private-`/etc` run passes all 311 cases across `packages/config`, the run host, the
workspace service and the retrospective.

**Why the first repair could miss it, and what now catches it.** Every assertion above fails only on a host that
*holds* the file, and the host that repaired it holds none. So `skills.test.ts` gains a case that records every
instruction-file probe both helpers make, with the platform pinned to `linux`, and asserts that the machine-wide base
was consulted at the scratch directory and never under the real `/etc/codex`. It goes red on any host when either
helper loses its `machineDir` (checked by removing it from `host()`). One case in each file pins the redirect itself.

**What this note does not cover.** The skill search's own machine-wide root, `/etc/codex/skills`, is a separate
literal with no seam. With a skill there, three catalog cases still fail. That gap is open, with the proofs'
equivalent, in
[`three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`](../three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md).
