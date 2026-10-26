# ADR-0056 — The build toolchain — First execution — 2026-09-03, the walking skeleton

Part 6 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

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
