## A refused setup start is reported as "not a local launch"

`code-intelligence-setup`'s runner (`InitializationCoordinator.codeIntelligenceTask`) maps every refusal of
`setup.start` to REQ-WORKSPACE-094's non-retryable failure: error "This workspace's `code_intelligence` entry is not a
local launch, so its setup commands cannot be derived from it." and summary "Code intelligence project setup was
skipped: …". The run host refuses a start for other reasons too — `mcp.setup.running` ("A code-intelligence setup is
already running for this workspace; …", the run host holds one setup at a time), `workspace.unknown` and
`mcp.configuration` — and main's port turns each into `{ ok: false }`. A derivation that cannot be made is not refused at
all: the run host answers it with a finished status whose outcome is `unavailable`, which `resultOf` already maps to
REQ-WORKSPACE-094's words. So the refusal branch reports a transient condition as a permanent configuration fault, and
for a background run raises "Project setup did not finish" with the "was skipped" summary.

Seen in the built app on 2026-09-30 by `workspace-proof`'s scenario 8b on the build without the switch-time
cancellation: the replacement's background run was refused as already running while the outgoing workspace's setup
still ran, and the log read `code-intelligence-setup → failure — This workspace's `code_intelligence` entry is not a
local launch, …` for an entry that is a local launch. The repair of
`a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md` serialises the coordinator's own setups, so
two of its runs no longer collide, but a setup the MCP settings category starts (REQ-MCP-112) still takes the run host's
one slot, and a background run starting beside it is still refused this way. Found while repairing the switch-time cancellation under R-067; not repaired here.

## Specs

- REQ-WORKSPACE-094: the non-retryable "not a local launch" failure is for an entry that does not start the runtime
  locally, and for nothing else.
- REQ-WORKSPACE-093: a failure that is not that one is retryable, under this domain's per-stage reasons.
- REQ-WORKSPACE-103: the background banner carries the task's own summary, which here misstates what happened.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `codeIntelligenceTask`'s `run`: `if (!started.ok) return this.failure(NOT_A_LOCAL_LAUNCH_ERROR, NOT_A_LOCAL_LAUNCH_SUMMARY, false, [])`.
- `apps/desktop/src/main/index.ts` — the setup port's `start`, which turns every `refused` reply into `{ ok: false, reason }`.
- `apps/desktop/src/run-host/dispatch.ts` — `mcp.setup`'s three refusals; `apps/desktop/src/run-host/mcp.ts` — `startSetup`'s one-at-a-time refusal.

## Outcome — repaired 2026-10-01 (R-067)

Main's setup port now carries a refusal's code with its words (`{ ok: false, code, reason }`; `workspace.none` for no
window to address it through, the answer's kind for an unexpected one), and `codeIntelligenceTask`'s `run` reports a
refused start as a retryable failure: REQ-WORKSPACE-093's summary "Code intelligence setup did not complete for this
project. It runs again the next time this workspace is opened.", error "Code intelligence could not complete this
project's setup: {the refusal's own words}", and a warning in the log naming the code. REQ-WORKSPACE-094's words are
left to the one case they name, the run host's finished `unavailable` status, which `resultOf` maps as before. The
reason for a setup that began no stage is the build's, and [OQ-167](../../architecture/open-questions.md) asks for the
specification's; a refused start is not waited out (the same question asks whether it should be).

Pinned by `apps/desktop/src/main/initialization.test.ts`: "fails retryably, in its own words, when the run host refuses
the start" for `mcp.setup.running`, `workspace.unknown` and `mcp.configuration` (red on the code before: retryable was
`false`), and "fails non-retryably when the entry is not a local launch" now drives the `unavailable` status the run host
actually answers rather than a refusal. Shown by `workspace-proof`'s new scenario 8c (the open's background run
cancelled, the MCP category's setup started and holding `create`, then Initialize): on a build of the code before, the
check failed with `code-intelligence-setup → failure — This workspace's `code_intelligence` entry is not a local launch,
…`, retryable `false`; on the repair it passed (40 passed, 0 failed, 2 skipped), the log reading `the run host refused
code-intelligence-setup's setup start for …/init-held (mcp.setup.running: A code-intelligence setup is already running for
this workspace; …)` and `code-intelligence-setup → failure — Code intelligence could not complete this project's setup: A
code-intelligence setup is already running for this workspace; wait for it to finish or cancel it first.`
