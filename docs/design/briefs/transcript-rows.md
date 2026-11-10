# Transcript rows, run header — brief

**Status:** proposed
**Written:** 2026-11-10 by `design-ui` (audit; the brief's sections only where R-097 touches the surface), for [R-097](../../product/requests.md#r-097)
**Surface:** the Workspace view's run header; §7 row "Transcript rows, run header"; mockup section `WORKSPACE` → `transcript column`; nearest built code `packages/ui/src/RunHeader.tsx`; theme `rotaris-dim`

An audit of the run header alone, with the sections its item needs. The transcript rows are not audited here. Sections 2 to 7 and 9 are not written: R-097 changes no journey, state, interaction, string, accessible name or component.

## 1. Authority

- `REQ-CHAT-078`: the "Compress context" control in the run header, and its reason when disabled. `PD-CHAT-001`: the icon-led model and reasoning selectors. `REQ-LIBRARY-125`: the improvement indicator in the run header, its label in words (`REQ-SHELL-149`), never cut mid-word (live-run finding L10, recorded in `shell.css`).
- `REQ-SHELL-022`: the minimum window.
- Left open: which of the header's items gives way first, and how.

## 8. Composition intent

The header is one line with two ends. The state tag, the run's timing and the improvement indicator stand at its start; the compress control and the two selectors are one group at its end, in that order, and nothing stands between the groups but space. The end group never wraps and no label in it breaks. The improvement indicator is what gives way: it wraps between words, as L10 decided, once the line is too short for it, and the header grows by that line.

Relations: `align-y` over the header's controls (`run-header-control`), centres within 1 px; `text-fit` on the compress control's label.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| run header | one line | one line | one line | one line; the indicator wraps between words if it must | same |

## 10. Disagreements and gaps

None.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=2`; drive: a scripted run to its end, `waitFor ".improvement-activity--run-header"`, `shot` while the indicator is shown, at 1440×900 and 1000×680. Rubric rows: C3, D4.

**Must move** (1440×900, indicator shown): lines of the "Compress context" label 2 → 1; rows of the selector group 2 → 1; header height 67 px → `--rt-control-height` plus its padding.
**Must hold:** `ui-audit` view 2 at both sizes: 0 findings; `improvement-activity.test.ts`; the indicator's label whole.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` view 2; drive: one scripted run to completion at 1440×900; theme `rotaris-dim`; by `design-ui`
**Unaudited:** the transcript rows; a live run's header at 1000×680; `nocturne`, `high-contrast`
**Count:** rows answered 2 of 2 asked (C3, D4); no 1 (medium 1); not captured 0
**Summary:** With no indicator the header is one centred line of compact controls. When the improvement indicator appears, every item shrinks at once.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D4, C3 | medium | after a run, at 1440×900: "Compress context" breaks onto two lines, the model selector stands above the reasoning selector with their icons on two different lines, and the indicator's label wraps with 400 px of the line free (`2-workspace-run2.png`) | every item of `.run-header` may shrink, the two `.run-controls` groups each take `margin-left: auto`, and the selector group wraps | the two-ended line of §8 | debug-ui | compress label lines 2 → 1; selector rows 2 → 1 | view 2: 0 findings; the indicator's label whole | `REQ-CHAT-078`, `REQ-LIBRARY-125`, D4 |

### Taste
- "Compress context" stands alone in the middle of the header when no indicator is shown.

### Deliberately left
- The second row under the header (stash, clear, search, terminal).

### Open-question candidates
- None.
