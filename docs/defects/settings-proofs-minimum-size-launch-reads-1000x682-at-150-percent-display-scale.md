## settings-proof's minimum-size launch reads a content size of 1000×682 at 150 % display scale

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-proofcwd` at `65c38641`, display scale 150 % (`AppliedDPI` 144). Recorded, not repaired, by plan
`loc1`'s `proof-cwd` bundle (2026-10-20), which ran `settings-proof` to measure its working-directory comparison.

`settings-proof --skip-build` stops at launch 1″ (`about-minimum`), three times out of three (CPU load 59 to 77 %, with and
without another tree's Electron alive):

```
Error: the window was not shrunk to REQ-SHELL-022's 1000×680 (capture: resize at 400 → content 1000×682)
```

The capture seam's `ROTARIS_CAPTURE_RESIZE=1000x680@400` calls `win.setContentSize(1000, 680)` and logs
`win.getContentSize()`, which reads back 1000×682. At 150 % the requested height is 1,020 physical pixels; the height read
back is two DIPs more, which reads like a rounding of the window's frame or of the minimum size (REQ-SHELL-022's
1000×680 is the window's minimum content size) at a fractional scale. Not measured: the same launch at 100 % scale, and
whether the product's own minimum-size constraint lets a person shrink the window to 1000×680 content on this display,
which is the product question behind the proof's red.

Every check after launch 1″ (`instructions`, `display`, `reopen`, `live-apply`, the run-start hint and the Personas and
reload launches) is not reached on this host, so `settings-proof` gives no reading of them here.

**Sighted again 2026-11-04** (hardening plan hrda, bundle `hrda-boundary-refusal-line`, on its branch over `3bf27f00`, run
as part of the configuration-and-startup suite `pnpm verify:plan` named; CPU load 68 % from other sessions, no other tree's
Electron running): "the window was not shrunk to REQ-SHELL-022's 1000×680 (capture: resize at 400 → content 1000×682)".

**Sighting, 2026-11-04 (hrda, bundle hrda-corrupt-store-resolution).** The same red on the same host (Windows 11 ARM64, 150 %), `pnpm settings-proof --skip-build` on that branch's build, run after `store-resolution-proof` with no other tree's Electron alive and the host CPU at about 77 %: `capture: resize at 400 → content 1000×682`, the same first failure; nothing after it reached.

**Sighting, 2026-11-05 (hardening plan hrdb, bundle `hrdb-diagnostics-fallback-and-unreadable-locks`).** The same red, the same first failure, in the configuration-and-startup suite `pnpm verify:plan` named for the diagnostics base's change, on that branch's build over `6328bb8b` (Windows 11 ARM64, 150 %, CPU about 52 %, another tree's Electron — `C:/dev/Rotaris-wt-hrdb-childreadyan` — running proofs beside it): `capture: resize at 400 → content 1000×682`.

## Specs

`REQ-SHELL-022` (the minimum content size) may be contradicted on a 150 % display, or only the seam's read-back may be:
which one is the open part of this note.

## Relevant files

- `apps/desktop/scripts/settings-proof.mjs`: launch `about-minimum` and the 1000×680 check after it.
- `apps/desktop/src/main/capture/seams.ts`: the `capture: resize` step (`setContentSize`, `getContentSize`).
