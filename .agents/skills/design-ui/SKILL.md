---
name: design-ui
description: 'Design or redesign the structure, journey, states and copy of a Rotaris surface before it is drawn, within the specification''s information architecture and the adopted design language, and audit a built surface into a prioritized refactor brief. Use before build-ui for a new or substantially changed surface, when a surface looks generated or feels off with no bounded defect named, or when the owner asks for a UX overhaul. Use build-ui to draw, debug-ui for a bounded defect, review-ui for a read-only critique of rendered evidence.'
argument-hint: '[surface, then "brief" or "audit"]'
---

# Design a Rotaris surface

Two things nothing else in the loop does: a **brief** before a surface is drawn, and an **audit** of a built one into a prioritized refactor brief. `build-ui` draws, `debug-ui` repairs, `review-ui` critiques; this skill decides what a surface is for, what it holds, which states it has and what it says — within what the specification fixes and the adopted language allows.

## Authority

1. A directive (`docs/product/directives.md`) governs over the requirement it names. The specification (`docs/spec/`) fixes which views exist, their order, tabs and labels (`REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-SHELL-049`, `REQ-CONFIG-268`, `REQ-CONFIG-269`, `REQ-LIBRARY-103`, `REQ-TRACE-232`). The architecture views say where an edit lands. `docs/design/README.md` §1 and §2 fix the language and what of the design material is adopted.
2. `docs/research/design/` is guidance beneath all four: it informs craft within §1 and structure within §2 and overrides neither (`docs/design/README.md` §6.1).
3. This skill never introduces a screen, a tab, an order or a label the specification does not state. A gap it finds is an open question (`docs/architecture/open-questions.md`), raised here and never ruled here; a change the owner asks for is classified in `docs/product/requests.md` before anything is drawn.
4. Vocabulary is `packages/ui/CONTEXT.md`'s. A generic pattern may be named by its field name once, said so, and then by the glossary's word.

## Brief — before drawing

1. Gather authority: the requirements and directives that fix the surface; its row in `docs/design/README.md` §7 (mockup section, nearest built code); `pnpm mockup`, read for craft and never for structure; the glossary; `docs/architecture/views/04-seams/08-8-a-drawn-surface.md` for the edit path that follows.
2. Journeys: which of the operator's journeys cross the surface (`docs/research/design/04-the-agent-operator-journeys.md`); entry, steps, exit; where it waits, asks, or needs trust (`06-ux-patterns-for-agent-products.md`).
3. Content model and hierarchy within the fixed structure (`03-information-architecture-within-a-fixed-structure.md`): what the surface holds, what is primary, what is disclosed on demand, where a requirement cluster becomes a region.
4. States, per region, from the matrix in `13-states-feedback-and-time.md` — empty, loading, streaming, partial, error, success, disabled, permission-needed — each drawn and each saying what it is.
5. Interaction and keyboard (`05-interaction-patterns-for-desktop-tools.md`, `08-platform-conventions-for-electron.md`): the patterns chosen, reversibility, focus order, what the command palette reaches.
6. Copy (`10-ux-writing.md`): every string the specification leaves open, in the adopted voice, in the glossary's words; the specification's string wins where it has one.
7. Accessibility obligations (`09-accessibility-for-a-dense-desktop-tool.md`): the `REQ-SHELL-144..168` items that bind this surface.
8. Composition intent (`07-visual-composition-beyond-tokens.md`, `14-how-a-surface-gives-way.md`): density tier, earned surfaces, the alignment axes to publish as `UiLayoutContract` relations, how the surface gives way at the minimum size and the compact thresholds.
9. Components from `../build-ui/references/component-inventory.md`. A gap goes to `docs/design/README.md` §4.2 as a proposal, never to a primitive outside `packages/ui/src/design-system/`.
10. Disagreements and gaps as open-question candidates, each with the adopted or specified text it meets.
11. Evidence plan: the views, sizes and theme for `pnpm ui-review`, the probes, the proofs.
12. Write the brief to `docs/design/briefs/<slug>.md` with status `proposed`, in the shape of [references/design-brief.md](references/design-brief.md); hand to `build-ui`. The brief cites; it restates neither the specification nor §1.

## Audit — a built surface

1. `pnpm build`, then `pnpm ui-review -- --iteration=1 --views=<n> --sizes=<w>x<h>,…`; read the pack: the screenshots, `geometry.json`, `styles.json`, the deterministic findings, `manifest.json`.
2. Walk the rubric (`../review-ui/references/critique-rubric.md`) with a number in every observation; walk the journeys (guide 04) through the built surface; walk the tells (`02-the-generated-look-and-its-counter-moves.md`); walk the vocabulary (the glossary's *Avoid* lines).
3. Write the refactor brief in the shape of [references/surface-audit.md](references/surface-audit.md): items ordered by severity × journey criticality, each with its criterion, its observation with numbers, a bounded change, the executing skill (`build-ui` or `debug-ui`), the number that must move, and the requirement or § it answers to; a "deliberately left" section; open-question candidates.
4. Append it to the surface's file in `docs/design/briefs/` as `## Audit YYYY-MM-DD`, status `proposed`, and point the surface's §7 row at it. Repair nothing here.
5. Close with the handoff (`AGENTS.md`, "The handoff"), the findings with their numbers in the message — `.ui-review/` is ignored by git, and a later capture empties it.

Lessons go into the step they amend as a dated bold note, as `build-ui`, `debug-ui` and `review-ui` keep theirs. The corpus index is `docs/research/design/README.md`; this file keeps no copy of it.
