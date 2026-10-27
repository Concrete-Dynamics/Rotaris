# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Third execution — 2026-09-11 (Part C″), the four highlight roles measured on all three palettes

Part 10 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Third execution — 2026-09-11 (Part C″), the four highlight roles measured on all three palettes

*Recorded under GD-10; the proof is `pnpm slash-proof` — its `palettes` and `theme-restart` launches — with evidence
under `.slash-proof/`. Defects are numbered `C2-n`; the manager assigns the ordinals at merge.*

**What was asked, and what the second execution had left.** Wave 1 derived REQ-CHAT-027's four roles from theme data
and measured them on all three palettes in a unit test, but in the BUILT product on `rotaris-dim` alone. A unit test
measures the arithmetic; it does not measure what a window paints. This execution measures the painted pixels on each
of `REQ-SHELL-128`'s three built-in palettes, switching between them with `/theme <name>` — the product's own command,
so the palette under measurement is the one a user would have — and comparing each role with the ground that palette
actually paints.

**How the ground is established, and why no colour is written down.** The composer's painted background is read from
the field and the palette's `--rt-bg` from the document root in the same evaluation, and the two are compared as
colours rather than as text. That comparison is this execution's one harness correction: a computed colour serialises
with a unitless lightness (`oklch(0.21 0 0)`) while a custom property comes back as the theme declared it
(`oklch(21% 0 0)`), so the first run reported the palette's own ground as a mismatch with itself. The proof holds no
literal colour of its own, before or after.

**Measured** (built application, 1264 px, the scripted provider, default scale; ~2.1 GB free with two other agents
building on the same machine; **identical in two consecutive runs**):

| Palette | ground | resolved | partial | unknown | argument |
|---|---|---|---|---|---|
| `rotaris-dim` | `oklch(0.21 0 0)` | 10.193:1 | 4.500:1 | 4.788:1 | 9.483:1 |
| `nocturne` | `oklch(0.14 0 0)` | 11.453:1 | 4.500:1 | 10.521:1 | 11.789:1 |
| `high-contrast` | `oklch(0.08 0 0)` | 15.433:1 | 4.500:1 | 14.249:1 | 16.406:1 |

Every role clears 4.5:1 on every palette; the four render to four different colours on every palette; the weights are
400 for partial and 500 for resolved and unknown throughout, so the states stay tellable apart without colour; and the
three grounds differ from one another, which is what makes this three palettes measured rather than one palette
measured three times. The partial shade sits exactly on the floor in all three — the corrector doing what this record
asks of it, since the blend toward the surface starts below 4.5:1 and is raised to it.

**`/theme` against the real settings.** The three switches are made by the command, not by the harness's theme
environment variable, and the last of them is `high-contrast`: after the launch the desktop preference store's own
document holds `appearance/theme: high-contrast`, and a second launch on that preference root paints `high-contrast`
with the same ground before anything is typed. The setting the command writes is the setting the product reads.

**IC-2, stated and not skipped.** The condition is recorded DISCHARGED (2026-09-04) and all three palettes carry data,
so no palette here was unmeasurable and none was silently passed over. What IC-2's entry still leaves outstanding —
the different-scale multi-monitor drag on the owner's hardware — is not REQ-CHAT-027's, and macOS and Linux remain
IC-3's.

**Found — nothing** in the theme data or in the colour correction. The two reds `pnpm theme-proof` still carries (the
`focus` item over a `<summary>` the harness's control list does not enumerate, and the disabled labels at 2.90:1) were
not reached by this work: the four roles here are drawn only while a slash command is typed, they reach no adopted
token, and neither red is a slash role. They are left as they stand and said so rather than absorbed.
