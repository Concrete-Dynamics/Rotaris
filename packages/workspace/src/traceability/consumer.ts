import { countNoun } from '@rotaris/kernel';
import type { Clocks } from '@rotaris/kernel';
import type { ParseError } from '@rotaris/contracts';
import { DECLARATIONS_MODULE, REGENERATE_ACTION } from './artifact.js';
import { createTraceabilityEngine, fsArtifactIo, type ArtifactIo, type TraceabilityEngineHandle } from './engine.js';
import { createInThreadExecutor } from './executor.js';

/**
 * Part AJ2 — the consumer integration contracts (spec 08 §Consumer Integration Contracts; REQ-TRACE-176, 181,
 * 182, 183, 500), built as far as the product reaches them.
 *
 * **What a project's own code and test run get, and from where.** The generated artifact imports `Lifecycle` and
 * `RequirementMeta` from the bare specifier `rotaris-traceability` (R5, `artifact.ts`), and a project's own source
 * imports `traces` and `covers` from it. That module is the entry point REQ-TRACE-176 describes — importable before
 * any artifact exists, parsing nothing, reading nothing — and the product does not OFFER it: Rotaris is a desktop
 * application with no published library, no package registry and no `node_modules` it may write into a user's
 * repository (REQ-TRACE-152 limits its writes to the artifact, the retired-identifier log and the three baselines).
 * This module holds the in-app half: the module's exact source text, so that a build, a test or a user can put it
 * where their toolchain resolves the specifier, and the two test-session operations as plain functions the
 * engine package exports. The other half — a package a project installs — is raised in the handoff as an open
 * question, not built, and stated here as the reason `rotaris-traceability` resolves nowhere on its own.
 *
 * **The build-break of REQ-TRACE-500** is a property of the artifact plus this module under the project's own
 * compiler: a symbol the store no longer declares vanishes from the enumeration, so every reference to it is a
 * compile error, and a deprecated one carries `@deprecated`, so every reference warns at the exact spot
 * (REQ-TRACE-181 (1)). `consumer.test.ts` and the proof compile a consumer against a regenerated artifact and
 * assert both, with the TypeScript compiler API the parser already loads.
 */
export const CONSUMER_MODULE_SPECIFIER = DECLARATIONS_MODULE;

/** The source text of `rotaris-traceability`: usable immediately on import; REQ-TRACE-064's defaults for fields an older artifact does not supply. */
export const CONSUMER_MODULE_SOURCE = [
  '/**',
  ` * \`${DECLARATIONS_MODULE}\` — the declarations module the generated requirement-symbol artifact imports from`,
  ' * (REQ-TRACE-053, REQ-TRACE-176). It parses no store and needs no artifact to exist: the lifecycle enumeration,',
  ' * the metadata record and both annotation kinds are usable the moment it is imported. The annotations record',
  ' * nothing at run time — the toolchain reads them from the source text (REQ-TRACE-079).',
  ' */',
  "export enum Lifecycle { Draft = 'draft', Approved = 'approved', Deprecated = 'deprecated' }",
  '',
  '/** REQ-TRACE-057\'s positional record; the trailing fields default so an older artifact still loads (REQ-TRACE-064). */',
  'export class RequirementMeta {',
  '  constructor(',
  '    readonly id: string,',
  '    readonly number: number,',
  '    readonly lifecycle: Lifecycle,',
  '    readonly title: string,',
  '    readonly sourcePath: string,',
  '    readonly traceRequired: boolean = true,',
  '    readonly testRequired: boolean = true,',
  "    readonly contentHash: string = '',",
  "    readonly kind: 'product' | 'technical' = 'product',",
  '    readonly derivedFrom: readonly number[] = [],',
  '  ) {}',
  '}',
  '',
  '/** Usable in decorator position and as a plain call; the returned decorator changes nothing it decorates. */',
  'export type RequirementAnnotation = (...decorated: unknown[]) => void;',
  '',
  '/** An implementation trace: the element it annotates implements the named requirement(s). */',
  'export function traces(..._requirements: readonly number[]): RequirementAnnotation { return () => undefined; }',
  '',
  '/** A coverage reference: the test it annotates covers the named requirement(s). */',
  'export function covers(..._requirements: readonly number[]): RequirementAnnotation { return () => undefined; }',
  '',
].join('\n');

export interface ConsumerDeps {
  readonly clocks: Clocks;
  /** The one I/O owner for the five artifacts; the project's test process is its own owner (ADR-0040 #6's residue, OQ-41). */
  readonly io?: ArtifactIo;
  readonly log?: (message: string) => void;
}

function engineFor(deps: ConsumerDeps): TraceabilityEngineHandle {
  return createTraceabilityEngine({ executor: createInThreadExecutor(deps.clocks), io: deps.io ?? fsArtifactIo(deps.clocks.timers), clocks: deps.clocks, ...(deps.log ? { log: deps.log } : {}) });
}

/** REQ-TRACE-182: what the test session reports about its regeneration. Never a throw. */
export interface RegenerationNotice {
  readonly outcome: 'regenerated' | 'already up to date' | 'skipped';
  /** The one line for the test run's own diagnostics. */
  readonly notice: string;
  readonly parseErrors: readonly ParseError[];
}

/**
 * REQ-TRACE-182: regenerate the artifact before collecting tests, reporting through the caller's diagnostics and
 * NEVER blocking collection — any failure is caught and reported as a skipped-regeneration notice, leaving parse
 * errors for the meta-tests to surface.
 */
export async function regenerateBeforeCollection(root: string, deps: ConsumerDeps): Promise<RegenerationNotice> {
  const engine = engineFor(deps);
  try {
    const r = await engine.regenerate(root, { signal: new AbortController().signal });
    if (r.ok) return { outcome: r.value.outcome, notice: `${DECLARATIONS_MODULE}: the requirement-symbol artifact ${r.value.artifactPath} is ${r.value.outcome} (${countNoun(r.value.count, 'requirement')})`, parseErrors: [] };
    if (r.error.kind === 'parse') return { outcome: 'skipped', notice: `${DECLARATIONS_MODULE}: regeneration skipped — the requirement store does not parse (${countNoun(r.error.errors.length, 'error')}); the artifact was left exactly as it stood`, parseErrors: r.error.errors };
    return { outcome: 'skipped', notice: `${DECLARATIONS_MODULE}: regeneration skipped — ${describeFailure(r.error)}`, parseErrors: [] };
  } catch (e) {
    return { outcome: 'skipped', notice: `${DECLARATIONS_MODULE}: regeneration skipped — ${e instanceof Error ? e.message : String(e)}`, parseErrors: [] };
  } finally {
    engine.dispose();
  }
}

function describeFailure(f: { readonly kind: string; readonly cause?: string; readonly path?: string; readonly what?: string; readonly operation?: string }): string {
  switch (f.kind) {
    case 'configuration': return `the layout configuration ${f.path} cannot be used: ${f.cause}`;
    case 'failed': return `${f.what} failed: ${f.cause}`;
    case 'busy': return `a ${f.operation} is already in flight`;
    case 'cancelled': return 'the operation was cancelled';
    default: return f.kind;
  }
}

/** REQ-TRACE-183: the three meta-test assertions over the real repository, as plain data a test framework asserts. */
export interface MetaTestReport {
  readonly ok: boolean;
  readonly assertions: readonly { readonly name: 'store parses and is non-empty' | 'artifact is up to date' | 'verification reports zero errors'; readonly ok: boolean; readonly message: string }[];
}

export async function metaTests(root: string, deps: ConsumerDeps): Promise<MetaTestReport> {
  const engine = engineFor(deps);
  try {
    const signal = new AbortController().signal;
    const checked = await engine.check(root, { signal });
    if (!checked.ok) {
      const message = describeFailure(checked.error);
      return { ok: false, assertions: [{ name: 'store parses and is non-empty', ok: false, message }, { name: 'artifact is up to date', ok: false, message }, { name: 'verification reports zero errors', ok: false, message }] };
    }
    const { report, parseErrorsOnly } = checked.value;
    const parseErrors = report.findings.filter((f) => f.code === 'parse-error');
    const empty = report.findings.some((f) => f.code === 'empty-store');
    const artifact = report.findings.find((f) => f.code === 'artifact');
    const errors = parseErrorsOnly ? parseErrors.length : report.findings.filter((f) => f.severity === 'error').length;
    const assertions: MetaTestReport['assertions'] = [
      { name: 'store parses and is non-empty', ok: parseErrors.length === 0 && !empty, message: parseErrors.length > 0 ? `the store does not parse: ${parseErrors.map((e) => e.message).join('; ')}` : empty ? report.findings.find((f) => f.code === 'empty-store')!.message : `the store parses: ${countNoun(report.statistics.total, 'requirement')}` },
      { name: 'artifact is up to date', ok: !parseErrorsOnly && artifact === undefined, message: parseErrorsOnly ? 'the artifact cannot be judged while the store does not parse' : artifact === undefined ? 'the generated requirement-symbol artifact is up to date' : `${artifact.message} — regenerate it with ${REGENERATE_ACTION}` },
      { name: 'verification reports zero errors', ok: errors === 0, message: errors === 0 ? 'verification reports no error; only baseline-suppressed debt remains' : `verification reports ${countNoun(errors, 'error')}: ${report.findings.filter((f) => f.severity === 'error').slice(0, 5).map((f) => f.message).join('; ')}${errors > 5 ? ` (+${errors - 5} more)` : ''}` },
    ];
    return { ok: assertions.every((a) => a.ok), assertions };
  } finally {
    engine.dispose();
  }
}
