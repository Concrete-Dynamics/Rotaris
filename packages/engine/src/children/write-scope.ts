import { posix } from 'node:path';
import { globToRegExp } from '@rotaris/kernel';

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
