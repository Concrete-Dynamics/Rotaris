## A CONTRACT finding in ui-audit is filed under its relation's kind, not under CONTRACT

`apps/desktop/scripts/ui-audit.mjs`'s `note(kind, view, size, detail)` builds each finding as
`{ kind, view, size, ...detail }`, so a `detail` carrying its own `kind` overwrites the finding's. Every row
`evaluateContracts` returns carries the relation's `kind` (`containment`, `align-x`, `schema`, …), so a failing contract
is printed on the console as `CONTRACT` but written to `report.json` as `kind: "containment"` (or whichever relation
failed), and the summary line and `ui-review`'s `manifest.json` (`deterministic.byKind`) count it under that relation
kind. A critic or a script reading `report.json` for `CONTRACT` findings finds none, and a contract failure can be
confused with the unrelated whole-document CONTAINMENT sweep, whose kind differs from `containment` by case alone.

Found 2026-09-28 while repairing the window controls' contract (R-062): the counterfactual audit with the old
object contract printed `CONTRACT    Settings @ 1400x900 — {"id":"shell-window-controls","kind":"schema",…}` and summed
it as `1 finding(s) {"schema":1}`. Recorded, not repaired — outside that item. The repair's shape: spread `detail`
first and set `kind` last, carrying the relation's kind under another key (`relation`).

## Specs

None contradicted directly. It weakens the deterministic evidence `docs/design/README.md` §7 and
`docs/architecture/views/04-seams.md` §8 step 6 rely on: the pack's own index files a contract failure under the wrong
name.

## Relevant files

- `apps/desktop/scripts/ui-audit.mjs` — `note`, and the CONTRACTS call site that passes `evaluateContracts`' row as `detail`.
- `apps/desktop/scripts/lib/layout-relations.mjs` — `evaluateContracts`, whose rows carry the relation's `kind`.
- `apps/desktop/scripts/ui-review.mjs` — `byKind` in `manifest.json`, which inherits the mislabel.

## Outcome

Repaired 2026-09-29 under R-067, in the shape the note proposed. `ui-audit.mjs`'s `note` now builds each finding
through `auditFinding` in `apps/desktop/scripts/lib/audit-finding.mjs`: the measured detail is spread first, the
sweep's `kind`, the view and the size are set after it, and a detail's own `kind` is carried as `relation`. The summary
line and `ui-review.mjs`'s `manifest.json` count through the same module's `countByKind`, and the manifest gains
`deterministic.contractsByRelation`, the contract failures counted per relation that failed.

Pinned by `apps/desktop/scripts/lib/audit-finding.test.ts` (4 cases, all 4 failing on the old `{ kind, view, size,
...detail }` shape): the R-062 counterfactual's `schema` row filed as `CONTRACT` with `relation: "schema"`; a failing
`containment` relation filed apart from the whole-document `CONTAINMENT` sweep; a detail never renaming the view or the
size; the counts by sweep and by relation. Measured in the built app with a counterfactual contract (the window
controls' containment pointed at `shell-status`, reverted before the commit) under
`pnpm ui-review --iteration=1 --skip-build --views=1,7 --sizes=1400x900`: with the old `note` the pack summed
`2 finding(s) {"containment":2}` and the manifest `byKind: {"containment":2}`; with the repair
`2 finding(s) {"CONTRACT":2}`, `byKind: {"CONTRACT":2}`, `contractsByRelation: {"containment":2}`, and each
`report.json` row reads `"kind":"CONTRACT","relation":"containment"`.
