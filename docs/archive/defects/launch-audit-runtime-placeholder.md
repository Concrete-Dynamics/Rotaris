## Launch audit recorded placeholder permission and runtime

The first focused execution of run-local launch permissions on 2026-09-13 found a session
recorded as `autonomous` whose launch audit carried `permission_mode: default` and
`config_snapshot: {}`. Fixed in the launch-permissions refactoring: effective permission and
the captured runtime section reach the audit. Configuration sections beyond runtime remain
absent from the snapshot and require further implementation.

## Specs

REQ-SESSION-016 requires permission facts to agree between state and launch audit.
REQ-SESSION-138 requires the configuration actually used at launch to be recorded once.
REQ-TRACE-470 requires both board permission fields to remain confined to that run.

## Relevant files

- `packages/engine/src/run/run.ts`: the audit previously used literal placeholders.
- `packages/engine/src/sessions.ts`: forwards the captured configuration snapshot.
- `apps/desktop/src/run-host/configuration.ts`: captures runtime configuration for the audit.
- `apps/desktop/src/run-host/launch.test.ts`: compares real session and audit records under overlapping launches.
- `docs/architecture/adr/0041-the-delivery-store.md`: first execution and correction evidence.

## Repaired — 2026-09-16

`launchConfigurationSnapshot` now captures every effective configuration section at run preparation. Persona prompt files become inline `resolved_system_prompt` text. The shared deterministic redactor and structural masking keep model keys, MCP headers/environment values, hook arguments and URL credentials out of the audit. `launch.test.ts` proves non-runtime sections and four representative secret channels across overlapping launches. Current focused suite: 12 passed. Current `pnpm check`: 1,886 passed, 25 skipped.
