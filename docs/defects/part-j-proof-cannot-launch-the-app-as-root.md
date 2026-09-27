## part-j-proof cannot launch the app as root

`pnpm part-j-proof` spawns Electron itself (`spawnSync(electron, [main, workspace])`) with none of the host switches
the shared harness adds (`hostSwitches` in `apps/desktop/scripts/lib/harness.mjs`, which `pnpm app:drive` uses). Run
as root — as a cloud container runs it — Electron refuses to start without `--no-sandbox` and dies (SIGTRAP), so the
proof measures nothing there. The same class as `resilience-proof-cannot-launch-the-app-as-root.md`. Noticed by phase
5's review of `PD-ORCH-005` (2026-09-27), which had to drive the pause and the Continue action through `pnpm app:drive`
instead; not repaired.

## Specs

None: the product is not at fault. The proof's launch is.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — `launch`, which builds its own argument list.
- `apps/desktop/scripts/lib/harness.mjs` — `hostSwitches`, the switches a launch as root needs.
