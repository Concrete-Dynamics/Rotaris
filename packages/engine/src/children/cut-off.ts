import { isAbsolute, relative, resolve, sep } from 'node:path';
import { millis, type Millis } from '@rotaris/kernel';
import type { ChildRow } from '@rotaris/store';
import { isFileWritingTool } from './report.js';

/**
 * PD-ORCH-004 — a child cut off while making progress hands its work back to the parent. REQ-ORCH-088's expiry path
 * is unchanged (landing, the one fallback retry, `failed` with `Child timed out after <N>s`); this module holds the
 * three things the directive adds to its last step, as pure units the orchestration wires:
 *
 * - **the progress rule** — a child is making progress when it completed at least one tool call within the final
 *   stall window before its limit expired (`ProgressLog.madeProgress`, read at the expiry instant);
 * - **the report's additions** — the statement, the workspace paths its own file-writing calls changed in the order
 *   first changed (or a statement that it changed none), and the continuation offer, which a continuation never gets
 *   (`cutOffReport`, rendered for the parent by `cutOffLines`);
 * - **the admission of a continuation** — `delegate`'s `continuation_of` names the child continued; it is refused
 *   unless that child is the caller's own and made the offer, and refused again once it has been continued
 *   (`continuationRefusal`).
 *
 * Nothing here resumes a child or composes a corrective message (REQ-NOTIFY-112 still governs): the continuation is
 * the parent's decision.
 */

/** REQ-NOTIFY-100 / REQ-CONFIG-113: `runtime.child_stall_timeout`'s default, 90 s — used where the run is handed none. */
export const CHILD_STALL_TIMEOUT_MS: Millis = millis(90_000);

/**
 * `raw` as a path relative to the workspace root in `/` form, or null when it names the root itself or a place
 * outside it. PD-ORCH-004 asks for the *workspace* paths a child changed, so a write outside the root (possible under
 * `runtime.allow_outside_workspace`) is not one of them. Resolution is lexical: `./a` and `<root>/a` are `a`, and a
 * symbolic link is not followed. That is a literal reading stated in PD-ORCH-004's first execution, and it differs
 * from the file tools' fence, which decides "inside" on real paths: a write spelled through the real path of a root
 * reached by a link is accepted by the fence and left out here, and on a case-insensitive filesystem `Src/A.ts` and
 * `src/a.ts` are listed as two paths.
 */
export function workspacePath(root: string, raw: string): string | null {
  if (raw === '') return null;
  const rel = relative(resolve(root), resolve(root, raw));
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * What one child did that PD-ORCH-004 reads: when its tool calls completed, and which workspace paths its own
 * file-writing calls changed. It lives for the child's whole run — both attempts when REQ-ORCH-088's fallback retry
 * takes one — and it sees only this child's calls, never a grandchild's (each agent has its own turn and its own log).
 */
export class ProgressLog {
  private lastCompletedAt: Millis | null = null;
  private readonly changed: string[] = [];

  constructor(private readonly workspaceRoot: string) {}

  /**
   * One tool call returned to the child at `at`. A call completes whatever it returned — an error or a refusal is a
   * completed call too. A file-writing call (`write_file`, `haet_edit`, `haet`) changed its path only when it
   * returned `ok`; a failed edit or a refused write changed nothing and is not listed. The name is matched in lower
   * case, because the gate dispatches a call whose name matches no executor under its lower-case spelling
   * (`Write_File` runs `write_file`), and a write it ran is a write whatever the model called it.
   */
  completed(at: Millis, toolName: string, args: Readonly<Record<string, unknown>>, ok: boolean): void {
    this.lastCompletedAt = at;
    if (!ok || !isFileWritingTool(toolName)) return;
    const target = args['path'] ?? args['file_path'];
    const path = typeof target === 'string' ? workspacePath(this.workspaceRoot, target) : null;
    if (path !== null && !this.changed.includes(path)) this.changed.push(path);
  }

  /**
   * The progress rule, read at the instant the limit expired: a call completed at `expiredAt - stallMs` or later is
   * within the final window (the bound is inclusive), one completed a millisecond earlier is not. Called from the
   * expiry itself, so a call that completes during the landing that follows is never counted as progress.
   */
  madeProgress(expiredAt: Millis, stallMs: Millis): boolean {
    return this.lastCompletedAt !== null && this.lastCompletedAt <= expiredAt && expiredAt - this.lastCompletedAt <= stallMs;
  }

  /** The workspace paths changed, in the order first changed, each once. */
  changedPaths(): readonly string[] {
    return [...this.changed];
  }
}

/** The three additions, as the failed record's report carries them (the `cut_off` field). */
export interface CutOff {
  /** (1) that the child was cut off while making progress. */
  readonly statement: string;
  /** (2) the workspace paths its own file-writing calls changed, in the order first changed. */
  readonly changed_paths: readonly string[];
  /** (2) rendered: the list, or the statement that it changed none. */
  readonly changes: string;
  /** (3) the continuation offer; null for a child that is itself a continuation, so work is never chained. */
  readonly continuation_offer: string | null;
}

export function cutOffReport(input: { readonly taskId: string; readonly limitS: number; readonly stallS: number; readonly changedPaths: readonly string[]; readonly isContinuation: boolean }): CutOff {
  const { taskId, limitS, stallS, changedPaths, isContinuation } = input;
  return {
    statement: `Cut off while making progress: this child completed a tool call within the final ${stallS}s before its ${limitS}s limit expired.`,
    changed_paths: [...changedPaths],
    changes: changedPaths.length > 0
      ? `Workspace paths its file-writing calls changed, in the order first changed: ${changedPaths.join(', ')}.`
      : 'Its file-writing calls changed no workspace paths.',
    continuation_offer: isContinuation
      ? null
      : `Continuation offer: the remaining work may be delegated to a new child as a continuation of this one — call delegate with continuation_of: "${taskId}". A piece of work is continued once; a continuation is not offered one of its own.`,
  };
}

/** The lines a parent reads, in the directive's order; `cut_off` is re-read defensively because a stored report is JSON. */
export function cutOffLines(cutOff: Partial<CutOff> | undefined): readonly string[] {
  if (!cutOff || typeof cutOff.statement !== 'string') return [];
  return [cutOff.statement, cutOff.changes ?? '', cutOff.continuation_offer ?? ''].filter((l) => l !== '');
}

/**
 * Admission of `delegate`'s `continuation_of`, before any record exists (the refusals beside it in `delegate` are
 * of the same kind). `target` is the named child when the caller owns it; `offered` is whether its stored report
 * carries a continuation offer; `continuedBy` is a child already recorded as its continuation. `asRoot`: the caller is
 * its iteration's root, which may also take up an offer an earlier iteration left (revision 3). Null admits.
 */
export function continuationRefusal(reference: string, target: ChildRow | undefined, offered: boolean, continuedBy: ChildRow | undefined, asRoot = false): string | null {
  if (!target) {
    return asRoot
      ? `continuation_of '${reference}' names no child task of yours, nor a child an earlier iteration of this session left: a continuation continues one of your own children or an offer an earlier iteration left (PD-ORCH-004).`
      : `continuation_of '${reference}' names no child task of yours: a continuation continues one of your own children (PD-ORCH-004).`;
  }
  if (!offered) return `Task '${target.canonical_name}' (${target.task_id}) made no continuation offer: only a child cut off by its time limit while making progress offers one, and a continuation never offers another (PD-ORCH-004).`;
  if (continuedBy) return `Task '${target.canonical_name}' (${target.task_id}) was already continued by '${continuedBy.canonical_name}' (${continuedBy.task_id}); a piece of work is continued once (PD-ORCH-004).`;
  return null;
}
