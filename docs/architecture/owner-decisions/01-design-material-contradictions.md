# Product-owner decisions on the architecture record — Design-material contradictions

Part 1 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Design-material contradictions

**Motion tokens.** `docs/design/system/tokens/effects.css` governs: `--rt-duration-fast` 90 ms,
`--rt-duration` 160 ms, `--rt-duration-slow` 240 ms, `--rt-shift` 3 px. The values documented in
`guidelines/motion-tokens.html` (100 / 180 / 260 ms, 4 px) and repeated in prose in `guidelines/motion.html`
are corrected to match. The design brief already declares token names normative and `styles.css` the single
entry point, so the stylesheet is the artifact every component was built against; the guideline is
documentation that drifted.

**`Card.accented`.** The shipped CSS governs: the variant recolours the kicker to accent and draws no left
rule. `Card.d.ts` and `TableCard.d.ts`, which document "the 2px accent left rule", are corrected.

Beyond preferring the artifact over its documentation, a 2 px accent left rule on cards would sit one pixel
away from the 3 px left rule that `REQ-NOTIFY-034` to `REQ-NOTIFY-043` reserve for **severity** on the
persistent notice banner and `REQ-NOTIFY-019` reserves for error presentation on toasts. Two near-identical
left rules carrying different meanings is a worse outcome than no left rule.

---
