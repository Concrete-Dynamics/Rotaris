## ui-audit's worktree dialog reads UNREACHED until the git view has read the enclosing checkout

**Outcome (repaired 2026-11-03).** Both parts, in the harness. `ui-audit.mjs` makes its scratch workspace a one-commit
repository of its own (`git init -q -b main`, a `.gitignore` keeping `.rotaris/` out, one commit — `overview-proof`'s
shape), so the workspace service reads it and not the enclosing checkout; and the overlay sweep submits a typed slash
command only once its popup row reads available (`.slash-popup__row[data-command=…][data-available="1"]`, the driver's
`waitFor`, bounded at 20 s — REQ-GIT-102's 15 s with a margin), the reason the row shows becoming the `UNREACHED` finding
when the deadline passes, in place of a fixed 450 ms after the typing. That wait found a second condition of the sweep on
its first run: the stash dialog's opener had never been `/pop`
(`docs/archive/defects/ui-audits-stash-dialog-was-opened-by-the-toolbars-manage-control-never-by-pop.md`, repaired with
this one). First executed 2026-11-03 on the working tree over `83910dc8` (Windows 11 ARM64, Node 26.13.0, Electron 44.3.0,
two other sessions working on the host): `pnpm ui-review -- --iteration=1 --views=1` three times after the stash repair
(and three before it), the worktree dialog reached and CLEAN at 1400×900 and 1000×680 in every pack, `/worktree` read
available 103 to 131 ms after the typing, `UNREACHED` 0 and the last three packs' findings 0; the log's repository line
reads `git=true repo=true branch=main` with `worktrees=1`, and the git view's reads are 10 in 2.0 to 4.2 s against the 50
in 15.3 s this note records. The record: `docs/proofs/ui-audit.md`; the register row is in
`docs/architecture/first-executions/35-the-register-34.md`.

`pnpm ui-audit` (and `pnpm ui-review`, which runs it) opens each overlay by typing its slash command into the composer and
waits 6 s for the overlay's root (`apps/desktop/scripts/ui-audit.mjs`, the overlay sweep). `/worktree` is available only
while the renderer's `hasGit` is true, and `hasGit` is `git.state?.gitAvailable && git.state.isRepository`
(`apps/desktop/src/renderer/main.tsx`), a state the `git.read` command fills — the Git view's full read, not the
workspace service's early `repository` read. Until that read has answered, the slash catalogue refuses the command with
"No git service is available for this workspace." (`packages/ui/src/slash/catalogue.ts`, `NO_GIT_SERVICE`), nothing
opens, and the audit notes `UNREACHED overlay: worktree dialog` as if the product had failed to open it.

The read is slow because the audit's scratch workspace is not a repository of its own. `ui-audit.mjs` writes it at
`.ui-audit/workspace` (`ui-review` at `.ui-review/<revision>/iteration-N/workspace`), inside the checkout, with a
`README.md` and `.rotaris/agents.yaml` and no `git init`, so the workspace service resolves the enclosing checkout as the
workspace's repository and reads *it*: on 2026-11-02 the log says `repository …: git=true repo=true branch=design-knowledge
base=origin/main +2/-9` and `git view: 50 reads in 15290 ms (… worktrees=19 history=30)`. `pnpm app:drive start` refuses
a `--workspace` inside the checkout for a neighbouring reason (the app writes into it); the audit's own workspace is one.

Observed 2026-11-02 on `8d438e31`, Windows 11 ARM64, Node 26.13.0, `--views=1`, three captures of the same build:
`pnpm ui-review -- --iteration=1 --views=1` read the dialog UNREACHED at 1400×900 (the notice at 06:55:53, the git view's
50 reads finishing at 06:55:51 and 06:55:53) and reached it at 1000×680, 18 s later; `pnpm ui-audit -- --skip-build
--views=1` read it UNREACHED at both sizes, and its log carries no `git view` line at all — the read was never requested,
or never finished, within that capture. Every other overlay and both Overview sizes were CLEAN in all three. The
critique of the Overview dry run (R-093) carries the finding under `deterministic` with this note as its explanation.

Not repaired: outside that task's scope (the record and the skills). A likely repair has two parts, both in the
harness: `git init -q -b main` and one commit in the scratch workspace before launch, as `overview-proof.mjs` and
`mcp-proof.mjs` already do, so the repository read is of a one-commit repository and not of the checkout and its
worktrees; and the overlay sweep waiting for the slash command's own availability (the catalogue row without its
unavailable reason) rather than for a fixed 6 s after Enter — the shape AGENTS.md names under `pnpm app:drive` ("fixed
offsets have produced false reds three times").

## Specs

None is contradicted by the product. `/worktree`'s refusal while no git service is known is REQ-GIT-102/103's shape
(the worktree affordance needs a repository), and the catalogue says why. What is wrong is the evidence: an audit that
reports its own scratch workspace's condition as the product's `UNREACHED`.

## Relevant files

- `apps/desktop/scripts/ui-audit.mjs`: the scratch workspace (`join(output, 'workspace')`, no `git init`), the overlay
  table's `/worktree` row, the 6 s `waitFor` and the `UNREACHED` note.
- `apps/desktop/scripts/ui-review.mjs`: runs the audit under `.ui-review/<revision>/iteration-N/`, so the same workspace
  shape.
- `apps/desktop/src/renderer/main.tsx`: `hasGit` from `git.state`, filled by `git.read`.
- `packages/ui/src/slash/catalogue.ts`: the `worktree` row's availability and `NO_GIT_SERVICE`.
- `apps/desktop/src/workspace-service/index.ts`: the `repository` and `git view` log lines quoted above.
- `apps/desktop/scripts/overview-proof.mjs`, `apps/desktop/scripts/mcp-proof.mjs`: the `git init` precedent.
