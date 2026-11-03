# `ui-audit`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/ui-audit.mjs`](../../apps/desktop/scripts/ui-audit.mjs).

What the browser **built** at every size

Since 2026-11-03 the scratch workspace is a one-commit repository of its own (`git init -q -b main`, a `.gitignore`
keeping `.rotaris/` out, one commit), as `overview-proof`'s and `mcp-proof`'s are: it sits inside the checkout, and with
no `.git` of its own the workspace service read the enclosing checkout as its repository — 19 worktrees, 50 reads in 15 s
on 2026-11-02 — so `/worktree`, available only once the renderer's `hasGit` is filled by that read, read `UNREACHED` as
if the product had failed to open it. And the overlay sweep submits a typed slash command only once its popup row reads
available (`data-available="1"`, bounded at 20 s, REQ-GIT-102's 15 s with a margin), the reason the row shows being the
`UNREACHED` finding when the deadline passes, rather than 450 ms after the typing
(`../archive/defects/ui-audits-worktree-dialog-reads-unreached-until-the-git-view-has-read-the-enclosing-checkout.md`).
