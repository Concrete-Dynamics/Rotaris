// Part AJ — seam per plan; AK owns this file
import type { Result } from '@rotaris/kernel';

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
