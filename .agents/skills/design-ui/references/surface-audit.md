# The surface audit — method and the refactor brief's shape

An audit reads a **built** surface against the rubric, the journeys, the tells and the vocabulary, and writes a prioritized refactor brief. It repairs nothing; `build-ui` and `debug-ui` execute what it proposes.

## Capture

1. `pnpm build`.
2. `pnpm ui-review -- --iteration=1 --views=<n> --sizes=1400x900,1000x680` (add `--theme=` for a second palette). The pack lands under `.ui-review/<revision>/iteration-1/`: PNGs per view and size, `geometry.json`, `styles.json`, `report.json` (the deterministic findings), `manifest.json`.
3. Read the deterministic findings first — `CONTRACT`, `SHRUNK`, `CONTAINMENT`, `STACKING`, `TRAPPED`, `TRACKS` keep their measured severity and are not re-judged.

## Four walks

| Walk | Against | Writes down |
|---|---|---|
| rubric | `.agents/skills/review-ui/references/critique-rubric.md` | per criterion: pass, or an observation **with the number in the sentence** and the evidence file |
| journeys | `docs/research/design/04-the-agent-operator-journeys.md` | each journey step the surface serves: completes, stalls, misleads; where it waits without saying so |
| tells | `docs/research/design/02-the-generated-look-and-its-counter-moves.md` | each tell present, and the counter-move the adopted language already states |
| vocabulary | `packages/ui/CONTEXT.md`'s *Avoid* lines | every string on the surface that uses an avoided word, and the glossary word it should be |

## The refactor brief

```markdown
## Audit YYYY-MM-DD

**Pack:** <revision>/iteration-1, <views>, <sizes>, <theme>; **by** <skill or person>
**Summary:** two sentences — what the surface does well, what it owes.

| # | Criterion | Observation (with numbers) | Bounded change | Executes | Must move | Answers to |
|---|---|---|---|---|---|---|
| 1 | C5 | … 14 of 16 rows are cards; … | … | build-ui | the card count; `SHRUNK` 0 | §1.7, REQ-… |

Ordered by severity × journey criticality: high and on a primary path first; low and off-path last.

### Deliberately left
What was seen and not proposed, and why (a ruling owns it; the requirement fixes it; the cost exceeds the harm).

### Open-question candidates
Each: the claim, the adopted or specified text it meets, the question — raised in `docs/architecture/open-questions.md`
from the next free number, never ruled here.
```

Every item names the number that must move, so the executing skill can keep the repair only if it moved (`build-ui` step 7, `debug-ui` step 8). Point the surface's §7 row at the file. The findings and their numbers go into the handoff message as well — the pack is not committed.
