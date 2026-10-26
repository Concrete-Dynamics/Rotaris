[Product directives](../directives.md) › PD-SHELL-004

<a id="pd-shell-004"></a>

### PD-SHELL-004 — demo mode's network silence holds for the demo window, not for the process

In demo mode (REQ-SHELL-162) the silence REQ-SHELL-005 states SHALL hold for the **demo window**: nothing that window does,
and nothing done on its behalf, opens an outbound network connection for that window's whole lifetime — no cloud-credit
polling for it (REQ-SHELL-015), no request to a model provider, and no update check from it. It SHALL NOT be read as a
statement about the process: a non-demo window of the same instance checks for updates and reaches its providers normally
(REQ-STARTUP-057), and the one instance REQ-STARTUP-161 allows is never split so that a demo window has a process of its
own. Every other sentence of REQ-SHELL-005 still governs.

**As built.** Demo mode is not built: the palette's "Open demo window" entry declines with "no demo mode exists yet"
(`packages/ui/src/commands/registry.ts`). This directive governs it when it is.

**Why, and what it costs.** OQ-34: REQ-SHELL-162 lets a demo window be opened from a non-demo window, and REQ-STARTUP-057
lets that non-demo window check for updates, so a process-wide silence cannot hold once a mixed process exists, and with
one instance a mixed process is the only kind there is. The owner had the per-window reading stated in the requirement's
place. What it costs: a user running a demo window beside a real one has a process that does open connections, for the
real one.

> **Narrows:** REQ-SHELL-005

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-34.*
