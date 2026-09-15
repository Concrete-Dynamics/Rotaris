## The role gutter asks to be truncated with an ellipsis and instead wraps, because the rule that makes an ellipsis possible is missing

`.row__role` in `shell.css` reads:

```css
.row__role { font-size: …; font-weight: …; letter-spacing: …; text-transform: uppercase;
             color: var(--rt-accent-300); overflow: hidden; text-overflow: ellipsis; }
```

`text-overflow` applies only to content that **overflows on one line**. With the initial `white-space: normal`
the text wraps instead of overflowing, so there is nothing for the ellipsis to act on and the declaration does
nothing at all. The rule states one intention and produces the opposite.

The column is `112px` (`.row__grid { grid-template-columns: 52px 112px minmax(0, 1fr) }`). An agent name of
about seventeen uppercase characters fits; `REQUIREMENTS-ENGINEER` is twenty-one and wraps to two lines, which
is what the owner's screenshot shows — `REQUIREMENTS-` above `ENGINEER`, the row twice as tall as its
neighbours for a reason no requirement asks for.

The wrapping is also the *better* of the two outcomes, which is why this is worth a note rather than a one-word
fix. Adding `white-space: nowrap` would make the declaration work as written and truncate an agent's identity to
`REQUIREMENTS-EN…`, and an agent's name is the one thing REQ-CHAT-057's attribution exists to carry. Resolving
the contradiction means choosing which half to delete, and the half to delete is the truncation.

Two smaller faults sit behind it. A name with no hyphen and no space has no break opportunity, so
`overflow: hidden` clips it mid-glyph rather than wrapping — `overflow-wrap` is not set. And the height a
wrapped gutter adds is invisible to `estimateHeight`, which compounds
[`live-rows-are-never-measured.md`](live-rows-are-never-measured.md): both faults were visible in the same
screenshot, and only one of them is about text.

## Specs

None contradicted in letter. `REQ-CHAT-057` fixes that a block's first row is attributed to its role, and says
nothing about the treatment when the name is longer than the column. The design language governs the craft
(`docs/design/README.md` §1.4 typography, §1.11 copy voice), and a declaration that cannot take effect is not a
craft choice — it is a rule that reads as compliance and enforces nothing, the same class as a token name that
resolves to no value.

## Relevant files

- `packages/ui/src/shell.css` — `.row__role` (the inert `text-overflow`) and `.row__grid`'s `112px` column.
- `packages/ui/src/transcript/Row.tsx` — `Attribution`, which writes the name into that column.
- `packages/ui/src/transcript/pool.ts` — `estimateHeight`, which models no gutter line at all.

*Noticed 2026-09-15 in a screenshot of the built product, while diagnosing overlapping activity lines.*

**Repaired 2026-09-15** ([R-021](../product/requests.md#r-021)). The contradiction is resolved by deleting the
truncation half, not by completing it: `overflow: hidden` and `text-overflow: ellipsis` are gone and
`overflow-wrap: anywhere` takes their place, so a hyphenated name breaks at its hyphen and an unbroken one breaks
rather than clipping mid-glyph. The falsified rule is kept above its replacement with the reason. `REQ-CHAT-057`
attribution keeps the whole name, which is the point of it.

The height that costs is no longer invisible: `estimateHeight` models the role gutter's own wrapped lines, and
takes the greater of that and the main column's. Measured in the built product by `pnpm transcript-proof`'s
`geometry` stage — `requirements-engineer` draws a **32 px** two-line gutter and the row it sits in overlaps its
neighbour by **0 px**, where before the second line was height nothing accounted for.
