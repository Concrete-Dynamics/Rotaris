import type { NoticeAction } from '@rotaris/contracts';
import type { ReportInput } from './notices.js';
import { projectNameOf } from './project-name.js';

/** REQ-NOTIFY-224's headline, before OQ-293's project name. */
export const HOOKS_REVIEW_HEADLINE = 'Workspace hooks need review';

/** The words and the action of REQ-NOTIFY-224's unreviewed-hooks notice, whichever site raises it. */
export interface HooksReviewNotice {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly action: { readonly label: string; readonly action: NoticeAction };
}

/**
 * OQ-293 (ruled 2026-10-14 under R-072): the unreviewed-hooks notice names its project on PD-WORKSPACE-005's pattern. It is an
 * application notice, shown in every main window, so "this workspace" in REQ-HOOKS-101's sentence needs the project beside it:
 * the title is the headline followed by the project's name (PD-WORKSPACE-005's naming rule, `projectNameOf`), the message row
 * carries REQ-HOOKS-101's text unchanged (REQ-NOTIFY-005: the detail area is for what is not the message), and the detail area
 * holds the project's folder, which tells two projects of one name apart. Its one action is REQ-NOTIFY-044's
 * `open-hook-review` naming the workspace whose hooks it counts (ESC-34). `root` is in the form main's windows hold (the
 * canonical spelling `openWorkspaceInner` keys a workspace by), so REQ-STARTUP-163's same-folder test finds its holder. Both
 * raise sites build the notice here: the open slot (`hooksReviewOpenReport`) and the run's `notice.publish` (`run-notice.ts`).
 */
export function hooksReviewNotice(root: string, notice: string): HooksReviewNotice {
  return {
    title: `${HOOKS_REVIEW_HEADLINE}: ${projectNameOf(root)}`,
    message: notice,
    detail: `Project folder: ${root}`,
    action: { label: 'Review hooks', action: { kind: 'open-hook-review', workspace: root } },
  };
}

/**
 * REQ-NOTIFY-224 at the workspace's open: the hooks summary of a workspace whose declared hooks no decision covers, raised
 * once per workspace and hook set (`hooks.review:<workspace>:<fingerprint>`, the store's once-per-key suppression) at
 * `warning`.
 */
export function hooksReviewOpenReport(root: string, summary: { readonly workspace: string; readonly fingerprint: string; readonly notice: string }): ReportInput {
  return { severity: 'warning', key: `hooks.review:${summary.workspace}:${summary.fingerprint}`, ...hooksReviewNotice(root, summary.notice) };
}
