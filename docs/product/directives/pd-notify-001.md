[Product directives](../directives.md) › PD-NOTIFY-001

<a id="pd-notify-001"></a>

### PD-NOTIFY-001 — an acknowledgement's lifetime holds while the pointer rests on the stack

While the pointer rests within the bounds of a visible transient acknowledgement, the countdown of every member of that window's acknowledgement stack SHALL NOT advance. When the pointer leaves those bounds, each countdown SHALL resume from the time it had left. That is the whole case: outside it, REQ-NOTIFY-011's 4200 ms and REQ-NOTIFY-022's "the same 4200 ms" govern unchanged, and the lifetime this directive pauses is the one both of them define. Nothing else moves:

- keyboard focus pauses nothing, and an acknowledgement still takes none (REQ-NOTIFY-015);
- publishing a fourth acknowledgement still removes the oldest at once, paused or not (REQ-NOTIFY-016);
- the non-expiring case and the restartable countdown of REQ-NOTIFY-020 are unchanged; a countdown restarted while the pointer rests on the stack SHALL hold its new remainder and count it once the pointer leaves;
- the clear operation of REQ-NOTIFY-021 removes a paused member like any other;
- the motion of REQ-NOTIFY-022 is unchanged, and PD-WORKSPACE-001 is unchanged: an acknowledgement no pointer touches withdraws at 4200 ms, and the offer it carries stays reachable as `/new` (REQ-CHAT-031).

**Why, and what it costs.** REQ-NOTIFY-020 puts a close control on every transient acknowledgement and PD-WORKSPACE-001 one action control; REQ-NOTIFY-012 draws the stack over all other content of its window; REQ-NOTIFY-022 takes it away over 120 ms on a clock the operator cannot see. A press aimed at either control that arrives after the withdrawal therefore reaches whatever the surface covered, and a stack that loses a member re-widens the one left (REQ-NOTIFY-013) under the pointer that was about to press it. Holding the countdown while the pointer rests on the stack is the narrowest answer to that geometry: it changes nothing for an acknowledgement nobody touches, and the content question needs no change at all, since REQ-NOTIFY-003 republishes every failure, refusal and outcome carrying a recovery action as a persistent notice and allows every other event to be reported nowhere else. The cost is that the lifetime is no longer a fixed figure from the moment of appearance: a pointer parked over the corner keeps up to three acknowledgements on screen until it moves (REQ-NOTIFY-016's bound and REQ-NOTIFY-021's clear on a view change still hold), and the exact moment an acknowledgement withdraws is no longer predictable from its publication alone. Given up on purpose: a pause on keyboard focus, which would need the focus REQ-NOTIFY-015 and PD-WORKSPACE-001 ("SHALL NOT take keyboard focus") refuse, and a 5 s floor, which answers no harm the record names and no measurement the record holds. Raised by [OQ-498](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-498).

> **Narrows:** REQ-NOTIFY-011, REQ-NOTIFY-022

*Raised as [OQ-498](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-498) by [R-093](../requests.md#r-093), 2026-11-03, and ruled the same day by the orchestrator's consortium under the owner's delegation ([R-072](../requests.md#r-072)); minted because a countdown that holds under the pointer departs from REQ-NOTIFY-011's "4200 ms after it becomes visible" and REQ-NOTIFY-022's "the same 4200 ms".*
