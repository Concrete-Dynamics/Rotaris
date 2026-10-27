[Product directives](../directives.md) › PD-SHELL-008

<a id="pd-shell-008"></a>

### PD-SHELL-008 — the status strip carries the sandbox indicator after the file-access flag

REQ-SANDBOX-121's workspace indicator SHALL be an item of the status strip, standing right after the file-access flag
(`workspace-scoped` or `outside-workspace!`) and before the mode flag. It is inert text reading `sandbox: <backend>`, or
`sandbox: confined` for a record written before the backend was recorded; its accessible name is "Confinement backend",
and its tooltip and accessible description are its short form joined to a sentence worded as the Settings page's Sandbox
mode control words confinement, as REQ-SHELL-041 joins a flag's. It reads the focused session's record, so it is absent
with no session focused and for a session whose recorded result is not confined, and it is gone once a run of the session
is refused at the confinement gate until a run of it starts again. It is **shown at every width**: REQ-SHELL-047 gives it
no threshold. Every other item of REQ-SHELL-038, its order and its accessible names are unchanged.

**As built.** `statusStripSandboxItem` and `statusStripSafetyFlags` (`packages/ui/src/composer.ts`), fed by
`apps/desktop/src/renderer/main.tsx`; the refusal's record from `Sessions.refusedAtStart` (`packages/engine/src/sessions.ts`).

**Why, and what it costs.** OQ-184: REQ-SANDBOX-121 calls it a workspace indicator and places it nowhere; REQ-SHELL-038's
list has no item for it, REQ-SHELL-047 gives it no threshold, and "naming the backend" fixes no other word. The owner kept
it as built and had it added to the strip's list at that position. What it costs: one more item in a strip that hides two at
narrow widths and never hides this one, and a record that predates the backend's recording names no backend.

> **Narrows:** REQ-SHELL-038, REQ-SHELL-047, REQ-SANDBOX-121

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-184.*
