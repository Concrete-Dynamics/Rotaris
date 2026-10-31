## The run host's skill discovery at a workspace open runs before its workspace.opened reply

The run host's `workspace.opened` case warms the skill catalogue with `queueMicrotask(() => skills.catalog(root))`, and its
comment says the warm-up is "Warmed off the reply so it cannot delay the open". The claim is false. `dispatch` is an `async`
function, and `index.ts` attaches `.then((r) => reply(id, r))` to its promise. The reply's reaction job is queued after the
microtask that `queueMicrotask` queued first. The microtask holds the synchronous `discoverSkills` walk. So the reply is posted
only after the whole discovery has run, and a slow discovery is a slow reply. Node 24.18 on this host showed the ordering
(2026-10-20, with the same `async` shape and a 300 ms busy callback): "catalog done" printed first, then the reply at 310 to 320 ms.

That is the likely trigger of the timeout repaired in
[`a-workspace-opened-timeout-is-an-unhandled-main-rejection.md`](a-workspace-opened-timeout-is-an-unhandled-main-rejection.md).
`compression-proof`'s `automatic` launch logged skill discovery at 8,201.5 ms beside the full test suite, and main's bound on
`workspace.opened` is 5,000 ms. Main now handles a missed reply (a warning, an unacknowledged hand-off). But under load the
open still loses its slot (initialization resolution, the board's queue, the hook review, the configuration's load) whenever
discovery takes longer than the bound. Recorded by bundle `loc1-main-rejection`, not repaired: that repair was the
unhandled rejection alone. Moving the warm-up past the reply (a macrotask, or after `reply` is called) is the obvious repair.
Whether it is wanted, and what a late reply owes, is [OQ-386](../../architecture/open-questions/67-spikes-and-later-questions-34.md#oq-386)'s.

## Specs

REQ-WORKSPACE-058 (ADR-0063): "discovery runs automatically on workspace open with no user action". It does not ask for the
open to wait on it. REQ-WORKSPACE-141 puts initialization resolution in the open's slot, and that slot is lost when the reply
misses its bound. The falsified claim is the code comment's. No requirement contradicts it.

## Relevant files

- `apps/desktop/src/run-host/dispatch.ts`: the `workspace.opened` case and its `queueMicrotask` warm-up.
- `apps/desktop/src/run-host/index.ts`: `dispatch(req.data, h).then((r) => reply(...))`, the reply queued after the warm-up.
- `apps/desktop/src/run-host/skills.ts`: `catalog`, the synchronous discovery and its "discovered in … ms" line.
- `apps/desktop/src/main/workspace-handoff.ts`: main's 5,000 ms bound and what a missed reply now does.

## Outcome (2026-10-31, branch `fix/workspace-open-warmup-off-the-loop`) — repaired, the open's warm-up only

Built as [OQ-386](../../architecture/open-questions/67-spikes-and-later-questions-34.md#oq-386)'s point 1 rules it (ruled
2026-10-21), and nothing of its points 2 to 5.

- **After the reply.** The `workspace.opened` case starts the warm-up from a zero-delay timer on its clock port
  (`clocks.timers.after(millis(0), …)`), which runs after `index.ts` has posted the reply. The falsified comment is kept beside
  its replacement in `dispatch.ts`.
- **Off the loop.** The warm-up (`SkillHost.warm`) reads the tree through `discoverSkillsAsync`
  (`packages/config/src/skills/discover.ts`), over injectable asynchronous ports (`AsyncDiscoveryPorts`,
  `NODE_ASYNC_DISCOVERY_PORTS` over `node:fs/promises`). It reaches the same discovery as `discoverSkills`, because the two
  walks share every rule after the reads: the four questions asked of a child in one order, and one fold (`Admitted`) for
  first-location-wins, `shadowed`, the skip reasons, the strict decoder's reason and the manifest's warning. The `.git` ladder
  is still `roots.ts`'s `skillRoots`, handed the answers the walk asked for asynchronously.
- **A few reads at a time.** At most `DISCOVERY_READS_IN_FLIGHT` (4) port calls are in flight: libuv's default thread pool,
  which the run host shares with the store and the tools.
- **The generation guard.** A rescan and a session creation advance the root's generation. A warm-up stores its catalogue
  only under the generation it began in, and otherwise logs that it was set aside.
- **One walk.** `skills.read`, `skills.forceLoad`, `skills.loadFile` and `skills.list` wait for a warm-up in flight
  (`SkillHost.settled`), and answer as before. A warm-up that fails still releases them: it logs the failure at `warn`, and
  the waiting request discovers on a cold cache, as any cold ask does.

Pinned by `apps/desktop/src/run-host/dispatch.test.ts` ("the run host answers workspace.opened before it warms the skill
catalogue, off its loop"). Its first case is red on the `queueMicrotask` warm-up: fifteen synchronous port calls stood ahead of
the posted reply. The generation cases are red with the guard removed. The equality of the two walks is pinned by
`packages/config/src/skills/skills.test.ts` ("OQ-386 — the asynchronous walk reaches the synchronous walk's discovery"). No proof
was run on the built app for this repair, so the 8,201.5 ms launch has not been measured again.

**Still owed, and not decided by the ruling** (its "Recorded beside it, not decided here"). The synchronous re-discovery after a
session creation or a rescan still holds the run host's loop. `onSessionCreated` and `rescan` clear the catalogue, and the next
`SkillHost.catalog` call walks the tree with `discoverSkills` on the loop: the agent's construction (`contextUnits`,
`readRoots`) after a session creation, and `rescan` itself. This repair does not change that path. Points 2 to 5 of the ruling
are main-side and owed as their own unit: the idempotent case, the second hand-off, the notice and the log levels.
