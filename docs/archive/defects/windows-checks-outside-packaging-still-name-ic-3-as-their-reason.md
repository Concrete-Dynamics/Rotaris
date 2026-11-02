## Windows checks outside packaging still name IC-3 as their reason

IC-3 binds "any release artifact for Linux or macOS, and the store binding's acceptance on any platform"
(`docs/architecture/implementation-conditions.md`). The Windows packaging checks that the record tagged "(IC-3)" were
corrected on 2026-10-13 (`fixed/windows-packaging-checks-are-tagged-ic-3-which-binds-linux-and-macos.md`), but the same
shorthand stands on Windows checks that are not packaging checks: a run on Windows that this Linux host could not make is
written "(IC-3)", as if it waited on the Linux and macOS build hosts, where what it waits on is a Windows host (the dev
machine is Windows ARM64; this container is Linux). Several of these lines name macOS beside Windows, where the macOS
half is IC-3's and only the Windows half is mis-tagged. None of it changes the product; it misleads a reader about which
host a check waits on.

Noticed 2026-10-13 by fin41's reviewer while checking the packaging repair; outside that task, so recorded and not fixed.

## Specs

- None contradicted in the product. `docs/architecture/implementation-conditions.md` IC-3's Binds line.

## Relevant files

- `docs/product/directives.md` — PD-SHELL-009's "What was not measured": "a Windows host (IC-3)".
- `docs/architecture/adr/0027-the-model-client-implementation.md` — "anything on Windows (IC-3)".
- `docs/architecture/adr/0034-mcp-connections-and-configuration-resolution.md` — "anything on Windows (IC-3)".
- `docs/architecture/adr/0035-the-bundled-code-intelligence-runtime.md` — "Unmeasured on Windows (IC-3)".
- `docs/architecture/adr/0050-theming-and-the-accessibility-floors.md` — three "Windows or macOS (IC-3)".
- `docs/architecture/adr/0005-the-session-lock-as-capability-token.md`, `adr/0039-checkpoints-via-a-private-index.md`,
  `adr/0062-the-plan-gate-as-a-run-segment.md` — "Windows and macOS were not run (IC-3)".

## Repaired — 2026-10-14 (fin43, `fin43-record-and-guards`)

Each "(IC-3)" on a Windows check keeps its words and gains the correction beside it, as fin41 did for the packaging checks:
"a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts", prefixed "for the Windows half"
where the same tag also names macOS (whose half IC-3 does bind), and "a Windows x64 host, deferred with the pipeline under
R-071" where the check is owed to a Windows package that fin41's pass did not catch (the restart between two real processes
"owed to the next `pnpm package`", "a packaged build, on Windows or as an AppImage", "a packaged build, and Windows"). 36 tags
in all: the seven ADRs this note listed (0005, 0027, 0034, 0035, 0039, 0050 ×4, 0062) and three more of the same kind (0036,
0047, 0065), PD-SHELL-009's "a Windows host" in `directives.md`, 21 rows of `first-executions.md`, and
`open-questions.md`'s OQ-10 ruling, signals on Windows ("not run on a Windows host").

Pinned by `tools/windows-ic3-citations.test.ts`'s second guard, "a Windows check outside packaging does not name IC-3 as its
reason": it reads the same files as the packaging guard for an IC-3 whose own clause (the text after the last `.`, `;` or `)`
before it) names Windows with no "a Windows host" right after it. It was red on the 36 before the corrections (each listed)
and is green after. Left as written, because IC-3 is the right reason there: a tag whose clause names only macOS or Linux
("a Windows re-run … (no host), or macOS (IC-3)", "Anything on macOS (IC-3)", ADR-0029's "POSIX … waits on IC-3"),
`codebase.md`'s "Windows only (IC-3)" for the package step, and "Windows is the one release target IC-3 leaves". The views'
reconciliation log and the fixed notes are history and are not read, as for the packaging guard.
