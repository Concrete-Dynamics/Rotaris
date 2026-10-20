## code-intel-proof's packaged launches run whatever bundle the packaged tree holds

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-rename` at `0d89e971` — read in the proof's code, not run (no packaged tree in that worktree).
Found by fin47's review of `accept1-1` (finding 4, record only) and recorded by loc1's `rename` bundle (`loc1-rename`); not
repaired here.

Under `ROTARIS_CODE_INTEL_PACKAGED=1`, launch 1's packaged branch and launch 7 (`contained`) launch
`apps/desktop/release/win-unpacked/Rotaris.exe`, whose code-intelligence runtime is the copy `pnpm package` placed under
`release/win-unpacked/resources/code-intelligence/` (`extraResources` in `electron-builder.yml`). The proof's precondition,
`ensureBundle` (`scripts/lib/code-intelligence-bundle.mjs`), asks `bundle.mjs --check` of the **source tree's** bundle,
`apps/desktop/resources/code-intelligence/`, and of nothing else. A packaged tree left by an older package run — an earlier pin,
recipe or target — therefore passes the check whenever the source tree's bundle is current, and those two launches judge the
older runtime without a word; `results.json`'s `bundle` names the source tree's marker, not the one the packaged launches ran on.
`pnpm package` builds the bundle first and `build-hooks.cjs`'s `checkRuntime` asserts the interpreter from inside `win-unpacked`
at packaging, so the copy is current when it is made; nothing re-asks it when the proof runs later.

## Specs

None contradicted directly: a proof that may judge a stale artifact. It matters because launch 7 is IC-7's evidence (what the
packaged runtime fetches with outbound blocked) and launch 1's packaged branch is ADR-0035's consequence 1 for the artifact, and
both are read as the artifact's (REQ-STARTUP-015, REQ-MCP-011's one pinned release).

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs` — `packagedExe`, launch 1's packaged branch, launch 7, and `ensureBundle({ skipBuild: false })`.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — `ensureBundle`, `runBundleScript(['--check'])`, the source tree's bundle only.
- `apps/desktop/electron-builder.yml` — `extraResources`, the copy into `release/win-unpacked/resources/code-intelligence/`.
- `apps/desktop/scripts/code-intelligence/bundle.mjs` — the marker (`bundle.json`) and its pins' hash, which a packaged copy carries too.
