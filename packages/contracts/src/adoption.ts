import type { ColumnToken, DeliveryColumn, Lifecycle, ProgressReport, ReqId } from './requirements.js';

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

/** REQ-ADOPT-008: `dotted` and `zero-padded` are families REQ-TRACE-078's `<PREFIX>-<digits>` cannot write. */
export type Numbering = 'contiguous' | 'sparse' | 'dotted' | 'zero-padded';

/** REQ-ADOPT-010: what the detection pass names rather than guesses. */
export const UNDECIDED_CODES = ['no-store', 'several-stores', 'several-families', 'dotted-numbering', 'zero-padded-numbering', 'namespaced-prefix', 'mixed-shapes', 'tests-colocated', 'no-annotations', 'bound-reached'] as const;
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

// ---- PD-TRACE-002 — the surveyed shape: a repository's own requirement form, proposed by an agent, validated here ----

/** One word of the project's own status vocabulary and what it means on the board (PD-TRACE-002 clauses 5 and 6). */
export interface ShapeStatusWord { readonly word: string; readonly lifecycle?: Lifecycle; readonly delivery?: DeliveryColumn }

/** One store of a shape: a directory of documents and how a requirement is written in them. */
export interface ShapeStore {
  /** Repository-relative, validated as REQ-TRACE-043's paths are and resolved inside the workspace. */
  readonly dir: string;
  /** A regular expression applied one line at a time; its named group `id` captures the identifier, `title` (optional) the title. */
  readonly definition: string;
  /** Where a requirement states its status: a pattern over the lines of its own text whose named group `status` captures the word. */
  readonly status?: { readonly pattern: string; readonly words: readonly ShapeStatusWord[] };
  /** Whether task-list items (`- [ ]`, `- [x]`) inside a requirement's text are its acceptance criteria. */
  readonly criteria: boolean;
}

/** The shape (PD-TRACE-002 clause 1), in the one validated format: every field passes `validateShape` before it is believed. */
export interface RequirementsShape {
  readonly version: 1;
  readonly stores: readonly ShapeStore[];
  /** A regular expression matching one whole identifier wherever it is written: in code, in tests, in a document. */
  readonly identifier: string;
  readonly implRoots: readonly string[];
  readonly testRoots: readonly string[];
  /** PD-TRACE-002 clause 12: whether a trace and a covering test are owed. */
  readonly obligations: 'optional' | 'required';
  readonly notes: string;
}
export const SHAPE_KEYS = ['identifier', 'implRoots', 'notes', 'obligations', 'stores', 'testRoots', 'version'] as const;
export const SHAPE_STORES_MAX = 8;
export const SHAPE_ROOTS_MAX = 24;
export const SHAPE_STATUS_WORDS_MAX = 24;

export interface SurveyedCriterion { readonly text: string; readonly checked: boolean; /** 1-based line in the document. */ readonly line: number }

/** One requirement as a shape extracts it, with where it stands in its document (PD-TRACE-002 clauses 4 and 5). */
export interface SurveyedRequirement {
  readonly id: ReqId; readonly title: string; readonly document: string;
  /** 1-based, inclusive. */
  readonly line: number; readonly endLine: number;
  readonly prose: string; readonly canonicalHash: string;
  /** The status word as written, and the half-open column range it occupies on its line. */
  readonly status?: { readonly word: string; readonly line: number; readonly start: number; readonly end: number; readonly lifecycle?: Lifecycle; readonly delivery?: DeliveryColumn };
  readonly criteria: readonly SurveyedCriterion[];
}

/** What executing a shape measured: the facts a survey's repair round and the drift statement are made of (clauses 3 and 11). */
export interface ShapeMeasurement {
  readonly documents: readonly { readonly path: string; readonly contentHash: string; readonly identifiers: readonly ReqId[] }[];
  readonly requirements: readonly SurveyedRequirement[];
  /** Identifiers defined a second time, with where; the first definition in path order wins. */
  readonly duplicates: readonly { readonly id: ReqId; readonly document: string; readonly line: number }[];
  /** Identifiers a store's documents mention and nothing defines, capped; `mentionedCount` is the true number. */
  readonly mentionedOnly: readonly ReqId[];
  readonly mentionedCount: number;
  /** Documents of a store that defined nothing, capped; `emptyCount` is the true number. */
  readonly emptyDocuments: readonly string[];
  readonly emptyCount: number;
  /** Definition lines whose captured identifier the shape's own `identifier` pattern does not match. */
  readonly malformed: readonly { readonly document: string; readonly line: number; readonly text: string }[];
  readonly skippedLines: number;
  readonly bounds: { readonly files: number; readonly bytes: number; readonly reached: 'files' | 'bytes' | null };
}

/** The accepted shape as the workspace scope directory keeps it (clause 9), with what it extracted when it was accepted. */
export interface ShapeRecord {
  readonly version: 1;
  readonly acceptedAt: string;
  readonly how: 'survey' | 'record' | 'import';
  readonly shape: RequirementsShape;
  readonly documents: readonly { readonly path: string; readonly contentHash: string; readonly identifiers: readonly ReqId[] }[];
  readonly requirements: readonly { readonly id: ReqId; readonly document: string; readonly canonicalHash: string }[];
  /** What the shape left unread on the day it was accepted; drift is what exceeds it (clause 11). */
  readonly baseline: { readonly mentioned: number; readonly empty: number; readonly duplicates: number; readonly malformed: number };
}
export const SHAPE_RECORD_FILE = 'requirements-shape.json';
/** Clause 9: the committable file at the repository root that Export to repository writes and every clone reads. */
export const SHAPE_EXPORT_FILE = 'rotaris-requirements-shape.json';

/** Clause 11: what no longer fits; zero everywhere is no drift. */
export interface ShapeDrift { readonly mentionedOnly: readonly ReqId[]; readonly mentionedCount: number; readonly emptyDocuments: readonly string[]; readonly emptyCount: number; readonly duplicates: number; readonly malformed: number }

/** What the strip reads on opening for a workspace read through a shape: a read, nothing written, no model (REQ-ADOPT-022). */
export type ShapeView =
  | { readonly state: 'none'; readonly detection: DetectionResult; readonly native: boolean }
  | { readonly state: 'accepted'; readonly origin: 'local' | 'repository'; readonly record?: ShapeRecord; readonly shape: RequirementsShape; readonly count: number; readonly delta?: AdoptionDelta; readonly drift: ShapeDrift; readonly watching: boolean }
  | { readonly state: 'unreadable'; readonly origin: 'local' | 'repository'; readonly reason: string; readonly detection: DetectionResult };

/** Clause 2: what a survey ends in. Nothing is recorded by it; `token` names the proposal an accept or an answer refers to. */
export interface SurveyPreview {
  readonly token: string;
  readonly shape: RequirementsShape;
  readonly count: number;
  readonly stores: readonly { readonly dir: string; readonly documents: number; readonly requirements: number; readonly withStatus: number; readonly withCriteria: number }[];
  readonly samples: readonly { readonly id: ReqId; readonly title: string; readonly document: string; readonly line: number; readonly status?: string; readonly criteria: number }[];
  readonly unread: readonly string[];
  readonly rounds: number;
  readonly model: string;
}
export type SurveyOutcome =
  | { readonly ok: true; readonly preview: SurveyPreview; readonly progress: readonly ProgressReport[] }
  | { readonly ok: false; readonly reason: string; readonly field?: string; readonly progress: readonly ProgressReport[] };
export type ShapeAcceptOutcome =
  | { readonly ok: true; readonly record: ShapeRecord }
  | { readonly ok: false; readonly reason: string };
export type ShapeExportOutcome = { readonly ok: true; readonly path: string; readonly written: 'written' | 'replaced' } | { readonly ok: false; readonly reason: string };
/** Kept so a column word in a shape reads as the board's own vocabulary. */
export type ShapeColumn = ColumnToken;
