## The instruction-discovery tests read the machine's own `/etc/codex`

`PD-WORKSPACE-002`'s machine-wide base is `/etc/codex` on every platform with an `/etc` hierarchy, and
`discoverInstructionFiles` joined that path as a literal. Every test that runs discovery with `platform: 'linux'` —
the inventory cases in `snapshot.test.ts` and the workspace-context cases in `skills.test.ts` — therefore read the
real `/etc/codex` of whatever host ran them. The scratch global directory and scratch home isolated four of the five
bases, not the fifth. On a Linux machine that holds `/etc/codex/AGENTS.md` (the OpenAI Codex CLI's own location, so
not an exotic one) the exact-list assertions fail, and a context assertion passes or fails on what that file says.

The same literal meant no built-app proof could lay a file down at the machine-wide base without writing into the
machine's `/etc`, which is how it was found: building `pnpm injection-proof` (first-release-plan §3.3), which must
place an instruction file at every base, 2026-09-27.

## Specs

None contradicted: the product reads `/etc/codex` exactly as `PD-WORKSPACE-002` directs. The defect is the tests'
isolation, not the product's behaviour.

## Relevant files

- `packages/config/src/instructions.ts`: `discoverInstructionFiles`, the machine-wide base's path.
- `packages/config/src/snapshot.test.ts`: the inventory cases and their `isolated()` env.
- `apps/desktop/src/run-host/skills.test.ts`: `contextHost`, the workspace-context cases.

## Repaired — 2026-09-27

`InstructionDiscoveryEnv` gains `machineDir`, `/etc/codex` when absent. It moves the directory and nothing else: the
base keeps its identity (`machine-codex:`), its label and its platform rule, so Windows reads no machine-wide file
whatever it names. The tests name a scratch directory for it, and one new case in each file pins the redirect. The
built app reaches it only through `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, which is compiled out of a packaged build.
