# ADR-0054 — Packaging, the four artifacts, and self-update — The fuses — 2026-11-03, first execution (R-091, Electron security checklist 19)

Part 23 of 23 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The fuses — 2026-11-03, first execution (R-091, Electron security checklist 19)

**What is decided.** The Windows executable a package carries is fused at package time, by electron-builder's own
`electronFuses` key in `apps/desktop/electron-builder.yml` (it supports every fuse below, so no hook of the project's
flips them): **RunAsNode off, `NODE_OPTIONS` off, the Node inspector's command-line switches off, cookie encryption on,
embedded asar integrity validation on, `onlyLoadAppFromAsar` on.** Two are left as Electron ships them on purpose:
`grantFileProtocolExtraPrivileges` stays on, because the renderer is a `file:` page
([OQ-466](../../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-466)'s ruling), and
`loadBrowserProcessSpecificV8Snapshot` stays off (no browser-process snapshot is built). `asar: true` is stated rather than
defaulted, because two of the fuses read it: electron-builder writes the archive's header hash into `Rotaris.exe`'s
resources (`ElectronAsarIntegrity`), and the integrity fuse makes Electron check it.

**The order, and why it holds.** electron-builder flips the fuses after `afterPack` and before signing (`doAddElectronFuses`
in app-builder-lib 26.15.3, "the fuses MUST be flipped right before signing"; no signing yet, R-071). So afterPack's rule 4
probe — `scripts/native-load-probe.cjs` run as the packaged `Rotaris.exe` under `ELECTRON_RUN_AS_NODE`, the one launch of
the packaged binary as Node — still runs before RunAsNode is off. Nothing the application starts needs it: the run host and
the workspace service are `utilityProcess` children (the Electron fuses page: a utility process does not need RunAsNode),
and the code-intelligence server starts `Rotaris.exe builtin:code-intelligence -- …` as the application, whose main bundle
(`main/sentinel.ts`) hands over to the bundled interpreter. `build-hooks.test.ts` fails a source under `apps/desktop/src` or
`packages/*/src` that sets `ELECTRON_RUN_AS_NODE` for a process it starts.

**The read-back (ADR-0056 rule 4's discipline: evidence about the artifact).** `scripts/build-hooks.cjs` holds the list
(`FUSES`, the six flipped and the two left, by @electron/fuses' wire index) and reads the wire back out of the packed binary
with `@electron/fuses`' `getCurrentFuseWire` twice: in `artifactBuildStarted`, before the installer is made from the packed
tree, and in `pnpm package`'s own step after electron-builder, which a `--dir` package (no installer, so no
`artifactBuildStarted`) meets too. Any fuse that reads otherwise refuses the build, naming it, what it reads and what was
asked. A wire position past the list (Electron 44.3.0's wire is nine long; @electron/fuses 1.8.0 names eight) is reported,
never judged. `build-hooks.test.ts` holds the yml's map equal to the list.

**First execution, 2026-11-03, on the owner's Windows 11 ARM64 machine.** `ROTARIS_PACKAGE_WITHOUT_NOTICES=1 pnpm package`
ran its steps to electron-builder and was refused in the native rebuild, `MSB8040` for node-pty's four projects — this host's
Build Tools lack the Spectre-mitigated libraries
([the note](../../../defects/pnpm-package-on-the-windows-arm64-host-fails-rebuilding-node-pty-for-want-of-spectre-mitigated-libraries.md)),
so no artifact of the real build exists here and **the release build's own read-back and its rule 4 (b) launch of a fused
artifact are not yet measured**: they run on the Windows runner's `pnpm package`, or here once the libraries are installed.
What was measured instead, on a tree packed by the same configuration with the hooks off, nothing rebuilt, better-sqlite3
the x64 Electron 44.3.0 binary that refused run had compiled and node-pty its own N-API prebuild for win32-x64 (an
experiment, not the artifact; `electron-builder --win --dir --x64`, the x64 binary under emulation):

- electron-builder flipped the fuses itself (`executing @electron/fuses`), and `checkFuses` read the wire back as listed —
  RunAsNode, `NODE_OPTIONS` and the inspector off, cookie encryption, asar integrity and `onlyLoadAppFromAsar` on, the file
  protocol's privileges on, the V8 snapshot off, the ninth fuse on. The unflipped Electron binary of the checkout is refused
  fuse by fuse, six problems.
- `pnpm package`'s rule 4 (b) launch, its own code over that tree: the run host and the workspace service started as utility
  processes and opened and migrated the store (schema v35, better-sqlite3 from `app.asar.unpacked`); the stub model's tools
  request came through the shipped model client; the terminal call ran `git status` through node-pty from
  `app.asar.unpacked` and settled `ok`; the session completed; the window painted; the code-intelligence setup ran
  `Rotaris.exe builtin:code-intelligence -- project create` and succeeded (8.3 s), and the server's tools were offered. At the
  step's own 9 s capture the emulated x64 binary had not reached the tools request (one classification request); at 45 s it
  had, so the 9 s is a measurement of this host's emulation, not of the fuses.
- One byte of `out/main/index.js`'s content changed inside `app.asar`: the fused binary exited 1 before any window with
  `ASAR Integrity Violation: got a hash mismatch`; the archive was restored byte for byte after.
- Launched with `ELECTRON_RUN_AS_NODE=1`, `NODE_OPTIONS=--require <a module that writes a file>` and `--inspect=9339`
  before a script: it started as the application (main's log lines, the script's path taken as a workspace), ran no script
  as Node, loaded no `NODE_OPTIONS` module and opened no inspector.

Nothing was found to repair in the unpack layout or the integrity exclusions: the native bindings and the code-intelligence
runtime load with `onlyLoadAppFromAsar` on, as they live outside the archive (`asarUnpack`, `extraResources`).
