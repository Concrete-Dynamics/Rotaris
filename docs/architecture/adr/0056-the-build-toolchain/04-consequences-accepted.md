# ADR-0056 — The build toolchain — Consequences accepted

Part 4 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## Consequences accepted

1. A toolchain dependency in the critical path of every build, and a second one — Vite — beneath it.
2. **Development and production divergence that must be actively tested rather than assumed away**, in
   the one axis where a mistake is a security mistake.
3. Two extra node entry points beyond the conventional three-target shape, which the tool supports but
   which is a configuration to maintain.
4. **A second build technology enters the toolchain, on the critical path of one artifact's every
   launch.** The stub cannot be written in the product's own runtime, because it runs before that
   runtime exists. That is a language, a compiler and a platform target this record previously did not
   carry, and it is exercised only on Windows — so it is the part of the build least likely to be
   noticed when it breaks, and the part whose breakage is most severe: a portable that does not start.
   It needs its own check in the release gate, which `REQ-STARTUP-156`'s two-run requirement for a
   preparing artifact now supplies.
5. **The release gate is now the only place several of this record's claims are actually tested.** The
   packaged-versus-development divergence of consequence 2, the content-security policy, the sandbox
   settings, font loading, and now the stub and its preparation are all things a development build does
   not exercise. `REQ-STARTUP-156` has grown to match — an unmodified baseline machine, no separately
   installed product component, blocked network, the published asset at its listed digest, and a check
   whose conditions cannot be established recorded as **not performed** and failing the gate.
6. **A compiler toolchain is now a release-runner requirement on all three platforms**, because
   compilation is forced from source and a native module cannot be cross-built here — the matrix of
   `REQ-STARTUP-030` already runs a job per platform, so this adds a provisioning obligation to jobs that
   exist rather than new jobs. Builds get slower, and the slowness is the visible price of refusing N2.
7. **Two version pins are now coupled and must move together.** The Electron version and the built
   addons are one unit: bumping the shell without rebuilding produces artifacts that package cleanly and
   do not run. The load proof of rule 4 is what makes that a failed build instead of a discovery, and it
   is the reason a shell bump is not a routine dependency bump in this project — the same class of
   statement ADR-0054 consequence 4 already makes about the Linux runtime.
8. **The load proof is a claim about the packaged tree and it must be run against the packaged tree.**
   Running it against `node_modules` in the checkout proves nothing about asar unpacking, and running it
   under the host Node proves nothing at all — it would pass on exactly the artifact that fails. A proof
   written the easy way is worse than no proof, because it reads as verified.
9. **`REQ-STARTUP-156` does not cover this and is not being asked to.** The release gate launches each
   artifact to first paint, and first paint does not open a store: ADR-0055 keeps the workspace read off
   the critical path by design and ADR-0058 opens the store after the window is shown. **So an artifact
   with an unloadable store binding would pass the gate.** Rule 4 is therefore not redundant with the
   gate; it is the only check that sees this, and that asymmetry is the reason it sits in the build.
