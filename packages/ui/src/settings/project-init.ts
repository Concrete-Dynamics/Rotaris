import { classificationSentence, type InitializationView } from '@rotaris/contracts';

/**
 * ADR-0064 — what the two initialization surfaces state, as pure functions (REQ-WORKSPACE-113,
 * REQ-WORKSPACE-114).
 *
 * Both readings are taken from REQ-WORKSPACE-105's nine values and nothing else, so a proof can
 * assert every sentence without a window, and the card and the sidebar can never disagree about what
 * the same state means.
 */

/** REQ-WORKSPACE-114: the six, and the fixed order the first holding condition is chosen in. */
export const PROJECT_INIT_STATES = ['running', 'failed', 'pending', 'deferred', 'completed', 'empty'] as const;
export type ProjectInitState = (typeof PROJECT_INIT_STATES)[number];

export interface ProjectInitCard {
  readonly state: ProjectInitState;
  readonly headline: string;
  readonly lines: readonly string[];
  readonly button: string;
  readonly buttonDisabled: boolean;
  /** REQ-NOTIFY-008: a disabled action names its condition; empty when the action is available. */
  readonly buttonReason: string;
  /** REQ-WORKSPACE-114: the *running* state alone carries an indeterminate indicator. */
  readonly busy: boolean;
}

export function labelsOf(ids: readonly string[], labels: Readonly<Record<string, string>>): string {
  return ids.map((id) => labels[id] ?? id).join(', ');
}

/** REQ-WORKSPACE-114: the date part of the recorded `last_run`, which is already ISO-8601 UTC. */
export function dateOf(lastRun: string | null): string {
  return lastRun === null ? '' : lastRun.slice(0, 10);
}

/**
 * REQ-WORKSPACE-114. The order is stated in the requirement and is the whole of why the card never
 * has to choose between two conditions arbitrarily: what is in flight outranks what has already
 * happened, an unresolved failure outranks work still merely owed, and work still owed outranks work
 * the user deferred.
 */
export function projectInitCard(view: InitializationView, labels: Readonly<Record<string, string>>): ProjectInitCard {
  const runnable = [...view.pending, ...view.skipped];
  const completedLabels = labelsOf(view.completed, labels);
  const date = dateOf(view.lastRun);

  if (view.running) {
    return { state: 'running', headline: 'Initializing project…', lines: [], button: 'Initializing…', buttonDisabled: true, buttonReason: 'A setup run is already under way.', busy: true };
  }
  if (view.lastError !== null && view.lastError !== '') {
    return {
      state: 'failed',
      headline: 'Initialization failed',
      lines: [`${view.lastError} Nothing was recorded, so ${labelsOf(runnable, labels)} can be run again.`],
      button: 'Retry initialization', buttonDisabled: false, buttonReason: '', busy: false,
    };
  }
  if (view.pending.length > 0) {
    return { state: 'pending', headline: 'Initialization pending', lines: [`Not run yet: ${labelsOf(view.pending, labels)}.`], button: 'Initialize project', buttonDisabled: false, buttonReason: '', busy: false };
  }
  if (view.skipped.length > 0) {
    const lines = view.completed.length > 0 ? [`Completed: ${completedLabels} on ${date}.`] : [];
    return {
      state: 'deferred',
      headline: 'Initialization deferred',
      lines: [...lines, `You skipped ${labelsOf(view.skipped, labels)}. Run them whenever you want.`],
      button: 'Initialize project', buttonDisabled: false, buttonReason: '', busy: false,
    };
  }
  if (view.completed.length > 0) {
    // The wording of the completed sentence is left to the implementation; what it must convey is
    // fixed — that every initialization task applying to this workspace has been completed, and when.
    const sentence = `Every initialization task for this workspace has been completed, on ${date}.`;
    const classification = classificationSentence(view.classification);
    return {
      state: 'completed',
      headline: 'Project initialized',
      lines: classification === '' ? [sentence] : [sentence, classification],
      button: 'Initialize project', buttonDisabled: true,
      buttonReason: 'Every initialization task for this workspace is already resolved.',
      busy: false,
    };
  }
  return {
    state: 'empty',
    headline: 'Nothing to initialize yet',
    lines: ['No initialization task applies to this workspace. A task appears here once the tool it depends on is configured — add it under MCP Servers and reload the workspace.'],
    button: 'Initialize project', buttonDisabled: true,
    buttonReason: 'No initialization task applies to this workspace.',
    busy: false,
  };
}

export interface ProjectSidebarSection {
  readonly hidden: boolean;
  readonly label: string;
  readonly disabled: boolean;
  readonly hint: string;
}

/**
 * REQ-WORKSPACE-113: the Workspace sidebar's Project section. Hidden when everything is resolved or
 * nothing applies — a section offering nothing is worse than no section — and never triggering
 * itself: it opens the same dialog Settings does, listing every runnable task, skipped ones included.
 */
export function projectSidebarSection(view: InitializationView, labels: Readonly<Record<string, string>>): ProjectSidebarSection {
  const runnable = [...view.pending, ...view.skipped];
  const failure = view.lastError !== null && view.lastError !== '' ? ` Last run failed: ${view.lastError}` : '';
  if (view.running) return { hidden: false, label: 'Initializing…', disabled: true, hint: `Running the pending setup tasks.${failure}` };
  if (runnable.length === 0) return { hidden: true, label: '', disabled: true, hint: '' };
  return { hidden: false, label: 'Initialize Project…', disabled: false, hint: `Not run yet: ${labelsOf(runnable, labels)}.${failure}` };
}
