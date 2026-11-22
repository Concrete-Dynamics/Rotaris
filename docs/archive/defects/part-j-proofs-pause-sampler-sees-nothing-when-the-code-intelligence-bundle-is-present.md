## part-j-proof's pause sampler sees nothing when the code-intelligence bundle is present

`part-j-proof`'s pause scenario samples the session store from a worker thread every 50 ms and fails with
`the sampler saw no active continued run: []` — not one sample, so the worker never opened the store during the launch.
It fails only in a tree that holds the built code-intelligence bundle (`apps/desktop/resources/code-intelligence/`):

- `main` at `de8168ab` in the primary checkout, bundle present: red.
- `feat/r-121-configure-tool` at `de941a0c` in its landing tree, bundle present: red, alone and beside the others.
- the same commit and tree with the bundle moved aside: green; the same commit in a tree that never had it: green.

The store files the worker looks for are there after the run (one `workspace.db`, with `-wal` and `-shm`), and the
worker's three queries answer by hand against them, so the likely cause is a launch-time difference the bundle makes —
the project setup it lets run (create, index, memory) — that keeps the worker from finding exactly one store with its
`-shm` while the paused and continued runs happen, or that changes their timing past the sampler. Not investigated
further. Found 2026-11-22 while landing R-121; `pnpm worktree:land` builds the bundle into its landing tree whenever a
diff names `code-intel-proof` or `init-proof`, which is when this proof turns red there.

**Repaired 2026-11-22.** The cause was the instrument's handle, not the store's count: the worker's read-only handle,
opened once the store and its `-shm` were there, failed every later read with `disk I/O error` (instrumented run: every
sample `{"err":"disk I/O error","db":true}`, exactly one `workspace.db` found). With the bundle present the launch
recycles the store's `-wal`/`-shm` while the runs happen, and the sampler swallowed the error and kept the dead handle.
It now drops the handle on any failed reading and opens the store afresh on the next tick. `part-j-proof` with the
bundle present: red before, green after (all scenarios, the pause's sampled lock included).

## Specs

None contradicted by the product as far as is known: the proof's own instrument sees nothing, so it judges nothing. The
check it carries is REQ-SESSION's lock held by the continued run (the scenario's comment in `part-j-proof.mjs`).

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — `sampleStore` (the worker, `found.length === 1 && existsSync(... '-shm')`)
  and the pause scenario's assertion at "the sampler saw no active continued run".
- `apps/desktop/resources/code-intelligence/` — the bundle whose presence turns it red.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — the precondition that brings the bundle into a landing tree.
