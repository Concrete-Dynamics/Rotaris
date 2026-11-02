## pnpm package on the Windows ARM64 host fails rebuilding node-pty for want of Spectre-mitigated libraries

`pnpm package` on the owner's Windows 11 ARM64 machine (2026-11-01, worktree of branch `hrd2-dependency-policy`,
`ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 ROTARIS_PACKAGE_WITHOUT_NOTICES=1`) passes its steps up to
electron-builder and then stops in the native rebuild: `@electron/rebuild`'s node-gyp build of `node-pty` fails in
`C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\MSBuild\Current\Bin\arm64\MSBuild.exe` with `MSB8040`
(Spectre-mitigated libraries are required for this project; install them from the Visual Studio Installer's individual
components) for `conpty.vcxproj`, `conpty_console_list.vcxproj`, `winpty-agent.vcxproj` and `winpty.vcxproj`.
node-pty's build asks for Spectre mitigation, and this host's Build Tools 18 lack those libraries for the toolset and
architecture in use, so no `win-unpacked` tree is produced here and nothing after step 2 (installer, portable, icon,
the packaged launch) can be measured on this host. `docs/architecture/spikes/native-load-proof.md` records node-pty
compiling with Spectre mitigations on the toolchain of that spike, so this is the host's toolchain, not the code;
whether the libraries for the arm64-hosted x64 toolset are all it needs is not measured. Noticed while checking that
`catalog:` specifiers reach electron-builder (R-091, hardening bundle G1).

Met again on 2026-11-03 (hardening bundle A2, the fuses' first execution; worktree of branch
`hrd1-secure-windows-and-fuses`, `ROTARIS_PACKAGE_WITHOUT_NOTICES=1 pnpm package`): the same four projects, `MSB8040`, after
better-sqlite3 had compiled for x64 Electron 44.3.0. The fuses were measured on a tree packed without the rebuild instead
([ADR-0054 part 23](../architecture/adr/0054-packaging-artifacts-and-self-update/23-the-fuses-2026-11-03-first-execution.md)); the
release build's own read-back waits on the Windows runner or on these libraries here. The refused rebuild leaves the
checkout's `node-pty/build/Release` holding only `obj/` and better-sqlite3's `build/Release` an x64 binary (`beforeBuild`
removed both `build/` directories first); what the development app then loads was not measured.

## Specs

None. ADR-0056's build (rule 1a: the desktop build rebuilds the bindings itself) cannot run on this host.

## Relevant files

- `apps/desktop/scripts/package.mjs` — step 2, `electron-builder --win`, where the rebuild runs.
- `apps/desktop/scripts/build-hooks.cjs` — `beforeBuild`, which runs the rebuild.
- `docs/architecture/spikes/native-load-proof.md` — node-pty from source with Spectre mitigations, on the spike's toolchain.
