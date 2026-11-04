## The shipped Electron runtime sits inside a high advisory the production audit cannot see

## Outcome — repaired 2026-11-04 (plan `hrda`, bundle `hrda-accept1-2`, acceptance finding AF-05)

**Confirmed first, on the branch** (`ad1a6698`, Windows 11 ARM64, Node 26.13.0, pnpm 11.9.0): `pnpm audit --json` listed
Electron 44.3.0 inside GHSA-jr5w-w6x2-84p9 (high), GHSA-x562-297c-g43g (moderate), GHSA-3qxv-5xgr-q7w9 and
GHSA-h3v5-h239-pg29 (low), while `pnpm deps:audit` read "No known vulnerabilities found".

**Both halves repaired.** The pin moved within the 44 line to **44.10.0**, the newest 44 release past
`minimumReleaseAge` and outside all four ranges; the lockfile moved only Electron's own lines. The major, pull request #49,
stays open: its packaged launch finds no session (`docs/defects/the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md`).
And the audit that blocks CI's gate now reads the runtime: `pnpm deps:audit:runtime` reads the whole tree's report for
Electron alone and fails on high and critical (`tools/runtime-audit/`), a step of `ci.yml`'s gate job after
`pnpm deps:audit`; the build tools' advisories stay report-only.

**Pinned by** `tools/runtime-audit/runtime-audit.test.ts`: the selection over the report read at 44.3.0 (it finds
GHSA-jr5w-w6x2-84p9 and nothing of the build tools), the refusal of a report that is not one, the CI step, and the pin
itself, at or above the fixed version of every Electron advisory the readings name (it fails at 44.3.0). **Shown** by the
audit that found it: `pnpm audit` over the moved tree lists no Electron advisory, and `pnpm deps:audit:runtime` read
the 44.3.0 report as one high (exit 1) and the moved tree as none (exit 0). The runtime ran six proofs on this host; ADR-0056
rule 4 for the artifact is CI's `package` job on the landed head, `pnpm package` not running on the Windows ARM64 host.
The lane: `docs/architecture/dependency-alerts/2026-11-04-lane-electron-44-10.md`; ADR-0056 part 11. The Scorecard's
Vulnerabilities check stays open on the build tools' `undici` 6.28.1
(`docs/defects/the-build-tools-undici-6-copy-sits-inside-three-high-advisories-and-keeps-the-vulnerabilities-check-open.md`).


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
