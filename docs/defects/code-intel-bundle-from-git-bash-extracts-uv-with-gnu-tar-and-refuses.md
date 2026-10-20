## `pnpm code-intel:bundle` run from Git Bash extracts uv with GNU tar and refuses

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-liveevidence` at `0d89e971`. Record-only: not repaired by the plan that saw it (loc1).

A fresh tree's `pnpm code-intel:bundle`, sent from a Git Bash shell, refused at its first step:

```
[code-intel:bundle] REFUSED — uv could not be obtained: tar -xf C:\dev\Rotaris-crw-wt-loc1-liveevidence\apps\desktop\.cache\code-intelligence\uv-x86_64-pc-windows-msvc.zip -C C:\dev\Rotaris-crw-wt-loc1-liveevidence\apps\desktop\.cache\code-intelligence\uv-0.12.5-win32-x64 exited 128
tar: Cannot connect to C: resolve failed
```

`bundle.mjs` spawns a bare `tar`, and a shell started from Git Bash keeps Git's `/usr/bin` ahead of `C:\Windows\System32` on
`PATH`, so the `tar` found is GNU tar, which reads the `C:` of a Windows path as a remote host — the shape
[`fixed/two-store-cases-pack-their-artifact-with-whichever-tar-path-finds-first.md`](fixed/two-store-cases-pack-their-artifact-with-whichever-tar-path-finds-first.md)
repaired for two store tests (the product's own backup names `C:\Windows\System32\tar.exe`). The same command with
`PATH=/c/Windows/System32:$PATH` before it built the bundle in 41 s. Every agent of an orchestrated build on this host works in
Git Bash, and the brief's live-run and acceptance steps run `pnpm code-intel:bundle` there, so each fresh tree meets it.

**Seen again** the same day in `C:/dev/Rotaris-crw-wt-loc1-proofcwd` at `0d89e971` (plan `loc1`'s `proof-cwd` bundle,
which recorded it as a second note; its reviewer folded that note into this one when the rebase met both): the same
refusal, and with `C:\Windows\System32` first on `PATH` the bundle built in 39,977 ms. The path is reached only when the
cache holds no pinned uv and the uv on `PATH` is not the pin (0.11.29 on `PATH` there, the pin 0.12.5), which is the case
on a fresh worktree of this host.

## Specs

None contradicted: a defect of the build script, not of the product (`backup.ts` names the Windows binary).

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — `run('tar', ['-xf', archive, '-C', dir])` in uv's extraction.
- `packages/store/src/backup.ts` — `tarBin`, the binary the product names on Windows.
