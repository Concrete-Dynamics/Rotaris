## `code-intel-proof` names the Windows Electron binary alone, so it cannot launch off Windows

`apps/desktop/scripts/code-intel-proof.mjs` resolved the Electron executable as
`join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')` with no platform branch, where every other proof and
`scripts/lib/harness.mjs`'s `electron` choose `electron.exe` on win32 and `electron` elsewhere. Off Windows the file does
not exist, so the proof threw `Electron executable is absent` before its first launch, and none of ADR-0035's seven
sections was measured there. The proof's build step spawns `cmd.exe` unconditionally for the same reason (`--skip-build`
passes it), and its process sampler is PowerShell, which off Windows answers nothing and is caught.

Noticed 2026-09-28 while sweeping every script that spawns Electron for `hostSwitches` (R-062). Not run before the
repair: by reading, the spelling alone decides it.

## Specs

None contradicted by the product: the proof is evidence (`.claude/rules/tests-and-proofs.md`), and off Windows it
produced none for the requirements it stands for (REQ-MCP-033, REQ-MCP-036, REQ-MCP-037, REQ-MCP-099 among them).

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs`: the `electron` constant, the `cmd.exe` build step, the PowerShell sampler.
- `apps/desktop/scripts/lib/harness.mjs`: `electron`, the platform-aware spelling the proof now imports.

## Repaired — 2026-09-28, under R-062

The proof imports `electron` from the harness (the Windows spelling on win32, `electron` elsewhere) and passes
`hostSwitches` on its three Electron launches: the run-host launch, the branch's `spawn` and the exit-status `spawnSync`.
On the branch the switches sit **before** the token, the only place Chromium honours a switch (a bare `--` ends switch
parsing); the sentinel (`apps/desktop/src/main/sentinel.ts`) reads the token at a fixed index and so does not find it past
a switch, which is the same fact behind the open note
[`the-code-intelligence-server-dies-when-the-app-runs-as-root.md`](the-code-intelligence-server-dies-when-the-app-runs-as-root.md)
and is recorded on it; that repair is another item's. The build step and the sampler are left as they were: `--skip-build`
bypasses the first and the second is caught. Pinned by no unit test — the spelling is one constant — and measured by
attempting the proof on Linux as root (its outcome is in the R-062 report and `first-executions.md`'s row of 2026-09-28).
