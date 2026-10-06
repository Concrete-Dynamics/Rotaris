import { useEffect, useRef, useState } from 'react';
import { acknowledge, bridge } from './shell.js';

/**
 * The status strip's window-side facts (REQ-SHELL-038/040/044/045/047): the window's width, which REQ-SHELL-047's two
 * thresholds read; the workspace's tokens and cost, read from the run host (`workspace.usage`); and the workspace-path
 * link's action. The items themselves are `stripItems`'s (`packages/ui/src/composer.ts`).
 */

/** REQ-SHELL-047: the window's own width in CSS px, re-read on every resize (snap and maximize included). */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const read = () => { setWidth(window.innerWidth); };
    window.addEventListener('resize', read);
    return () => { window.removeEventListener('resize', read); };
  }, []);
  return width;
}

export interface WorkspaceUsageFacts {
  readonly tokens: number;
  readonly cost: string | null;
}

/** How often the strip re-reads the workspace's usage while it is on screen: a background session's run moves it too. */
const USAGE_REFRESH_MS = 5_000;

/**
 * REQ-SHELL-044/045: this workspace's tokens and cost (OQ-190's build reading for the tokens, confirmed 2026-10-06 by R-071). Read at mount, again
 * whenever `pulse` changes (the focused session's own usage, so the figures follow a run on screen), and every five
 * seconds for the sessions running in the background. A read that fails keeps the last figures.
 */
export function useWorkspaceUsage(workspace: string, pulse: string): WorkspaceUsageFacts {
  const [usage, setUsage] = useState<WorkspaceUsageFacts>({ tokens: 0, cost: null });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const read = () => {
      void bridge.command({ kind: 'workspace.usage' }).then((r) => {
        if (!alive.current || !r.ok) return;
        const value = r.value as WorkspaceUsageFacts;
        setUsage((previous) => (previous.tokens === value.tokens && previous.cost === value.cost ? previous : value));
      });
    };
    read();
    const timer = setInterval(read, USAGE_REFRESH_MS);
    return () => { clearInterval(timer); };
  }, [workspace, pulse]);
  return usage;
}

/**
 * REQ-SHELL-040: the workspace-path link opens the folder in the OS file manager; a failure is never silent — the
 * transient error surface (REQ-SHELL-112) says the folder could not be opened and names the path attempted, and the link
 * stays enabled.
 */
export function openWorkspaceFolder(path: string): void {
  void bridge.command({ kind: 'workspace.openFolder' }).then((r) => {
    if (!r.ok) acknowledge('fail', r.headline, r.detail ?? path);
  });
}
