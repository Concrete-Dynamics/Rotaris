## Two proof scripts assert a timeline name the code has never written

`checkpoint-proof.mjs` and `sessions-proof.mjs` both assert that repairing a stale session files a timeline
entry named `session_marked_interrupted`. No code writes that name. The repair writes
`session.interrupted_recovered` — that is the name in `packages/engine/src/session-actions.ts`, it is what
`session-actions.test.ts` asserts, and it is what the store holds after a repair (verified 2026-09-17 against
`.proof/checkpoint-proof`'s workspace: `timeline` carried one `session.interrupted_recovered` row for the
repaired session and no row of the other name).

The consequence is that `pnpm checkpoint-proof` fails at scenario (d) — `no session_marked_interrupted
timeline entry` — **after** the behaviour it is checking has already succeeded. In the same run the session
read `interrupted`, the orphaned lock was released, and main logged both the repair and the notice
(`… marked interrupted (REQ-GIT-094)` / `notice: Session marked interrupted`). Only the assertion about the
name is wrong, so the script reports a product failure where there is none, and — worse for a proof — it
would keep reporting one if the repair itself broke, because it never gets far enough to tell the two apart.

`sessions-proof.mjs` carries the same name in four places, including one that asserts an exported session's
whole timeline (`["session_marked_interrupted","run_start","issue","run_end"]`) and one that asserts an empty
session's (`["session_marked_interrupted"]`), so the same mismatch is load-bearing there in more than one
assertion.

Noticed while moving `runCommand`'s cases into `apps/desktop/src/main/commands/`. Nothing in that change
touches the run host, the engine or the store, and the repair path was exercised and passed on the built app.

## Specs

`REQ-GIT-094` — a session left `running` by a process that is gone is marked interrupted when its checkpoints
are opened, the lock is released, and the repair is announced. The requirement is **met**; what contradicts
the record is the evidence script, which names an entry the implementation does not write. `AGENTS.md` treats
a `*-proof` script as the evidence that re-verifies its area, so a proof that cannot pass is a hole in the
evidence for `REQ-GIT-094` and for the session repair in `REQ-TRACE-*`'s export.

## Relevant files

- `apps/desktop/scripts/checkpoint-proof.mjs` — line 348, scenario (d); the one assertion that fails.
- `apps/desktop/scripts/sessions-proof.mjs` — lines 198, 246, 287, 296; the same name in four assertions.
- `packages/engine/src/session-actions.ts` — writes `session.interrupted_recovered`, the name that is real.
- `packages/engine/src/session-actions.test.ts` — lines 59 and 99 assert that name, which is why the unit
  tests are green while the proofs are not.
