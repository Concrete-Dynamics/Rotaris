## driver-proof and git-proof read the window's content two pixels taller than asked at 150 % display scale

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-accept` at `0c7b1753`, display scale 150 % (`AppliedDPI` 144). Record-only: seen by plan `loc1`'s
acceptance round 1 sweep (2026-10-21), which repairs no Windows-only red.

Two proofs that size the window and read its content size back stop on a two-pixel difference in height, twice each (a
sweep, then a lone re-run; CPU load 12 to 42 %, 0 to 7 Electron processes of another tree):

- `driver-proof` step 8 (REQ-SHELL-022's minimum): `FAIL  the window resizes to the stated minimum — 1000×682`; its other 30
  checks pass.
- `git-proof`'s `worktree-ahead` launch: `Error: the opening-size cell measurement was taken at 1440x902`, where its
  `ROTARIS_CAPTURE_RESIZE` asks `1440x900`, so the minimum-size reading after it is never taken.

The difference is the same every time, so it is no timing red. It is the shape the
[`settings-proof`](settings-proofs-minimum-size-launch-reads-1000x682-at-150-percent-display-scale.md) and
[`plan-gate-proof`](plan-gate-proofs-window-reads-1000x682-where-1000x680-is-asked-on-windows.md) notes record for their own
launches (a content height that rounds to an even device pixel at 1.5×), now met by two more proofs; whether the product or
each proof's exact comparison is to change is left to the Windows session with those notes.

## Specs

None named here: REQ-SHELL-022 states the 1000×680 minimum, and whether a 1000×682 reading at 150 % meets it is the proofs'
reading, as in the two notes above.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs` — step 8, `sized.width === 1000 && sized.height === 680`.
- `apps/desktop/scripts/git-proof.mjs` — the `worktree-ahead` launch, `opening?.viewport?.join('x') !== '1440x900'`.
- `docs/defects/settings-proofs-minimum-size-launch-reads-1000x682-at-150-percent-display-scale.md`,
  `docs/defects/plan-gate-proofs-window-reads-1000x682-where-1000x680-is-asked-on-windows.md` — the same reading elsewhere.
