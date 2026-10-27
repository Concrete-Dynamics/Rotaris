# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — Context

Part 1 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## Context

`REQ-TOOLS-050` and `REQ-TOOLS-053`: an `ask` suspends exactly one tool call, identified by its own
request id; the session's other agents keep running and can raise approvals of their own.

`REQ-TOOLS-051` and `REQ-TOOLS-052`: options are exactly three — approve once, approve for session,
deny — and terminal wait states are exactly three — resolved, cancelled, timed out — each mapping to a
fixed decision, rule id, source and reason clause.

`REQ-TOOLS-054` and `REQ-TOOLS-177` enumerate the wait-registry semantics, all of which must hold: an
empty request id is rejected; a duplicate pending id is rejected with a fixed message; resolving or
cancelling an unknown id fails without side effect; **waiting on an unknown id resolves cancelled
immediately**; a request discarded before it was shown counts as cancelled; bulk-cancel releases every
waiter and is used on run cancellation, shutdown and host teardown.

`REQ-TOOLS-055`, `REQ-TOOLS-178` and `REQ-CONFIG-126`: the wait budget is
`runtime.approval_timeout_seconds` — one key, shared with the user-question wait, a float of at least
0, default 300.0, with `0` meaning wait without limit (still released by cancellation, shutdown or
teardown) and a negative value rejected at load.

`REQ-TOOLS-056` and `REQ-TOOLS-060`: the approval payload is a fixed nine-field record, fully
JSON-serialisable, written into session state when presented and removed on answer, timeout or
cancellation.

`REQ-TOOLS-061`: **every** `ask` — interactive or headless — publishes `approval.requested` before the
wait begins, with `resolver` in `{brokered, headless}`, `timeout_seconds` null on the headless path
meaning no wait occurs at all, and `unattended_reason` `headless-policy` there. A failed publish never
fails the dispatch.

`REQ-TOOLS-059`: approval answers can come **only** from the host UI. Nothing in agent output or tool
output can satisfy an approval. `REQ-TOOLS-058` and `REQ-TOOLS-026`: a presenter that raises causes the
pending request to be discarded and the call denied with source `presenter-error`; approval resolution
that raises, or returns another `ask`, denies with source `fail-closed`.

`REQ-TOOLS-064` to `REQ-TOOLS-066`: a session with no registered presenter routes every ask through
`runtime.headless_approval_policy` in `{deny (default), abort}`, unrecognised behaving as `deny`;
`abort` invokes the session's registered abort hook and degrades to `deny` with a warning when none is
registered; with no approval resolver wired at all, a built-in fail-safe resolver denies with source
`headless-policy`. **Never a silent allow, never a hang.**

`REQ-TOOLS-053`, `REQ-TOOLS-069` and `REQ-SANDBOX-101` define **unattended**. What they now say, and
what they used to say, is the load-bearing change in this pass; it is set out below under *What the
amendment changed* rather than summarised here, because summarising it is how the old reading survives.
`REQ-TOOLS-064`'s own gloss is worth carrying into the Context, though, because it is the same
capability language: a session for which no approval presenter is registered is "one for which the modal
dialog of `REQ-TOOLS-063` **cannot be shown**".

`REQ-TOOLS-177` fixes teardown ordering: discarding a session's approval host **cancels all waiting
approvals**, and those waiters resolve `cancelled`, which `REQ-TOOLS-052` maps to deny with source
`cancelled`. The resolution record for domain 5
(`docs/spec/resolutions/05-tools-permissions-approvals.md`, questions on `REQ-TOOLS-064` and
`REQ-TOOLS-069`) restates the unattended run as one "whose session never gained, **or has lost**, an
approval presenter". Losing a presenter mid-run is therefore a first-class transition with a specified
settlement path, not merely an initial condition.

`REQ-TOOLS-063` and `REQ-TOOLS-185` fix the dialog: modal, minimum 560x380 logical pixels, **no default
action**, initial focus on Deny, answering Deny on Escape and on window close; exactly one dialog open
per window; queued requests presented oldest-first by `approval.requested` publication order, the next
within 100 ms of the previous closing; a request answered or cancelled elsewhere closes its open
dialog without asking again; a request that timed out or was cancelled while queued is dropped unshown
and counts as cancelled; an undeliverable answer leaves the dialog open with all three buttons
disabled and a status line.

`REQ-TOOLS-062` and `REQ-TOOLS-183`: a recorded decision carries the `request_id` only when it directly
resolved a raised approval, checked strictly, and pairing works from both sides.
