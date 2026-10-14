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
