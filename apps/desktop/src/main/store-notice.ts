import type { NoticeSeverity, ProcessReply } from '@rotaris/contracts';

/**
 * What main says about a workspace's store from the workspace service's answer to `workspace.open`, decided here and nowhere
 * else (`views/04-seams.md` §6). Pure: the answer in, the notice (or the condition to hold for the listing) out, so a test
 * pins every word without an Electron process. Main's `openWorkspaceInner` (`index.ts`) is the only caller.
 */

export interface StoreNotice {
  readonly severity: NoticeSeverity;
  readonly headline: string;
  readonly detail?: string;
}

/** The condition `session.list` answers with while the open refuses the store (REQ-SESSION-202, REQ-SESSION-043). */
export interface StoreRefusal {
  readonly code: string;
  readonly headline: string;
  readonly detail?: string;
}

type Opened = Extract<ProcessReply, { kind: 'workspace.opened' }>;

/**
 * The refusals that are a lasting condition of the store's place, as against a restore merely under way
 * (`workspace.restore-in-flight`, which the restore's own end resolves): a place holding no store (REQ-SESSION-202, W-31) and
 * a cut restore whose store could not be put back (OQ-266).
 */
export const STORE_REFUSALS: ReadonlySet<string> = new Set(['workspace.store-missing', 'workspace.store-displaced']);

/** REQ-SESSION-202 / W-31: the refusal to hold and raise, in the workspace service's own words; `undefined` for any other answer. */
export function storeRefusalOf(reply: ProcessReply): StoreRefusal | undefined {
  if (reply.kind !== 'refused' || !STORE_REFUSALS.has(reply.code)) return undefined;
  return { code: reply.code, headline: reply.headline, ...(reply.detail === undefined ? {} : { detail: reply.detail }) };
}

/** REQ-SESSION-202: the error notice a held refusal is raised as — what was found, and no reason invented for it (W-31 (2)). */
export function storeRefusalNotice(held: StoreRefusal): StoreNotice {
  return { severity: 'error', headline: held.headline, ...(held.detail === undefined ? {} : { detail: held.detail }) };
}

/**
 * OQ-266 (ruled 2026-10-13 under R-072): the one info notice for a restore cut between its renames that this open reversed —
 * the stamp it began at, the sessions put back (or none here before), nothing from the backup applied, restore again from
 * Settings to apply it, and where the prepared copy is kept.
 */
export function cutRestoreNotice(cut: NonNullable<Opened['cutRestore']>): StoreNotice {
  const before = cut.hadStore ? 'The sessions this workspace had here were put back' : 'This workspace had no sessions here before it';
  return {
    severity: 'info',
    headline: `The restore begun at ${cut.stamp} did not finish`,
    detail: `${before}, and nothing from the backup was applied. Restore again from Settings to apply it. The prepared copy is kept at ${cut.staging}.`,
  };
}
