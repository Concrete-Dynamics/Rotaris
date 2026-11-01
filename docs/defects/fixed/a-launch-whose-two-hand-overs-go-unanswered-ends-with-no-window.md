## A launch whose two hand-overs go unanswered ends with no window

A launch whose exclusive claim fails reads the instance record and hands over to the process it names (REQ-STARTUP-164
(2)). Since 2026-10-31, where that hand-over goes unanswered, clause (3)'s reclaim reads the record again and leaves it
when it names **another live claim** — a different process whose pid is alive on this machine, or a record naming
another machine or one that is malformed, which `isLockLive` counts as live (`packages/platform/src/instance.ts`,
`claimInstance`). Removing that record would let this launch become a second instance beside a process that is running,
which REQ-STARTUP-161 forbids. The retry then loses, and clause (4) hands over once more to the process the record names.

Where that process is live but does not answer — wedged, suspended, or slow past the interval — (4)'s second hand-over goes
unanswered too, and `claimInstance` returns `refused`. Main turns that into `app.exit(2)`: the launch ends with no window
of its own and no window surfaced in another process. The person who started it sees nothing.

Before 2026-10-31 the same state ended differently: (3) removed whatever record stood there, the retry won, and the launch
became a second instance beside the live holder — a window, but the outcome REQ-STARTUP-161 forbids outright. The present
behaviour starts no rival, which is what (4)'s letter asks. It does not meet the closing sentence of the same requirement.

Verified by the owner's probe on 2026-10-31 (real sockets and timers: a record naming a live holder that accepts and never
answers). Not repaired, and not ruled here: which sentence governs is a question for the specification, and a ruling is
owed: [OQ-461](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-461) raises it.

A related reading, raised in the same entry and also not ruled: (3) lists "a process that is running does not answer" among the reasons to reclaim.
For a record that has come to name a different live claim during the interval, the code leaves the record rather than
reclaiming it, on REQ-STARTUP-161's ground above.

## Specs

- REQ-STARTUP-164 (4): "this launch SHALL attempt the hand-over once more and SHALL then end, having in either case started
  no rival." The code does that.
- REQ-STARTUP-164, the sentence after (4): "Every path therefore ends with exactly one instance running and a window on
  screen — this launch's own, or the one it was handed to." On this path, one instance runs but no window is surfaced for
  the launch.
- REQ-STARTUP-164's first sentence: "A record naming a process that cannot be reached SHALL never leave the application
  unlaunchable." A holder that is live but never answers is a process that cannot be reached; each launch made while it
  stays so ends `refused`.
- REQ-STARTUP-161: every launch "becomes the running instance, or it is handed to the instance that is already running",
  "and to no third". `refused` here is neither.

## Relevant files

- `packages/platform/src/instance.ts` — `claimInstance`: clause (3)'s `namesAnotherLiveClaim`, clause (4)'s second
  `tryHandOver`, and the closing `refused`.
- `apps/desktop/src/main/index.ts` — the claim's `refused` outcome, logged and ended with exit code 2.
- `packages/platform/src/liveness.ts` — `isLockLive`, which counts another machine's record and a malformed one as live.
- `docs/defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md` (beside this note) — the repair that introduced
  (3)'s re-read and (4)'s second hand-over.
- `docs/architecture/adr/0055-startup-sequencing/03-decision.md` — the 2026-10-31 note on (3) and (4), which also cites the
  two-interval wait's [OQ-460](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-460).

## Repaired — 2026-11-01, under PD-STARTUP-009

OQ-461 was ruled the same day as [`PD-STARTUP-009`](../../product/directives/pd-startup-009.md#pd-startup-009): a holder that
is live and never answers is treated as one that cannot be reached. `claimInstance` now follows clause (4)'s unanswered
hand-over with a final reclaim that takes the record whatever it holds — the live holder that answered neither hand-over,
another machine's record, a malformed one, a dead process's — and a third exclusive claim. Success returns `instance`, with
`reclaimedFrom` naming what the record held, and main logs it at `warn`: `instance claimed after the final reclaim: the
record of pid <n> on <host>, which was running and answered neither hand-over within the interval; this launch is the
instance on its third claim attempt (PD-STARTUP-009, REQ-STARTUP-164)`. A third lost claim still ends `refused`, exit code
2, so the resolution is bounded: three claim attempts, two reclaims, no spin. Nothing a hand-over answers is touched —
a holder answering late inside clause (4)'s own interval is handed to, and a record re-created by a launch that became
the instance is handed to, never rivalled.

**Evidence.** Five cases in `packages/platform/src/instance.test.ts` under "a holder that is live and never answers is
reclaimed after the second unanswered hand-over", real named pipes and real timers at a 300 ms interval. The state this
note describes — a record naming a live process that accepts the connection and never answers, replaced inside the first
interval by another such — became the instance in 638–651 ms over four runs (two intervals and the pipe work), with exactly
two hand-over bounds armed; against the code before the repair the case failed with `expected 'refused' to be 'instance'`,
as did the other-machine and malformed cases. The owner's probe of 2026-10-31 on the built app was not repeated. What the
mechanism waits is two intervals, not the three the directive counts: the final claim follows the second unanswered
hand-over with no further hand-over, which the directive's bound admits and the first-executions register reports.
