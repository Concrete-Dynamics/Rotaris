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
