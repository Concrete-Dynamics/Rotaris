/**
 * Stage C — the module-level openers a few gestures act through, and why they are module-level.
 *
 * Both callers are places that cannot hold the bridge. The command palette's entry runs against a
 * `CommandContext` which carries no command channel (`commands/registry.ts`), and the transient
 * acknowledgement's action is drawn by `Acknowledgements.tsx`, a leaf the renderer mounts once per window with
 * a props list that belongs to `REQ-NOTIFY-013`'s surface rather than to this flow. `packages/ui` never holds
 * the bridge at all. So the renderer binds these once and the surfaces read them at the moment they act — the
 * shape `terminal/host.tsx` and `slash/host.ts` already took, for the same reason, stated here rather than
 * hidden. A leaf module, so the registry can import it without a cycle through the catalogue.
 *
 * Nothing here decides anything: each opener is a request to main, which owns the gates, the chooser and the
 * window lifecycle. A window with nothing bound does nothing, which is what an auxiliary window should do.
 */

/** `PD-SHELL-001`'s add route: the palette entry and the chip's modifier-click both ask for this. */
let projectFolderOpener: (() => void) | null = null;
export function bindProjectFolderOpener(fn: (() => void) | null): void { projectFolderOpener = fn; }
/** Returns false where no opener is bound (an auxiliary window), which the registry's entry states. */
export function openProjectFolderInNewWindow(): boolean {
  if (projectFolderOpener === null) return false;
  projectFolderOpener();
  return true;
}

/**
 * `PD-WORKSPACE-001`'s action: the start-session surface of this window, for the workspace it already has open.
 * It is the window's own `REQ-SHELL-125` dialog — the same one `/new` and the Overview's control open — so the
 * offer leads somewhere that already exists rather than to a second way of starting a session.
 */
let newSessionOpener: (() => void) | null = null;
export function bindNewSessionOpener(fn: (() => void) | null): void { newSessionOpener = fn; }
export function startNewSessionFromOffer(): boolean {
  if (newSessionOpener === null) return false;
  newSessionOpener();
  return true;
}

/**
 * PD-LIBRARY-002's gesture, raised from exactly three surfaces — the Library's Proposals tab, the Overview's
 * proposals card and the command palette — and from nowhere else: no run completion, no schedule, no agent.
 * All three act through this one opener rather than three routes, because the palette cannot hold the bridge
 * and because one route is one place for the refusal and its notice to arrive at.
 */
let retrospectiveStarter: (() => void) | null = null;
export function bindRetrospectiveStarter(fn: (() => void) | null): void { retrospectiveStarter = fn; }
/** False where no starter is bound (an auxiliary window), which is a window with no workspace to look back over. */
export function startRetrospective(): boolean {
  if (retrospectiveStarter === null) return false;
  retrospectiveStarter();
  return true;
}
