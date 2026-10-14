/**
 * The seam check's lists, held to the source (docs/defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md).
 * Until 2026-10-14 `package.mjs`'s forbidden list named none of main's dialog answers, so a packaged build passed with them
 * inside. Every variable main, the run host or the workspace service reads behind `__ROTARIS_SEAMS__` on the read's own line
 * must be named by the list, so a seam added under the flag and left off the list fails here, before any package is built.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { FORBIDDEN, KEPT, seamCheck } from './seam-check.mjs';

const SRC = join(import.meta.dirname, '..', '..', 'src');
const ROOTS = ['main', 'run-host', 'workspace-service'];

/** Every capture variable read on a line that carries the build-time flag, by root-relative file. */
function flaggedReads(): Map<string, string> {
  const found = new Map<string, string>();
  for (const root of ROOTS) {
    for (const e of readdirSync(join(SRC, root), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue;
      readFileSync(join(e.parentPath, e.name), 'utf8').split('\n').forEach((line, i) => {
        if (!line.includes('__ROTARIS_SEAMS__')) return;
        for (const m of line.matchAll(/process\.env\[['"]((?:ROTARIS_CAPTURE|ROTARIS_THEME_PROOF|ROTARIS_DRIVER)[A-Z0-9_]*)['"]\]/g)) found.set(m[1]!, `${e.name}:${i + 1}`);
      });
    }
  }
  return found;
}

const covered = (name: string): boolean => (FORBIDDEN as string[]).some((f) => name.startsWith(f));

describe('the seam check names every seam read behind __ROTARIS_SEAMS__ (ADR-0056)', () => {
  it('finds main\'s dialog answers among the flagged reads', () => {
    const reads = flaggedReads();
    for (const name of ['ROTARIS_CAPTURE_HOOK_REVIEW', 'ROTARIS_CAPTURE_ANSWERS', 'ROTARIS_CAPTURE_PAUSE_ANSWER', 'ROTARIS_CAPTURE_BACKUP_TO', 'ROTARIS_CAPTURE_OPEN_EXTERNAL']) {
      expect([...reads.keys()], name).toContain(name);
    }
  });

  it('every flagged read is a name the forbidden list covers, and none is one the probe keeps', () => {
    const uncovered = [...flaggedReads()].filter(([name]) => !covered(name)).map(([name, at]) => `${name} (${at})`);
    expect(uncovered).toEqual([]);
    for (const kept of KEPT as string[]) expect(covered(kept), kept).toBe(false);
  });
});

describe('seamCheck reads every emitted file of the main section', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

  function out(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-seam-check-'));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return dir;
  }

  it('passes a bundle with the probe\'s names and no scriptable one', () => {
    const r = seamCheck(out({ 'index.js': 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT; env.ROTARIS_CAPTURE_AFTER_MS;' }));
    expect([r.missing, r.present]).toEqual([[], []]);
  });

  it('names a dialog answer left in a chunk, and a probe name lost', () => {
    const r = seamCheck(out({ 'index.js': 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT;', 'chunks/a.js': "process.env['ROTARIS_CAPTURE_HOOK_REVIEW_MS']" }));
    expect(r.missing).toEqual(['ROTARIS_CAPTURE_AFTER_MS']);
    expect(r.present).toEqual([`ROTARIS_CAPTURE_HOOK_REVIEW (${join('chunks', 'a.js')})`]);
  });
});
