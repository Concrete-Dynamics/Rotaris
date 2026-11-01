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

## Specs

None. ADR-0056's build (rule 1a: the desktop build rebuilds the bindings itself) cannot run on this host.

## Relevant files

- `apps/desktop/scripts/package.mjs` — step 2, `electron-builder --win`, where the rebuild runs.
- `apps/desktop/scripts/build-hooks.cjs` — `beforeBuild`, which runs the rebuild.
- `docs/architecture/spikes/native-load-proof.md` — node-pty from source with Spectre mitigations, on the spike's toolchain.
