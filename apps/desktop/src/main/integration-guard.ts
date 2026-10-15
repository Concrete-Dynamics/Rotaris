/**
 * REQ-SHELL-119 guard (2), and the same gate in the workspace-open flow (REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2)):
 * while a worktree integration is running, a person's close of a main window is refused unconditionally by an informational
 * dialog titled "Integration in progress" whose body reads "Keep Rotaris open until the isolated worktree integration
 * finishes.", and the workspace chip's and the chooser's flow is declined with the transient error notification "Finish the
 * worktree integration before opening another project.". The guard sits between guard (1), the renderer's unsaved-settings
 * guard, and guard (3), the active-run confirmation (`close-confirmation.ts`), in both flows.
 *
 * What it reads. A worktree integration running is a session's worktree binding whose `merge_status` is `'integrating'`
 * (`MERGE_STATUSES`, `packages/contracts/src/repository.ts`). Nothing in the product writes that status yet: worktree
 * integration and "Merge selected" (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135) are deferred from the first release
 * (`docs/architecture/first-release-plan.md`, "Deferred by "thats it""). So main is wired to `noWorktreeIntegration`, which
 * answers "none running" and names that state, and the guard is vacuous until integration is built; the builder of
 * integration replaces that one reader and the guard's place in both orders is already held. Where else the guard stands
 * (the update's closes, one of several windows, a state that cannot be read) is OQ-361's
 * (`docs/architecture/open-questions.md`); the build proceeds under the reading this module states.
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

/** Whether a worktree integration is running in this instance. */
export type WorktreeIntegrationRunning = () => Promise<boolean>;

/**
 * The product's reader today: no session's worktree binding can be `'integrating'`, because no code integrates a worktree
 * (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135, deferred). Replaced, not extended, when integration is built.
 */
export const noWorktreeIntegration: WorktreeIntegrationRunning = () => Promise.resolve(false);

export interface IntegrationCloseDeps {
  readonly running: WorktreeIntegrationRunning;
  /** Shows the box; its answer refuses the close whatever it is. */
  readonly show: (box: IntegrationInProgressBox) => Promise<unknown>;
  readonly log: (message: string) => void;
}

/**
 * REQ-SHELL-119 guard (2): true when the close may go on to guard (3). While an integration runs, the box is shown and the
 * close is refused, whatever the answer and even when the box cannot be shown. A state that cannot be read counts as an
 * integration running, as an active-run count that cannot be read counts as a run active (OQ-361 (c)).
 */
export async function integrationAllowsClose(deps: IntegrationCloseDeps): Promise<boolean> {
  const running = await deps.running().catch(() => true);
  if (!running) return true;
  await deps.show(integrationInProgressBox()).catch((cause: unknown) => {
    deps.log(`close: the "${INTEGRATION_IN_PROGRESS_TITLE}" dialog could not be shown (${cause instanceof Error ? cause.message : String(cause)}); the close is refused all the same (REQ-SHELL-119 guard 2)`);
  });
  deps.log(`close: refused while a worktree integration is running (REQ-SHELL-119 guard 2)`);
  return false;
}

/**
 * REQ-SHELL-021 gate (2) and REQ-STARTUP-053 gate (2): the decline's sentence while an integration runs, `null` when the flow
 * goes on to gate (3). A state that cannot be read declines, as at the close.
 */
export async function integrationDeclinesWorkspaceOpen(running: WorktreeIntegrationRunning): Promise<string | null> {
  return (await running().catch(() => true)) ? FINISH_INTEGRATION_FIRST : null;
}
