import type { ProcessEvent } from '@rotaris/contracts';
import { hooksReviewNotice } from './hooks-review-notice.js';
import { recoveryFor } from './notice-recovery.js';
import type { ReportInput } from './notices.js';

/** A notice the run host published (Part V). */
export type NoticePublish = Extract<ProcessEvent, { kind: 'notice.publish' }>;

/**
 * Part V / REQ-NOTIFY-028: the notice main raises for the run host's `notice.publish` — the run host names the session its
 * notice concerns, so a notice about one run survives the start of another (REQ-NOTIFY-029).
 *
 * OQ-293 (ruled 2026-10-14 under R-072): a run's unreviewed-hooks notice (`hooks.review`) that carries its workspace — the
 * root the run host recorded the session under (`workspaceRoot`, stamped by `withSessionRoot`), the run's own
 * `workspaceRoot` — is built by the same composer as the one raised at the workspace's open, so the two read alike and its
 * action names THAT workspace, never the focused window's
 * (docs/defects/fixed/a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md). Its key stays the engine's
 * `hooks.review:<workspace>:<fingerprint>`. Every other notice keeps its own words; `session.reopen` names the session's
 * recorded root (PD-SHELL-001 revision 3) and the rest the active window's workspace, read through `activeWorkspace`.
 */
export function runNoticeReport(e: NoticePublish, activeWorkspace: () => string | undefined): ReportInput {
  const common = {
    severity: e.severity, persistent: e.persistent, sessionId: e.sessionId,
    ...(e.key === undefined ? {} : { key: e.key }),
  };
  if (e.action === 'hooks.review' && e.workspaceRoot !== undefined && e.workspaceRoot !== '') {
    return { ...common, ...hooksReviewNotice(e.workspaceRoot, e.message) };
  }
  const recovery = recoveryFor(e.action, e.action === 'session.reopen' ? e.workspaceRoot : activeWorkspace(), e.sessionId);
  return { ...common, title: e.title, message: e.message, detail: e.detail, ...(recovery.length === 0 ? {} : { action: recovery[0]! }) };
}
