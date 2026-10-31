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

Evidence:
- `apps/desktop/scripts/code-intelligence/target.test.ts`, "bundle.mjs's interpreter install — nothing onto the user's
  PATH": a static scan of every `run(uv, [...])` in `bundle.mjs` that finds exactly one `'python', 'install'` call, with
  `'--install-dir'`, and asserts `'--no-bin'` on that same argument list. Red against the pre-repair line (1 failed,
  15 passed of 16: "expected [ 'python', 'install', …(3) ] to include '--no-bin'"), also red with the flag moved onto
  `uv pip check` instead; green with the repair, 16 of 16.
- The pinned uv 0.12.5 run by hand into throwaway directories, its cache and `UV_PYTHON_BIN_DIR` throwaway too:
  `python install cpython-3.13.15-linux-x86_64-gnu --install-dir <a> --no-bin` exited 0 and left the bin directory
  empty; the same without `--no-bin` exited 0, printed `+ cpython-3.13.15-linux-x86_64-gnu (python3.13)` and left
  `python3.13 -> <b>/cpython-3.13.15-linux-x86_64-gnu/bin/python3.13` there. `~/.local/bin` was unchanged across both.
- Not run: the full bundle step (`pnpm code-intel:bundle --force`), on any host; the Windows run's warning is not
  re-measured.
