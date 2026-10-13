## The instance record is written before its endpoint listens

ADR-0055 fixes the claim's order as "the endpoint is listening before the record is written, not after", and gives the reason:
a second launch that reads a record and cannot connect to the endpoint it names treats the instance as one that does not answer,
and reclaims. `claimInstance` (`packages/platform/src/instance.ts`, its `attempt`) does the opposite: it takes the record by
exclusive create first, naming an endpoint nothing listens on yet, and only then opens the endpoint. A second launch that reads
the record in that interval fails to connect at once (`tryHandOver` settles on the connection error, without waiting the
hand-over interval), removes the record and claims it for itself, while the first launch goes on to listen and become the
instance too: two instances, the outcome REQ-STARTUP-161 forbids. The interval is the time one `listen` takes, so it needs two
launches started within milliseconds of each other (a double-click, a file manager handing over several folders at once). Read
from the code, not measured.

Noticed 2026-10-07 by the builder of fin30's bundle `fin30-platform-paths` while repairing what the claim does when its listen
fails (`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`), which gives the record back when no endpoint
can be opened and leaves this order as it was; recorded, not repaired.

## Specs

REQ-STARTUP-161 (at most one instance; every launch becomes the instance or is handed to it) and REQ-STARTUP-164 (a reclaim only
where the hand-over is not acknowledged within 5 seconds); ADR-0055, "The endpoint is listening before the record is written,
not after".

## Relevant files

- `packages/platform/src/instance.ts` — `claimInstance`'s `attempt`: `exclusiveCreate` of the record, then `listenOrRelease`;
  and `tryHandOver`, which settles on a refused connection at once.
- `docs/architecture/adr/0055-startup-sequencing.md` — the ordering it fixes and the reason for it.

## Outcome

Repaired by fin34 (2026-10-13). `claimInstance`'s `attempt` now opens the hand-over endpoint first (`openEndpoint`) and writes
the record by exclusive create only once it is listening; an attempt that loses the record (another launch holds it) or whose
create fails closes the endpoint it opened (`closeEndpoint`) without touching the record, which is not its own. A listen that
fails is refused before any record exists, so `listenOrRelease`'s give-back is gone with the window it covered. ADR-0055's
report-back is in place under "The order this record fixes".

Pinned by `packages/platform/src/instance-order.test.ts`: the first case wraps `exclusiveCreate` and, at the instant the record
is written, finds the socket it names and connects to it (fails on the old order: the socket did not exist and the connection
was refused); the second asserts a launch handed over leaves no socket of its own behind. `instance.test.ts`'s refusal case
(no directory can hold the socket) still finds no record. Not driven in the built app: the race needs two launches within one
`listen`, which no proof can time; `pnpm workspace-proof`'s scenario 13b exercises the reordered claim and hand-over on Linux.
