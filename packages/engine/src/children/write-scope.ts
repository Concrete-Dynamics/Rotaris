import { posix } from 'node:path';
import { globToRegExp } from '@rotaris/kernel';
import { restrictionsAllow } from '@rotaris/contracts';
import { BUILT_IN_PERSONAS, toolRestrictionsFor, type Persona, type PersonaResolver } from './personas.js';
import { isNativeFileWritingTool } from './report.js';

/**
 * PD-TOOLS-006: a delegated child's declared write scope, and the claims live scopes make on workspace paths.
 *
 * A child accepted with a `write_scope` claims every workspace path its patterns match until it reaches a terminal
 * state. A `write_file` or `haet_edit` call into a claimed path is refused to every agent of the run except the
 * claiming child and its own descendants; where two live scopes match one path, the child accepted first holds it.
 * Claims belong to one run and live only here, in memory: a resumed session starts with none, because a resume
 * closes every non-terminal child it finds.
 *
 * Matching is by the dialect of the `glob` tool (`globToRegExp`), against the workspace-relative POSIX path the
 * file tools' fence computes, and without regard to case — the file tools identify a path lower-cased
 * (`FileToolState.key`, the fence's `isInside`), so a claim that honoured case would let `SRC/a.ts` past a claim
 * on `src/**` while the file tools treat the two as one file.
 */

export type ScopeVerdict =
  | { readonly ok: true; readonly patterns: readonly string[] }
  | { readonly ok: false; readonly reason: string };

const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:)/;

/**
 * PD-TOOLS-006 revision 3 (OQ-112): whether a persona holds a file-writing tool — `write_file`, or `haet_edit` with its
 * alias `haet` — among the tools it would be granted for a child, after REQ-TOOLS-006's controls. `coordinator_only`
 * removes all three, and `read_only` reduces the set to REQ-TOOLS-007's read-only class, which holds none of them; the
 * run-scoped allow-list binds the entry agent alone, never a child. A persona whose only writing tools are ones the
 * claim does not fence (`terminal`, MCP or plugin tools) counts as holding none, as the directive states.
 *
 * `coordinator_only` is applied here unconditionally. The run host's tool port (`apps/desktop/src/run-host/tools.ts`)
 * applies it only where delegation is available and the session is not in direct work; a delegated child always has
 * delegation, so the two agree today. A change to either condition changes this check with it.
 *
 * The fourth control, the `tool_restrictions` map, is applied as the port applies it (OQ-145): the lists the persona's own
 * map and the map of `parentPersona` — the persona delegating — give the persona's name. The reason it was not, kept beside
 * its replacement: until acceptance finding A4 (R-067) the map narrowed no agent's grant, so this check followed the
 * grant the port built and read the first three controls alone.
 */
export function writesFiles(persona: Pick<Persona, 'name' | 'tools' | 'coordinatorOnly' | 'readOnly' | 'toolRestrictions'>, parentPersona?: Pick<Persona, 'toolRestrictions'> | null): boolean {
  const lists = toolRestrictionsFor(persona, parentPersona);
  return !persona.coordinatorOnly && !persona.readOnly && persona.tools.some((t) => isNativeFileWritingTool(t) && restrictionsAllow(lists, t));
}

/**
 * PD-TOOLS-006 revision 3: the personas of the catalogue that can write files, in its order — the known roles the ledger's
 * unknown-persona refusal lists, or the built-in table where no configuration resolves them. Each is judged as a child of
 * `parentPersona` would be granted it (OQ-145), so the refusal never names a writer the delegating agent's map forbids.
 */
export function fileWriters(personas: PersonaResolver | undefined, parentPersona?: Pick<Persona, 'toolRestrictions'> | null): readonly string[] {
  const catalogue = personas ? personas.knownRoles().map((n) => personas.resolve(n)?.persona) : Object.values(BUILT_IN_PERSONAS);
  return catalogue.filter((p): p is Persona => p !== undefined && writesFiles(p, parentPersona)).map((p) => p.name);
}

/**
 * PD-TOOLS-006 revision 3 (OQ-112): the reason a delegation carrying a `write_scope` to `persona`, which cannot write
 * files, is refused — naming the personas of the catalogue that can, where there are any.
 *
 * The reason it was not refused, kept beside its replacement: the scope was validated for its patterns alone. In the
 * duress live run of 2026-09-29 `codebase-analyst` was accepted with `write_scope: ["docs/overview.md"]`, claimed the
 * file for 2 min 47 s while it could only answer that it had no file-writing tool, and a second child was commissioned
 * for the same file.
 */
export function scopeWithoutWriterReason(persona: string, writers: readonly string[]): string {
  const can = writers.length > 0 ? ` Personas that can write files: ${writers.join(', ')}.` : '';
  return `write_scope was given to '${persona}', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started.${can} Delegate the writing to a persona that can, or delegate to '${persona}' without a write_scope.`;
}

/**
 * PD-TOOLS-006's argument: an empty pattern, an absolute pattern, or one that reaches outside the workspace root
 * rejects the delegation, with a reason naming the pattern. A pattern is kept as the caller wrote it — the refusal
 * quotes the pattern that matched — and matched in its lexically normalised form, so `src/../lib/**` claims what
 * `lib/**` claims rather than nothing at all.
 */
export function validateWriteScope(patterns: readonly string[]): ScopeVerdict {
  for (const pattern of patterns) {
    if (pattern.trim() === '') return { ok: false, reason: 'write_scope holds an empty pattern; every pattern names paths relative to the workspace root.' };
    if (ABSOLUTE.test(pattern)) return { ok: false, reason: `write_scope pattern '${pattern}' is absolute; write it relative to the workspace root.` };
    const normalised = normalisePattern(pattern);
    if (normalised === '..' || normalised.startsWith('../')) return { ok: false, reason: `write_scope pattern '${pattern}' reaches outside the workspace root.` };
  }
  return { ok: true, patterns: [...patterns] };
}

function normalisePattern(pattern: string): string {
  return posix.normalize(pattern.replace(/\\/g, '/'));
}

/** What a claimed path answers with: the refusal's three names. */
export interface ClaimHit {
  readonly taskId: string;
  readonly canonicalName: string;
  readonly persona: string;
  readonly pattern: string;
}

/** One live child's scope, as the disclosure block lists it. */
export interface DeclaredScope {
  readonly taskId: string;
  readonly canonicalName: string;
  readonly patterns: readonly string[];
}

interface Claim extends DeclaredScope {
  readonly persona: string;
  readonly matchers: readonly RegExp[];
}

export class WriteClaims {
  /** Insertion order is acceptance order, which is what decides an overlap. */
  private readonly claims = new Map<string, Claim>();

  claim(taskId: string, canonicalName: string, persona: string, patterns: readonly string[]): void {
    if (patterns.length === 0) return;
    this.claims.set(taskId, { taskId, canonicalName, persona, patterns, matchers: patterns.map((p) => globToRegExp(normalisePattern(p), { caseInsensitive: true })) });
  }

  release(taskId: string): void {
    this.claims.delete(taskId);
  }

  /**
   * The claim that refuses this caller a write to `rel`, or null. A path is held by the EARLIEST live claim that
   * matches it — a later overlapping scope does not reach it — so the answer is decided by that one holder alone:
   * null when `exempt` says the caller is the holder or one of its descendants, the holder otherwise.
   */
  refusalFor(rel: string, isLive: (taskId: string) => boolean, exempt: (claimTaskId: string) => boolean): ClaimHit | null {
    for (const c of this.claims.values()) {
      if (!isLive(c.taskId)) continue;
      const i = c.matchers.findIndex((m) => m.test(rel));
      if (i === -1) continue;
      return exempt(c.taskId) ? null : { taskId: c.taskId, canonicalName: c.canonicalName, persona: c.persona, pattern: c.patterns[i] as string };
    }
    return null;
  }

  /** Every live declared scope, in acceptance order. */
  live(isLive: (taskId: string) => boolean): readonly DeclaredScope[] {
    return [...this.claims.values()].filter((c) => isLive(c.taskId)).map(({ taskId, canonicalName, patterns }) => ({ taskId, canonicalName, patterns }));
  }
}

/**
 * PD-TOOLS-006's disclosure, fixed at acceptance: this child's own scope and the live scopes of the others. An
 * ancestor's scope is listed like any other, as the directive asks, and marked, because its claim does not fence
 * the child reading it.
 */
export interface ScopeDisclosure {
  readonly own: readonly string[];
  readonly others: readonly (DeclaredScope & { readonly heldByAncestor: boolean })[];
}

const quoted = (patterns: readonly string[]): string => patterns.map((p) => `'${p}'`).join(', ');

/**
 * The block placed immediately after the workspace-root prefix (REQ-TOOLS-154 (1), as PD-TOOLS-006 narrows it),
 * or '' when there is nothing to list.
 */
export function writeScopeBlock(d: ScopeDisclosure | undefined): string {
  if (!d || (d.own.length === 0 && d.others.length === 0)) return '';
  const lines = ['Write scopes:'];
  if (d.own.length > 0) lines.push(`- Yours: ${quoted(d.own)}. Other agents of this run may not write into these paths while you run; you are not limited to them.`);
  if (d.others.length > 0) {
    lines.push('- Held by other agents that were running when you started. write_file and haet_edit refuse a write into these paths while their holder runs, unless the holder is an agent you work under:');
    for (const o of d.others) lines.push(`  - ${o.canonicalName}: ${quoted(o.patterns)}${o.heldByAncestor ? ' (you work under this agent, so its scope does not fence you)' : ''}`);
  }
  return lines.join('\n');
}
