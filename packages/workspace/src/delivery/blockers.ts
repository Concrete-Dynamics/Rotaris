import type { BlockerKind, BoardCard, ReqId } from '@rotaris/contracts';
import { BLOCKER_KINDS } from '@rotaris/contracts';

/**
 * Blockers (Part AK; REQ-TRACE-445..454): a blocker as the engine records it and the four answer paths with their
 * precedence. The headings and lead sentences (REQ-TRACE-447) are the display's and live once, in `ui-core`'s
 * display mapping; what this module fixes is what the engine answers with, which is data.
 */
export type AnswerPath = 'choose' | 'navigate' | 'resume' | 'inspect';

export interface BlockerOption {
  readonly key: string;
  readonly label?: string;
  readonly consequence?: string;
}
export interface Blocker {
  readonly kind: BlockerKind;
  readonly reason: string;
  readonly options: readonly BlockerOption[];
  readonly blockingIds: readonly ReqId[];
  readonly runUnit: string | null;
  readonly raisedAt: string;
}

/** REQ-TRACE-446: a kind outside the closed five fails here, at once, rather than receiving a fallback. */
export function assertBlockerKind(kind: string): BlockerKind {
  if (!(BLOCKER_KINDS as readonly string[]).includes(kind)) throw new Error(`unknown blocker kind '${kind}' (REQ-TRACE-446 closes the set to ${BLOCKER_KINDS.join(', ')})`);
  return kind as BlockerKind;
}

/**
 * REQ-TRACE-449: (1) the blocker carries choices → choose; (2) otherwise it carries blocking identifiers → navigate;
 * (3) otherwise its kind is a run failure → inspect; (4) otherwise → clear, which the board tokens name `resume`.
 * Explicit engine options outrank the kind: where the engine enumerated alternatives it has already declared what
 * answering means. `resume` is ALSO offered whenever it is not already the path, because "a blocker with no stored
 * question SHALL still be answerable through the transition" (REQ-TRACE-454) and there is deliberately no
 * "no way forward" path (REQ-TRACE-448).
 */
export function answerPaths(b: Pick<Blocker, 'kind' | 'options' | 'blockingIds'>): readonly AnswerPath[] {
  const primary: AnswerPath = b.options.length > 0 ? 'choose' : b.blockingIds.length > 0 ? 'navigate' : b.kind === 'run-failure' ? 'inspect' : 'resume';
  return primary === 'resume' ? ['resume'] : [primary, 'resume'];
}

/** REQ-TRACE-450: navigability when blocking identifiers exist; side by side exactly for a conflict. */
export function blockerFlags(b: Pick<Blocker, 'kind' | 'blockingIds'>): { readonly navigable: boolean; readonly sideBySide: boolean } {
  return { navigable: b.blockingIds.length > 0, sideBySide: b.kind === 'conflict' };
}

/** REQ-TRACE-452: an option's label is the engine's, or its key title-cased where the engine gave none. */
export function optionLabel(o: BlockerOption): string {
  return o.label ?? o.key.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

/** The card's own blocker field from the engine's record (the seam's `BoardCard.blocker`). */
export function cardBlocker(b: Blocker): NonNullable<BoardCard['blocker']> {
  return { kind: assertBlockerKind(b.kind), reason: b.reason, answerPaths: answerPaths(b) };
}
