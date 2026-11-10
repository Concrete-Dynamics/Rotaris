# Transcript rows, run header — brief

**Status:** built 2026-11-10 on the branch `feat/r-097-ui-ux-overhaul` (not landed; the brief and its build are one pass under R-097, so no approval stands between them)
**Written:** 2026-11-10 by `design-ui` (audit; the brief's sections only where R-097 touches the surface), for [R-097](../../product/requests.md#r-097)
**Surface:** the Workspace view's run header; §7 row "Transcript rows, run header"; mockup section `WORKSPACE` → `transcript column`; nearest built code `packages/ui/src/RunHeader.tsx`; theme `rotaris-dim`

An audit of the run header alone, with the sections its item needs. The transcript rows are not audited here. Sections 2 to 7 and 9 are not written: R-097 changes no journey, state, interaction, string, accessible name or component.

## 1. Authority

- `REQ-CHAT-078`: the "Compress context" control in the run header, and its reason when disabled. `PD-CHAT-001`: the icon-led model and reasoning selectors. `REQ-LIBRARY-125`: the improvement indicator in the run header, its label in words (`REQ-SHELL-149`), never cut mid-word (live-run finding L10, recorded in `shell.css`).
- `REQ-SHELL-022`: the minimum window.
- Left open: which of the header's items gives way first, and how.

## 8. Composition intent

The header is a line with two ends. The state tag, the run's timing and the improvement indicator stand at its start; the compress control and the two selectors are one group at its end, in that order, and nothing stands between the groups but space. The end group never shrinks and no label in it breaks. When the line cannot hold both ends, the end group moves to a second line whole and stays at the end; the indicator keeps its label on one line while its own line holds it, and wraps between words, as L10 decided, only below that. *2026-11-10, while building: first written as "the indicator is what gives way". Measured, the centre column at 1440×900 is 788 px and the header's items need 871 px on one line (83, 48, 205 and 459 px, three gaps and the padding): for one line the indicator would have to give 83 of its 205 px, and what it gives it gives by breaking its label.*

Relations (published): on the header, `run-header`, `viewport-scroll` on the x axis, expected false; on the end group, `run-header-end`, `containment` in the header and `text-fit` on the x axis.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| run header | one line; two with the indicator shown, the end group whole on the second | same | same | same | same |

## 10. Disagreements and gaps

None.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=2`; drive: a scripted run to its end, `waitFor ".improvement-activity--run-header"`, `shot` while the indicator is shown, at 1440×900 and 1000×680. Rubric rows: C3, D4.

**Must move** (1440×900, indicator shown): lines of the "Compress context" label 2 → 1; rows of the selector group 2 → 1.
**Must hold:** `ui-audit` view 2 at both sizes: 0 findings; `improvement-activity.test.ts`; the indicator's label whole.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` view 2; drive: one scripted run to completion at 1440×900; theme `rotaris-dim`; by `design-ui`
**Unaudited:** the transcript rows; a live run's header at 1000×680; `nocturne`, `high-contrast`
**Count:** rows answered 2 of 2 asked (C3, D4); no 1 (medium 1); not captured 0
**Summary:** With no indicator the header is one centred line of compact controls. When the improvement indicator appears, every item shrinks at once.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D4, C3 | medium | after a run, at 1440×900: "Compress context" breaks onto two lines, the model selector stands above the reasoning selector with their icons on two different lines, and the indicator's label wraps onto two lines (`2-workspace-run2.png`) | every item of `.run-header` may shrink, the two `.run-controls` groups each take `margin-left: auto`, and the selector group wraps | the two-ended line of §8 | debug-ui | compress label lines 2 → 1; selector rows 2 → 1 | view 2: 0 findings; the indicator's label whole | `REQ-CHAT-078`, `REQ-LIBRARY-125`, D4 |

### Taste
- "Compress context" stands alone in the middle of the header when no indicator is shown.

### Deliberately left
- The second row under the header (stash, clear, search, terminal).

### Open-question candidates
- None.

## Execution 2026-11-10

By `debug-ui`, on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at both sizes (0 findings; view 2 carries 13 contracts, 10 before); a drive at 1440×900: one scripted run to completion, `waitFor ".improvement-activity--run-header"`.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | lines of the "Compress context" label; rows of the selector group | 2; 2 | 1 (the control is 24 px high); 1 (both selectors at y 140) | view 2: 0 findings; the indicator's label whole, on one line (22 px) — held |

The header with the indicator shown is 59 px, two lines; about 66 px before, read off the capture. With no indicator it is the one line it was, and "Compress context" stands with the selectors at the end instead of alone in the middle.

Not driven: a live run's header at 1000×680 with the indicator shown.
