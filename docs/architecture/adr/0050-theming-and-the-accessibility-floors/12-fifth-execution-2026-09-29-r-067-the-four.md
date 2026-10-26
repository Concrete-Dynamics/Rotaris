# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Fifth execution — 2026-09-29 (R-067), the four derived on the ground the dock paints

Part 12 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Fifth execution — 2026-09-29 (R-067), the four derived on the ground the dock paints

*The proof is `pnpm slash-proof --skip-build`, as root under Xvfb on Linux, Node 24, after one `pnpm build` in the
branch's worktree, with other agents' Electron proofs running on the host.*

**The repair the fourth execution recorded.** The product moved, not the dock: the docked strip is PD-CHAT-001
revision 2's and the owner's choice, so `highlight.ts` names the ground the composer paints under its transparent field
once — `COMPOSER_GROUND = '--rt-surface'` — and `slashRoleColours` derives on it by default. The partial shade is still
the accent blended toward the surface behind it; that surface is now the one behind it. `slash.test.ts` reads the dock's
background token out of `shell.css` and measures the four against it on every built-in theme, so the stylesheet and the
derivation cannot part again without a red (on the old default the test failed at `rotaris-dim partial on --rt-surface
4.06:1`). The proof's palette check now reads "the painted ground is the palette's `--rt-surface`".

**Measured.** Green end to end — the catalogue launch, the palette launch, the restart and the wired launch. On the dock
(`composer__dock`, the first opaque ground from the input up): `rotaris-dim` on `oklch(0.25 0 0)` — partial
`oklch(0.62939 0.05 292)` 4.50:1, unknown `oklch(0.64999 0.2 25)` 4.50:1 (both lightened further than the fourth
execution's `--rt-bg` values), resolved 9.20:1, argument 8.56:1; `nocturne` on `oklch(0.18 0 0)` — partial 4.50:1,
unknown 9.94:1, resolved 10.82:1, argument 11.14:1; `high-contrast` on `oklch(0.12 0 0)` — partial 4.50:1, unknown
13.91:1, resolved 15.07:1, argument 16.02:1. Four distinct colours on each palette, the weights unchanged. Repaired note:
`../../../defects/fixed/the-slash-token-colours-clear-their-floor-on-a-ground-the-composer-no-longer-paints.md`. Not
shown: any of it on Windows or macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

**The design material.** *(Added 2026-09-30, the verifier's fix round 1.)* The mockup (`pnpm mockup`, its
`<!-- queue + composer -->` block) draws the composer as the design's `.input` textarea on its own `--rt-bg`
(`docs/design/system/components.css`), inside a block that paints nothing. The built dock paints `--rt-surface` behind a
transparent field. That departure is PD-CHAT-001 revision 2's, and the directive governs over the mockup's structure
(`docs/design/README.md` §2). So the mockup confirms where the second execution's `--rt-bg` came from, and changes
nothing in this repair.

**`theme-proof` beside it.** The slash colours are painted only while a slash command is typed, and `theme-proof` types
none. ~~Its full matrix on the branch failed only on `rotaris-dim` at 150 % and 175 %, both times on status-strip text and
never on a slash role. Rebuilt with `highlight.ts` reverted, the 150 % case still failed. The same case passed on
origin/main built in a checkout whose path is five characters longer, which shifts the elided strip item across the
device-pixel grid.~~ *(Corrected 2026-09-30, the verifier's fix round 1. The first reading is falsified: the path's length
moves nothing, and the matrix it described did not reproduce on the final tree.)* Its first run on the branch failed on
`rotaris-dim` at 150 % and 175 %, and rebuilt with `highlight.ts` reverted the 150 % case still failed. On the final
build, in the same checkout, the full matrix fails only `nocturne` at 150 %, and `rotaris-dim` passes at every scale.
Every red is on status-strip text and none is on a slash role. The strip is wider than the 1066 px window at 150 % and
scrolls, and the failing item lies 1.2 px inside the window's right edge. The proof's `visible()` admits it, and
`textContrast` reads two device-pixel columns of its first glyph's anti-aliased edge (3.25:1; the same item measured
whole reads 6.74:1). Whether an item lands in that position depends on the widths the strip draws ahead of it: the
branch label with its ahead count, which is the checkout's branch because the scratch workspace sits inside it, and the
theme's name. The elided `svc:` path stays at its 48 px floor. Recorded as a proof defect
(`../../../defects/fixed/theme-proofs-text-contrast-verdict-depends-on-the-checkouts-path.md`, corrected in place), and not
absorbed here.
