## CLAUDE.md and two READMEs state a discharged theme bound as unmet

The process-state wording in three governing documents trails the record. `CLAUDE.md` presents `REQ-SHELL-128`'s three
built-in themes as a bound that "cannot yet be met (IC-2)" and that "no agent may treat as advice", although IC-2 was
discharged on 2026-09-04 by `pnpm theme-proof` and OQ-30 closed the same day; it says the conditions file holds "IC-1 to
IC-7" although it also holds IC-8; and it states the authorization as "the mechanism" with no word of R-071 (the work
counts as finished without the release pipeline, signing, the icon, CI or the Linux and macOS builds) or R-072 (the
consortium rules open questions under the owner's delegation). `docs/design/README.md` §3.2 still calls `nocturne` and
`high-contrast` undesigned with no light/dark flag or metadata, and §5 annotates only item 1 as settled although
theme-proof settled items 2 to 6 (all but the different-scale multi-monitor drag, the owner's measurement). And
`docs/architecture/README.md` calls OQ-30 "partly satisfied", counts "Six entries" in the conditions file and names
"IC-1 to IC-6". None of it changes the product; it misleads an agent reading the governing documents first.

Found by the 2026-10-13 survey at `6de2a67` (item N8).

## Specs

- None contradicted in the product. The documents disagree with their authorities: `docs/architecture/implementation-conditions.md`
  (IC-2 "DISCHARGED 2026-09-04"; IC-8), `docs/architecture/open-questions.md` (OQ-30 "CLOSED 2026-09-04"),
  `docs/product/requests.md` R-071 and R-072. `REQ-SHELL-128`, `REQ-SHELL-160`.

## Relevant files

- `CLAUDE.md` — "Process state": the authorization sentence, the IC-2 bullet, "IC-1 to IC-7".
- `docs/design/README.md` — §3.2 "All three themes but one"; §5 items 2 to 6.
- `docs/architecture/README.md` — the Status bullet ("IC-1 to IC-6"), the Unresolved bullet (OQ-30 "partly satisfied"),
  the Binding at build time bullet ("Six entries").
- `packages/contracts/src/theme/themes.ts` — `THEME_NAMES` and `THEMES`: all three themes with a palette, label,
  description and dark flag.
- `docs/architecture/spikes/theme-proof.md` — the fifteen rendered-pixel runs that discharged IC-2.

## Repaired — 2026-10-13 (fin41)

Corrected in place, the old wording kept beside each correction, with the owner's approval of the CLAUDE.md edit
("Go." to step 1 of the 2026-10-13 plan, whose text asked for it).

- `CLAUDE.md` — "Two bounds" reads "One bound": the IC-3 bullet stands word for word, and the IC-2 bullet is replaced by
  a dated note quoting it and saying it was discharged on 2026-09-04, OQ-30 closed and only the owner's multi-monitor
  drag remains. "IC-1 to IC-7" reads "IC-1 to IC-8". One sentence after the authorization names R-071's finish and
  what it deferred. (R-072 is named under "When the owner asks for something", by
  `the-process-pages-say-only-the-owner-rules-an-open-question.md`.)
- `docs/design/README.md` — §3.2 gains a dated note: the paragraph describes the material as imported; the build
  carries both palettes and every theme's metadata, IC-2 is discharged and OQ-30 closed. §5 items 2 to 6 each gain a
  "settled from rendered pixels 2026-09-04" note naming what `pnpm theme-proof` showed; item 4's different-scale drag
  is marked not settled, the owner's measurement, and item 2's macOS and Linux halves stay IC-3's.
- `docs/architecture/README.md` — the Status bullet, the Unresolved bullet (OQ-30) and the Binding at build time bullet
  each gain a dated correction: eight conditions and the state of each, OQ-30 closed, R-071 and R-072.

No test: documentation only. Confirmed by reading each claim against its authority at `6de2a67` —
`docs/architecture/implementation-conditions.md` (IC-2 "DISCHARGED 2026-09-04"; the IC-8 heading; IC-4's open half;
IC-8 "Not discharged. The macOS half has still not run"), `docs/architecture/open-questions.md` (OQ-30 "CLOSED
2026-09-04"), `docs/architecture/spikes/theme-proof.md` (fifteen runs; one display) and
`packages/contracts/src/theme/themes.ts` (`THEME_NAMES`, `THEMES`).
