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
[`fixed/a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`](fixed/a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md).
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
