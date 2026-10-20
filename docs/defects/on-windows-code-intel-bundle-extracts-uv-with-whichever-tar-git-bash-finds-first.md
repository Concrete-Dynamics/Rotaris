## On Windows, `pnpm code-intel:bundle` extracts the downloaded uv with whichever `tar` Git Bash finds first

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-proofcwd` at `0d89e971`. Recorded, not repaired, by plan `loc1`'s `proof-cwd` bundle
(2026-10-20), which met it while building the bundle before a proof.

`pnpm code-intel:bundle`, run from a Git Bash shell in a fresh worktree, failed with exit 1:

```
[code-intel:bundle] uv on PATH is 0.11.29, the pin is 0.12.5: downloading https://github.com/astral-sh/uv/releases/download/0.12.5/uv-x86_64-pc-windows-msvc.zip
[code-intel:bundle] REFUSED — uv could not be obtained: tar -xf C:\…\apps\desktop\.cache\code-intelligence\uv-x86_64-pc-windows-msvc.zip -C C:\…\apps\desktop\.cache\code-intelligence\uv-0.12.5-win32-x64 exited 128
tar: Cannot connect to C: resolve failed
```

`obtainUv` downloads the pinned uv when the one on `PATH` is not the pin, then runs `tar -xf <archive> -C <dir>` by bare
name. A shell started from Git Bash keeps Git's `/usr/bin` ahead of `C:\Windows\System32` on `PATH`, so `tar` is GNU tar,
which reads the `C:` of a Windows path as a remote host. The same command with `C:\Windows\System32` first on `PATH`
(`PATH="/c/Windows/System32:$PATH" pnpm code-intel:bundle`) built the bundle in 39,977 ms. It is the class of the repaired
[`two-store-cases-pack-their-artifact-with-whichever-tar-path-finds-first.md`](fixed/two-store-cases-pack-their-artifact-with-whichever-tar-path-finds-first.md),
in the build tool rather than a test: the product's own backup names `C:\Windows\System32\tar.exe` on Windows (`tarBin`).

The path is reached only when the cache has no pinned uv and the uv on `PATH` differs from the pin, which is the case on
a fresh worktree of this host (uv 0.11.29 on `PATH`, pin 0.12.5). The brief and `AGENTS.md` both ask for
`pnpm code-intel:bundle` in a tree before a proof or a live run, and agents here run it from Git Bash.

## Specs

None is contradicted: a build tool that depends on the shell that launched it. It matters because the bundle is a
precondition of `code-intel-proof`, of the live runs and of any launch that sets up code intelligence.

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs`, `obtainUv`: `run('tar', ['-xf', archive, '-C', dir])`.
- `packages/store/src/backup.ts`, `tarBin`: the product's choice of `tar` on Windows.
