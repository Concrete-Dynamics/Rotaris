## The bundle step's interpreter install tries to place an interpreter on the user's PATH

The Windows ARM64 session's F2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, uv 0.12.5 aarch64 on PATH,
2026-10-21) ran `pnpm code-intel:bundle --force`. It exited 0, and its `uv python install cpython-3.13.15-windows-x86_64-none
--install-dir <tree>\.python-install` step printed:

```
warning: Failed to install executable for cpython-3.13.15-windows-x86_64-none
  Caused by: Executable already exists at `%USERPROFILE%\.local\bin\python3.13.exe` but is not managed by uv; use `--force` to replace it
```

`--install-dir` moves where uv keeps the interpreter, not where it puts its executable links: uv also tries to install a
`python3.13.exe` into the user's executable directory (`%USERPROFILE%\.local\bin` here, uv's default, on the user's PATH). On
this host a file of that name already stood there, so the attempt failed and nothing was written. On a build machine
without one, a build step would leave a per-user `python3.13.exe` on PATH, outside the tree, behind every later shell and
tool that resolves `python3.13`. Nothing in the bundle is affected: the runtime is copied from the install directory.

## Specs

None in `docs/spec/` contradicted: the bundle step is a build tool. ADR-0035's bundle is built inside the tree from pinned
inputs; a write into the user's PATH is outside what it decides.

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — the `uv python install` call (about line 172), which passes
  `--install-dir` but no flag that keeps uv from installing executables (uv documents `--no-bin` for this).
