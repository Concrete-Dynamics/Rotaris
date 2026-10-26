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
