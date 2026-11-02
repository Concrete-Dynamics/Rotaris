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

## Outcome

**Repaired 2026-09-28 under R-062.** What changed:

- `packages/ui/src/WindowControls.tsx` publishes `WINDOW_CONTROLS_LAYOUT` (`shell-window-controls`, the same one
  relation: `containment` in `shell-title`) through `layoutContractAttributes`, so the attribute is the relations array.
  `packages/ui/src/library/ProposalsTab.tsx` was the one other hand-written `data-ui-contract` in `packages/ui`: already
  an array, it now publishes the same two relations as `PROPOSALS_LAYOUT` through the same function.
- **The guard is the lint, not only a test:** `tools/ui-contract-publisher.mjs` (`handWrittenContracts`), run by
  `tools/check-ui-language.mjs` over both drawing roots — `packages/ui/src` with `design-system/` included, and
  `apps/desktop/src/renderer` — refuses a JSX `data-ui-contract` attribute, the string `'data-ui-contract'` (an object key
  spread into JSX, a `setAttribute`) and a `dataset.uiContract` write anywhere but
  `design-system/layout-contract.ts`. Reverting the controls to the hand-written object makes `node
  tools/check-ui-language.mjs` exit 1 naming `packages/ui/src/WindowControls.tsx:14 JSX attribute data-ui-contract`.
- `apps/desktop/scripts/ui-audit.mjs` reads every driver answer through `lib/audit-answer.mjs` (`readAuditAnswer`): the
  driver's `{ error }` becomes an **`AUDIT-ERROR`** finding with the view (or overlay), the size, the expression
  (`AUDIT` or `OVERLAY_AUDIT(<root>)`) and what the renderer threw, a screenshot is still taken, and the sweep moves on
  to the next view. Inside the page, a contract that parses but is not an array is marked for its own box
  (`contract is not a relations array`), which `evaluateContracts` reports as a `schema` finding instead of throwing.

Pinned by `packages/ui/src/window-controls.test.ts` ("publishes its layout contract as the relations array ui-audit
iterates", rendering the controls and `JSON.parse`-ing the attribute as an array), `packages/ui/src/library/library.test.ts`
(the Proposals contract), `tools/ui-contract-publisher.test.ts` (5 cases, the original object among them),
`apps/desktop/scripts/lib/audit-answer.test.ts` (4 cases, the `relations is not iterable` answer among them) and
`apps/desktop/scripts/lib/layout-relations.test.ts` (the non-array schema row).

Measured in the built app as root under Xvfb: `pnpm ui-audit --skip-build` over all seven views at 1400x900 and
1000x680 and the six overlays at both sizes wrote `report.json` with **0 findings**, 9 contracts evaluated per capture,
the controls measured at 132 x 43 inside the 1400 x 44 title bar. Two counterfactuals with the controls set back to the
object: with the in-page guard, view 7 reports one `schema` finding (`contract is not a relations array`) for
`shell-window-controls`; with the page's original sweep and the new reader, views 6 and 7 each report `AUDIT-ERROR`
`the renderer threw: TypeError: relations is not iterable` and `report.json` is still written. `pnpm ui-review
--skip-build --views=7` produced iteration 1's pack (0 deterministic findings, critic pending); the critic's reading was
not taken here.
