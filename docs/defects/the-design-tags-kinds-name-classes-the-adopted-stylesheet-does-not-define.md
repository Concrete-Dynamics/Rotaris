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
(`fixed/the-improvement-label-is-clipped-without-an-ellipsis.md`). That repair spells the classes at the call site, as
the other callers do, and paints the dot with the tag's ink in `shell.css`. The component API is left as it stands.

Recorded, not repaired: noticed 2026-09-29 while repairing L10 under R-067. The repair would map `kind` to the
language's tone names (`running` → `tag-run`, `waiting` → `tag-wait`, `danger` → `tag-fail`), decide `info`, give
`StatusDot` a colour per kind, and either merge a caller's class with the foundation or reject `kind` beside a
class. `tools/check-ui-language.mjs` is the place to pin it.

## Specs

None contradicted directly. The adopted design language (`docs/design/README.md` §2, §7) is what the component claims to
draw, and for these kinds it draws nothing.

## Relevant files

- `packages/ui/src/design-system/core.tsx`: `TagKind`, `Tag`, `StatusKind`, `StatusDot`.
- `packages/ui/src/design-system/shared.ts`: `componentClass`, where a caller's class replaces the foundation.
- `docs/design/system/components.css`: the tones the language defines (`.tag-run`, `.tag-wait`, `.tag-fail`, …) and `.status-dot`, which has no colour.
