## Windows proof reruns leave persona and recovery readings red

Found 2026-10-16 while verifying R-073/R-074 on Windows ARM64, based on `8080fbda`. The full unit gate passes with 6,500 tests, but these additional built-app proof readings remain red:

- `compression-proof`, `root-and-child`: the store records two compressions and the main inspector reads `2 compressions across the run.`. The log records a click on `Pop out`, but neither requested `persona-probe-at` reading is recorded before the capture ends. The proof reports the persona name/count as undefined. This is a missing persona reading, not evidence that the stored count is wrong. That launch also logs code-intelligence setup failing because this worktree has no bundled runtime; its effect on the pop-out is unidentified.
- `resilience-proof`, `child-timeout-inspector`: the alpha input ceiling reads null rather than 100,000.
- `resilience-proof`, `fatal`: the dialog measurement reads 546 px rather than 560 px.
- `resilience-proof`, `auth-fallback`: the minimum-size launch records no `1000x680` window-size reading.

Evidence is under `.proof/compression-proof` and `.proof/resilience-proof` in `Rotaris-crw-wt-child-cap`; console logs are `child-cap-compression-proof-awake.log` and `child-cap-resilience-awake.log` in the system temporary directory. These reruns used a temporary wake request after earlier runs had been interrupted by power-button Modern Standby. Cause and product-versus-harness attribution for these readings are not established. No repair is claimed here.

## Specs

These proofs verify REQ-MONITOR-086/281 (run-wide compression display), REQ-MONITOR-052/066 (the active model and input ceiling), and REQ-NOTIFY-072 (the recovery dialog).

## Relevant files

- `apps/desktop/scripts/compression-proof.mjs` — run-wide count launch and persona probes.
- `apps/desktop/scripts/resilience-proof.mjs` — inspector and authentication-recovery readings.
- `apps/desktop/src/main/capture/seams.ts` — deferred persona-window probes.
