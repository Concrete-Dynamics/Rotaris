---
req-id: SWR-2509
status: approved
trace: required
test: required
title: "Composer permission-mode selector (Rotaris)"
epic: SWR-2500
priority: P1
date: 2026-08-07
---

# SWR-2509 — Composer permission-mode selector (Rotaris)

The permission mode presets of SWR-2503 have no desktop control: today the only
way to pick `restricted` / `ask` / `autonomous` is to hand-edit
`<workspace>/.rotaris/agents.yaml`. Rotaris is the primary interface, and
every competing harness puts the mode one click from the prompt box.

Rotaris MUST offer a permission-mode selector directly beneath the composer —
the text input used to send instructions to an agent — alongside the existing
persona / model / reasoning chips.

- The selector lists the SWR-2503 presets in strictest-first order
  (`restricted`, `ask`, `autonomous`) and shows the mode currently in effect
  for the workspace.
- Choosing a mode persists it to `runtime.permission_mode` in the workspace
  config (`<workspace>/.rotaris/agents.yaml`), so the choice survives a
  restart and governs subsequent runs through the normal config layering.
- Choosing `autonomous` requires an explicit confirmation, since it widens what
  agents may do without asking; declining restores the previous selection and
  changes nothing.
- The selector stays usable while a run is in progress. Changing it mid-run
  applies the new mode to the focused session per SWR-2503's mid-session
  clause: the change takes effect on the next tool dispatch, is re-resolved
  through SWR-2508 (a mid-run switch to `autonomous` on an unattended,
  unsandboxed run is still downgraded), is recorded in the SWR-2506 audit log,
  and is announced in the transcript.
- A persona-level `permission_mode` override keeps precedence over the
  selector **only in the widening direction**. The presets are ordered by
  restrictiveness — `restricted` < `ask` < `autonomous` — and a session-level
  change applies to a pinned persona when it is at least as restrictive as the
  pin, and is skipped only when it would loosen it. A persona deliberately
  pinned to a mode is configuration the selector must not widen; it is not a
  licence to keep running permissively while the user is trying to rein the
  session in.
  - **Corrected 2026-08-09.** The original wording said only "must not widen",
    and the implementation read it as an unconditional skip, so a mid-run
    *tightening* also failed to reach pinned personas — while the call returned
    the new mode and the audit log recorded it as effective. A user reining in a
    misbehaving run was told it worked when it had not. The direction-blind skip
    was the defect; this clause is the rule it should always have expressed.
  - Whatever is skipped MUST be named: the result of a mode change and its
    SWR-2506 audit entry list the personas the change did not apply to, so a
    confirmation can never be broader than what actually happened. "Applied
    everywhere" and "applied except to these two personas" are different facts
    and must be reported differently.
- The mode in effect is visible outside the composer too: the status bar shows
  it, and the Settings → Runtime tab offers the same control over the same
  setting, under its explicit Save/Discard flow.

Persistence reuses the desktop settings save path, so pressing the selector
flushes any other pending settings edits at the same time — the same behaviour
as the Settings tab's Save button.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Selector reflects and updates the stored mode; `autonomous` is confirmed and revertible; the mode round-trips through the workspace config | Composer widget + settings store/persistence | `apps/rotaris/tests/test_permission_mode_selector.py` |
| Integration | A mid-run change reaches the live session: the worker forwards it to the permissions layer and the transcript announces it | Desktop run bridge → permissions layer | `apps/rotaris/tests/test_permission_mode_selector.py::test_a_mid_run_change_reaches_the_running_session`, `::test_the_worker_announces_a_mid_run_mode_change_in_the_transcript` |
| User-flow E2E | A user picks a mode under the composer, it is written to the workspace config, and the next run starts in that mode | Public product boundary → user-observable result | `apps/rotaris/tests/test_permission_mode_selector.py::test_choosing_a_mode_persists_it_and_starts_the_next_run_in_it` |

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
