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

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — the `uv python install` call, which before the repair passed
  `--install-dir` but no flag that keeps uv from installing executables (uv documents `--no-bin` for this).

## Repaired — 2026-10-31

Reproduced on the Linux x64 host before the repair: `~/.local/bin/python3.13` (on PATH) was a symbolic link, made
2026-10-30 10:02, to `<worktree>/apps/desktop/resources/code-intelligence/.python-install/cpython-3.13.15-linux-x86_64-gnu/bin/python3.13`
in the `feat-chat-queue-voice-input` worktree, whose `.python-install` no longer exists: a past bundle run put it there,
the step's own clean-up removed the install directory, and the link was left dangling behind every later shell that
resolves `python3.13`. So the write the Windows run escaped only by a name collision does happen on a host without one.
The link is host state outside the tree and was left in place for the owner.

`bundle.mjs` now passes `--no-bin` on its one `uv python install` call, beside `--install-dir`, with a comment naming
why. The pinned uv documents it: `uv 0.12.5 (x86_64-unknown-linux-gnu)`, `python install --help`: "`--no-bin` Do not
install a Python executable into the `bin` directory". Nothing in the bundle used the link: the runtime is moved out of
the install directory, which with `--no-bin` still holds the one `cpython-3.13.15-*` directory the step expects.

The same call also passes `--no-registry`, for the same reason: the pinned uv's `python install --help` documents "`--no-registry`
Do not register the Python installation in the Windows registry", so a win32 build without it very likely records the
interpreter under the user's registry, an entry left behind once the install directory is removed, as the PATH link was.
It was added by symmetry with a flag uv documents, before any Windows run was read; the Windows x64 host's reading below (2026-10-31)
then found exactly that entry, left by an earlier bundle run, and the flag holding it back.

Evidence:
- `apps/desktop/scripts/code-intelligence/bundle.test.ts` (in `target.test.ts` when these counts were taken), "bundle.mjs's interpreter install — nothing onto the user's
  PATH or into the registry": a static scan of every `run(uv, [...])` in `bundle.mjs` that finds exactly one
  `'python', 'install'` call, with `'--install-dir'`, and asserts `'--no-bin'` and `'--no-registry'` on that same
  argument list. Red against the pre-repair line (2 failed, 15 passed of 17: "expected [ 'python', 'install', …(3) ] to
  include '--no-bin'" and the same for `'--no-registry'`); red with `--no-registry` moved onto `uv pip check` instead
  (1 failed, 16 passed); green with the repair, 17 of 17. (With `--no-bin` alone, before `--no-registry` was added, the
  same scan was 1 failed of 16 against the pre-repair line, also red with that flag moved onto `uv pip check`.)
- The pinned uv 0.12.5 run by hand into throwaway directories, its cache and `UV_PYTHON_BIN_DIR` throwaway too:
  `python install cpython-3.13.15-linux-x86_64-gnu --install-dir <a> --no-bin` exited 0 and left the bin directory
  empty; the same without `--no-bin` exited 0, printed `+ cpython-3.13.15-linux-x86_64-gnu (python3.13)` and left
  `python3.13 -> <b>/cpython-3.13.15-linux-x86_64-gnu/bin/python3.13` there. `~/.local/bin` was unchanged across both.
  The final argument list, `python install cpython-3.13.15-linux-x86_64-gnu --install-dir <c> --no-bin --no-registry`,
  likewise exited 0 (`Installed Python 3.13.15`), left the bin directory empty and `~/.local/bin` unchanged, and
  `bundle.mjs`'s own `readdirSync` filter found exactly one directory under `<c>`, `cpython-3.13.15-linux-x86_64-gnu`.
- Windows 11 x64 (build 26300), 2026-10-31. Before any run, `HKCUSoftwarePythonAstralCPython3.13.15` already stood there,
  its `InstallPath` naming `C:devRotarisappsdesktopesourcescode-intelligence.python-installcpython-3.13.15-windows-x86_64-none`,
  a directory that no longer exists: what a bundle run without the flag leaves behind, measured rather than supposed. It is
  host state outside the tree and was left in place for the owner. The pinned uv 0.12.5 (hash-checked `win32-x64` asset), with
  `python install cpython-3.13.15-windows-x86_64-none --install-dir <d> --no-bin --no-registry`, its cache and
  `UV_PYTHON_BIN_DIR` throwaway, exited 0 (`Installed Python 3.13.15`). `reg query HKCUSoftwarePythonAstral /s` was
  byte-identical before and after, naming `<d>` nowhere; the bin directory stayed empty; `%USERPROFILE%.localin`'s
  listing was identical, times included; `<d>` held the `cpython-3.13.15-windows-x86_64-none` directory the step expects.
- Not run: the full bundle step (`pnpm code-intel:bundle --force`), on any host; the same call without `--no-registry`
  on Windows, which would overwrite the host's registry entry; the Windows ARM64 run's warning is not re-measured.
