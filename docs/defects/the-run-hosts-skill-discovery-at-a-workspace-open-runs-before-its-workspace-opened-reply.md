## The run host's skill discovery at a workspace open runs before its workspace.opened reply

The run host's `workspace.opened` case warms the skill catalogue with `queueMicrotask(() => skills.catalog(root))`, and its
comment says the warm-up is "Warmed off the reply so it cannot delay the open". The claim is false. `dispatch` is an `async`
function, and `index.ts` attaches `.then((r) => reply(id, r))` to its promise. The reply's reaction job is queued after the
microtask that `queueMicrotask` queued first. The microtask holds the synchronous `discoverSkills` walk. So the reply is posted
only after the whole discovery has run, and a slow discovery is a slow reply. Node 24.18 on this host showed the ordering
(2026-10-20, with the same `async` shape and a 300 ms busy callback): "catalog done" printed first, then the reply at 310 to 320 ms.

That is the likely trigger of the timeout repaired in
[`a-workspace-opened-timeout-is-an-unhandled-main-rejection.md`](fixed/a-workspace-opened-timeout-is-an-unhandled-main-rejection.md).
`compression-proof`'s `automatic` launch logged skill discovery at 8,201.5 ms beside the full test suite, and main's bound on
`workspace.opened` is 5,000 ms. Main now handles a missed reply (a warning, an unacknowledged hand-off). But under load the
open still loses its slot (initialization resolution, the board's queue, the hook review, the configuration's load) whenever
discovery takes longer than the bound. Recorded by bundle `loc1-main-rejection`, not repaired: that repair was the
unhandled rejection alone. Moving the warm-up past the reply (a macrotask, or after `reply` is called) is the obvious repair.
Whether it is wanted, and what a late reply owes, is [OQ-386](../architecture/open-questions/67-spikes-and-later-questions-34.md#oq-386)'s.

## Specs

REQ-WORKSPACE-058 (ADR-0063): "discovery runs automatically on workspace open with no user action". It does not ask for the
open to wait on it. REQ-WORKSPACE-141 puts initialization resolution in the open's slot, and that slot is lost when the reply
misses its bound. The falsified claim is the code comment's. No requirement contradicts it.

## Relevant files

- `apps/desktop/src/run-host/dispatch.ts`: the `workspace.opened` case and its `queueMicrotask` warm-up.
- `apps/desktop/src/run-host/index.ts`: `dispatch(req.data, h).then((r) => reply(...))`, the reply queued after the warm-up.
- `apps/desktop/src/run-host/skills.ts`: `catalog`, the synchronous discovery and its "discovered in … ms" line.
- `apps/desktop/src/main/workspace-handoff.ts`: main's 5,000 ms bound and what a missed reply now does.
