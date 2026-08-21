# `approval.requested` does not say which agent is blocked

> Found: 2026-08-09, while implementing the emission of that event (wave 2 of the Phase 2 work).
> Status: **confirmed** — the field does not exist on the model.
> Severity: medium — it defeats the event's main purpose under the conditions it matters most.

## What happens

`ApprovalRequestedEvent` carries `request_id`, `tool_name`, `rule_id`, `summary`,
`resolver`, `timeout_seconds` and `unattended_reason`. It carries **no agent identity** —
no agent name, no persona, no child task id.

The event exists so an automated consumer can tell "this run is blocked waiting for a
human" apart from "this run is slow". Rotaris runs a delegation DAG: several children can
be in flight at once, up to a fan-out of eight. When one of them blocks on an approval, the
event says a terminal command is waiting — and not which agent asked, so neither a
supervisor UI nor an operator can route the question to the work it belongs to.

The gap was invisible while specifying the event, because the requirement was written from
the point of view of one run. It became obvious the moment a producer had to fill the
fields in.

## Fix sketch

Add the agent's canonical name and persona to the event, populated from the resolving
engine's binding (the permission engine already knows its persona — `change_session_permission_mode`
skips persona-pinned engines by exactly that attribute). Additive within schema version 1,
so no consumer breaks.

Consider the same for `permission.decision`, which has the identical blind spot for denials:
"a command was denied" without "denied for whom" is nearly as hard to act on.

## Related

Same wave, same cause — fields specified before anyone tried to produce them:

- `GateRepairEvent.remaining_attempts` has no producer; it is derived arithmetic
  (`max(max_attempts - attempt, 0)`).
- `ApprovalRequestedEvent.unattended_reason: "timeout"` was unreachable — the event is
  raised before the wait. Docstring corrected during integration.
- `CheckpointRestoredEvent.safety_sequence` was documented as `None` on refusal, which is
  wrong for a restore whose safety checkpoint succeeded before Git refused. Docstring
  corrected during integration.
