## The proofs of the platform-parameterised helpers read the host's separator, not the platform they name

The repair recorded in [`platform-parameterised-helpers-read-the-host-separator.md`](../platform-parameterised-helpers-read-the-host-separator.md)
made five helpers answer with the separator the **platform parameter** names. Two of the assertions that
measure them still build their expectation, or their input, from `node:path`'s **host-bound** exports, so the
proof asks for one platform's rule and compares against another's spelling. Both were green on Linux, where
the host and the parameter happen to agree, and red the first time the suite ran on Windows after the merge
of 2026-09-16:

- `resolveUserDirs({ platform: 'linux', … })` was compared against `join('/x/cfg', 'rotaris')`. On Windows
  `join` answers `\x\cfg\rotaris`, so the assertion disagreed with the *repaired* code: the corrected
  `/x/cfg/rotaris` was read as the failure.
- `findExecutable('npx', env, 'linux')` was given a `PATH` holding the host's own temporary directory. On
  Windows that entry carries a drive letter, and the POSIX rule splits `PATH` on `:` — so the one directory
  in it was cut at `C`, the lookup found nothing, and the leg answered `null`.

This is the same class as the defect above, found in the instrument rather than in the code: an assertion
written with the host's spelling makes the requirement decidable on one operating system only, which is
exactly what passing the platform as a parameter was supposed to stop.

## Specs

- `REQ-STARTUP-145` — the per-user directories, whose Linux half is the XDG variables.
- `REQ-MCP-037` — one PATH-lookup rule for every surface, PATHEXT included.

## Relevant files

- `packages/platform/src/platform.test.ts` — both assertions. The XDG expectation is now spelled as the
  parameter spells it; the POSIX lookup leg runs where the host can spell a `PATH` that rule accepts.
- `packages/platform/src/dirs.ts`, `packages/platform/src/spawn.ts` — the repaired helpers, unchanged here.

**Repaired 2026-09-16**, in the merge that first ran the cross-platform work on a Windows host.
