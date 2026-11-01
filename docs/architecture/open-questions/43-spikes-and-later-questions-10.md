# Open questions — Spikes, and the questions raised since (10 of 35)

Part 43 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-195; OQ-192 – OQ-194, OQ-196 – OQ-199 archived in [the archive](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md).

- OQ-192 — The sessions card's rows carry a token label, a duration label and a detail caption, which the listing record's closed field set does not …; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-192)
- OQ-193 — What does the status strip's branch item show on a detached HEAD, outside a repository and before the first read: REQ-GIT-161's conveyed …; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-193)
- OQ-194 — Which root do REQ-MCP-035's filesystem fill-in, REQ-MCP-043's default working directory and REQ-MCP-070's `lsp_init` call name for a run in …; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-194)

**OQ-195 — Whose project memories does a run in an isolated working tree read and write, and what becomes of the project the
runtime creates there?** *(REQ-MCP-034's isolated-run clause; REQ-MCP-102, the block telling the agent "to read the memories
that already exist before it starts exploring the codebase" and "to write durable findings … back through the
memory-writing tools it holds"; REQ-MCP-099, project creation "SHALL be skipped when the runtime's per-project marker file is
already present, and SHALL never overwrite an existing project"; OQ-161's reading, which keeps the marker's directory in the
repository's own exclude file. Raised 2026-10-03 by the repair of
[`fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md`](../../defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md)
(fin12). Open.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

Bound to the tree's root as REQ-MCP-034 requires, the runtime works on a project of its own. Measured on 2026-10-03 against the
pinned runtime (serena-agent 1.7.0, launched as the product launches it, in a scratch repository whose main tree had been set
up by REQ-MCP-099's creation step and whose marker directory was excluded the OQ-161 way): the linked worktree held no marker,
because the directory is ignored and so never checked out; the runtime's first launch against the tree generated the project
there itself (`.serena/project.yml`, named after the tree's directory, its languages detected from the tree's files) and
registered the tree's path as a second project in the runtime's home; `git status` in the tree showed only the run's own
change, the generated directory being excluded too. It answered from the tree — a pattern search found the function written
in the tree and not the main tree's uncommitted one — and never fell back to the main checkout. But `list_memories`
answered empty although the main tree held a memory, and a memory written in the run landed in the tree's own ignored
`.serena/memories/`, which the main tree never sees and which goes when the tree is removed. Every unit worktree also adds an
entry to the runtime home's project list that nothing removes.

**What the build proceeds under**: the tree's own project, as the runtime makes it. Nothing is copied into the tree before the
launch (a copied marker would carry the main tree's project name and its registration), nothing is merged back when the run
ends, and no entry is removed from the runtime's project list. REQ-MCP-102's block is printed unchanged.

**What a ruling decides.** Whether an isolated run should read the anchoring project's memories (and how — a copy at the
tree's creation, or the runtime pointed at a shared memory store), whether what it writes there should reach the anchoring
project (at accept, or never), and whether the runtime's project registration of a removed tree is cleaned up.

- OQ-196 — How long may a child at its time limit take to finish the model step in flight, and what is kept when that bound is reached?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-196)
- OQ-197 — Does a write of the permission mode that leaves the file's value unchanged displace an unsaved Settings selection?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-197)
- OQ-198 — Does `explicit_trivial` reach a request that changes nothing, and may the tie-break choose `moderate_feature` where no build is plausible?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-198)
- OQ-199 — May a run complete when its entry role ended without writing an answer?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/43-spikes-and-later-questions-10.md#oq-199)
