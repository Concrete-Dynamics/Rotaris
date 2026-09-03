import { z } from 'zod';

/**
 * REQ-ORCH-006/007/011/021: the intent taxonomy, its fallback, its groups, and the classification result;
 * REQ-ORCH-019/020/024: the model-tier vocabulary, the eight playbook slots in render order, the budget
 * tiers. The product's single definition of each; surfaces cite these and restate nothing.
 */
export const INTENT_CATEGORIES = [
  'explicit_trivial', 'question', 'exploration', 'problem_resolution', 'single_file_change', 'small_feature',
  'moderate_feature', 'large_feature', 'refactor', 'architectural', 'requirements', 'whole_project', 'ambiguous',
] as const;
export type IntentCategory = (typeof INTENT_CATEGORIES)[number];
export const INTENT_CATEGORY_SET: ReadonlySet<string> = new Set(INTENT_CATEGORIES);
export const FALLBACK_INTENT: IntentCategory = 'moderate_feature';
export function isIntentCategory(s: string): s is IntentCategory {
  return INTENT_CATEGORY_SET.has(s);
}

export const INTENT_GROUPS = {
  answer: ['question', 'exploration'],
  clarify: ['ambiguous', 'requirements'],
  micro: ['explicit_trivial', 'single_file_change'],
  fix: ['problem_resolution', 'refactor'],
  'small-build': ['small_feature'],
  'medium-build': ['moderate_feature'],
  'large-build': ['large_feature', 'architectural', 'whole_project'],
} as const satisfies Record<string, readonly IntentCategory[]>;
export type IntentGroup = keyof typeof INTENT_GROUPS;
export function intentGroup(c: IntentCategory): IntentGroup {
  for (const [g, members] of Object.entries(INTENT_GROUPS)) if ((members as readonly string[]).includes(c)) return g as IntentGroup;
  return 'medium-build';
}
/** REQ-ORCH-015/153: the answer group. */
export function isAnswerOnly(c: IntentCategory): boolean {
  return intentGroup(c) === 'answer';
}

export const IntentResultSchema = z.object({
  category: z.enum(INTENT_CATEGORIES),
  confidence: z.number().min(0).max(1).nullable(),
  reason: z.string(),
  fallback: z.boolean(),
  carried_over: z.boolean(),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

/** REQ-ORCH-014: the transient status before the call, replaced in place by the classified one. */
export const IntentStatusSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('classifying') }),
  z.object({ phase: z.literal('classified') }).merge(IntentResultSchema),
]);
export type IntentStatus = z.infer<typeof IntentStatusSchema>;

export const MODEL_TIERS = ['small', 'medium', 'large'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export const TIER_RANK: Readonly<Record<ModelTier, number>> = { small: 0, medium: 1, large: 2 };
export function isModelTier(s: string): s is ModelTier {
  return (MODEL_TIERS as readonly string[]).includes(s);
}

export const PLAYBOOK_SLOTS = ['ROUTE', 'AUTONOMY', 'RESEARCH', 'CHUNKING', 'VERIFY', 'ARTIFACT', 'OUTPUT', 'BUDGET'] as const;
export type PlaybookSlot = (typeof PLAYBOOK_SLOTS)[number];
export const BUDGET_TIERS = ['tight', 'normal', 'wide'] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

/** REQ-ORCH-026: the catalogue as the settings interface lists it — every slot, every variant, the built-in text. */
export const PlaybookCatalogueSchema = z.record(z.enum(PLAYBOOK_SLOTS), z.record(z.string(), z.string()));
export type PlaybookCatalogue = z.infer<typeof PlaybookCatalogueSchema>;

/** REQ-ORCH-016/025: what the intent gate grants the entry role. */
export const INTENT_GRANTS = ['direct-work', 'none'] as const;
export type IntentGrant = (typeof INTENT_GRANTS)[number];
