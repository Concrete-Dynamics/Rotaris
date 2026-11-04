## Proof launches on Windows read the operator's own Claude Code settings for hooks

A proof or live-run launch on Windows discovers imported Claude Code hooks (REQ-HOOKS-110) from the operator's real
`%USERPROFILE%\.claude\settings.json`. `claudeSettingsPath` (`packages/hooks/src/external.ts`) answers
`ROTARIS_CLAUDE_SETTINGS_PATH` when it is set and `join(homedir(), '.claude', 'settings.json')` otherwise, and the run host
reads it each time it assembles a run's hooks (`apps/desktop/src/run-host/hooks.ts`) and for the hooks listing. The harness
(`proofIsolationEnv`, `apps/desktop/scripts/lib/harness.mjs`) sets no `ROTARIS_CLAUDE_SETTINGS_PATH`, and on Windows it
cannot move `USERPROFILE` (that kills Electron before it paints), so `homedir()` is the operator's. On POSIX the scratch
`HOME` every launch is given already isolates it.

What it costs: the imported-hooks list a proof sees, and the hooks a run would run once enabled by the policy, depend on the
operator's machine. A hook enabled in a scratch profile's policy file would run the operator's own command.

Not observed in a failing proof: the operator's settings file on this host (2026-11-04, Windows 11 ARM64) declares no
`hooks` key, so nothing was imported. Inferred from the code while repairing the skill-root half of the same isolation gap
(`docs/archive/defects/slash-proof-counts-a-skill-from-the-real-home-as-a-fixed-skill-command.md`, acceptance hrda AF-16),
which this note is the hooks half of; recorded, not repaired, since it lies outside that task. The likely repair is the
harness naming `ROTARIS_CLAUDE_SETTINGS_PATH` at a file in the scratch home on every launch, with the proofs that measure
imported hooks keeping their own value.

## Specs

None contradicted by the product: REQ-HOOKS-110 names the user's Claude Code settings file, and the variable is a product
variable a shipped build answers (`apps/desktop/scripts/lib/seam-check.test.ts`, `PRODUCT`). The harness's claim that a
launch is isolated from the operator's machine is what does not hold on Windows.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs`: `proofIsolationEnv`, which names no settings path.
- `packages/hooks/src/external.ts`: `claudeSettingsPath`, the home fallback.
- `apps/desktop/src/run-host/hooks.ts`: the two reads of the settings file.
