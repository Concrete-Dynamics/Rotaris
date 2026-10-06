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

## Outcome

Repaired 2026-10-06 (finacc3, bundle `finacc3-accept1-1`). `AGENTS.md`'s `git-proof` row now names launch 6c,
`unborn-branch`, and what it shows (REQ-WORKSPACE-020's empty item for REQ-WORKSPACE-029's empty branch name: no text, no
branch icon, no tooltip, no accessible description; `results.unbornBranch`), and names the other lettered launches by
label and name as well (3b `worktree-ahead`, 3c `presented`, 6b `not-a-repository`; 6 `no-git` beside 6b). The script's
header block says "ten launches" and lists each section as `<label>. <name>`, 6b and 6c as their own items.
`docs/architecture/codebase.md`'s "What `pnpm git-proof` does" names launch 6c.

Pinned by `apps/desktop/scripts/git-proof-index.test.ts`, which reads the script's `// <label>. ` sections and their
`launch('<name>'` and requires the header to list every one as `<label>. <name>` with the launch count in words, and the
`AGENTS.md` row to name every lettered launch as `launch <label>` and by its name; two of its three cases failed on the
previous text (the header lacked `3b. worktree-ahead`, the row lacked `launch 3b`, and both lacked 6c). Shown by
`pnpm git-proof --skip-build` on the branch after `pnpm build` (exit 0, load 3.06 before and 2.67 after on 4 CPUs), whose `results.json` records `unbornBranch` as `{ strip: "", icon: false, tooltip: false, description: false }`.
