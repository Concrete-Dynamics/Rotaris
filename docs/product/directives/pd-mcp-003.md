[Product directives](../directives.md) › PD-MCP-003

<a id="pd-mcp-003"></a>

### PD-MCP-003 — a code-intelligence setup step gets 2 seconds to exit at every stop

**The grace.** When a code-intelligence setup step is stopped — its stage budget exhausted, the setup cancelled (the
user's Cancel, or the cancellation a workspace switch or a window's close makes), or the application closed while it runs
— the child SHALL be asked to terminate, given **2 seconds** to exit, and then force-killed, on Windows the whole process
tree and on POSIX the step's whole process group. One grace serves every stop; no stop gives the step longer.

**What is unchanged.** Everything else REQ-MCP-099 states: the three steps, their budgets, the 0.25 s polling, the UTF-8
encoding, the ask before the force-kill, a budget-exceeded step reported failed, the 400-character output and the
non-retryable "not a local launch" failure. REQ-WORKSPACE-092's bound — nothing the step launched still running 5 s after
the stop — and REQ-WORKSPACE-109's 5000 ms close are the limits the 2 s is chosen to meet; neither is changed.

**Why, and what it costs.** REQ-MCP-099 gives the step 5 seconds before the force-kill, and REQ-WORKSPACE-092 requires
everything it launched gone 5 s after the stop. Both cannot hold for a step that uses its whole grace: the force-kill,
its settling and the poll come after the 5 s. At a close the build already cut the grace to 2 s, measured inside both
bounds (a step and a descendant that both ignore SIGTERM, force-killed, the quit 2234 ms and 2274 ms; OQ-172). A switch
and a Cancel kept the full 5 s, and on Windows, the release platform, the step outlived the 5 s bound — 5.489 s after a
switch and 5.603 s after a Cancel (`workspace-proof`, 2026-10-02). One short grace is simpler and already proven at the
close. What it costs: a runtime that needs more than 2 s to wind down cleanly after being asked is force-killed sooner,
and may leave a partly written project or index for the next setup to redo.

> **Narrows:** REQ-MCP-099

*Raised by the owner, 2026-10-06, ruling OQ-172 as recommended; logged as [R-071](../requests.md#r-071). Minted on its branch as PD-MCP-001 and renumbered PD-MCP-003 before the merge, `origin/main` having taken PD-MCP-001 and PD-MCP-002 meanwhile.*

> **First execution, 2026-10-06.** Built the day it was written: `SETUP_TERMINATE_GRACE_MS` in
> `packages/mcp/src/setup.ts` is 2 s, and `SETUP_SHUTDOWN_GRACE_MS` is the same grace. **What was measured.** Three cases in
> `setup.test.ts` — the one grace, a cancelled step that ignores the ask force-killed 2 s after the cancellation, and a step
> past its budget force-killed 2 s after it — each red on the code before the change (5 s, 5150 ms and 5762 ms on this
> Linux host). **What was not measured.** The Windows `workspace-proof` that measured the misses was not re-run: this host
> is Linux. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Windows, 2026-10-20** (the Windows ARM64 session's B8; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `9f898a00`). The "not re-run" above is discharged.
> `workspace-proof`, twice: 49 passed, 0 failed, 5 skipped each time. The outgoing step after a switch had ended 2,621 and
> 2,513 ms after the switch answered (the log: 2.604 and 2.441 s from the cancellation's request to the stopped step); the first
> window's step 2,612 and 2,520 ms after its Cancel answered (2.581 and 2.527 s); the orderly quit ended the app in 2,706 and
> 2,713 ms, neither the step nor its descendant running 5 s later, and no "could not be delivered". It read 5.489 s and 5.603 s
> under the 5 s grace on 2026-10-02. No stand-in or runtime process was left straight after either run or 10 s later.
> `setup.test.ts` gained three Windows cases on the `family` fixture without its SIGTERM handlers (a cancel 2,433-2,665 ms, a
> 600 ms budget 3,015-3,050 ms, a 300 ms shutdown hurry 1,119-1,315 ms, the whole case, three runs each), and the four POSIX
> cases, run with their skips lifted in a scratch copy, passed too; `run-host/mcp.test.ts`'s shutdown case now runs there
> (2,549-2,626 ms, under the 5000 ms). **Still not measured:** a run host killed outright, whose step is then reached by
> nothing (OQ-169; `workspace-proof`'s host-lost case skips on Windows, having no `/proc`).
