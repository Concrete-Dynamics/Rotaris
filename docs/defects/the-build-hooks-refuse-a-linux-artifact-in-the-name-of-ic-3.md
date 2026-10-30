## The build hooks refuse a Linux artifact in the name of IC-3, which no longer binds Linux

`apps/desktop/scripts/build-hooks.cjs`'s `platformOf` throws for every platform but `win32`, with the message
"IC-3: no <platform> artifact may be produced until the build hosts exist (implementation-conditions.md)". On
2026-10-26 the owner narrowed IC-3 to macOS ([R-087](../product/requests.md#r-087)) and authorised the Linux artifact's
build under [ADR-0066](../architecture/adr/0066-the-linux-artifact-is-built-on-a-developer-host.md). For `linux` the
refusal now cites a condition that does not bind it, and it is the one thing that still stops a developer's
`electron-builder --linux` before anything is rebuilt. For `darwin` the refusal is IC-3's and is correct.

Removing the `linux` refusal alone is not the repair. Behind it, rule 1a lists win32 binaries only and rule 4 launches
`<product>.exe` (ADR-0054, "Linux and macOS configuration prepared"), so a Linux build that got past the refusal would
meet rules written for another platform. The repair is ADR-0066's "wiring" paragraph: the platform switch in
`package.mjs` through `preparedConfiguration`, Linux binary paths for rule 1a, and a Linux launch for rule 4, run on a
Linux host with D10's counterfactual (AC-3). Found while narrowing IC-3, in a documentation change that does not touch
the build; not repaired there.

## Specs

None contradicted. REQ-STARTUP-024 and REQ-STARTUP-025 require the Linux artifact; the refusal contradicts the record
(IC-3 as narrowed, ADR-0066), not a requirement. `PD-STARTUP-001` is unaffected: it governs what a release publishes,
and `release.yml`'s matrix and `PUBLISHED_PLATFORMS` hold `windows-x64` alone whatever the hooks do.

## Relevant files

- `apps/desktop/scripts/build-hooks.cjs` — `platformOf`, the refusal and its message; rules 1a and 4, win32 only.
- `apps/desktop/scripts/lib/platform-targets.mjs` — its header says IC-3 binds every Linux and macOS artifact.
- `apps/desktop/scripts/lib/platform-targets.test.ts` — "inert under IC-3 and PD-STARTUP-001": asserts both hooks
  refuse `darwin` and `linux` with the IC-3 message; the `linux` half changes with the repair.
- `apps/desktop/electron-builder.yml` — its header comment, "Windows only until IC-3 is discharged".
- `docs/architecture/adr/0066-the-linux-artifact-is-built-on-a-developer-host.md` — the decision and AC-3.
