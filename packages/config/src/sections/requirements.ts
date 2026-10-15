import { normalBranchForm } from '@rotaris/contracts';
import { FieldReader, sectionMap, vocabularyString, type Problem, type ProblemSink } from './field.js';

/**
 * Part AP — the `requirements:` block (REQ-CONFIG-183, 190..198; spec 08 §Persisted state), registered here for the
 * first time. Spec 08's board relies on four of its keys and nothing else: `scheduling.mode` and the concurrency
 * limit (REQ-TRACE-480/483), `change.analyze_changes` (REQ-TRACE-498 "Analysis switched off") and
 * `human_in_the_loop.confirm_source_writes` (REQ-TRACE-431); the run branch is `execution.branch_template`
 * (REQ-CONFIG-193, REQ-GIT-074). Those four sub-blocks are read in full with REQ-CONFIG-196/198/193..195's types
 * and defaults.
 *
 * REQ-CONFIG-183: every model under `requirements:` FORBIDS unknown keys — a hard load failure, the opposite of the
 * top level's silent drop — because this block drives runs nobody is watching. So the top level rejects any key this
 * specification never defined. The three sub-blocks the specification registers and no part has yet built —
 * `evidence` (REQ-CONFIG-190/191), `delivery` (REQ-CONFIG-192; its four keys are ADR-0041's and the store already
 * behaves as they say) and `board` (REQ-CONFIG-197) — are ACCEPTED as mappings and carried opaque, their inner
 * validation owed to the part that consumes them: refusing a documented key would be the wrong refusal, and
 * validating a block nothing reads would be a second copy of a schema nobody executes. Stated in ADR-0041's note.
 *
 * REQ-CONFIG-194: `execution.worktree_subpath` is named by the specification as NOT a configuration key of this
 * domain, so a file that states it is reported and ignored rather than rejected — a warning, and the workspace opens.
 * REQ-CONFIG-192: `delivery.store_subpath` is withdrawn, and REQ-CONFIG-183's carve-out treats it the same way: the opaque
 * `delivery` block is read for that one key, which is reported and dropped (`WITHDRAWN_STORE_SUBPATH`).
 */
export const SCHEDULING_MODES = ['manual', 'automatic'] as const;
export type SchedulingMode = (typeof SCHEDULING_MODES)[number];

export interface RequirementsSchedulingSection {
  readonly mode: SchedulingMode;
  readonly max_concurrent_units: number;
  readonly max_concurrent_requirements: number;
  readonly avoid_file_conflicts: boolean;
  readonly priority_order: readonly string[];
  readonly auto_release_dependents: boolean;
  readonly queue_limit: number;
}
export interface RequirementsChangeSection {
  readonly analyze_changes: boolean;
  readonly adopt_hash_after_verification: boolean;
  readonly propagate_evidence_loss: boolean;
  readonly gate_on_dependencies: boolean;
  readonly report_dangling_dependents: boolean;
}
export interface RequirementsHumanInTheLoopSection {
  readonly escalate: readonly string[];
  readonly require_review_before_done: boolean;
  readonly allow_force_done: boolean;
  readonly confirm_migration_worklist: boolean;
  readonly confirm_source_writes: boolean;
  readonly answer_timeout_minutes: number;
}
export interface RequirementsExecutionSection {
  readonly branch_template: string;
  readonly integration_branch_template: string;
  readonly target_branch: string | null;
  readonly keep_failed_worktrees: boolean;
  readonly retry_limit: number;
  readonly unit_timeout_minutes: number;
  readonly decomposition: { readonly enabled: boolean; readonly max_units: number; readonly require_confirmation: boolean };
}
export interface RequirementsPersonasSection {
  readonly source_discovery: string;
  readonly decomposition: string;
  readonly impact_analysis: string;
  readonly migration_analysis: string;
  readonly execution: string;
}
export interface RequirementsSection {
  readonly scheduling: RequirementsSchedulingSection;
  readonly change: RequirementsChangeSection;
  readonly human_in_the_loop: RequirementsHumanInTheLoopSection;
  readonly execution: RequirementsExecutionSection;
  readonly personas: RequirementsPersonasSection;
  /** Registered by the specification, carried opaque here: `evidence`, `delivery`, `board` (see the module note). */
  readonly opaque: Readonly<Record<'evidence' | 'delivery' | 'board', Readonly<Record<string, unknown>> | null>>;
}

/** REQ-CONFIG-196: `manual`, 2, 2, true, the five priorities, false, 0 (unbounded). */
export const REQUIREMENTS_SCHEDULING_DEFAULTS: RequirementsSchedulingSection = Object.freeze({
  mode: 'manual', max_concurrent_units: 2, max_concurrent_requirements: 2, avoid_file_conflicts: true,
  priority_order: Object.freeze(['critical', 'high', 'normal', 'low', 'none']), auto_release_dependents: false, queue_limit: 0,
});
export const REQUIREMENTS_CHANGE_DEFAULTS: RequirementsChangeSection = Object.freeze({ analyze_changes: true, adopt_hash_after_verification: true, propagate_evidence_loss: true, gate_on_dependencies: true, report_dangling_dependents: true });
/** REQ-CONFIG-198: the seven escalation conditions by default; `confirm_source_writes` false; zero means wait without limit. */
export const ESCALATION_CONDITIONS = ['contradictory-requirements', 'unclear-scope', 'competing-requirements', 'breaking-change', 'unclear-superseding', 'risky-migration', 'architectural-decision'] as const;
export const REQUIREMENTS_HUMAN_DEFAULTS: RequirementsHumanInTheLoopSection = Object.freeze({
  escalate: Object.freeze([...ESCALATION_CONDITIONS]), require_review_before_done: true, allow_force_done: false, confirm_migration_worklist: true, confirm_source_writes: false, answer_timeout_minutes: 0,
});
/** REQ-CONFIG-193/194/195 and REQ-GIT-074: the two templates, no target branch, keep failed trees, one retry, 120 minutes, decomposition on at six. */
export const REQUIREMENTS_EXECUTION_DEFAULTS: RequirementsExecutionSection = Object.freeze({
  branch_template: 'rotaris/req/{requirement_id}/{unit_id}', integration_branch_template: 'rotaris/req/{req}/integration/{id}', target_branch: null,
  keep_failed_worktrees: true, retry_limit: 1, unit_timeout_minutes: 120, decomposition: Object.freeze({ enabled: true, max_units: 6, require_confirmation: false }),
});
export const REQUIREMENTS_PERSONAS_DEFAULTS: RequirementsPersonasSection = Object.freeze({ source_discovery: 'requirements-engineer', decomposition: 'requirements-engineer', impact_analysis: 'requirements-engineer', migration_analysis: 'requirements-engineer', execution: 'coding-agent' });
export const REQUIREMENTS_DEFAULTS: RequirementsSection = Object.freeze({
  scheduling: REQUIREMENTS_SCHEDULING_DEFAULTS, change: REQUIREMENTS_CHANGE_DEFAULTS, human_in_the_loop: REQUIREMENTS_HUMAN_DEFAULTS, execution: REQUIREMENTS_EXECUTION_DEFAULTS, personas: REQUIREMENTS_PERSONAS_DEFAULTS,
  opaque: Object.freeze({ evidence: null, delivery: null, board: null }),
});

/** The keys the specification registers directly under `requirements:` (REQ-CONFIG-190..198); anything else is REQ-CONFIG-183's hard failure. */
export const REQUIREMENTS_TOP_KEYS = ['scheduling', 'change', 'human_in_the_loop', 'execution', 'personas', 'evidence', 'delivery', 'board'] as const;
const SCHEDULING_KEYS = Object.keys(REQUIREMENTS_SCHEDULING_DEFAULTS);
const CHANGE_KEYS = Object.keys(REQUIREMENTS_CHANGE_DEFAULTS);
const HUMAN_KEYS = Object.keys(REQUIREMENTS_HUMAN_DEFAULTS);
const EXECUTION_KEYS = [...Object.keys(REQUIREMENTS_EXECUTION_DEFAULTS), 'worktree_subpath'];
const DECOMPOSITION_KEYS = Object.keys(REQUIREMENTS_EXECUTION_DEFAULTS.decomposition);
const PERSONAS_KEYS = Object.keys(REQUIREMENTS_PERSONAS_DEFAULTS);

/** REQ-TRACE-481's ceiling belongs to the WIDGET, not to this key; the engine enforces whatever the file says (REQ-TRACE-483). ≥ 1 is REQ-CONFIG-196's bound. */
export function readRequirementsSection(value: unknown, sink: ProblemSink): RequirementsSection {
  const top = new FieldReader(sectionMap(value, 'requirements', sink), 'requirements', sink);
  top.rejectUnknown(REQUIREMENTS_TOP_KEYS);
  const d = REQUIREMENTS_DEFAULTS;

  const sch = new FieldReader(sectionMap(top.raw('scheduling'), 'requirements.scheduling', sink), 'requirements.scheduling', sink);
  sch.rejectUnknown(SCHEDULING_KEYS);
  const modeText = vocabularyString(sch.raw('mode'));
  let mode: SchedulingMode = d.scheduling.mode;
  if (sch.has('mode') && sch.raw('mode') !== null) {
    if (modeText !== null && (SCHEDULING_MODES as readonly string[]).includes(modeText)) mode = modeText as SchedulingMode;
    else sch.error('mode', `must be one of ${SCHEDULING_MODES.join(', ')}, got ${JSON.stringify(sch.raw('mode'))}`);
  }
  const scheduling: RequirementsSchedulingSection = {
    mode,
    max_concurrent_units: sch.int('max_concurrent_units', d.scheduling.max_concurrent_units, { min: 1 }),
    max_concurrent_requirements: sch.int('max_concurrent_requirements', d.scheduling.max_concurrent_requirements, { min: 1 }),
    avoid_file_conflicts: sch.bool('avoid_file_conflicts', d.scheduling.avoid_file_conflicts),
    priority_order: sch.stringList('priority_order', d.scheduling.priority_order),
    auto_release_dependents: sch.bool('auto_release_dependents', d.scheduling.auto_release_dependents),
    queue_limit: sch.int('queue_limit', d.scheduling.queue_limit, { min: 0 }),
  };

  const ch = new FieldReader(sectionMap(top.raw('change'), 'requirements.change', sink), 'requirements.change', sink);
  ch.rejectUnknown(CHANGE_KEYS);
  const change: RequirementsChangeSection = {
    analyze_changes: ch.bool('analyze_changes', d.change.analyze_changes),
    adopt_hash_after_verification: ch.bool('adopt_hash_after_verification', d.change.adopt_hash_after_verification),
    propagate_evidence_loss: ch.bool('propagate_evidence_loss', d.change.propagate_evidence_loss),
    gate_on_dependencies: ch.bool('gate_on_dependencies', d.change.gate_on_dependencies),
    report_dangling_dependents: ch.bool('report_dangling_dependents', d.change.report_dangling_dependents),
  };

  const hu = new FieldReader(sectionMap(top.raw('human_in_the_loop'), 'requirements.human_in_the_loop', sink), 'requirements.human_in_the_loop', sink);
  hu.rejectUnknown(HUMAN_KEYS);
  const human_in_the_loop: RequirementsHumanInTheLoopSection = {
    escalate: hu.stringList('escalate', d.human_in_the_loop.escalate),
    require_review_before_done: hu.bool('require_review_before_done', d.human_in_the_loop.require_review_before_done),
    allow_force_done: hu.bool('allow_force_done', d.human_in_the_loop.allow_force_done),
    confirm_migration_worklist: hu.bool('confirm_migration_worklist', d.human_in_the_loop.confirm_migration_worklist),
    confirm_source_writes: hu.bool('confirm_source_writes', d.human_in_the_loop.confirm_source_writes),
    answer_timeout_minutes: hu.int('answer_timeout_minutes', d.human_in_the_loop.answer_timeout_minutes, { min: 0 }),
  };

  const ex = new FieldReader(sectionMap(top.raw('execution'), 'requirements.execution', sink), 'requirements.execution', sink);
  ex.rejectUnknown(EXECUTION_KEYS);
  // REQ-CONFIG-194 / REQ-GIT-074: reported and ignored, never rejected; the workspace opens.
  if (ex.has('worktree_subpath')) ex.warn('worktree_subpath', 'is not a configuration key of this domain (REQ-CONFIG-194); it is ignored — requirement-unit checkouts live where REQ-GIT-137 fixes them');
  const de = new FieldReader(sectionMap(ex.raw('decomposition'), 'requirements.execution.decomposition', sink), 'requirements.execution.decomposition', sink);
  de.rejectUnknown(DECOMPOSITION_KEYS);
  const execution: RequirementsExecutionSection = {
    branch_template: ex.string('branch_template', d.execution.branch_template),
    integration_branch_template: ex.string('integration_branch_template', d.execution.integration_branch_template),
    target_branch: ex.stringOrNull('target_branch'),
    keep_failed_worktrees: ex.bool('keep_failed_worktrees', d.execution.keep_failed_worktrees),
    retry_limit: ex.int('retry_limit', d.execution.retry_limit, { min: 0 }),
    unit_timeout_minutes: ex.int('unit_timeout_minutes', d.execution.unit_timeout_minutes, { min: 1 }),
    decomposition: {
      enabled: de.bool('enabled', d.execution.decomposition.enabled),
      max_units: de.int('max_units', d.execution.decomposition.max_units, { min: 1 }),
      require_confirmation: de.bool('require_confirmation', d.execution.decomposition.require_confirmation),
    },
  };
  // REQ-GIT-139: both placeholders must appear, in either spelling — checked at load so a run never derives a branch that collides by construction.
  if (!hasPlaceholder(execution.branch_template, ['requirement_id', 'req']) || !hasPlaceholder(execution.branch_template, ['unit_id', 'unit'])) {
    ex.error('branch_template', `must name the requirement ({requirement_id} or {req}) and the unit ({unit_id} or {unit}), got ${JSON.stringify(execution.branch_template)}`);
  }
  // REQ-GIT-138: the three namespaces stay disjoint, tested on a RENDERED example (every placeholder substituted with a fixed
  // sample and slugged as a real name is), never on the literal prefix — a template reaching a forbidden namespace only
  // after substitution is caught here, while the configuration is loaded, so nothing is ever created from it.
  for (const [key, template] of [['branch_template', execution.branch_template], ['integration_branch_template', execution.integration_branch_template]] as const) {
    const example = renderNamespaceExample(template);
    const hit = FORBIDDEN_NAMESPACES.find((ns) => example === ns.slice(0, -1) || example.startsWith(ns));
    if (hit !== undefined) ex.error(key, `${JSON.stringify(template)} renders into the ${hit} namespace (example ${JSON.stringify(example)}), which requirement-execution branches must not share (REQ-GIT-138)`);
  }

  const pe = new FieldReader(sectionMap(top.raw('personas'), 'requirements.personas', sink), 'requirements.personas', sink);
  pe.rejectUnknown(PERSONAS_KEYS);
  const personas: RequirementsPersonasSection = {
    source_discovery: pe.string('source_discovery', d.personas.source_discovery),
    decomposition: pe.string('decomposition', d.personas.decomposition),
    impact_analysis: pe.string('impact_analysis', d.personas.impact_analysis),
    migration_analysis: pe.string('migration_analysis', d.personas.migration_analysis),
    execution: pe.string('execution', d.personas.execution),
  };

  const opaqueOf = (key: 'evidence' | 'delivery' | 'board') => {
    const raw = top.raw(key);
    if (raw === undefined || raw === null) return null;
    return sectionMap(raw, `requirements.${key}`, sink);
  };
  // REQ-CONFIG-192 / REQ-CONFIG-183's carve-out: `delivery.store_subpath` is withdrawn, so it is reported once and ignored —
  // never rejected, and dropped from the block so it contributes nothing — while the rest of the block is carried as before.
  let delivery = opaqueOf('delivery');
  if (delivery !== null && Object.prototype.hasOwnProperty.call(delivery, 'store_subpath')) {
    new FieldReader(delivery, 'requirements.delivery', sink).warn('store_subpath', WITHDRAWN_STORE_SUBPATH);
    const { store_subpath: _withdrawn, ...rest } = delivery;
    delivery = rest;
  }
  return { scheduling, change, human_in_the_loop, execution, personas, opaque: { evidence: opaqueOf('evidence'), delivery, board: opaqueOf('board') } };
}

/**
 * REQ-CONFIG-183's report for the withdrawn key (the file and its scope are prefixed where the load renders the warning):
 * withdrawn rather than mistyped, what became of what it configured (REQ-CONFIG-192), and that it is ignored while the rest loads.
 */
export const WITHDRAWN_STORE_SUBPATH =
  'was withdrawn from this domain, not mistyped (REQ-CONFIG-192): delivery records are no longer files in the workspace and no configuration key names a location for them; it is ignored, and the rest of the configuration loaded';

function hasPlaceholder(template: string, names: readonly string[]): boolean {
  return names.some((n) => template.includes(`{${n}}`));
}

/** REQ-GIT-138: the two namespaces a requirement-execution template may not render into. */
export const FORBIDDEN_NAMESPACES = ['rotaris/session/', 'rotaris/integration/'] as const;
/**
 * REQ-GIT-137: the fixed requirement-unit checkout directory, relative to `<workspace>/.rotaris/`. The workspace package's
 * `REQUIREMENT_WORKTREES_SUBPATH` is the one a run uses; config sits below it and cannot import it, so the requirement's
 * text is repeated here for the load-time check only (`apps/desktop/src/workspace-service/worktree-storage.test.ts`, which imports both, pins the two equal).
 */
export const REQUIREMENT_CHECKOUT_SUBPATH = 'requirements/worktrees';
/**
 * REQ-GIT-138's directory half: the session checkout directory `worktree_storage_subpath` names (under `.rotaris/`,
 * REQ-GIT-005) must not resolve to the fixed requirement checkout directory or to any directory inside it. Returns the
 * rejection text, or null when the value passes. The value is read as `sessionWorktreePath` reads it — trimmed, empty
 * meaning `worktrees`, either separator — and normalised, so `./requirements//worktrees/x` is caught. A value that leaves
 * `.rotaris` is not this check's: REQ-GIT-005 refuses it where the worktree is placed. Windows folds case, so there
 * `Requirements/Worktrees` names the same directory; elsewhere it does not. A value that CONTAINS the requirement
 * directory (`requirements`, `.`) is not rejected: REQ-GIT-138 names only "to … or … inside it" — ruled (OQ-263, confirmed
 * as built, R-072, 2026-10-13; the dated note under REQ-GIT-138 records the reading).
 */
export function worktreeStorageCollision(subpath: string, platform: NodeJS.Platform = process.platform): string | null {
  const trimmed = subpath.trim() === '' ? 'worktrees' : subpath.trim();
  // An absolute value leaves `.rotaris` as surely as a climbing one: REQ-GIT-005's to refuse, not this check's to report as
  // inside (`docs/defects/fixed/an-absolute-worktree-storage-subpath-is-reported-as-resolving-inside-rotaris.md`).
  if (/^[\\/]/.test(trimmed) || /^[A-Za-z]:/.test(trimmed)) return null;
  const segments: string[] = [];
  for (const part of trimmed.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (segments.length === 0) return null; segments.pop(); continue; }
    segments.push(part);
  }
  const fold = (x: string) => (platform === 'win32' ? x.toLowerCase() : x);
  const fixed = REQUIREMENT_CHECKOUT_SUBPATH.split('/');
  if (segments.length < fixed.length || !fixed.every((f, i) => fold(segments[i]!) === f)) return null;
  return `${JSON.stringify(subpath)} resolves to .rotaris/${segments.join('/')}, inside the requirement checkout directory .rotaris/${REQUIREMENT_CHECKOUT_SUBPATH} (REQ-GIT-137), which session worktrees must not share (REQ-GIT-138)`;
}
/** REQ-GIT-139's slug, repeated here only for the load-time example (the workspace package holds the one a run uses; both are the requirement's text). */
function slugSample(value: string): string {
  const folded = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  const cut = folded.slice(0, 40).replace(/[-.]+$/, '');
  return cut === '' ? 'x' : cut;
}
/** REQ-GIT-138: every placeholder substituted with a fixed non-empty sample, slugged and assembled as REQ-GIT-139 assembles a real name. */
export function renderNamespaceExample(template: string): string {
  return normalBranchForm(template.replace(/\{[a-z_]+\}/g, (m) => slugSample(m === '{attempt}' ? '2' : `sample-${m.slice(1, -1)}`)));
}

/**
 * REQ-CONFIG-183 "The section also validates on assignment": the same reader over a one-key patch, so a value a
 * surface writes (the queue's two persisted controls, REQ-TRACE-480) is refused before any file is touched — the
 * discipline `validateRuntimeField` gives `runtime:`.
 */
export function validateRequirementsPatch(patch: unknown): readonly Problem[] {
  const sink: ProblemSink = { errors: [], warnings: [] };
  readRequirementsSection(patch, sink);
  return sink.errors;
}
