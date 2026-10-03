import type { ConfigSnapshot } from '@rotaris/contracts';

/**
 * A main window as the configuration announcement needs it: the workspace it holds, and how to hand its family a snapshot.
 * `send` reaches every window of the family that reads the configuration (`configFamily`), not the main window alone.
 */
export interface ConfigAudience {
  readonly workspace: string;
  /** Sends `config:changed` to this main window's family; a destroyed window is skipped by the caller's adapter. */
  send(snapshot: ConfigSnapshot): void;
}

/** One main window with the auxiliary windows it owns, as `MainWindows.ordered()` hands it. */
export interface ConfigFamilyView<W> {
  readonly win: W;
  readonly personaWindows: { list(): readonly { readonly persona: string }[]; entry(persona: string): { readonly win: W } | undefined };
  readonly terminalWindows: { current(): { readonly win: W } | null };
}

/**
 * The windows that take one main window's `config:changed`: the main window, each of its persona windows — which read the
 * snapshot through `useConfigSnapshot('persona')` for their entry and run-level model (`entryOf`), their declared tools
 * (REQ-MONITOR-060) and the compression threshold — and its terminal window. They are its workspace's windows (ADR-0048 B),
 * so they take its workspace's snapshot.
 *
 * Until 2026-10-03 (fin10's second repair round) the audience was the main windows alone (5df1943): a persona window was
 * never sent the snapshot again and kept the model, tools and threshold it mounted with until it was reopened. Before
 * 5df1943 every window was sent the written workspace's snapshot, whoever it belonged to.
 */
export function configFamily<W>(view: ConfigFamilyView<W>): W[] {
  const family: W[] = [view.win];
  for (const listed of view.personaWindows.list()) {
    const entry = view.personaWindows.entry(listed.persona);
    if (entry) family.push(entry.win);
  }
  const terminal = view.terminalWindows.current();
  if (terminal) family.push(terminal.win);
  return family;
}

/**
 * ADR-0037 Tier A, REQ-WORKSPACE-105, PD-SHELL-001: after one workspace's configuration is written and loaded again, each
 * main window and its family (`configFamily`) repopulates from **its own** workspace's snapshot. The windows holding `root` take the reloaded snapshot at
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
