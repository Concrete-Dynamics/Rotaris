import { countNoun } from '@rotaris/kernel';
import type { BlockerKind, BoardAction, BoardCard, ColumnToken, EpicCard, HealthToken, RelationToken, ReqId } from '@rotaris/contracts';
import { BLOCKER_KINDS, COLUMN_TOKENS, DELIVERY_COLUMNS, HEALTH_TOKENS, compareReqIds } from '@rotaris/contracts';

/**
 * The pure display mapping (Part AK; REQ-TRACE-380): turning projection values into what the board displays.
 * Every input it uses — the current time included — is an argument; the same inputs always produce the same
 * displayed values; it reads no file, consults no repository, reaches no engine and needs no toolkit (no React
 * here, as everywhere in `ui-core`). Health, evidence state, delivery state and epic progress pass through
 * UNCHANGED (REQ-TRACE-254): nothing below recomputes, rounds or defaults any of the four.
 */

// ---- columns (REQ-TRACE-232..236, 293..298) ----

/** REQ-TRACE-234: a non-identifier key is title-cased by splitting on hyphens; a project-supplied identifier prints as-is. */
export function columnLabel(key: string, projectSupplied = false): string {
  if (projectSupplied) return key;
  return key.split('-').filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}
export function columnHeader(key: string, count: number, projectSupplied = false): string {
  return `${columnLabel(key, projectSupplied)} · ${count}`;
}
/** REQ-TRACE-236: an empty delivery column says what belongs in it, specifically; every other axis has one sentence. */
export const EMPTY_COLUMN_SENTENCE: Readonly<Record<ColumnToken, string>> = Object.freeze({
  'backlog': 'Requirements nobody has released yet belong here.',
  'ready': 'Released requirements waiting for the queue to start their work belong here.',
  'running': 'Requirements with an execution unit running now belong here.',
  'review': 'Requirements whose run finished and awaits your decision belong here.',
  'needs-update': 'Delivered requirements whose specification changed since belong here.',
  'done': 'Requirements accepted against their delivered specification belong here.',
  'blocked': 'Requirements a blocker is holding belong here; each returns to the state it came from.',
});
export const EMPTY_AXIS_SENTENCE = 'No requirement carries this value.';

export type GroupingAxis = 'delivery' | 'health' | 'lifecycle' | 'epic' | 'priority' | 'source';
export const AXES = ['delivery', 'health', 'lifecycle', 'epic', 'priority', 'source'] as const satisfies readonly GroupingAxis[];
/** REQ-TRACE-297: drag-and-drop is a delivery-state action; the flag encodes it so no other axis can promise a write. */
export const AXIS_DRAGGABLE: Readonly<Record<GroupingAxis, boolean>> = Object.freeze({ delivery: true, health: false, lifecycle: false, epic: false, priority: false, source: false });
/** REQ-TRACE-295: closed axes emit every value; open axes (epic, source) emit only present values. */
export const AXIS_OPEN: Readonly<Record<GroupingAxis, boolean>> = Object.freeze({ delivery: false, health: false, lifecycle: false, epic: true, priority: false, source: true });
export const UNSET_BUCKET = 'unset';

/** REQ-TRACE-296: the value a card takes on each axis, assertably equal to the engine's. */
export function axisValue(card: BoardCard, axis: GroupingAxis, epics: readonly EpicCard[] = []): string {
  switch (axis) {
    case 'delivery': return card.column;
    case 'health': return card.health;
    case 'lifecycle': return card.lifecycle;
    case 'priority': return card.priority === undefined ? 'none' : card.priority.toLowerCase();
    case 'source': return card.sourceKey === '' ? UNSET_BUCKET : card.sourceKey;
    case 'epic': return epics.some((e) => e.id === card.id) ? card.id : (card.epic ?? UNSET_BUCKET);
  }
}
/** REQ-TRACE-293/295/298: the column keys of an axis in order — every value of a closed vocabulary, the present values of an open one, `unset` last only when needed. */
export function columnsFor(axis: GroupingAxis, cards: readonly BoardCard[], epics: readonly EpicCard[] = [], blockedColumn = true): readonly string[] {
  switch (axis) {
    case 'delivery': return blockedColumn ? [...COLUMN_TOKENS] : [...DELIVERY_COLUMNS];
    case 'health': return [...HEALTH_TOKENS];
    case 'lifecycle': return ['draft', 'approved', 'deprecated'];
    case 'priority': return ['critical', 'high', 'normal', 'low', 'none'];
    case 'epic':
    case 'source': {
      const values = new Set<string>();
      let unset = false;
      for (const c of cards) { const v = axisValue(c, axis, epics); if (v === UNSET_BUCKET) unset = true; else values.add(v); }
      const sorted = [...values].sort(compareReqIds);
      return unset ? [...sorted, UNSET_BUCKET] : sorted;
    }
  }
}
/** REQ-TRACE-235: every card in exactly one column; the counts sum to the visible cards. Blocked cards go to `blocked` when that column is shown, else to their origin. */
export function distribute(axis: GroupingAxis, cards: readonly BoardCard[], epics: readonly EpicCard[] = [], blockedColumn = true): ReadonlyMap<string, readonly BoardCard[]> {
  const out = new Map<string, BoardCard[]>();
  for (const key of columnsFor(axis, cards, epics, blockedColumn)) out.set(key, []);
  for (const c of cards) {
    let key = axisValue(c, axis, epics);
    if (axis === 'delivery' && key === 'blocked' && !blockedColumn) key = c.returnTo ?? 'backlog';
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(c);
  }
  return out;
}

// ---- sort and filter (REQ-TRACE-287..292, 299) ----

export type SortOrder = 'priority' | 'identifier' | 'health';
export const SORT_ORDERS = ['priority', 'identifier', 'health'] as const satisfies readonly SortOrder[];
/** REQ-TRACE-288: exactly this order; anything else ranks after the last, deterministically. */
export const PRIORITY_ORDER = ['Critical', 'High', 'Normal', 'Low'] as const;
export function priorityRank(priority: string | undefined): number {
  if (priority === undefined) return PRIORITY_ORDER.length + 1;
  const i = PRIORITY_ORDER.findIndex((p) => p.toLowerCase() === priority.toLowerCase());
  return i === -1 ? PRIORITY_ORDER.length : i;
}
export function sortCards(cards: readonly BoardCard[], order: SortOrder): readonly BoardCard[] {
  const byId = (a: BoardCard, b: BoardCard) => compareReqIds(a.id, b.id);
  const sorted = [...cards];
  switch (order) {
    case 'identifier': return sorted.sort(byId);
    case 'priority': return sorted.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || byId(a, b));
    case 'health': return sorted.sort((a, b) => HEALTH_TOKENS.indexOf(a.health) - HEALTH_TOKENS.indexOf(b.health) || byId(a, b));
  }
}
/** REQ-TRACE-302: a stored value this build no longer offers reverts to the default. */
export function sortOrderOf(stored: string | undefined): SortOrder {
  return (SORT_ORDERS as readonly string[]).includes(stored ?? '') ? (stored as SortOrder) : 'priority';
}
export function axisOf(stored: string | undefined): GroupingAxis {
  return (AXES as readonly string[]).includes(stored ?? '') ? (stored as GroupingAxis) : 'delivery';
}

export interface BoardFilter { readonly text: string; readonly epic: string; readonly source: string; readonly lifecycle: string; readonly health: string; readonly priority: string }
export const EMPTY_FILTER: BoardFilter = Object.freeze({ text: '', epic: '', source: '', lifecycle: '', health: '', priority: '' });
export function filterActive(f: BoardFilter): boolean {
  return f.text !== '' || f.epic !== '' || f.source !== '' || f.lifecycle !== '' || f.health !== '' || f.priority !== '';
}
/** REQ-TRACE-290: six dimensions; text is a case-insensitive substring of id or title; the epic dimension matches the epic fact OR an epic card's own id; the rest are exact. */
export function filterCards(cards: readonly BoardCard[], f: BoardFilter, epics: readonly EpicCard[] = []): readonly BoardCard[] {
  const text = f.text.toLowerCase();
  return cards.filter((c) =>
    (text === '' || c.id.toLowerCase().includes(text) || c.title.toLowerCase().includes(text))
    && (f.epic === '' || c.epic === f.epic || (c.id === f.epic && epics.some((e) => e.id === c.id)))
    && (f.source === '' || c.sourceKey === f.source)
    && (f.lifecycle === '' || c.lifecycle === f.lifecycle)
    && (f.health === '' || c.health === f.health)
    && (f.priority === '' || c.priority === f.priority));
}
/** REQ-TRACE-291: the fixed part order, and a distinguishable statement when nothing is set. */
export const NO_FILTER_SENTENCE = 'No filter is active: every requirement is shown.';
export function describeFilter(f: BoardFilter): string {
  const parts: string[] = [];
  if (f.text !== '') parts.push(`text "${f.text}"`);
  if (f.epic !== '') parts.push(`epic ${f.epic}`);
  if (f.source !== '') parts.push(`source ${f.source}`);
  if (f.lifecycle !== '') parts.push(`lifecycle ${f.lifecycle}`);
  if (f.health !== '') parts.push(`health ${f.health}`);
  if (f.priority !== '') parts.push(`priority ${f.priority}`);
  return parts.length === 0 ? NO_FILTER_SENTENCE : `Filtered by ${parts.join(', ')}.`;
}

// ---- folds (REQ-TRACE-303..316) ----

/** REQ-TRACE-306: a recorded user decision wins; otherwise folded exactly when emptiness folds and the column holds nothing. */
export function foldDecision(userDecision: boolean | undefined, foldEmpty: boolean, count: number): boolean {
  if (userDecision !== undefined) return userDecision;
  return foldEmpty && count === 0;
}
/** REQ-TRACE-304 rule 3: emptiness folds only once a card has left the pipeline-entry columns (the first column and the blocked condition). */
export function emptinessFolds(cards: readonly BoardCard[]): boolean {
  return cards.some((c) => c.column !== 'backlog' && c.column !== 'blocked');
}
/** REQ-TRACE-315: reading stored fold state never raises; not an object → no folds; a non-boolean member is dropped alone. */
export function parseFolds(stored: string | undefined): Readonly<Record<string, boolean>> {
  if (stored === undefined || stored === '') return {};
  let v: unknown;
  try { v = JSON.parse(stored); } catch { return {}; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, b] of Object.entries(v as Record<string, unknown>)) if (typeof b === 'boolean') out[k] = b;
  return out;
}
/** REQ-TRACE-313: one JSON object string, keys sorted. */
export function serializeFolds(folds: Readonly<Record<string, boolean>>): string {
  const sorted: Record<string, boolean> = {};
  for (const k of Object.keys(folds).sort()) sorted[k] = folds[k]!;
  return JSON.stringify(sorted);
}
/** REQ-TRACE-316: prune only project-supplied keys (epic, source) to the columns the board still has; closed-vocabulary decisions are retained. */
export function pruneFolds(folds: Readonly<Record<string, boolean>>, axis: GroupingAxis, present: readonly string[]): Readonly<Record<string, boolean>> {
  if (!AXIS_OPEN[axis]) return folds;
  const keep = new Set(present);
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(folds)) if (keep.has(k)) out[k] = v;
  return out;
}

// ---- actions (REQ-TRACE-382) ----

/** REQ-TRACE-382: hyphens replaced with spaces, capitalised as a sentence. */
export function actionLabel(action: BoardAction): string {
  const s = action.replaceAll('-', ' ');
  return s[0]!.toUpperCase() + s.slice(1);
}

// ---- time (REQ-TRACE-250/251) ----

const ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;
export function hasZone(iso: string): boolean {
  return ZONE.test(iso);
}
/**
 * REQ-TRACE-250: no timestamp → ''; no reference time or a zone-naive stamp → the absolute stamp; negative or
 * under 60 s → "just now"; under an hour in minutes; under a day in hours; otherwise days; singular and plural distinct.
 */
export function relativeAge(iso: string | undefined, now: string | undefined): string {
  if (iso === undefined || iso === '') return '';
  if (now === undefined || !hasZone(iso)) return iso;
  const t = Date.parse(iso);
  const n = Date.parse(now);
  if (Number.isNaN(t) || Number.isNaN(n)) return iso;
  const s = Math.floor((n - t) / 1000);
  if (s < 60) return 'just now';
  const plural = (v: number, unit: string) => `${countNoun(v, unit)} ago`;
  if (s < 3600) return plural(Math.floor(s / 60), 'minute');
  if (s < 86_400) return plural(Math.floor(s / 3600), 'hour');
  return plural(Math.floor(s / 86_400), 'day');
}
/**
 * REQ-TRACE-251: local time at minute resolution followed by the UTC offset, the offset appended only when the stamp
 * carries zone information; a zone-naive stamp is printed as-is. `localOffsetMinutes` is the reader's offset from UTC,
 * supplied — a pure function reads no clock and no locale.
 */
export function absoluteMoment(iso: string, localOffsetMinutes: number): string {
  if (!hasZone(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const local = new Date(t + localOffsetMinutes * 60_000);
  const p = (v: number) => String(v).padStart(2, '0');
  const sign = localOffsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(localOffsetMinutes);
  return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())} ${p(local.getUTCHours())}:${p(local.getUTCMinutes())} UTC${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

// ---- health (REQ-TRACE-252) ----

/** REQ-TRACE-252: a gloss defining THE WORD, not describing the requirement it was applied to. */
export const HEALTH_GLOSS: Readonly<Record<HealthToken, string>> = Object.freeze({
  'healthy': 'Every evidence obligation the requirement owes is satisfied and nothing holds it.',
  'needs-update': 'The requirement was delivered against a specification that has since changed.',
  'incomplete-traceability': 'An evidence obligation the requirement owes is missing or stale.',
  'verification-failed': 'A recorded verification of the requirement is failing.',
  'blocked': 'A blocker is holding the requirement.',
  'superseded': 'Another requirement supersedes this one.',
  'deprecated': "The requirement's lifecycle is deprecated.",
});
export const HEALTH_DERIVATION_SENTENCE = "Health is derived from three inputs — the requirement's lifecycle, its delivery state and its evidence — and is set by nobody directly.";
export function healthGloss(token: HealthToken): string {
  const g = HEALTH_GLOSS[token];
  if (g === undefined) throw new Error(`unknown health token '${String(token)}' (REQ-TRACE-252 closes the set)`);
  return g;
}

// ---- evidence (REQ-TRACE-258..262, 270) ----

export type ObligationKind = 'implementation-trace' | 'covering-test' | 'verification';
export const OBLIGATION_KINDS = ['implementation-trace', 'covering-test', 'verification'] as const satisfies readonly ObligationKind[];
export type SegmentState = 'satisfied' | 'stale' | 'failed' | 'missing';
export interface EvidenceSegment { readonly kind: ObligationKind; readonly label: string; readonly state: SegmentState; readonly stateLabel: string; readonly required: true }
const OBLIGATION_LABEL: Readonly<Record<ObligationKind, string>> = Object.freeze({ 'implementation-trace': 'Implementation trace', 'covering-test': 'Covering test', 'verification': 'Verification' });
const STATE_LABEL: Readonly<Record<SegmentState, string>> = Object.freeze({ satisfied: 'Satisfied', stale: 'Stale', failed: 'Failing', missing: 'Missing' });
/**
 * REQ-TRACE-258: one segment per obligation the requirement OWES, in the fixed order, its state as the projection
 * reports it. An obligation is owed exactly when the projection recorded a state for it or raised its missing-evidence
 * alert; anything else is not owed and gets no segment. A fourth kind is impossible: the set is closed here.
 */
export function evidenceSegments(card: BoardCard): readonly EvidenceSegment[] {
  const out: EvidenceSegment[] = [];
  for (const kind of OBLIGATION_KINDS) {
    const recorded = kind === 'implementation-trace' ? card.evidence.implementationTrace : kind === 'covering-test' ? card.evidence.coveringTest : card.evidence.verification;
    const missing = card.alerts.includes(`Missing evidence: ${kind}.`);
    if (recorded === undefined && !missing) continue;
    const state: SegmentState = recorded ?? 'missing';
    out.push({ kind, label: OBLIGATION_LABEL[kind], state, stateLabel: STATE_LABEL[state], required: true });
  }
  return out;
}
/** REQ-TRACE-260: an indicator with nothing owed is drawn empty, with this reason. */
export const NOTHING_OWED = 'This requirement owes no evidence: it declares no trace or test obligation and is not verified.';
/** REQ-TRACE-261: `<Obligation>: <State>` for every segment. */
export function evidenceSummary(segments: readonly EvidenceSegment[]): string {
  return segments.length === 0 ? NOTHING_OWED : segments.map((s) => `${s.label}: ${s.stateLabel}`).join(' · ');
}
export const EVIDENCE_EXPLANATION = 'The counts are evidence obligations, not annotations; "not applicable" means the requirement does not owe that kind of evidence at all.';

// ---- the execution line (REQ-TRACE-249) ----

export const UNITS_EXPLANATION = 'An execution unit is one run of agent work released for this requirement; a requirement nobody has released has none.';
export function executionLine(card: BoardCard, now: string | undefined): string {
  const units = Number(card.facts.find((f) => f.label === 'Units')?.value ?? '0');
  const unitsPart = units === 0 ? 'No execution units yet' : units === 1 ? '1 execution unit' : `${units} execution units`;
  const last = card.facts.find((f) => f.label === 'Last run')?.value;
  if (last === undefined) return `${unitsPart} · never run`;
  const [at, status] = last.split('|');
  const age = relativeAge(at, now);
  const outcome = status === undefined || status === '' ? '' : ` (${status})`;
  return age === '' ? `${unitsPart} · last run${outcome}` : `${unitsPart} · last run ${age}${outcome}`;
}

// ---- card facts and the last-change moment (REQ-TRACE-243) ----

/** The optional facts in their fixed order, minus the two the execution line consumes. Last change carries the relative age with the absolute moment as its detail. */
export function cardFacts(card: BoardCard, now: string | undefined, localOffsetMinutes: number): readonly { readonly label: string; readonly value: string; readonly detail?: string }[] {
  return card.facts.filter((f) => f.label !== 'Units' && f.label !== 'Last run').map((f) => f.label === 'Last change' ? { label: f.label, value: relativeAge(f.value, now), detail: absoluteMoment(f.value, localOffsetMinutes) } : f);
}
export const SOURCE_EXPLANATION = 'Source names the configured requirement source this requirement was read from.';

// ---- blockers (REQ-TRACE-446/447) ----

export interface BlockerWording { readonly heading: string; readonly lead: string }
const BLOCKER_WORDING: Readonly<Record<BlockerKind, BlockerWording>> = Object.freeze({
  'dependency': { heading: 'Waiting on a dependency', lead: 'This requirement waits for another requirement to be delivered.' },
  'conflict': { heading: 'Conflict', lead: 'This requirement and another cannot both be satisfied as written.' },
  'decision': { heading: 'Decision needed', lead: 'The engine halted and put the question to you, because the choice is not one it may make.' },
  'run-failure': { heading: 'Run failed', lead: 'The run did not succeed and no retries remain; the requirement is waiting on a person.' },
  'stated': { heading: 'Blocked by a person', lead: 'A person blocked this requirement and gave the reason below.' },
});
export const BLOCKER_FALLBACK: BlockerWording = Object.freeze({ heading: 'Progress halted', lead: 'Progress has halted; the engine supplied the explanation below.' });
export const NOTHING_HOLDING = 'Nothing is holding this requirement.';
/** REQ-TRACE-446: a kind outside the closed five fails the lookup at once rather than receiving a fallback. */
export function blockerWording(kind: BlockerKind): BlockerWording {
  if (!(BLOCKER_KINDS as readonly string[]).includes(kind)) throw new Error(`unknown blocker kind '${String(kind)}' (REQ-TRACE-446 closes the set)`);
  return BLOCKER_WORDING[kind];
}

// ---- relations (REQ-TRACE-274) ----

export const RELATION_LABEL: Readonly<Record<RelationToken, string>> = Object.freeze({
  'parent': 'Parent epic', 'children': 'Children', 'derived-from': 'Derived from', 'derived-requirements': 'Derived requirements',
  'supersedes': 'Supersedes', 'superseded-by': 'Superseded by', 'depends-on': 'Depends on', 'blocks': 'Blocks',
  'refines': 'Refines', 'refined-by': 'Refined by', 'conflicts-with': 'Conflicts with', 'related-to': 'Related to',
});

// ---- epics (REQ-TRACE-282/285) ----

export function epicProgressLine(epic: EpicCard): string {
  if (epic.children.length === 0) return 'This epic has no children yet.';
  const left = epic.children.length - epic.total;
  return `${epic.done} of ${epic.total} requirements done${left > 0 ? ` (${left} deprecated ${left === 1 ? 'child' : 'children'} left out)` : ''}`;
}

// ---- the blocked summary (REQ-TRACE-240) ----

export const BLOCKED_SUMMARY_CAP = 20;
export function blockedHeading(total: number): string {
  return `${total} blocked requirement${total === 1 ? '' : 's'}`;
}
export function blockedRows(blocked: readonly { readonly id: ReqId; readonly reason: string }[]): { readonly rows: readonly { readonly id: ReqId; readonly reason: string }[]; readonly notListed: number } {
  const rows = blocked.slice(0, BLOCKED_SUMMARY_CAP).map((b) => ({ id: b.id, reason: b.reason.replace(/^Blocked(?: \([a-z-]+\))?: /, '') }));
  return { rows, notListed: Math.max(0, blocked.length - BLOCKED_SUMMARY_CAP) };
}

// ---- the dependency tail (REQ-TRACE-243) ----

export function joinCapped(ids: readonly ReqId[], cap = 4): string {
  if (ids.length <= cap) return ids.join(', ');
  return `${ids.slice(0, cap).join(', ')} and ${ids.length - cap} more`;
}
