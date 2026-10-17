---
name: verify-plan
description: 'Local verification planner: given a diff, print the required gate, the complete affected proof suites, and the architecture documents to consult. Use whenever deciding which proofs to run, after editing product code, before a commit, when the user asks what to verify, which proofs a change needs, or "run the whole suite a part touches". Unmapped paths require explicit review — never treat them as no proofs. Run pnpm verify:plan rather than guessing from AGENTS.md.'
argument-hint: '[--files paths | --base=ref]'
---

# Verification planner

AGENTS.md's rule is to **run the whole suite a part touches**, not the one script named after the file. Do not reconstruct that list yourself — not from forty script headers, and not from the proof registry. Run the planner and follow it.

```
pnpm verify:plan
pnpm verify:plan --files packages/engine/src/run/run.ts
pnpm verify:plan --base=main --json
```

Default input is the working tree, index and untracked files against the merge-base with `main` (`origin/main` if `main` is missing). Git failures are errors, not an empty plan. Flags after `--files` stay flags.

## What to do with the output

1. **Gate** — `pnpm check` before each commit. The narrow tests are the fastest loop while editing; they do not replace the gate.
2. **Proofs** — run every listed `pnpm <area>-proof` after `pnpm build`. The planner already expanded to the complete suite. Do not drop a neighbour because the file's name matched a different script.
3. **Architecture** — read the named views before changing code; update them in the same commit when the change adds, removes or moves what they describe (`docs/architecture/views/README.md`).
4. **Review required** — stop guessing. An unmapped path, or a shared seam (contracts, run-host dispatch, design-system), is not "no proofs". Name the suites in writing before skipping any. `--strict` exits 2 when this section is present.
5. **Notes** — `live-run` and `slice-proof` are never automatic. Do not add them because a path looked related.

The map lives in `tools/verify-plan/map.mjs`. A new proof script that is not in an area fails `pnpm test` (`plan.test.ts`, "the map stays honest"). Add the path there in the same commit as the script.

This skill does not run the proofs. It decides which ones are owed.
