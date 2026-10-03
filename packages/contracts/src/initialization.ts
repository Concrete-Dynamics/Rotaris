import { z } from 'zod';

/**
 * ADR-0064 — project initialization on the wire (REQ-WORKSPACE-105, REQ-WORKSPACE-087,
 * REQ-WORKSPACE-109).
 *
 * Three shapes cross a process boundary: the nine values the interface works from, one task's
 * result, and the running report a live execution publishes. The vocabulary they use is stated here
 * once so the coordinator in main, the settings card, the sidebar section and the dialog cannot
 * drift — the same discipline `confinement.ts` applies to the availability verdict.
 */

/** REQ-WORKSPACE-098: the two verdicts, and no third. */
export const WORKSPACE_CLASSIFICATIONS = ['code', 'non-code'] as const;
export type WorkspaceClassificationValue = (typeof WORKSPACE_CLASSIFICATIONS)[number];

/** REQ-WORKSPACE-087: a task's own status is a closed three. */
export const INIT_TASK_STATUSES = ['success', 'skipped', 'failure'] as const;

/**
 * REQ-WORKSPACE-087: a **step's** status is an open vocabulary — the generic three plus task-specific
 * values such as `skipped-no-code` (REQ-WORKSPACE-091). It is a string on the wire for that reason,
 * and the interface renders the detail text rather than this token.
 */
export const InitStepResultSchema = z.object({
  name: z.string(),
  status: z.string(),
  detail: z.string(),
});
export type InitStepResult = z.infer<typeof InitStepResultSchema>;

export const InitTaskReportSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(INIT_TASK_STATUSES),
  steps: z.array(InitStepResultSchema),
  error: z.string(),
  retryable: z.boolean(),
  summary: z.string(),
});
export type InitTaskReport = z.infer<typeof InitTaskReportSchema>;

/**
 * REQ-WORKSPACE-109: a run ends in exactly one of three ways — every attempted task's result
 * reported, the run as a whole failed (nothing recorded for any task), or cancelled.
 */
export const INIT_RUN_OUTCOMES = ['reported', 'failed', 'cancelled'] as const;
export type InitRunOutcome = (typeof INIT_RUN_OUTCOMES)[number];

/**
 * The live shape of an execution. `tasks` grows as tasks are attempted and each task's `steps` grows
 * as steps finish, which is REQ-WORKSPACE-109's "shown at the moment that step finishes, rather than
 * being withheld until the task ends". `current` names the task announced but not yet concluded.
 */
export const InitRunReportSchema = z.object({
  running: z.boolean(),
  /** The task announced under its display label and not yet concluded, or null between tasks. */
  current: z.string().nullable(),
  currentLabel: z.string(),
  /** Its steps so far. A concluded task's steps live on its own report; these are the live ones. */
  currentSteps: z.array(InitStepResultSchema),
  tasks: z.array(InitTaskReportSchema),
  outcome: z.enum(INIT_RUN_OUTCOMES).nullable(),
  /** Set only for the `failed` outcome — the run as a whole, distinct from a task's own error. */
  error: z.string(),
});
export type InitRunReport = z.infer<typeof InitRunReportSchema>;

export const EMPTY_RUN_REPORT: InitRunReport = Object.freeze({ running: false, current: null, currentLabel: '', currentSteps: [], tasks: [], outcome: null, error: '' });

/** REQ-WORKSPACE-105: exactly nine values, and the interface works from nothing else. */
export const InitializationViewSchema = z.object({
  pending: z.array(z.string()),
  consentPending: z.array(z.string()),
  completed: z.array(z.string()),
  skipped: z.array(z.string()),
  classification: z.enum(WORKSPACE_CLASSIFICATIONS).nullable(),
  neverInitialized: z.boolean(),
  lastRun: z.string().nullable(),
  running: z.boolean(),
  lastError: z.string().nullable(),
});
export type InitializationView = z.infer<typeof InitializationViewSchema>;

/**
 * The display label and description of every id the view names, so no surface keeps a second
 * id-to-label table (REQ-WORKSPACE-105: "Task ids SHALL be shown as display labels … and any other
 * id displays as itself"). A description is empty for an id no registered task claims.
 */
export const InitializationStateSchema = z.object({
  view: InitializationViewSchema,
  labels: z.record(z.string(), z.string()),
  descriptions: z.record(z.string(), z.string()),
  report: InitRunReportSchema,
  /** REQ-WORKSPACE-102: the resolution itself failed; the window stays usable and offers "Check again". */
  resolutionFailed: z.boolean(),
  /**
   * The run `report` describes was started by the resolution for pending background tasks (REQ-WORKSPACE-083), not by
   * the user. Nothing renders such a run's progress live (REQ-WORKSPACE-103), so the setup dialog takes its report only
   * once the user has pressed Initialize (REQ-WORKSPACE-110), and it neither answers nor withdraws the setup prompt
   * (OQ-123). False before any run.
   */
  backgroundRun: z.boolean(),
});
export type InitializationStateView = z.infer<typeof InitializationStateSchema>;

export const EMPTY_INITIALIZATION_VIEW: InitializationView = Object.freeze({
  pending: [], consentPending: [], completed: [], skipped: [],
  classification: null, neverInitialized: true, lastRun: null, running: false, lastError: null,
});

/**
 * REQ-WORKSPACE-102: the one surface a failed resolution shows. Both sentences are fixed, and the
 * second is the load-bearing half — a resolution that could not be made does **not** block runs
 * (REQ-WORKSPACE-142), and saying so is what stops a user treating it as a stop.
 */
export const RESOLUTION_FAILED_HEADLINE = 'Project setup could not be checked';
export const RESOLUTION_FAILED_DETAIL = 'Rotaris could not work out whether this workspace still needs setting up. Runs are not blocked; you can check again.';

/**
 * REQ-WORKSPACE-103: a failed **background** run — one the user never asked for — reaches a banner
 * rather than a dialog, carrying the task's own summary, and adds the second sentence when the run
 * broke down entirely rather than a task having failed.
 */
export const BACKGROUND_FAILED_HEADLINE = 'Project setup did not finish';
export const BACKGROUND_FAILED_FALLBACK = 'Rotaris could not finish setting this workspace up for code search.';
export const BACKGROUND_BROKE_DOWN = 'Runs are not blocked; you can try again.';

/**
 * REQ-WORKSPACE-112: the composer gate's two texts. The Send control's reason is stated here rather
 * than in `packages/ui/src/composer.ts`, whose `PROJECT_SETUP_REFUSAL` was written against
 * REQ-CHAT-007 — which leaves this wording to the implementation where REQ-WORKSPACE-112 fixes it,
 * and fixes it differently. The two requirements disagree; the disagreement is recorded at
 * `docs/defects/fixed/two-requirements-fix-the-composer-setup-refusal-differently.md` and the more specific
 * statement is followed here, its text satisfying both facts REQ-CHAT-007 requires.
 */
export const PROJECT_SETUP_SEND_REASON = 'Answer the project setup prompt first. Initialize or skip it in the setup window; nothing else in Rotaris is blocked.';
export const PROJECT_SETUP_SUBMIT_HEADLINE = 'Project setup is unanswered';
export const PROJECT_SETUP_SUBMIT_DETAIL = 'Initialize this workspace or skip its setup before starting a run.';

/** REQ-WORKSPACE-101: the two sentences the Settings Project area explains a recorded verdict with. */
export function classificationSentence(classification: WorkspaceClassificationValue | null): string {
  if (classification === null) return '';
  return classification === 'non-code'
    ? 'No code memories were created — this workspace is a documentation-only project.'
    : 'Code memories were created from this workspace\'s sources.';
}

/** REQ-WORKSPACE-110: a consent-requiring task needs a model, and the refusal says so before anything starts. */
export const NEEDS_PROVIDER_HEADLINE = 'Project setup needs a provider';
export const NEEDS_PROVIDER_DETAIL = 'This setup step runs an agent, so it needs a model provider. Authenticate one in Settings, then start it again.';

/** REQ-WORKSPACE-110: nothing left to run. */
export const NOTHING_LEFT = 'Everything in this workspace is already set up.';

/** REQ-WORKSPACE-111: a skip whose write failed keeps the dialog open and says why. */
export const SKIP_WRITE_FAILED = (cause: string): string => `Your choice could not be saved: ${cause}`;

/** REQ-WORKSPACE-085: a task that ran but whose marker write failed is a retryable failure, not a success. */
export const MARKER_WRITE_FAILED = (label: string, cause: string): string => `${label} completed, but the workspace config could not be written: ${cause}`;
export const MARKER_WRITE_FAILED_SUMMARY = (label: string): string => `${label} finished, but the result could not be saved. Retry initialization.`;
