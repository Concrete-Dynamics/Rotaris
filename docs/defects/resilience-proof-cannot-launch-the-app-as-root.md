## The resilience proof cannot launch the app as root

`pnpm resilience-proof` starts the built app with `spawnSync(electron, [<main entry>, <workspace>])` and passes no
host switch. As root, Chromium refuses to start without `--no-sandbox` (crbug.com/638180). The first launch
(`retry-after`) therefore dies with SIGTRAP before it paints, and the proof throws before any of its assertions. The
log reads `Running as root without --no-sandbox is not supported`. `apps/desktop/scripts/lib/harness.mjs` already
exports `hostSwitches`, which is `['--no-sandbox']` as root and empty elsewhere. The driver uses it, but the
resilience proof does not.

Found 2026-09-27 while building `PD-ORCH-004` (R-057), running the proof as root in a cloud container. It failed at
its first launch. By reading, the other 33 scripts under `apps/desktop/scripts/` that launch `electron` directly
(32 proofs and `live-run.mjs`) name neither `hostSwitches` nor `--no-sandbox`. They were not run.

## Specs

None contradicted by the product. A proof is evidence (`.claude/rules/tests-and-proofs.md`), and as root this one
produces none for the requirements it stands for (REQ-ORCH-088/090/144 among them).

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: `launch`, the `spawnSync` with no host switch.
- `apps/desktop/scripts/lib/harness.mjs`: `hostSwitches`, the list a launch as root needs.
