import { z } from 'zod';

/** REQ-LIBRARY-002 / REQ-SESSION-021: the persisted marker shared by every run owner. */
export const RUN_TYPES = ['task_run', 'improvement_run', 'integration_run'] as const;
export const RunTypeSchema = z.enum(RUN_TYPES);
export type RunType = z.infer<typeof RunTypeSchema>;

/**
 * PD-LIBRARY-002: the two analysis passes. `post_run` is REQ-LIBRARY-015's sibling, fenced to one run by
 * REQ-LIBRARY-017; `retrospective` is the user-started pass that reads across this workspace's own record.
 * This is NOT a run type: a retrospective starts no session, so RUN_TYPES above is untouched.
 */
export const ANALYSIS_PASSES = ['post_run', 'retrospective'] as const;
export const AnalysisPassSchema = z.enum(ANALYSIS_PASSES);
export type AnalysisPass = z.infer<typeof AnalysisPassSchema>;

/**
 * REQ-LIBRARY-022/023: the notes an analyst writes on the empty artifact of a pass that proposed nothing because it could not.
 * Each begins with one of these prefixes, which the engine writes and main reads: `PD-LIBRARY-005` (OQ-285) turns a crashed or
 * unparseable collector's artifact into its pass's failure warning, and a timed-out one keeps the info notice with its limit
 * (`PD-CONFIG-003` revision 2 for the post-run pass). The texts are the requirements', word for word: `collector crashed: <exc>`,
 * `collector parse failed: <err>`, `collector timed out after <t> seconds`.
 */
export const COLLECTOR_CRASHED_PREFIX = 'collector crashed: ';
export const COLLECTOR_PARSE_FAILED_PREFIX = 'collector parse failed: ';
export const COLLECTOR_TIMED_OUT_PREFIX = 'collector timed out after ';

/** REQ-LIBRARY-006: one closed proposal-category vocabulary. */
export const IMPROVEMENT_CATEGORIES = [
  'documentation_update',
  'agents_md_update',
  'workspace_note',
  'config_change',
  'tool_enablement',
  'dependency_install',
  'persona_or_prompt_adjustment',
  'persona_memory_update',
  'preflight_check',
  'verifier_gate_update',
] as const;
export const ImprovementCategorySchema = z.enum(IMPROVEMENT_CATEGORIES);
export type ImprovementCategory = z.infer<typeof ImprovementCategorySchema>;

export const PROPOSAL_STATUSES = ['pending_review', 'approved', 'rejected', 'deferred'] as const;
export const ProposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const IMPROVEMENT_RISKS = ['low', 'medium', 'high'] as const;
export const ImprovementRiskSchema = z.enum(IMPROVEMENT_RISKS);
export type ImprovementRisk = z.infer<typeof ImprovementRiskSchema>;

export const IMPROVEMENT_VERSION_CAUSES = ['collected', 'status_change', 'edit', 'delete', 'checkpoint', 'rollback', 'unknown'] as const;
export const ImprovementVersionCauseSchema = z.enum(IMPROVEMENT_VERSION_CAUSES);
export type ImprovementVersionCause = z.infer<typeof ImprovementVersionCauseSchema>;

export const IMPROVEMENT_CHECKPOINT_KINDS = ['pre_improvement', 'applied', 'pre_rollback'] as const;
export const ImprovementCheckpointKindSchema = z.enum(IMPROVEMENT_CHECKPOINT_KINDS);
export type ImprovementCheckpointKind = z.infer<typeof ImprovementCheckpointKindSchema>;

const utc = z.string().datetime({ offset: true });
const nullableId = z.string().min(1).nullable().default(null);

export const VERIFIER_ROLES = ['test', 'typecheck', 'lint', 'other'] as const;
export const VERIFIER_SEVERITIES = ['blocking', 'advisory'] as const;
export const VerifierCheckSchema = z.object({
  name: z.string().trim().min(1),
  command: z.string().trim().min(1),
  timeout: z.number().int().min(1).max(600).default(600),
  severity: z.enum(VERIFIER_SEVERITIES).default('blocking'),
  role: z.enum(VERIFIER_ROLES).optional(),
  cwd: z.string().trim().min(1).optional(),
  failure_pattern: z.string().optional(),
}).strict().superRefine((check, ctx) => {
  if (check.cwd !== undefined) {
    const pieces = check.cwd.replaceAll('\\', '/').split('/');
    if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(check.cwd) || pieces.includes('..')) {
      ctx.addIssue({ code: 'custom', path: ['cwd'], message: 'cwd must be a workspace-relative directory without parent traversal' });
    }
  }
  if (check.failure_pattern !== undefined) {
    try { new RegExp(check.failure_pattern); } catch { ctx.addIssue({ code: 'custom', path: ['failure_pattern'], message: `invalid regular expression: ${check.failure_pattern}` }); }
  }
});
export const VerifierSectionSchema = z.object({
  checks: z.array(VerifierCheckSchema).optional(),
  gate_completion: z.boolean().optional(),
  suite_timeout: z.number().int().min(1).nullable().optional(),
  author_gate: z.boolean().optional(),
  probe_timeout: z.number().int().min(1).optional(),
  max_repair_attempts: z.number().int().min(0).optional(),
}).strict().superRefine((section, ctx) => {
  const seen = new Set<string>();
  for (const [index, check] of (section.checks ?? []).entries()) {
    if (seen.has(check.name)) ctx.addIssue({ code: 'custom', path: ['checks', index, 'name'], message: `duplicate check name: ${check.name}` });
    seen.add(check.name);
  }
});
export type VerifierSection = z.infer<typeof VerifierSectionSchema>;

export const ImprovementEvidenceSchema = z.object({
  kind: z.string().trim().min(1),
  text: z.string().trim().min(1),
  source_task_id: nullableId,
  source_artifact_id: nullableId,
  source_session_id: nullableId,
  excerpt: z.string().optional(),
});
export type ImprovementEvidence = z.infer<typeof ImprovementEvidenceSchema>;

export const ImprovementProposalSchema = z.object({
  id: z.string().regex(/^imp_[0-9A-Za-z]{8}$/),
  category: ImprovementCategorySchema,
  summary: z.string().trim().min(1),
  evidence: z.array(ImprovementEvidenceSchema).min(1),
  recommended_action: z.string().trim().min(1),
  risk: ImprovementRiskSchema.default('low'),
  status: ProposalStatusSchema.default('pending_review'),
  target_persona: z.string().trim().min(1).nullable().default(null),
  proposed_verifier_section: VerifierSectionSchema.nullable().default(null),
  created_at: utc,
}).superRefine((proposal, ctx) => {
  if (proposal.category === 'persona_memory_update' && proposal.target_persona === null) {
    ctx.addIssue({ code: 'custom', path: ['target_persona'], message: 'target_persona is required for persona_memory_update' });
  }
  if (proposal.category === 'verifier_gate_update' && proposal.proposed_verifier_section === null) {
    ctx.addIssue({ code: 'custom', path: ['proposed_verifier_section'], message: 'proposed_verifier_section is required for verifier_gate_update' });
  }
  if (proposal.evidence.every((entry) => entry.kind === 'verifier_gate_state')) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'at least one analyst-authored evidence entry is required' });
  }
});
export type ImprovementProposal = z.infer<typeof ImprovementProposalSchema>;

export const ImprovementCheckpointSchema = z.object({
  sequence: z.number().int().nonnegative(),
  ref: z.string().min(1),
  commit: z.string().min(1),
  kind: ImprovementCheckpointKindSchema,
  created_at: utc,
  files: z.array(z.string()),
  proposal_ids: z.array(z.string().regex(/^imp_[0-9A-Za-z]{8}$/)),
  tree_root: z.string().min(1),
});
export type ImprovementCheckpoint = z.infer<typeof ImprovementCheckpointSchema>;

const artifactShape = z.object({
  artifact_id: z.string().regex(/^impart_[0-9A-Za-z]{8}$/),
  /**
   * PD-LIBRARY-002 (ADR-0065 decision 2): null ONLY for a retrospective, which belongs to no session. The
   * refinement below keeps a post-run artifact exactly as strict as it was, and the sessions a retrospective
   * read are named in `considered_session_ids` while each evidence entry keeps its own source.
   */
  source_session_id: z.string().min(1).nullable().default(null),
  source_kind: AnalysisPassSchema.default('post_run'),
  source_run_type: RunTypeSchema.default('task_run'),
  generated_at: utc,
  collector_model: z.string().min(1).nullable().default(null),
  proposals: z.array(ImprovementProposalSchema),
  considered_session_ids: z.array(z.string().min(1)).transform((ids) => [...new Set(ids)]),
  notes: z.string().nullable().default(null),
  checkpoints: z.array(ImprovementCheckpointSchema).default([]),
  rolled_back_at: utc.nullable().default(null),
}).superRefine((artifact, ctx) => {
  if (artifact.source_kind === 'post_run' && artifact.source_session_id === null) {
    ctx.addIssue({ code: 'custom', path: ['source_session_id'], message: 'source_session_id is required for a post-run artifact' });
  }
});

/** REQ-LIBRARY-011/014: accept the legacy session_id alias and emit the canonical shape. */
export const ImprovementArtifactSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown>;
  if (value.source_session_id !== undefined || value.session_id === undefined) return value;
  const { session_id, ...rest } = value;
  return { ...rest, source_session_id: session_id };
}, artifactShape);
export type ImprovementArtifact = z.infer<typeof ImprovementArtifactSchema>;

export function parseImprovementArtifact(raw: unknown): ImprovementArtifact {
  const result = ImprovementArtifactSchema.safeParse(raw);
  if (!result.success) throw new Error(`malformed improvement artifact: ${result.error.issues.map((issue) => `${issue.path.join('.') || 'artifact'}: ${issue.message}`).join('; ')}`);
  return result.data;
}

export const RecordedImprovementVersionSchema = z.object({
  version: z.number().int().positive(),
  recorded_at: utc,
  cause: ImprovementVersionCauseSchema,
  artifact: ImprovementArtifactSchema,
});
export type RecordedImprovementVersion = z.infer<typeof RecordedImprovementVersionSchema>;

export const ImprovementArtifactRecordSchema = z.object({
  artifact: ImprovementArtifactSchema,
  versions_due: z.number().int().nonnegative(),
  versions_pruned: z.number().int().nonnegative(),
  versions_never_recorded: z.number().int().nonnegative(),
});
export type ImprovementArtifactRecord = z.infer<typeof ImprovementArtifactRecordSchema>;

export const ProposalReviewRequestSchema = z.object({
  artifact_id: z.string(),
  proposal_id: z.string(),
  status: ProposalStatusSchema,
  expected_versions_due: z.number().int().nonnegative().optional(),
});
export type ProposalReviewRequest = z.infer<typeof ProposalReviewRequestSchema>;

export const ProposalEditRequestSchema = z.object({
  artifact_id: z.string(),
  proposal_id: z.string(),
  summary: z.string().trim().min(1),
  recommended_action: z.string().trim().min(1),
  expected_versions_due: z.number().int().nonnegative().optional(),
});
export type ProposalEditRequest = z.infer<typeof ProposalEditRequestSchema>;

export const ProposalDeleteRequestSchema = z.object({
  artifact_id: z.string(),
  proposal_id: z.string(),
  expected_versions_due: z.number().int().nonnegative().optional(),
});
export type ProposalDeleteRequest = z.infer<typeof ProposalDeleteRequestSchema>;

export const ImprovementActivitySchema = z.object({
  workspace_id: z.string(),
  active: z.boolean(),
  queued: z.number().int().nonnegative(),
  source_session_id: z.string().nullable(),
  /** REQ-LIBRARY-125 with PD-LIBRARY-002: which pass the indicators are labelling. */
  pass: AnalysisPassSchema.default('post_run'),
  /**
   * PD-LIBRARY-002 revision 2, clause (e) (OQ-236): whether a retrospective is queued or running in the RECEIVING
   * window's workspace. It is the one thing that makes the retrospective's start gesture unavailable; a post-run
   * analysis never does, since a press queues behind it on REQ-LIBRARY-123's FIFO. Main sends it per window, because
   * the rest of this payload is application-wide.
   */
  retrospective_pending: z.boolean().default(false),
});
export type ImprovementActivity = z.infer<typeof ImprovementActivitySchema>;

/** REQ-LIBRARY-017..019/033/165: one frozen, bounded source in a captured job. */
export const ImprovementCapturedSourceSchema = z.object({ available: z.boolean(), entries: z.array(z.string()) });
export type ImprovementCapturedSource = z.infer<typeof ImprovementCapturedSourceSchema>;

/**
 * PD-LIBRARY-002 (ADR-0065 decision 6): the five sources a retrospective reads, each frozen and bounded at
 * capture exactly as the sibling's six are, each entry naming the record it came from so its evidence stays
 * attributable. A source that could not be read is `available: false` and is named in the artifact's notes.
 */
export const RetrospectiveSourcesSchema = z.object({
  sessions: ImprovementCapturedSourceSchema,
  proposals: ImprovementCapturedSourceSchema,
  prompts: ImprovementCapturedSourceSchema,
  persona_memory: ImprovementCapturedSourceSchema,
  instructions: ImprovementCapturedSourceSchema,
});
export type RetrospectiveSources = z.infer<typeof RetrospectiveSourcesSchema>;

/** REQ-ORCH-137 / REQ-LIBRARY-032..034, and PD-LIBRARY-002 for the second pass: the host-to-coordinator handoff. */
export const ImprovementAnalysisJobSchema = z.object({
  artifact_id: z.string().regex(/^impart_[0-9A-Za-z]{8}$/), workspace_id: z.string().min(1), workspace_root: z.string().min(1), source_session_id: z.string().min(1).nullable().default(null), generated_at: utc,
  timeout_seconds: z.number().int().positive(), collector_model: z.string().min(1), considered_session_ids: z.array(z.string().min(1)),
  pass: AnalysisPassSchema.default('post_run'),
  progress: ImprovementCapturedSourceSchema, todo: ImprovementCapturedSourceSchema, child_reports: ImprovementCapturedSourceSchema,
  transcript: ImprovementCapturedSourceSchema, gate: ImprovementCapturedSourceSchema, prior_artifacts_available: z.boolean(),
  prior_artifacts: z.array(ImprovementArtifactSchema).max(5),
  retrospective: RetrospectiveSourcesSchema.nullable().default(null),
}).superRefine((job, ctx) => {
  if (job.pass === 'post_run' && job.source_session_id === null) {
    ctx.addIssue({ code: 'custom', path: ['source_session_id'], message: 'source_session_id is required for a post-run job' });
  }
  if (job.pass === 'retrospective' && job.retrospective === null) {
    ctx.addIssue({ code: 'custom', path: ['retrospective'], message: 'a retrospective job carries its own captured sources' });
  }
});
export type ImprovementAnalysisJob = z.infer<typeof ImprovementAnalysisJobSchema>;

export const IMPROVEMENT_GATE_OUTCOMES = ['applied', 'unchanged', 'invalid', 'failed'] as const;
export const ImprovementGateResultSchema = z.object({ proposal_id: z.string(), outcome: z.enum(IMPROVEMENT_GATE_OUTCOMES), detail: z.string().nullable() });
export type ImprovementGateResult = z.infer<typeof ImprovementGateResultSchema>;
export const ImprovementRunTaskSchema = z.object({ proposal_id: z.string(), name: z.string(), payload: z.string() });
export type ImprovementRunTask = z.infer<typeof ImprovementRunTaskSchema>;
export const ImprovementRunPlanSchema = z.object({ artifact_id: z.string(), phases: z.array(z.object({ name: z.literal('improvement_run'), tasks: z.array(ImprovementRunTaskSchema) })).max(1) });
export type ImprovementRunPlan = z.infer<typeof ImprovementRunPlanSchema>;
export const ImprovementPreparationSchema = z.object({
  artifact: ImprovementArtifactRecordSchema,
  plan: ImprovementRunPlanSchema,
  prompt: z.string().min(1),
  gate_results: z.array(ImprovementGateResultSchema),
  checkpoint: ImprovementCheckpointSchema.nullable(),
  checkpoint_reason: z.string().nullable(),
});
export type ImprovementPreparation = z.infer<typeof ImprovementPreparationSchema>;
export const IMPROVEMENT_ROLLBACK_ACTIONS = ['delete', 'restore', 'revert'] as const;
export const ImprovementRollbackPreviewSchema = z.object({
  artifact_id: z.string(),
  entries: z.array(z.object({ path: z.string(), action: z.enum(IMPROVEMENT_ROLLBACK_ACTIONS) })),
  dirty: z.array(z.string()),
  blocked_reason: z.string().nullable(),
  dirty_only: z.boolean(),
});
export type ImprovementRollbackPreview = z.infer<typeof ImprovementRollbackPreviewSchema>;
export const ImprovementRollbackResultSchema = z.object({
  restored: z.boolean(),
  changed_files: z.number().int().nonnegative(),
  reset_proposal_ids: z.array(z.string()),
  safety_checkpoint: ImprovementCheckpointSchema.nullable(),
  blocked_reason: z.string().nullable(),
  warning: z.string().nullable(),
});
export type ImprovementRollbackResult = z.infer<typeof ImprovementRollbackResultSchema>;

/** Workspace-service command surface; the service owns every mutation (REQ-LIBRARY-158). */
export const ImprovementCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('get'), artifact_id: z.string() }),
  z.object({ action: z.literal('history'), artifact_id: z.string() }),
  z.object({ action: z.literal('approved'), artifact_id: z.string() }),
  z.object({ action: z.literal('save-collected'), artifact: z.unknown() }),
  z.object({ action: z.literal('review'), request: ProposalReviewRequestSchema }),
  z.object({ action: z.literal('edit'), request: ProposalEditRequestSchema }),
  z.object({ action: z.literal('delete'), request: ProposalDeleteRequestSchema }),
  z.object({ action: z.literal('prepare'), artifact_id: z.string(), dry_run: z.boolean().optional() }),
  z.object({ action: z.literal('record-applied'), artifact_id: z.string() }),
  z.object({ action: z.literal('rollback-preview'), artifact_id: z.string() }),
  z.object({ action: z.literal('rollback'), artifact_id: z.string(), force: z.boolean().default(false) }),
]);
export type ImprovementCommand = z.infer<typeof ImprovementCommandSchema>;
