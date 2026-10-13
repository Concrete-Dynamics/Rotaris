import { isAbsolute, relative, resolve, sep } from 'node:path';
import { millis, type Millis } from '@rotaris/kernel';
import type { ChildRow } from '@rotaris/store';
import { unnamedChangesSentence, writeReadingOf } from './report.js';

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

/**
 * REQ-ORCH-088's error for a child its per-agent timeout stopped, in its fixed form "Child timed out after <N>s". The one
 * writer of the form: the settle writes the report's error through it, and `timedOutOf` reads it back, so the two cannot
 * drift (PD-CONFIG-003 revision 3).
 */
export function childTimedOutMessage(limitS: number): string {
  return `Child timed out after ${limitS}s`;
}

const CHILD_TIMED_OUT = /^Child timed out after (\d+(?:\.\d+)?)s$/;

/** What PD-CONFIG-003 revision 3 shows of a child its per-agent timeout stopped: the limit it ran under, and whether it was making progress. */
export interface TimedOut {
  readonly limitSeconds: number;
  /** PD-ORCH-004's cut-off statement is in the report: the child was cut off while making progress. */
  readonly makingProgress: boolean;
}

/**
 * PD-CONFIG-003 revision 3: whether a child's stored report carries REQ-ORCH-088's `timeout` error, and if so the limit
 * it names and whether the report carries PD-ORCH-004's cut-off statement. Null for no report, a report that is not JSON,
 * and every report with no such error — a child that succeeded (on the fallback retry too), was cancelled, or failed for
 * another reason. The stored report is JSON, so every field is re-read defensively, as `cutOffLines` does.
 */
export function timedOutOf(report: string | null | undefined): TimedOut | null {
  // Most reports carry no timeout: skip the parse unless the form is there at all (`toAgentRecord` reads every child).
  if (typeof report !== 'string' || !report.includes('Child timed out after')) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(report); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { errors, cut_off: cutOff } = parsed as { errors?: unknown; cut_off?: unknown };
  if (!Array.isArray(errors)) return null;
  for (const e of errors) {
    if (typeof e !== 'object' || e === null) continue;
    const { type, message } = e as { type?: unknown; message?: unknown };
    if (type !== 'timeout' || typeof message !== 'string') continue;
    const m = CHILD_TIMED_OUT.exec(message);
    const limitSeconds = m ? Number(m[1]) : Number.NaN;
    if (!(limitSeconds > 0)) continue;
    const statement = typeof cutOff === 'object' && cutOff !== null ? (cutOff as { statement?: unknown }).statement : undefined;
    return { limitSeconds, makingProgress: typeof statement === 'string' };
  }
  return null;
}

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
  private readonly unnamed: string[] = [];

  constructor(private readonly workspaceRoot: string) {}

  /**
   * One tool call returned to the child at `at`. A call completes whatever it returned — an error or a refusal is a
   * completed call too. A file-writing call (`writtenPathsOf`: `write_file`, `haet_edit`, `haet`, and since fin32 the
   * code-intelligence EDIT tier of REQ-MCP-015, its path read from the argument the binding manifest names) changed
   * its path only when it returned `ok`; a failed edit or a refused write changed nothing and is not listed. The name
   * is matched in lower case, because the gate dispatches a call whose name matches no executor under its lower-case
   * spelling (`Write_File` runs `write_file`), and a write it ran is a write whatever the model called it.
   *
   * The reason the EDIT tier was not read, kept beside its replacement: the three native tools were the whole list,
   * and the a68f121 duress run's tester continuation, which edited one document 11 times through the tier, was
   * reported as having changed no workspace paths (finding D1).
   *
   * OQ-245 (XE1, ruled 2026-10-13 under R-072): a cross-file EDIT call (a symbol rename, a cross-file replacement) changed
   * the files the run host observed it change (`seen.observedPaths`), listed whether it returned `ok` or not, since a
   * replacement that failed part-way had written what it wrote. With no observation, a call that ran — returned `ok`, or was
   * cut off while under way (`seen.ran`) — lists what its arguments name as a file and is remembered by name
   * (`unnamedBy`), so the report says it may have changed files the record cannot name and never that the child changed
   * none. The reason, kept beside it: until the ruling such a call listed its argument path alone, and a whole-project
   * replacement nothing (docs/defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).
   */
  completed(at: Millis, toolName: string, args: Readonly<Record<string, unknown>>, ok: boolean, seen: { readonly observedPaths?: readonly string[] | undefined; readonly ran?: boolean | undefined } = {}): void {
    this.lastCompletedAt = at;
    const reading = writeReadingOf(toolName, args, seen.observedPaths);
    if (reading === null) return;
    if (seen.observedPaths === undefined && !ok && seen.ran !== true) return;
    for (const target of reading.paths) {
      const path = workspacePath(this.workspaceRoot, target);
      if (path !== null && !this.changed.includes(path)) this.changed.push(path);
    }
    if (reading.unnamed && !this.unnamed.includes(toolName)) this.unnamed.push(toolName);
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

  /** OQ-245: the tools, by the names called, whose cross-file calls ran with no observation of what they changed. */
  unnamedBy(): readonly string[] {
    return [...this.unnamed];
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

export function cutOffReport(input: { readonly taskId: string; readonly limitS: number; readonly stallS: number; readonly changedPaths: readonly string[]; readonly isContinuation: boolean; readonly unnamedBy?: readonly string[] }): CutOff {
  const { taskId, limitS, stallS, changedPaths, isContinuation } = input;
  // OQ-245: a cross-file call whose changes went unobserved is said, and the "changed no workspace paths" sentence is then never written.
  const unnamed = unnamedChangesSentence(input.unnamedBy ?? []);
  const listed = `Workspace paths its file-writing calls changed, in the order first changed: ${changedPaths.join(', ')}.`;
  return {
    statement: `Cut off while making progress: this child completed a tool call within the final ${stallS}s before its ${limitS}s limit expired.`,
    changed_paths: [...changedPaths],
    changes: unnamed !== ''
      ? (changedPaths.length > 0 ? `${listed} Beyond these, ${unnamed}.` : `The record names no workspace path its file-writing calls changed, but ${unnamed}.`)
      : changedPaths.length > 0 ? listed : 'Its file-writing calls changed no workspace paths.',
    continuation_offer: isContinuation
      ? null
      // OQ-114 as ruled (R-071, PD-ORCH-004 revision 5): the parent is told the continuation starts with no memory, since
      // nothing of this child is injected into it (revision 2), so the parent writes the brief the continuation works from.
      : `Continuation offer: the remaining work may be delegated to a new child as a continuation of this one — call delegate with continuation_of: "${taskId}". The continuation starts with no memory of this child's work: it is given only the task you write, so write a complete brief — what was asked, what this child did and found, and what remains. A piece of work is continued once; a continuation is not offered one of its own.`,
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
 * its iteration's root, which may also take up an offer an earlier iteration, or an earlier run of its own, left
 * (revision 3). Null admits.
 */
export function continuationRefusal(reference: string, target: ChildRow | undefined, offered: boolean, continuedBy: ChildRow | undefined, asRoot = false): string | null {
  if (!target) {
    return asRoot
      ? `continuation_of '${reference}' names no child task of yours, nor a child that an earlier iteration, or an earlier run of this iteration, left: a continuation continues one of your own children or an offer the session left before (PD-ORCH-004).`
      : `continuation_of '${reference}' names no child task of yours: a continuation continues one of your own children (PD-ORCH-004).`;
  }
  if (!offered) return `Task '${target.canonical_name}' (${target.task_id}) made no continuation offer: only a child cut off by its time limit while making progress offers one, and a continuation never offers another (PD-ORCH-004).`;
  if (continuedBy) return `Task '${target.canonical_name}' (${target.task_id}) was already continued by '${continuedBy.canonical_name}' (${continuedBy.task_id}); a piece of work is continued once (PD-ORCH-004).`;
  return null;
}
