# Design research — how interfaces are designed well, and how this one is

**Version:** 1.0
**Prepared:** 2026-11-01, for the owner's request of that day (`docs/product/requests.md`, the design-system overhaul)
**Review date:** 2026-11-01
**Format:** fourteen guides, this index, a reference catalogue and a ranked backlog.

## Scope and status

This corpus is **guidance, never authority**. It informs craft within [`docs/design/README.md` §1](../../design/README/01-1-the-design-language.md) and structure within [§2](../../design/README/02-2-the-adoption-rule.md), and it overrides neither. It licenses no screen, tab, order or label the specification does not state (`REQ-SHELL-023` and the authorities §2 names), and it mints no member of the language. Where a guide disagrees with the adopted material, its section 8 names the claim, the adopted text it meets and the open question to raise; adopted text is never edited from here. [`docs/design/README.md` §6.1](../../design/README/06-6-reference.md) states the standing.

**Clean-room note.** Every source is public literature or public platform documentation. A pattern is described generically, by what it does for the person using it; no other product's structure is transcribed and no screenshot is reproduced, for the same reason §2 does not adopt the mockup's information architecture. The reference repositories named in `AGENTS.md`'s hard boundary were not consulted.

## Guide index

| Guide | Scope | Status | Used by |
|---|---|---|---|
| [01 How AI design tools design applications](01-how-ai-design-tools-design.md) | how generative design tools decompose a brief, what they pin, how to brief an agent for design, why generated interfaces converge | written | brief rules, §1, §9, §10, §11; audit step 5; rubric D1 |
| [02 The generated look and its counter-moves](02-the-generated-look-and-its-counter-moves.md) | the tells of a generated interface, each with the counter-move the adopted language already states | written | brief rules, §10; audit steps 4, 5; rubric C5, C8, D1, D3, O1 |
| [03 Information architecture within a fixed structure](03-information-architecture-within-a-fixed-structure.md) | what remains to design when the primary views, their order, tabs and labels are fixed | written | brief §1, §3, §10; rubric C2, C3, O1, O2 |
| [04 The agent operator's journeys](04-the-agent-operator-journeys.md) | job stories and task flows of a developer operating agents, across the seven views | written | brief §2, §10; audit steps 4, 5; rubric F1 |
| [05 Interaction patterns for desktop tools](05-interaction-patterns-for-desktop-tools.md) | palette, keyboard, panes, dense lists, selection, inline edit, undo — as patterns | written | brief §5, §10; audit step 4; rubric F3, C2, C4, D3 |
| [06 UX patterns for agent products](06-ux-patterns-for-agent-products.md) | streaming, tool calls, approvals, trust, interruption, cost, attribution | written | brief §2, §4, §5, §10; audit step 4; rubric F1 |
| [07 Visual composition beyond tokens](07-visual-composition-beyond-tokens.md) | hierarchy, rhythm, alignment, grouping, density, earned surfaces, colour as signal | written | brief §8, §10; audit step 4; rubric C1–C8, D2, O2 |
| [08 Platform conventions for Electron](08-platform-conventions-for-electron.md) | chrome, menus, dialogs, scrollbars, DPI, focus, system theme on three platforms | written | brief §5, §10; rubric F3 |
| [09 Accessibility for a dense desktop tool](09-accessibility-for-a-dense-desktop-tool.md) | WCAG 2.2 AA mapped onto REQ-SHELL-144..168 | written | brief §7, §10; rubric F3 |
| [10 UX writing](10-ux-writing.md) | labels, empty states, errors, confirmations, progress, in the adopted voice | written | brief §6, §10; audit step 4; rubric F2, F4, C7 |
| [11 Design critique and evaluation](11-design-critique-and-evaluation.md) | heuristics, walkthroughs, severity, taste against defect, critique over a pack | written | brief §11; audit steps 2, 4, 5; rubric F1, Critic step 6, filing gate |
| [12 Design-system governance and drift](12-design-system-governance-and-drift.md) | tokens as contract, lint as governance, review dates, why copies drift | written | brief §9, §10; rubric C6, C9 |
| [13 States, feedback and time](13-states-feedback-and-time.md) | the states matrix, timing thresholds, acknowledgement against notice, undo windows | written | brief §4, §7, §10, §11; audit step 2; rubric F2, C9 |
| [14 How a surface gives way](14-how-a-surface-gives-way.md) | the minimum size and the compact thresholds; bounding the box, not the child | written | brief §8, §10, §11; audit step 2; rubric D4 |

The guides are numbered once and never renumbered; a later guide takes the next number. The [backlog](backlog.md) ranks what the guides' section 8 and §4.2 of the design README propose; the [reference catalogue](REFERENCES.md) deduplicates every source.

## How the corpus reaches the pipeline

| Stage | Skill | Reads | Writes |
|---|---|---|---|
| before a surface is drawn | `design-ui` brief (`.agents/skills/design-ui/SKILL.md`) | the guide sections `design-brief.md` names per brief section (01–14); the brief template | `docs/design/briefs/<slug>.md` (`proposed`) |
| while drawing | `build-ui` | the rubric's "while building" column, and the guides through its Guide column | the surface |
| after drawing | `review-ui` | the rubric | `critique.json` (not committed), the handoff |
| overhauling a built surface | `design-ui` audit | the rubric; the guide sections `surface-audit.md` names (01, 02, 04–07, 10, 11, 13, 14) | `## Audit` in the surface's brief |
| repairing | `debug-ui` | the rubric criterion a composition repair answers to | the repair |

The rubric is one file, `.agents/skills/review-ui/references/critique-rubric.md`, so the builder builds against exactly what the critic scores. Checklists live in the derivative that uses them and nowhere else; the guides carry the reasoning.

## Shared document structure

Every guide opens with its title, a one-line scope, `**Review date:** YYYY-MM-DD` and `**Status:** guidance …`, then exactly these nine sections:

1. **Purpose and scope** — the question answered; what the guide does not decide
2. **Principles** — the distilled claims, each tagged `[n]` to section 9
3. **Patterns and anti-patterns** — a table: pattern · when · tell · counter-move
4. **Method** — the procedure an agent follows
5. **Worked example** — one Rotaris surface, named by its §7 row and nearest built code
6. **Checks** — what a reviewer can verify, measurable where possible; the rubric lifts from here
7. **How this applies here** — the requirements, directives, tokens and components touched; which derivative reads which section; dated italic notes for later lessons and rulings
8. **Where this disagrees with the adopted material** — per item the claim, the adopted text it meets (§, REQ, PD) and the open question to raise; "None" when none; never an edit
9. **References and further reading** — `[n] [Author or organisation, Title](url) — what was taken; retrieved YYYY-MM-DD`

`tools/check-research-guides.mjs` (in `pnpm lint`) holds every guide to the review-date line, section 9, and for this corpus sections 7 and 8.

## Vocabulary

[`CONTEXT-MAP.md`](../../../CONTEXT-MAP.md) → [`packages/ui/CONTEXT.md`](../../../packages/ui/CONTEXT.md) is the only product vocabulary: primary view, not page or screen; status strip, not status bar; acknowledgement, not toast; notice, not alert or banner; composer, not input box; transcript, not chat log; question stepper, not wizard. A guide may name a generic pattern by its field name once, says so, and then uses the glossary's word.

## Keeping it current

- The review date on a guide and on `REFERENCES.md` moves when the guide is re-read against its sources; nothing else moves unless something changed.
- A lesson a loop pays for goes into the guide's section 7 as a dated italic note, or into the rubric row it amends as a dated bold note — the UI skills' convention. A ruled open question from section 8 gets its note in section 7; the ruling stays the authority. The questions the guides' sections 8, the backlog and the Overview audit raised are OQ-493 – OQ-540, filed 2026-11-03 ([R-093](../../product/requests.md#r-093)) and not ruled; each §8 item and backlog row names its number, or says "none filed" and why.
- The "Used by" column says what an edit may break.
- The lint fails on a missing review date or section, and prints each guide's age; it never fails on age.

## Reference catalogue

[`REFERENCES.md`](REFERENCES.md) deduplicates every source, with the date it was retrieved, the guides that use it and what was taken from it.
