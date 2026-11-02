## The hard boundary forbids the path this repository's own checkout now occupies

`CLAUDE.md`'s "Hard boundary" lists `D:\Development\Apps\Rotaris` as "a local checkout of that project" — the reference —
and forbids reading it for any reason. On 2026-10-21 that path holds this repository's own primary checkout
(`origin` is `https://github.com/Concrete-Dynamics/Rotaris`, `main` at R-078's `f1ea1743` and after; the root `package.json`
is `rotaris-crw`). A session opened in that checkout to take up R-079 was, read literally, forbidden from reading its own
working directory; it stopped and asked the owner, who answered that the line is stale and to proceed. R-078 renamed the
reference and its GitHub home in the boundary, but not the local path, so the boundary now names the clean side.

The two agent definitions under `.github/agents/` repeat the same path in their own boundary lists. An agent that obeys
the line without asking refuses all work in the primary checkout; one that ignores it has learned that the boundary
holds stale entries, which weakens every other entry. Where the reference's local checkout lives now, if anywhere, is
not stated.

A related observation, outside the repository: the per-checkout auto-memory the agent harness keys by this path
(`~/.claude/projects/D--Development-Apps-Rotaris/memory/`) holds notes about a Python and Qt codebase (pytest,
PyInstaller, `SWR-` identifiers), which is not this TypeScript and Electron tree. If those notes were written while the
reference lived at this path, they are material the boundary covers ("any transcript, scratchpad, or report produced by
an agent that read the above") and are loaded into every session opened here. The session that found this did not use
them.

## Specs

None in `docs/spec/`: the boundary is process (`docs/clean-room/` *(removed 2026-10-26)*), not product behaviour.

## Relevant files

- `CLAUDE.md` — the "Hard boundary" list, the `D:\Development\Apps\Rotaris` entry.
- `.github/agents/codebase-explorer-rotaris.agent.md`, `.github/agents/requirements-engineer-rotaris.agent.md` — the
  same entry, repeated.

## Resolution — 2026-10-22

The owner decided that the obsolete checkout-path prohibition is removed: the clean-room rewrite is
complete and this checkout is now used for regular development. The prohibition was removed from
`CLAUDE.md` and both agent definitions, without replacing it with another path restriction. The
remaining reference-repository, reference-commit and sealed-material boundaries are unchanged.

The description above records the pre-repair state. This repair changes repository instructions only;
it neither inspected nor modified the external harness auto-memory mentioned there, and does not
claim that memory was cleaned or that the remaining reference-derived-material rule was waived.

**Verification:** a tracked-file search found the obsolete checkout-path prohibition only in those
three instruction files; after the repair no such prohibition remains. The similarly prefixed sealed
reference path stays forbidden. Historical mentions of the checkout path remain as history in this
note, not as instructions. `node tools/check-record-links.mjs` verifies the moved note's links and
any pointers to it.
