/**
 * REQ-SHELL-119 guard (2), and the same gate in the workspace-open flow (REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2),
 * REQ-WORKSPACE-012): while a worktree integration is running, a person's close of a main window is refused unconditionally
 * by an informational dialog titled "Integration in progress" whose body reads "Keep Rotaris open until the isolated worktree
 * integration finishes.", and the workspace chip's and the chooser's flow is declined with the transient error notification
 * "Finish the worktree integration before opening another project.". The guard sits between guard (1), the renderer's
 * unsaved-settings guard, and guard (3), the active-run confirmation (`close-confirmation.ts`), in both flows. The update's
 * `Restart now`, and `Update now` / `Try again` on the installer flavour, ask it too, at the click and at the hand-off
 * (`integrationAllowsUpdate`; REQ-NOTIFY-056: "Closing the application while an isolated worktree integration is running is
 * refused").
 *
 * Where it stands, as OQ-361 ruled (2026-10-20 under R-072; `PD-SHELL-009` revision 3):
 *  - the close of one of several main windows counts the closing window's own workspace, and one that holds no workspace is
 *    never refused; the last main window's close, and the update's closes, count the whole instance;
 *  - the workspace-open flow's gate (2) counts the requesting window's own workspace, and a window that holds no workspace
 *    passes it;
 *  - a record main cannot read refuses no person's close and declines no workspace-open request (a `warn` line, then guard
 *    (3) or gate (3)); the update declines on it instead, since a declined update traps nothing (REQ-NOTIFY-056).
 *
 * What it reads. "Running" is main's own record of an integration it admitted (REQ-GIT-124's refusals passed) and has not
 * seen end. The end is REQ-GIT-133's promotion or failure, a preparation failure under REQ-GIT-127 or REQ-GIT-130, or the
 * process carrying the integration reported gone. The record is keyed by the base workspace id that main's window record
 * holds (REQ-GIT-128: "At most one integration runs per base workspace at a time"). It is never a worktree binding's
 * `merge_status` (REQ-GIT-130 flushes `integrating` and only REQ-GIT-133 resets it, so a crash would leave a window no answer
 * could close), and never REQ-GIT-128's lock file. Nothing in the product keeps that record yet: worktree integration and
 * "Merge selected" (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135) are deferred from the first release
 * (`docs/architecture/first-release-plan.md`, "Deferred by "thats it""). So main is wired to `noWorktreeIntegration`, which
 * answers "none running" for every workspace and for the instance, and every guard and gate here is vacuous until
 * integration is built; its builder replaces that one reader, and the guard's place in both orders is already held.
 */

export const INTEGRATION_IN_PROGRESS_TITLE = 'Integration in progress';
export const INTEGRATION_IN_PROGRESS_BODY = 'Keep Rotaris open until the isolated worktree integration finishes.';
/** REQ-SHELL-021 gate (2) and REQ-STARTUP-053 gate (2): the decline's exact sentence. */
export const FINISH_INTEGRATION_FIRST = 'Finish the worktree integration before opening another project.';

/**
 * The informational dialog main shows (Electron's `MessageBoxOptions`): its only answer is acknowledgement, which is also what
 * Escape and the box's close control give (REQ-SHELL-164, REQ-SHELL-055). Every answer refuses the close.
 */
export interface IntegrationInProgressBox {
  type: 'info';
  title: string;
  message: string;
  buttons: string[];
  defaultId: 0;
  cancelId: 0;
  noLink: true;
}

export function integrationInProgressBox(): IntegrationInProgressBox {
  return { type: 'info', title: INTEGRATION_IN_PROGRESS_TITLE, message: INTEGRATION_IN_PROGRESS_BODY, buttons: ['OK'], defaultId: 0, cancelId: 0, noLink: true };
}

/**
 * Whether main records a worktree integration running (OQ-361 (c)): with a workspace id, one for that base workspace; with
 * none, one anywhere in the instance. A rejection is a record main cannot read.
 */
export type WorktreeIntegrationRunning = (workspaceId?: string) => Promise<boolean>;

/**
 * The product's reader today: main admits no integration, because no code integrates a worktree (REQ-GIT-083, REQ-GIT-125 to
 * REQ-GIT-135, deferred). It answers false for a workspace and for the instance alike. Replaced, not extended, when
 * integration is built.
 */
export const noWorktreeIntegration: WorktreeIntegrationRunning = () => Promise.resolve(false);

const causeOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** A line that cannot be written is not the guard's to fail on. */
const writeLine = (write: (message: string) => void, message: string): void => {
  try { write(message); } catch { /* the guard's answer does not depend on its log */ }
};

export interface IntegrationCloseDeps {
  /** Whether another main window stays open after this close (`anotherMainWindowStays`); false at the last window. */
  readonly othersStaying: () => boolean;
  /** The closing window's own workspace id, from main's window record; absent when it holds no workspace. */
  readonly workspaceId?: string | undefined;
  readonly running: WorktreeIntegrationRunning;
  /** Shows the box; its answer refuses the close whatever it is. */
  readonly show: (box: IntegrationInProgressBox) => Promise<unknown>;
  readonly log: (message: string) => void;
  /** Main's log at `warn`: the record could not be read. */
  readonly warn: (message: string) => void;
}

/** Shows the box over a refusal; a box that cannot be shown is logged, and the refusal stands. */
async function showRefusal(deps: Pick<IntegrationCloseDeps, 'show' | 'log'>, what: string): Promise<void> {
  await Promise.resolve()
    .then(() => deps.show(integrationInProgressBox()))
    .catch((cause: unknown) => {
      writeLine(deps.log, `${what}: the "${INTEGRATION_IN_PROGRESS_TITLE}" dialog could not be shown (${causeOf(cause)}); ${what === 'close' ? 'the close is refused' : 'nothing is started'} all the same (REQ-SHELL-119 guard 2)`);
    });
}

/**
 * REQ-SHELL-119 guard (2) at a person's close of a main window: true when the close may go on to guard (3). Under OQ-361
 * (`PD-SHELL-009` revision 3) the close of one of several windows asks about the closing window's own workspace and is
 * never refused for a window that holds none; the last window's close asks about the whole instance. While an integration
 * runs, the box is shown and the close is refused, whatever the answer and even when the box cannot be shown. A record that
 * cannot be read refuses no close: one `warn` line, and the close goes on to guard (3). Never rejects.
 */
export async function integrationAllowsClose(deps: IntegrationCloseDeps): Promise<boolean> {
  let othersStaying: boolean;
  try { othersStaying = deps.othersStaying(); } catch { othersStaying = false; }
  const workspaceId = deps.workspaceId === '' ? undefined : deps.workspaceId;
  if (othersStaying && workspaceId === undefined) return true;
  let running: boolean;
  try {
    running = await (othersStaying ? deps.running(workspaceId) : deps.running());
  } catch (cause) {
    writeLine(deps.warn, `close: the worktree-integration record could not be read (${causeOf(cause)}); the close goes on to guard 3 (REQ-SHELL-119 guard 2, PD-SHELL-009 revision 3)`);
    return true;
  }
  if (!running) return true;
  await showRefusal(deps, 'close');
  writeLine(deps.log, 'close: refused while a worktree integration is running (REQ-SHELL-119 guard 2)');
  return false;
}

/**
 * REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2) and REQ-WORKSPACE-012: the decline's sentence while main records an
 * integration running for the requesting window's own workspace, `null` when the flow goes on to gate (3) (OQ-361,
 * `PD-SHELL-009` revision 3). A window that holds no workspace passes without asking; a record that cannot be read declines
 * nothing and writes one `warn` line.
 */
export async function integrationDeclinesWorkspaceOpen(
  running: WorktreeIntegrationRunning,
  workspaceId: string | undefined,
  warn: (message: string) => void,
): Promise<string | null> {
  if (workspaceId === undefined || workspaceId === '') return null;
  try {
    return (await running(workspaceId)) ? FINISH_INTEGRATION_FIRST : null;
  } catch (cause) {
    writeLine(warn, `workspace open: the worktree-integration record could not be read (${causeOf(cause)}); the flow goes on to gate 3 (REQ-SHELL-021 gate 2, PD-SHELL-009 revision 3)`);
    return null;
  }
}

export interface IntegrationUpdateDeps {
  readonly running: WorktreeIntegrationRunning;
  readonly show: (box: IntegrationInProgressBox) => Promise<unknown>;
  readonly log: (message: string) => void;
  readonly warn: (message: string) => void;
}

/**
 * REQ-SHELL-119 guard (2) and REQ-NOTIFY-056 at the update's closes (OQ-361 (a)): `Restart now`, and `Update now` /
 * `Try again` on the installer flavour, close every main window, so the whole instance is asked. True when no integration
 * runs. While one runs, the box is shown (a box that cannot be shown is logged), a line is written and the answer is false.
 * A record that cannot be read declines too, with no box and one `warn` line: a declined update traps nothing, since every
 * window stays closable and the update stays offered. Never rejects.
 */
export async function integrationAllowsUpdate(deps: IntegrationUpdateDeps): Promise<boolean> {
  let running: boolean;
  try {
    running = await deps.running();
  } catch (cause) {
    writeLine(deps.warn, `update: the worktree-integration record could not be read (${causeOf(cause)}); nothing is started (REQ-SHELL-119 guard 2, REQ-NOTIFY-056, OQ-361)`);
    return false;
  }
  if (!running) return true;
  await showRefusal(deps, 'update');
  writeLine(deps.log, 'update: declined while a worktree integration is running; nothing is started (REQ-SHELL-119 guard 2, REQ-NOTIFY-056, OQ-361)');
  return false;
}
