## The build tools' undici 6 copy sits inside three high advisories and keeps the Vulnerabilities check open

`pnpm-lock.yaml` resolves a second `undici`, **6.28.1**, for `node-gyp` 12.4.0 (`^6.25.0`) under `@electron/rebuild`, which
fetches Node headers when the native bindings are rebuilt. `pnpm audit` lists it inside three high advisories
(GHSA-xjj6-f33q-929c, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm; fixed in 6.29.1) and two moderate ones. It is not shipped:
neither production audit (`pnpm deps:audit`, `pnpm deps:audit:runtime`) reads it, and the report-only whole-tree step in
`ci.yml` lists it on every run. The audit reading of 2026-11-01 recorded it ("6.29.1 exists; not shipped",
`docs/architecture/dependency-alerts/2026-11-01-audit-gate.md` §3) and moved nothing.

Noticed on 2026-11-04 (`ad1a6698`, pnpm 11.9.0) while moving Electron out of GHSA-jr5w-w6x2-84p9 (acceptance finding
AF-05, plan `hrda`): with Electron at 44.10.0 this copy holds the whole tree's three remaining highs, so the OpenSSF
Scorecard's Vulnerabilities check, which reads the lockfile rather than the shipped tree, stays open on it
(`docs/architecture/hardening/02-the-findings.md`, the Scorecard paragraph). Recorded, not repaired: AF-05 is Electron's.
Moving it is the patch lane's method (a per-major `overrides:` block for one `pnpm install --lockfile-only`, then removed),
inside `node-gyp`'s declared range; 6.29.1 was published 2026-10-15 and is past `minimumReleaseAge`.

## Specs

None contradicted. The hardening record's Scorecard paragraph (§3.5) counts Vulnerabilities as closable here.

## Relevant files

- `pnpm-lock.yaml` — `undici@6.28.1`, reached through `@electron/rebuild` > `node-gyp`.
- `.github/workflows/ci.yml` — the report-only whole-tree audit that lists it.
- `docs/architecture/dependency-alerts/2026-11-01-audit-gate.md` — §3, the reading that recorded it.
- `docs/architecture/hardening/02-the-findings.md` — the Scorecard paragraph.
