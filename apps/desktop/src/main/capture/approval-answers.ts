/**
 * The approval dialog's scripted answers — verification only. Main reads the raw text from the environment behind
 * `__ROTARIS_SEAMS__` and hands it here, so a packaged build never reads it
 * (`docs/defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md`). This module names no variable,
 * so it carries nothing the packaged seam check would have to find.
 *
 * The grammar, entries separated by `;;`:
 *   - `<answer>` alone: every dialog of a tool no other entry names takes it (the one form the seam had before);
 *   - `<tool>=<answer>[,<answer>…]`: the k-th dialog presented for that tool takes the k-th answer, and the last answer
 *     repeats past the list.
 * An answer is `once`, `session`, `deny`, `escape` or `none` (leave the dialog unanswered — the away-state proof's wait to
 * its timeout, PD-TOOLS-005), optionally followed by `@<ms>`, the delay before it is given (else the caller's default).
 */
export type ApprovalAnswerKind = 'once' | 'session' | 'deny' | 'escape' | 'none';
export interface ApprovalAnswer {
  readonly kind: ApprovalAnswerKind;
  /** Milliseconds after the dialog is shown; null takes the caller's default. */
  readonly afterMs: number | null;
}
export interface ApprovalAnswerer {
  /** The answer for the next dialog presented for `toolName`, or null when the text names none for it. */
  next(toolName: string): ApprovalAnswer | null;
  /** Entries the text could not read, each named; an unreadable entry answers nothing. */
  readonly problems: readonly string[];
}

const KINDS: readonly ApprovalAnswerKind[] = ['once', 'session', 'deny', 'escape', 'none'];

function readAnswer(text: string): ApprovalAnswer | null {
  const m = /^(\w+)(?:@(\d+))?$/.exec(text.trim());
  if (!m || !(KINDS as readonly string[]).includes(m[1]!)) return null;
  return { kind: m[1] as ApprovalAnswerKind, afterMs: m[2] === undefined ? null : Number(m[2]) };
}

/** The button a non-key answer clicks, by its label in the approval dialog (REQ-TOOLS-052's three options). */
export function approvalButtonLabel(kind: Exclude<ApprovalAnswerKind, 'escape' | 'none'>): string {
  return kind === 'once' ? 'Approve once' : kind === 'session' ? 'Approve for this session' : 'Deny';
}

export function approvalAnswerer(raw: string | undefined): ApprovalAnswerer {
  const perTool = new Map<string, readonly ApprovalAnswer[]>();
  const seen = new Map<string, number>();
  let fallback: ApprovalAnswer | null = null;
  const problems: string[] = [];
  for (const entry of (raw ?? '').split(';;').map((e) => e.trim()).filter((e) => e !== '')) {
    const at = entry.indexOf('=');
    if (at < 0) {
      const answer = readAnswer(entry);
      if (answer === null) problems.push(`"${entry}" is not an answer (once, session, deny, escape, none, each optionally @<ms>)`);
      else fallback = answer;
      continue;
    }
    const tool = entry.slice(0, at).trim();
    const answers = entry.slice(at + 1).split(',').map(readAnswer);
    if (tool === '' || answers.length === 0 || answers.some((a) => a === null)) { problems.push(`"${entry}" is not <tool>=<answer>[,<answer>…]`); continue; }
    perTool.set(tool, answers as ApprovalAnswer[]);
  }
  return {
    problems,
    next(toolName) {
      const list = perTool.get(toolName);
      if (list === undefined) return fallback;
      const k = seen.get(toolName) ?? 0;
      seen.set(toolName, k + 1);
      return list[Math.min(k, list.length - 1)]!;
    },
  };
}
