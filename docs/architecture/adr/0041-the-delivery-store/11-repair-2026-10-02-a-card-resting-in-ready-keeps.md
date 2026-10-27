# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Repair — 2026-10-02: a card resting in `ready` keeps a way to start after a restart

Part 11 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Repair — 2026-10-02: a card resting in `ready` keeps a way to start after a restart

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-card-resting-in-ready-across-a-restart-can-never-be-started.md`](../../../defects/fixed/a-card-resting-in-ready-across-a-restart-can-never-be-started.md).*

The repair above takes over a recorded tree from `beforeCommit`, so it reached only a transition. **It left the queue's
release, which has no transition, holding the launch the restart lost, and is kept above as it was written.** A card
released with the queue stopped (or resting under `manual`) rests in `ready`; the launch (unit, disclosure, tree) lived
in the service's memory only, the queue's "Disclose and start" recorded its disclosure only on a launch it held, and no
claim could take the card. Now `recoverLaunch` (`workspace-service/delivery.ts`) rebuilds such a launch from the store's
worktree row through `RunGitPort.takeOver`, sharing `takeOverRecorded` with `beforeCommit`. It runs once on the first pass
after a start, undisclosed, so an unattended workspace's scheduler claims the card with no release (REQ-TRACE-474), and
on the queue's release, which records the disclosure it carries and arms the card (REQ-TRACE-472/482). It never
provisions: the queue's release writes no worktree row, and REQ-TRACE-464 forbids a second tree. A tree it cannot take
over is stated on the entry as the last start's stall (REQ-TRACE-463), and the claim still refuses the card.
`requirements-proof`'s `ready-restart` stage shows it across a quit and a relaunch of the built app.

**Two clauses of that repair were falsified by the verifier the same day, and are kept above as written.** "Once on
the first pass after a start": the pass was the restart reap's, which runs whether or not the store parses, so a first
parse that failed used the recovery up for the session. Now every pass that parses recovers each card in `ready` that
holds no launch. "Undisclosed, so an unattended workspace's scheduler claims the card": only an unattended workspace,
because the service cannot read the two preferences REQ-TRACE-472 names. A card whose disclosure was suppressed
permanently, or whose elevation was switched off, was never claimed by automatic scheduling after a restart. Now main's
coordinator sends its standing disclosure (`StandingDisclosure`: `due`, `suppressed`, `off`) on every
`requirements.run.claim`. The service treats an undisclosed launch as disclosed when that is not `due`, and gives the run
the workspace's own mode when it is `off`. `requirements-runs-proof`'s seventh assertion shows it. Nothing dispatches
when the application launches, so the pick-up waits for the first kick; that gap is recorded as its own defect note.

**The verifier falsified "on every `requirements.run.claim`" in a second round, kept above as written.** Sent on the
claim alone, the standing disclosure split the scheduler in two: the queue the board published was still computed as
if the disclosure were `due`, and called "deferred, open it to see the disclosure" a card the next claim took with the
disclosure suppressed (REQ-TRACE-478, REQ-TRACE-472). Now main stamps the value on every `requirements.command`
envelope it sends, beside the actor, from the relay and the coordinator alike; the claim command carries no field of
its own. The service holds the last value it received and schedules the published queue, the launch preview and the
claim under it; a command whose value moved republishes the queue before answering and its reply carries `changed`. A
permanent acceptance reads the board at once, so the service learns of it without waiting for another act. The seventh
assertion now also requires the published entry to read `next` before the dispatch.
