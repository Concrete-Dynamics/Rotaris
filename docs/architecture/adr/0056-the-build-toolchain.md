# ADR-0056 — The build toolchain

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. The build gains an output this record did not contemplate — the Windows
  portable's launcher stub — because SR-7 moved that artifact off the packaging tool's own portable
  target (ADR-0054 alternative P4). The bundle-size revisit clause is restated on measurement, which
  points somewhere other than where it pointed.
- **Revised:** 2026-09-02. The build gains an **obligation** it did not carry: rebuilding the product's
  native modules against the Electron binary interface, for every target, proved at build time. ESC-21's
  comparison surfaced the store binding failing silently under an Electron runtime through an ABI
  mismatch, and the owner recorded that as this record's to design for rather than to discover.
- **Revised:** 2026-09-02, second time, against defect **D10**. Rule 1 gains 1a: the rebuild's exit status
  is not evidence anything was rebuilt. `electron-rebuild` against the chosen store binding exits 0, prints
  success and produces no compiled binary, and the binding's loader would prefer a prebuilt one over
  anything built beside it. **Rule 4's load is no longer one check among several; it is the check.**
- **Origin:** UI (ADR-UI-15)
- **Depends on:** ADR-0001, ADR-0002, ADR-0020, ADR-0044, ADR-0053, ADR-0054, ADR-0058
- **Governed by:** `owner-decisions.md` SR-7, and the consequence for ADR-0058 recorded with ESC-21
- **Evidence:** `../spikes/packaged-first-paint.md` §1 for the two runtimes' versions

## Context

`REQ-STARTUP-002` and `REQ-STARTUP-015`: one shipped executable, so the build must not emit a second
entry point. `REQ-UIBENCH-112` and `REQ-UIBENCH-037`: the very same build must run as an offscreen child
process with no on-screen output, rebuilding entries "through the same rendering path the live
application uses". `REQ-UIBENCH-047` and `REQ-SHELL-008`: fonts and theme resolve from the package, never
the host, so assets must be **genuinely bundled**. `REQ-STARTUP-155`: five seconds to first paint,
which bounds bundle size and load work. `REQ-STARTUP-159`: every run-time data asset resolves from what
was installed, with **no download, under blocked network**.

ADR-0044's sandboxed preload must be a **single self-contained script**, because a sandboxed preload
cannot load arbitrary modules at run time.

`REQ-CHAT-056` requires rendering to issue **no network request**, and `REQ-SHELL-139` requires the about
page to render exclusively from local data with **zero network requests at render time**.

Under ADR-0002 the build must produce **four kinds of entry**: main, preload, renderer, and two headless
node entries (the run host and the workspace service), plus the two pre-bootstrap argument branches of
ADR-0035 and ADR-0053 inside the main entry. ADR-0055 fixes where those two branches sit relative to the
single-instance claim: **before it**, so the build's main entry must keep them reachable ahead of
anything that touches the platform layer's instance primitive.

**A fifth output, which this record did not previously contemplate.** SR-7 moved the Windows portable off
`electron-builder`'s `portable` target, because that target's stub cannot start inside
`REQ-STARTUP-155`'s budget at any bundle weight — 13,287 ms on a zero-payload build against 5,000 ms —
and re-extracts on every launch because it deletes its own extraction directory on exit. ADR-0054's
replacement is a launcher stub the project owns, wrapping the same `win-unpacked` payload, preparing it
once into per-user machine-local storage (`REQ-STARTUP-165`) and launching from the preparation
thereafter. **That stub is a build artifact and this record is where its production is fixed.**

**What the same measurement says about bundle weight, because it is the opposite of what this record
assumed.** `REQ-STARTUP-155` was treated here as a constraint that "bounds bundle size and load work".
On the flavours that pass it, bundle weight is close to free: **327 MB of additional payload moved first
paint by about 10 ms**, well inside run-to-run scatter, and in the cold groups the heaviest build was
the faster of the two. Weight is paid in download size, in disk, and — on the portable — in the
*preparation* whose run `REQ-STARTUP-155` exempts. It is not paid at first paint on a directory tree.
The caveat that keeps this from being a licence: nothing in that measurement *loaded* anything from the
payload, so it prices carrying weight and says nothing about executing it. ADR-0001 consequence 1's
syntax-tree parser start-up cost is unmeasured and is a load-time cost, not a bundle-size one.

**Native modules, and the failure mode that makes this a build obligation rather than a runtime one.**
The product ships two native bindings: the pseudo-terminal of ADR-0020, and — since SR-4 — the store
binding of ADR-0058. A native addon is compiled against one binary interface and refuses to load into a
runtime expecting another. **The two runtimes in play here are not the same runtime**, and the spike
measured both on the same machine: the host Node is **v24.11.0** while the Electron the product ships
reports **Node 24.19.0** (`electron@44.1.0`, Chromium 152.0.7977.65, V8 15.2.124.18-electron.0). A module
built by an ordinary install on that host is built for the host, and the artifact runs on the other. That
is precisely the condition an interface mismatch needs.

**Why it is this record's problem and not the store's.** ESC-21's comparison found `better-sqlite3`
recorded in another project's ecosystem as **failing silently under an Electron runtime** through exactly
this mismatch, with the error swallowed by a `try`/`catch`. The owner recorded the consequence against
ADR-0058: the toolchain rebuilds against the Electron interface, and a store that cannot load fails
**loudly** on `REQ-SESSION-089`'s terms. The first half is this record's, and it is a build obligation
because at run time the condition is **unrecoverable and total** — a wrongly built addon fails for every
user, on every workspace, for the life of that build. There is no degraded mode to fall back to and no
diagnosis a user can act on. A defect with that shape belongs to the step that can still prevent it.

**One interface, not two, and that is worth stating because the topology suggests otherwise.** ADR-0002
puts the run host and the workspace service in Electron `utilityProcess` forks, which re-enter the
**shipped Electron binary** rather than a host Node. So all three processes that may load a binding —
main, the run host, the workspace service — load it under the Electron interface. The build produces one
build of each module per platform and architecture, not one for the windowed process and another for the
node-shaped children. A build that produced two would be wrong in a way that only shows up in the
children.

**What was checked.** Context7, the electron-vite documentation, and the npm registry, 2026-08-31.
`electron-vite` 5.0.0 is the current release, MIT, published December 2025. Each of its three
configuration sections — `main`, `preload`, `renderer` — accepts its own
`build.rollupOptions.input` map, so several named entries per section are a configuration and not a
second build system. The `preload` section additionally has an **isolated-entry mode** that emits each
preload as a self-contained bundle rather than as entries sharing a chunk. Those two facts are what the
recommendation rests on: the first covers the four entry kinds, the second covers ADR-0044's
sandboxed preload.

**Checked separately for the native-module obligation, Context7 against the `electron-builder`
documentation and source, 2026-09-02.** Four facts, and each bears on a choice below. `npmRebuild`
defaults to **`true`** and runs `@electron/rebuild` over `node_modules` "to ensure all native modules
compiled against correct Electron ABI"; setting it `false` **skips the step entirely** and logs an info
line — which is the shape of a silent regression, because an info log during a release build is not an
observation anybody makes. `buildDependenciesFromSource` forces compilation from source rather than
accepting a prebuilt binary, documented for the case "when you need to ensure native modules are compiled
against the exact Electron ABI". `nodeGypRebuild` is a separate switch over the same territory, so **three
settings interact** and only one of them is the one we want. And the tool's own troubleshooting page gives
the asar-unpack remedy with `node_modules/better-sqlite3/**` as its worked example — the same module
ADR-0058 chose. **A version note that is a real coupling:** on the 26.x stable line these are top-level
keys, and on the 27.x pre-release line they move under a `nativeModules` object with `nativeRebuilder`
renamed to `rebuildMode`. ESC-11 may put the Linux artifact on the pre-release line, so which line the
build runs on decides where these settings are written, and a configuration that silently no longer
applies is the same failure as not setting it.

## Alternatives considered

**A — `electron-vite`, over the same bundler (Vite) the renderer uses.** Configured sections for main,
preload and renderer, module replacement in development, and an isolated-entry mode for the preload
sandbox constraint. Chosen.

*For:* it is built for exactly this multi-target shape; the development server gives fast renderer
iteration, which matters for an interface this large; it **composes with `electron-builder` of ADR-0054
rather than competing with it**; and the preload target can be emitted as a single self-contained
bundle, which is what a sandboxed preload requires.
*Against:* an extra abstraction over Vite whose configuration surface must be understood; and a
development-mode renderer served over a network origin rather than the local filesystem, which differs
from production in exactly the axis — origin and content-security policy — where mistakes are expensive.
**So the policy and the sandbox settings must be verified against a packaged build, not a development
build.**

**B — Plain Vite with hand-written build scripts for main and preload.**

*For:* nothing hidden; one fewer dependency.
*Against:* re-implements what `electron-vite` provides, including the isolated preload bundle and the
development/production asset-path difference. **No requirement is served better.**

**C — Electron Forge with its Vite plugin.**

*For:* one tool for build and package; first-party to Electron.
*Against:* it couples the build to Forge's packaging, which ADR-0054 rejected in favour of
`electron-builder` for the artifact shapes. **Mixing Forge's build with `electron-builder`'s packaging
is the worst of both.**

### For the native modules — how the Electron interface is guaranteed rather than hoped for

The question is not *whether* to rebuild. It is what makes the rebuild **true of the artifact that
shipped**, given that the failure is silent by default in the ecosystem and that the packaging tool
offers a setting whose only symptom, when wrong, is an info line in a build log.

**N1 — Rely on the packaging tool's default.** `npmRebuild` is `true` out of the box, so an
unconfigured build already rebuilds. *For:* nothing to write, nothing to maintain. *Against:* it is a
default, and a default is not a claim. Three ways it goes wrong without anyone noticing: someone sets it
`false` while debugging a slow build and the log line scrolls past; a prebuilt binary satisfies the
install step so nothing is compiled at all; or the settings migrate to a different configuration key on
a version bump and the ones we wrote stop applying. **Each produces an artifact that builds cleanly,
packages cleanly, and does not run.** Refused as the whole answer, though the default itself is kept.

**N2 — Consume the module's own prebuilt binaries, selected by interface version.** Several native
packages publish prebuilt addons per runtime and interface. *For:* no compiler on the release runner, and
a faster build. *Against:* it makes the correctness of the product's system of record depend on a third
party publishing a binary for **the exact Electron the build pins**, which is a coverage claim nobody
gives us; and a missing prebuild degrades to whatever the install step does next, which is the silent
path again. This is the case `buildDependenciesFromSource` exists to close, and closing it is the point.

**N3 — Rebuild from source per target in the release job, and verify by loading.** **Chosen.** The
rebuild is configured explicitly rather than inherited, forced from source, and then **proved** by a
step that loads each binding under the shipped Electron binary and fails the build if it does not load.
*For:* it converts a property that is otherwise only observable in the field into a build outcome; the
proof costs one process launch per target; and it is the only option whose failure mode is a red build
rather than a shipped artifact. *Against:* a compiler toolchain on all three release runners, a slower
build, and a verification step we own and must keep honest.

**N4 — Have no native modules.** Recorded because it is the alternative that removes the problem rather
than managing it, and because both bindings had a non-native candidate. *Against:* it is not this
record's to take. ADR-0058 weighed `node:sqlite` — no native build, no rebuild, no unpacking — and
rejected it on two published facts, the release-candidate stability of the binding and a shipped
Electron release having omitted it altogether; ADR-0020 made the same call for the pseudo-terminal. Both
keep the non-native option as a **named fallback** behind a deliberately thin data-access layer. If the
obligation below ever becomes the dominant cost, that is where it is paid off — in those records, not by
weakening the gate here.

## Decision

**Alternative A — `electron-vite` (MIT, 5.x) over Vite for the build, with `electron-builder` of
ADR-0054 for the artifacts.** The selection criterion is narrow and was checked rather than assumed:
**the multi-target shape and the sandboxed-preload bundling rule are the two things this build must get
right, and they are the two things this tool exists to do** — several named inputs per section for the
first, an isolated-entry preload mode for the second. Nothing else about the tool bears on a
requirement, and no requirement in this record names a bundler.

- **One renderer bundle reused by every window.** The main, persona, terminal and benchmark-iteration
  windows all load the same renderer bundle with a different initial route and window role, so
  `REQ-UIBENCH-112`'s "the same rendering path the live application uses" is **true by construction
  rather than by discipline**. A separate benchmark bundle would violate it.
- **The run host and the workspace service are node entry points, not renderer bundles.** They are two
  further named inputs of the main section rather than a separate build, so they inherit one
  externalisation rule, and they must keep native modules external so ADR-0054's rebuild-and-unpack
  obligation applies to them.
- **The preload is built in isolated-entry mode**, so it is one self-contained file with no shared
  chunk. ADR-0044's sandboxed preload cannot load a chunk at run time, so this is a correctness setting,
  not an optimisation, and a build that emits a shared chunk into the preload is defective.
- **The renderer framework and store of ADR-0057 are ordinary dependencies of the renderer input.** They
  are named there, not here; this record fixes only what builds them.
- **Assets are bundled, not fetched.** Fonts, the brand mark, icons, the third-party licence bundle and
  the build-identifier file are packaged.
- **A strict content-security policy with no inline execution and no remote origins**, consistent with
  the no-network-request rules for rendering and the about page. **The policy is a mechanism that makes
  those two requirements checkable rather than merely intended.**
- **The renderer must be verified in a packaged build** for the paths where development and production
  differ: asset resolution, the policy, the sandbox, and font loading. That verification belongs in the
  release gate of `REQ-STARTUP-156`, which already requires each artifact to be launched to first paint.
- **The generated requirement-symbol artifact of ADR-0040 is a build input**, regenerated by the test
  session before collection, so the build and the test runner share one generator.
- **The Windows portable's launcher stub is a fifth build output, produced outside `electron-vite`.** It
  runs before any application runtime exists, so it cannot be one of the tool's entries and cannot share
  a line of the product's own code. What this record fixes about it is the shape of the obligation
  rather than the language:
  - **It is not a published artifact and not a second entry point.** `REQ-STARTUP-002` permits exactly
    one shipped executable, and the stub is not one: it is the inside of
    `Rotaris-{v}-windows-x64-portable.exe`, which is one of `REQ-STARTUP-031`'s four names. Nothing is
    published beside it and no installation makes it separately available. `REQ-STARTUP-165` (a) states
    plainly that a preparation is not a published artifact either.
  - **Two performance properties are correctness properties, and both come from measurement.** Placing
    the payload must run at file-copy speed — the same 508 MB tree copies in **684–722 ms** and takes
    the tool's stub **14 s** — and the steady-state path must read no payload and hash nothing, because
    that path is inside the 5-second bound while the preparing path is exempt.
  - **The build embeds the identity token** ADR-0054 keys the preparation on: the product version plus a
    digest of the payload, computed by the release pipeline. It is a build input to the stub, so the
    stub is produced **after** the payload it wraps, and the two cannot drift.
  - **It shares the naming module.** `REQ-STARTUP-031` requires a single naming authority shared with
    the updater, so the portable's assembly step reads the same module the other three targets and the
    updater read, rather than composing a name of its own.
- **The build therefore has two packaging paths on Windows and they must not diverge.** The installer and
  the portable carry the **same `win-unpacked` tree**, produced once; only the wrapper differs. Anything
  that makes them two payloads makes `REQ-STARTUP-159`'s per-artifact claim two claims.

### The native-module obligation — alternative N3, stated as five rules

Each rule exists because of a specific way the property fails silently. They are written as rules rather
than as advice because the whole point is that none of them may be left to a default or to a habit.

1. **Every native binding is rebuilt against the shipped Electron's binary interface, from source, for
   every target of `REQ-STARTUP-030`'s matrix.** Two bindings today — ADR-0020's pseudo-terminal and
   ADR-0058's store — and the rule is written over the *set*, so a third inherits it without an
   amendment. The rebuild is **configured explicitly even where it is the tool's default**, because a
   setting that is written down is reviewable and a default is not, and because the settings move between
   the tool's 26.x and 27.x lines and a configuration that has silently stopped applying must be visible
   as a diff rather than as an absence. Prebuilt binaries are refused: compilation is forced from source
   so that what ships was built against the Electron this release pins and not against whatever a
   registry had.

   1a. **The rebuild's exit status is not evidence that anything was rebuilt, and rule 1 is not discharged
   by running the tool.** *(Added 2026-09-02, defect D10.)* Measured against ADR-0058's chosen store
   binding: `electron-rebuild` **exits 0, prints success, and produces no `.node` at all**, because that
   package's own build configuration skips its sources whenever a prebuilt binary is present — so "refuse
   prebuilt binaries, compile from source" was configured, reported as done, and did not happen. The
   loader would have ignored the result in any case: the binding's own entry point prefers a binary under
   `prebuilds/<platform>-<arch>` over anything built beside it, so even a successful compile would not have
   been the file that loads. **A build step that reads "rebuild the native bindings against the Electron
   interface" and trusts the exit status has verified nothing**, which is the exact shape of swallowed
   failure rule 5 forbids at runtime, appearing in the build instead. The rule is therefore discharged by
   evidence about the artifact and not about the command: for each binding, the build establishes that a
   compiled binary exists, that it is newer than the rebuild step, and that it is the file the loader
   actually resolves — rule 4's load is what confirms the last of those, and rule 4 is now the only thing
   standing between an unloadable binding and a release. It was written as one check among several; it is
   the check.

   **Harmless today, and that is the point.** This binding is built against a stable ABI and its prebuilt
   binary happens to be the correct one, so the artifact works. That is luck rather than the check working,
   and it is exactly the condition under which a silent failure survives review — everything passes, and
   nothing was tested.
2. **The interface is the Electron one, and there is exactly one of it per platform and architecture.**
   Not the host Node's — the spike records them as different builds on the same machine, v24.11.0 against
   the runtime's 24.19.0, which is the condition the mismatch needs. And not two, despite ADR-0002 having
   node-shaped children: `utilityProcess` forks re-enter the shipped Electron binary, so the run host and
   the workspace service load the same build main does.
3. **Native addons are unpacked from the archive**, since an addon inside `app.asar` cannot be loaded by
   the operating system's loader. This is the packaging tool's documented remedy and its own worked
   example names the store binding. It composes with the portable of ADR-0054: the launcher stub places
   the payload tree verbatim, so an unpacked addon must survive that placement byte-for-byte and with its
   executable permissions intact — the placement is a copy, never a re-archive.
4. **The build proves the addons load, under the shipped binary, and fails if they do not.** After
   packaging and before an artifact is accepted, each binding is required to load in a process started
   from the packaged tree under the Electron binary that tree carries. **The check is a load, not a
   version comparison**, because the version numbers agreeing is a weaker claim than the loader accepting
   the file, and it is the loader that fails in the field. A failure fails the build. This is the whole of
   what alternative N3 buys over N1, and it is the only step in this record that could have caught the
   defect ESC-21 found in another project.
5. **No `require` of a native binding is wrapped in a `try`/`catch` that continues.** This is a coding
   rule and it is stated in a build record deliberately, because the build is what makes it affordable:
   with rule 4 in place, a load failure in the field is not a condition to be survived, it is a broken
   artifact, and swallowing it converts a red build into a product that silently records nothing. Where a
   binding will not load, the failure propagates to the surface the owning record names — for the store,
   `REQ-SESSION-089`'s refusal, which requires the run not to start and requires the reason to name the
   store and the engine's own error. **Degrading is forbidden, and this is the one place in the toolchain
   where the prohibition can be enforced rather than remembered.**

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

## Revisit if

A future requirement needs a second renderer entry point with genuinely different capabilities; or the
measured launch cost stops being dominated by the extraction mechanism and starts being dominated by
what the bundle **executes** at startup, which is the term the first-paint measurement deliberately did
not price.

**Restated: the bundle-size clause.** This record previously carried "bundle size threatens the 5 s
first-paint budget on the slowest artifact". On the measurement that is not the mechanism: 327 MB of
extra payload cost about 10 ms at first paint on the flavours that pass, and the flavour that failed
failed with an empty bundle. The clause is kept but re-aimed — the thing to watch is **start-up work**,
not weight, and on the portable the thing weight buys is a longer preparation on a run the requirement
exempts.

**On the native-module obligation.** Either binding stops being native — `node:sqlite` reaching stable
with Electron committing to ship it, which is ADR-0058's own revisit condition, or the equivalent for the
pseudo-terminal — in which case rules 1 to 4 narrow to whatever remains and are withdrawn entirely if
nothing does. Or the load proof of rule 4 turns out to be reachable *before* packaging with the same
strength, which would make it cheaper without weakening it; the reason it sits after packaging today is
consequence 8, and only a check that still sees asar unpacking may move. Or the packaging tool's native
settings move again, at which point the coupling recorded under "what was checked" fires and the
configuration has to be re-verified against the line ESC-11 puts the build on rather than assumed to have
carried over. Or spike 20 forces the launcher stub to place the payload by some means other than a
verbatim copy, which would put rule 3's "byte-for-byte, permissions intact" in tension with whatever that
mechanism is — the stub is the one component that handles unpacked addons without knowing what they are.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10. This is the record the skeleton's defects belonged to, and there were three.*

1. **The configuration file was not read at all.** The tool's file is `electron.vite.config.ts`, with
   dots; the project had written `electron-vite.config.ts`, with a hyphen, and the tool silently used
   its defaults — one main entry, one preload as `.mjs`, no aliases. The build "succeeded" and produced
   no run host, no workspace service and a preload the sandbox could not load. **A build tool that
   ignores an absent config file and reports success is the shape of failure rule 1a exists for.**
   The multi-entry check now in this record's verification list is what caught it.
2. **Giving `rollupOptions` replaces the tool's default `external` list; it does not merge.** The
   default is `['electron', /^electron\/.+/, ...builtins]`. Once it was gone, the bundler inlined the
   `electron` npm package's *launcher shim* — the script that downloads the binary — into both main and
   the preload. Main then threw *"Electron failed to install correctly"* on load; the preload threw
   *"module not found: child_process"* in the sandbox. Restated explicitly for both node-side sections
   (`EXTERNAL` in the config), with `better-sqlite3` beside it.
3. **Electron's binary was never downloaded by the first install.** pnpm 11 refuses install scripts
   not listed under `allowBuilds`, and it rewrites `pnpm-workspace.yaml` with placeholder lines —
   *invalid YAML* — that fail the next install until hand-edited. `electron`, `esbuild`,
   `better-sqlite3`, `electron-winstaller` and `unrs-resolver` are now listed. Under the hoisted linker
   `better-sqlite3` was **built from source by node-gyp** at install; whether the packaged app loads
   that binary or a prebuild is exactly IC-6's question and is still unanswered.

**What ran:** all five entries emitted; the renderer bundle carried the five design fonts and one CSS
file; the strict CSP raised no violation; the application painted. The rail's icons first painted as
the wrong glyphs: the seven Phosphor codepoints had been hand-mapped. The mockup loads the icon
classes from `@phosphor-icons/web@2.1.1`, and the two icon fonts in `docs/design/assets` are byte for
byte that package's; the renderer now imports the package's `regular` and `fill` stylesheets (a bare
package specifier inside a CSS `@import` is not resolved by the bundler, so the import is in `main.tsx`). **Not exercised:** `electron-builder`
(no artifact was produced — the packaging path is untested); the rebuild-against-Electron-ABI rule
(spike 22 found this binding is Node-API and needs none for this version); IC-6.

## Second execution — 2026-09-04, the first packaging, and IC-6

*Recorded under GD-10; the measurement is `../spikes/native-load-proof.md`.* `electron-builder` ran for the
first time; ten runs, six findings, IC-6 discharged.

1. **Rule 1a is real and it catches D10.** With the rebuild's `force_build` unset the rebuild ran for 138 s,
   exited 0, compiled nothing, and the build was **refused** before packaging: no binary newer than the
   rebuild marker. The rule is discharged by evidence about the artifact — a compiled file newer than the
   marker, byte-identical in `app.asar.unpacked`, no prebuild in the asar index — never by the command.
2. **Rule 4 is the check, and it was the only one that saw the second counterfactual.** Packed with the
   prebuilds present, rule 1a passed on the compiled files and the probe, running as the packaged
   `Rotaris.exe` under `ELECTRON_RUN_AS_NODE`, reported the file the loader actually opened:
   `better-sqlite3/prebuilds/win32-x64.node`. Refused, naming the file. The probe wraps `process.dlopen`;
   Electron hands it the extended-length spelling of an unpacked path, and the `app.asar.unpacked`
   redirection holds in node mode.
3. **The build owns the rebuild.** `beforeBuild` runs @electron/rebuild by name over the set, `force`,
   `buildFromSource`, after removing every copy's `build/`, and returns `true`; returning `false` was
   measured to make the packager carry no `node_modules` at all. `npm_config_force_build=1` reaches node-gyp
   as `-Dforce_build=1`. A cold rebuild of both bindings is ~3 minutes, on every `pnpm package`, by design.
4. **pnpm's layout presents one binding as two packages.** `node_modules/.pnpm/<name>@…` and the hoisted
   `node_modules/<name>`: the rebuild compiles both (from the same sources to different bytes — link-time
   code generation is not deterministic), the collector packages the `.pnpm` copy, the checkout resolves the
   hoisted one. Rule 1a accepts any binary this build compiled, over every copy.
5. **Consequence 2 fired on the first packaged launch: the window was blank.** The renderer bundle carried
   React twice — `packages/ui` resolves it through a `.pnpm` symlink, the app through the hoisted directory
   — and `react-dom`'s hooks dispatcher was `null` in the components' copy. The unpackaged build had the same
   fault since the dependency move that made the collector work; nothing in the test suite renders a
   component. `resolve.dedupe` in the renderer section is the correction. **The ninth defect of ADR-0058
   consequence 17's pattern**, and the one this record said the packaged run exists to find.
6. **What the first packaging needed of the project:** `electron` pinned to an exact version (consequence 7
   made literal), `node-pty` declared as the app's dependency (it was externalised and would have been absent
   from the artifact), the workspace packages as `devDependencies` (they are bundled; as `dependencies` the
   pnpm collector died of `EMFILE`), and `NoDefaultCurrentDirectoryInExePath` cleared for the rebuild so
   node-pty's `winpty.gyp` can run its batch file. Both bindings compile from source on this toolchain.

**Not exercised:** the portable and its stub (ADR-0054), signing, `REQ-STARTUP-156`'s gate, the installer
installed, an icon, and the per-runner half (IC-3 item 3). The rule-3 reading worth keeping: "unpacked" is a
property of the asar index, not of the directory — a file placed beside `app.asar.unpacked` that the index
does not name does not exist to a `require` from inside the asar.

## Third execution — 2026-09-05, the toolchain's fourth defect: the collector's `EMFILE`

*Recorded under GD-10; found by Part S's console spike (`../spikes/mcp-console-suppression.md`), which needed a packaged
build and was refused one.*

electron-builder 26.15's node-module collector runs `pnpm list --prod --json --depth Infinity` in `apps/desktop`, and
pnpm 11.9 opens every `package.json` of the tree at once — the walk is not narrowed by `--prod` (the file it died on
was `@eslint/config-array`'s) — so on this tree, grown past what one Windows process may hold open, the command dies
with `EMFILE: too many open files`; the collector parses the error JSON as a failure rather than an empty result, so
its traversal fallback never runs, and `pnpm package` refused before it built. Reproducible alone on an idle host, in
the main checkout. pnpm has no concurrency setting for the walk; electron-builder has no switch past the collector.

**The remedy is a file-descriptor gate, `apps/desktop/scripts/fd-gate.cjs`,** loaded through `NODE_OPTIONS=--require` for
the electron-builder step of `package.mjs` only — every node process of that step inherits it (electron-builder,
corepack's `pnpm.js`, the rebuild) and the packaged application's launch never does. It bounds `fs.open`/`fs.readFile`
and their promise forms to 200 in flight (`ROTARIS_FD_GATE`), changing order and never results. Its first form
replaced the functions bare and electron-builder failed at once with "realpath.native is not a function" — fs-extra
reads the originals' own properties — so the wrapper keeps them and only the two descriptor-holding calls are gated.
With the gate `pnpm package` passed end to end in 300.9 s: the cold rebuild, rules 1a and 4, the packaged
application's scripted session with a terminal call, store v9. IC-6 stands.

The decision's second-execution list counted the toolchain's defects at three; this is the fourth, and CLAUDE.md's
count says so.

## Fourth execution — 2026-09-11, the seams stop shipping, and the build is made to say so

The build gained one assertion and one flag, and ran end to end under both.

**The flag.** `electron.vite.config.ts` defines `__ROTARIS_SEAMS__`, and `scripts/package.mjs` builds with
`ROTARIS_BUILD=package`, which makes it false. Rollup then removes every branch behind it from main's bundle: the
scripted clicks, the typed text, the chords, the renderer `eval`, the notices, the drags, the OS input, the persona
seams, the theme proof's whole capture pass, and `apps/desktop/src/main/driver.ts` in its entirety. What survives is
the three seams this script's own packaged probe drives — `ROTARIS_CAPTURE_PNG`, `_PROMPT`, `_AFTER_MS`. Main goes
from 325,694 to 273,691 bytes.

Until this ran, the shipped binary carried the whole surface, gated on an environment variable **at launch**: about
240 lines able to click, type and evaluate script in a window the user had signed into, reachable by anything that
could set a variable in the app's environment. A build-time constant is the difference between a surface that is
switched off and a surface that is absent, and only the second survives an attacker who controls the environment.

**The assertion — the seam check, and why it carries no number.** After the build, the bundle is read and asserted
to contain the probe's three names and none of the scriptable ones. It is deliberately **not** numbered into N3's
five rules: those are the native-module obligation and rule 5 there is a swallowed failure at runtime, so calling
this one "6" would imply an amendment to a set it does not belong to. Its reasoning is rule 1a's, though, exactly: a
`define` that silently stopped applying, or a guard moved outside the block by a later edit, would leave the surface
in the product and change **nothing that a reading of the source would notice**. The artifact is the evidence.

**What it found.** Its author's own first attempt. The guards were placed on the `if` and not on the environment
**read**, so `process.env['ROTARIS_THEME_PROOF_DIR']` and the driver's endpoint read survived into the shipped
bundle, names and all, with only their bodies removed. The check refused the build; both reads went behind the flag;
the second run passed. This is a defect of the change being made, not of the toolchain — **the toolchain's count
stays at four** and this is not a fifth.

**The run.** `ROTARIS_PACKAGE_DIR_ONLY=1 pnpm package`, **PASSED in 277 s**: the code-intelligence bundle and its
manifest check, the seam-free `electron-vite build`, the seam check at 3 ms, `electron-builder --win --dir` at 246 s
(the cold rebuild of both bindings inside it, 190 s, "which is not evidence of anything" as rule 1a says), rule 1a on
five compiled binaries, the bundled runtime answering Python 3.13.15 from inside the artifact, rule 4 loading two
files from `app.asar.unpacked` at SQLite 3.53.4, and the packaged application — built **without** the seams — opening
a store at v15 and settling a terminal call. Nothing in rules 1a or 4 moved.

**Owed, and named so it is not mistaken for done.** The strip covers **main only**. The renderer bundle still carries
Part AA's `rows-proof` role; it is a fixture surface with no input injection, and leaving it is a decision recorded
here rather than an oversight. A second trap was closed on the way: this script leaves `out/` holding the seam-free
build, and every `*-proof` launches `out/main/index.js` expecting the seams, so it now says on exit that `pnpm build`
must come before the next proof. *Since 2026-09-27 it says so only when the build ran: a run refused before
`electron-vite build` had left `out/` as it was and said otherwise
(`docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md`).*

> **2026-10-13, plan fin42 — the list above was not the whole surface.** "Rollup then removes every branch behind it …
> the scripted clicks" held for the seams behind the flag, but one scripted click in main was never put behind it: the
> approval dialog's answer (`ROTARIS_CAPTURE_APPROVAL`, read in `presentNext` behind the run-time `capturing` test alone),
> which can press "Approve for this session" in a permission dialog. A `ROTARIS_BUILD=package` build of `6de2a67` carried the
> name in `out/main/index.js`, and the seam check passed because its `forbidden` list did not name it. The reads now sit
> behind the flag and the check names them
> ([`../../defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md`](../../defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md)).
> The rest of main's dialog answers read behind `capturing` alone are recorded, not repaired:
> [`../../defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md`](../../defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md).

> **2026-10-14, plan fin43 — the rest of main's seams.** Twenty-two reads in main — the hook review's press, the pause
> window's and every message box's answer, the backup, restore, export, directory and skill-file choosers' paths, the
> provider dialog's fill, the external-link swallow, the stale question answer, the subscription's delay and hold, the
> theme, the scale, the network log and the resume timing — sat behind `capturing` alone, and a `ROTARIS_BUILD=package` build
> carried twenty of their names in `out/main/index.js`; the bundle's review found two more not named `ROTARIS_CAPTURE_*`,
> `ROTARIS_ROWS_PROOF` (behind `capturing` alone) and `ROTARIS_INIT_TEST_TASK` (behind nothing), repaired the same way. Each read now carries the flag on its own line, the seam check's lists
> live in `scripts/lib/seam-check.mjs` and name them all, and two tests hold source and list together
> (`main/capture/seam-reads.test.ts`, `scripts/lib/seam-check.test.ts`); the same build then carries none, and the check
> passes over it. **Still owed:** the packaged probe answers more than its three variables, and the run host and the workspace
> service read two home-directory seams with no guard
> ([`../../defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md`](../../defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md)).
>
> **2026-10-14, plan fin44 — the owed rest.** Repaired: the packaged probe's six verification seams (`_WAIT`, `_WAIT_MS`,
> `_END_VIEW`, `_END_VIEW_MS`, `_PROBE`, `_PROMPT_MS`) and the children's two home seams are read behind the flag, the seam check
> names them, and `seam-check.test.ts` now holds the converse too: a capture variable read OFF the flag in any module a packaged
> build keeps fails unless it is one of the probe's three. A `ROTARIS_BUILD=package` build then carries `_PNG`, `_PROMPT` and
> `_AFTER_MS` alone. One thing the first such build taught: a JSDoc comment survives into the bundle, so a seam's full name
> written in a doc comment of a module a packaged build keeps is a name the check finds; `probe.ts`'s comments name the seams
> by their suffixes.
>
> **2026-10-14, plan fin45 — the scripted model client's variables.** The seam check named only capture variables, and the run
> host read the dialect switch (`ROTARIS_MODEL_DIALECT`: every model of every run answered by the stand-in, no credential asked)
> and twelve script variables with no flag, so a packaged build answered them all while the check passed
> ([`../../defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md`](../../defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md)).
> Each is read behind the flag now, the list names them, and `seam-check.test.ts` holds every `ROTARIS_*` read off the flag in a
> module a packaged build keeps to the product's own seven and the probe's three. Rule 4 (b) keeps running on the scripted client:
> its launch names the `scripted` provider in the scratch workspace's configuration, sets no model or script variable, and the
> packaged build's client answers with one fixed `git status` call (`PACKAGED_SCRIPT`). Whether a person's configuration may
> select that client in a shipped build is OQ-312. The first seam-free build taught the JSDoc lesson's sibling: a string literal
> in a log line survives too, so the tool step's log no longer spells its variable.
>
> **2026-10-14, plan fin46 — rule 4 (b) proves the shipped model client (OQ-312, ruled the same day under R-072 with no
> directive).** The consortium ruled that a packaged build answers no `provider: scripted` entry: the scripted client is
> compiled out with the other verification seams, and a `scripted` entry with no `base_url` gets the refusal any provider the
> build knows no endpoint for gets (REQ-EVENTS-021/019). `host.ts` now builds the client only behind the flag, so rollup leaves
> `scripted-client.ts` out of the packaged `run-host.js`; `configuration.ts`'s `isScriptedProvider` answers the provider with it
> only where the seams are compiled in; `PACKAGED_SCRIPT` is gone; and the seam check names the client's own log line
> (`scripted model call:`). Rule 4 (b)'s launch is re-based on a loopback OpenAI-compatible stub `package.mjs` starts itself
> (`scripts/lib/stub-model-endpoint.mjs`, 127.0.0.1, a port the system picks), configured as `provider: openai` at the stub's
> `base_url` with a placeholder key, which the packaged application reaches through `AiSdkModelClient` exactly as it reaches a
> person's provider. The step keeps its store assertions and adds one: the stub served at least one tools request and sent its
> `git status` call. **The reason it ran on the scripted client, kept beside its replacement:** rule 4 (b) needed "a model that
> makes one terminal call without a provider, a key or a network", and the stand-in was the one at hand; that reason held, but it
> made the packaged build ship the stand-in and answer a person's `provider: scripted` entry with it
> ([`../../defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md`](../../defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md)).
> A loopback stub needs no provider, key or external network either, and it measures the client that ships. **First execution
> (Linux, load 3 to 5):** a `ROTARIS_BUILD=package` build's `out/main` carries no `scripted model call:` and the seam check reads
> PASS (the same build of the unrepaired source reads FAIL, `scripted model call: (run-host.js)`); rule 4 (b)'s launch shape run
> against that `out/main` under `xvfb-run` — `package.mjs` itself is Windows-only — recorded one session `completed` and one
> `terminal` call settled `ok`, the window photographed, with the stub serving five requests (three classifications, two tools
> requests, one terminal call) and no scripted model call in the log; the old configuration (`provider: scripted`, no
> `base_url`) against the same build started no session and logged "No usable model is configured for the entry role … (provider
> scripted) has no base_url and this build knows no endpoint for that provider". `pnpm package`'s own run of the re-based step is
> owed to the next Windows package (a Windows x64 host, deferred with the release pipeline under R-071; IC-3 binds Linux and macOS
> artifacts).

## The Electron pin moves to 44.3.0 — 2026-10-22 (R-081)

`electron` is pinned exactly at **44.3.0** in `apps/desktop/package.json`, for GHSA-fw47-9c62-h3vw (HID and USB permission
checks attributed to the wrong origin; Dependabot alerts #3 and #54,
[`../dependency-alerts/2026-10-22-dependabot-triage.md`](../dependency-alerts/2026-10-22-dependabot-triage.md)). Nothing
else moves with it. electron 44.3.0 declares the same dependencies as 44.1.1, and the lockfile changes only its own two
entries. Read from each runtime with `ELECTRON_RUN_AS_NODE=1 electron -p process.versions`:

| | Electron 44.1.1 | Electron 44.3.0 |
| --- | --- | --- |
| Node | 24.19.0 | 24.20.0 |
| Chromium | 152.0.7977.65 | 152.0.7977.78 |
| V8 | 15.2.124.18-electron.0 | 15.2.124.19-electron.0 |
| `process.versions.modules` | 149 | 149 |

**Consequence 7 still governs, and this bump is the case it describes.** The binary interface is unchanged (149), so the
bindings this toolchain compiles from source keep their interface. Rule 4 is still what proves it for the artifact:
`pnpm package` rebuilds both bindings against the shipped Electron and loads them under the packaged binary, and the build
hooks read the Electron version from the build context, not from a literal (`build-hooks.cjs`; `afterPack` refuses a probe
that ran under another Electron). `pnpm package` builds Windows only (`PD-STARTUP-001`; IC-3 refuses Linux and macOS), and
this bump was made on a Linux host. So rule 4's run for 44.3.0 is continuous integration's `package` job on the branch's
head, and its result is reported with the pull request, not here: no file can carry the result of a run on the commit that
holds it. On Linux the development tree ran under 44.3.0 (the proof sweep in
[R-081's Electron lane record](../dependency-alerts/2026-10-22-lane-electron.md)). Every proof launch loads the store and
terminal bindings into Electron's own processes, and that measured the unchanged interface in the development tree, not in
an artifact. The same record holds a cold rebuild: both bindings compiled from source against 44.3.0's headers with
`beforeBuild`'s own `@electron/rebuild` options, in a scratch copy with no `build/` and no `prebuilds/`, then loaded and
exercised under the 44.3.0 binary. That is a Linux binding, not the artifact's either. No Linux or macOS artifact was
produced. `apps/desktop/scripts/lib/platform-targets.test.ts`
passes `electronVersion: '44.1.1'` as an arbitrary input to the IC-3 refusal; it is not coupled to the pin and is left as it
is. The dated "Electron 44.1.1" in this record's earlier executions, and in others', stays as measured.
