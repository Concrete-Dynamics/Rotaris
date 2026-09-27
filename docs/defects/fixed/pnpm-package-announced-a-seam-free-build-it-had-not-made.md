## `pnpm package` announced a seam-free build it had not made

`apps/desktop/scripts/package.mjs` builds with the verification seams compiled out (`ROTARIS_BUILD=package`) and leaves
that build in `apps/desktop/out/`, where every `*-proof` script and `pnpm app:drive` expect the seam build. Since
2026-09-18 (`4861978`) its `finish()` has warned about that: "`out/` now holds a SEAM-FREE build — run `pnpm build`
before any proof or `pnpm app:drive`." It printed the line after **every** run. A run refused before
`electron-vite build` never touched `out/`, and still told the operator that it had replaced the build there. On
`56801df` two steps could refuse that early, the code-intelligence bundle and the manifest check. The notices step of
first-release-plan.md §4.4 added a third, and it is the one every local `pnpm package` meets while O-3, O-11 and OQ-73
stand. The false line was then printed on every local run. The cost was a rebuild nobody needed, or the belief that a
proof run had used a build it had not. Noticed 2026-09-27 while wiring the notices step into `package.mjs`, and repaired
in the same change.

## Specs

None. The line is operator guidance from ADR-0056's packaging evidence (IC-6), not required output. REQ-STARTUP-149
fixes the pipeline's exit codes, and those were right throughout.

## Relevant files

- `apps/desktop/scripts/package.mjs`: `finish()`, which printed the line unconditionally.
- `docs/architecture/adr/0054-packaging-artifacts-and-self-update.md`, "The two bundled assets", "What this found": where
  the step reported it.

## Repaired — 2026-09-27, with the two bundled assets (first-release-plan.md §4.4)

`package.mjs`'s closing lines now come from `apps/desktop/scripts/lib/package-verdict.mjs` (`closingLines`). That module
prints the SEAM-FREE line only when the run entered a step named `electron-vite build` (`reached(report, STEPS.build)`),
whether that step passed or failed. The step names come from `STEPS`, so the check and the step cannot drift apart
silently. The first repair was the same condition written inline in `finish()`, where no test could reach it. It moved
into the module when the gate review asked for this note.

Two more closing lines follow the same rule. A refusal also writes one `error: …` line to stderr (REQ-STARTUP-149's
handled error), which had not been done before. A requested `ROTARIS_IC6_COUNTERFACTUAL` that ended before
`electron-builder` ran is reported as **not exercised**, and `load-proof.json` records `counterfactualReached`.

**What would have caught it, now in place.** `apps/desktop/scripts/lib/package-verdict.test.ts` holds the line absent
for a run refused at each of the four steps before the build, and present once the build was entered. With the old
unconditional line put back, the first case fails, measured before committing: 1 of 6 cases fails, and 6 of 6 pass with
the repair. `pnpm package` was also run on this Linux host, where it refuses at the notices step, as it must. It closed
with no SEAM-FREE line, and with its own `error:` line on stderr below the notices step's. Run again with
`ROTARIS_IC6_COUNTERFACTUAL=no-force`, it said the counterfactual was not exercised and recorded
`counterfactualReached: false`.

## Relevant files after the repair

- `apps/desktop/scripts/lib/package-verdict.mjs`: `closingLines`, `reached`, `STEPS`.
- `apps/desktop/scripts/lib/package-verdict.test.ts`: the regression.
- `apps/desktop/scripts/package.mjs`: `finish()` prints what `closingLines` answers, and names its build steps by `STEPS`.
