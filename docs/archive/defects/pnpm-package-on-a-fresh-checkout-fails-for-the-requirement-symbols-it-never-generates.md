## `pnpm package` on a fresh checkout fails for the requirement symbols it never generates

R-079's first CI run (GitHub-hosted `windows-latest`, Node 24, a fresh clone of `ci-windows` at `8ae825fd`, run
39668971523, 2026-10-21) ran `pnpm install`, `pnpm code-intel:bundle --target=win32-x64` and `pnpm package`. The package
went through the bundle, the manifest check, the notices step (passed over by `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`) and
the build identifier, then stopped in `electron-vite build`:

```
[UNRESOLVED_IMPORT] Could not resolve './generated/requirements.js' in ../../packages/kernel/src/index.ts
[package] REFUSED — pnpm exec electron-vite build exited 1 (7791 ms)
```

`packages/kernel/src/generated/` is git-ignored and is written only by `pnpm symbols`
(`tools/symbol-artifact/generate.mjs`) — run by `pnpm check` as its first stage and by Vitest's global setup. Neither
`pnpm build` nor `pnpm package` runs it, so a tree that has never been gated cannot be built or packaged. Every
developer tree has run the gate, which is why it was never seen there; the tag workflow of
[`../../architecture/first-release-plan.md`](../../architecture/first-release-plan.md) §4.2 runs `pnpm symbols` before the guard
and would have hidden it too. `ci.yml` runs `pnpm symbols` before the package as its workaround.

## Specs

None in `docs/spec/` contradicted directly: the requirement-symbol artifact is a build input (ADR-0001), and REQ-STARTUP-008
asks for "a single version-controlled build command" per OS, which `pnpm package` is meant to be and on a fresh tree is not.

## Relevant files

- `apps/desktop/scripts/package.mjs` — the steps before `electron-vite build`; none writes the symbols.
- `apps/desktop/package.json` — `build` is `electron-vite build` alone.
- `tools/symbol-artifact/generate.mjs` — the generator; `packages/kernel/src/generated/` its git-ignored output.
- `.github/workflows/ci.yml` — the "Requirement symbols" step that works around it.

## Repaired — 2026-10-31

The same repair as [the build's note](a-fresh-clone-cannot-build-until-pnpm-symbols-has-run.md). The step that stopped
was `package.mjs`'s `pnpm exec electron-vite build`. It loads `apps/desktop/electron.vite.config.ts`, whose sections now
write the artifact when it is absent (`tools/symbol-artifact/ensure.mjs`). That exact step,
`ROTARIS_BUILD=package pnpm exec electron-vite build` in `apps/desktop/`, exited 0 from a tree with no
`packages/kernel/src/generated/`. It ran on Linux x86_64, Node 26.12.1, on `c583e1bc`, and the generator ran once.
`pnpm package` was not run end to end on a fresh Windows clone here. `ci.yml`'s "Requirement symbols" step is removed,
so the `package` job, a fresh `windows-latest` clone, is that check from now on. `release.yml`'s `pnpm symbols` steps
stay: its guard reads `@rotaris/config` outside any build, and none of its steps relies on the build to write the file.
