# ADR-0056 — The build toolchain — Context

Part 1 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

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
