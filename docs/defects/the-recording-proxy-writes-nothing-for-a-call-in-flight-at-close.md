## The recording proxy writes nothing for a call still in flight when it closes

A traffic record is written only when a call ends, stalls, is cut, or is released. `close()` shuts the server and
writes nothing for a call in flight, so the call the run was waiting on when the harness stopped — often the one that
explains an overrun — is missing from the pack.

Live-run finding: H-g (live runs of 2026-09-29)

## Specs

- None; harness. Related to [`the-stalled-call-was-the-one-call-missing-from-the-pack.md`](fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md),
  whose repair covered the stall path only.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored): `duress/app.log` has 201 `model request POST` lines against 200 records in `model-traffic.jsonl`; the
  missing one is `f`'s request in flight at the deadline.

## Relevant files

- `apps/desktop/scripts/lib/model-traffic.mjs:143-151` — `settle`, the only writer of a call's record.
- `apps/desktop/scripts/lib/model-traffic.mjs:238` — `close()`.
