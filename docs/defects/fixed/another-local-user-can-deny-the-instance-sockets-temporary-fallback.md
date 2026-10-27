## Another local user can deny the instance socket's temporary fallback

Where neither `XDG_RUNTIME_DIR` nor the data directory can hold the hand-over socket (unset runtime directory, a home deep
enough that the socket's path exceeds the platform's limit), the claim falls back to a private `rotaris-<uid>` directory below
each temporary directory (`socketDirectoryCandidates`, `preparedSocketDirectory` in `packages/platform/src/instance.ts`). The
name is predictable, and a directory already there owned by someone else is refused, rightly, since whoever controls it
controls which socket a later launch connects to. But nothing else is tried: with `tmpdir()` being `/tmp` the two candidates
are one, so another local user who creates `/tmp/rotaris-<uid>` first leaves no candidate, the listen fails under the data
directory, and every launch is refused with exit 2 and no window. A per-attempt `mkdtemp` directory below the temporary
directory, named in the record as the endpoint already is, would leave nothing to pre-empt. Read from the code by fin30's
review; not measured here (one user on this host).


**Repaired 2026-10-13 (fin36), under [OQ-248](../../architecture/open-questions/53-spikes-and-later-questions-20.md#oq-248)'s ruling (R-072).** A
temporary-directory candidate is now the temporary directory itself (`socketDirectoryCandidates`, sized with the
`rotaris-XXXXXX/` component), and each claim attempt makes its own `0700` directory below it with `mkdtempSync`
(`placeSocket`, `packages/platform/src/instance.ts`), a name nobody can take first; the attempt's socket goes there, and the
directory is removed with the socket when the attempt loses or the instance closes. Pinned by `instance.test.ts`'s "a name
already taken below the temporary directory no longer denies the fallback" (a file standing at `rotaris-<uid>`, which another
local user could create: refused on the code before, claimed after) and the candidates' sizing case; and by `pnpm workspace-proof`'s scenario 13b, extended with two OQ-248 checks per launch (the instance's socket in a per-attempt directory and none left by the handed-over launch; the ended instance's directory removed): 63 passed, 0 failed, 2 skipped on the repaired build, twice, at a load of 1.3 to 3.6 on four CPUs; on the unrepaired build both launches failed the first (`/tmp/rotaris-0 (not a per-attempt private directory)`) and showed `/tmp/rotaris-0 still present` after the close.

## Specs

REQ-STARTUP-164: a record naming a process that cannot be reached SHALL never leave the application unlaunchable, and every
path ends with exactly one instance running and a window on screen. A fallback another local user can deny is a path that does
not, on the hosts where the fallback is reached at all.

## Relevant files

- `packages/platform/src/instance.ts` — `socketDirectoryCandidates`, `preparedSocketDirectory`, `socketDirectoryFor`.
- `packages/platform/src/instance.test.ts` — the deep-directory case that reaches the fallback.
