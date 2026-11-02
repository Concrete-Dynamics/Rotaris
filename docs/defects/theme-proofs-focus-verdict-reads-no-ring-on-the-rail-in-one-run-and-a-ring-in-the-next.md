## theme-proof's focus verdict reads no ring on the rail in one run and a ring in the next

Seen 2026-11-02 by the reviewer of plan hrd2's bundle `hrd2-type-aware-lint`, on its rebased head `97bb2ce5` built in
`C:/dev/Rotaris-wt-integ-hrd2-hrd2-typeawarelin` (Windows 11 ARM64, Node 26.13.0, CPU load 83 to 100 % on 8 cores, with
twelve Electron processes of four other trees' proofs open on the same desktop). Two runs of `pnpm theme-proof` on the
same build, back to back, failed different cases:

- first run (21:46 UTC): `nocturne @ 1.75: FAIL focus`, and `nocturne @ 1.5` met the run host's hello bound
  ([the hello-bound note](a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md));
  `high-contrast` passed at every scale;
- second run (21:57 UTC): `high-contrast @ 1.75` and `@ 2: FAIL focus`, and `nocturne @ 1.75` failed with no driver
  endpoint within 90 s after the hello-bound rejection; every `rotaris-dim` case, `nocturne` at 1, 1.25, 1.5 and 2, and
  `high-contrast` at 1 to 1.5 passed.

The failing focus sections are not a sample of nothing: `high-contrast @ 2` tested 34 of 35 Tab stops and read a
contrast ratio of exactly 1 for nine of them (the rail's seven view buttons, Sessions, "Dismiss this error") and 1.08 for
Settings, that is, no ring painted at all where the run before had measured one at or above 3. The same code drew the
ring in one run and not in the next, so the reading depends on something other than the product's styles; a window
that has lost the operating system's foreground to another tree's window paints no `:focus-visible` ring, which would
fit, but was not measured. The bundle's diff touches no style, no focus handling and no theme token.

## Specs

None contradicted by the code as far as shown. REQ-SHELL-145/160 (the focus ring's contrast) are what the section
measures; whether the product meets them on a desktop it does not own alone is not established either way.

## Relevant files

- `apps/desktop/scripts/theme-proof.mjs` — the focus section: Tab, capture, `focusContrast` over the focused control,
  `pass` only when every measured ratio is at least 3.
- `apps/desktop/scripts/pixels.cjs` — `focusContrast`.
- `C:/dev/Rotaris-wt-integ-hrd2-hrd2-typeawarelin/.proof/theme-proof/results.json` — the second run's figures (scratch
  evidence, removed with the landing worktree).
