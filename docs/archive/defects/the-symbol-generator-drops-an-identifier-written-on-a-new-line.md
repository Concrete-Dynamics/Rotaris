## The symbol generator drops an identifier written on a `New:` line without a word

`docs/product/README.md` fixes **New** as "nothing is displaced. Used alone, and it names no identifier."
`tools/symbol-artifact/generate.mjs` returns as soon as it reads a `New:` line (`if (d[1] === 'New') return; // names
no identifier, by definition`), so it neither refuses a `New:` line that names a requirement nor one that stands beside
another verb in the same directive. `PD-LIBRARY-002` did both: `> **Extends:** REQ-LIBRARY-003, REQ-LIBRARY-006,
REQ-LIBRARY-015` and `> **New:** no live requirement covers a cross-session analysis pass; REQ-LIBRARY-017 forbids the
per-run analyst exactly this reach …`. REQ-LIBRARY-017 carried an "Extended by `PD-LIBRARY-002`" note from the
directive's own commit, and the register recorded nothing for it: the route by which one of the six disagreeing
back-pointers got in
([`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement`](six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md)).
Only `PD-LIBRARY-002` mixes `New` with another verb on `a68f121`; the two other `New:` lines name nothing.

Recorded 2026-10-07 while building the ruling on OQ-222 (BP1), which orders the refusal.

## Specs

- `docs/product/README.md`, "The shape of an entry", item 4: **New** is used alone and names no identifier. The
  generator is that rule's only reader and does not enforce it.

## Relevant files

- `tools/symbol-artifact/generate.mjs` — the disposition parse.
- `apps/desktop/scripts/directive-proof.mjs` — the generator's counterfactuals.
- `docs/product/directives.md` — `PD-LIBRARY-002`'s disposition block.

## Repaired

2026-10-07, under the ruling on OQ-222 (BP1, R-072). `tools/symbol-artifact/generate.mjs` refuses a `New:` line that
names a requirement, on the line itself or on a blockquote continuation line, and refuses a directive that declares
itself New beside Supersedes, Narrows or Extends. `pnpm directive-proof` carries three counterfactuals for them (a
`New:` line naming REQ-CHAT-004, the same on its continuation line, and New beside Extends), each failing against the old
generator ("29/32 checks passed") and refused by the new one, paired with their passing forms in section 4 (New and its
continuation in words alone; the requirement named under Extends instead, reaching `EXTENDED_BY`). `PD-LIBRARY-002`'s
`New:` line was retired in the same change, so the committed register passes the refusal.
