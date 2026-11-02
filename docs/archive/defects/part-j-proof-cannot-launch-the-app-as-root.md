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

## Repaired — 2026-09-28, confirmed 2026-09-29

Repaired before this note reached `main`. Commit `63e0630` (R-062's proof sweep, 2026-09-28) put `...hostSwitches` on
every Electron launch its scripts make, `part-j-proof`'s `launch` among them: `[join(app, 'out', 'main', 'index.js'),
...hostSwitches, s.workspace]`. The note was written on PD-ORCH-005's branch (`7f32804`, 2026-09-27), which did not
hold that commit, and it arrived with that branch's merge. `apps/desktop/scripts/lib/launch-sites.test.ts` keeps the
rule in `pnpm check`: every spawn of Electron carries the switch, ahead of any bare `--`.

Confirmed 2026-09-29 under R-067. `pnpm part-j-proof` was run as root (uid 0) under Xvfb on Linux, build included, and
exited 0. Its eight launches (queue, steer, pause, steer-rest, limit-double, limit-paused, limit-cancel and quit) all
started, none died with SIGTRAP, and each wrote its one result: `results.json` holds eight keys, limit-cancel's under
`limitRelaunch`. Nothing in the proof changed for this note.
