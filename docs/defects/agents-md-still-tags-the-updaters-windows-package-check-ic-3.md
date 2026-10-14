## AGENTS.md still tags the updater's Windows-package check IC-3

`AGENTS.md`'s proof index row for `updater-proof` ends "their run against a real artifact is owed to the next Windows
package (IC-3)". IC-3 binds "any release artifact for Linux or macOS, and the store binding's acceptance on any platform"
(`docs/architecture/implementation-conditions.md`): a check owed to the next Windows package waits on a Windows x64 host and
on the release pipeline R-071 deferred, not on IC-3. This is the shorthand the 2026-10-13 packaging repair
(`docs/defects/fixed/windows-packaging-checks-are-tagged-ic-3-which-binds-linux-and-macos.md`) and the 2026-10-14 repair of
the other Windows checks (`docs/defects/fixed/windows-checks-outside-packaging-still-name-ic-3-as-their-reason.md`) corrected
everywhere they looked, but both guards in `tools/windows-ic3-citations.test.ts` read only `docs/architecture/` and
`docs/product/directives.md`, so `AGENTS.md` was never read and the tag stands uncorrected.

Noticed 2026-10-14 by fin43's reviewer while checking the second repair; outside that task, so recorded and not fixed.

## Specs

- None contradicted in the product. `docs/architecture/implementation-conditions.md` IC-3's Binds line.

## Relevant files

- `AGENTS.md` — the `updater-proof` row of the proof index: "owed to the next Windows package (IC-3)".
- `tools/windows-ic3-citations.test.ts` — the two guards' file list (`docs/architecture/` and `docs/product/directives.md`),
  which does not include `AGENTS.md`.
