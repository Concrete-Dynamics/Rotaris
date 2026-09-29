## An at-rest cancel refused by a store error reads "Another process holds this session", or "not cancellable"

The twelfth review round's repair
([`an-at-rest-cancel-refused-by-the-lock-or-the-store-reads-not-cancellable.md`](an-at-rest-cancel-refused-by-the-lock-or-the-store-reads-not-cancellable.md))
keyed the `session_locked` refusal of `Sessions.cancelPausedAtRest` (`PD-ORCH-005` clause 16) on `lockForWrite`
returning null. `lockForWrite` also returned null from its `catch`, when `dal.getLock` or `claimLockReaping` threw (for
example `SQLITE_IOERR` or `SQLITE_BUSY` on the read). No other process is involved then, yet the user read "Another
process holds this session, so the agent was not cancelled." In the same way `cancelPausedUnderLock` answered a bare
`{ ok: false }` when `transitionChild` failed for the chosen child, both for an illegal move and for a failed store
write, so a failed write still read "That agent is not cancellable (unknown, or already finished).", the falsehood the
twelfth round's note describes. No test reached either path.

Found 2026-09-28 by the thirteenth review round of the merged revision 4 build of `PD-ORCH-005` (R-065).

## Specs

None directly. OQ-101 says `session_locked` is refused "while another live process holds it", which the store error
contradicted. REQ-MONITOR-128's "no longer cancellable" is false of a paused child whose write failed; OQ-101 records the
departure from that sentence for the refusals that say nothing of the agent.

## Relevant files

- `packages/engine/src/sessions.ts`: `lockForWrite`'s `catch`, and `cancelPausedUnderLock`'s failed move of the chosen
  child.
- `packages/contracts/src/control.ts`: `CONTROL_REFUSAL_CODES`, whose `store_failed` now covers both.
- `packages/engine/src/children/children.test.ts`: the lock tests.

## Repaired — 2026-09-28

By the thirteenth fix round of the merged revision 4 build (R-065). `lockForWrite` now answers the refusal itself:
`session_locked` only when the claim finds another live holder, and `store_failed`, "The workspace store could not take
this session's lock, so the agent was not cancelled: …", when reading or claiming the lock throws. A chosen child's move
that fails to be written (anything but `illegal-move`) is refused `store_failed`, "The workspace store requires recovery
before an agent can be cancelled: …"; an illegal move still reads "not cancellable". The renderer's `cancelAgent` now
goes through the `control` helper, the one copy of "prefer the engine's words".

Evidence: `packages/engine/src/children/children.test.ts`, "a store error while taking the lock involves no other
process…" and "a failed write of the chosen child's own move is refused store_failed…", both red against the twelfth
round's code.
