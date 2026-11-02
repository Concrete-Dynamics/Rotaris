## The shipped Electron runtime sits inside a high advisory the production audit cannot see

`apps/desktop/package.json` pins `electron` `44.3.0`, the runtime every packaged build ships. On 2026-11-01 (`9b0b5858`,
pnpm 11.9.0) `pnpm audit` lists it inside **GHSA-jr5w-w6x2-84p9** (high, `>=44.0.0-alpha.1 <44.9.1`), beside one moderate
(GHSA-x562-297c-g43g, `<44.5.0`) and two low advisories. The blocking audit CI gained the same day,
`pnpm deps:audit` (`pnpm audit --prod --audit-level=high`, R-091), does not list it: Electron is declared under
`devDependencies` (electron-builder's convention), and `--prod` reads `dependencies` alone. The whole-tree audit beside
it in `ci.yml` reports it without blocking.

Noticed while building the audit step (bundle G2 of `docs/architecture/hardening.md` §5); recorded, not repaired here.
Dependabot's `electron` group opened pull request #49 the same evening (44.3.0 → 45.0.0, a major version). Whether the
fix is that major, a 44.x at or above 44.9.1, and whether the production audit should learn to read Electron are open;
the reading is `docs/architecture/dependency-alerts/2026-11-01-audit-gate.md` §3.

## Specs

None contradicted directly. The packaging and update requirements (REQ-STARTUP-*) say nothing about a runtime's
advisories; the hardening record's §2 lists the renderer perimeter the runtime enforces.

## Relevant files

- `apps/desktop/package.json` — `electron` `44.3.0` under `devDependencies`.
- `.github/workflows/ci.yml` — the blocking production audit and the report-only whole-tree audit.
- `docs/architecture/dependency-alerts/2026-11-01-audit-gate.md` — the reading, §3.
- `docs/architecture/dependency-alerts/2026-10-22-lane-electron.md` — the last Electron move (to 44.3.0).
