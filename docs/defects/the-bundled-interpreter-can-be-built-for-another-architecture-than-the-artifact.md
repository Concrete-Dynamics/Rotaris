## The bundled interpreter can be built for another architecture than the artifact

`pnpm code-intel:bundle` (`apps/desktop/scripts/code-intelligence/bundle.mjs`) installs the interpreter with
`uv python install <pin>`, the bare version, so uv picks a CPython for the architecture of the host it runs on. Its marker
records no architecture: `pinsHash` hashes the Python, distribution and uv versions and the recipe, nothing else. On a
Windows ARM64 host (the first one this record has met, [OQ-400](../architecture/open-questions.md#oq-400)) a bundle would
therefore carry an arm64 `python.exe`, and `pnpm package` would freeze it into the `windows-x64` artifact.

Nothing at packaging catches it. `afterPack`'s "runtime" rule (`checkRuntime` in `apps/desktop/scripts/build-hooks.cjs`)
only spawns the packaged `python.exe` and compares the versions it answers with the pins. On the ARM64 host that interpreter
runs natively and answers correctly, so every check passes; on the x64 machine the artifact is published for, the same file
does not start, and the code-intelligence server never comes up. The bundle's `--check` reports a tree built on another
architecture as up to date, because its hash does not change.

Raised by the consortium's ruling of OQ-400 (2026-10-15, under [R-072](../product/requests.md#r-072)), which reads the code
this way and orders the guard: the bundle step builds its interpreter for the target artifact's architecture, and packaging
refuses an interpreter whose PE machine field differs from the artifact's. Not observed in a produced artifact: no
`pnpm package` has run on an ARM64 host.

## Specs

- `REQ-STARTUP-015`: the bundled tool server runs "from what the user installed" — an interpreter of another architecture
  does not run there at all.
- `REQ-STARTUP-159`: what the user installs is self-contained and works without fetching; an artifact carrying an
  interpreter its machine cannot execute is not.
- [ADR-0035](../architecture/adr/0035-the-bundled-code-intelligence-runtime.md): the bundle is evidence about the
  artifact (ADR-0056's discipline), which a version answer from the build host's own architecture is not.

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — `uv python install` with the bare version; `pinsHash` without the
  target; `obtainUv`'s refusal on a host key with no pinned asset (`win32-arm64`).
- `apps/desktop/scripts/build-hooks.cjs` — `checkRuntime`, which spawns the interpreter and never reads what it was built for.
- `apps/desktop/scripts/package.mjs` — runs the bundle step with no target.
