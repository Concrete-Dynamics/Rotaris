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

## Specs

REQ-STARTUP-164: a record naming a process that cannot be reached SHALL never leave the application unlaunchable, and every
path ends with exactly one instance running and a window on screen. A fallback another local user can deny is a path that does
not, on the hosts where the fallback is reached at all.

## Relevant files

- `packages/platform/src/instance.ts` — `socketDirectoryCandidates`, `preparedSocketDirectory`, `socketDirectoryFor`.
- `packages/platform/src/instance.test.ts` — the deep-directory case that reaches the fallback.
