## The recording proxy does not pass a client's abort through to the endpoint

The live run's recording proxy destroys its upstream request only when the client request emits `error`; nothing
answers the client closing the connection. A call the product aborts — a timed-out classifier, an analysis cancelled
at quit, a stalled stream released — therefore runs to completion at the endpoint, and its record is written, as
`outcome: complete`, into whichever scenario's traffic file is current when it finishes. On a metered endpoint that is
spend the product never made, and the pack attributes it to the wrong scenario.

Live-run finding: H1 (live runs of 2026-09-29)

It recurred in the duress run as H-f (below).

## Specs

- None; harness. What it hides bears on `REQ-EVENTS-053`'s usage accounting (an aborted call's tokens are not counted,
  by design) and on the pack's evidence.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): the two timed-out intent classifiers, the loop classifier and six quit-cancelled analyses ran to
  completion upstream and are recorded `outcome: complete` in the next scenario's `model-traffic.jsonl` (`ask`'s analyst
  appears under `edit/`, the released stall under `terminal/`).
- Recurrence (H-f), pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored): the aborted calls #158 and #159 were recorded complete upstream; 54,805 input and 5,139
  output tokens the product never counted.

## Relevant files

- `apps/desktop/scripts/lib/model-traffic.mjs:217` — only `clientReq`'s `error` destroys the upstream request.
- `apps/desktop/scripts/lib/model-traffic.mjs:84-87` — `write` to the sink current at completion; `:143-151` — `settle`.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The proxy now listens for the client's response closing without the proxy having
ended it — the product aborting the call, or the app exiting — and destroys the upstream request at once, so the
endpoint's socket closes and it stops generating what nobody will read. The call is written `outcome: aborted`, with
whatever had arrived before the client let go, and the proxy's own letting go of the endpoint is not counted as the hop
failing. This holds before the endpoint's first byte, mid-stream, and during an injected stall (which is then written
twice: `stalled` as it began, `aborted` when the product's idle bound let go, rather than holding the endpoint for the
rule's `holdMs`). Each call's file is **captured when the call arrives**, so its record lands in the scenario that made
it, whichever sink is current when it ends. Beside it, an endpoint dropping the stream mid-answer is now written
`upstream-error` (it wrote nothing before, and without it the new close listener would have mistaken it for the client's
abort), and a refused connection carries `outcome: unreachable`.

Pinned by `apps/desktop/scripts/lib/model-traffic.test.ts`, "a call the client lets go of, and a call in flight at close
(H1, H-g)": "a client abort mid-stream destroys the upstream request, and the record says aborted", "a client abort
before the endpoint has answered …", "a client abort during a stall lets go of the endpoint at once …", "a record lands
in the file of the scenario that made the call …" and "an endpoint that drops the connection mid-stream is written as an
upstream error …" — each red on the proxy before the repair (the upstream socket never closed within 5 s; no record, or
the record in the wrong file).

Files: `apps/desktop/scripts/lib/model-traffic.mjs` (`write(target, …)`, `settle`, `release`, the `clientRes` close
listener), `apps/desktop/scripts/lib/model-traffic.test.ts`.

Shown live the same day, `pnpm live-run --confirm --skip-build --only=faults,edit` against `katalyst` (pack
`.live-run/runs/2026-09-29T21-11-24-678Z`, git-ignored; passed). In `faults-stall` the stalled call is written twice —
`stalled` at 555 ms and `aborted` at 120,529 ms, when the product's idle bound (REQ-CONFIG-115's 120 s) let go of it —
so the endpoint was released at the product's bound rather than at the rule's 300 s hold. Each scenario's last call,
open when its app exited, is written `aborted` in that scenario's own file (`edit` 1, `faults-ladder` 1, `faults-stall`
1), and no scenario's file holds a record of another's. An earlier run of the same day (pack
`2026-09-29T20-59-46-627Z`, whose store another worktree's live run swept — see `a-live-run-sweeps-a-concurrent-live-runs-sandbox.md`)
wrote the timed-out intent classifier `aborted` at 11,958 ms.
