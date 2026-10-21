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

None in `docs/spec/`: the boundary is process ([`../clean-room/`](../clean-room/)), not product behaviour.

## Relevant files

- `CLAUDE.md` — the "Hard boundary" list, the `D:\Development\Apps\Rotaris` entry.
- `.github/agents/codebase-explorer-rotaris.agent.md`, `.github/agents/requirements-engineer-rotaris.agent.md` — the
  same entry, repeated.
