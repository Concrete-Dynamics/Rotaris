## The product code holds four import cycles

Outcome: repaired on 2026-11-01 by bundle E1 of plan hrd2 (R-091, `hardening.md` §3.5 row 3), in the commit that turned
`import-x/no-cycle` on; the rule, at `maxDepth: Infinity` in `pnpm lint`, now fails any cycle, and
`tools/eslint-rules/rules.test.ts` holds the import rules to their findings. Each cycle was broken by moving the shared
piece into a module of its own, with the old module re-exporting it, so no importer outside the cycle changed:

- `packages/workspace/src/git/invoke.ts` imported `GIT_ENV_DENYLIST` and `GIT_NETWORK_SUBCOMMANDS` from the package's own
  barrel (`src/index.ts`), which re-exports `git/invoke.ts` and, through it, every module that imports the helper: the
  checkpoints, the repository, the view, the worktrees, the delivery runs, the improvement executor and the traceability
  compare, jobs, executor and worker (15 findings). The two constants now live in `git/invoke.ts`, beside the one helper
  that reads them; the barrel still exports them.
- `packages/engine/src/run/run.ts` imports `children/orchestration.ts`, which imported `withContextUnits` and
  `withPlaybook` back from `run.ts`. Both now live in `run/prompt-layers.ts`; `run.ts` imports and re-exports them.
- `packages/ui/src/agents.ts` imported `treeRows` from `AgentTree.tsx`, which imports `agents.ts`. `treeRows` and
  `TreeRow` now live in `agent-tree-rows.ts`; `AgentTree.tsx` re-exports them.
- `packages/ui/src/settings/SecurityPolicy.tsx` imported `Confirm` from `ConfigSettings.tsx`, which draws
  `SecurityPolicy`. `Confirm` now lives in `settings/Confirm.tsx`; `ConfigSettings.tsx` re-exports it.

None changed behaviour: an ES module cycle evaluates as long as no binding is read before its module has run, which held
for all four. What a cycle costs is the order of evaluation becoming a property of whichever module is entered first, a
hazard that grows with every edit inside it. Found by the first run of `import-x/no-cycle` (2026-11-01; Windows 11 ARM64,
Node 26.13.0, `eslint-plugin-import-x` 4.17.1), which reported 21 findings across the four.

## Specs

None. No requirement governs the import graph; the component view's allowed-edge matrix governs the edges between
packages, and none of the four crossed a package.

## Relevant files

- `packages/workspace/src/index.ts`, `packages/workspace/src/git/invoke.ts` — the constants moved.
- `packages/engine/src/run/run.ts`, `packages/engine/src/run/prompt-layers.ts`, `packages/engine/src/children/orchestration.ts`.
- `packages/ui/src/AgentTree.tsx`, `packages/ui/src/agent-tree-rows.ts`, `packages/ui/src/agents.ts`.
- `packages/ui/src/settings/ConfigSettings.tsx`, `packages/ui/src/settings/Confirm.tsx`, `packages/ui/src/settings/SecurityPolicy.tsx`.
- `eslint.config.js` — `import-x/no-cycle`.
