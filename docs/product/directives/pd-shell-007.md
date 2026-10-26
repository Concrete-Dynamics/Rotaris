[Product directives](../directives.md) › PD-SHELL-007

<a id="pd-shell-007"></a>

### PD-SHELL-007 — the terminal's 100 ms echo is held on a host whose CPUs are not oversubscribed

REQ-SHELL-166's echo-latency criterion, a keystroke's character visible in the grid within REQ-SHELL-150's 100 ms gesture
budget from the key press to the frame that shows it, SHALL apply on a machine whose CPUs other programs do not
oversubscribe: a host whose load average is at or below its CPU count. A reading taken while other processes keep the load
above the CPU count is evidence about the host, not about the product, and is taken again with the host quiet before it is
called a failure. A reading that misses the bound on a quiet host is the product's. The bound itself is not relaxed, and
every other criterion of REQ-SHELL-166 is unchanged.

**As built.** `pnpm terminal-proof`'s `live.echoUnder100ms` reads from the key event's own time stamp (`from: 'event'`) and
records the host's load average and CPU count beside the reading (`results.live.echoLoad`) and how long the key waited in the
renderer's queue (`queuedMs`).

**Why, and what it costs.** OQ-176: 120 runs on 2026-10-01 went red ten times, each at a load average of 9.1 to 13.6 on four
CPUs, each time one keystroke of three at 100 to 144 ms, while the same probe read 20 to 30 ms with nothing beside it.
REQ-SHELL-150's "sustained load" is a burst of changes in the shell, and REQ-SHELL-166 states no host condition. The owner
had the condition stated. What it costs: no promise is made about echo on a machine that other programs keep busier than
it has CPUs.

> **Narrows:** REQ-SHELL-166

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-176.*
