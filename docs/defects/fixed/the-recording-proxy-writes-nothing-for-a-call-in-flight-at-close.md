## The recording proxy writes nothing for a call still in flight when it closes

A traffic record is written only when a call ends, stalls, is cut, or is released. `close()` shuts the server and
writes nothing for a call in flight, so the call the run was waiting on when the harness stopped — often the one that
explains an overrun — is missing from the pack.

Live-run finding: H-g (live runs of 2026-09-29)

## Specs

- None; harness. Related to [`the-stalled-call-was-the-one-call-missing-from-the-pack.md`](the-stalled-call-was-the-one-call-missing-from-the-pack.md),
  whose repair covered the stall path only.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored): `duress/app.log` has 201 `model request POST` lines against 200 records in `model-traffic.jsonl`; the
  missing one is `f`'s request in flight at the deadline.

## Relevant files

- `apps/desktop/scripts/lib/model-traffic.mjs:143-151` — `settle`, the only writer of a call's record.
- `apps/desktop/scripts/lib/model-traffic.mjs:238` — `close()`.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The proxy keeps the calls still open, and `close()` writes each one first — `outcome:
in-flight at close`, into the file of the scenario that made it, with the status and whatever had arrived — and lets its
endpoint go, before it stops listening. The writes are synchronous, so the live run's exit paths, which do not await the
close, still leave the record; `finish` in `apps/desktop/scripts/live-run.mjs` now closes the proxy before it reads
`proxy.stats()`, so `results.json`'s `traffic.recorded` counts it. A call that has ended is not written again. The duress
shape — the app quit at the deadline with `f`'s request open — now reaches the pack by the client-abort path of the
sibling note ([`the-recording-proxy-does-not-pass-a-client-abort-upstream.md`](the-recording-proxy-does-not-pass-a-client-abort-upstream.md)),
written `aborted`, since the app's exit closes its connection before the harness closes the proxy.

Pinned by `apps/desktop/scripts/lib/model-traffic.test.ts`: "a call in flight when the proxy closes is written as such,
and the endpoint is let go" (red before the repair: no record) and "a call that has ended is not written again at close".

Files: `apps/desktop/scripts/lib/model-traffic.mjs` (`open`, `atClose`, `close`), `apps/desktop/scripts/live-run.mjs`
(`finish`).

Shown live the same day (pack `.live-run/runs/2026-09-29T21-11-24-678Z`, git-ignored; passed): every scenario's
`model-traffic.jsonl` holds one record per `model request POST` line of its `app.log` — `edit` 52 of 52, `faults-ladder`
6 of 6, `faults-stall` 5 calls in 6 records (the stall's two) — each scenario's last call, open when its app exited,
written `aborted`. No call was still open when the proxy closed, so the `in-flight at close` path is unit-evidenced only.
