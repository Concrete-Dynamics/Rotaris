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
 *
 * PD-CHAT-004 narrows the SCOPE of the last of the twelve and mints no thirteenth: `shape: 'group'` is
 * the **activity line**, a run of ONE agent's tool and streamed-reasoning rows across families rather
 * than a same-family run of tool rows alone. The vocabulary is still exactly twelve.
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
export type Outcome = 'ok' | 'failed' | 'blocked' | 'running';
export type OutcomeCounts = Readonly<Record<Outcome, number>>;

/**
 * PD-CHAT-004: one stretch of a run that states one fact — a reasoning phase, or consecutive tool calls
 * of one family. The segments ARE the activity line's text, in the order they first appear, and the same
 * family reached again after another segment forms a second segment of that family rather than rejoining
 * the first: the line reads as a sequence of things done, which is what a reader follows.
 */
export interface ActivitySegment {
  /** `reasoning`, or REQ-CHAT-064's family word — which that requirement's table still decides. */
  readonly label: string;
  readonly reasoning: boolean;
  readonly members: number;
  /** REQ-CHAT-065's per-outcome counts. A reasoning segment carries zeroes; it has no tool outcome. */
  readonly counts: OutcomeCounts;
  /** The segment's SUMMED member durations — REQ-CHAT-062's seconds for a reasoning segment. */
  readonly durationMs: number;
  /** Reasoning segments only: REQ-CHAT-062's summed streamed characters divided by 4. */
  readonly tokens: number;
}

export type DisplayRow =
  | { readonly shape: 'row'; readonly key: string; readonly row: TranscriptRow }
  | { readonly shape: 'group'; readonly key: string; readonly members: readonly TranscriptRow[];
      /**
       * REQ-CHAT-064's family word for the run's FIRST segment. Retained because REQ-CHAT-074 indexes a
       * group on it and because a single-family run's whole summary is still this word plus counts.
       */
      readonly family: string;
      /** PD-CHAT-004: the run's segments, in first-appearance order. The line's text is built from these. */
      readonly segments: readonly ActivitySegment[];
      /**
       * PD-CHAT-004 / REQ-CHAT-057: the run's agent and persona — what the role gutter names and what the
       * expanded rail is coloured by. Never an activity word: putting the family here is the defect
       * a defect note (removed once repaired) records.
       */
      readonly role: string; readonly persona: string;
      /** REQ-CHAT-065's per-outcome counts over the run's TOOL members; reasoning has no outcome. */
      readonly counts: OutcomeCounts;
      /**
       * PD-CHAT-004: the run's elapsed SPAN — `endedAt` minus `startedAt` — and NOT REQ-CHAT-065's sum of
       * member durations, which that requirement's back-pointer records as narrowed. While the run is live
       * the drawn figure counts up from `startedAt` instead (`activitySpanMs`).
       */
      readonly durationMs: number; readonly startedAt: string; readonly endedAt: string;
      /** REQ-CHAT-065: the in-flight member's text, and PD-CHAT-004's activity word for its segment. */
      readonly inFlight: string | null; readonly inFlightLabel: string | null;
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
