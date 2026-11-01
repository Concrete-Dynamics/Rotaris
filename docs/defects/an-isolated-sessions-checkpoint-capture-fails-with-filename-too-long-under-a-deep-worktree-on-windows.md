## An isolated session's checkpoint capture fails with "Filename too long" under a deep worktree on Windows

Seen 2026-11-01 by `pnpm sessions-proof` in the worktree `C:\dev\Rotaris\.claude\worktrees\fix-instance-reclaim-pd-startup-009-ad2d06`
(Windows 11 Home ARM64, build 26300, Node 26.13.0, Electron 44.3.0), gating `PD-STARTUP-009`'s repair in
`packages/platform/src/instance.ts`, which this path does not reach. Recorded, not repaired.

The proof's `isolated` launch created the session's worktree
(`…\.proof\sessions-proof\profile\workspace\.rotaris\worktrees\3cfc9d8b-…`) and ran its scripted turn, and the checkpoint
capture after iteration 1 failed in the workspace service:

```
checkpoint capture 3cfc9d8b-…/1 (iteration, iteration 1): failed — fatal: Unable to create
'C:\dev\Rotaris\.claude\worktrees\fix-instance-reclaim-pd-startup-009-ad2d06\.proof\sessions-proof\profile\workspace\
.rotaris\worktrees\3cfc9d8b-d549-4896-a93e-c1c2a5dd187b\.rotaris\checkpoints\index-3cfc9d8b-d549-4896-a93e-c1c2a5dd187b-40528-80f.nuuxiu2h-1.lock':
Filename too long; 6 git invocations in 566 ms
```

That lock path is 261 characters: the checkpoint index file the capture writes under the isolated worktree's own
`.rotaris/checkpoints/`, named with the session id twice over, below a profile the proof places under the checkout's
`.proof/`. Git refuses a path over Windows' 260-character bound unless `core.longpaths` is set, and nothing sets it. The run
went on (the capture is best effort: "checkpoint after iteration 1 was not recorded"), no checkpoint ref was written, and the
proof threw at its reading of the refs: `E's ref: []` (`sessions-proof.mjs:533`, `refsOf`). The same proof's earlier launches
in the primary workspace (`A`'s refs) passed: their index path is shorter by the isolated worktree's segment.

Seen twice: the rerun straight after, with the host otherwise quiet, failed the same way at the same reading (`E's ref: []`).
It is deterministic in the path's length, not in the host's load; a checkout at a shorter path (the primary checkout, a
worktree under `C:\dev\Rotaris-wt-…`) does not reach it, which is why the proof has passed on this host before.

## Specs

- ADR-0039 §1 / REQ-GIT-031: the capture goes through a private index (`GIT_INDEX_FILE`) so the repository's own index is
  never opened — that private index is the file whose `.lock` Git could not create. The capture is recorded as failed and
  the run continues, which is its best-effort shape; what fails is that a session isolated in a worktree cannot have a
  checkpoint at all once its path is this deep, and nothing says so to the user.
- `packages/workspace/src/git/worktrees.ts` already decides the long-path question for worktree creation: it names the
  260-character bound, points at `git config --global core.longpaths true` or a shorter workspace, and states that Rotaris
  does not change the Git configuration. The capture meets the same bound later, in a worktree that was created, and
  carries no such message. Whether the capture should refuse with that sentence, shorten the private index's name, or
  whether the proof should place its profile at a shorter path, is not decided here.

## Relevant files

- `packages/workspace/src/git/checkpoints.ts` — the capture, and the private index it names
  `index-<session>-<pid>-<random>-<n>` below the worktree's `.rotaris/checkpoints/` (ADR-0039 §1).
- `packages/workspace/src/git/worktrees.ts` — the long-path refusal at worktree creation, the product's one statement on it.
- `apps/desktop/scripts/sessions-proof.mjs` — the `isolated` launch, `refsOf` at 133, the expectation at 533, and the
  profile placed at `.proof/sessions-proof/profile` under the checkout (107).
