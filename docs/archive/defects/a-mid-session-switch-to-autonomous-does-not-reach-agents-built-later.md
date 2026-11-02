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

## Fixed 2026-09-22

Confirmed first, against the engine's delegation harness: a run started in `ask`, switched to
`autonomous` while the entry agent held the only port, then delegating, built its child with `ask`
(`children.test.ts`, red before the change). The non-defect reading (REQ-TOOLS-067's downgrade) could
not explain it — `PD-TOOLS-002` had already removed the downgrade, so nothing but the missing override
was left.

The repair is the second half of REQ-TOOLS-073, and the three adjacent gaps the note listed fall out of
it rather than being patched separately:

- `Sessions` holds a **session-level override** per Live record, installed fresh by `start` and by
  `launchContinuation` — one holder per RUN, which is what discards it at run end (REQ-TOOLS-075) — and
  the `toolsFor` closure reads it LIVE at every agent construction rather than spreading a value captured
  at run start. `Sessions.control`'s `setPermissionMode` records the requested name into it.
- `ToolPortContext` carries `modeOverride`, and the run host's port SELECTS at construction through
  `selectRequestedMode` (REQ-TOOLS-048) — which had no callers — from the persona pin, the override, and
  `runtime.permission_mode`. Under `PD-TOOLS-002` the selected name is the effective one.
- `personaResolverFor` carries `personas.<role>.permission_mode` onto the built persona, so the pin
  REQ-CONFIG-109 parses reaches the port at last. `setMode` refuses a change that would LOOSEN a pinned
  agent and names its persona; `Run.setPermissionMode` collects those names into `skipped_personas`
  (which was hardcoded `[]`), the log line and the transcript row (REQ-TOOLS-074).
- `setMode`'s hardcoded `sandboxed: false` is gone with the re-resolution it fed.

Evidence: `children.test.ts` — a child built after the switch takes the new mode (red before, green
after); `run-host/tools.test.ts` — three new cases over a real configuration and a real port for the
selection, the pin's direction and the live pin-aware change; `turn.test.ts` — the audit entry, the
transcript row and the log line name the skipped persona while the session's own mode is the requested
one. `pnpm check` green in the worktree and on merged `main` but for two suites failing identically on
`main` before this change: `terminal.test.ts`'s real `git diff` case (the recorded
`the-real-git-diff-terminal-test-times-out-on-win32.md`, exit 124) and `configuration.test.ts`'s egress
cost measurement, which passes when run alone.
