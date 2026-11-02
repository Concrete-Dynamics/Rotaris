## Proofs write the global configuration where only Windows reads it

Ten built-app proofs and one spike write their scratch global configuration (`agents.yaml`, and `secrets.yaml` where
they use one) to `<local>/rotaris/config/`, the Windows spelling of the configuration directory. `proofIsolationEnv` points
`XDG_CONFIG_HOME` at that same `<local>/rotaris/config`, and on Linux `resolveUserDirs` appends the application name, so
the product reads `<local>/rotaris/config/rotaris/`. On Linux, then, the app never sees the file the proof wrote, runs on
its shipped defaults, and the proof fails on its first assertion about configured behaviour — or, worse, passes on an
assertion the defaults happen to satisfy.

Measured 2026-09-27 on `mcp-proof`: launch 1 failed with the MCP section reading only `code_intelligence` (none of the
three fixture servers the proof configures). A scratch copy whose one change was the configuration directory passed
launches 1 to 6 and stopped at launch 7, which exercises a `.cmd` runner and is Windows-only by design. The harness
already carries the platform-aware rule, `configDirFor(local)` in `scripts/lib/harness.mjs`, written for the live run on
2026-09-24; only `live-run.mjs` uses it.

## Specs

None contradicted by the product: `REQ-STARTUP-145`'s per-user configuration directory is resolved correctly. The
defect is in the evidence. A proof that cannot reach the configuration it writes measures nothing about it on that
platform.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv` (the `XDG_CONFIG_HOME` it sets) and `configDirFor` (the rule the proofs do not use).
- `apps/desktop/scripts/{artifacts,code-intel,config,init,mcp,notice,plan-gate,resilience,sandbox,skills}-proof.mjs` and `mcp-console-spike.mjs` — each joins `local, 'rotaris', 'config'` itself.
- `packages/platform/src/dirs.ts` — `resolveUserDirs`, the reader the proofs disagree with off Windows.

Noticed 2026-09-27 while measuring the MCP client's handshake identity for the version guard's gate round (first-release
plan §4.1). Not repaired here: each proof has to be re-run on both platforms once it reads `configDirFor`.

## Repaired — 2026-09-28, under R-062

Every script that wrote or read the scratch global configuration now takes the directory from `configDirFor(local)`
in `scripts/lib/harness.mjs`: `artifacts-proof`, `code-intel-proof`, `config-proof`, `init-proof`, `mcp-proof`,
`notice-proof`, `plan-gate-proof`, `resilience-proof`, `sandbox-proof`, `skills-proof` and `mcp-console-spike` — and
`slice-proof`, found by the same grep, which read the discovery snapshot at the Windows spelling. No script under
`apps/desktop/scripts/` joins `'rotaris', 'config'` itself any more (`grep -rn "'rotaris', 'config'"` answers only
the harness). The rule is pinned against the product's `resolveUserDirs` on win32 and linux by
`proof-isolation.test.ts`. Which of the proofs then pass on Linux is a measurement, recorded per proof in the R-062
report and `first-executions.md`'s row of 2026-09-28: `skills-proof` and `mcp-proof` are in the sibling notes; the
others were attempted on the same host and each red there is a note of its own, not a repair here. Not re-run on
Windows in this round: no Windows host in the container (IC-3), and `configDirFor`'s win32 answer is the spelling the
scripts had, so nothing changed for that platform.
