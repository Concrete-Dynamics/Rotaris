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

**Repaired 2026-09-19, in part** (branch `fix-r3-proof-isolation-separators`): the five named helpers already
took the platform and now spell by it — verified above — but the audit found the same class in four places
beside them, repaired here: `dataLayout` takes the platform and joins by it (was host-bound `join`, so a
Windows answer asked off Windows carried POSIX separators); `PreferenceStore` takes the platform for its
one path; `environmentWithout` folds case by the parameter rather than the host; and `canonicalPath` no
longer resolves a foreign-platform spelling through the host's own `realpathSync` — the fold (separators,
case) is the cross-platform rule, existence stays the host's to know. `spawn.ts`'s `join`/`isAbsolute`
and `discovery-files.ts` stay as the note describes: what is `stat`ed is the host's own filesystem.
Measured: new `platform.test.ts` cases (Windows sub-locations spelled by `win32`, cross-platform fold,
`environmentWithout` per parameter), exact-spelling assertions replacing the two `startsWith` checks, and
the full `platform` + `config/src/mcp` suites green. **Not closed**: "decidable on every platform" still
needs a POSIX run of the suite — argued here, measured on Windows.

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

## Repaired — 2026-09-22

**Three more instances of the same class, found by sweeping for it rather than by reading around the
five the note names.** `tools/` has no gate for this, so the sweep was a script: every function whose
signature takes a `NodeJS.Platform` and whose file imports a host-bound `node:path` export, then each
hit read by hand against the rule "the separator this function ADDS follows the parameter; what is
`stat`ed stays the host's". Four hits, three of them defects:

- `endpointFor` (`packages/platform/src/instance.ts`) joined the unix-socket path with the host's
  `join`, so a POSIX endpoint asked on Windows came back `…\instance-4242-ab12cd34.sock` — a name no
  POSIX machine can bind. The directory the caller passes is **not** rewritten: a backslash is a legal
  character in a POSIX file name, and correcting the caller's spelling would corrupt a path this
  function cannot know is wrong.
- `findShell` (`packages/agent-tools/src/terminal/index.ts`) split the Windows `PATH` on `delimiter`,
  which is `:` off Windows — every entry cut at its drive letter. The branch already knows the platform,
  so it is now `;` by the branch. `join` below it stays the host's, for the reason `findExecutable`
  states.
- `resolvedPath` (`packages/workspace/src/git/paths.ts`) resolved lexically with the host's `resolve`,
  so `C:\ws\alpha` asked on a POSIX host came back prefixed with that host's working directory
  (`/home/me/c:/ws/alpha`) and `REQ-GIT-106`'s "joined by RESOLVED path" was decidable on Windows alone.
  It now takes the parameter's resolver and attempts `realpathSync` only when the two agree — the same
  split `canonicalPath` already makes, and for the same reason.

The fourth hit, `findExecutable`'s own `join`/`isAbsolute`, is the documented exception and is unchanged.

**Two of the three are measured here, by a test that fails against the code as it was.** Reverting
`instance.ts` turns the new case red with `expected '\run\user\1000\instance-4242-384e3dcf…' to match
/^\/run\/user\/1000\/…/`; reverting `paths.ts` turns its case red with `expected 'D:/srv/ws/Alpha' to be
'/srv/ws/Alpha'` — the Windows host's own drive letter on a POSIX path. Both assertions ask this host for
the FOREIGN platform's answer, which is the direction that is decidable from either side.

**`findShell`'s is not, and that is stated rather than papered over.** Its defect is a `:` where a `;`
belongs, and `delimiter` on a Windows host already evaluates to `;` — so no assertion written here can
tell the repaired code from the defective code. The new case builds two real directories and one
`;`-separated PATH, which decides the rule on either operating system and will fail on a POSIX host if
the split ever regresses. On this host it passes for the same reason the defect was invisible.

Measured: `packages/platform/src/platform.test.ts` (26 passed), `packages/workspace/src/git/view.test.ts`,
`packages/agent-tools/src/terminal/terminal.test.ts`. The "decidable on every platform" claim the note
left open is now true of every assertion that CAN be decided from one side; the residue is one test that
needs a POSIX host to be worth anything, and it is written and waiting (IC-3).
