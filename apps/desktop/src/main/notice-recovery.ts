import type { Recovery } from './commands/context.js';

/**
 * REQ-NOTIFY-223/224: the run host names an action; main maps it to the notice's own closed vocabulary member.
 * ESC-34: the review action carries the workspace whose hooks it concerns, so the caller supplies one; with no
 * workspace there is nothing to review and the notice is raised without an action rather than with an empty one.
 * Moved out of `index.ts` unchanged on 2026-10-14 (OQ-293), so the run notices' mapping (`run-notice.ts`) and its tests read
 * the one table main raises every notice action from.
 */
export const recoveryFor = (action: string | undefined, workspace?: string, sessionId?: string): Recovery =>
  action === 'hooks.review'
    ? (workspace === undefined || workspace === '' || workspace === '(no workspace)' ? [] : [{ label: 'Review hooks', action: { kind: 'open-hook-review', workspace } }])
    : action === 'hooks.settings' ? [{ label: 'Open hook settings', action: { kind: 'open-settings', category: 'hooks' } }]
      : action === 'config.models' ? [{ label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } }]
        // OQ-279: the fatal configuration load's notice leads to the category whose card draws the report (ConfigSettings' Fatal).
        : action === 'config.fatal' ? [{ label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } }]
        : action === 'providers.add' ? [{ label: 'Add a provider', action: { kind: 'open-provider-sign-in' } }]
          /**
           * OQ-42: the durable-store failure's recovery. Reopening the session is what waits for every affected
           * run to settle, probes the store with a rolled-back write and rebuilds the session's writer and
           * projection (`Sessions.resume`) — so the action focuses the session the notice names, through
           * REQ-NOTIFY-044's existing `focus-session` member. A notice with no session to name carries no
           * action rather than one pointing nowhere, on the same terms as the hook review above. Since PD-SHELL-001
           * revision 3 (OQ-292) the member names the session's workspace too — `workspace` is then the root the run host
           * recorded the session under (`notice.publish`'s `workspaceRoot`), never a window's — and with none known the
           * notice carries no action.
           */
          : action === 'session.reopen' ? (sessionId === undefined || sessionId === '' || workspace === undefined || workspace === '' ? [] : [{ label: 'Reopen the session', action: { kind: 'focus-session', sessionId, workspace } }])
            : [];
