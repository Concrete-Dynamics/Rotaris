# The codebase — how the architecture is laid out in code — What `pnpm package` does, and refuses

Part 4 of 22 of [the codebase record](../codebase.md), which indexes every part.

## What `pnpm package` does, and refuses

`apps/desktop/scripts/package.mjs`: the code-intelligence bundle and its manifest check; then **the About page's two
files** — `pnpm notices` (REQ-STARTUP-143's validation, before freezing; its refusal refuses the package) and
`pnpm build-id` (REQ-SHELL-140), both writing into `apps/desktop/resources/` (first-release-plan.md §4.4); then
`electron-vite build` **with `ROTARIS_BUILD=package`, which compiles the
verification seams out** (`__ROTARIS_SEAMS__`; the driver and every scriptable capture seam leave the bundle, the
probe's three below stay), then **the seam check** — the built bundle read back and asserted to carry those three and
none of the scriptable ones, an assertion about the artifact for rule 1a's reason and deliberately not numbered into
N3's five; then `electron-builder --win` with two hooks
(`scripts/build-hooks.cjs`) — `beforeBuild` removes every copy's `build/`, stamps the rebuild marker and runs
@electron/rebuild by name over the binding set, cold, from source; `afterPack` holds rule 1a (a compiled
binary newer than the marker, byte-identical in `app.asar.unpacked`, no prebuild in the asar index), the
`REQ-STARTUP-031` name, the "runtime" rule (the bundled interpreter answers its pins from inside the artifact), the
"assets" rule (both files at the root of the artifact's resources as their steps wrote them, the identifier naming the
tree being packed, the tool server's licence text once — `scripts/lib/about-assets.mjs`) and rule 4
(`scripts/native-load-probe.cjs` as the packaged `Rotaris.exe` under `ELECTRON_RUN_AS_NODE`, reporting what
`dlopen` opened); then the packaged application runs a scripted session with a
terminal call against a scratch store under `release/scratch/`. Evidence in `release/load-proof.json`.
`ROTARIS_IC6_COUNTERFACTUAL=no-force|keep-prebuild` constructs D10's condition; the build must refuse, and a run
that ends before `electron-builder` says the counterfactual was not exercised. `ROTARIS_PACKAGE_DIR_ONLY=1` stops at
`win-unpacked`; `ROTARIS_PACKAGE_SKIP_APP=1` skips the launch; `ROTARIS_PACKAGE_WITHOUT_NOTICES=1` goes on past a
refusing `pnpm notices` to a development package without the notices file (first-release-plan.md §4.4; refused on a
tag build). A cold rebuild of both bindings is ~3 minutes on every run, by design. Windows only (IC-3). The app's `dependencies`
are exactly what electron-vite externalises for main and the run host — the workspace packages are
`devDependencies`, bundled through aliases; the renderer dedupes `react`, `react-dom` and `zustand`
(`spikes/native-load-proof.md` §4).

**The file-descriptor gate (the toolchain's fourth defect, 2026-09-05; ADR-0056's third execution).** electron-builder's
node-module collector runs `pnpm list --prod --json --depth Infinity` in `apps/desktop`, and pnpm opens every `package.json` at
once; on this tree the command died with `EMFILE` and the build was refused before it started (found by Part S's console
spike). `scripts/fd-gate.cjs` bounds `fs.open`/`fs.readFile` to 200 in flight and is loaded through `NODE_OPTIONS=--require` for the
electron-builder step only — never for the packaged application's launch. A pitfall for whoever changes the step: a
wrapper that drops the originals' own properties (`fs.realpath.native`) breaks fs-extra at once.
