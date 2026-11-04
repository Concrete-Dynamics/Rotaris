## Windows proof reruns leave persona and recovery readings red

Found 2026-10-16 while verifying R-073/R-074 on Windows ARM64, based on `8080fbda`. The full unit gate passes with 6,500 tests, but these additional built-app proof readings remain red:

- `compression-proof`, `root-and-child`: the store records two compressions and the main inspector reads `2 compressions across the run.`. The log records a click on `Pop out`, but neither requested `persona-probe-at` reading is recorded before the capture ends. The proof reports the persona name/count as undefined. This is a missing persona reading, not evidence that the stored count is wrong. That launch also logs code-intelligence setup failing because this worktree has no bundled runtime; its effect on the pop-out is unidentified.
- `resilience-proof`, `child-timeout-inspector`: the alpha input ceiling reads null rather than 100,000.
- `resilience-proof`, `fatal`: the dialog measurement reads 546 px rather than 560 px.
- `resilience-proof`, `auth-fallback`: the minimum-size launch records no `1000x680` window-size reading.

Evidence is under `.proof/compression-proof` and `.proof/resilience-proof` in `Rotaris-crw-wt-child-cap`; console logs are `child-cap-compression-proof-awake.log` and `child-cap-resilience-awake.log` in the system temporary directory. These reruns used a temporary wake request after earlier runs had been interrupted by power-button Modern Standby. Cause and product-versus-harness attribution for these readings are not established. No repair is claimed here.

*Seen again 2026-11-01* (Windows 11 ARM64, Node 26.13.0, `main` at `06023413`, the 37-proof sweep `pnpm verify:plan
--base=a9e1f29b` named after the nine landings of that day, run one proof at a time): `resilience-proof` ended red 3 of 23.
`child-timeout-inspector` read as above (alpha measured against null, not 100,000); `fatal` read 544 px rather than 560,
where the first sighting read 546; and `auth-fallback-revise`, green on every earlier run, "did not exit within 15000 ms
of the driver's quit: SIGTERM did not end it within 15009 ms; SIGKILL did", the scenario at 44 s and the proof at 521 s,
25th of the 37 in sequence. On a fresh build of the same commit, rerun at once with the host otherwise idle, 21 of 23
passed: `auth-fallback-revise` green in 12 s, the other two red with the same readings. So the quit timeout is a reading
taken on a loaded host, and the two inspector and dialog readings repeat across builds and dates. The note's other two
readings did not recur: `compression-proof` and the `auth-fallback` minimum-size launch were green in the sweep. No repair
is claimed here either.

**2026-11-03, R-091 bundle A2's tree** (`hrd1-secure-windows-and-fuses` merged with `origin/main` at `e6a79b43`; Windows 11
ARM64, Node 26.13.0, Electron 44.3.0), with the host's CPU at 100 % from other trees' gates and proofs and 6 to 20 Electron
processes of theirs beside it. `resilience-proof` ran twice and went red on 6 and then 10 scenarios: the two this note
holds (`child-timeout-inspector`, here "the child did not succeed on the fallback under its configured key", and `fatal`),
quits the harness could not reap within 15 s (`override`, `quota-retry`, `generic`, `reauth` once, `auth-fallback-dialog`),
launches that wrote no driver endpoint within 60 s (`keep-waiting`, `switch-over-override`, `two-waits`, `generic` once),
one "no reply to hello within 5000 ms" (the hello-bound note) and the minimum-size launch with no size reading. No idle
host was available to rerun it alone, so these are loaded-host readings not yet separated from the product; the bundle
changed no quit, launch or child path. No repair is claimed.

Seen again by R-091's bundle D3 (2026-11-04), in `C:/dev/Rotaris-wt-hrd1-fencehardeni` at `1d663de6` plus the bundle's two commits (Windows 11 ARM64, Node 26.13.0, Electron 44.3.0; one proof at a time, no other tree's Electron running, CPU 20 % before the launch): `resilience-proof` red on 3 scenarios, `child-timeout-inspector` (alpha measured against null), `fatal` (546 px) and `auth-fallback` (no `1000x680` reading). The bundle changes only the fence and the file tools' write.

## Specs

These proofs verify REQ-MONITOR-086/281 (run-wide compression display), REQ-MONITOR-052/066 (the active model and input ceiling), and REQ-NOTIFY-072 (the recovery dialog).

Seen again on 2026-11-04 at the landing of R-091 bundle D3 (fence-hardening), rebased head `aacd3806`, Windows 11 ARM64, Node 26.13.0, the desktop free of other trees: `resilience-proof` read `child-timeout-inspector` (alpha measured against null), `fatal` (546 px) and `auth-fallback` (no 1000x680 reading) red in the sweep with 71 % CPU before its launch, and again alone at 16 % CPU with no other Electron process; the other 20 scenarios were green both times. Recorded, not repaired.

## Relevant files

- `apps/desktop/scripts/compression-proof.mjs` — run-wide count launch and persona probes.
- `apps/desktop/scripts/resilience-proof.mjs` — inspector and authentication-recovery readings.
- `apps/desktop/src/main/capture/seams.ts` — deferred persona-window probes.
