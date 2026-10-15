## Two store cases pack their artifact with whichever tar PATH finds first

**Repaired 2026-10-15** (the owner's ruling that day for the Windows ARM64 session: repair the test-side defects). Both
cases now pack with the binary the product's own backup uses (`C:\Windows\System32\tar.exe` on Windows, `tar` elsewhere),
and are green in a run launched from Git Bash.

Found 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, at `c06115a1`, in a full suite and a
lone `store.test.ts` launched from pwsh started by Git Bash: OQ-265's "a staging store that fails quick_check …" and
OQ-266's "an origin.txt that cannot be written (step 9a) …" each re-pack a backup with `spawnSync('tar', ['-cf', <path>, …])`
and expect status 0; they read **128**. A shell started from Git Bash keeps Git's `/usr/bin` ahead of `C:\Windows\System32` on
`PATH`, so `tar` is GNU tar, which reads the `C:` of a Windows path as a remote host. Launched from Windows PowerShell or
pwsh started on its own, `tar` is Windows' own bsdtar and the same cases pass (every earlier run of the session). The
product is not affected: `backup.ts` names `C:\Windows\System32\tar.exe` on Windows (`tarBin`).

## Specs

None: a test that depends on the shell that launched it. It matters because `pnpm check` from Git Bash, the shell Claude
Code's own tool and many Windows developers use, was red on it.

## Relevant files

- `packages/store/src/store.test.ts` — the two `spawnSync('tar', …)` calls (`corruptArtifact` and the origin.txt case).
- `packages/store/src/backup.ts` — `tarBin`, the product's choice.
