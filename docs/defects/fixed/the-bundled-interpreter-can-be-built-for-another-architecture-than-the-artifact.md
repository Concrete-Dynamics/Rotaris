## The bundled interpreter can be built for another architecture than the artifact

## Repaired — 2026-10-15 (fin47, `fin47-record-and-windows-reading`), as OQ-400 ruled

`bundle.mjs` takes `--target=<platform>-<arch>` (the host by default; `package.mjs` passes `win32-x64`) and, through
`code-intelligence/target.mjs`, installs the interpreter by its full uv key (`cpython-3.13.15-windows-x86_64-none` for
`win32-x64`), writes `target` and `targetArch` into `bundle.json` and `targetArch` into the pins' hash (recipe 4), so a tree
built for another architecture is rebuilt and `--check` calls it stale. On `win32-arm64`, which has no uv pin, it takes the
pinned, hash-checked `win32-x64` uv under emulation; `pins.json` is unchanged. `build-hooks.cjs`'s `checkRuntime` now reads
the packaged `python.exe`'s PE machine field (`peArchOf`) and the marker's `targetArch` before it spawns anything, and
refuses either one that is not the artifact's: "runtime: the packaged interpreter is built for arm64, the artifact for x64".

Pinned by `apps/desktop/scripts/build-hooks.test.ts` (PE-header fixtures: x64 accepted, arm64 refused, a non-PE or truncated
file refused, a marker of another or no architecture refused; the arm64 case was red against the old `checkRuntime`, which
reached the spawn) and `apps/desktop/scripts/code-intelligence/target.test.ts` (the hash changing with the architecture, the
`win32-arm64` uv falling back to the pinned `win32-x64` asset). Shown over the real Windows `python.exe` of both architectures
and by a Linux bundle built by the full key (`docs/architecture/first-executions.md`, the row of 2026-10-15). Not shown: a
`pnpm package` on either Windows host, which first meets the guard over a produced artifact.


`pnpm code-intel:bundle` (`apps/desktop/scripts/code-intelligence/bundle.mjs`) installs the interpreter with
`uv python install <pin>`, the bare version, so uv picks a CPython for the architecture of the host it runs on. Its marker
records no architecture: `pinsHash` hashes the Python, distribution and uv versions and the recipe, nothing else. On a
Windows ARM64 host (the first one this record has met, [OQ-400](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-400)) a bundle would
therefore carry an arm64 `python.exe`, and `pnpm package` would freeze it into the `windows-x64` artifact.

Nothing at packaging catches it. `afterPack`'s "runtime" rule (`checkRuntime` in `apps/desktop/scripts/build-hooks.cjs`)
only spawns the packaged `python.exe` and compares the versions it answers with the pins. On the ARM64 host that interpreter
runs natively and answers correctly, so every check passes; on the x64 machine the artifact is published for, the same file
does not start, and the code-intelligence server never comes up. The bundle's `--check` reports a tree built on another
architecture as up to date, because its hash does not change.

Raised by the consortium's ruling of OQ-400 (2026-10-15, under [R-072](../../product/requests.md#r-072)), which reads the code
this way and orders the guard: the bundle step builds its interpreter for the target artifact's architecture, and packaging
refuses an interpreter whose PE machine field differs from the artifact's. Not observed in a produced artifact: no
`pnpm package` has run on an ARM64 host.

## Specs

- `REQ-STARTUP-015`: the bundled tool server runs "from what the user installed" — an interpreter of another architecture
  does not run there at all.
- `REQ-STARTUP-159`: what the user installs is self-contained and works without fetching; an artifact carrying an
  interpreter its machine cannot execute is not.
- [ADR-0035](../../architecture/adr/0035-the-bundled-code-intelligence-runtime.md): the bundle is evidence about the
  artifact (ADR-0056's discipline), which a version answer from the build host's own architecture is not.

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — `uv python install` with the bare version; `pinsHash` without the
  target; `obtainUv`'s refusal on a host key with no pinned asset (`win32-arm64`).
- `apps/desktop/scripts/build-hooks.cjs` — `checkRuntime`, which spawns the interpreter and never reads what it was built for.
- `apps/desktop/scripts/package.mjs` — runs the bundle step with no target.

## Addendum, 2026-10-21 — measured on an ARM64 host

The Windows ARM64 session's F2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, uv 0.12.5 aarch64, built at `af692eea`) built the bundle on that host: `target` `win32-x64`, and the interpreter's PE machine field is `0x8664` for `python.exe`, `pythonw.exe` and `python313.dll`. The interpreter, run under the x64 emulation, answers `platform.machine()` with `ARM64`, so a check that asked the interpreter would have been misled where reading the bytes is not. Still not observed in a produced artifact: no `pnpm package` has run on this host.
