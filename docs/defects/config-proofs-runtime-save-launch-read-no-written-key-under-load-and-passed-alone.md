## config-proof's runtime-save launch read no written key under load, and passed alone

Seen on 2026-11-04 by hardening plan hrda's bundle `hrda-boundary-refusal-line` (its branch over `3bf27f00`; Windows 11
ARM64, Node 26.13.0, Electron 44.3.0), running the configuration-and-startup suite `pnpm verify:plan` named for its diff.
`pnpm config-proof --skip-build` stopped at its first scenario, `runtime-save`:

```
Error: the runtime save did not write allow_outside_workspace:
# workspace configuration
runtime:
  # the workspace states two keys and inherits the rest
  permission_mode: ask
  max_depth: 2
rotaris:
  delegation_strategy: single
```

`clicked('runtime-save', …)` had passed, so the log recorded all four presses (the Runtime category, the outside-workspace
toggle, the confirmation's Yes, Save) as made on their controls; the workspace file was read after the launch ended and held
none of the save. CPU load was 62 % from other sessions before the launch, no other tree's Electron running. Re-run once
alone two minutes later (CPU 100 % from other sessions, still no other Electron) the whole proof passed, `runtime-save`
included. The run's evidence was overwritten by the re-run, so when Save was pressed against the launch's
`ROTARIS_CAPTURE_AFTER_MS: '10500'` end was not read.

Not established: whether the save's write had not landed when the capture ended the launch (Save's deadline `@~9000` leaves
1.5 s before the fixed end at 10.5 s, and a press that comes late under load leaves less), or whether the press reached a
Save the bar had not yet enabled. A repair would wait for the file's write rather than end at a fixed offset; not ruled here.
The bundle's own change (a `warning` line for a refused process message or command, OQ-485) touches neither path: no
`refused a message` or `refused a command` line appears in any log the suite left under `.proof/` (the re-run's among them) but
`driver-proof`'s deliberate two.

## Specs

None contradicted that is known: the proof's scenario 1 asserts that Settings › Runtime's Save writes the key
(ADR-0037's write path); a red that does not reproduce alone may be the harness's fixed end, which is not shown.

## Relevant files

- `apps/desktop/scripts/config-proof.mjs` — scenario 1, `runtime-save`: the click chain with its `@~` deadlines and
  `ROTARIS_CAPTURE_AFTER_MS: '10500'`, then `readFileSync(s1.workspaceFile)`.
