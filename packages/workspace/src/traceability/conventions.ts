import { BUILT_IN_EXTENSION, type AnnotationConvention } from './layout.js';

/**
 * Annotation conventions — the language seam (REQ-TRACE-073 to REQ-TRACE-079). Exactly one convention is registered
 * by default and claims the implementation language's single source extension (075; ADR-0040 #4 — TypeScript, so
 * `.ts`). Project-declared conventions follow in the order written; the earliest registration claiming an extension
 * applies and a later claim is accepted without diagnostic and never consulted (074).
 *
 * The built-in convention (076) recognises a call of either annotation kind — `traces(...)` for an implementation
 * trace and `covers(...)` for a coverage reference — tolerating whitespace and line breaks between the name and the
 * parenthesis and an argument list spread over lines, but NOT an argument list containing a parenthesis (077: a
 * nested call is not recognised and no diagnostic is produced); the requirement symbols named inside such a call
 * (`REQ_101`, `Requirement.REQ_101`, or a bare integer — 025 makes the two indistinguishable downstream); and the
 * transitional `covers:` comment of 070. Plain call sites and decorator-position uses are both matched (078). No
 * list of legacy prefixes exists (076): a non-canonical comment token resolves through the alias table alone.
 */
export const BUILT_IN_CONVENTION_NAME = 'typescript';
export const TRACE_ANNOTATION = 'traces';
export const COVERS_ANNOTATION = 'covers';

export interface RegisteredConvention {
  readonly name: string;
  readonly extensions: readonly string[];
  readonly builtIn: boolean;
  /** Matches a whole annotation site; group 1 says which kind, and for the built-in convention group 2 is the argument list. */
  readonly annotation: RegExp;
  /** Matches one reference inside an annotation's text; the built-in form captures the symbol's prefix and number, or a bare number. */
  readonly reference: RegExp;
  /** Matches a collectable test function's declaration, capturing its name; null for the built-in convention, whose collection needs a syntax tree (109 — wave 2). */
  readonly test: RegExp | null;
  /** Matches a module the convention excuses from the orphan-module check; null for the built-in convention (104 rule 1 — wave 2). */
  readonly exemptModule: RegExp | null;
}

export interface ConventionRegistry {
  readonly conventions: readonly RegisteredConvention[];
  /** Extension → the earliest convention claiming it. */
  readonly claims: ReadonlyMap<string, RegisteredConvention>;
  /** The set of extensions the toolchain will sweep, each once (074). */
  readonly extensions: readonly string[];
}

export function builtInConvention(): RegisteredConvention {
  return {
    name: BUILT_IN_CONVENTION_NAME, extensions: [BUILT_IN_EXTENSION], builtIn: true,
    annotation: new RegExp(`(?<![\\w$.])(${TRACE_ANNOTATION}|${COVERS_ANNOTATION})\\s*\\(([^()]*)\\)`, 'g'),
    reference: /(?:[A-Za-z_$][\w$]*\.)?\b([A-Z][A-Z0-9]*)_([0-9]+)\b|\b([0-9]+)\b/g,
    test: null, exemptModule: null,
  };
}

/** Project patterns run over a whole file's text with the multiline flag, so a line-anchored declaration matcher (`^def (test\w*)`) means what its author meant. */
function compile(source: string): RegExp {
  return new RegExp(source, 'gm');
}

/** REQ-TRACE-074: one ordered sequence, the built-in convention at position one. Patterns were validated at layout load. */
export function registerConventions(project: readonly AnnotationConvention[]): ConventionRegistry {
  const conventions: RegisteredConvention[] = [builtInConvention()];
  for (const c of project) {
    conventions.push({ name: c.name, extensions: [...c.extensions], builtIn: false, annotation: compile(c.annotationPattern), reference: compile(c.referencePattern), test: compile(c.testPattern), exemptModule: compile(c.exemptModulePattern) });
  }
  const claims = new Map<string, RegisteredConvention>();
  for (const c of conventions) for (const ext of c.extensions) if (!claims.has(ext)) claims.set(ext, c);
  return { conventions, claims, extensions: [...claims.keys()] };
}

/** Which of the two kinds a project convention's captured text names; the built-in names are exact. */
export function annotationKindOf(captured: string | undefined): 'trace' | 'covers' {
  if (captured === undefined) return 'trace';
  if (captured === COVERS_ANNOTATION) return 'covers';
  if (captured === TRACE_ANNOTATION) return 'trace';
  return /cover|test/i.test(captured) ? 'covers' : 'trace';
}
