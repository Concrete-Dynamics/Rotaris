# RUNTIME slice — architecture proposals — Part 4 — Escalations

Part 7 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Part 4 — Escalations

**ESCALATE-1 — Session retention.** Nothing in domains 01, 02, 07, 09 or 20 prunes *sessions*. There
is retention within a session (the 20,000-event journal cap of C4.7, the 5000-row transcript window
of C3.10, the ring caps of C3.11) but a workspace accumulates session directories without bound, and
deletion is only ever an explicit user action (REQ-SESSION-166, REQ-SESSION-182). Every session
listing is O(sessions) file reads (C3.9) and every history listing decodes two lines per session
(REQ-EVENTS-126), both against REQ-SHELL-150's 100 ms gesture budget. Options for the product owner:
(a) leave it unbounded and accept that the session browser degrades in long-lived workspaces; (b)
add a user-visible retention preference (keep N sessions, or N days) with explicit deletion
semantics; (c) leave it unbounded but add the derived read index of ADR-RUNTIME-03 alternative C so
the surfaces stay fast while nothing is deleted. This changes what the product *is* for a user with
a year-old workspace, so it is not mine to decide. Note that (c) is purely an architecture decision
and can be taken later without foreclosing (a) or (b).

**ESCALATE-2 — Controlling a run owned by a second application instance.** C2.1 requires every
control operation to be issuable against a run in a different process. C2.3 says the only channel to
a foreign session is the filesystem, and no filesystem control channel is specified. If the user
opens a second instance of the application on the same workspace and presses Stop on a session the
first instance owns, one of three things must happen, and the choice is product-visible: (a) the
control is **refused with a reason naming the owning process** — consistent with C2.2's "a `false`
outcome states the operation did not happen" and with REQ-SESSION-183's existing "another process
holds this" vocabulary, and requiring no new mechanism; (b) a **filesystem control mailbox** is
introduced under the session directory — which C3.1 forbids at the session-directory root, so it
would need a new specified location and a new set of ordering rules; (c) an **OS-level channel
between instances**, which REQ-EVENTS-178's refusal of any programmatic driving surface makes
awkward to justify. My reading is that (a) is what the specification already implies, and that C2.1's
"different process" means the run host versus the renderer within one application (REQ-EVENTS-178
says the consumer contracts describe "this application consuming its own runs in its own process").
But the specification does not say so, and the difference is visible to a user with two windows open
from two launches. See also OQ-1.

---
