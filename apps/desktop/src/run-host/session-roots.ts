import type { ProcessEvent } from '@rotaris/contracts';

/** The two events about a session that carry its recorded root (`workspaceRoot`). */
type RootedEvent = Extract<ProcessEvent, { kind: 'run.result' } | { kind: 'notice.publish' }>;

/**
 * PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): an event about a session carries the workspace root the run
 * host recorded that session under — `sessionRoots`, written when a session is started and once the engine has loaded a resumed
 * one from a workspace's store (`dispatch.ts`) — so main can name where the session lives on the notice it raises (the
 * `focus-session` action's workspace) without guessing a window. A session with no recorded root, or an event naming none, is
 * stamped with nothing, and main then raises its notice with no action.
 */
export function withSessionRoot<E extends RootedEvent>(event: E, sessionRoots: ReadonlyMap<string, string>): E & { readonly workspaceRoot?: string | undefined } {
  const workspaceRoot = event.sessionId === '' ? undefined : sessionRoots.get(event.sessionId);
  return workspaceRoot === undefined || workspaceRoot === '' ? event : { ...event, workspaceRoot };
}

type NoticePublish = Extract<ProcessEvent, { kind: 'notice.publish' }>;
type RunResultEvent = Extract<ProcessEvent, { kind: 'run.result' }>;

/**
 * The three events `host.ts` sends about a session, built here so each is stamped with the session's recorded root on one line
 * the tests reach (`createRunHost` needs a utility process's parent port, so no test calls it): the run's result, the engine's
 * run notice (its `notice` port, `RunNotice`: the headline is the title and its prose the message, REQ-NOTIFY-005's detail
 * block left for diagnostic output) and the control arms' failure report (its `report` port, whose detail is copyable).
 */
export function runResultEvent(sessionId: string, result: RunResultEvent['result'], sessionRoots: ReadonlyMap<string, string>): RunResultEvent {
  return withSessionRoot({ kind: 'run.result', sessionId, result }, sessionRoots);
}

export function runNoticeEvent(
  n: { readonly severity: NoticePublish['severity']; readonly headline: string; readonly detail: string; readonly action?: string | undefined; readonly key?: string | undefined; readonly sessionId?: string | undefined },
  sessionRoots: ReadonlyMap<string, string>,
): NoticePublish {
  return withSessionRoot({
    kind: 'notice.publish', severity: n.severity, title: n.headline, message: n.detail, detail: '',
    ...(n.action === undefined ? {} : { action: n.action }), ...(n.key === undefined ? {} : { key: n.key }),
    sessionId: n.sessionId ?? '', persistent: true,
  }, sessionRoots);
}

export function reportNoticeEvent(
  n: { readonly severity: NoticePublish['severity']; readonly title: string; readonly message: string; readonly detail: string; readonly sessionId: string },
  sessionRoots: ReadonlyMap<string, string>,
): NoticePublish {
  return withSessionRoot({ kind: 'notice.publish', severity: n.severity, title: n.title, message: n.message, detail: n.detail, sessionId: n.sessionId, persistent: true }, sessionRoots);
}
