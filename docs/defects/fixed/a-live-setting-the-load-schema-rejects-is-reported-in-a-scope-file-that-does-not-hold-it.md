## A live setting the load's schema rejects is reported in a scope file that does not hold it

## Outcome (2026-10-14, fin46 `fin46-accept1-17`): repaired at the handover

The reviewer's premise is made true rather than assumed. `liveStateProblems(live)` (`packages/config/src/tiers.ts`) is the
load's own schema over each value `overlayLiveState` lays on the merged document, reported at the loader's path: every
Tier B runtime key through `validateRuntimeField` (REQ-CONFIG-111), the breaker switch and the compression threshold
through their section readers, the slots, slot reasoning levels, entry role, session override and delegation strategy
against their vocabularies. The run host's `config.liveState` (`apps/desktop/src/run-host/dispatch.ts`) runs it first; a
state with a problem is refused (`config.live-state-invalid`, "The live settings were refused", each path and message in
the detail and in a `warn` line) and the state held before stays, so the next run start never meets the value. The comment
beside `overlayLiveState`'s `resolveMerged` call says why the files' attribution is the only one it needs, and that a
caller skipping the check still gets the files'. `statingFile` is unchanged: it can only name a file, and no overlay
value reaches it.

Pinned by `packages/config/src/writers.test.ts` ("liveStateProblems is the load's schema over each value the overlay lays
on", and "a live state liveStateProblems passes overlays with no fault, and one it refuses is the one that faulted in a
file's name", which keeps the old attribution visible at the pure function) and by
`apps/desktop/src/run-host/dispatch.test.ts` ("config.liveState installs only a live state the load's schema accepts"),
whose refusal case fails on `0c513e0`, where the handover acknowledged the state and installed it.

What it does not change: the Settings screen's widgets already clamp inside these bounds (REQ-CONFIG-322/325), and the
board's elevation hands over `{runtime: {permission_mode: autonomous}}` and then `{}`, both accepted; neither path changes
behaviour. The renderer still ignores a refused handover (`void bridge.command(...)`), as it ignored an acknowledged one.


Noticed 2026-10-14 by the reviewer of fin45 (`fin45-config-and-terminal`, optional finding on Task 1) and taken as acceptance
finding C8 of fin46; confirmed on `fin46-accept1-17` (cut from `origin/main` `0c513e0`).

ADR-0037's Tier B (`overlayLiveState`, `packages/config/src/tiers.ts`) lays the settings screen's current values on the
loaded configuration's merged document and runs the loader's own passes over the result (`resolveMerged`), handing them the
load's `raw` scope documents. A fault on a value the overlay supplied is then attributed by `statingFile` to whichever scope
file states that path, or to the workspace `agents.yaml` when none does, and the run is refused with REQ-CONFIG-478's
remedy, "Correcting or removing that key in the named file". Neither file holds the value at fault.

The fin45 reviewer read this as probably unreachable, "because overlay values are validated on assignment". They are not at
the run host: `dispatch.ts` takes `config.liveState` with `h.liveState = req.state as LiveState`, and the contract main
parses it with (`LiveStateSchema`, `packages/contracts/src/config.ts`) types `runtime` as a record of unknown values and
`compressorThresholdPercentage` as any integer. Only the renderer's widgets clamp what they commit (REQ-CONFIG-322/325), so
through the Settings screen it is not reached; any other sender of the command reaches it.

Reproduced with `loadConfiguration` over a global `agents.yaml` holding `runtime:\n  max_depth: 4` and
`overlayLiveState(loaded, { runtime: { max_depth: 0 } })`: the report reads "`<global>/agents.yaml` at runtime.max_depth
(global scope): must be at least 1, got 0", naming a file that holds 4. `overlayLiveState(loaded,
{ compressorThresholdPercentage: 0 })` names the workspace `agents.yaml` (workspace scope), a file that does not exist.

## Specs

REQ-CONFIG-478 (the report names the offending file); REQ-CONFIG-111 ("the `runtime:` section validates on assignment as
well as on load, so a settings surface writing an invalid value onto a loaded configuration is refused at the moment of the
write"), which the Tier B handover does not apply.

## Relevant files

- `packages/config/src/tiers.ts` — `overlayLiveState` and its `resolveMerged` call with `config.raw`.
- `packages/config/src/load.ts` — `statingFile`, which can only name a scope file.
- `apps/desktop/src/run-host/dispatch.ts` — `config.liveState`, which installs the state unchecked.
- `packages/contracts/src/config.ts` — `LiveStateSchema`.
