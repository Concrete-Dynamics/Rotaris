import type { ApprovalPayload, TranscriptRow } from '@rotaris/contracts';

/**
 * The seam between ADR-0046 step 4 (what is displayed) and ADR-0045 step 5 (what one slot paints).
 * Part Z owns everything that produces a `DisplayRow`; Part AA owns `Row.tsx`, which consumes one.
 *
 * REQ-CHAT-046 closes the row-CATEGORY vocabulary at TWELVE members, and four of the twelve have no
 * persisted row behind them. The mapping onto this file is stated once, here, so neither side invents
 * a thirteenth:
 *
 *   category                     | carried by
 *   -----------------------------|--------------------------------------------------------------
 *   agent message                | shape 'row', row.kind 'agent' (or any open role — REQ-CHAT-047)
 *   tool call                    | shape 'row', row.kind 'tool'
 *   system notice                | shape 'row', row.kind 'system'
 *   user prompt                  | shape 'row', row.kind 'user'
 *   intent note                  | shape 'row', row.kind 'intent'
 *   structured-question prompt   | shape 'trailer', trailer.sort 'question'   (computed, not recorded)
 *   approval prompt              | shape 'trailer', trailer.sort 'approval'   (computed, not recorded)
 *   user-only edit diff          | shape 'row', row.kind 'diff'
 *   streamed reasoning           | shape 'row', row.kind 'thinking'
 *   delegation-context header    | shape 'row', row.kind 'delegation'         (computed, not recorded)
 *   verifier output              | shape 'row', row.kind 'verifier'
 *   folded tool group            | shape 'group'                              (computed, not recorded)
 */

/**
 * REQ-CHAT-051's two trailer sorts. Trailer rows are NOT recorded history (REQ-MONITOR-230): they are
 * computed from what is pending at that moment and always follow every recorded row.
 * REQ-CHAT-168 binds `text`: the count it carries is written for the count it carries, at zero and one
 * as much as at many, and the specification's "N step(s)" is never rendered literally.
 */
export type TrailerRow =
  | {
      readonly sort: 'question';
      readonly requestId: string;
      /** The agent that asked (REQ-CHAT-051). */
      readonly role: string;
      /** "N steps — <title of the first step>". */
      readonly text: string;
      readonly steps: number;
    }
  | {
      readonly sort: 'approval';
      readonly requestId: string;
      readonly role: string;
      /** "Approval needed — <command or tool name>". */
      readonly text: string;
      readonly approval: ApprovalPayload;
    };

/**
 * ADR-0046 step 4's output: what is DISPLAYED, after hygiene, edit-diff placement, folding and caps.
 * The discriminant is `shape` and NOT `kind`, because `TranscriptRow.kind` already carries
 * REQ-CHAT-047's display kind and a second `kind` on the wrapper is how the two get confused.
 */
export type DisplayRow =
  | { readonly shape: 'row'; readonly key: string; readonly row: TranscriptRow }
  | { readonly shape: 'group'; readonly key: string; readonly family: string; readonly members: readonly TranscriptRow[];
      /** REQ-CHAT-065: per-outcome counts, the summed duration, the earliest start, the in-flight member's text. */
      readonly counts: Readonly<Record<'ok' | 'failed' | 'blocked' | 'running', number>>;
      readonly durationMs: number; readonly startedAt: string; readonly inFlight: string | null;
      /** REQ-CHAT-065: the members' searchable text, capped at 2000 characters, so search matches inside a fold. */
      readonly blob: string }
  | { readonly shape: 'trailer'; readonly key: string; readonly trailer: TrailerRow };

/**
 * REQ-CHAT-059: expansion is keyed by STABLE IDENTITY, never by position — Z owns the map, AA reads it.
 * `Row` MUST be a pure function of these props and MUST hold no state of its own: Z's pool empties and
 * REBINDS slots, so state inside a row would survive the rebind and display one row's state on another,
 * which is precisely the failure ADR-0045 names. `ToolRow`'s `useState(open)` (TranscriptRows.tsx:36)
 * is the existing instance of that bug and moves into Z's map.
 */
export interface RowRenderProps {
  readonly display: DisplayRow;
  readonly expanded: boolean;
  onToggle(): void;
  /** REQ-CHAT-074: the active search match on this row, or null — AA paints it, Z decides it. */
  readonly match: { readonly start: number; readonly end: number } | null;
}
