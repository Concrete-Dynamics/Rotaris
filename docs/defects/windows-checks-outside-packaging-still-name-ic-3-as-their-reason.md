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
