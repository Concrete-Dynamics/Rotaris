## `plan-gate-proof`'s window reads 1000x682 where 1000x680 is asked, on Windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-supervisor` at `603dae9c` and `C:/dev/Rotaris-crw-wt-loc1-supervisor-base` at `0d89e971`.
Record-only: not repaired by the plan that saw it (loc1).

`plan-gate-proof` stops at "the window was not measured at 1000x680: 1000x682" on every run here: 14:23 and 15:00 UTC on
`603dae9c`, 15:27 UTC on `0d89e971` (CPU 63 % to 87 %, 8 to 25 Electron processes of other trees). The reading is the same
two-pixel difference each time, so it is no timing red; it reads like the window's content size at the display's scale factor
rounding to an even pixel. `resilience-proof`'s `auth-fallback` minimum-size launch reads no 1000x680 window here either
(the Windows session's [`windows-proof-reruns-leave-persona-and-recovery-readings-red.md`](windows-proof-reruns-leave-persona-and-recovery-readings-red.md)),
which may be the same cause.

## Specs

None named here: the proof sizes the window at its minimum and measures it, and whether 1000x682 meets that is the
proof's reading, left to the Windows session.

## Relevant files

- `apps/desktop/scripts/plan-gate-proof.mjs` — the 1000x680 measurement (about line 340).
