# Library

Two stores and one review surface: the per-session record of what agents published, and the
workspace-scoped record of proposals for improving how the product runs the project. Also the prompt
material and per-persona memory a user accumulates.

Terms are derived from `docs/spec/14-library-artifacts-improvements.md`. The checkpoints an
improvement run takes are checkpoints in the
[Version Control](../../../workspace/src/git/CONTEXT.md) sense, in a disjoint ref namespace.

## Language

### Session artifacts

**Artifact**:
A document an agent published, or a child report materialised, held per session as a record plus the
Markdown file the record references. — `REQ-LIBRARY-087`
_Avoid_: output, file, deliverable, document — "artifact" is the one word

**Artifact kind**:
What produced it: `child_report`, `agent_published`, or `system`. — `REQ-LIBRARY` session artifact
store

**Tag**:
One of exactly six values an artifact may carry — `research`, `planning`, `implementation`,
`review`, `verification`, `errors`. A publish carrying any other tag is refused whole, leaving no
partial state. — `REQ-LIBRARY-089`
_Avoid_: label, category (a **category** is a proposal's classification)

**Slug**:
An artifact's readable kebab-case name, uniquified with a numeric suffix. — `REQ-LIBRARY` session
artifact store

**Sidecar**:
The artifact's Markdown document: frontmatter, a title heading, then the fixed sections Summary, Key
Findings, Highlight Paths, Snippets, Edited Files, Created Files. It is the record's body
(`PD-LIBRARY-003`); a person's edit replaces it, and a later re-render rewrites only its frontmatter. —
`REQ-LIBRARY` session artifact store, `PD-LIBRARY-003`

**Context block**:
Artifact material placed into a child's payload — the **prior sibling artifact index** (one line per
artifact, unsuccessful statuses first, 10,000 characters) or **prior agent context** (full bodies of explicitly
attached artifacts, each whole or not at all, within REQ-TOOLS-152's 100,000 characters; an overflowing body is left
out and later ones still tried). — `REQ-LIBRARY-097`, `REQ-LIBRARY-098`, `REQ-TOOLS-152`, `PD-TOOLS-006` revision 5
_Avoid_: injection, attachment (an *attachment* is what a caller asks for; the block is what arrives)

### Improvements

**Improvement artifact**:
The workspace-scoped record produced by the optional, strictly non-blocking analysis that may follow
a completed run, holding the proposals and the checkpoints of any run that applied them. —
`REQ-LIBRARY-042`
_Avoid_: report, review, suggestion set

**Proposal**:
One evidence-backed recommendation inside an improvement artifact, carrying a category, a summary,
at least one piece of evidence, a recommended action, a risk of `low`/`medium`/`high`, and a status
of `pending_review`, `approved`, `rejected` or `deferred`. — `REQ-LIBRARY` proposal data model
_Avoid_: suggestion, recommendation, finding

**Evidence**:
What a proposal rests on — a kind, text, and the ids of whatever it was drawn from. A proposal
without at least one is not a proposal. — `REQ-LIBRARY` proposal data model

**Analyst**:
The dedicated model that authors proposals from frozen snapshots, with an unavailable source kept
distinguishable from an empty one: six of the finished run in the post-run pass, five of the workspace's
own record in the retrospective. One analyst, two passes. — `REQ-LIBRARY-017`, `REQ-LIBRARY-019`,
`PD-LIBRARY-002`
_Avoid_: collector in prose, though `improvement_collector_*` is the configuration spelling

**Retrospective**:
The second analysis pass: the same analyst reading the WORKSPACE's own record — its recent sessions,
its prior proposals and their decisions, its saved prompts, its persona memory and its instruction
files — on a gesture rather than after a run, and producing ordinary proposals. Its artifact names no
source session, because it starts none; what it read is in `considered_session_ids`. — `PD-LIBRARY-002`
_Avoid_: insights, chronicle, review pass, workspace analysis

**Pass**:
Which of the two analyses produced an artifact or is running: `post_run` or `retrospective`. A surface
that shows analysis in progress says which pass it is. — `PD-LIBRARY-002`, `REQ-LIBRARY-125`
_Avoid_: mode, kind (the artifact's own column is `source_kind`, the stored spelling)

**Gate evidence**:
The record of what the check suite was, what ran, and how it came out, stamped so the analyst cannot
be talked into clearing a gate. — `REQ-LIBRARY-027`

**Improvement run**:
The separately started run that applies approved proposals. Its workspace effects are checkpointed
and reversible; nothing is applied by approving alone. — `REQ-LIBRARY` improvement executor
_Avoid_: apply, fix run

**Rollback**:
Undoing an applied improvement run, previewed per path, explicitly confirmed with Cancel as the
default, and reported in every case. — `REQ-LIBRARY-169`, `REQ-LIBRARY-171`

**Recorded version**:
An immutable prior state of an improvement artifact, carrying its cause — `collected`,
`status_change`, `edit`, `delete`, `checkpoint`, `rollback`, `unknown`. Never altered once recorded.
— `REQ-LIBRARY-049`
_Avoid_: revision, history entry

### Prompt material and memory

**Prompt history**:
The ordered record of prompts a user has submitted in this workspace. — `REQ-LIBRARY-138`

**Stash**:
The ordered set of prompt drafts a user deliberately kept. Distinct from the composer's per-workspace
**draft**, which is one in-progress text, not a collection. — `REQ-LIBRARY-138`, `REQ-CHAT-015`

**Persona memory**:
A per-persona Markdown file re-injected at agent creation. It stays a **file** deliberately, so it is
visible, inspectable and hand-editable, and a hand edit is read back on the next load. —
`REQ-LIBRARY-150`, `REQ-LIBRARY-153`
_Avoid_: memory store, long-term memory, knowledge base
