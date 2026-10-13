import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approvalAnswerer, approvalButtonLabel } from './approval-answers.js';

describe('the approval dialog\'s scripted answers (verification only)', () => {
  it('a bare answer answers every dialog, as the seam did before', () => {
    const a = approvalAnswerer('session');
    expect(a.problems).toEqual([]);
    expect(a.next('write_file')).toEqual({ kind: 'session', afterMs: null });
    expect(a.next('terminal')).toEqual({ kind: 'session', afterMs: null });
  });

  it('PD-TOOLS-004/005: per tool, the k-th dialog takes the k-th answer and the last repeats', () => {
    const a = approvalAnswerer('write_file=session,none;;ask_questions=once@3000;;todo=once');
    expect(a.next('write_file')).toEqual({ kind: 'session', afterMs: null });
    expect(a.next('write_file')).toEqual({ kind: 'none', afterMs: null });
    expect(a.next('write_file')).toEqual({ kind: 'none', afterMs: null });
    expect(a.next('ask_questions')).toEqual({ kind: 'once', afterMs: 3000 });
    expect(a.next('todo')).toEqual({ kind: 'once', afterMs: null });
    // A tool no entry names, with no bare answer, is left to the person (or to its timeout).
    expect(a.next('delegate')).toBeNull();
  });

  it('a bare answer stands for the tools no entry names', () => {
    const a = approvalAnswerer('once;;terminal=none');
    expect(a.next('terminal')).toEqual({ kind: 'none', afterMs: null });
    expect(a.next('delegate')).toEqual({ kind: 'once', afterMs: null });
  });

  it('an unreadable entry is named and answers nothing', () => {
    const a = approvalAnswerer('maybe;;write_file=sometimes;;=once');
    expect(a.problems).toHaveLength(3);
    expect(a.next('write_file')).toBeNull();
    expect(approvalAnswerer(undefined).next('write_file')).toBeNull();
  });

  it('labels the three buttons REQ-TOOLS-052 names', () => {
    expect([approvalButtonLabel('once'), approvalButtonLabel('session'), approvalButtonLabel('deny')]).toEqual(['Approve once', 'Approve for this session', 'Deny']);
  });

  /*
   * docs/defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md: main reads the seam's three variables
   * behind the build-time flag, so a packaged build (`__ROTARIS_SEAMS__` false) compiles the reads out. Until 2026-10-13 they
   * sat behind the run-time `capturing` test alone, which a packaged build keeps. `scripts/package.mjs` refuses the artifact;
   * this reads the source, where the guard is written.
   */
  it('main reads every approval seam variable behind __ROTARIS_SEAMS__', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'index.ts'), 'utf8');
    const reads = source.split('\n').filter((line) => /process\.env\['ROTARIS_CAPTURE_(APPROVAL|APPROVAL_MS|DIALOG_PNG)'\]/.test(line));
    expect(reads.length).toBeGreaterThan(0);
    for (const line of reads) expect(line).toMatch(/__ROTARIS_SEAMS__/);
  });
});
