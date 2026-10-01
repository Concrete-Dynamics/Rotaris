## The signal test gives a dead proof's launch two and a half seconds to be gone

`apps/desktop/scripts/lib/bounded-launch.test.ts`, "a proof that dies of %s mid-launch takes its spawnBounded launch with
it", signals a proof's process group and waits for the proof to die. It then polls `alive(launched)` at most 50 times,
50 ms apart, and asserts the launch is gone. That is 2.5 s of wall time on the host's timers. On 2026-10-01 the SIGHUP
case failed in a full `pnpm check` (`expected true to be false` at line 140, after the proof had died of the signal as
expected). The load average was about 10, with a second plan's agents running beside the gate. Re-run alone at a load
of about 7, the file passed, 12 of 12.

The bound counts wall time a loaded host does not give. `alive` may also report a launch that has exited but has not yet
been reaped, which a container's init can take longer to do under load. The test cannot tell "the launch outlived the
proof", the defect it guards, from "the launch died and was not yet reaped". Not repaired; noticed by the fin2 builder
while gating `fin2-grant-and-mcp-section`.

## Specs

None contradicted: a test's wait bound. R-062 (a proof's launch ends within its bound) is what the test guards.

## Relevant files

- `apps/desktop/scripts/lib/bounded-launch.test.ts`: the `for (let i = 0; i < 50 && alive(launched); …)` wait and
  `alive`.
- `apps/desktop/scripts/lib/bounded-launch.mjs`: the proof's signal handler that takes its launch with it.

## Repaired 2026-10-01 under R-062

**Confirmed first, by measurement rather than a red.** The test passed 6 of 6 runs beside ten busy loops (load 13.9)
and 8 of 8 beside a full `pnpm vitest run` and six busy loops (load 13.6 to 15.6), so the red did not reproduce on
demand. What did reproduce, every time, is what the bound was counting: replaying the test's own sequence (a proof
running `spawnBounded`, its group signalled, `/proc/<launch>/stat` polled every 5 ms from the proof's `exit`), the
launch was a zombie (`Z`, parent 1) at 0 ms in all six runs (SIGINT, SIGTERM, SIGHUP ×4) and gone only at 1,699 to
1,838 ms, when this container's PID 1 (`process_api`) reaped it. An orphan killed outside the test was reaped 0.9 to
1.6 s after its parent's exit at load 15. So the handler had done its work at once, and the 2.5 s bound was spent on
PID 1's reaping with about 0.7 s to spare; a host slow to reap fails it with nothing wrong. (The host also carries
a zombie of PID 1 aged 18 hours, so PID 1's reaping is not prompt in general.)

**What changed** (`apps/desktop/scripts/lib/bounded-launch.test.ts`, the test only; `bounded-launch.mjs` untouched):

- `alive` reads the state letter from `/proc/<pid>/stat` where `/proc` exists, and counts `Z` (and `X`) as gone; off
  Linux it keeps `kill(pid, 0)`. A zombie runs nothing and holds nothing but its pid, so "the launch outlived the
  proof", the defect the test guards, is told apart from "the launch died and was not yet reaped".
- Both 50 × 50 ms loops (the grandchild case and the signal case) are one deadline wait, `goneWithin(pid)`, of 15 s:
  inside the 30 s test timeout, so the bound asks that the launch dies, not how fast a loaded host reaps it.

**Pinned by** a new case, "counts a process that has exited but is not yet reaped as gone, where kill(pid, 0) still
finds it": `sh` execs into `sleep` over a child it never waits for, and the case asserts the child is `Z`, that
`kill(pid, 0)` still succeeds on it, and that `alive` says gone. With `alive` reverted to `kill(pid, 0)` it fails
(`expected true to be false`). **The bound still guards the handler:** with `track`'s handler removed from
`bounded-launch.mjs`, all three signal cases fail at the 15 s deadline (`expected false to be true`). The file passed
13 of 13 in each of 10 runs beside nine busy loops (load 11 to 13), and in the full `pnpm check`.
