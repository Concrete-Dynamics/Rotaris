import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * REQ-MONITOR-128 / REQ-MONITOR-296 (the note "cancelling one agent is not shown cancelled until the engine answers"): the
 * surfaces that cancel one agent — the inspector and the agents header in the Workspace, the Mission view, a persona
 * window — and the Overview's tree, which draws the same agents (REQ-MONITOR-038), read the session through this window's
 * optimistic cancels, and the window's `cancelAgent` writes them. The roots mount under Electron, with a preload no `node`
 * test environment reaches, so what pins them is their source; the overlay itself is pinned in `packages/ui`
 * (`cancel-overlay.test.ts`) and the gesture in `session-actions.test.ts`.
 */
describe('REQ-MONITOR-128: every agent surface of a window reads the session under its optimistic cancels', () => {
  const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  it('shell.ts hands the window\'s one overlay store to the gestures', () => {
    expect(source('shell.ts')).toContain('createSessionActions({ bridge, replica, cancels: cancelOverlays })');
  });
  it('main.tsx: the Workspace, Mission and Overview roots read the shown session, never the replica\'s record directly', () => {
    const text = source('main.tsx');
    for (const root of ['Workspace', 'Mission', 'Overview']) {
      const body = text.slice(text.indexOf(`function ${root}(`));
      expect(body.slice(0, body.indexOf('\n}\n')), root).toContain('const session = useShownSession();');
    }
  });
  it('windows.tsx: a persona window draws its coalesced record under the overlay', () => {
    const text = source('windows.tsx');
    expect(text).toContain('const session = useCancelOverlaid(state.session);');
    expect(text).toContain('persona={persona} session={session}');
  });
});
