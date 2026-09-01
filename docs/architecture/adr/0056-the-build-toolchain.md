# ADR-0056 — The build toolchain

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. The build gains an output this record did not contemplate — the Windows
  portable's launcher stub — because SR-7 moved that artifact off the packaging tool's own portable
  target (ADR-0054 alternative P4). The bundle-size revisit clause is restated on measurement, which
  points somewhere other than where it pointed.
- **Origin:** UI (ADR-UI-15)
- **Depends on:** ADR-0001, ADR-0002, ADR-0044, ADR-0053, ADR-0054
- **Governed by:** `owner-decisions.md` SR-7
- **Evidence:** `../spikes/packaged-first-paint.md`

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

**What was checked.** Context7, the electron-vite documentation, and the npm registry, 2026-08-31.
`electron-vite` 5.0.0 is the current release, MIT, published December 2025. Each of its three
configuration sections — `main`, `preload`, `renderer` — accepts its own
`build.rollupOptions.input` map, so several named entries per section are a configuration and not a
second build system. The `preload` section additionally has an **isolated-entry mode** that emits each
preload as a self-contained bundle rather than as entries sharing a chunk. Those two facts are what the
recommendation rests on: the first covers the four entry kinds, the second covers ADR-0044's
sandboxed preload.

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
