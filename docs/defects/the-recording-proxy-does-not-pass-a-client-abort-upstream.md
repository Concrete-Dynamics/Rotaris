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
