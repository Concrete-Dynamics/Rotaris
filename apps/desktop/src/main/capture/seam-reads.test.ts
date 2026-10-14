import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * docs/defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md: main read a set of verification
 * seams — the hook review's press, the pause window's answer, every message box's answer, the backup, restore, export,
 * directory and skill-file choosers' paths, the provider dialog's fill, the external-link swallow, the stale question
 * answer, the subscription's delay and hold, the theme, the scale and the network log — behind the run-time `capturing`
 * test alone (`ROTARIS_CAPTURE_PNG` set), which a packaged build keeps, so two variables in the environment answered a
 * packaged build's dialogs. A packaged build compiles a read out only when the read itself sits behind the build-time flag
 * (`__ROTARIS_SEAMS__`, false under `ROTARIS_BUILD=package`; rollup removes the guarded branch and the name with it), the
 * shape `approval-answers.test.ts` holds the approval seam to. `scripts/package.mjs` refuses the artifact; this reads the
 * source, where the guard is written, so a seam added without it fails here before any package is built.
 */

const MAIN = join(import.meta.dirname, '..');

/**
 * Files main reaches only through the dynamic import inside `if (__ROTARIS_SEAMS__)` (`capture/index.ts`), whose reads a
 * packaged build never emits. The packaged probe (`capture/probe.ts`) was outside the rule as well until 2026-10-14, as
 * though every read in it shipped on purpose; six of its reads were verification seams it does not use, and a packaged build
 * kept them (docs/defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md). It is inside
 * the rule now: only its three variables below are read off the flag.
 */
const OUTSIDE_THIS_RULE = new Set(['capture/seams.ts', 'capture/theme-proof.ts']);

/** The packaged probe's own three, read where the capture starts (`capturing`, `capture/index.ts`) and in `capture/probe.ts`. */
const PACKAGED = new Set(['ROTARIS_CAPTURE_PNG', 'ROTARIS_CAPTURE_PROMPT', 'ROTARIS_CAPTURE_AFTER_MS']);

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts'))
    .map((e) => join(e.parentPath, e.name));
}

/** Every line of main's source that reads a capture variable, with the names it reads. */
function captureReads(): { file: string; line: number; text: string; names: string[] }[] {
  const reads: { file: string; line: number; text: string; names: string[] }[] = [];
  for (const path of sources(MAIN)) {
    const file = relative(MAIN, path).split('\\').join('/');
    if (OUTSIDE_THIS_RULE.has(file)) continue;
    readFileSync(path, 'utf8').split('\n').forEach((text, index) => {
      const names = [...text.matchAll(/process\.env\[['"](ROTARIS_CAPTURE_[A-Z0-9_]+)['"]\]/g)].map((m) => m[1]!);
      if (names.length > 0) reads.push({ file, line: index + 1, text: text.trim(), names });
    });
  }
  return reads;
}

describe('main reads every scriptable capture variable behind __ROTARIS_SEAMS__ (ADR-0056, REQ-HOOKS-104)', () => {
  it('finds the reads it is about', () => {
    const named = new Set(captureReads().flatMap((r) => r.names));
    // The note's list, read where main reads it: if one moves out of reach of this test, the test is no longer reading it.
    for (const name of ['ROTARIS_CAPTURE_HOOK_REVIEW', 'ROTARIS_CAPTURE_PAUSE_ANSWER', 'ROTARIS_CAPTURE_ANSWERS', 'ROTARIS_CAPTURE_BACKUP_TO',
      'ROTARIS_CAPTURE_RESTORE_FROM', 'ROTARIS_CAPTURE_SAVE_PATH', 'ROTARIS_CAPTURE_DIRECTORY', 'ROTARIS_CAPTURE_SKILL_FILE',
      'ROTARIS_CAPTURE_PROVIDER_FILL', 'ROTARIS_CAPTURE_PROVIDER_EMPTY_OK', 'ROTARIS_CAPTURE_OPEN_EXTERNAL', 'ROTARIS_CAPTURE_QUESTION_STALE',
      'ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS', 'ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS', 'ROTARIS_CAPTURE_THEME', 'ROTARIS_CAPTURE_SCALE',
      'ROTARIS_CAPTURE_NET', 'ROTARIS_CAPTURE_APPROVAL',
      // fin44: the packaged probe's neighbours, read in `capture/probe.ts`.
      'ROTARIS_CAPTURE_WAIT', 'ROTARIS_CAPTURE_WAIT_MS', 'ROTARIS_CAPTURE_END_VIEW', 'ROTARIS_CAPTURE_END_VIEW_MS', 'ROTARIS_CAPTURE_PROBE',
      'ROTARIS_CAPTURE_PROMPT_MS']) {
      expect(named, name).toContain(name);
    }
  });

  it('each read of a variable the packaged probe does not need carries the flag on its own line', () => {
    const unguarded = captureReads()
      .filter((r) => r.names.some((name) => !PACKAGED.has(name)) && !/__ROTARIS_SEAMS__/.test(r.text))
      .map((r) => `${r.file}:${r.line} ${r.text}`);
    expect(unguarded).toEqual([]);
  });

  /*
   * The same rule for main's seams that are not named `ROTARIS_CAPTURE_*`: the rows proof's renderer role
   * (`ROTARIS_ROWS_PROOF`, read behind `capturing` alone) and the initialization proof's registered task
   * (`ROTARIS_INIT_TEST_TASK`, read with no test at all) were both left in a `ROTARIS_BUILD=package` build (fin43's review,
   * 2026-10-14). Every `ROTARIS_*` variable main reads is a verification seam but the product's own host switch.
   */
  it('each read of any other ROTARIS_ variable but the product\'s own carries the flag on its own line', () => {
    const PRODUCT = new Set(['ROTARIS_CIRCUIT_BREAKER']); // ADR-0059's host switch, a product variable
    const unguarded: string[] = [];
    for (const path of sources(MAIN)) {
      const file = relative(MAIN, path).split('\\').join('/');
      if (OUTSIDE_THIS_RULE.has(file)) continue;
      readFileSync(path, 'utf8').split('\n').forEach((text, index) => {
        const names = [...text.matchAll(/process\.env\[['"](ROTARIS_[A-Z0-9_]+)['"]\]/g)].map((m) => m[1]!)
          .filter((name) => !name.startsWith('ROTARIS_CAPTURE_') && !PRODUCT.has(name));
        if (names.length > 0 && !/__ROTARIS_SEAMS__/.test(text)) unguarded.push(`${file}:${index + 1} ${text.trim()}`);
      });
    }
    expect(unguarded).toEqual([]);
  });
});
