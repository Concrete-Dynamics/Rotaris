# Audit log's `previous_mode` records the requested mode, not the mode that was in effect

> Found: 2026-08-09, while writing core-side coverage for SWR-2509.
> Status: **confirmed by reading**; not asserted in the committed tests, because the correct
> expectation fails against current code.
> Severity: low-to-medium — the entry is wrong exactly when a safety downgrade happened.

## What happens

In `src/rotaris_core/permissions/modes.py` (around line 197), `set_session_mode_override`
stores the **requested** mode name, and the next change reads it back as the previous one:

```python
previous = session_mode_override(...) or requested_permission_mode(config)
```

When SWR-2508 downgrades a request (unattended, unsandboxed, no opt-in), the run is in
`ask` while the override holds `autonomous`. A later switch to `restricted` therefore
records:

```
previous_mode: "autonomous"      # never true
effective_mode: "restricted"
```

The same entry's own earlier line correctly recorded `effective_mode: ask` for the
downgraded switch — so the log contradicts itself across two entries.

## Why it matters

The audit log is the artefact someone reads to reconstruct what a run was actually
permitted to do. `previous_mode` is the field that makes a sequence of switches
reconstructible, and it is wrong precisely in the case that involves a security downgrade.

## Fix sketch

Store the **effective** mode alongside the requested one in the session override, and read
the effective value for `previous_mode`. Keeping both is worth it: "asked for autonomous,
got ask" is itself useful audit information, and the SWR-2508 announcement already computes
both values.
