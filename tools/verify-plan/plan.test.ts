/**
 * The local verification planner: a diff classifies into the gate, the complete
 * affected proof suites (AGENTS.md's "run the whole suite a part touches"), the
 * architecture documents, and unmapped paths that require explicit review.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { AREAS, NEVER_AUTOMATIC, RULES, classifyPath, formatPlan, matchingRules, narrowTests, pathMatches, planFor, proofsInMap, proofScriptOf } from './plan.mjs';

const root = join(import.meta.dirname, '..', '..');

const proofsOf = (files: string[]) => planFor(files).proofs;
const reviewOf = (files: string[]) => planFor(files).review.map((r: { path: string }) => r.path);

describe('verification planner — matching', () => {
  it('a directory prefix matches itself and files under it, not a sibling', () => {
    expect(pathMatches('packages/engine/src/run/run.ts', 'packages/engine/src/run/')).toBe(true);
    expect(pathMatches('packages/engine/src/run', 'packages/engine/src/run/')).toBe(true);
    expect(pathMatches('packages/engine/src/runner.ts', 'packages/engine/src/run/')).toBe(false);
  });

  it('a stem matches the file and its test, not a longer sibling name', () => {
    expect(pathMatches('packages/ui/src/composer.ts', 'packages/ui/src/composer')).toBe(true);
    expect(pathMatches('packages/ui/src/composer.test.ts', 'packages/ui/src/composer')).toBe(true);
    expect(pathMatches('packages/ui/src/composer-extra.ts', 'packages/ui/src/composer')).toBe(false);
  });

  it('a trailing-hyphen stem matches the family and nothing else', () => {
    expect(pathMatches('packages/engine/src/session-writer.ts', 'packages/engine/src/session-')).toBe(true);
    expect(pathMatches('packages/engine/src/sessions.ts', 'packages/engine/src/session-')).toBe(false);
  });

  it('longest prefix wins: artifacts are Library, not The run', () => {
    const rules = matchingRules('packages/engine/src/artifacts/store.ts');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r: { paths: string[] }) => r.paths.includes('packages/engine/src/artifacts/'))).toBe(true);
    expect(classifyPath('packages/engine/src/artifacts/store.ts').areas).toEqual(['library', 'tools']);
  });
});

describe('verification planner — complete suites', () => {
  it('a run-loop file takes the whole The run suite, not only part-h-proof', () => {
    const proofs = proofsOf(['packages/engine/src/run/run.ts']);
    expect(proofs).toEqual([...AREAS.run.proofs].sort());
    expect(proofs).toContain('part-h-proof');
    expect(proofs).toContain('resilience-proof');
    expect(proofs).toContain('checkpoint-proof');
    expect(proofs).not.toContain('terminal-proof');
  });

  it('an agent-tools file takes the whole Tools suite, not only fetch-proof', () => {
    const proofs = proofsOf(['packages/agent-tools/src/tools/fetch.ts']);
    expect(proofs).toEqual([...AREAS.tools.proofs].sort());
    expect(proofs).toContain('edits-proof');
    expect(proofs).toContain('mcp-proof');
    expect(proofs).not.toContain('part-h-proof');
  });

  it('MissionView takes mission-proof and not the terminal suite', () => {
    expect(proofsOf(['packages/ui/src/MissionView.tsx'])).toEqual(['mission-proof']);
  });

  it('a transcript file takes transcript, rows and update-depth together', () => {
    expect(proofsOf(['packages/ui/src/transcript/Row.tsx'])).toEqual(
      ['rows-proof', 'transcript-proof', 'update-depth-proof'],
    );
  });

  it('union of two areas keeps both complete suites', () => {
    const proofs = proofsOf([
      'packages/engine/src/run/run.ts',
      'packages/ui/src/MissionView.tsx',
    ]);
    expect(proofs).toEqual([...new Set([...AREAS.run.proofs, 'mission-proof'])].sort());
  });

  it('changing a proof script schedules that proof', () => {
    expect(proofScriptOf('apps/desktop/scripts/part-h-proof.mjs')).toBe('part-h-proof');
    expect(proofsOf(['apps/desktop/scripts/part-h-proof.mjs'])).toEqual(['part-h-proof']);
    expect(proofsOf(['apps/desktop/scripts/terminal-proof/packaged.mjs'])).toEqual(['terminal-proof']);
  });
});

describe('verification planner — review and unknown', () => {
  it('an unmapped path requires explicit review and schedules no suite by omission', () => {
    const plan = planFor(['no-such-area/mystery.ts']);
    expect(plan.unknown).toEqual(['no-such-area/mystery.ts']);
    expect(plan.review.map((r: { path: string }) => r.path)).toEqual(['no-such-area/mystery.ts']);
    expect(plan.proofs).toEqual([]);
    expect(plan.review[0].reason).toMatch(/unmapped path/);
  });

  it('contracts commands.ts is a shared seam: classified, still review, no silent suite', () => {
    const plan = planFor(['packages/contracts/src/commands.ts']);
    expect(plan.unknown).toEqual([]);
    expect(reviewOf(['packages/contracts/src/commands.ts'])).toEqual(['packages/contracts/src/commands.ts']);
    expect(plan.views).toContain('docs/architecture/views/04-seams.md');
    expect(plan.proofs).toEqual([]);
  });

  it('run-host dispatch is a shared seam and takes both The run and Tools suites', () => {
    const plan = planFor(['apps/desktop/src/run-host/dispatch.ts']);
    expect(plan.proofs).toEqual([...new Set([...AREAS.run.proofs, ...AREAS.tools.proofs])].sort());
    expect(reviewOf(['apps/desktop/src/run-host/dispatch.ts'])).toEqual(['apps/desktop/src/run-host/dispatch.ts']);
  });

  it('docs-only AGENTS.md is known: gate, no proofs, no review', () => {
    const plan = planFor(['AGENTS.md']);
    expect(plan.unknown).toEqual([]);
    expect(plan.proofs).toEqual([]);
    expect(plan.review).toEqual([]);
    expect(plan.gate).toEqual(['pnpm check']);
  });

  it('live-run is never scheduled automatically', () => {
    const plan = planFor(['apps/desktop/scripts/live-run.mjs']);
    expect(plan.proofs).not.toContain('live-run');
    expect(plan.notes.some((n: string) => n.includes('never automatic'))).toBe(true);
  });
});

describe('verification planner — architecture and tests', () => {
  it('a run-loop change names the runtime and state-ownership views', () => {
    const plan = planFor(['packages/engine/src/run/run.ts']);
    expect(plan.views).toEqual([
      'docs/architecture/views/03-runtime-view.md',
      'docs/architecture/views/05-state-ownership.md',
    ]);
  });

  it('narrow tests list a changed test file and a sibling the exists hook confirms', () => {
    expect(narrowTests(['packages/engine/src/run/run.test.ts'])).toEqual(['packages/engine/src/run/run.test.ts']);
    expect(narrowTests(['packages/engine/src/run/run.ts'], (p: string) => p === 'packages/engine/src/run/run.test.ts'))
      .toEqual(['packages/engine/src/run/run.test.ts']);
    expect(narrowTests(['packages/engine/src/run/run.ts'], () => false)).toEqual([]);
  });

  it('the printed plan names the gate, the complete suites and review', () => {
    const text = formatPlan(planFor(['packages/engine/src/run/run.ts', 'no-such-area/mystery.ts']));
    expect(text).toMatch(/REVIEW REQUIRED/);
    expect(text).toMatch(/pnpm check/);
    expect(text).toMatch(/complete suites: The run/);
    expect(text).toMatch(/pnpm part-h-proof/);
    expect(text).toMatch(/docs\/architecture\/views\/03-runtime-view\.md/);
    expect(text).toMatch(/unmapped path/);
  });
});

describe('verification planner — the map stays honest', () => {
  it('every area id a rule names exists', () => {
    for (const rule of RULES) {
      for (const id of rule.areas ?? []) {
        expect(AREAS[id], `unknown area ${id}`).toBeTruthy();
      }
    }
  });

  it('every proof the map names is a package.json script, and every *-proof script is in the map', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const scripts = new Set(Object.keys(pkg.scripts));
    const mapped = proofsInMap();
    for (const proof of mapped) {
      expect(scripts.has(proof), `${proof} is not a package.json script`).toBe(true);
    }
    const proofScripts = [...scripts].filter((s) => /^(?:[a-z0-9-]+)-proof$/.test(s));
    const missing = proofScripts.filter((s) => !mapped.has(s) && !NEVER_AUTOMATIC.includes(s));
    expect(missing, `proof scripts not in the map: ${missing.join(', ')}`).toEqual([]);
    for (const name of NEVER_AUTOMATIC) {
      expect(scripts.has(name) || name === 'live-run', `${name} should remain a known never-automatic script`).toBe(true);
    }
  });

  it('every rule path names at least one tracked file', () => {
    const listed = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    const missing: string[] = [];
    for (const rule of RULES) {
      for (const pat of rule.paths) {
        if (!listed.some((f) => pathMatches(f, pat))) missing.push(pat);
      }
    }
    expect(missing, `rule paths that match nothing: ${missing.join(', ')}`).toEqual([]);
  });
});
