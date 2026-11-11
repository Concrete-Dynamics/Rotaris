[Product directives](../directives.md) › PD-GIT-002

<a id="pd-git-002"></a>

### PD-GIT-002 — the Git view is titled "Git"

The Git view's title MUST read "Git", the label of the navigation entry that opens it, and MUST NOT read "Git workspace". Every other clause of REQ-GIT-075 stands as written: the view is reached from the navigation entry labelled "Git", and its header row shows the current branch or `not a git repository`, the monospace sync label, "Refresh", "New worktree" and "Merge selected".

**Why, and what it costs.** Decision D4 of [the information-architecture map](../../design/information-architecture.md). The title added a word that is the name of another primary view, so one screen held two things called a workspace: the rail's "Workspace" entry and, 87 px to the right of the rail's selected "Git" entry, the title "Git workspace" (measured on the built application at `880a08a9`, `pnpm app:drive`, 1400×900). The alternatives were to leave it (the collision stays) or to retitle the Workspace view (which moves the label of a primary view, and REQ-SHELL-027 with it, for the sake of one heading). The claim is narrow: it is not that every view's title equals its rail label (the Settings view is titled by its category), and "workspace" still names the project folder elsewhere in the product; it is that this title no longer borrows another view's name. The cost is that the title no longer says what the view is a workspace of; the branch and sync label beside it and the "Worktrees" card under it do. Nothing reachable is removed.

> **Narrows:** REQ-GIT-075

Its case is the title's text alone.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's standing delegation [R-098](../requests.md#r-098), which the owner authorised on 2026-11-11; decision D4 of [the information-architecture map](../../design/information-architecture.md), written the same day and read against an independent critique recorded there. The owner did not word this directive.*
