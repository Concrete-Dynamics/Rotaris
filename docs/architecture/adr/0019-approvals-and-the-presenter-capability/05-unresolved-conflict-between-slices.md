# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — Unresolved conflict between slices

Part 5 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## Unresolved conflict between slices

**EXEC proposed that main register and revoke presenters "in particular on window close and on session
focus change". `REQ-MONITOR-253` forbids the consequence:** an approval request must reach the run
that asked for it **even when that run is not focused**. If a focus change revoked the presenter for
the previously focused session, that session's next `ask` would be classed unattended and denied by
`runtime.headless_approval_policy` — silently, and with the run still executing.

Two positions:

- **EXEC's, as written:** presenter registration is per session and tracks focus. Simple mapping from
  a window to the session it shows; breaks `REQ-MONITOR-253`.
- **Recommended:** presenter registration is **per application window, not per session**, and
  "unattended" is a property of the application — whether any live presenter is attached — rather than
  of the focused session. `REQ-TOOLS-053`'s "the session has no registered approval presenter" is then
  read as "no presenter is attached to this session's owning application". A focus change never
  revokes; a window close revokes that window's registration and the last one closing makes the
  application unattended, which is exactly the behaviour `REQ-TOOLS-069` describes for a torn-down
  presenter. Routing to a dialog is then by request id (ADR-0013), not by focus.

The recommendation is taken in the decision above. It should be confirmed, because it changes what
`REQ-TOOLS-069`'s "the presenter was torn down" means in a multi-window application (open question
OQ-4). *(Confirmed 2026-10-06 by the owner, [R-071](../../../product/requests.md#r-071): per application window, and "torn down" means no window's registration remains.)*
