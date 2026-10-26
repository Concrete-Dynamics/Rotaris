# Resolution Record — Domain 02, Run Monitoring and Steering — Outcome

Part 3 of 3 of [domain 02's resolutions](../02-run-monitoring-steering.md), which indexes every part.

## Outcome

Of the 30 open questions: 29 resolved, 1 moot, none omitted, none escalated. Nothing in this domain
remains outstanding for the product owner.


> ## Amendment, 2026-09-02 — ESC-22: the aggregate terminal-frame rate is bounded
>
> *Recorded by the sweep pass rather than by the agent that made the amendment, so the record is not
> owed twice.*
>
> **The gap.** No requirement bounded the rate at which live terminal output reaches surfaces in
> aggregate. `REQ-TOOLS-126` fixes a per-stream sampling period; `REQ-TOOLS-108` registers a maximum
> number of background sessions with a default, a minimum and **no maximum**. Measurement showed that a
> separately named channel is not a separate transport, so terminal frames and transcript rows share one
> delivery path and a high-volume stream delays a transcript row — which makes `REQ-MONITOR-222`, a
> load-bearing conformance budget, rest on a default nothing states.
>
> **`REQ-MONITOR-306` is minted**, placed beside the budget it protects. It bounds the rate **in
> aggregate** — across every live stream, of every session, delivered to every window — at 1,000 frames
> per second, measured over any one second at the point frames are delivered, with a stream shown in more
> than one window counting once per window because the cost is paid per delivery. It cites
> `REQ-TOOLS-126` for the per-stream period and `REQ-TOOLS-127` for what a frame is, and copies neither.
> What it adds is that the number of live streams is not a multiplier on the per-stream period.
>
> **Bounded on frames and deliberately not on volume**, and the requirement says so with its reason. A
> bound on bytes reaching a surface each second could be honoured only by discarding output, which
> `REQ-SHELL-103` and `REQ-MONITOR-294` both forbid; a frame bound is honoured losslessly by carrying
> more accumulated text in each frame. The measurement also says frames are the axis that matters: the
> cost of delivering a frame grows far more slowly than its size.
>
> **Expressed as observable behaviour.** What a user sees when streams share the bound is that each live
> preview updates less often and in larger steps while many streams are busy, and nothing else changes —
> no output dropped or reordered, the durable record still fully retrievable, the command's completion
> and the agent's observation identical whether or not anything was watching.
>
> **Two obligations that are not optional.** The bound may not be widened, made configurable, or raised
> by any per-stream setting unless `REQ-MONITOR-222` is re-measured at the new aggregate rate and still
> holds; and conformance is measured as the aggregate frame rate delivered across all live streams,
> never as the appearance of a terminal grid. The requirement records that the failure is invisible to
> every other detector this document has — delivery above the bound loses and reorders nothing, so no
> sequence gap appears and no surface reconciles, and the only symptom is a late surface.
>
> **`REQ-MONITOR-287` gained one sentence** saying the aggregate rate is `REQ-MONITOR-306`'s and is
> deliberately absent from its cadence list, because it bounds a rate rather than setting a cadence.
> `REQ-MONITOR-131` gained one sentence pointing at `REQ-SHELL-169` for what happens to a launch arriving
> while the force-exit allowance is running, and holds no copy of that rule.
>
> **What is not discharged.** Whether `REQ-TOOLS-126`, `REQ-TOOLS-108` and `REQ-TOOLS-127` should cite
> `REQ-MONITOR-306` from their side is domain 05's; an implementer reading `REQ-TOOLS-126` alone would
> build per-stream sampling with no aggregate. `REQ-MONITOR-306` states its own conformance obligation,
> so nothing is owed to domain 21 — but nothing in domain 21 measures terminal frames at all, which is
> recorded so the benchmark domain is not assumed to cover it.
