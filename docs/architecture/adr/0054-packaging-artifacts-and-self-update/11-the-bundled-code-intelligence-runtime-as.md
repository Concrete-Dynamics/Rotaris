# ADR-0054 — Packaging, the four artifacts, and self-update — The bundled code-intelligence runtime as `extraResources` — 2026-09-06, Part T (ADR-0035's first execution)

Part 11 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The bundled code-intelligence runtime as `extraResources` — 2026-09-06, Part T (ADR-0035's first execution)

The runtime rides **outside the asar**, under `resources/code-intelligence/` (`electron-builder.yml` `extraResources`;
a Python tree cannot run from an archive), built by `pnpm code-intel:bundle` before `electron-vite build` and asserted
by `afterPack` to answer its own version and the distribution's from inside `win-unpacked` (the "runtime" rule beside
rules 1a and 4; `build-hooks.cjs`). **Measured growth of the artifact** on the build that first carried it (this
worktree, `pnpm package` end to end in 353 s, IC-6's rules green): `win-unpacked` from 442 MB to the figure in the
handoff and `release/load-proof.json` — the runtime is 167.2 MiB in 10,603 files, byte-compiled so an installation
under Program Files never writes bytecode; the installer's growth is in the same report. The "327 MB of additional
payload moved first paint by about 10 ms" measurement above is not re-taken: the runtime is never read at first paint
(only the sentinel path touches it), so first paint is unaffected by construction. **IC-7** (proposed in
`implementation-conditions.md`) binds the release this artifact would be: the runtime is self-contained, its language
servers are not — measured on the packaged binary with outbound blocked (`pnpm code-intel-proof` launch 7: `npm install
typescript@5.9.3` attempted and failed). The licence text the bundle carries is one copy under the distribution's
dist-info; the notices generator (`REQ-STARTUP-141/142`) is still not built. *2026-09-27: no longer the copy the artifact
carries. The notices file reproduces the same text, and REQ-STARTUP-142 requires it there, so the dist-info copy is
filtered out of the artifact and kept in the source tree for the generator. See "The two bundled assets" below.*
**IC-7 adopted 2026-09-06 (ESC-32, option 2):** the language servers are tools provisioned after installation;
`REQ-STARTUP-142`'s section now lists them after Git and ripgrep, from the same manifest, and the generator that
will write that section is the one still owed here — IC-7's second half is discharged when it does. *It did, on
2026-09-27: see "The notices generator" below.*

*2026-10-15, OQ-400 (ruled under R-072), fin47: the "runtime" rule now reads the packaged `python.exe`'s PE machine
field before it spawns the interpreter (`peArchOf` in `build-hooks.cjs`: `e_lfanew` at 0x3C, the `PE\0\0` signature, the
machine u16, 0x8664 x64 and 0xAA64 arm64) and refuses one built for another architecture than the artifact's — "runtime:
the packaged interpreter is built for arm64, the artifact for x64" — and a `bundle.json` whose `targetArch` is not the
artifact's. The spawn could never catch it: an arm64 interpreter answers its versions correctly on an ARM64 build host.
`package.mjs` builds the bundle with `--target=win32-x64` (ADR-0035's note of the same date). The machine field is a
byte check, so it counts from any Windows build host (OQ-400 (b)); rule 4's load, which executes the artifact, stays
owed to a Windows x64 host. Pinned by `build-hooks.test.ts` over PE-header fixtures and read over the real
python-build-standalone `python.exe` of both architectures (first-executions, 2026-10-15); no `pnpm package` has run
with it yet.*
