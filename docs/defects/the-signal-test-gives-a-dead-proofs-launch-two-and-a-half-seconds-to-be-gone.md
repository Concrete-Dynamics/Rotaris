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
