## A card resting in `ready` across a restart can never be started

A release accepted through the launch disclosure provisions the unit's worktree and records the launch (its unit, its
disclosure, its tree) in the workspace service's memory only (`launches` in `apps/desktop/src/workspace-service/delivery.ts`).
With the queue stopped, or under `manual` before the user releases it, the card rests in `ready` with no run begun. A
restart loses the launch while the store keeps the card in `ready` and the tree's row. From then on the queue states
"The permissions of the run for REQ-101 have not been disclosed and accepted; open it from the queue to see the
disclosure and start it." The queue pane's "Disclose and start" sends `requirements.queue.set {release, disclosure}`, and
that arm records the disclosure only on a launch it already holds (`if (command.disclosure !== undefined && l !==
undefined)`). So nothing is recorded, the entry stays deferred with the same sentence, and `run.claim` answers `null`
(it would also refuse a launch with no worktree). The card can leave `ready` only by a hold and a resume, or a return
and a second release, both of which run `beforeCommit` again.

Seen 2026-10-02 in a scratch case of `delivery.test.ts` (not kept): a release with the queue stopped, a second service
over the same store standing for the restart, the queue's disclosure release, then the claim. The entry read
`deferred` with the sentence above before and after the release, and the claim was `null`. Found while repairing
[`a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`](a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md).
That repair takes over the recorded tree when a later run-starting action of the same unit runs `beforeCommit` (so the
hold-and-resume and the return-and-release routes now work after a restart). It does not reach the queue's release,
which has no transition and no `beforeCommit`. Not repaired.

## Specs

- `REQ-TRACE-472`: accepting the disclosure is what lets the run start. Here the acceptance, offered by the queue
  itself, records nothing and starts nothing.
- `REQ-TRACE-482`: under `manual` a candidate begins once the user releases it. This one never begins.
- `REQ-TRACE-464`: the run takes over the worktree already provisioned for it. The tree is on disk and in the store,
  and no route from the queue reaches it.

## Relevant files

- `apps/desktop/src/workspace-service/delivery.ts`: `launches`, the in-memory record a restart clears;
  `requirements.queue.set`'s `release` arm, which records a disclosure only on a launch it holds; `claim`, which refuses
  an absent or unprovisioned launch.
- `packages/workspace/src/delivery/runs.ts`: `takeOverUnitWorktree`, the take-over of a recorded tree the release arm
  could use.
- `packages/ui/src/requirements/RequirementsView.tsx`: the queue's "Disclose and start", which sends the release with the
  disclosure.

## Outcome

**Repaired 2026-10-02** (fourth repair round over the open notes, bundle `fin7-queue-and-roles`; origin/main `dc796f5`).

**Confirmed first.** Three new cases in `apps/desktop/src/workspace-service/delivery.test.ts` were red on the code
before. In the first, the queue's disclosure release after the restart left the entry `deferred`, not `next`. In the
second, under an unattended workspace with automatic scheduling, the claim after the restart was `null`. In the third,
a tree that cannot be taken over was reported only as an undisclosed launch, never as the reason. `requirements-runs-proof`'s
new sixth assertion was red on the same code (`expected 'deferred' to be 'next'`). So was `requirements-proof`'s new
`ready-restart` stage over a build of the unrepaired code, across a real quit and relaunch of the built app: the entry
asked for the disclosure, "Disclose and start" showed it, "Start the run" was taken, and REQ-101 still read
`["ready","ready"]` 12 s and 18 s into the relaunch.

**What changed.** `apps/desktop/src/workspace-service/delivery.ts` gains `recoverLaunch`. For a card in `ready` whose
launch the process lost, or whose launch holds no tree, it takes over the tree the store's worktree row records for the
card's unit through `RunGitPort.takeOver` (`takeOverUnitWorktree`). It then records the launch with the disclosure it
was given. `beforeCommit`'s own take-over now goes through the same `takeOverRecorded`. `recoverLaunch` is called from
two places:

- the `requirements.queue.set` release arm, for a card in `ready`, with the disclosure the command carries. So "Disclose
  and start" records the acceptance and arms the card (REQ-TRACE-472/482).
- once on the service's first pass after a start, undisclosed, for every card resting in `ready`. An unattended
  workspace needs no disclosure (REQ-TRACE-474), so its scheduler claims the card with no release. Elsewhere the entry
  still asks for the disclosure.

It never provisions. The queue's release has no transition to write a new worktree row into, and REQ-TRACE-464 forbids
a second tree for the unit. A tree it cannot take over is stated on the entry as the last start's stall (REQ-TRACE-463).
The stall names the hold and resume from the board as the way to provision one, and the claim still refuses the card.
A launch already holding the unit's tree only takes the disclosure, as before.

**Pinned by** the three `delivery.test.ts` cases: the disclosure release after a restart, claimed on u1's recorded
path with one provisioning; the unattended automatic claim after a restart with no release; and the stated stall for a
removed tree, with nothing provisioned. Also by `requirements-runs-proof`'s sixth assertion (real Git, the real
engine, a second workspace service and coordinator over the same store: the entry undisclosed, the release with the
disclosure, the run started on the tree the release provisioned, `git worktree list` holding one tree for the unit).
And by `requirements-proof`'s `ready-restart` stage (two launches of the built app over one profile: the run reached
`review` on the one worktree row ending `-u1`, one run row of u1, "takes over its worktree" in the log, no "Worktree
path already exists"). Both proofs passed on the repair: `requirements-runs-proof` 117/117 tests, and the whole
`requirements-proof` 139 tests with every stage, at a load average of 3.7 falling to 0.9.

**Two gaps the verifier found, 2026-10-02 (repair round 1), kept beside their repairs.**

- *The once-only recovery could be used up.* "Once on the service's first pass after a start" was tied to the restart
  reap's pass, which runs whether or not the store parses. A first parse that failed (a document mid-edit when the app
  opened) used the recovery up, and no later pass recovered the card. An unattended automatic workspace then never
  claimed it for the session. **Now** every pass that parses recovers each card in `ready` that holds no launch at all
  and has no action in flight. A card it cannot recover keeps a launch with no tree, so it is tried once, not on every
  pass. The take-overs of several resting cards run together.
- *A recovered launch was always undisclosed.* The service cannot read the two preferences REQ-TRACE-472 names, so a
  card released with the disclosure suppressed permanently, or with the elevation switched off, was never claimed after
  a restart in a workspace that schedules automatically without being unattended. The entry kept asking for a disclosure
  that would never be shown. **Now** main's coordinator sends its standing disclosure (`due`, `suppressed` or `off`, from
  the two preferences) on every `requirements.run.claim` (`StandingDisclosure` in `packages/contracts/src/requirements.ts`).
  *(Falsified by the verifier in repair round 2, kept as written: this repaired the claim only. The entry the board
  published was still computed as if the disclosure were `due`, so it went on asking for a disclosure that would never
  be shown while the next claim took the card — see the round-2 paragraph below.)*
  The service treats a launch recorded undisclosed as disclosed when that disclosure is not `due`. It starts the run on
  the workspace's own mode when the elevation is `off`, whatever the launch recorded (REQ-TRACE-472: "with it switched
  off, a board-started run SHALL adopt the workspace's own permission mode").

The stall's wording no longer contradicts the advice `stalledReason` appends. It reads "… has no recorded worktree on
disk to take over, and a start from the queue provisions none: restore the tree, or hold the card and resume it from the
board, which provisions one. Release it from the queue to try again."

**Pinned by** four more cases:
- `delivery.test.ts`: a first parse that fails, then a refresh and a claim of u1; claims carrying `due`, `suppressed`
  and `off` after a restart (`null`, `permissive` and `workspace`); and `off` overriding an accepted launch.
- `requirements-runs.test.ts`: every claim carries the standing disclosure the preferences make.

Each was red on the round's first repair. `requirements-runs-proof` gains a seventh assertion: the concurrency
assertion's third release rests in `ready` through two restarts; with automatic scheduling and the disclosure
suppressed permanently, a third service and coordinator pick it up with no release and start it, elevated, on its
recorded tree. It was red with the round's first `delivery.ts` and `requirements-runs.ts` and green with these; the
whole proof passed, 122/122 tests, at a load average of 1.0.

**A third gap the verifier found, 2026-10-02 (repair round 2), kept beside its repair.** Round 1 split the scheduler in
two. The queue the board published (`rebuild()` → `schedule(base)`) was computed with the standing disclosure defaulting
to `due`, while only the claim saw main's value. After a restart, under automatic scheduling with the disclosure
suppressed permanently, the entry read "deferred: The permissions of the run for REQ-101 have not been disclosed and
accepted; open it from the queue to see the disclosure and start it" while the next claim took REQ-101 with no
disclosure shown. That contradicts REQ-TRACE-478 (the queue shows the candidate the scheduler takes next, for the
scheduler's own reason) and REQ-TRACE-472 (a permanent acceptance suppresses the disclosure in later launches).
**Now** the standing disclosure is one value the service holds, not an argument of the claim. Main stamps it on every
`requirements.command` it sends the service, beside the actor (the envelope's `disclosure` in
`packages/contracts/src/process-protocol.ts`; `requirements.run.claim` no longer carries a field of its own). The relay
of a person's commands (`apps/desktop/src/main/requirements.ts`) and the coordinator's own requests
(`requirements-runs.ts`) both stamp `standingDisclosure()`. The service's scheduler reads the last value it received for
the published queue, the launch preview and the claim alike. A command whose value differs from the one held
republishes the queue under it before answering, and its reply carries the move for channel 10. A permanent acceptance
(`requirements.runs {op: 'suppress'}`) asks the service for the board at once, so an open board stops asking for the
disclosure without waiting for another act.

**Pinned by** two more `delivery.test.ts` cases (after a restart under automatic scheduling with the disclosure
suppressed, the published entry reads `next` with no reason and the claim takes the card the queue named; a standing
disclosure that moves republishes the queue and the reply carries `changed`, one that holds changes nothing, and a
command naming none keeps the last one), one `requirements-runs.test.ts` case (a permanent acceptance sends the board
read stamped `suppressed`; every command, not only the claim, carries the value), and the relay's case in
`requirements.test.ts`. `requirements-runs-proof`'s seventh assertion now also reads the published entry before the
dispatch and requires `next` with no reason. With the published queue forced back to `due` (round 1's split), the two
`delivery.test.ts` cases and the seventh assertion are red; with the repair the whole proof passed, 125/125 tests.

Still owed, and recorded rather than repaired: nothing dispatches when the application launches, so an automatic queue
starts a recovered card only at its first kick (a person's act or queue change, or a run ending). See
[`an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`](an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md).

Noticed while repairing it, and recorded rather than repaired: a rejected card back in `ready` can never start its next
unit. Before the repair the claim handed out the rejected unit's held launch and `run.started` failed on the run
table's key; the queue's release now states a stall instead, and automatic scheduling still meets the store error. See
[`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`](a-rejected-card-back-in-ready-can-never-start-its-next-unit.md).
