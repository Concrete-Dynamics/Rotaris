import type { IntentGrant, IntentResult, PlaybookSlot } from '@rotaris/contracts';
import type { Budget } from './children/ledger.js';
import type { CountUsage } from './run/metered.js';

/**
 * REQ-ORCH-005: what is settled before the coordinator is initialised — the classified intent, the grant
 * the entry role receives, the playbook cell per role rendered into text, the BUDGET clamp, and the
 * route the child guards read (REQ-ORCH-015). The run-host root builds it (the classifier needs the
 * model slots and the file readers); the run records it in the launch audit (REQ-SESSION-138,
 * REQ-ORCH-027) and hands the pieces to the tool ports, the prompts and the child ledger.
 */
export interface Preflight {
  readonly intent: IntentResult;
  readonly grant: IntentGrant;
  readonly route: 'answer' | 'work';
  /** REQ-ORCH-027 / REQ-SESSION-138: per role, the row key, the variant per slot and the rendered text — the audit payload. */
  readonly resolvedPlaybooks: Readonly<Record<string, { readonly row: string; readonly cell: Readonly<Record<PlaybookSlot, string>>; readonly text: string } | null>>;
  /** The rendered text a role's instructions carry; '' for a role with no row. */
  readonly playbookFor: (role: string) => string;
  /** REQ-ORCH-024: the BUDGET cell as a clamp; null = no clamp. */
  readonly budgetCell: Budget | null;
  readonly warnings: readonly string[];
}

export interface PreflightContext {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
  readonly warn: (message: string) => void;
  readonly previousIntent?: IntentResult['category'] | null | undefined;
  readonly hasUnfinishedWork?: boolean | null | undefined;
  /** REQ-EVENTS-053: the run's counter for the classification requests the pre-flight makes (`meteredBackend`). */
  readonly countUsage?: CountUsage | undefined;
}

export const NO_PREFLIGHT_INTENT: IntentResult = { category: 'moderate_feature', confidence: null, reason: 'intent classification is not wired for this run; fallback', fallback: true, carried_over: false };
