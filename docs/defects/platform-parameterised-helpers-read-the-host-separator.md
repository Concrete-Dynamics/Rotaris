## Platform-parameterised helpers read the host's path separator, not the platform they were given

Five functions take a `NodeJS.Platform` as a parameter and then answer with `node:path`'s **host-bound**
exports. The parameter decides the *rule* — `%LOCALAPPDATA%` versus XDG, PATHEXT versus none, the
case-insensitive directory comparison, which discovery file is read — but `join`, `resolve`, `sep`,
`dirname`, `normalize` and `delimiter` all come from whatever machine is running the code. A caller asking
for Windows's answer therefore gets Windows's answer only while it is already running on Windows.

- `resolveUserDirs({ platform: 'win32', … })` returned `C:\U\me\AppData\Local/rotaris/config` on a POSIX
  host — a path no Windows machine would ever spell.
- `canonicalPath(p, 'win32')` / `pathKey` / `workspaceKey` / `composerDraftKey` resolved a Windows spelling
  with the POSIX resolver, so `C:\ws\alpha` and `c:/ws/ALPHA/` — one directory under the rule the function
  states — hashed to two different workspace keys.
- `findExecutable(cmd, env, 'win32')` split a Windows `PATH` on `:` rather than `;`, cutting every entry at
  its drive letter.
- `readDiscoveryFiles({ platform: 'win32', … })` resolved an `envFile` relative to the declaring file with
  the POSIX resolver, so the file was looked for at a path the declaring machine never wrote, and the
  server's environment silently lost every variable the file held.
- `resolvePreferenceRoot({ platform: 'win32', … })` built `%LOCALAPPDATA%\Rotaris\Rotaris` with POSIX
  separators. This one broke no test — its proof compared the answer against the *host's* `join` too, so
  the assertion agreed with the code on every machine while proving nothing about Windows on any of them.

This is the **same class** as the defect the OS-level confinement first execution recorded on 2026-09-15 —
"`node:path`'s `join` rewrote the separator in the shared specification" — found in four more places, and in
the opposite direction: that one was found on Windows, these on Linux.

It is latent in production, where the parameter is always `process.platform` and the two therefore agree.
It is not latent in the corpus: it makes every requirement these functions implement decidable only on one
operating system, which is exactly what naming the platform was supposed to stop.

## Specs

- `REQ-STARTUP-145` — the per-user directories, whose Windows half says both live under the LOCAL profile.
- `REQ-MCP-037` — one PATH-lookup rule for every surface, PATHEXT included.
- `REQ-MCP-021` — an `envFile` is resolved relative to the declaring file.
- `REQ-CHAT-015` / `REQ-SHELL-159` — one workspace typed two ways is one composer draft.
- Constraint W-27 / ADR-0058 rule 6 — the store resolves to exactly one canonical spelling.

## Relevant files

- `packages/platform/src/dirs.ts` — `resolveUserDirs`.
- `packages/platform/src/canonical.ts` — `canonicalPath`, `samePath`, `pathKey`.
- `packages/platform/src/preferences.ts` — `resolvePreferenceRoot` (and `workspaceKey`/`composerDraftKey`,
  which reach the defect through `pathKey`).
- `packages/platform/src/spawn.ts` — `findExecutable`'s PATH separator. Note that `join` and `isAbsolute`
  here must stay the **host's**: what is `stat`ed is the host's own filesystem however the PATH was spelled.
- `packages/config/src/mcp/discovery-files.ts` — `discoveryLocations`, `readOneFile`, `readDiscoveryFiles`.
- `packages/platform/src/platform.test.ts`, `packages/config/src/mcp/mcp.test.ts` — the proofs that only
  ever passed because the test and the code shared the host's separator.
