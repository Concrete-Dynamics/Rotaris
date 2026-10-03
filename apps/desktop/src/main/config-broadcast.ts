import type { ConfigSnapshot } from '@rotaris/contracts';

/** A main window as the configuration announcement needs it: the workspace it holds, and how to hand it a snapshot. */
export interface ConfigAudience {
  readonly workspace: string;
  /** Sends `config:changed` to this window; a destroyed window is skipped by the caller's adapter. */
  send(snapshot: ConfigSnapshot): void;
}

/**
 * ADR-0037 Tier A, REQ-WORKSPACE-105, PD-SHELL-001: after one workspace's configuration is written and loaded again, each
 * main window repopulates from **its own** workspace's snapshot. The windows holding `root` take the reloaded snapshot at
 * once (synchronously, before this returns its promise); every other window holding a workspace is sent that workspace's
 * own snapshot, read again, because a write may have touched a layer they share (the global file, a provider sign-in) and
 * because what it shows must be its own workspace's either way. A window with no workspace is sent nothing.
 *
 * Until 2026-10-03 (fin10's repair round) main sent the written workspace's snapshot to every window, and each renderer
 * adopted whatever arrived: with two main windows on two workspaces (REQ-SHELL-020), a Settings save in one rewrote the
 * other's status strip — its `outside-workspace!`/`workspace-scoped` flag (REQ-TOOLS-131), its mode flag and `● CB armed` —
 * and its Settings view to the first workspace's values.
 */
export function announceConfig(
  root: string,
  snapshot: ConfigSnapshot,
  windows: readonly ConfigAudience[],
  deps: { readonly samePath: (left: string, right: string) => boolean; readonly readOwn: (workspace: string) => Promise<ConfigSnapshot | null> },
): Promise<void> {
  const others: Promise<void>[] = [];
  for (const window of windows) {
    if (window.workspace === '(no workspace)') continue;
    if (deps.samePath(root, window.workspace)) { window.send(snapshot); continue; }
    others.push(deps.readOwn(window.workspace).then((own) => { if (own) window.send(own); }, () => undefined));
  }
  return Promise.all(others).then(() => undefined);
}
