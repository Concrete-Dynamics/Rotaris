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

## Specs

None contradicted by the product as far as is known: the proof's own instrument sees nothing, so it judges nothing. The
check it carries is REQ-SESSION's lock held by the continued run (the scenario's comment in `part-j-proof.mjs`).

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — `sampleStore` (the worker, `found.length === 1 && existsSync(... '-shm')`)
  and the pause scenario's assertion at "the sampler saw no active continued run".
- `apps/desktop/resources/code-intelligence/` — the bundle whose presence turns it red.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — the precondition that brings the bundle into a landing tree.
