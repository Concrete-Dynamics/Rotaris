## The UI-language checker counts metrics inside CSS comments

`tools/check-ui-language.mjs` scans `.css` files with a regex over raw text and never strips comments, so a
property name written in prose inside a `/* … */` block is read as a declaration. Because the value pattern
runs to the next `;` or `}` and a comment contains neither, the match continues **past the end of the
comment** and picks up the first literal metric in the rule that follows.

Found while writing the plan gate's styles: a comment containing the words `bottom: 0` — explaining why the
gate's three answers are pinned — made the checker report `bottom:150px: 1 > 0`, attributing a literal from
the *next* rule (`var(--rt-composer-height, 150px)`) to a sentence. The debt ratchet then failed the whole
of `pnpm check`, with a message naming a metric that appears nowhere near the change.

The false positive is safe in direction — it can only over-count, never under-count — so nothing it has
passed is in doubt. What it costs is a reader's time and, worse, the temptation to reword an explanation to
please a regex, which is what happened here: the comment now says "pinned sticky to the block's own floor"
rather than naming the two declarations it is about.

## Specs

None. This is a toolchain defect in the adopted-language guard, not a product behaviour. The guard itself is
the operational half of `docs/design/README.md` §2/§7; the baseline it compares against lives in
`tools/ui-language-baseline.json`.

## Relevant files

- `tools/check-ui-language.mjs` — the `.css` branch: two `matchAll` scans over the file's raw text, with no
  comment stripping. Stripping `/\/\*[\s\S]*?\*\//g` before the scans is the obvious repair; it must not also
  strip from `.tsx`, where the inline-metric scan has the same shape and the same exposure.
- `tools/ui-language-debt.mjs` — `compareDebt`, which turns the miscount into a failed `pnpm check`.
- `packages/ui/src/shell.css` — the `.plan-gate` block whose comment triggered it.
