## The unreviewed-hooks notice does not name its project

Recorded 2026-10-14 by fin43 (`fin43-notices-and-config`) from the consortium's ruling of OQ-267 (step 8 (b)). Not repaired:
REQ-HOOKS-101 fixes the message's words, so a change to them needs a directive, raised as
[OQ-293](../architecture/open-questions.md#oq-293).

REQ-NOTIFY-224's notice for a workspace whose declared hooks are unreviewed is an application notice: one store, shown in every
main window (ADR-0049). Main raises it with the title "Workspace hooks need review" and REQ-HOOKS-101's message, "Skipped <N>
hook(s) declared by this workspace's .rotaris/agents.yaml: …". With two main windows on two workspaces (PD-SHELL-001), or after a
switch since it was raised, the notice stands in a window holding another workspace and says "this workspace", which there means
the wrong project; nothing in it names the project it is about. Its "Review hooks" action names the right workspace and, since
PD-SHELL-001 revision 2, reaches it, so the notice's words and its action disagree. PD-WORKSPACE-005 repaired the same confusion
for the project-setup banners by naming the project in the title and its folder in the detail area.

## Specs

REQ-NOTIFY-224 (the notice, published per workspace and hook set), REQ-HOOKS-101 (the message's fixed text), PD-WORKSPACE-005
(the precedent: a notice shown in every window names its project), PD-SHELL-001 revision 2 (the action reaches the named
workspace).

## Relevant files

- `apps/desktop/src/main/index.ts` — the open slot's `raiseNoticeKeyed('hooks.review:…', 'warning', 'Workspace hooks need review', r.summary.notice, …)`.
- `apps/desktop/src/run-host/` — the hooks summary's `notice`, REQ-HOOKS-101's text.
- `apps/desktop/src/main/initialization.ts` — `namedBanner`, the precedent's shape.
