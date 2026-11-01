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
`packages/config/src/skills/skills.test.ts` ("OQ-386 — the asynchronous walk reaches the synchronous walk's discovery"). ~~No proof
was run on the built app for this repair, so the 8,201.5 ms launch has not been measured again.~~ Re-measured 2026-11-01 (below).

**Reworked after an independent review, 2026-10-31, before it landed.** Four faults of the first build, none ever on `main`.
`settled` handed back the raw walk, so a read that never returned held every `skills.*` request for that root with no bound
(ADR-0002 consequence 11): the wait now ends after `WARM_UP_WAIT_BOUND` (6 s) on the timer port, the walk is abandoned and
said once at `warn`, and the waiting request reads the catalogue as a cold ask does — one request may pay a slow cold walk,
and no request waits on that walk again. OQ-279's refusal had moved behind the wait: it is read first again and answered at
once (`skillsAnswerSettled`). A walk a clear overtook kept reading beside the next one: `discoverSkillsAsync` takes a
`stopped` predicate, and a superseded or abandoned walk starts no further read (`DiscoveryStopped`). And the new cases keyed
their trees on POSIX paths, which `node:path` writes otherwise on Windows (the PR's `gate (pnpm check)` was red on
`windows-latest` only): the fixtures now normalise every path they are asked, as `packages/config`'s `ports()` does. Each
repair has a case red without it, and `warm`'s early return over a held catalogue gained the case it lacked.

**Reworked again after a second review, 2026-10-31, before it landed: the bound no longer walks on the loop.** ~~When the wait
reached the bound, the walk was abandoned and the waiting request read the catalogue as a cold ask does.~~ That was a
synchronous walk on the loop, in the slow-disk case this repair exists for, and the ruling excludes it. A request still waiting
at the bound (now 9 s, just under main's tightest, since no walk has to fit after it) is refused with `skills.discovering`,
"The portable skills are still being discovered. Try again in a moment."; the overrun is said once at `warn`; the walk goes on
and stores its catalogue for the next request. A request also no longer waits where a catalogue is already held. Pinned by "a
skills.read waiting on a warm-up past the bound is refused without one synchronous read", red on the fall-through. What the
refusal costs: `renderer/main.tsx` reads a refused `skills.read` as no catalogue (the composer) and no projection (Settings), and
nothing there re-reads when the walk ends, so on a disk slower than the bound the surface stays so until its next read. A failed
walk still lets its waiter discover on a cold cache, synchronously, as any cold ask does.

**Re-measured on the built app, 2026-11-01** (`5e380705`, Windows 11 ARM64, Node 26.13.0). `compression-proof`'s `automatic` launch logged its first discovery at 9.0 ms and no presenter lapse. That is not a like-for-like reading of the 8,201.5 ms: the tree held one skill and one skip, on an otherwise quiet host, and the old figure was taken beside the full test suite. The launch's reply no longer waits on the walk by construction; the slow case itself stays measured only in the unit cases. Of the 25 proofs `pnpm verify:plan` names, 20 were green. `fetch`, `injection`, `part-j` and `resilience` were red as notes under `docs/defects/` already record; `plan-gate` was red on a control build of `main` too, and has its own note. Two earlier `skills-proof` launches overran while the host was stalling (a 20 s typecheck took 400 minutes in the same stretch, which points at a suspended machine); it was green once the host stayed awake.

**Repaired after a third review, 2026-11-01.** ~~What the refusal costs: the surface stays empty until its next read.~~ Five findings, each confirmed in the code first. (1) A read that never returns kept its entry in `warming`, so every later request waited the bound and was told "in a moment": past `WARM_UP_STALL_BOUND` (60 s) the refusal is `skills.discovery-stalled`, says what is known, and meets a gesture at once. The walk is still not abandoned: no read can be cancelled, and a second walk would park beside it. (2) A refused `skills.read` drew "No portable skills were discovered." and cached `EMPTY_SKILLS_STATE` as `lastSkills`: both renderer readers now ask again until the walk ends (`askUntilDiscovered`), caching nothing meanwhile, and Settings draws `listNote` (being discovered, stalled, or the refusal met) in the list's place. Each ask waits in the run host, so there is no polling interval and no spin. (3) The 9 s bound refused a read main allows 15 s and left a gesture about 1 s: each wait is now main's bound less 3 s, from one statement in `contracts/skills.ts`, so a gesture now gives up at 7 s. (4) A stopped walk parked past the bound no longer logs that it goes on. (5) `DiscoveryStopped`'s comment no longer names abandonment. Each repair has a case red without it, across all four requests. Driving the built app over 200,000 empty skill folders then falsified the first version of (2): main's 15 s bound expired on `skills.read`, the rejection ended the re-asking, and the list stayed at "Discovering" after the walk ended. Main now answers `skills.no-reply`, asked past like the other two, and the catalogue landed with no gesture. The same drive found `shift` on the walk's queue linear, now a cursor (79.6 s to 41.4 s). The run host still gave no reply for about 36 s on that tree: [the note](../the-run-host-gives-no-reply-for-half-a-minute-opening-a-workspace-with-200000-skill-folders.md).

**Repaired after a fourth review, 2026-11-01.** Settings' re-asking had no end at unmount: only a new read, a rescan or a load retired it, and leaving Settings unmounts it (`AppShell` draws the active view alone), so on a wedged walk each visit left one more asker, each holding a run-host waiter and an IPC call. The effect's cleanup now retires the read (`readWhileMounted`); the ask already sent still runs to its answer, within main's bound, and no further one is made. A remount reads afresh. The composer's reader is bound once for the window and joins a read in flight (`readSkills`), so it stays one asker. Its cases are in `packages/ui/src/slash/skills.test.ts`; the wiring in `renderer/main.tsx` has no unit case.

**Still owed, and not decided by the ruling** (its "Recorded beside it, not decided here"). The synchronous re-discovery after a
session creation or a rescan still holds the run host's loop. `onSessionCreated` and `rescan` clear the catalogue, and the next
`SkillHost.catalog` call walks the tree with `discoverSkills` on the loop: the agent's construction (`contextUnits`,
`readRoots`) after a session creation, and `rescan` itself. This repair does not change that path. **A second path at launch,
which the ruling does not name:** a run started in an existing session during the warm-up reaches `SkillHost.catalog` through
`contextUnits` and `resolved` (`dispatch.ts`), a cold synchronous walk beside the warm-up in flight, and the warm-up's result is
then dropped (`if (!this.catalogs.has(workspaceRoot))`). It still holds the loop. Points 2 to 5 of the ruling
are main-side and owed as their own unit: the idempotent case, the second hand-off, the notice and the log levels.
