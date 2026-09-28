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

The gap was first recorded in [`fixed/a-driven-launch-dies-as-root-on-linux.md`](fixed/a-driven-launch-dies-as-root-on-linux.md),
whose repair gave the driver `hostSwitches` and stated that "the scripts that spawn Electron themselves keep their own
launches ... and still die as root". This note is that same gap, met in one more proof, and stays open for it.

## Specs

None contradicted by the product. A proof is evidence (`.claude/rules/tests-and-proofs.md`), and as root this one
produces none for the requirements it stands for (REQ-ORCH-088/090/144 among them).

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: `launch`, the `spawnSync` with no host switch.
- `apps/desktop/scripts/lib/harness.mjs`: `hostSwitches`, the list a launch as root needs.

## Repaired — 2026-09-28, under R-062 — and the sweep the note asked for

`resilience-proof`'s `launch` passes `hostSwitches` after the main entry, as the driver does; so does **every** script
under `apps/desktop/scripts/` that spawns Electron itself: the 28 proofs with the uniform launch, `settings-proof`
and `skills-proof` (their `args` arrays), `workspace-proof`'s hand-over launch, `traceability-proof`'s driver launch,
`terminal-proof`'s Electron half, `code-intel-proof`'s three launches, `live-run.mjs`'s `runElectron`, and the three
packaged-binary launches (`mcp-console-spike`, `terminal-proof/packaged.mjs`, `package.mjs`), where the list is empty
on the only platform that has a packaged binary. `grep -n "spawn\(Sync\)\?(\(electron\|exe\), \[" … | grep -v
hostSwitches` answers nothing. `code-intel-proof` also stops spelling `electron.exe` alone
([fixed](code-intel-proof-names-the-windows-electron-binary-alone.md)).

Measured as root under Xvfb on Linux, Node 24, after one `pnpm build`: `pnpm resilience-proof --skip-build`
**launches** — the first scenario (`retry-after`) that died with SIGTRAP before its first assertion now runs to its
assertions and passes them, and `cancel` and `same-tier` pass after it (REQ-ORCH-090/091, REQ-NOTIFY-063/081..093 in
the built app on Linux for the first time). The proof then stops at scenario 4 (`override`) for a reason that is not
this note's: its `ROTARIS_CAPTURE_SELECT` names `.wait-header select`, and the wait header's chooser is a
`DesignSearchableSelect` — recorded as
[`resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md`](../resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md),
not repaired here. Scenarios 5 to 7 (REQ-ORCH-088's child timeout among them) are therefore still unmeasured in the
built app on Linux. `workspace-proof`'s two hand-over reds named in `a-driven-launch-dies-as-root-on-linux.md` were
not re-run in this round.
