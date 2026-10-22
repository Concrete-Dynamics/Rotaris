## approvals-proof's scripted answer looks for its button at a fixed 700 ms

The capture seam that answers an approval dialog in a proof (`apps/desktop/src/main/index.ts`, after "approval … presented")
waits `ROTARIS_CAPTURE_APPROVAL_MS` (700 ms by default) after `dlg.show()`, queries the dialog's buttons once, and gives
up with `capture: no "<label>" button in the approval dialog` when the renderer has not drawn them yet. Nothing retries,
and the dialog then times out as if nobody answered it. A dialog drawn later than the offset therefore reads as a
product failure. `approvals-proof` then fails with "the write's dialog was not answered "Approve for this session"",
because the audit records the write denied by `timeout` and the next two by `headless-policy`.

Met once on 2026-10-22 on the Linux agent host (Xvfb 1600×1000, software rendering), in the Tools suite run for the
dependency patch of R-081, while another worktree's `pnpm install` was running. `session.log` line 45: `capture: no
"Approve for this session" button in the approval dialog`. The run's audit:
`write_file deny timeout`, `read_file allow rule`, `write_file deny headless-policy`, `terminal deny headless-policy`.
The proof then passed on the same build, and once on `b0d1b3ff`, each run alone. It is the fixed-offset shape AGENTS.md
names under `pnpm app:drive` ("fixed offsets have produced false reds three times").

Not repaired: it is outside that task. A likely repair is to wait for the button (a bounded poll in the dialog, or the
renderer's own ready signal) instead of a single query at an appointment.

## Specs

None is contradicted by the product. The approval dialog's behaviour (REQ-TOOLS-052, REQ-TOOLS-065, `PD-TOOLS-005`, `PD-TOOLS-011`, as the proof's header cites them) is what the proof measures;
the seam that answers it is verification only and compiled out of a packaged build.

## Relevant files

- `apps/desktop/src/main/index.ts`: the scripted answer, `scriptedApprovalMs` and the single `executeJavaScript` query.
- `apps/desktop/scripts/approvals-proof.mjs`: the check that reads `capture: approval dialog (write_file) → clicked "Approve for this session"` from the log.
