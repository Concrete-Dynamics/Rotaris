## `part-h-proof`'s launches close before the code-intelligence setup lets their run start, on Windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-supervisor` at `603dae9c` and `C:/dev/Rotaris-crw-wt-loc1-supervisor-base` at `0d89e971`.
Record-only: not repaired by the plan that saw it (loc1).

In a tree that holds the code-intelligence bundle (`pnpm code-intel:bundle`, as the acceptance tree does before its sweep),
every `part-h-proof` launch opens a fresh workspace, and the workspace's initialization runs `code-intelligence-setup`
("running code-intelligence-setup for … (background)"). The scripted run's first model call waits for it: in the
`loop-supervisor` launch at 14:58:19 UTC on 2026-10-20 the setup ended `success` at 14:58:25.298 and the orchestrator's first
call came at 14:58:26.188, about 7 s after the window opened. The proof's capture windows are 10 s (`loop-supervisor`,
`loop-reordered`) and 12 s (the `raw-count-*` launches), sized when a run started at once; the proof's scratch configuration
turns the `code_intelligence` server off, which does not stop the setup. Under load the setup took longer than the window:

- 14:21 UTC (CPU 53 % rising to 91 %, 13 Electron processes of other trees): `loop-supervisor` captured at 9.2 s with the
  setup still running, the session `running` with no tool call, "loop supervisor stop reason was absent".
- 14:58 UTC (46 % to 100 %, 6 to 13 others): `loop-supervisor` and `loop-reordered` passed, then `raw-count-varied` read no
  loop classification ("expected one loop classification dispatched …, found 0").
- 15:23 UTC on the base build `0d89e971` (33 % to 96 %, 13 to 20 others): the first shape again.

The same tree with no bundle (13:58 UTC, CPU 100 % beside another tree's six Electron processes) passed every launch. The
setup's duration on this host is the emulated x64 interpreter's (OQ-401's reading); a Linux acceptance tree has passed with
the bundle built.

## Specs

None of the product's: the proof's capture windows meet a setup the product runs as specified. `REQ-ORCH-099..107` and
ADR-0059 are what the launches verify.

## Relevant files

- `apps/desktop/scripts/part-h-proof.mjs` — `scratchAgentsYaml` and the launches' `ROTARIS_CAPTURE_AFTER_MS` windows.
