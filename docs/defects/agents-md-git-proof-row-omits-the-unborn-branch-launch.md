## AGENTS.md's git-proof row omits launch 6c (`unborn-branch`)

`pnpm git-proof` (`apps/desktop/scripts/git-proof.mjs`) has run launch 6c, `unborn-branch`, since fin22's repair of
`docs/defects/fixed/the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md`: a fresh `git init`
outside the repository, whose status-strip branch item must be REQ-WORKSPACE-020's empty item (no text, no icon, no
tooltip, no accessible description). The proof index in `AGENTS.md` (the `git-proof` row, line 78 on origin/main at
`760394c`) does not name it: the row lists the strip's states for a named branch, no git and outside a repository, and
names launch 3c by number, but has no word for the unborn branch or launch 6c. An agent choosing a proof from the index
cannot learn that git-proof shows the empty item. The script's own header block has the same gap: it still says "six
launches" where ten run, and its item 6 lists the no-git and plain-folder launches but not 6c.

Confirmed 2026-10-06 on branch `finacc3-accept1-1` (from `760394c`): `sed -n 78p AGENTS.md | grep -ci 'unborn\|6c'`
prints 0; the row's only launch label is `launch 3c`; the header reads "six launches".

Recorded by acceptance round 1 of finacc3 (finding F17, known finding 14 of the brief), as a harness defect: cosmetic,
the proof itself asserts the state.

## Specs

None contradicted by the product. The proof index is the record `CLAUDE.md` and
`.agents/skills/orchestrated-build/references/repository.md` ("The gate": "The proof index is in `AGENTS.md`") point
agents at; the launch it omits shows REQ-WORKSPACE-020's empty item for REQ-WORKSPACE-029's empty branch name.

## Relevant files

- `AGENTS.md`: the `git-proof` row of the proof index, which omits launch 6c.
- `apps/desktop/scripts/git-proof.mjs`: the header block ("six launches", item 6) and launch 6c (`unborn-branch`, the
  section headed `// 6c.`).
