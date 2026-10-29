import type { ProgressReport, ReqId } from './requirements.js';

/**
 * Domain 22 — the requirements adoption assistant's vocabulary as it crosses a boundary (REQ-ADOPT-001 to
 * REQ-ADOPT-030, PD-TRACE-001). The assistant is NOT a toolchain operation (REQ-TRACE-155 keeps the four): it produces
 * what the toolchain already consumes — the layout file of REQ-TRACE-040 and its conventions — and keeps its own
 * findings in the workspace scope directory. The shapes are Part 02's tables, written as the types the workspace
 * service answers with and the board reads; they live here so that `ui` never imports `workspace`.
 *
 * Every vocabulary below is CLOSED by the requirement named beside it.
 */

/** REQ-ADOPT-007: the five definition shapes a candidate store may declare its identifiers in. */
export const DEFINITION_SHAPES = ['frontmatter', 'bullet', 'heading', 'bold-line', 'table-row'] as const;
export type DefinitionShape = (typeof DEFINITION_SHAPES)[number];

/** REQ-ADOPT-008. */
export type Numbering = 'contiguous' | 'sparse' | 'dotted';

/** REQ-ADOPT-010: what the detection pass names rather than guesses. */
export const UNDECIDED_CODES = ['no-store', 'several-stores', 'several-families', 'dotted-numbering', 'mixed-shapes', 'tests-colocated', 'no-annotations', 'bound-reached'] as const;
export type UndecidedCode = (typeof UNDECIDED_CODES)[number];

export interface CandidateStore {
  /** `<dir>#<prefix>#<shape>` — the one handle an interpretation may choose a candidate by (REQ-ADOPT-013). */
  readonly id: string;
  readonly dir: string;
  readonly prefix: string;
  readonly shape: DefinitionShape;
  readonly documents: number;
  readonly identifiers: number;
  readonly numbering: Numbering;
  readonly gaps: number;
  readonly reasons: readonly string[];
  /** Defining lines, at most five, each cut to 160 characters (REQ-ADOPT-009's bound, applied alike here). */
  readonly samples: readonly string[];
}

export interface AnnotationForm {
  readonly extension: string;
  /** The text before the identifier on its line, comment marker included, whitespace collapsed. */
  readonly form: string;
  readonly count: number;
  readonly samples: readonly string[];
}

export interface DetectionResult {
  readonly candidates: readonly CandidateStore[];
  readonly implRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly testFilePatterns: readonly string[];
  readonly annotations: readonly AnnotationForm[];
  readonly undecided: readonly { readonly code: UndecidedCode; readonly detail: string }[];
  readonly bounds: { readonly files: number; readonly bytes: number; readonly reached: 'files' | 'bytes' | null };
}

/** REQ-ADOPT-011: the extraction that maps the project's identifier form to the record form. */
export type Extraction = { readonly kind: 'frontmatter' } | { readonly kind: 'definition-lines'; readonly pattern: string };

/** The adapter as the record holds it (Part 02, "The adoption record"). `layout` is the layout document's table, snake_case as REQ-TRACE-038 writes it. */
export interface AdoptionAdapter {
  readonly candidate: string;
  readonly storeDir: string;
  readonly idPrefix: string;
  readonly extraction: Extraction;
  readonly layout: Readonly<Record<string, unknown>>;
  readonly notes: string;
}

export interface AdoptionRecord {
  readonly version: 1;
  readonly recordedAt: string;
  readonly how: 'run' | 'record';
  readonly adapter: AdoptionAdapter;
  readonly documents: readonly { readonly path: string; readonly contentHash: string; readonly identifiers: readonly ReqId[] }[];
  readonly requirements: readonly { readonly id: ReqId; readonly document: string; readonly canonicalHash: string }[];
}

/** REQ-ADOPT-023, new first. */
export interface AdoptionDelta {
  readonly newIds: readonly ReqId[];
  readonly changedIds: readonly ReqId[];
  readonly removedIds: readonly ReqId[];
  readonly documentsAdded: readonly string[];
  readonly documentsChanged: readonly string[];
  readonly documentsRemoved: readonly string[];
}

/** REQ-ADOPT-022 to REQ-ADOPT-025: what `requirements.adoption` answers — a read, nothing written. */
export type AdoptionView =
  | { readonly state: 'not-adopted'; readonly detection: DetectionResult }
  | { readonly state: 'adopted'; readonly record: AdoptionRecord; readonly delta: AdoptionDelta; readonly current: number; readonly skippedLines: number }
  | { readonly state: 'unreadable'; readonly reason: string; readonly detection: DetectionResult };

/** What `requirements.adopt` answers: the written outcome or the refusal (REQ-ADOPT-015), with the progress it reported (REQ-ADOPT-026). */
export type AdoptionOutcome =
  | { readonly ok: true; readonly record: AdoptionRecord; readonly layoutFile: 'written' | 'kept' | 'not-asked'; readonly progress: readonly ProgressReport[] }
  | { readonly ok: false; readonly reason: string; readonly field?: string; readonly progress: readonly ProgressReport[] };

/** REQ-ADOPT-018: the record's place under the workspace scope directory. */
export const ADOPTION_RECORD_FILE = 'requirements-adoption.json';
