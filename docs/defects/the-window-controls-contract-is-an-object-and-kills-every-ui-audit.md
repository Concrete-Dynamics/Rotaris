## The window controls' layout contract is an object, and every UI audit dies on it

`packages/ui/src/WindowControls.tsx` writes its `data-ui-contract` by hand as
`{"relations":[{"kind":"containment","target":"shell-title"}]}` — an object with a `relations` key — where
`layoutContractAttributes` (`packages/ui/src/design-system/layout-contract.ts`) publishes the relations **array**
itself and `apps/desktop/scripts/ui-audit.mjs` (the CONTRACTS sweep, `for (const relation of relations)`) reads an
array. In the renderer the sweep throws `TypeError: relations is not iterable` on the first view carrying the title
bar; the driver's `eval` answers a thrown expression with `{ error }`, and `ui-audit` then `JSON.parse`s that object
(`"[object Object]" is not valid JSON`) and exits 1 before writing `report.json`. So `pnpm ui-audit` and
`pnpm ui-review` produce no evidence pack on this tree for any view, and the critic has nothing to read.

Found 2026-09-28 running `pnpm ui-review --views=7` as root under Xvfb for R-062's About caption; reproduced by
driving the built app to Settings and evaluating the audit expression (`relations is not iterable`), then listing every
`[data-ui-contract]` whose value is not an array: exactly one, `shell-window-controls`. Recorded, not repaired — outside
the item.

## Specs

None contradicted directly. The audit is the deterministic guard `docs/architecture/views/04-seams.md` §8 step 6 and
`.claude/rules/ui-surfaces.md` name for every drawn surface, so while it dies the "match after drawing" obligation of
`docs/design/README.md` §7 has no deterministic evidence behind it.

## Relevant files

- `packages/ui/src/WindowControls.tsx` — the hand-written `data-ui-contract` (object, not array).
- `packages/ui/src/design-system/layout-contract.ts` — `layoutContractAttributes`, the one publisher the rule asks for.
- `apps/desktop/scripts/ui-audit.mjs` — the CONTRACTS sweep that iterates the parsed value, and the `JSON.parse` of the
  driver's `{ error }` answer at the audit's call site, which turns a renderer exception into a JSON error.
- `apps/desktop/scripts/lib/layout-relations.mjs` — `evaluateContracts`, which decides over the measured rows.
