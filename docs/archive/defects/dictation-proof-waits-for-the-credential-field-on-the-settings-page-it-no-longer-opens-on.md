## dictation-proof waits for the credential field on a Settings page it no longer opens on

## Outcome: repaired 2026-11-21 (R-119's branch, `feat/r-117-web-search-setup`)

The harness, not the product. `pnpm dictation-proof` failed `nothing matched "#dictation-credential" within 15000 ms`
on the Linux agent host, on `main` too. Since PD-CONFIG-012 clause 2 (R-106) Settings opens on Setup when nothing is
stored, and the Dictation section stands on the Models page (`ModelsSettings`), which the proof never chose after its
Ctrl+6. The proof now presses the Models page's navigation item before waiting (and passes `timeoutMs`, the driver's
option, where it passed `timeout`). `pnpm dictation-proof` green on this host, 2026-11-21. Its earlier focus red under a
busy desktop is [a separate note](../../defects/nine-surface-proofs-are-red-on-main-and-on-a-branch-alike-while-the-desktop-is-in-use.md).

## Specs

None contradicted. PD-CONFIG-012 clause 2 governs the page Settings opens on.

## Relevant files

- `apps/desktop/scripts/dictation-proof.mjs`: `settingsScenario`.
- `packages/ui/src/SettingsView.tsx`: the page navigation the proof presses.
