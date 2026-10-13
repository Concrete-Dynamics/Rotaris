## A handed-over launch can leave the private socket directory behind

On Linux and macOS, where neither `XDG_RUNTIME_DIR` nor the data directory can hold the hand-over socket, `socketDirectoryFor`
(`packages/platform/src/instance.ts`) creates the private `rotaris-<uid>` directory below the temporary directory with
`mkdirSync` before the claim, and nothing ever removes it. A launch that then loses the claim and hands over closes and unlinks
its socket (`closeEndpoint`) but leaves the directory it made: the one thing a handed-over launch writes that outlives it.
Read from the code by both advocates of OQ-248's ruling (R-072, 2026-10-13); recorded by fin36 before the repair.

## Specs

- REQ-STARTUP-164: "a launch SHALL write nothing but the record itself while resolving it"; REQ-STARTUP-162: a handed-over
  launch writes nothing to any per-user state. OQ-248's ruling reads the record as the file and the endpoint it names,
  together with what an attempt creates to hold that endpoint, removed when the attempt loses; a directory shared by every
  launch and never removed is not that.

## Relevant files

- `packages/platform/src/instance.ts`: `socketDirectoryCandidates`, `preparedSocketDirectory`, `socketDirectoryFor`,
  `closeEndpoint`, `closerFor`.
- `packages/platform/src/instance-order.test.ts`: the losing launch's case, which checks the socket only.
