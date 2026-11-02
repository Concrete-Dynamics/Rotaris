# The surface audit — method and the refactor brief's shape

Run the steps in order. In: a built surface. Out: a prioritized refactor brief appended to the surface's brief file. Repair nothing; `build-ui` and `debug-ui` execute the items. A guide is named by its number in `docs/research/design/` (`02 §4 step 3`); the rubric is `../../review-ui/references/critique-rubric.md`.

## Method

1. **Locate.**
   - In: the surface's name.
   - Do: find its row in `docs/design/README.md` §7 and its slug ([design-brief.md](design-brief.md), "Which slug"); take the view numbers it renders in from the same table (`REQ-SHELL-023`'s order); open `docs/design/briefs/<slug>.md`, or create it with the brief's header block alone.
   - Out: slug, view numbers, brief file, and the brief's §2 journeys and §4 matrix where they exist.
2. **Capture.**
   - In: the working tree at the head to audit.
   - Do: `pnpm ui-review -- --iteration=1 --views=<n,…> --sizes=1400x900,1000x680`; add `1179x900,1181x900,1079x900,1081x900` for a surface that gives way at the thresholds (14 §4 step 7), `--theme=<name>` for a second palette (`rotaris-dim`, `nocturne`, `high-contrast`), one pack per theme; a capture empties its iteration directory, so read and record each pack before the next. `ui-review` builds the app itself (through `ui-audit`), so no `pnpm build` precedes it. If it refuses because the iteration holds a critique, take the next iteration, at most 3; never pass `--reshoot` over a critique you did not write.
   - Out: `.ui-review/<revision>/iteration-<n>/` — a PNG per view and size, `geometry.json`, `styles.json`, `report.json`, `manifest.json` (the theme, sizes and views under `captured`; the finding counts under `deterministic.byKind` and `contractsByRelation`).
3. **Capture what the pack lacks.**
   - In: the §4 matrix (13 §4 step 1's columns, without a brief); the journeys crossing the surface; the slug table's last column.
   - Do: `pnpm build`, then `pnpm app:drive start --fresh`; drive each state cell and each journey step through product controls; `waitFor` its condition, never a sleep; `shot` it; `resize` across 1180 and 1080 and back where a pane or drawer is in question; read `document.getAnimations()` with `eval` where motion is judged; `stop` when done (11 §4 step 3; 13 §4 step 10).
   - Out: a PNG per state cell and journey step, each named for its cell or step.
4. **Take the deterministic lane.**
   - In: `report.json`.
   - Do: list every `TRACKS`, `CONTAINMENT`, `STACKING`, `TRAPPED`, `SHRUNK`, `CONTRACT`, `UNREACHED` and `AUDIT-ERROR` finding for the surface's views and sizes, and `pnpm theme-proof`'s where colour is in question; the rubric's deterministic table says what each kind measures, which row it evidences and the severity the measurement decides (never low). An `UNREACHED` or `AUDIT-ERROR` view, overlay or size was not captured: capture it by step 3 or list it under **Unaudited**; it is never a pass.
   - Out: the deterministic items, category `deterministic`.
5. **Walk four times.**
   - In: the pack, the step-3 PNGs.
   - Do: a free read of every PNG first, nothing filed (11 §4 step 4); then the four walks in the table below, each written as it is walked. Every rubric row ends with one of three marks: **pass**, **no** (with its number and evidence file) or **not captured** (with the capture step that would answer it). A row left blank fails the audit, not the surface.
   - Out: the raw observations, each with its number and evidence file; the Count line.
6. **Sort into lanes.**
   - In: the observations.
   - Do: per observation, measured (a deterministic kind, or a rubric number read from the pack), predicted (from a walk; confirmed by a drive before it becomes an item) or taste (no rule named) (11 §4 step 6). Read `packages/contracts/src/theme/themes.ts` and `docs/design/system/components.css` before calling a value an invention (`review-ui` step 6). Move a finding inside what the specification fixes to the open-question candidates (02 §4 step 2).
   - Out: findings that name a criterion, a rule and a number; taste listed apart.
7. **Merge, then rank.**
   - In: the findings.
   - Do: merge duplicates by cause — one item per cause, carrying every rubric row it fails (11 §3, §6; the rubric's Critic step 5); set severity by the rubric's table; set journey criticality — on a primary path when a journey of the brief's §2 (04 §4's table, without a brief) crosses the element.
   - Out: the items ordered high-and-primary first, low-and-off-path last; within a level the item seen on more views or sizes first; a tie keeps rubric order (F, C, D, O).
8. **Bound each item.**
   - In: the ranked items.
   - Do: one item per cause, not per symptom, and one region or one component per item (01 §4 step 6). Name the cause where it is traced; where it is not, write "cause not traced" and the item executes as `debug-ui`. Name the number that must move, from its value now to the value that passes, and the container's number that must hold — the cell and the table, the item and the strip, the panel and its card; `SHRUNK` is a child fitted by shrinking its box. A choice that is the material's — what gives way, which idiom a control takes, a declared width — executes as a decision, `brief §8` / `brief §9` or `OQ-<n>`, never as a CSS nudge. Name the requirement, directive or § the item answers to.
   - Out: the table rows.
9. **Write and point.**
   - In: the rows, the lanes, the candidates.
   - Do: append the shape below to the brief file; point the surface's §7 row and its row in `docs/design/briefs/README.md` at it.
   - Out: `## Audit YYYY-MM-DD`, status `proposed`.

## The four walks

| Walk | Read | Do | Write |
|---|---|---|---|
| rubric | the rubric, each row's Guide sections | answer every row's question from its Evidence cell | per row: pass, no (the number in the sentence, the evidence file) or not captured |
| journeys | 04 §4's table and §6; 11 §4 step 5 | walk each journey step on the built surface; ask the four questions per step | per step: completes, stalls or misleads; each wait not named |
| tells | 02 §3 and §4 steps 3–5; §3 of 05, 06, 07, 10 | count each tell with a number per row; three or more on one surface is rubric D1 | each tell present and the counter-move it is answered by, cited (§1.x, token, component) |
| vocabulary | `packages/ui/CONTEXT.md`'s *Avoid* lines; 10 §3 | read every visible string and accessible name | each avoided word, where it stands, and the glossary word it should be |

## Shape

```markdown
## Audit YYYY-MM-DD

**Status:** proposed
**Pack:** <revision>/iteration-<n>; views <numbers>; sizes <list>; theme <name>; drives <the app:drive steps>; by <skill or person>
**Unaudited:** <views, sizes or states neither the pack nor the drive reached, or "none">
**Count:** rows answered <n> of <N>; no <n> (high <n>, medium <n>, low <n>); not captured <n>
**Summary:** two sentences — what the surface does well, naming the token or contract it meets; what it owes.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | C5 | medium | 14 of 16 transcript rows carry a border (`2-workspace-1400x900.png`) | `.row` border on every variant | … | build-ui | bordered rows 14 → 4 | `rows-proof` 52, 112, 30 px; `SHRUNK` 0 | §7.2, REQ-CHAT-046 |

Executes: `build-ui`, `debug-ui`, `brief §8` / `brief §9` (the decision first), or `OQ-<n>`.

### Taste
Observations no rule names, each with what it weakens; not items.

### Deliberately left
What was seen and not proposed, and why: a ruling owns it, a requirement fixes it, the cost exceeds the harm.

### Open-question candidates
Per item the claim, the adopted or specified text it meets, the question — raised in
`docs/architecture/open-questions.md` from the next free number, never ruled here.
```

The executing skill keeps a repair only if its Must move number moved and its Must hold numbers did not (`build-ui` step 7, `debug-ui` step 8); an item reaches `verified-resolved` (`critique-schema.md`'s lifecycle) from a fresh pack read in a fresh context, never on the builder's word. Close as `SKILL.md`'s "Done when" says.
