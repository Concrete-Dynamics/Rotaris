# ADR-0056 — The build toolchain — Second execution — 2026-09-04, the first packaging, and IC-6

Part 7 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

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
