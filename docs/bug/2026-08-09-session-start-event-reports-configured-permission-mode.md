# `session.start` reports the configured permission mode, not the one actually in force

> Found: 2026-08-09, by the code review of an unrelated unit in wave 1 of the Phase 2 work.
> Status: **confirmed by reading**; not yet reproduced in a run.
> Severity: medium — an automated consumer draws the wrong conclusion about a run's safety.

## What happens

`RalphLoop._publish_session_start` (`src/rotaris_core/ralph/loop.py`, around line 598)
publishes `permission_mode` straight from the configuration. SWR-2508's downgrade —
unattended plus unsandboxed forces the mode to `ask` — happens elsewhere, in
`agents/factory.py::_build_permission_engine`, and is not reflected back into the event.

A downgraded run therefore streams:

```json
{"event": "session.start", "permission_mode": "autonomous", "sandboxed": false}
```

while every tool call in it is actually resolving through `ask`.

## Why it matters

The `session.start` event is the SWR-1828 stream's answer to "what is this run allowed to
do", and it is the field a CI job or an SDK consumer would gate on. Reporting `autonomous`
for a run that is in `ask` is wrong in the direction that looks *more* permissive than
reality — which will read as alarming rather than dangerous, but it is still a consumer
making decisions from a false statement. The same field pairing (`autonomous` +
`sandboxed: false`) is the exact combination the safety rule exists to prevent, so a
consumer checking for it would flag a run that is in fact protected.

The SWR-2507 verification protocol routes verifiers away from the event stream for this
reason and tells them to read the audit log instead — a workaround, not a fix.

## Fix sketch

Publish the **effective** mode, resolved the same way the engine factory resolves it, and
consider carrying both (`requested_permission_mode` + `permission_mode`) so a consumer can
see that a downgrade happened rather than only its result. Related to the audit-log
`previous_mode` defect in
[2026-08-09-permission-audit-previous-mode-inaccurate.md](2026-08-09-permission-audit-previous-mode-inaccurate.md):
both come from the requested mode being stored where the effective one belongs.
