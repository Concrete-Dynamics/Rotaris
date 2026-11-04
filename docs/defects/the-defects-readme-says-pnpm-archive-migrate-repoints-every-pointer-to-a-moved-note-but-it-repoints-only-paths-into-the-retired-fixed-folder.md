## The defects README says `pnpm archive:migrate` repoints every pointer to a moved note, but it repoints only paths into the retired `fixed/` folder

Found 2026-11-04 by the independent review of the archive bundles' skill changes (the hardening orchestration, R-092).
`docs/defects/README.md` (its second paragraph) says of a repaired note moved to `docs/archive/defects/`: "every pointer
that named it at its old path moves with it, in the same commit — the note's own links move too … `pnpm archive:migrate`
does the repointing". The script does less: `tools/archive/defects.mjs` (`ROOT_FIXED`, `RELATIVE_FIXED`, `repointDefects`)
rewrites only pointers whose path runs into `docs/defects/fixed/`, the folder retired on 2026-11-01, and it does not
rebase a moved note's own relative links. For a note moved straight from `docs/defects/` by `git mv`, the agent repoints
the pointers in the code and the record and rebases the note's own links by hand, and `tools/check-record-links.mjs`
catches what is left. The README overstates what the script does, so an agent that trusts it lands a red
`check-record-links` at its gate. Recorded, not repaired: the repair is either the README's sentence or the script's
scope, and which is the orchestrator's to classify.

## Specs

None contradicted. `AGENTS.md` "Defects noticed along the way" and `docs/README.md` "The archive" state the move; the
README's description of the script is the defect.

## Relevant files

- `docs/defects/README.md` — the sentence "`pnpm archive:migrate` does the repointing".
- `tools/archive/defects.mjs` — `repointDefects`, which rewrites only paths into the retired `fixed/` folder.
- `tools/check-record-links.mjs` — what catches a pointer or link left behind.
- `.agents/skills/orchestrated-build/references/repository.md` — the Records bullet, which since 2026-11-04 says the note's own links are rebased by the agent.
