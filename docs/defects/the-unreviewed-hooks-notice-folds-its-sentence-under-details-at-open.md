## The unreviewed-hooks notice folds its sentence under Details at the open

Recorded 2026-10-14 by fin44 (`fin44-hooks-and-config`) from the consortium's ruling of
[OQ-293](../architecture/open-questions.md#oq-293), before the repair. Confirmed by reading the path and by `notice-proof`
section 6's new assertion that the message row holds REQ-HOOKS-101's sentence.

REQ-NOTIFY-224's notice is raised from two places, and they build it differently. On the run path (`Run.start` in
`packages/engine/src/run/run.ts`, forwarded by the run host's `notice` port) REQ-HOOKS-101's sentence, "Skipped <N> hook(s)
declared by this workspace's .rotaris/agents.yaml: …", is the notice's **message** and its detail is empty. At the workspace's
open (`openWorkspaceInner` in `apps/desktop/src/main/index.ts`) main raises it through `raiseNoticeKeyed`, whose only text
parameter after the headline fills the notice's **detail**, so the same sentence lands in the folded detail area, behind
"Details", and the message row is empty. The one sentence that says what was skipped and why is hidden at exactly the moment
the notice is most often seen.

## Specs

REQ-NOTIFY-005 (a notice's message says what happened; the detail area is for diagnostic output), REQ-NOTIFY-224 (the notice
that tells the user hooks were skipped), REQ-HOOKS-101 (the notice's message text). OQ-293's ruling: both raise sites build the
notice identically, REQ-HOOKS-101's text in the message row.

## Relevant files

- `apps/desktop/src/main/index.ts` — the open slot's `raiseNoticeKeyed('hooks.review:…', 'warning', 'Workspace hooks need review', r.summary.notice, …)`, the sentence passed as the detail.
- `apps/desktop/src/run-host/host.ts` — the run host's `notice` port, which sends the same sentence as `message` with `detail: ''`.
- `packages/ui/src/Notice.tsx` — the message row and the folded `notice__details`.
