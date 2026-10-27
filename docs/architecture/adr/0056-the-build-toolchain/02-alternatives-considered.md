# ADR-0056 — The build toolchain — Alternatives considered

Part 2 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

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
