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
owed: [OQ-461](../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-461) raises it.

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
- `docs/defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md` — the repair that introduced
  (3)'s re-read and (4)'s second hand-over.
- `docs/architecture/adr/0055-startup-sequencing/03-decision.md` — the 2026-10-31 note on (3) and (4), which also cites the
  two-interval wait's [OQ-460](../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-460).
