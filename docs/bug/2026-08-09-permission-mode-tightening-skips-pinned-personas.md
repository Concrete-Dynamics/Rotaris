# Mid-run permission tightening silently skips persona-pinned agents

> Found: 2026-08-09, while writing core-side coverage for SWR-2509 (wave 1 of the Phase 2 work).
> Status: **confirmed** — reproduced with a throwaway probe against current `master`.
> Severity: **high** — a user reining in a running agent is told it worked when it did not.

## What happens

`change_session_permission_mode` (`src/rotaris_core/permissions/modes.py`) skips every engine
whose persona pins its own `permission_mode`:

```python
if engine.persona in pinned:
    continue
```

The guard is **direction-blind**. It exists so a session-level change cannot *widen* a
persona that was deliberately restricted — but it applies equally when the session mode is
being *tightened*.

Reproduction: pin a persona to `autonomous`, start a run, then switch the session to
`restricted`. That persona's engine — and every agent built for it afterwards — keeps
running `autonomous`. The call returns `mode="restricted"` and the audit log records
`effective_mode: restricted`, so the user, the UI chip and the audit trail all agree that
the run was locked down while one agent is still allow-by-default.

## Why it matters

This is the failure mode permission modes exist to prevent. The user's action in the case
they care most about — a run doing something alarming, reach for the restrictive mode — is
accepted, confirmed and audited without taking full effect. The audit log is actively
misleading here, which is worse than no audit.

## Decision needed before fixing

SWR-2509's wording is "must not **widen** a pinned persona". Read strictly, the code
matches the spec and the *spec* is what is wrong. Two candidate resolutions:

1. **Compare restrictiveness, not identity** — a session change applies to a pinned persona
   when it is at least as restrictive as the pin, and is skipped only when it would loosen
   it. Requires a defined ordering over `restricted` < `ask` < `autonomous`.
2. **Report the exception** — keep the current behaviour but make the return value and the
   audit entry name the personas that were not changed, so the confirmation stops being a
   lie. Weaker, but honest and much smaller.

Option 1 with the audit naming of option 2 is the likely answer, but the ordering it needs
is a spec decision, not an implementation detail.

## Coverage note

The tests added in `tests/integration/test_permission_mode_midsession.py` deliberately
assert **only** the widening direction, so nothing wrong is locked in by them. Whichever
resolution is chosen needs its own test asserting the tightening direction.
