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
[`fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md`](fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md),
which counts an agent's place in the list as the environment names it (`position`) and so does not depend on this.
Not repaired there.

## Specs

None. The scripted client is verification only; no requirement says what a double's children take.

## Relevant files

- `apps/desktop/src/run-host/scripted-client.ts` — the `wait` branch in `stream`, which splices `scripts[who]`; `scripts.child`
  is one array for every child, and `calls[who]` (the `child` bucket) is overwritten by each child's counter.
- `apps/desktop/src/run-host/scripted-client.test.ts` — no case runs more than one child at a time.
- `apps/desktop/scripts/mission-proof.mjs` — the fan-outs scripted `wait:14000,read,answer`.
