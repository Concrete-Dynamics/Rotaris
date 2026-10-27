# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-09-29, the lock a continue takes back

Part 13 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-09-29, the lock a continue takes back

*Recorded under R-067; the repair of `../../../defects/fixed/a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`
and `../../../defects/fixed/a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`.*

**Built and run:** "the lock is still the capability … the run host must not write a session's rows without holding its
lock" now holds for every run in a process, not only its first. A continue — by message (`Sessions.prompt`), the
Continue action and the message-limit resolution (`continueSession`), a plan decision (`planDecision`) — claims the lock
before its first write (`holdForContinue`): kept when this process already holds it, taken through `claimLockReaping`
(REQ-SESSION-047's one reap, the claim `SessionWriter.open` makes) otherwise, and refused with `resume`'s REQ-SESSION-048
words and nothing written while another live process holds it (REQ-SESSION-083: "does not steal the holder's lock").
The run it launches holds the lock until its own teardown releases it; a continue that launches no run gives back what it
took. The claim is one function beside the at-rest cancel's (`claimHold`, which `lockForWrite` now calls). Pinned by
five tests in `session-resume.test.ts` (a second and a third run each hold the row; the Continue action, and its
`cancel` giving the lock back; a live local and a foreign holder refused with nothing written; a dead local holder
reaped; a loaded session's lock kept) and one in `run/plan-gate.test.ts` (a plan decision refused under a live holder
and holding the lock once free). In the built app, `part-j-proof`'s pause scenario now samples the store every 50 ms
from a worker thread while the app runs: the pause's teardown left no lock row, and every sample of the continued run
while active named this process's pid. On the code before the repair the same proof failed with the continued run
`running` and no lock row.

**Found: the claim this record made on 2026-09-05 was true of a process's first continue only** — corrected in place
above, with its measurement kept. Nothing in the decision moves.
