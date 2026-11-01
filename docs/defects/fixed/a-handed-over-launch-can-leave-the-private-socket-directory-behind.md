## A handed-over launch can leave the private socket directory behind

On Linux and macOS, where neither `XDG_RUNTIME_DIR` nor the data directory can hold the hand-over socket, `socketDirectoryFor`
(`packages/platform/src/instance.ts`) creates the private `rotaris-<uid>` directory below the temporary directory with
`mkdirSync` before the claim, and nothing ever removes it. A launch that then loses the claim and hands over closes and unlinks
its socket (`closeEndpoint`) but leaves the directory it made: the one thing a handed-over launch writes that outlives it.
Read from the code by both advocates of OQ-248's ruling (R-072, 2026-10-13); recorded by fin36 before the repair.


**Repaired 2026-10-13 (fin36), under [OQ-248](../../archive/architecture/open-questions/53-spikes-and-later-questions-20.md#oq-248)'s ruling (R-072).** The
private directory is made per attempt (`placeSocket`) and removed by `closeEndpoint` (`rmdirSync`, never recursive) when the
attempt loses, so a handed-over launch leaves nothing behind; the instance's closer removes its own the same way. Pinned by
`instance-order.test.ts`'s "on the temporary-directory fallback a handed-over launch leaves nothing behind" (red on the code
before: `rotaris-0` left after the close) and by `pnpm workspace-proof`'s scenario 13b, extended with two OQ-248 checks per launch (the instance's socket in a per-attempt directory and none left by the handed-over launch; the ended instance's directory removed): 63 passed, 0 failed, 2 skipped on the repaired build, twice, at a load of 1.3 to 3.6 on four CPUs; on the unrepaired build both launches failed the first (`/tmp/rotaris-0 (not a per-attempt private directory)`) and showed `/tmp/rotaris-0 still present` after the close.

## Specs

- REQ-STARTUP-164: "a launch SHALL write nothing but the record itself while resolving it"; REQ-STARTUP-162: a handed-over
  launch writes nothing to any per-user state. OQ-248's ruling reads the record as the file and the endpoint it names,
  together with what an attempt creates to hold that endpoint, removed when the attempt loses; a directory shared by every
  launch and never removed is not that.

## Relevant files

- `packages/platform/src/instance.ts`: `socketDirectoryCandidates`, `preparedSocketDirectory`, `socketDirectoryFor`,
  `closeEndpoint`, `closerFor`.
- `packages/platform/src/instance-order.test.ts`: the losing launch's case, which checks the socket only.
