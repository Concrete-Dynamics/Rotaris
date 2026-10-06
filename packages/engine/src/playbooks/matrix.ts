import { intentGroup, PLAYBOOK_SLOTS, TIER_RANK, type IntentCategory, type IntentGroup, type ModelTier, type PlaybookCatalogue, type PlaybookSlot } from '@rotaris/contracts';
import type { PlaybookOverrides } from '@rotaris/config';
import { CATALOGUE, SLOT_DEFAULT_VARIANT } from './catalogue.js';

/**
 * REQ-ORCH-019..023: the playbook matrix. A row is keyed by role, by a concrete intent, its group, or
 * `default`, and by a tier or `any`; lookup is concrete intent → group → default, then concrete tier →
 * `any`. A role with no row gets no playbook. A cell names a variant per slot (a missing slot takes the
 * slot's default variant) or is marked not routed. The coordinator's row is keyed on the tier of the role
 * that will carry the work out (REQ-ORCH-022); a producer's CHUNKING and OUTPUT come from that role's
 * tier when it is lower (REQ-ORCH-020, `planner` and `architect` only).
 */
export type Cell = { readonly notRouted: true } | { readonly notRouted?: false; readonly slots: Partial<Readonly<Record<PlaybookSlot, string>>> };
export type IntentKey = IntentCategory | IntentGroup | 'default';
export type TierKey = ModelTier | 'any';

export interface Row {
  readonly role: string;
  readonly intent: IntentKey;
  readonly tier: TierKey;
  readonly cell: Cell;
}

const row = (role: string, intent: IntentKey, tier: TierKey, slots: Partial<Record<PlaybookSlot, string>>): Row => ({ role, intent, tier, cell: { slots } });
const ANSWER: Partial<Record<PlaybookSlot, string>> = { AUTONOMY: 'proceed', RESEARCH: 'targeted', CHUNKING: 'single', VERIFY: 'none', ARTIFACT: 'none', OUTPUT: 'answer', BUDGET: 'tight' };

export const BUILT_IN_ROWS: readonly Row[] = Object.freeze([
  row('orchestrator', 'answer', 'any', ANSWER),
  row('orchestrator', 'clarify', 'any', { ...ANSWER, RESEARCH: 'targeted' }),
  row('orchestrator', 'micro', 'any', { CHUNKING: 'single', VERIFY: 'run_checks', OUTPUT: 'report', BUDGET: 'tight' }),
  row('orchestrator', 'fix', 'any', { RESEARCH: 'thorough', CHUNKING: 'small_steps', VERIFY: 'prove', BUDGET: 'normal' }),
  row('orchestrator', 'small-build', 'any', { CHUNKING: 'small_steps', VERIFY: 'run_checks', BUDGET: 'normal' }),
  row('orchestrator', 'medium-build', 'any', { CHUNKING: 'milestones', VERIFY: 'prove', ARTIFACT: 'summary', BUDGET: 'normal' }),
  row('orchestrator', 'large-build', 'any', { RESEARCH: 'thorough', CHUNKING: 'milestones', VERIFY: 'prove', ARTIFACT: 'full', OUTPUT: 'report', BUDGET: 'wide' }),
  row('coding-agent', 'default', 'small', { RESEARCH: 'targeted', CHUNKING: 'single', VERIFY: 'run_checks', OUTPUT: 'report' }),
  row('coding-agent', 'default', 'medium', { CHUNKING: 'small_steps', VERIFY: 'run_checks' }),
  row('coding-agent', 'default', 'large', { AUTONOMY: 'own', CHUNKING: 'milestones', VERIFY: 'prove' }),
  row('planner', 'default', 'any', { RESEARCH: 'thorough', CHUNKING: 'milestones', VERIFY: 'none', OUTPUT: 'plan' }),
  row('architect', 'default', 'any', { RESEARCH: 'thorough', CHUNKING: 'milestones', VERIFY: 'none', OUTPUT: 'plan' }),
  row('refactorer', 'fix', 'any', { RESEARCH: 'thorough', CHUNKING: 'small_steps', VERIFY: 'prove' }),
  row('refactorer', 'default', 'any', { CHUNKING: 'small_steps', VERIFY: 'prove' }),
  row('requirements-engineer', 'default', 'any', ANSWER),
  row('codebase-analyst', 'default', 'any', ANSWER),
  row('librarian', 'default', 'any', ANSWER),
  row('tester', 'default', 'any', { VERIFY: 'run_checks', OUTPUT: 'report' }),
  { role: 'tester', intent: 'answer', tier: 'any', cell: { notRouted: true } },
  row('docs-writer', 'default', 'any', { RESEARCH: 'targeted', VERIFY: 'none', ARTIFACT: 'none', OUTPUT: 'report' }),
  row('verifier', 'default', 'any', { RESEARCH: 'targeted', VERIFY: 'prove', OUTPUT: 'report' }),
  row('ui-verifier', 'default', 'any', { VERIFY: 'run_checks', OUTPUT: 'report' }),
  row('gatekeeper', 'default', 'any', { RESEARCH: 'targeted', VERIFY: 'none', OUTPUT: 'answer' }),
]);

/** REQ-ORCH-021/023: concrete intent → group → default; concrete tier → any. Null when the role has no row. */
export function lookupRow(rows: readonly Row[], role: string, intent: IntentCategory, tier: ModelTier | null): Row | null {
  const intents: IntentKey[] = [intent, intentGroup(intent), 'default'];
  const tiers: TierKey[] = tier ? [tier, 'any'] : ['medium', 'any'];
  for (const i of intents) for (const t of tiers) {
    const hit = rows.find((r) => r.role === role && r.intent === i && r.tier === t);
    if (hit) return hit;
  }
  return null;
}

/** REQ-ORCH-022: the role that will carry the work out, by intent. */
export function workerRoleFor(intent: IntentCategory): string {
  if (intent === 'refactor') return 'refactorer';
  if (intent === 'requirements') return 'requirements-engineer';
  if (intent === 'architectural') return 'architect';
  return 'coding-agent';
}

/** The variant per slot a cell resolves to — every slot, exactly once. */
export function resolveCell(cell: Cell): Readonly<Record<PlaybookSlot, string>> {
  const out = {} as Record<PlaybookSlot, string>;
  for (const s of PLAYBOOK_SLOTS) out[s] = cell.notRouted ? (s === 'ROUTE' ? 'not_routed' : SLOT_DEFAULT_VARIANT[s]) : (cell.slots[s] ?? SLOT_DEFAULT_VARIANT[s]);
  return out;
}

/**
 * REQ-ORCH-019/020: the cell the run's entry role is rendered with. A routed cell's ROUTE slot names the catalogue's
 * `entry` variant: `routed` tells a specialist that a coordinator delegated the task to it, and the entry role is the one
 * the user's request reached (K3 of the default live run at c2fdd6a,
 * `docs/defects/fixed/the-entry-roles-route-slot-says-the-coordinator-routed-the-task-to-it.md`). A cell marked not routed
 * keeps its narrow text (REQ-ORCH-023). Every other slot is the cell's own.
 */
export function entryCell(cell: Readonly<Record<PlaybookSlot, string>>): Readonly<Record<PlaybookSlot, string>> {
  return cell.ROUTE === 'routed' ? { ...cell, ROUTE: 'entry' } : cell;
}

/** REQ-ORCH-026: the catalogue with overrides applied; an unknown slot or variant is ignored with a warning naming it. */
export function applyOverrides(base: PlaybookCatalogue, overrides: PlaybookOverrides, warn: (m: string) => void): PlaybookCatalogue {
  const out: Record<string, Record<string, string>> = {};
  for (const [slot, variants] of Object.entries(base)) out[slot] = { ...variants };
  for (const [slot, variants] of Object.entries(overrides)) {
    const known = out[slot];
    if (!known) { warn(`playbook override names slot '${slot}', which the catalogue does not define; ignored (REQ-ORCH-026)`); continue; }
    for (const [variant, text] of Object.entries(variants)) {
      if (!(variant in known)) { warn(`playbook override names variant '${slot}.${variant}', which the catalogue does not define; ignored (REQ-ORCH-026)`); continue; }
      known[variant] = text;
    }
  }
  return out as PlaybookCatalogue;
}

export interface RenderInput {
  readonly role: string;
  readonly cell: Readonly<Record<PlaybookSlot, string>>;
  readonly tier: ModelTier | null;
  readonly catalogue: PlaybookCatalogue;
  /** REQ-ORCH-020: for `planner`/`architect`, the worker role's resolved cell and tier, if any. */
  readonly consumer?: { readonly role: string; readonly tier: ModelTier | null; readonly cell: Readonly<Record<PlaybookSlot, string>> } | null;
}

export const PRODUCER_ROLES: ReadonlySet<string> = new Set(['planner', 'architect']);

/** REQ-ORCH-020/023: all eight slots, each exactly once, in order; the header when the tier is undetermined; substitution only downward. */
export function renderPlaybook(input: RenderInput): { readonly text: string; readonly cell: Readonly<Record<PlaybookSlot, string>> } {
  let cell = { ...input.cell };
  if (PRODUCER_ROLES.has(input.role) && input.consumer && input.tier !== null && input.consumer.tier !== null && TIER_RANK[input.consumer.tier] < TIER_RANK[input.tier]) {
    cell = { ...cell, CHUNKING: input.consumer.cell.CHUNKING, OUTPUT: input.consumer.cell.OUTPUT };
  }
  const lines: string[] = ['PLAYBOOK'];
  if (input.tier === null) lines.push('(model size undetermined: assume the medium tier and do not assume larger capacity)');
  for (const slot of PLAYBOOK_SLOTS) {
    const variant = cell[slot];
    const text = input.catalogue[slot]?.[variant] ?? CATALOGUE[slot][variant] ?? '';
    lines.push(`${slot}: ${text}`);
  }
  return { text: lines.join('\n'), cell };
}

export { CATALOGUE };
