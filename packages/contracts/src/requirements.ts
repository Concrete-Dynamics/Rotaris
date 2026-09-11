import { z } from 'zod';
import type { Result } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION } from './version.js';

/**
 * Part AK — the requirements domain's vocabulary as it crosses a boundary (spec 08; ADR-0040, ADR-0041).
 *
 * The TYPES below are the seam between three parts and are written exactly as the plan states them: Part AJ's
 * engine produces the parse, the sweep and the verification report; Part AK's projection joins them with the
 * delivery rows into one `BoardProjection`; Part AK′ draws it and Part AP acts on it. They live HERE so that `ui`
 * never imports `workspace` (the component view's matrix has no such edge). The zod schemas beside them exist only
 * where a value crosses a process boundary — the command envelope (channel 5), the workspace-service request and
 * channel 10 — and add nothing the types do not already say.
 *
 * Every vocabulary is CLOSED by the requirement named beside it (spec 08 §Board tokens): the six delivery columns
 * plus `blocked` (REQ-TRACE-232/233), the fourteen actions (REQ-TRACE-382), the five blocker kinds (REQ-TRACE-446),
 * the seven health words (REQ-TRACE-252), the twelve relation tokens (REQ-TRACE-274). A member outside a set fails
 * the schema rather than receiving a fallback, which is what REQ-TRACE-258 and REQ-TRACE-446 ask of a sixth kind.
 */

export type ReqId = string;                     // `<PREFIX>-<digits>`, PREFIX from layout `id_prefix`, default REQ (REQ-TRACE-078)
export type Lifecycle = 'draft' | 'approved' | 'deprecated';
export type ReqKind = 'product' | 'technical';

export interface LayoutConfig {                 // rotaris-traceability.json at the repository root (REQ-TRACE-040..046)
  readonly storeDir: string; readonly idPrefix: string; readonly artifactPath: string;
  readonly debtBaselinePath: string; readonly orphanModuleBaselinePath: string; readonly orphanTestBaselinePath: string;
  readonly retiredLogPath: string; readonly sourceRoots: readonly string[]; readonly testRoots: readonly string[];
  readonly skip: readonly string[]; readonly annotationPatterns: readonly string[];   // project-supplied regexes (OQ-25)
}
export interface RequirementRecord {            // one per DECLARED identifier (multi-id documents yield several)
  readonly id: ReqId; readonly number: number; readonly status: Lifecycle;
  readonly traceRequired: boolean; readonly testRequired: boolean; readonly title: string; readonly kind: ReqKind;
  readonly derivedFrom: readonly ReqId[]; readonly legacyId?: string; readonly priority?: string; readonly epic?: ReqId;
  readonly date?: string; readonly source?: string; readonly sourcePath: string;        // repository-relative POSIX
  readonly contentHash: string;                 // 16 hex over the whole normalised document
  readonly canonicalHash: string;               // 32 hex, per identifier
  readonly prose: string; readonly isEpic: boolean;
}
export interface ParseError { readonly path: string; readonly line?: number; readonly message: string }
export interface StoreParse {
  readonly root: string; readonly layout: LayoutConfig; readonly records: readonly RequirementRecord[]; // ascending number
  readonly fingerprint: string;                 // 64 hex (§Hashes, global fingerprint)
  readonly errors: readonly ParseError[]; readonly empty?: 'no-directory' | 'no-documents' | 'no-requirements';
}
export type SiteKind = 'implementation' | 'test' | 'covers';
export interface AnnotationSite { readonly path: string; readonly line: number; readonly kind: SiteKind; readonly ids: readonly ReqId[]; readonly testNode?: string /* path::fn or path::Class::fn */ }
export interface SweepResult { readonly sites: readonly AnnotationSite[]; readonly modules: readonly string[]; readonly tests: readonly string[]; readonly durationMs: number }
export interface Finding { readonly severity: 'error' | 'warning'; readonly code: string; readonly id?: ReqId; readonly path?: string; readonly line?: number; readonly message: string }
export interface Statistics { readonly total: number; readonly approved: number; readonly traced: number; readonly testCovered: number; readonly debt: { readonly trace: number; readonly test: number; readonly orphan: number; readonly orphanTest: number } }
export type EvidenceState = 'satisfied' | 'stale' | 'failed';      // REQ-TRACE-270; absence is `undefined`
export interface RequirementEvidence { readonly implementationTrace?: EvidenceState; readonly coveringTest?: EvidenceState; readonly verification?: EvidenceState; readonly sites: readonly AnnotationSite[] }
export interface VerificationReport { readonly generation: number; readonly findings: readonly Finding[]; readonly statistics: Statistics; readonly evidence: Readonly<Record<ReqId, RequirementEvidence>> }

export type PassPhase = 'reading' | 'checks' | 'coverage' | 'recording' | 'adopting';
export type ProgressReport =
  | { readonly kind: 'phase'; readonly phase: PassPhase; readonly total: number }
  | { readonly kind: 'item'; readonly phase: PassPhase; readonly label: string; readonly position: number; readonly total: number; readonly detail?: string; readonly deadlineSeconds?: number };
export type TraceabilityFailure =
  | { readonly kind: 'configuration'; readonly path: string; readonly cause: string }
  | { readonly kind: 'parse'; readonly errors: readonly ParseError[] }
  | { readonly kind: 'busy'; readonly operation: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly what: string; readonly cause: string };
export interface PassOptions { readonly signal: AbortSignal; readonly progress?: (report: ProgressReport) => void }

/** Implemented by AJ in packages/workspace/src/traceability; faked by AK's tests. Every method runs off the interface loop. */
export interface TraceabilityEngine {
  parseStore(root: string, options: PassOptions): Promise<Result<StoreParse, TraceabilityFailure>>;
  sweep(parse: StoreParse, options: PassOptions): Promise<Result<SweepResult, TraceabilityFailure>>;
  verify(parse: StoreParse, sweep: SweepResult, options: PassOptions): Promise<Result<VerificationReport, TraceabilityFailure>>;
  check(root: string, options: PassOptions): Promise<Result<{ readonly report: VerificationReport; readonly parseErrorsOnly: boolean }, TraceabilityFailure>>;
  regenerate(root: string, options: PassOptions): Promise<Result<{ readonly artifactPath: string; readonly outcome: 'regenerated' | 'already up to date'; readonly count: number }, TraceabilityFailure>>;
  updateBaselines(root: string, options: PassOptions): Promise<Result<readonly { readonly path: string; readonly entries: number }[], TraceabilityFailure>>;
  compare(root: string, base: string | undefined, options: PassOptions): Promise<Result<{ readonly entries: readonly ChangeEntry[]; readonly drift: boolean; readonly noBase: boolean; readonly unpropagated: number }, TraceabilityFailure>>;
}
export interface ChangeEntry { readonly kind: 'added' | 'modified' | 'removed' | 'status'; readonly id: ReqId; readonly title: string; readonly from?: string; readonly to?: string; readonly obligation: string; readonly drift: boolean; readonly sites: readonly AnnotationSite[] }

// ---- delivery (ADR-0041) ----
export type DeliveryColumn = 'backlog' | 'ready' | 'running' | 'review' | 'needs-update' | 'done';
export type ColumnToken = DeliveryColumn | 'blocked';
export type BoardAction = 'release' | 'return' | 'accept' | 'rerun' | 'send-back' | 'reject' | 'hold' | 'resume' | 'answer-blocker' | 'edit' | 'create' | 'accept-proposal' | 'accept-change-work' | 'keep-worktree';
export type BlockerKind = 'dependency' | 'conflict' | 'decision' | 'run-failure' | 'stated';
export type HealthToken = 'healthy' | 'needs-update' | 'incomplete-traceability' | 'verification-failed' | 'blocked' | 'superseded' | 'deprecated';
export type RelationToken = 'parent' | 'children' | 'derived-from' | 'derived-requirements' | 'supersedes' | 'superseded-by' | 'depends-on' | 'blocks' | 'refines' | 'refined-by' | 'conflicts-with' | 'related-to';
export type Actor = { readonly kind: 'user'; readonly person: string } | { readonly kind: 'system' };  // REQ-CONFIG-198; constructed only at the interactive boundary (main)
export interface Reachability { readonly reachable: boolean; readonly consequence?: string; readonly confirm: boolean; readonly reason?: string; readonly glyph: string; readonly reachableFromSource: readonly DeliveryColumn[] }
export interface Refusal { readonly reason: string; readonly reachable?: readonly DeliveryColumn[] }
export interface TransitionOutcome { readonly id: ReqId; readonly from: ColumnToken; readonly to: ColumnToken; readonly startsRun: boolean; readonly historyEntry: number }

export interface BoardCard {
  readonly id: ReqId; readonly title: string; readonly column: ColumnToken; readonly returnTo?: DeliveryColumn;
  readonly health: HealthToken; readonly lifecycle: Lifecycle; readonly kind: ReqKind; readonly priority?: string; readonly epic?: ReqId;
  readonly sourcePath: string; readonly sourceKey: string; readonly evidence: RequirementEvidence; readonly alerts: readonly string[];  // fixed order, first spelling wins
  readonly relations: readonly { readonly kind: RelationToken; readonly id: ReqId }[];
  readonly blocker?: { readonly kind: BlockerKind; readonly reason: string; readonly answerPaths: readonly ('choose' | 'navigate' | 'resume' | 'inspect')[] };
  readonly run?: { readonly sessionId?: string; readonly unit?: string; readonly waitingOnPerson: boolean; readonly stage?: string; readonly interrupted: boolean };
  readonly inFlight?: { readonly action: BoardAction; readonly label: string };
  readonly facts: readonly { readonly label: string; readonly value: string }[];   // optional card facts, fixed order
}
export interface EpicCard { readonly id: ReqId; readonly title: string; readonly done: number; readonly total: number; readonly children: readonly ReqId[] }
export interface QueueEntry { readonly id: ReqId; readonly unit: string; readonly state: 'executing' | 'next' | 'deferred'; readonly reason?: string /* engine's words, unaltered */ }
export interface DeliveryQueue { readonly entries: readonly QueueEntry[]; readonly automatic: boolean; readonly concurrency: number; readonly stopped: boolean }
/**
 * REQ-TRACE-406 — the board state is ONE value carrying the columns, the queue and the pending and feedback action
 * lists together. It is this interface: the cards (each with its column, and each with the `inFlight` action that is
 * the pending list, and the `feedback` sentence the surface shows), the epics, the queue and the blocked summary
 * arrive in a single message and are replaced in a single assignment, so no two of them can be read from different
 * generations. Cited by Part R″ as part of lane R's closing statement; the shape is Part AK's and is unchanged.
 */
export interface BoardProjection {
  readonly workspace: string; readonly generation: number; readonly producedAt: string;    // ISO; the display mapping takes `now` as an argument (REQ-TRACE-380)
  readonly source: { readonly kind: 'none' } | { readonly kind: 'store'; readonly dir: string; readonly writable: boolean; readonly canCreate: boolean };
  readonly cards: readonly BoardCard[]; readonly epics: readonly EpicCard[]; readonly queue: DeliveryQueue;
  readonly blocked: readonly { readonly id: ReqId; readonly reason: string; readonly returnTo: DeliveryColumn }[];   // true total = blocked.length
  readonly analysisEnabled: boolean; readonly parseErrors: readonly ParseError[];
}
export interface RequirementDetail { readonly card: BoardCard; readonly prose: string; readonly history: readonly { readonly at: string; readonly action: BoardAction; readonly actor: Actor; readonly from: ColumnToken; readonly to: ColumnToken; readonly current: boolean }[] | 'unavailable' | 'reading'; readonly runs: readonly { readonly unit: string; readonly sessionId?: string; readonly branch?: string; readonly worktree?: string; readonly status: string }[]; readonly evidenceDetail: readonly AnnotationSite[]; readonly findings: readonly Finding[] }

// ---- commands (channel 5), main → workspace service; Actor is stamped by main, never sent by a renderer ----
export type RequirementsCommand =
  | { readonly name: 'requirements.board'; readonly workspace: string }                       // → BoardProjection
  | { readonly name: 'requirements.detail'; readonly workspace: string; readonly id: ReqId }   // → RequirementDetail
  | { readonly name: 'requirements.refresh'; readonly workspace: string }                     // → { generation }
  | { readonly name: 'requirements.reachable'; readonly workspace: string; readonly id: ReqId; readonly from: ColumnToken; readonly to: ColumnToken }  // → Reachability
  | { readonly name: 'requirements.act'; readonly workspace: string; readonly id: ReqId; readonly action: BoardAction; readonly target?: ColumnToken; readonly payload?: Readonly<Record<string, string>> }  // → Result<TransitionOutcome, Refusal>
  | { readonly name: 'requirements.operation'; readonly workspace: string; readonly operation: 'check' | 'regenerate' | 'baselines' | 'compare'; readonly base?: string }
  | { readonly name: 'requirements.cancel'; readonly workspace: string; readonly operation: string }
  | { readonly name: 'requirements.queue.set'; readonly workspace: string; readonly automatic?: boolean; readonly concurrency?: number; readonly stop?: true; readonly start?: true; readonly hold?: ReqId; readonly release?: ReqId; readonly disclosure?: DisclosureState }   // Part AP: `start` (the seam addition the plan accepted) and `disclosure` with a release (REQ-TRACE-472)
  | { readonly name: 'requirements.source.write'; readonly workspace: string; readonly id?: ReqId; readonly document: string; readonly location?: string }   // AP: edit/create
  | { readonly name: 'requirements.source.previewLocation'; readonly workspace: string; readonly epic?: ReqId }
  // Part AP — the run family (spec 08 §Runs Started from the Board; ADR-0041): main's coordinator speaks these to the service as the SYSTEM; a person's copy is refused (REQ-TRACE-392).
  | { readonly name: 'requirements.run.preview'; readonly workspace: string; readonly id: ReqId; readonly action: BoardAction }   // → RunLaunchPreview (REQ-TRACE-472/474: the disclosure's facts, nothing provisioned)
  | { readonly name: 'requirements.run.claim'; readonly workspace: string }                                                   // → RunClaim | null (the scheduler's next dispatch, claimed)
  | { readonly name: 'requirements.run.started'; readonly workspace: string; readonly id: ReqId; readonly unit: string; readonly sessionId: string; readonly permissions: string }   // → Result<TransitionOutcome, Refusal> (REQ-TRACE-464)
  | { readonly name: 'requirements.run.ended'; readonly workspace: string; readonly sessionId: string; readonly outcome: RunOutcome; readonly detail: string }   // → RunSettled
  | { readonly name: 'requirements.run.abandon'; readonly workspace: string; readonly id: ReqId; readonly unit: string; readonly reason: string }   // → { released: boolean } (REQ-TRACE-463: the reason nothing started is reported on the queue)
  | { readonly name: 'requirements.run.waiting'; readonly workspace: string; readonly sessionId: string; readonly waiting: boolean }   // → { noted: boolean } (REQ-TRACE-466)
  | { readonly name: 'requirements.run.reap'; readonly workspace: string; readonly live: readonly string[] }   // → RunReaped[] (REQ-TRACE-476 with the run host's real live set)
  // Part AP — the two pane reads: the review's twelve elements (REQ-TRACE-417..420) and a blocker with its engine fields (REQ-TRACE-449/452).
  | { readonly name: 'requirements.review'; readonly workspace: string; readonly id: ReqId }    // → ReviewPayload
  | { readonly name: 'requirements.blocker'; readonly workspace: string; readonly id: ReqId };  // → BlockerPayload
/** channel 10 */
export interface RequirementsChanged { readonly workspace: string; readonly generation: number; readonly affected: readonly ReqId[] | null; readonly progress?: ProgressReport }

// ---- the closed vocabularies as values, and the schemas the boundaries need ----

/** REQ-TRACE-232: the six delivery stages in their fixed order; the order is data here and derived nowhere else. */
export const DELIVERY_COLUMNS = ['backlog', 'ready', 'running', 'review', 'needs-update', 'done'] as const satisfies readonly DeliveryColumn[];
/** REQ-TRACE-233: `blocked` is a condition, not a stage; it is a column token and never a delivery column. */
export const COLUMN_TOKENS = [...DELIVERY_COLUMNS, 'blocked'] as const satisfies readonly ColumnToken[];
/** REQ-TRACE-382: exactly fourteen, so a completeness sweep over the set is possible. */
export const BOARD_ACTIONS = ['release', 'return', 'accept', 'rerun', 'send-back', 'reject', 'hold', 'resume', 'answer-blocker', 'edit', 'create', 'accept-proposal', 'accept-change-work', 'keep-worktree'] as const satisfies readonly BoardAction[];
/** REQ-TRACE-446: exactly five. */
export const BLOCKER_KINDS = ['dependency', 'conflict', 'decision', 'run-failure', 'stated'] as const satisfies readonly BlockerKind[];
/** REQ-TRACE-252: exactly seven words. */
export const HEALTH_TOKENS = ['healthy', 'needs-update', 'incomplete-traceability', 'verification-failed', 'blocked', 'superseded', 'deprecated'] as const satisfies readonly HealthToken[];
/** REQ-TRACE-274: the twelve relation tokens. */
export const RELATION_TOKENS = ['parent', 'children', 'derived-from', 'derived-requirements', 'supersedes', 'superseded-by', 'depends-on', 'blocks', 'refines', 'refined-by', 'conflicts-with', 'related-to'] as const satisfies readonly RelationToken[];

/** Spec 08 §Identifier format: `<PREFIX>-<digits>`, one uppercase token, no leading zeros, no upper bound. */
export const REQ_ID_PATTERN = /^[A-Z][A-Z0-9]*-(?:0|[1-9][0-9]*)$/;
export const ReqIdSchema = z.string().regex(REQ_ID_PATTERN);
export const DeliveryColumnSchema = z.enum(DELIVERY_COLUMNS);
export const ColumnTokenSchema = z.enum(COLUMN_TOKENS);
export const BoardActionSchema = z.enum(BOARD_ACTIONS);
export const BlockerKindSchema = z.enum(BLOCKER_KINDS);
export const HealthTokenSchema = z.enum(HEALTH_TOKENS);
export const RelationTokenSchema = z.enum(RELATION_TOKENS);
/** REQ-CONFIG-198: a person is named by the operating-system account of the interactive session; nothing else claims to be one. */
export const ActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), person: z.string().min(1) }),
  z.object({ kind: z.literal('system') }),
]);
const PassPhaseSchema = z.enum(['reading', 'checks', 'coverage', 'recording', 'adopting']);
export const ProgressReportSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('phase'), phase: PassPhaseSchema, total: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('item'), phase: PassPhaseSchema, label: z.string(), position: z.number().int().positive(), total: z.number().int().nonnegative(), detail: z.string().optional(), deadlineSeconds: z.number().positive().optional() }),
]);

/**
 * The command family as it crosses channel 5 inside the one `requirements` envelope member of `CommandRequestSchema`
 * (`commands.ts`, the Part AK spread) and as main relays it to the workspace service (`process-protocol.ts`). The
 * discriminator is `name`, as the seam writes it. `workspace` is what the renderer names and what main REPLACES with
 * the canonical root of the workspace it has open — a renderer cannot act on a workspace other than its own, the same
 * discipline `composer.readDraft` takes for the draft. No member carries an actor: REQ-CONFIG-198 fixes who is a
 * person at the boundary the action arrives through, and main stamps it there.
 */
const workspace = z.string().min(1);
export const RequirementsCommandSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('requirements.board'), workspace }),
  z.object({ name: z.literal('requirements.detail'), workspace, id: ReqIdSchema }),
  z.object({ name: z.literal('requirements.refresh'), workspace }),
  z.object({ name: z.literal('requirements.reachable'), workspace, id: ReqIdSchema, from: ColumnTokenSchema, to: ColumnTokenSchema }),
  z.object({ name: z.literal('requirements.act'), workspace, id: ReqIdSchema, action: BoardActionSchema, target: ColumnTokenSchema.optional(), payload: z.record(z.string(), z.string()).optional() }),
  z.object({ name: z.literal('requirements.operation'), workspace, operation: z.enum(['check', 'regenerate', 'baselines', 'compare']), base: z.string().optional() }),
  z.object({ name: z.literal('requirements.cancel'), workspace, operation: z.string().min(1) }),
  z.object({ name: z.literal('requirements.queue.set'), workspace, automatic: z.boolean().optional(), concurrency: z.number().int().positive().max(64).optional(), stop: z.literal(true).optional(), start: z.literal(true).optional(), hold: ReqIdSchema.optional(), release: ReqIdSchema.optional(), disclosure: z.enum(['accepted', 'suppressed', 'off']).optional() }),   // Part AP: `start`, `disclosure`
  z.object({ name: z.literal('requirements.source.write'), workspace, id: ReqIdSchema.optional(), document: z.string(), location: z.string().optional() }),
  z.object({ name: z.literal('requirements.source.previewLocation'), workspace, epic: ReqIdSchema.optional() }),
  // Part AP — the run family.
  z.object({ name: z.literal('requirements.run.preview'), workspace, id: ReqIdSchema, action: BoardActionSchema }),
  z.object({ name: z.literal('requirements.run.claim'), workspace }),
  z.object({ name: z.literal('requirements.run.started'), workspace, id: ReqIdSchema, unit: z.string().min(1), sessionId: z.string().min(1), permissions: z.string() }),
  z.object({ name: z.literal('requirements.run.ended'), workspace, sessionId: z.string().min(1), outcome: z.enum(['completed', 'failed', 'cancelled']), detail: z.string() }),
  z.object({ name: z.literal('requirements.run.abandon'), workspace, id: ReqIdSchema, unit: z.string().min(1), reason: z.string() }),
  z.object({ name: z.literal('requirements.run.waiting'), workspace, sessionId: z.string().min(1), waiting: z.boolean() }),
  z.object({ name: z.literal('requirements.run.reap'), workspace, live: z.array(z.string()) }),
  z.object({ name: z.literal('requirements.review'), workspace, id: ReqIdSchema }),
  z.object({ name: z.literal('requirements.blocker'), workspace, id: ReqIdSchema }),
]);
/** The command as it arrives off the wire (zod's `optional` admits an explicit `undefined`; the seam's type does not). */
export type RequirementsCommandPayload = z.infer<typeof RequirementsCommandSchema>;

/**
 * Channel 10 (`requirements:changed`, main → every window): a generation moved. `affected` names the requirements a
 * repaint must touch (REQ-TRACE-374: "only the cards for those requirements SHALL change"), or null for a whole
 * pass; `progress` is REQ-TRACE-351's commentary and carries no authority (REQ-TRACE-353). The payload is a
 * generation and not the board: a counter cannot be overtaken, so a window that sees it move re-reads
 * `requirements.board` and gets the one immutable value of that generation (REQ-TRACE-348) — the same reasoning
 * channel 9 gives for the library revision.
 */
export const RequirementsChangedSchema = z.object({
  v: z.literal(CONTRACT_SCHEMA_VERSION),
  workspace: z.string(),
  generation: z.number().int().nonnegative(),
  affected: z.array(ReqIdSchema).nullable(),
  progress: ProgressReportSchema.optional(),
});

/**
 * REQ-TRACE-289: identifier ordering is digit-run aware — `REQ-9` before `REQ-10` — and there is ONE implementation
 * shared by the engine and the board "rather than two that agree by luck". It lives in contracts because both
 * `workspace` (the engine, the projection) and `ui-core` (the display sort) may import it and neither may import the
 * other. The prefix compares by code point, then the number numerically; an identifier outside the pattern falls
 * back to a code-point comparison of the whole string, deterministically (REQ-TRACE-288's "never randomly").
 */
export function compareReqIds(a: ReqId, b: ReqId): number {
  const pa = splitReqId(a);
  const pb = splitReqId(b);
  if (pa && pb) {
    if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1;
    if (pa.number !== pb.number) return pa.number < pb.number ? -1 : 1;
    return 0;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The two halves of a well-formed identifier, or undefined for anything else. */
export function splitReqId(id: string): { readonly prefix: string; readonly number: number } | undefined {
  const m = REQ_ID_PATTERN.exec(id);
  if (!m) return undefined;
  const dash = id.lastIndexOf('-');
  return { prefix: id.slice(0, dash), number: Number(id.slice(dash + 1)) };
}

// ---- Part AP — runs from the board, the queue and the panes (spec 08 §Runs Started from the Board, §Delivery Queue, §Review Surface, §Blockers; ADR-0041) ----

/** How a board-started run ended, as main's coordinator classifies the run host's terminal result (REQ-TRACE-477). */
export type RunOutcome = 'completed' | 'failed' | 'cancelled';
/** REQ-TRACE-470/472: what a run was granted, written onto its run row so the disclosure and the audit cannot differ. */
export type RunPermissions = 'permissive' | 'workspace';
/** The `payload.disclosure` values a run-starting `requirements.act` (or a queue release) carries from the surface that showed it (REQ-TRACE-472). */
export const DISCLOSURE_STATES = ['accepted', 'suppressed', 'off'] as const;
export type DisclosureState = (typeof DISCLOSURE_STATES)[number];
/**
 * REQ-TRACE-472/474: the facts the disclosure states BEFORE the first action of a launch — the worktree the run is
 * confined to (derived, never provisioned by a preview), the branch, the unit, whether the workspace already opted
 * in to unattended work (then REQ-TRACE-474 says nothing), and whether the repository can host a run at all
 * (REQ-TRACE-498's two repository rows). The workspace service answers it; main adds the preference half (`LaunchPreview`).
 */
export interface RunLaunchPreview {
  readonly id: ReqId;
  readonly action: BoardAction;
  readonly unit: string;
  readonly branch: string;
  readonly worktreePath: string;
  /** `true` when `runtime.permission_mode` is already `autonomous` — no redundant disclosure (REQ-TRACE-474). */
  readonly workspaceUnattended: boolean;
  /** Whether the scheduler would begin the run at once, or defer it — with the scheduler's reason (REQ-TRACE-463). */
  readonly startsNow: boolean;
  readonly deferredReason?: string;
  /** `ok`, or the stated reason a run has nothing to branch from (REQ-TRACE-498: not a repository; no commit). */
  readonly repository: { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly offerSetup: boolean };
  /** REQ-TRACE-467/468: `runtime.approval_timeout_seconds` as the layered configuration resolves it (zero = no limit), read by the service that loads the configuration. */
  readonly approvalTimeoutSeconds: number;
}
/** Main's answer to `requirements.runs {op: 'preview'}`: the service's facts plus the two desktop preferences and the effective wait (REQ-TRACE-467/468). */
export interface LaunchPreview extends RunLaunchPreview {
  /** `due`: the dialog must be shown; `suppressed`: accepted permanently before; `off`: the elevation is switched off; `unattended`: REQ-TRACE-474's silence. */
  readonly disclosure: 'due' | 'suppressed' | 'off' | 'unattended';
  readonly permissions: RunPermissions;
  /** `runtime.approval_timeout_seconds` as the layered configuration resolves it; zero is an unlimited wait and is never shown as "0 seconds" (REQ-TRACE-468). */
  readonly approvalWait: { readonly seconds: number; readonly unlimited: boolean };
}
/** The scheduler's next dispatch: the worktree the release provisioned (REQ-TRACE-464 "take over the worktree already provisioned"), the prompt, and what the launch was disclosed for. */
export interface RunClaim {
  readonly id: ReqId;
  readonly unit: string;
  readonly worktree: { readonly ref: string; readonly path: string; readonly branch: string; readonly baseBranch: string; readonly baseRevision: string };
  readonly prompt: string;
  /** REQ-TRACE-472: what the launch's disclosure covered; the coordinator grants exactly that and writes it onto the run row. */
  readonly permissions: RunPermissions;
}
export interface RunSettled { readonly settled: boolean; readonly id?: ReqId; readonly unit?: string; readonly to?: ColumnToken; readonly reason?: string }
export interface RunReaped { readonly id: ReqId; readonly unit: string; readonly sessionId: string | null; readonly statement: string; readonly held: boolean }
/** The names only the system may speak; a `user` actor is refused (REQ-TRACE-392: the system is the sole actor that places a requirement into a run). */
export const SYSTEM_ONLY_REQUIREMENTS_COMMANDS: ReadonlySet<string> = new Set(['requirements.run.claim', 'requirements.run.started', 'requirements.run.ended', 'requirements.run.abandon', 'requirements.run.waiting', 'requirements.run.reap']);
/** REQ-TRACE-375: the closed pane-key namespace. `create` is spec 08's token for the creation pane (the prose says "creation"). */
export const PANE_KEYS = ['review', 'queue', 'editor', 'create', 'blockers'] as const;
export type PaneKey = (typeof PANE_KEYS)[number];

/** REQ-TRACE-420's twelve element keys in their fixed order, and the three sides. */
export const REVIEW_ELEMENTS = ['agent-summary', 'reported-risks', 'completion-claim', 'checks-run', 'verification', 'changed-files', 'traceability-changes', 'unmet-conditions', 'specification-version', 'execution-units', 'branch-and-worktree', 'proposals'] as const;
export type ReviewElementKey = (typeof REVIEW_ELEMENTS)[number];
export const REVIEW_SIDES = ['claim', 'measurement', 'work'] as const;
export type ReviewSide = (typeof REVIEW_SIDES)[number];
/** REQ-TRACE-422: the six decisions, held as data in this fixed order. */
export const REVIEW_DECISIONS = ['accept', 'rerun', 'send-back', 'edit', 'reject', 'keep-worktree'] as const satisfies readonly BoardAction[];
/**
 * What the review shows (REQ-TRACE-417/418/420): every element either has content or is explicitly unavailable, and the
 * three "always states something" elements carry a sentence in every case. Read by the workspace service from the run
 * rows, the session record, Git and the run's `proposed-requirements.json` (REQ-TRACE-427) — the pane composes nothing.
 */
export interface ReviewPayload {
  readonly id: ReqId;
  readonly title: string;
  readonly column: ColumnToken;
  /** REQ-TRACE-424: not awaiting review (the state named), or awaiting review with no finished run. Present ⇒ the elements are empty. */
  readonly refusal?: string;
  readonly claim: {
    readonly summary: string | null;
    readonly risks: readonly string[];
    /** REQ-TRACE-419: the top-of-surface sentence — the claim stands unmeasured, or measurement contradicted it. */
    readonly completion: { readonly claimed: boolean; readonly statement: string };
  };
  readonly measurement: {
    readonly checks: readonly { readonly name: string; readonly outcome: string }[];
    readonly verification: string;
    readonly changedFiles: readonly { readonly path: string; readonly added: number | null; readonly removed: number | null }[];
    readonly traceabilityChanges: readonly string[];
    readonly unmetConditions: readonly string[];
  };
  readonly work: {
    readonly specification: { readonly snapshotHash: string | null; readonly snapshotAt: string | null; readonly currentHash: string; readonly diverged: boolean };
    readonly units: readonly { readonly unit: string; readonly sessionId?: string; readonly status: string; readonly outcome?: string; readonly startedAt: string; readonly endedAt?: string; readonly permissions: string }[];
    readonly branch: string | null;
    readonly worktree: string | null;
    readonly proposals: readonly { readonly title: string; readonly description: string; readonly derivedFrom: ReqId; readonly unit: string }[];
    readonly proposalsState: 'none' | 'present' | 'unreadable';
  };
}
/** REQ-TRACE-445/449/452: the blocker as the engine recorded it — options, blocking identifiers, the unit — with the recorded return state (REQ-TRACE-453). */
export interface BlockerPayload {
  readonly id: ReqId;
  readonly blocker: { readonly kind: BlockerKind; readonly reason: string; readonly options: readonly { readonly key: string; readonly label?: string; readonly consequence?: string }[]; readonly blockingIds: readonly ReqId[]; readonly runUnit: string | null; readonly runSessionId: string | null; readonly raisedAt: string } | null;
  readonly returnTo: DeliveryColumn | null;
  readonly answerPaths: readonly ('choose' | 'navigate' | 'resume' | 'inspect')[];
}
/**
 * The one renderer → main command of this Part (one spread in `commands.ts`, under the Part AP banner): the coordinator
 * in main owns the disclosure preferences, the session start and the run's lifetime, so a renderer asks it — never the
 * service — for a launch preview, a dispatch after an act or a queue change, the permanent suppression (REQ-TRACE-472),
 * and the live board runs (REQ-TRACE-466/475).
 */
export const RequirementsRunsCommandSchema = z.object({
  kind: z.literal('requirements.runs'),
  op: z.enum(['preview', 'dispatch', 'suppress', 'live']),
  id: ReqIdSchema.optional(),
  action: BoardActionSchema.optional(),
  suppressed: z.boolean().optional(),
});
export type RequirementsRunsCommand = z.infer<typeof RequirementsRunsCommandSchema>;
/** `requirements.runs {op: 'live'}` → the board runs this process owns, by session (REQ-TRACE-475: "a session that originated from a requirement SHALL declare which requirement and which unit"). */
export interface LiveBoardRun { readonly sessionId: string; readonly id: ReqId; readonly unit: string; readonly waitingOnPerson: boolean; readonly permissions: RunPermissions }
export interface DispatchReport { readonly started: readonly { readonly id: ReqId; readonly unit: string; readonly sessionId: string }[]; readonly abandoned: readonly { readonly id: ReqId; readonly unit: string; readonly reason: string }[] }
