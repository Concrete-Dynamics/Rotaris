# Design Brief — Rotaris Desktop Interface — 5. Acceptance items the design language must be measured against

Part 5 of 7 of [the design README](../README.md), which indexes every part.

## 5. Acceptance items the design language must be measured against

These are not open questions — they are the tests the language has to pass once it is wired up.
`REQ-SHELL-160` requires all four of the following to be settled from **rendered pixels on a real
display**, not from token arithmetic.

1. **Contrast — settled from rendered pixels 2026-09-12; the shortfall it found was ruled OQ-56 on 2026-09-18 and the token below is the repaired value.**
   `REQ-SHELL-144` (4.5:1 normal text, 3:1 large text and non-text boundaries) and
   `REQ-SHELL-145`, sampled from the painted label against the painted background after all styling,
   states and overlays. At risk in the imported palette was `--rt-text-disabled`
   (`REQ-SHELL-145` requires it below half the enabled contrast ratio while still clearing 3:1) —
   **`pnpm theme-proof` measured it at 2.898:1 on a card in `rotaris-dim` at 100 %, 125 %, 150 % and
   200 % — and 3.030:1 at 175 %, where one scale's rounding was the whole distance to the floor — and
   clear on `nocturne` and `high-contrast`; the dimness half was met and the floor was not.
   Raised as OQ-56, because the two ways out were a change to this material or an amendment to the
   requirement, and neither was an agent's to choose. Ruled 2026-09-18: the adopted token rises to
   `oklch(58% 0 0)`, which clears 3.18:1 at the dimmest surface; `theme-proof`'s `contrast` section
   is the measure that closed the question.** Everything else this item names cleared its floor
   on the same run:
   every state text colour on every background it is painted on; the primary button's label in rest,
   hover and pressed; the diff washes over syntax-coloured code; and every derived persona shade,
   which `REQ-SHELL-134` may correct only by raising perceptual lightness.
2. **Native surfaces.** `REQ-SHELL-130` and `REQ-SHELL-160(b)`: native dialogs, menus, text caret and
   disabled text must follow the theme on every supported platform. The token set has no native-
   surface mapping.
   *Settled from rendered pixels 2026-09-04 on Windows (`pnpm theme-proof`, all three themes at five scale factors):
   the build carries the application-owned mapping the sentence above says the token set lacked, and it held —
   Electron's theme source follows the theme's dark flag, and window grounds, carets, form controls and disabled text
   follow the active palette; the operating system's folder chooser stays host-owned (ADR-0048). macOS and Linux remain
   IC-3's.*
3. **Focus indication.** `REQ-SHELL-148` and `REQ-SHELL-160(c)`: ring wholly within the control's own
   bounds, at the theme width and colour, clearing 3:1. See the `outline-offset` note in §1.8.
   *Settled from rendered pixels 2026-09-04 (`pnpm theme-proof`): the inset ring held in all three themes at five
   scale factors.*
4. **Icon scaling.** `REQ-SHELL-030` and `REQ-SHELL-160(d)`: an icon declared at L logical pixels
   covers L logical pixels within one device pixel at 100 %, 125 %, 150 %, 175 % and 200 % OS
   scaling, and after being dragged between monitors at different scale factors, and is never drawn
   from artwork smaller than the required raster.
   *Settled from rendered pixels 2026-09-04 (`pnpm theme-proof`) at every listed scale on one display; **the drag
   between monitors at different scale factors is not settled**: one display was attached, so it remains the owner's
   measurement under IC-2.*
5. **Rail label fit.** `REQ-SHELL-029`: every rail item shows its complete label at 9 px with no
   ellipsis and no clipped glyph, in every built-in theme, with the width re-derived after each theme
   change. "Requirements" is the binding case.
   *Settled from rendered pixels 2026-09-04 (`pnpm theme-proof`): "Requirements" fits at 9 px in all three themes.*
6. **Theme completeness.** `REQ-SHELL-128`, `REQ-SHELL-132`: three themes, each rendering all seven
   views without error, each preserving unsent composer text, the active view and every divider size
   across a switch, with no widget retaining a colour from the previous palette.
   *Settled from rendered pixels 2026-09-04 (`pnpm theme-proof`) for what that proof names: three themes, all seven
   views without a renderer error, and a live switch preserving the composer value and the active view
   (`../architecture/spikes/theme-proof.md`).*

---
