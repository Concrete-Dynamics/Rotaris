import { join } from 'node:path';
import { guardedRead, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import type { TrustedHookScope } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { parseConfig } from './document.js';
import { EMPTY_HOOKS_LAYER, mergeHooks, readHooksSection, type ConfigError, type HooksLayer, type HooksResolved } from './hooks-section.js';

/**
 * ADR-0036: the two file scopes (REQ-CONFIG-001), read open-read-close on every load with no cache
 * (REQ-CONFIG-014, ADR-0004 rule 1). This entry point takes no database handle — the ADR's guard, in the
 * signature. First slice: only the `hooks:` section is read; the rest of the loader lands with the ADR.
 */
export const AGENTS_FILE = 'agents.yaml' as const;

export interface ScopeFile {
  readonly scope: TrustedHookScope;
  readonly path: string;
  readonly state: 'absent' | 'read' | 'unreadable' | 'unparsable' | 'invalid';
  readonly errors: readonly ConfigError[];
  readonly reason: string;
}

export interface HooksLoad extends HooksResolved {
  readonly files: readonly ScopeFile[];
}

export interface LoadFailure {
  readonly files: readonly ScopeFile[];
  /** Every error of every scope, scope-precedence order then ascending index (REQ-HOOKS-012). */
  readonly errors: readonly (ConfigError & { readonly scope: TrustedHookScope; readonly file: string })[];
}

export interface LoadHooksOptions {
  readonly globalDir: string;
  readonly workspaceRoot: string;
  /** The built-in default layer (REQ-HOOKS-013 "built-in defaults"): none ship with the product (REQ-HOOKS-009). */
  readonly defaults?: HooksLayer;
}

export function globalAgentsFile(globalDir: string): string {
  return join(globalDir, AGENTS_FILE);
}
export function workspaceAgentsFile(workspaceRoot: string): string {
  return join(workspaceRoot, WORKSPACE_SCOPE_DIR, AGENTS_FILE);
}

function readScope(scope: TrustedHookScope, path: string): { layer: HooksLayer; file: ScopeFile } {
  const outcome = guardedRead(path, (raw) => raw);
  if (outcome.state === 'absent') return { layer: EMPTY_HOOKS_LAYER(scope), file: { scope, path, state: 'absent', errors: [], reason: '' } };
  if (outcome.state === 'unreadable') return { layer: EMPTY_HOOKS_LAYER(scope), file: { scope, path, state: 'unreadable', errors: [], reason: outcome.reason } };
  const parsed = parseConfig(outcome.value);
  if (!parsed.ok) return { layer: EMPTY_HOOKS_LAYER(scope), file: { scope, path, state: 'unparsable', errors: [], reason: parsed.error.reason } };
  if (parsed.value.root === null && parsed.value.topLevelType !== 'null') {
    return { layer: EMPTY_HOOKS_LAYER(scope), file: { scope, path, state: 'unparsable', errors: [], reason: `the top level of ${AGENTS_FILE} must be a mapping, got ${parsed.value.topLevelType}` } };
  }
  const section = readHooksSection(parsed.value, scope);
  if (!section.ok) return { layer: EMPTY_HOOKS_LAYER(scope), file: { scope, path, state: 'invalid', errors: section.error, reason: '' } };
  return { layer: section.value, file: { scope, path, state: 'read', errors: [], reason: '' } };
}

/**
 * Load the effective hook set. A scope that cannot be read, parsed, or validated makes the load fail
 * as a whole (REQ-CONFIG-024 fatal, REQ-HOOKS-012 no configuration produced); the caller decides what a
 * run does with that (REQ-HOOKS-085: continue with no hooks and warn).
 */
export function loadHooksConfig(opts: LoadHooksOptions): Result<HooksLoad, LoadFailure> {
  const g = readScope('global', globalAgentsFile(opts.globalDir));
  const w = readScope('workspace', workspaceAgentsFile(opts.workspaceRoot));
  const files = [g.file, w.file];
  const failed = files.filter((f) => f.state === 'unreadable' || f.state === 'unparsable' || f.state === 'invalid');
  if (failed.length > 0) {
    const errors = failed.flatMap((f) => (f.errors.length > 0 ? f.errors : [{ path: '', message: f.reason }]).map((e) => ({ ...e, scope: f.scope, file: f.path })));
    return err({ files, errors });
  }
  const merged = mergeHooks([opts.defaults ?? EMPTY_HOOKS_LAYER('default'), g.layer, w.layer]);
  return ok({ ...merged, files });
}
