# The design brief — shape

One file per surface at `docs/design/briefs/<slug>.md`, the slug taken from the surface's row in `docs/design/README.md` §7 (`overview`, `transcript-rows`, `composer`, `agent-list`, `approval-card`, `question-stepper`, `git`, `library`, `settings`, `provider-auth`, `terminal-window`, `requirements-board`, `first-launch`, `title-bar-and-rail`). The brief **cites**: a requirement by id, a token or component by name, a § of the design README by number. It restates none of them, and it is written in `packages/ui/CONTEXT.md`'s words.

```markdown
# <Surface> — brief

**Status:** proposed | approved <date> | built <date, commit> | verified <pack revision> | superseded by <path>
**Written:** YYYY-MM-DD by <skill or person>, for [R-NNN](../../product/requests.md#r-nnn) or <the task>
**Surface:** <glossary name>; §7 row "<row>"; mockup section `<section>`; nearest built code `<path>`

## 1. Authority
The requirements and directives that fix this surface, by id, each with the one clause that binds; what they leave open.

## 2. Journeys that cross it
Job stories ("when …, I want …, so that …"); for each: entry → steps → exit, the waits, the asks, the trust points.

## 3. Content model and hierarchy
What the surface holds, grouped; what is primary in each region; what is disclosed on demand and how; where a
requirement cluster becomes a region. Within the fixed structure — nothing here adds a view, a tab, an order or a label.

## 4. States
| Region | empty | loading | streaming | partial | error | success | disabled | permission-needed |
Each cell: drawn as what, saying what. "n/a" is a decision, stated.

## 5. Interaction
Patterns chosen (by field name once, then the glossary's word); keyboard reach and focus order; reversibility (undo
over confirm, where the requirement allows); what the command palette reaches; selection and bulk action, if any.

## 6. Copy
Every string the specification leaves open: label, empty state, error, confirmation, progress, acknowledgement —
in the adopted voice (sentence case, second person, no filler, exact monospaced numbers), the glossary's words.

## 7. Accessibility obligations
The REQ-SHELL-144..168 items that bind this surface, each with how the brief meets it.

## 8. Composition intent
Density tier; earned surfaces (what is a card, what is a line, and why); the alignment axes to publish as
`UiLayoutContract` relations (`align-x`, `align-y`, `equal-width`, `equal-height`, `spacing-token`, `containment`,
`text-fit`, `hit-test`, `viewport-scroll`); how the surface gives way at 1000×680 and the compact thresholds.

## 9. Components
From `.agents/skills/build-ui/references/component-inventory.md`, by name and variant. A gap: the affordance, the
requirement that demands it, a pointer to `docs/design/README.md` §4.2 — proposed, not drawn.

## 10. Disagreements and gaps
Each: the claim, the adopted or specified text it meets, the open question to raise (or its number once raised).

## 11. Evidence plan
`pnpm ui-review` views, sizes and theme; the probes; the proofs; the numbers that must hold.
```

A brief that proposes behaviour no requirement states is not a brief but a request: classify it in `docs/product/requests.md` first. Audits of the built surface are appended to the same file as `## Audit YYYY-MM-DD` (see [surface-audit.md](surface-audit.md)).
