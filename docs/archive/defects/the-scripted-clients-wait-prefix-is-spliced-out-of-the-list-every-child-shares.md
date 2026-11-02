## The scripted client's wait prefix is spliced out of the list every child shares

The scripted client keeps one step list for every child (`ROTARIS_CHILD_SCRIPT`), and each child keeps its own place in
it by its TASK line. A `wait:<ms>` step is a prefix of the step after it: when the wait completes, the client removes it
from the list (`scripts[who].splice`) and takes the step that moved into its place. The list it splices is the one all
children share, so in a fan-out each child whose wait completes removes another entry: the first child's splice removes
the wait, the second's removes the step after it, the third's the step after that. With `wait:1000,read,answer` and three
children started together, the first child reads and the other two answer at once, where each was scripted to read.

Measured 2026-10-01 under the fin2 harness bundle, with a throwaway Vitest case over `scriptedClient` (three children with
the TASK lines `a`, `b` and `c`, all at their first call): the steps taken were `read_file`, `answer`, `answer`. The case
was not kept; it is the shape of the test a repair would add beside `scripted-client.test.ts`.

`mission-proof` scripts its three children `wait:14000,read,answer`, and `mcp-proof` and `artifacts-proof` delegate
several children; what each one's children actually took has not been read against this. The verification passes or
fails as it does today with the double as it stands, so a repair may move what those proofs see and has to run them.

Noticed 2026-10-01 while repairing
[`the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md`](the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md),
which counts an agent's place in the list as the environment names it (`position`) and so does not depend on this.
Not repaired there.

## Outcome — repaired 2026-10-02

Confirmed on `fin4-late-notes` (cut from `origin/main` 22fbe5e) before any change: the case below, run against the
unrepaired client, took `read_file`, `glob`, `answer` for the three children's first calls where each was scripted to
read. The defect is a verification double's alone, so it was fixable without a ruling.

The repair (`apps/desktop/src/run-host/scripted-client.ts`): the step lists are never changed after the client reads them.
A completed `wait:` now moves only the waiting agent's own counter (`calls[counterKey]`) past it, so the step after the
wait is taken in the same call and every other agent's place in the shared `scripts.child` is untouched. Each call is
indexed by its own counter key rather than by the shared `calls.child` bucket, which each child used to overwrite. The
separate `position` counter existed only because `calls` indexed the spliced list; with nothing spliced the two were
equal at every step, so `position` is gone and the ledger writes `calls[counterKey]`. The orchestrator's single list
takes the same steps as before: a spliced list indexed by an unmoved counter and an unspliced one indexed by a counter
moved past the wait name the same step at every call.

Pinned by `scripted-client.test.ts` — "a fan-out's children each take their own steps after a wait prefix, not each
other's": three children (`TASK: a`, `b`, `c`) scripted `wait:1000,read,glob` started together each take `read_file`
then `glob`, and a fourth started after them still waits first. It fails on the unrepaired client (`read_file`, `glob`,
`answer`); the other sixteen cases in the file pass unchanged.

Shown in the built app by `mission-proof` (as root under Xvfb, Node 24, `--skip-build` after `pnpm build`, exit 0, with
the other plan's agents on the host): the fan-outs scripted `wait:14000,read,answer` now record `alpha:read_file`,
`beta:read_file`, `gamma:read_file` in `tool_calls` for both `painted` and `parity`, where the shared list's splices had
given one child the read and the other two an answer. Every item of the proof passed. `mcp-proof` and `artifacts-proof`
script their children without a `wait:` (`mcp:alpha.echo,answer`, `answer`, `terminal:…`), and `chat-controls-proof`
and `palette-proof` delegate a single child, so a splice could not reach another child there; they were not re-run.

`mission-proof`'s own comments had described the spliced list as the double's intended shape: scenario 1 (`painted`)
said only the first child waits 14 s and the others finish at once, scenario 2 (`parity`) chose its probe times "once
the two quick children have settled", and scenario 4 (`cancel`) said the next two calls after alpha's delegation each
wait 16 s. On the repaired build the three children of scenarios 1 and 2 are all `running` at 6 s and through the
7.5–9.5 s parity probes. The comments now say so (and name `run-host/scripted-client.ts`, not `run-host/index.ts`), and
scenario 1's assertion now requires every row to be `running` at 6 s and every row's elapsed to advance, where it had
accepted any mix with one live row. Its settled-row check, which only a child that took another's answer could reach,
is gone: no row settles inside those probes now, and an ended agent's fixed figure stays pinned by
`packages/ui/src/agent-clock.test.ts`. Scenario 1b (`waiting`, one slot) now runs its three 14 s waits one after
another, about 42 s against its 120 s wait.

## Specs

None. The scripted client is verification only; no requirement says what a double's children take.

## Relevant files

- `apps/desktop/src/run-host/scripted-client.ts` — the `wait` branch in `stream`, which splices `scripts[who]`; `scripts.child`
  is one array for every child, and `calls[who]` (the `child` bucket) is overwritten by each child's counter.
- `apps/desktop/src/run-host/scripted-client.test.ts` — no case runs more than one child at a time.
- `apps/desktop/scripts/mission-proof.mjs` — the fan-outs scripted `wait:14000,read,answer`.
