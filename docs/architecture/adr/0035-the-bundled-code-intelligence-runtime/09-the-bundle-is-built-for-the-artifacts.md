# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — The bundle is built for the artifact's architecture — 2026-10-15 (OQ-400, ruled under R-072)

Part 9 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

## The bundle is built for the artifact's architecture — 2026-10-15 (OQ-400, ruled under R-072)

*Dated note, fin47 (`fin47-record-and-windows-reading`).* The bundle step installed the interpreter by the bare version,
so uv picked a CPython for the build host's architecture, and the marker recorded none: on a Windows ARM64 host an arm64
`python.exe` would have entered the `windows-x64` artifact and answered every packaging check, since it runs there
([`../../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`](../../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md)).
[OQ-400](../../open-questions/64-spikes-and-later-questions-31.md#oq-400) ruled the repair: `bundle.mjs` takes `--target=<platform>-<arch>` (the host by
default, for the development tree; `package.mjs` passes `win32-x64`), installs the interpreter by its full uv key
(`cpython-3.13.15-windows-x86_64-none`, `cpython-3.13.15-linux-x86_64-gnu`; `target.mjs`), writes `target` and
`targetArch` into `bundle.json` and `targetArch` into the pins' hash (recipe 4), so a tree built for another
architecture is rebuilt and `--check` calls it stale. **No `win32-arm64` pin is added** (OQ-400 (c)): that host takes
the pinned, hash-checked `win32-x64` uv, which Windows 11 ARM64 runs under its x64 emulation; uv is a build tool, never
shipped, so this is build provenance, never acceptance evidence. The packaging guard beside it is ADR-0054's ("runtime"
rule). First run on Linux x64, recorded in [first-executions](../../first-executions.md) (the row of 2026-10-15, "The
bundle's target architecture and the packaging guard"): the full key installed `cpython-3.13.15-linux-x86_64-gnu` and
the tree answered as before; the first run on an ARM64 host is owed to its first `pnpm package`.
