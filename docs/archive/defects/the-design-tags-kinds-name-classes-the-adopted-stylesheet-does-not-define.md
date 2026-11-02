## Half the design Tag's kinds name classes that the adopted stylesheet does not define, and the StatusDot's `kind` paints nothing

`Tag` in `packages/ui/src/design-system/core.tsx` maps `kind` to `tag-${kind}`. Four of its eight kinds have no rule in
the adopted `docs/design/system/components.css`: `running`, `waiting`, `danger` and `info`. The language's tones
are `tag-run`, `tag-wait` and `tag-fail`, and it has no info tone at all. `StatusDot` writes
`data-kind={kind}`, and no stylesheet reads that attribute, so a bare `StatusDot` has no background and draws nothing.
There is also a trap: a `className` given to `Tag` **replaces** the `tag tag-<kind>` foundation (`componentClass` in
`shared.ts`), so `kind` has no effect whenever a class is passed. That is why every other caller spells
`className="tag tag-…"` by hand.

The one caller that relied on `kind` was the improvement indicator (`ImprovementActivity.tsx`). It rendered as an
unstyled span in the body type with an invisible dot, which was part of live-run finding L10
(`the-improvement-label-is-clipped-without-an-ellipsis.md`). That repair spells the classes at the call site, as
the other callers do, and paints the dot with the tag's ink in `shell.css`. The component API is left as it stands.

Recorded, not repaired: noticed 2026-09-29 while repairing L10 under R-067. The repair would map `kind` to the
language's tone names (`running` → `tag-run`, `waiting` → `tag-wait`, `danger` → `tag-fail`), decide `info`, give
`StatusDot` a colour per kind, and either merge a caller's class with the foundation or reject `kind` beside a
class. `tools/check-ui-language.mjs` is the place to pin it.

**Outcome.** Repaired 2026-10-01 under R-067 (acceptance finding A40). Confirmed first on the branch: the cases below
were red, `Tag` with a `className` rendered the class alone, and `StatusDot` wrote `data-kind`, which no stylesheet reads.
The repair takes the design components' own API (`docs/design/system/components/core/Tag.d.ts`, `StatusDot.d.ts`):

- `Tag`'s kinds are the design Tag's seven, each a tone `components.css` defines (`TAG_KINDS`: `accent`, `neutral`,
  `outline`, `run`, `wait`, `done`, `fail`). `info` is dropped, since the language has no info tone for a tag. A
  `className` now joins `tag tag-<kind>` as the design Tag composes them, `kind` defaulting to `neutral`.
- Every caller names its tone by `kind` and keeps only its own classes, in thirty-one places. Most render the classes
  they rendered before. The changes are these. `ProposalsTab`'s high-risk tag spelled `tag-failure`, which no stylesheet
  defines, so a high-risk proposal drew a bare tag; it is `fail` now. The Overview's `tag-outline tag-wait`, where the
  sheet's order made `wait` paint, is `wait`. The Session Browser's bare "awaiting input" tag draws `neutral`. Its "stale"
  tag is `outline` under its own warn colour and border, which it drew before.
- `tools/check-ui-language.mjs` (`pnpm lint`) refuses a `Tag` or `DesignTag` whose class spells `tag` or a `tag-` tone,
  static or in a template. Run against a scratch file spelling `tag tag-accent` and `` `tag tag-${…}` ``, it failed naming
  both. `tools/migrate-ui-primitives.mjs` still renames the element only and says so.
- `StatusDot` takes the design StatusDot's states (`STATUS_DOT_STATES`: `run`, `wait`, `done`, `fail`, `ok`, `warn`,
  `idle`, defaulting to `idle`) and writes `data-state`. `shell.css` paints each from its token, `idle` from
  `--rt-info-500` as `docs/design/README.md` §4.1 resolves it. The rule is written `.status-dot:where([data-state=…])`
  so it stays at `.status-dot`'s own specificity, and a surface that paints its dot otherwise still does. That is the
  run header's and the improvement indicator's tag ink, which the L10 repair chose.

`componentClass` is unchanged. `Card`, `Input`, `TextArea`, `Select` and `SendPill` still let a specialised class replace
their foundation, as `01-component-view.md` records.

Pinned by three cases in `packages/ui/src/design-system/design-system.test.ts` ("Tag and StatusDot draw the language's
tones"), red before the repair. They check that every kind is a tone `components.css` defines, that a class joins the
foundation, and that every state has its paint rule in `shell.css`. `improvement-activity.test.ts` still reads
`class="tag tag-run improvement-activity …"`. Shown in the built app by three new checks in `pnpm retrospective-proof`
(`node apps/desktop/scripts/retrospective-proof.mjs --skip-build` under Xvfb, Node 24, 2026-10-01, 36 of 36 checks passing).
The run-header indicator's dot writes `data-state=run` and no `data-kind`, painted `oklch(0.89 0.088 165)`, the tag's
ink. Every design Tag on the Proposals tab and on the Overview carries `tag` and one tone the loaded stylesheets define
(`low` → `tag-neutral`; `2 new` → `tag-accent`; `pending` → `tag-outline`). The dot check would have failed before the
repair, where the dot wrote `data-kind="running"` and no state; that was read from the code, not run.

## Specs

None contradicted directly. The adopted design language (`docs/design/README.md` §2, §7) is what the component claims to
draw, and for these kinds it draws nothing.

## Relevant files

- `packages/ui/src/design-system/core.tsx`: `TagKind`, `Tag`, `StatusKind`, `StatusDot`.
- `packages/ui/src/design-system/shared.ts`: `componentClass`, where a caller's class replaces the foundation.
- `docs/design/system/components.css`: the tones the language defines (`.tag-run`, `.tag-wait`, `.tag-fail`, …) and `.status-dot`, which has no colour.
