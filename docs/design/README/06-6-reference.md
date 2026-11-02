# Design Brief — Rotaris Desktop Interface — 6. Reference

Part 6 of 7 of [the design README](../README.md), which indexes every part.

## 6. Reference

- Design language: `docs/design/system/` — `README.md`, `styles.css`, `tokens/`, `base.css`,
  `components.css`, `motif.css`, `guidelines/` (20 specimen cards), `components/` (27 components,
  each with `.jsx`, `.d.ts` and `.prompt.md`).
- Visual mockup: `docs/design/mockup/rotaris-ui-mockup.dc.html` — language reference only.
- Assets: `docs/design/assets/` — the mark and the self-hosted variable fonts.
- Information architecture: `docs/spec/12-desktop-shell-windows.md` (`REQ-SHELL-023` is canonical),
  and the owning domain for each view's contents.
- Provenance of this material: recorded in the repository's history (`docs/clean-room/provenance.md` *(removed 2026-10-26)*, section "Design material").
- Research corpus: [`docs/research/design/`](../../research/design/README.md) — fourteen guides on how interfaces
  are designed well, what reads as generated, and how the operator's journeys cross this product; §6.1 states its standing.
- Surface briefs: [`docs/design/briefs/`](../briefs/README.md) — one file per surface, the brief written before it
  is drawn and the audits appended after.

### 6.1 The research corpus and the surface briefs — guidance, never authority

*Added 2026-11-01 ([R-093](../../product/requests.md#r-093)).*

1. The corpus **informs craft within §1 and structure within §2 and overrides neither**. It licenses no screen, tab,
   order or label the specification does not state (`REQ-SHELL-023` and the authorities §2 names), and it mints no
   member of the language: a token, a component or a rule it argues for is proposed, not added.
2. Where a guide disagrees with the adopted material, its section 8 names the claim, the adopted text it meets and the
   open question to raise; the adopted text is **never edited from the corpus**. A ruled question reaches §1 or the
   specification by its own amendment, and the guide's section 7 then notes the ruling.
3. A **brief** (`.agents/skills/design-ui`) precedes `docs/architecture/views/04-seams/08-8-a-drawn-surface.md`'s first
   step for a new or redesigned surface; a restyle inside an existing structure needs none. Once the surface is drawn,
   its row in §7 points at the brief, and an **audit** of a built surface is appended to the same file by date.
4. Who reads what: `design-ui` the corpus, the brief template and the rubric; `build-ui` the rubric's "while building" column;
   `review-ui` the rubric; `debug-ui` the rubric when a repair changes composition. The rubric is
   `.agents/skills/review-ui/references/critique-rubric.md`, one file, so the builder builds against what the critic scores.

---
