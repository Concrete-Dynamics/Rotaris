## A config case expects POSIX-spelled files its own join built

**Repaired 2026-10-15** (the owner's ruling that day for the Windows ARM64 session: repair the test-side defects). The case's
expectations now name the files it built (`both.workspace.agents`, `both.global.agents`), green on Windows; the unit and
its assertions are otherwise unchanged.

Found 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, at `246dcf29` (the case landed with
fin46 on Linux the day before): `load.test.ts`'s "a fault beneath a list item names the file whose list the merge kept, not an
earlier file whose item states the deeper path (REQ-CONFIG-050)" builds its scope files with the host's `join` over `/g` and
`/w/.rotaris`, then expects the literals `/w/.rotaris/agents.yaml` and `/g/agents.yaml`. On Windows `join` spells them
`\w\.rotaris\agents.yaml` and `\g\agents.yaml`, and `statingFile` returns what it was given, so the case is red there with the
product right. The case beside it already compares against `join(...)`.

## Specs

None: an expectation spelled for one host, the class of
[`seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`](seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md).

## Relevant files

- `packages/config/src/load.test.ts` — the case's five `statingFile` expectations.
