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
