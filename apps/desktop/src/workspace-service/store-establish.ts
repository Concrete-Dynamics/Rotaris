import type { ProcessReply } from '@rotaris/contracts';
import type { WorkspaceId } from '@rotaris/kernel';
import { checkEmptyPlace, establishInEmptyPlace, plannedAsideName, type IdentifierRead } from '@rotaris/store';

/**
 * OQ-281 (ruled 2026-10-14 by the consortium under R-072), REQ-SESSION-202: the workspace service's half of Settings ›
 * Project's "Start a new session store…". Main asks the user first (`main/store-resolution.ts`); these two answer what main
 * tells the user, and do the work, re-checking the condition each time — the service never acts on what main remembers.
 *
 * The identifier is READ, never minted: the condition is a place kept for an identifier this workspace already carries, and
 * a workspace with no readable identifier has no such place to resolve (REQ-SESSION-197 reports an unreadable one).
 */
export interface EstablishDeps {
  readonly workspacesRoot: string;
  readonly workspaceRoot: string;
  readonly readId: (workspaceRoot: string) => IdentifierRead;
  /** OQ-266: a restore of this service's own is running — it owns the place until it ends. */
  readonly restoreInFlight: boolean;
  readonly stamp: string;
}

const REFUSED_HEADLINE = 'A new session store was not started';

function identifierOf(d: EstablishDeps): { readonly ok: true; readonly id: WorkspaceId } | { readonly ok: false; readonly reply: ProcessReply } {
  if (d.restoreInFlight) return { ok: false, reply: { kind: 'refused', code: 'workspace.restore-in-flight', headline: REFUSED_HEADLINE, detail: 'A restore of this workspace is under way; nothing was changed.' } };
  const ident = d.readId(d.workspaceRoot);
  if (ident.state !== 'readable') return { ok: false, reply: { kind: 'refused', code: 'workspace.identifier-unreadable', headline: REFUSED_HEADLINE, detail: ident.state === 'absent' ? 'This workspace carries no identifier, so no store place is kept for it; nothing was changed.' : `This workspace's identifier file cannot be read (it begins: ${ident.raw.slice(0, 60)}); nothing was changed.` } };
  return { ok: true, id: ident.id };
}

/** What a new store would do: the place found empty, and the path what is in it would be kept at under `stamp`. */
export function assessEstablish(d: EstablishDeps): ProcessReply {
  const ident = identifierOf(d);
  if (!ident.ok) return ident.reply;
  const check = checkEmptyPlace(d.workspacesRoot, ident.id);
  if (!check.ok) return { kind: 'refused', code: `workspace.store-${check.why}`, headline: REFUSED_HEADLINE, detail: check.detail };
  return { kind: 'workspace.store.establishable', place: check.place, kept: plannedAsideName(d.workspacesRoot, ident.id, d.stamp), stamp: d.stamp };
}

/** The work: re-checked, the place moved aside and kept, the store created as an absent place's open creates it. */
export function performEstablish(d: EstablishDeps): ProcessReply {
  const ident = identifierOf(d);
  if (!ident.ok) return ident.reply;
  const r = establishInEmptyPlace(d.workspacesRoot, ident.id, d.workspaceRoot, d.stamp);
  if (!r.ok) return { kind: 'refused', code: `workspace.store-${r.why}`, headline: REFUSED_HEADLINE, detail: r.detail };
  return { kind: 'workspace.store.established', place: r.place, kept: r.kept };
}
