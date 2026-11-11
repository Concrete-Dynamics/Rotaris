# The design brief — shape and method

One file per surface at `docs/design/briefs/<slug>.md`. The brief **cites** — a requirement or directive by id, a token or component by name, a § of `docs/design/README.md` by number — and restates none of them, in `packages/ui/CONTEXT.md`'s words. It fills the eleven sections below in order, each from the guide sections its row names (`13 §4 step 1` is guide 13 of `docs/research/design/`, section 4, step 1); a section is done when its **Complete when** answers yes. The rubric row a section feeds (`../../review-ui/references/critique-rubric.md`) is what the built surface will be scored on.

Four rules shape every section. **Fixed before free** (02 §4 step 2): list each binding clause in §1 before designing anything; only what no clause fixes is designed, and all of it is. **Difficult data first** (02 §4 step 6): the longest path, branch and persona name, a delegation tree three levels deep, every empty, loading and error state, 200 % scaling. **Names, never values** (01 §4 step 4): a token by a name that exists in `packages/contracts/src/theme/themes.ts`; a value the material does not name is a §10 proposal, never a new name in §8. **Settle or raise** (01 §4 step 5): every open choice — which component, which selection idiom, which pane becomes an overlay drawer, which column survives the floor — is settled here or listed in §10; a choice left open reaches a repair round as a guess, and a round cannot make it.

## Which slug, and how it is captured

The slug is the surface's row in `docs/design/README.md` §7. `--views=` takes `ui-audit`'s numbers, the rail's order under `PD-SHELL-015`: 1 Overview, 2 Workspace, 3 Requirements, 4 Git, 5 Library, 6 Settings; or a view's identifier (`--views=overview,settings`), which does not move when the rail does. *(Until 2026-11-11 this read seven, with 3 Mission; Mission is not a view, and what it drew is the Overview's.)*

| Slug | §7 row | `--views=` | Not in the `ui-review` pack — reach it with `pnpm app:drive` |
|---|---|---|---|
| `title-bar-and-rail` | Title bar, nav rail | all (omit `--views=`) | — |
| `overview` | Overview | 1 | the delegation graph and the agent table during a run: drive a scripted run with delegated agents, `waitFor` `.agent-table__row` |
| `transcript-rows` | Transcript rows, run header | 2 | each row category: drive a scripted run, `waitFor` the row |
| `composer` | Queue, composer, slash catalogue | 2 | the slash popup is a captured overlay; queue states by `type --enter` |
| `agent-list` | Agent list, context rings, inspector | 2 | a delegation tree; persona windows by `windows`, `useWindow persona:<persona>` |
| `approval-card` | Approval card | 2 | `--window=approval` on an open approval |
| `question-stepper` | Structured questions | 2 | a run that raises a structured question |
| `git` | Git worktrees, commits, diffs | 4 | — |
| `library` | Library tabs and cards | 5 | — |
| `settings` | Settings panes and save bar | 6 | — |
| `provider-auth` | Provider auth | — | `start --fresh`, the provider sign-in dialog |
| `terminal-window` | Terminal window and transcript preview | 2 (the preview) | `useWindow terminal` |
| `requirements-board` | Requirements board, review, new requirement | 3 | the review modal and the new requirement dialog by their commands |
| `first-launch` | First launch | 1 | `start --fresh` |

A surface with no §7 row takes its slug from the decision that creates it: where an owner-authorized round may change the information architecture, a new surface's row is added to `docs/design/README.md` §7 as part of the directive that supersedes the structure it departs from (R-098), and the brief cites that directive in its §1. Without such a round a surface with no §7 row still has no slug: that is an open question, not a new row.

## The template

```markdown
# <Surface> — brief

**Status:** proposed | approved <date> | built <date, commit> | verified <pack revision> | superseded by <path>
**Written:** YYYY-MM-DD by <skill or person>, for [R-NNN](../../product/requests.md#r-nnn) or <the task>
**Surface:** <glossary name>; §7 row "<row>"; mockup section `<section>`; nearest built code `<path>`; theme `<name>`

## 1. Authority
## 2. Journeys that cross it
## 3. Content model and hierarchy
## 4. States
| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
## 5. Interaction
## 6. Copy
## 7. Accessibility obligations
## 8. Composition intent
| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
## 9. Components
## 10. Disagreements and gaps
## 11. Evidence plan
```

## Section by section

| § | Holds | Fill from | Complete when — every answer yes | Feeds |
|---|---|---|---|---|
| 1 | The requirements and directives that fix the surface, each with the one clause that binds; the fixed strings by id; **departures from the mockup**, each with the clause that forces it; what is left open, as a list | the §7 row; `docs/spec/`; `docs/product/directives.md`; 01 §4 steps 1–2; 03 §4 step 1 | Does every id resolve in `docs/spec/` or `docs/product/`? Is a governing directive cited in place of the requirement it displaces? Does every departure name its clause? Is "left open" a list, not a paragraph? | all |
| 2 | Job stories ("when …, I want …, so that …"); per journey: entry → steps → exit, its waits, asks and trust points, its failure branch; the several-agents journey wherever agents appear | 04 §3, §4 (the journey table); 06 §2, §4 steps 1–2 | Is every journey of 04 §4's table that crosses the surface listed or ruled out by name? Does every wait name its limit, every ask its commitment, every trust point the evidence the operator checks? Does each journey have a recover step? | F1 |
| 3 | What the surface holds, grouped into regions; the one primary per region and per row; what is disclosed on demand and by which named control; the pane relations | 03 §2, §4 steps 2–9, §5 | Does every region trace to a cited requirement id? Is the count of views, tabs, orders and labels absent from §1's ids zero? Does each region name its one primary? Does the model hold the difficult data — the longest name, the deepest tree, the most rows? | C1, O1, O2 |
| 4 | The matrix: rows are regions, the template's columns (13 §4 step 1); each cell drawn as what, saying what, and how large | 13 §2, §3, §4 steps 1–4; 06 §4 steps 4–5 | Is every cell filled, or `n/a` with its reason? Does each cell name its requirement and component, and is one with neither in §10? Does every empty cell name what fills it, its one control and its size against its region's? | F2 |
| 5 | Patterns chosen (by field name once, then the glossary's word); the Tab sequence, initial focus and focus after each change; reversibility; what the command palette reaches | 05 §3, §4 steps 1–10; 08 §3, §4 steps 1–7; 06 §4 steps 6–8 | Is every command on the surface named with its palette entry? Is the focus order listed stop by stop, with initial focus and focus after close? Is each irreversible command's guard named, and does no reversible one take a `ConfirmDialog`? | F3, D3 |
| 6 | Every string the specification leaves open — label, empty state, error, confirmation, progress, acknowledgement — beside its region and state cell; for each string that grows with the run, its bound | 10 §2, §3, §4 steps 1–8 | Is each string either the specification's (cited) or written here? Are its *Avoid* words zero, its figures exact, its labels verb-first in sentence case? Does every growing string have a bound? | F4 |
| 7 | The `REQ-SHELL-144`..`168` items that bind the surface, each with how it is met and what that forbids the drawing to shorten; the live regions | 09 §2, §4 steps 1–8, §6; 13 §4 step 8 | Is every binding item listed with its means? Is each announcement's role named — `status`, `alert` or `log`? Is every requirement that fixes an accessible name or description cited? | F3 |
| 8 | Density tier; the earned surfaces (what is a card, what is a line, and what each separates from what); the roles sharing one geometry; the alignment axes as `UiLayoutContract` relations (`align-x`, `align-y`, `equal-width`, `equal-height`, `spacing-token`, `containment`, `text-fit`, `hit-test`, `viewport-scroll`) with their `data-ui` ids; the give-way table: per region and band, what holds, what gives way first and how, and what the container does while the child gives way | 07 §2, §3, §4 steps 1–9; 14 §2, §3, §4 steps 1–6 | Is the tier named with the mockup section it came from? Is the earned set a count C5 can be read against? Does every repeated edge or gap have a relation and an id? Is each band's arrangement in the table, holding the difficult data at 1000×680? | C1–C9, D2, D4 |
| 9 | The components, by inventory name and variant, with the selection idiom each selectable control takes; each gap with the affordance, the requirement that demands it and its §4.2 entry | `../../build-ui/references/component-inventory.md`; 12 §4 steps 1–2; 01 §3 | Is every control an inventory name and variant? Is every gap a §4.2 pointer (a G-number, or a new proposal), never a drawing? | O1, D3 |
| 10 | Each disagreement or gap: the claim, the adopted or specified text it meets, the open question to raise or its number | section 8 of every guide read above; every `n/a` and "left open" line of §1–§9 | Does every item name both the claim and the text it meets? Is none of them designed anyway in §3–§9? | — |
| 11 | The capture (`--views=`, sizes, theme — the line in `surface-audit.md`, "Capture"); the `app:drive` steps for what the pack misses (the slug table); the rubric rows to pass; **Must move**: the numbers the drawing changes; **Must hold**: the numbers it must not change, each with the proof that measures it (`rows-proof`'s 52, 112 and 30 px are the precedent) | 01 §6; 11 §4 step 3; 13 §4 step 10; 14 §4 step 7 | Is every §4 cell reachable by a named capture step with a `waitFor`, never a sleep? Does every row id listed exist in the rubric? Are the sizes at least 1400×900 and 1000×680, with 1179/1181 and 1079/1081 where §8 gives way? Does every Must hold number name its proof? | all |

## Before the status reads `proposed`

| # | Question | Yes is required |
|---|---|---|
| 1 | Does the brief hold token names and no token values (no literal colour, pixel or duration)? | 01 §6 |
| 2 | Does no line restate the specification or §1 — every rule a citation? | `docs/design/briefs/README.md` |
| 3 | Is every term the glossary's, a generic pattern named by its field name once? | `packages/ui/CONTEXT.md` |
| 4 | Does it propose no behaviour a requirement does not state? If it does, it is a request: classify it in `docs/product/requests.md` first. | `AGENTS.md` |
| 5 | Is every section's **Complete when** yes? | this file |

Audits of the built surface are appended to the same file as `## Audit YYYY-MM-DD` ([surface-audit.md](surface-audit.md)). A brief whose audits outgrow the document budget moves its oldest audits to `<slug>/` parts (`docs/design/briefs/README.md`).
