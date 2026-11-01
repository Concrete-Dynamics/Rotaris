## The unreviewed-hooks notice does not name its project

Recorded 2026-10-14 by fin43 (`fin43-notices-and-config`) from the consortium's ruling of OQ-267 (step 8 (b)). Not repaired:
REQ-HOOKS-101 fixes the message's words, so a change to them needs a directive, raised as
[OQ-293](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-293).

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

## Outcome — repaired 2026-10-14 (fin44, `fin44-hooks-and-config`)

OQ-293 was ruled 2026-10-14 under R-072 with no directive: the notice names its project on PD-WORKSPACE-005's pattern, and
REQ-HOOKS-101 keeps its text. One composer, `hooksReviewNotice(root, notice)` in `apps/desktop/src/main/hooks-review-notice.ts`,
gives the notice its title "Workspace hooks need review: <name>" (`projectNameOf`, moved with `namedBanner` from
`initialization.ts` to `project-name.ts`, re-exported there), its message (REQ-HOOKS-101's sentence, unchanged), its detail
("Project folder: <root>") and its `open-hook-review` action naming that root. Both raise sites build it: the open slot through
`hooksReviewOpenReport` and the run's `notice.publish` through `runNoticeReport` (`run-notice.ts`); the root is the canonical
spelling main's windows hold. Pinned by `apps/desktop/src/main/hooks-review-notice.test.ts` (the name, a drive root, the folder line, REQ-HOOKS-101's text unchanged, the open slot's report) and `apps/desktop/src/main/run-notice.test.ts` (the two raise paths identical in title, message, detail and action; with another window active the run's notice names its own workspace), each red on the code before (the run-path cases checked by restoring the old mapping: 2 of 4 failed); shown by `pnpm notice-proof --only=6,6b` (under `xvfb-run`): section 6 run on the code before failed with `the notice on screen: ["Workspace hooks need review"], not "Workspace hooks need review: workspace"`, and its log showed the message row empty (`probe-at 2500 [data-testid="notice-message"] → []`) and the sentence under `notice-detail`; after the repair both sections passed, the title `Workspace hooks need review: workspace`, the message REQ-HOOKS-101's sentence, the detail `Project folder: <the scenario's workspace>`, and the review opened for that workspace by a reach that `surfaced` its window (load average 3.7 on four CPUs).
