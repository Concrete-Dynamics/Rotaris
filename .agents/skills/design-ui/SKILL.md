---
name: design-ui
description: 'Design or redesign the structure, journey, states and copy of a Rotaris surface before it is drawn, within the specification''s information architecture and the adopted design language, and audit a built surface into a prioritized refactor brief. Use before build-ui for a new or substantially changed surface, when a surface looks generated or feels off with no bounded defect named, or when the owner asks for a UX overhaul. Use build-ui to draw, debug-ui for a bounded defect, review-ui for a read-only critique of rendered evidence.'
argument-hint: '[surface, then "brief" or "audit"]'
---

# Design a Rotaris surface

Take the mode from the argument and run its steps in order. Neither mode draws or repairs: `build-ui` draws, `debug-ui` repairs, `review-ui` critiques. Both answer to one checklist, the rubric (`../review-ui/references/critique-rubric.md`): the brief says which of its rows the surface must pass and how, the audit which it fails and by how much.

## Which mode

| Question | Yes → |
|---|---|
| Is the surface undrawn, or is its structure, journey, states or copy about to change? | **brief** — out: `docs/design/briefs/<slug>.md` at status `proposed` |
| Is it built, and does it look generated or feel off with no bounded defect named — or did the owner ask for an overhaul? | **audit** — out: `## Audit YYYY-MM-DD` appended to that file |
| Is one defect named and bounded? | `debug-ui`, not this skill |
| Is a read-only critique of a pack wanted? | `review-ui`, not this skill |
| Is it a restyle inside an existing structure? | `build-ui`, no brief |

## Authority — settle every conflict in this order

1. A directive (`docs/product/directives.md`) over the requirement it names, per identifier.
2. The specification (`docs/spec/`): which views exist, their order, tabs and labels — `REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-SHELL-049`, `REQ-CONFIG-268`, `REQ-CONFIG-269`, `REQ-LIBRARY-103`, `REQ-TRACE-232`.
3. `docs/design/README.md` §1 (the language) and §2 (what of the design material is adopted); where an adopted sheet and §1 disagree, §1 wins, because it is the document that adopts; `pnpm mockup` for craft, never for structure.
4. `docs/research/design/` (index: its `README.md`) — guidance beneath all three; it overrides none (`docs/design/README.md` §6.1).

Add no screen, tab, order or label. Write a gap as an open-question candidate, raised in `docs/architecture/open-questions.md` from the next free number and never ruled here. Classify a change the owner asks for in `docs/product/requests.md` before step 1. Write in `packages/ui/CONTEXT.md`'s words; name a generic pattern by its field name once, say so, then use the glossary's word.

## Brief — before drawing

Method, slug table and shape: [references/design-brief.md](references/design-brief.md); each step fills its section from the guide sections named there. In and out below are the brief's own sections.

1. **Fix the surface.** In: its §7 row and slug (no §7 row: stop, raise the question); the requirement and directive ids; `docs/architecture/views/04-seams/08-8-a-drawn-surface.md`; the record's findings on it (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`, `docs/defects/`), so a brief never re-proposes what a round already measured and reverted. Out: the header and §1.
2. **Map the journeys.** In: §1. Out: §2.
3. **Model the content.** In: §1–§2. Out: §3.
4. **Draw the states matrix.** In: §3's regions. Out: §4, every cell filled or `n/a` with its reason.
5. **Choose the interaction.** In: §3–§4. Out: §5.
6. **Write the copy.** In: §3–§5; the fixed strings §1 lists. Out: §6.
7. **Bind the accessibility obligations.** In: §3–§6. Out: §7.
8. **Set the composition.** In: §3–§4. Out: §8, its `UiLayoutContract` relations and its give-way table.
9. **Pick the components.** In: §3–§8; `../build-ui/references/component-inventory.md`. Out: §9, each gap a `docs/design/README.md` §4.2 proposal.
10. **Collect what the material leaves open.** In: every section's open points; §8 of each guide read. Out: §10.
11. **Plan the evidence.** In: §4, §8. Out: §11, with its Must move and Must hold numbers.
12. **Check, then hand over.** Run "Before the status reads `proposed`" (design-brief.md). Out: the file at `proposed`, its row in `docs/design/briefs/README.md`, handed to `build-ui`.

## Audit — a built surface

Method and shape: [references/surface-audit.md](references/surface-audit.md).

1. **Locate.** In: the surface. Out: its slug, its view numbers (1 Overview … 7 Settings), its brief file.
2. **Capture.** In: the built app. Out: a `pnpm ui-review` pack (the command builds the app itself) and a `pnpm app:drive` PNG per state cell and journey step the pack lacks.
3. **Take the deterministic lane.** In: the pack's `report.json`. Out: its findings at the severity the rubric's deterministic section gives them, and its not-captured views, overlays and sizes.
4. **Walk four times** — rubric, journeys, tells, vocabulary. In: the pack. Out: every rubric row marked pass, no or not captured, each no with its number.
5. **Rank and bound.** In: the observations. Out: the refactor brief's items, the taste and deliberately-left lists, the open-question candidates.
6. **Append.** Out: `## Audit YYYY-MM-DD`, status `proposed`, the §7 row and the briefs index pointing at it. Repair nothing.

## Done when

1. Every claim in the written file cites a REQ, PD, §, token, component, rubric row or guide section, and no line restates one.
2. Nothing was written outside `docs/design/briefs/` (its `README.md` included), the surface's §7 row, `docs/architecture/open-questions.md` (and the part it names), `docs/product/requests.md` and `docs/defects/` (a defect noticed on the way, as `AGENTS.md` requires).
3. The close is the handoff of `docs/clean-room/agent-workflow.md` ("The handoff") — Zustand, Beweise, Offen, Nächster Schritt — with every item and its number in the message: `.ui-review/` is ignored by git, and a later capture empties it.

A lesson a loop pays for goes into the step, rubric row or brief section it amends as a dated bold note; a step whose failure can no longer happen says why before it is dropped. The corpus index is `docs/research/design/README.md`; this file keeps no copy of it.
