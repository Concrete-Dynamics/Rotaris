## The bundle step extracts the pinned uv with whatever `tar` is first on PATH

The Windows ARM64 session's F2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, launched from Git Bash,
2026-10-21) ran `pnpm code-intel-proof --skip-build --steps=1` with the runtime renamed aside, to see the proof's red with no
runtime. The proof's `ensureBundle` ran `pnpm code-intel:bundle` first. With uv 0.11.29 first on PATH (not the pin), that step
took OQ-400 (c)'s path for the first time on an ARM64 host: it logged "no uv pinned for win32-arm64: the pinned win32-x64 uv is
used", downloaded the pinned `uv-x86_64-pc-windows-msvc.zip`, matched its sha256, and then refused:

```
[code-intel:bundle] REFUSED — uv could not be obtained: tar -xf <repo>\apps\desktop\.cache\code-intelligence\uv-x86_64-pc-windows-msvc.zip -C <repo>\apps\desktop\.cache\code-intelligence\uv-0.12.5-win32-x64 exited 12
tar: Cannot connect to C: resolve failed
```

`obtainUv` extracts with `run('tar', …)`, and `spawnSync('tar')` takes the first `tar` on PATH. In a Git for Windows shell
that is Git's GNU tar, which reads `C:\…` as `host:path` (a remote archive) and cannot extract a zip anyway; Windows' own
`%SystemRoot%\System32\tar.exe` (bsdtar, which reads zip) comes later on that PATH. The same build from PowerShell or cmd.exe
would find bsdtar first. So whether a Windows build machine can obtain the pinned uv depends on the shell it is started from.
The refusal is loud and nothing was installed, but the archive stays in the build cache and the bundle is not built.

The proof's red with the runtime absent is therefore this refusal (7 s), not the sentinel's exit 127 that the session's brief
expected: `ensureBundle` rebuilds a missing runtime before any launch.

## Specs

None in `docs/spec/` contradicted: the bundle step is a build tool. [OQ-400](../archive/architecture/open-questions/64-spikes-and-later-questions-31.md#oq-400) (c)'s
ruling, as [ADR-0035](../architecture/adr/0035-the-bundled-code-intelligence-runtime.md) "The bundle is built for the
artifact's architecture" records it: an ARM64 host "takes the pinned, hash-checked `win32-x64` uv". Under Git Bash it cannot.

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — `obtainUv`, the `run('tar', ['-xf', archive, '-C', dir])` call.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — `ensureBundle`, which runs the bundle step when a proof starts.
