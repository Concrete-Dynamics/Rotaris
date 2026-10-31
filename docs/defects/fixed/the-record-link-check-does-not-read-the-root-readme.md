## The record-link check does not read the root README

`tools/check-record-links.mjs` resolves every relative link in "the record": every `.md` under `docs/`,
`CONTEXT-MAP.md`, `AGENTS.md`, `CLAUDE.md` and every `CONTEXT.md` under `packages/`. The root `README.md` is not
among them, so a link in it that names a moved or deleted file, or an anchor that no longer exists, leaves
`pnpm lint` green. The README is the page a visitor reads first and the one most likely to cite paths that other
changes move (`docs/clean-room/**`, `docs/architecture/implementation-conditions.md` and the defect notes it links to
are all moved or removed by other lanes from time to time).

Noticed on 2026-10-26 while rewriting the README (`docs/readme-restyle`): the task assumed `pnpm lint` proved the
README's links, and it does not. The rewrite's 89 relative links and anchors were resolved by a separate script
instead, with none broken.

## Specs

None. No requirement or rule names the README as part of the record; the checker's scope is its own comment's
definition. The gap is against the repository's convention that `pnpm lint` fails on a relative link that does not
resolve.

## Relevant files

- `tools/check-record-links.mjs` — the file list of "the record" (its header comment and the scan below it).
- `README.md` — the unchecked file, carrying relative links into `docs/`, `apps/`, `packages/`, `tools/` and
  `.github/workflows/`.

## Repaired — 2026-10-31

*Falsified by the repair: the record, for `tools/check-record-links.mjs`, now includes the root `README.md`. The
description above is what it read until this date. (It also named `CLAUDE.md` among the record's files; the repository
has had none since 2026-10-27, and the checker's list had already dropped it.)*

`recordFiles` reads the root `README.md` beside `CONTEXT-MAP.md` and `AGENTS.md`, so the first and third passes reach
it: its relative links and their `#fragment`s (the first pass) and any `docs/defects/….md` path it writes as inline
code (the third). The second pass does not, and could not: it reads the code under `apps/`, `packages/` and `tools/`
(`codeFiles`), and the README is none of those. Only the root README: a `README.md` elsewhere (under `packages/`,
say) stays outside the record, and the root holds no other Markdown file. `tools/check-doc-budget.mjs` reads the same
set, so the README now also falls under the document budget (359 lines, 27.7 KB: within it).

On this tree the gate read the README's 92 relative links, 12 of them with a fragment, and its one prose path, all
resolving: 9073 links in 2325 files, against 2324 files before. Pinned in `tools/check-record-links.test.ts` by four
cases over a fixture root (a dead link and a dead anchor in the README fail, live ones pass and are counted, a stale
note path in its inline code fails) and the walk case, which now expects the README; all five are red with the
README left out of the list. Falsified on the real tree as well: a dead link added to `README.md` turned `pnpm lint`
red naming it, and green again once removed.
