import { z } from 'zod';

/**
 * ADR-0039 across the process boundaries: the checkpoint rows as the card lists them (REQ-GIT-086/090), a restore
 * preview as the confirmation dialog shows it (REQ-GIT-039/055/064/097), and the outcome of one restore attempt
 * (REQ-GIT-058/068). The Git work happens in the workspace service, the rows in the run host, the orchestration in
 * main; every value here crosses at least one of those boundaries.
 */

/** REQ-GIT-067: the closed vocabulary. */
export const CHECKPOINT_KINDS = ['iteration', 'pre_restore', 'manual'] as const;
export type CheckpointKind = (typeof CHECKPOINT_KINDS)[number];

/** REQ-GIT-016's record as a surface sees it; `createdLabel` is pre-formatted local time (REQ-GIT-090: the view does no date arithmetic). */
export const CheckpointRowSchema = z.object({
  sequence: z.number().int().nonnegative(),
  ref: z.string(),
  commit: z.string(),
  createdAt: z.string(),
  createdLabel: z.string(),
  iteration: z.number().int().nonnegative(),
  childName: z.string(),
  /** REQ-GIT-090: the file COUNT; the paths stay on the row in the store. */
  files: z.number().int().nonnegative(),
  kind: z.enum(CHECKPOINT_KINDS),
});
export type CheckpointRowPayload = z.infer<typeof CheckpointRowSchema>;

/** REQ-GIT-093's verdict for one session, stamped onto every listing (REQ-GIT-092). */
export const SESSION_LIVENESS = ['live', 'not-live', 'unknown'] as const;
export type SessionLiveness = (typeof SESSION_LIVENESS)[number];

/** What the run host answers for one session's checkpoints (REQ-GIT-050: rows only, no Git). */
export const CheckpointListSchema = z.object({
  sessionId: z.string(),
  rows: z.array(CheckpointRowSchema),
  lastRestoredSequence: z.number().int().nullable(),
  liveness: z.enum(SESSION_LIVENESS),
  /** REQ-GIT-053: the session's own tree — the binding's path, else the base root. */
  treeRoot: z.string(),
  /** REQ-GIT-095: non-empty when no tree can be rolled back (the binding's path is gone). */
  unavailable: z.string().nullable(),
  /** REQ-GIT-094: a stale session repaired on this open, with the status it had and why it counted as stale. */
  repaired: z.object({ previous: z.string(), reason: z.string() }).nullable(),
  /** REQ-GIT-072: the workspace's setting, read by the run host from the configuration, so the preview stages as a capture would. */
  includeUntracked: z.boolean(),
});
export type CheckpointListPayload = z.infer<typeof CheckpointListSchema>;

/** REQ-GIT-039: one entry — the letter as Git reported it, the working-tree path, the checkpoint's name for a rename. */
export const PreviewEntrySchema = z.object({ status: z.string(), path: z.string(), otherPath: z.string().optional() });
export type PreviewEntryPayload = z.infer<typeof PreviewEntrySchema>;

/** REQ-GIT-096/097/098: what the confirmation dialog is handed. */
export const CheckpointPreviewSchema = z.object({
  sessionId: z.string(),
  sequence: z.number().int(),
  treeRoot: z.string(),
  entries: z.array(PreviewEntrySchema),
  dirty: z.array(z.string()),
  blockedReason: z.string(),
  /** REQ-GIT-064's text, character for character, produced once in the workspace service. */
  text: z.string(),
  /** REQ-GIT-097's summary sentence. */
  summary: z.string(),
  /** False when a gate refuses before any confirmation is asked (gates 2 and 3); the dialog then shows `blockedReason`. */
  restorable: z.boolean(),
});
export type CheckpointPreviewPayload = z.infer<typeof CheckpointPreviewSchema>;

/** REQ-GIT-058 gate 7 / REQ-GIT-100: the outcome of one restore attempt as the renderer receives it. */
export const CheckpointRestoreOutcomeSchema = z.object({
  sequence: z.number().int(),
  restored: z.boolean(),
  safetySequence: z.number().int().nullable(),
  changedPaths: z.number().int().nonnegative(),
  blockedReason: z.string(),
});
export type CheckpointRestoreOutcomePayload = z.infer<typeof CheckpointRestoreOutcomeSchema>;

/** REQ-GIT-092's two refusal texts, fixed here so main and the dialog agree. */
export const LIVE_RUN_REFUSAL = "This session is still running. Restoring would race the run's own writes, so wait for it to finish or pause it first.";
export const LIVENESS_UNKNOWN_REFUSAL = 'Rotaris could not confirm whether this session is still running, and will not risk a restore racing a live run. Try again in a moment.';
/** REQ-GIT-091: the toast when a second desktop checkpoint operation arrives while one is in flight. */
export const CHECKPOINT_BUSY_TOAST = 'Rotaris is still reading checkpoints. Try again in a moment.';
/** REQ-GIT-095: the two unavailable reasons the listing can carry. */
export const CHECKPOINTS_NO_WORKSPACE = 'Checkpoints are unavailable without a workspace.';
export const CHECKPOINTS_NO_TREE = 'This session has no Git working tree Rotaris can roll back, so its checkpoints cannot be restored.';
/** REQ-GIT-095: the store could not be read. */
export const CHECKPOINTS_STORE_UNREADABLE = 'Rotaris could not reach the session store for this workspace.';

/** REQ-GIT-097: the summary sentence, once. */
export function restoreSummary(sequence: number, changed: number, treeRoot: string): string {
  return `This replaces ${changed === 0 ? 'nothing' : `${changed} file(s)`} in ${treeRoot} with the state recorded in checkpoint ${sequence}. Rotaris records a safety checkpoint of the current tree first, so the rollback can itself be rolled back. Your branch history is not rewritten.`;
}
/** REQ-GIT-100: the success notice's body. */
export function restoredNoticeBody(changed: number, safetySequence: number | null): string {
  return `${changed} file(s) changed. ${safetySequence === null ? 'No safety checkpoint was needed: the tree already matched the last commit.' : `Safety checkpoint ${safetySequence} holds the pre-restore state.`}`;
}
/** REQ-GIT-090: `YYYY-MM-DD HH:MM:SS` in local time, formatted where the clock is — never in the view. */
export function localCheckpointLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
