## An iteration's checkpoint is captured before its iteration_end hooks run

`Run.iterate` closes an iteration by recording `iteration.end`, then awaiting the iteration's checkpoint capture, and only
then firing the `iteration_end` hooks (`packages/engine/src/run/run.ts`, "ADR-0039 / REQ-GIT-051: exactly one capture per
iteration that closes"). REQ-HOOKS-082 fixes the opposite order: the hooks finish first, so whatever an `iteration_end`
hook writes to the working tree — a formatter's rewrite, a build artifact — is captured by that iteration's checkpoint.
As built, such an edit lands in the next iteration's checkpoint, credited to work it did not do, and after a run's last
iteration it lands in no checkpoint at all, so a restore to that checkpoint brings back the tree without it.

The record calls the requirement "owed" rather than unmet. ADR-0039's first execution took the capture position as a
reading ("so … a hook that later carries the checkpoint (REQ-HOOKS-082 with checkpoints — owed) can be handed it"), which
recasts an ordering requirement as a payload that carries a checkpoint; REQ-HOOKS-082 says nothing about a hook carrying
anything. The runtime view, `codebase.md` and implementation-conditions.md repeat the "owed" wording, and ADR-0015 still
calls the guarantee "vacuous (no checkpoints)", stale since checkpoints were built (Part P, 2026-09-05). The engine test
that pins the order pins the built one (`checkpoints.test.ts`, `'capture:1', 'hook:iteration_end'`).

REQ-GIT-051 does not stand in the way: it asks for the capture "at the moment it closes", finished "before the next
iteration begins and before the run reports the session finished", and the hooks run in line before either.

Recorded 2026-10-13 by fin41 (item N68 of the whats-next survey at main `6de2a67`), before the repair.

## Specs

- `REQ-HOOKS-082` — `iteration_end` hooks SHALL finish before that iteration's checkpoint is taken.
- HARD constraint H-06 (`docs/architecture/constraints.md`) and `proposals/runtime.md` C8.6 — the same order.
- `REQ-GIT-051` — one capture per closing iteration, finished before the next iteration and before teardown; met by
  either order, so not contradicted.

## Relevant files

- `packages/engine/src/run/run.ts` — the close: `captureCheckpoint` before `fireLifecycle('iteration_end')`.
- `packages/engine/src/run/checkpoints.test.ts` — pins `capture:1` before `hook:iteration_end`.
- `docs/architecture/adr/0039-checkpoints-via-a-private-index.md` — the capture-position reading and "Not built".
- `docs/architecture/adr/0015-lifecycle-hook-invocation.md` — "vacuous (no checkpoints)".
- `docs/architecture/views/03-runtime-view.md`, `docs/architecture/codebase.md`,
  `docs/architecture/implementation-conditions.md` — "REQ-HOOKS-082 with checkpoints, owed".

## Outcome — repaired 2026-10-13 (fin41, `fin41-palette-and-hooks`)

`Run.iterate` now fires the `iteration_end` hooks and awaits them, then awaits the iteration's capture in a `finally`, so a
hook's edit is in that iteration's checkpoint — the last iteration's included — and hooks that raise still leave the
iteration its one capture (REQ-GIT-051). The capture still finishes before the next iteration and before teardown. The
decline's close (no hooks fired, one capture) and `PD-ORCH-005` clause 36's no-capture close are unchanged.

**Pinned by** `packages/engine/src/run/checkpoints.test.ts`: the order `hook:iteration_end` then `capture:1`, and a hook's
asynchronous edit present in iteration 1's snapshot — both red on the code before — and a raising hook port still leaving
one capture. **Shown by** `pnpm checkpoint-proof`'s `hook-capture` launch: a global `iteration_end` hook's `HOOK.txt` is in
checkpoint 1's file list and tree beside the agent's `NOTES.md`. ADR-0039 reports back in place with its capture-position
reading struck through and kept; ADR-0015, the runtime view, `codebase.md`, implementation-conditions.md and the OQ prose
that stated the old order are corrected in place.
