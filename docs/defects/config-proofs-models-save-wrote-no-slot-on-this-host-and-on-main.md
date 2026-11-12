## config-proof's models save wrote no slot, on this host and on `main`

`pnpm config-proof --skip-build` stops at its second scenario, `models`, on this Linux host:

```
Error: the models save did not write the slot and its companion:
# workspace configuration
runtime:
  # the workspace states two keys and inherits the rest
  permission_mode: ask
  max_depth: 2
rotaris:
  delegation_strategy: single
```

The check above it passed — every `capture: select … → chosen` line the scenario logs was `chosen`, so the model slot's
control was driven — and the workspace file read after the launch ended holds neither `large_model: other` nor
`large_model_thinking: high`. Seen 2026-11-12 on the Linux host (Node 24.18.0, Electron 45.2.1, `WAYLAND_DISPLAY` and
`XDG_SESSION_TYPE` unset, without which every proof launch dies on this Wayland session), **twice on `main` at
`e23cf596` and once on the branch `feat/dictation-endpoint-credential` at `bbebaf4b`**, each time with the file run
alone and the host otherwise idle. It is therefore not load-dependent and not the branch's.

This is the same proof and the same shape as
[config-proof's runtime-save launch read no written key under load, and passed alone](config-proofs-runtime-save-launch-read-no-written-key-under-load-and-passed-alone.md),
which is the `runtime-save` scenario and passed alone on its re-run; this one is the `models` scenario and did not. The
two are kept apart because the earlier note's own open question — whether the write had not landed when the capture ended
the launch — is answered differently here: the scenario's Save is pressed well inside the capture's window, and the file
was read after the launch ended, so a write that landed would have been read.

Not established: whether the product's models save wrote nothing, or wrote and the write was lost. The run's evidence
under `.proof/config-proof/` was overwritten by the next run each time.

## Specs

REQ-CONFIG-279 and REQ-CONFIG-280 (Save commits the pending settings to the scope's file), REQ-CONFIG-329 (the Models
category's slot grid) and REQ-CONFIG-333 (the reasoning selector persists the option's value). A save that writes no slot
is a defect of the product until the harness is shown to be wrong.

## Relevant files

- `apps/desktop/scripts/config-proof.mjs`: the `models` scenario and the check at line 176.
- `apps/desktop/src/renderer/main.tsx`: `useConfiguration`'s save path, which the scenario's Save reaches.
- `packages/ui/src/settings/config-state.ts`: `savePayload`, which builds the `slots` and `slotThinking` the save carries.
- `packages/config/src/writers.ts`: `saveDesktop`, which writes them.
- `.proof/config-proof/`: the evidence, overwritten by each run.
