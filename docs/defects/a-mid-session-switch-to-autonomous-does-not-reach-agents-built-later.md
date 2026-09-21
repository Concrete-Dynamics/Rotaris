## A mid-session switch to autonomous does not reach agents built afterwards, so subagents keep asking

Observed 2026-09-21, owner report: selecting `autonomous` instead of `ask` (composer permission-mode control, mid-run) leaves subagents still asking. Expectation: the rule applies to every agent in the run.

Code reading (not yet reproduced against the built app with an evidence bundle): `Sessions.start` / `prompt` in `packages/engine/src/sessions.ts` captures `requestedMode: permission.effective` into `baseCtx` once, and the `toolsFor` closure spreads that same `baseCtx` for every agent built later. `Run.setPermissionMode` in `packages/engine/src/run/run.ts` updates only the live ports in `this.ports` — it records no session-level override and touches nothing `toolsFor` reads. So agents spawned after the switch (every delegated child) are constructed with the pre-switch mode. That matches the symptom exactly when the switch happens mid-run; a run *started* in `autonomous` gives every port `autonomous` at construction and is unaffected by this path.

Adjacent wiring gaps found while reading, same area: `selectRequestedMode` (REQ-TOOLS-048 pin/override rule) in `packages/agent-tools/src/policy.ts` has no callers; `personaResolverFor` in `apps/desktop/src/run-host/configuration.ts` never carries `personas.<role>.permission_mode` onto the built persona, so pins are parsed (REQ-CONFIG-109) then dropped; `setPermissionMode` hardcodes `skipped_personas: []`, so REQ-TOOLS-074 pin-aware skipping is unwired. And `setMode` in `apps/desktop/src/run-host/tools.ts` re-resolves the downgrade with `sandboxed: false` hardcoded, so a mid-run switch to `autonomous` downgrades whenever unattended even if sandboxed.

To rule out the non-defect reading: if the run is unattended, unsandboxed, and without `runtime.allow_unsandboxed_autonomous: true`, REQ-TOOLS-067 downgrades `autonomous` to `ask` for every agent — then subagents asking is correct. Distinguish via `session.start` (`permission_mode`) and the `permission_mode_downgraded` timeline entry (REQ-TOOLS-071).

## Specs

REQ-TOOLS-073, second half: a mid-session mode change records a session-level override of the *requested* mode for agents built later, which re-resolve the downgrade for their own context. The first half (live policy contexts) is implemented; the override half has no store — `baseCtx` keeps the start-of-run value.

REQ-TOOLS-030: a mode change takes effect for every live agent of the named session. Live ports are updated, but agents built after the change never see it, so the session as a whole does not converge on the new mode.

Adjacent, not the primary contradiction: REQ-TOOLS-048 (pin/override selection at agent construction) and REQ-TOOLS-074 (pin-aware mid-session change with `skipped_personas`) — `selectRequestedMode` uncalled, pins dropped before the port, `skipped_personas` always empty.

## Relevant files

- `packages/engine/src/sessions.ts` — `baseCtx` captures `requestedMode` once; `toolsFor` spreads the stale value for later agents.
- `packages/engine/src/run/run.ts` — `setPermissionMode` updates `this.ports` only, audits with `skipped_personas: []`, stores no override.
- `apps/desktop/src/run-host/tools.ts` — port builds its `PolicyContext` from `ctx.requestedMode`; `setMode` re-resolves downgrade with `sandboxed: false` hardcoded.
- `packages/agent-tools/src/policy.ts` — `selectRequestedMode` (REQ-TOOLS-048) defined, zero callers.
- `apps/desktop/src/run-host/configuration.ts` — `personaResolverFor` drops `personas.<role>.permission_mode`.
- `packages/config/src/sections/personas.ts` — the pin is parsed per REQ-CONFIG-109 but never consumed downstream.

Noticed 2026-09-21 by owner report; code path traced in the same session.
