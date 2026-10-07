import { describe, expect, it } from 'vitest';
import { millis } from '@rotaris/kernel';
import { CODE_INTELLIGENCE_MANIFEST } from '@rotaris/config';
import type { ChildRow } from '@rotaris/store';
import { CHILD_STALL_TIMEOUT_MS, continuationRefusal, cutOffLines, cutOffReport, ProgressLog, workspacePath } from './cut-off.js';

const ROOT = '/ws';
const LIMIT = millis(1_200_000);

describe('PD-ORCH-004: the progress rule', () => {
  it('defaults the window to REQ-NOTIFY-100\'s 90 s', () => {
    expect(CHILD_STALL_TIMEOUT_MS).toBe(90_000);
  });

  it('a call completed exactly at the start of the final window is progress; one a millisecond earlier is not', () => {
    const at = new ProgressLog(ROOT);
    at.completed(millis(LIMIT - 90_000), 'read_file', { path: 'a' }, true);
    expect(at.madeProgress(LIMIT, millis(90_000))).toBe(true);

    const outside = new ProgressLog(ROOT);
    outside.completed(millis(LIMIT - 90_001), 'read_file', { path: 'a' }, true);
    expect(outside.madeProgress(LIMIT, millis(90_000))).toBe(false);
  });

  it('a call completed at the expiry itself is progress; no call at all is not', () => {
    const log = new ProgressLog(ROOT);
    expect(log.madeProgress(LIMIT, millis(90_000))).toBe(false);
    log.completed(LIMIT, 'terminal', { command: 'ls' }, true);
    expect(log.madeProgress(LIMIT, millis(90_000))).toBe(true);
  });

  it('a call that returned an error or was refused still completed, and counts', () => {
    const log = new ProgressLog(ROOT);
    log.completed(millis(LIMIT - 1_000), 'write_file', { path: 'a' }, false);
    expect(log.madeProgress(LIMIT, millis(90_000))).toBe(true);
    expect(log.changedPaths()).toEqual([]);
  });

  it('the latest completion decides, and one after the expiry instant is not counted for it', () => {
    const log = new ProgressLog(ROOT);
    log.completed(millis(LIMIT + 5), 'read_file', {}, true);
    expect(log.madeProgress(LIMIT, millis(90_000))).toBe(false);
  });

  it('the window is whatever the run hands it', () => {
    const log = new ProgressLog(ROOT);
    log.completed(millis(LIMIT - 60_000), 'read_file', {}, true);
    expect(log.madeProgress(LIMIT, millis(60_000))).toBe(true);
    expect(log.madeProgress(LIMIT, millis(59_999))).toBe(false);
  });
});

describe('PD-ORCH-004: the paths a child\'s own file-writing calls changed', () => {
  it('in the order first changed, each once, whichever spelling named it', () => {
    const log = new ProgressLog(ROOT);
    log.completed(millis(1), 'write_file', { path: 'src/b.ts' }, true);
    log.completed(millis(2), 'haet_edit', { path: './src/a.ts' }, true);
    log.completed(millis(3), 'write_file', { path: '/ws/src/b.ts' }, true);
    log.completed(millis(4), 'haet', { file_path: 'src/../src/a.ts' }, true);
    log.completed(millis(5), 'write_file', { file_path: 'docs/c.md' }, true);
    expect(log.changedPaths()).toEqual(['src/b.ts', 'src/a.ts', 'docs/c.md']);
  });

  it('a failed or refused write changed nothing; a tool that writes no file is not read; a path outside the workspace is not a workspace path', () => {
    const log = new ProgressLog(ROOT);
    log.completed(millis(1), 'write_file', { path: 'failed.ts' }, false);
    log.completed(millis(2), 'read_file', { path: 'read.ts' }, true);
    log.completed(millis(3), 'terminal', { command: 'touch t.ts' }, true);
    log.completed(millis(4), 'write_file', { path: '/elsewhere/x.ts' }, true);
    log.completed(millis(5), 'write_file', { path: 7 }, true);
    log.completed(millis(6), 'write_file', {}, true);
    expect(log.changedPaths()).toEqual([]);
  });

  it('a write the gate dispatched through its lower-case fallback (`Write_File` runs `write_file`) is a write', () => {
    const log = new ProgressLog(ROOT);
    log.completed(millis(1), 'Write_File', { path: 'src/a.ts' }, true);
    log.completed(millis(2), 'HAET_EDIT', { path: 'src/b.ts' }, true);
    expect(log.changedPaths()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  /**
   * fin32, the a68f121 duress run's D1: wave3b's 11 single-file content replacements of `docs/verification.md` returned
   * `ok` and its cut-off report read "Its file-writing calls changed no workspace paths." REQ-MCP-015's EDIT tier writes
   * files; its calls are file-writing calls (PD-ORCH-004), their paths read as the binding manifest names them.
   */
  it('a code-intelligence EDIT-tier call that returned ok changed the path its arguments name; one that failed, a preview and a read changed nothing', () => {
    const edit = CODE_INTELLIGENCE_MANIFEST.tiers.edit;
    const path = CODE_INTELLIGENCE_MANIFEST.editArguments.replaceInFile.path;
    const log = new ProgressLog(ROOT);
    log.completed(millis(1), edit.replaceInFile, { [path]: 'docs/verification.md', needle: 'a', repl: 'b', mode: 'literal' }, true);
    log.completed(millis(2), edit.replaceInFile, { [path]: 'docs/verification.md', needle: 'c', repl: 'd', mode: 'literal' }, true);
    log.completed(millis(3), edit.replaceSymbolBody, { name_path: 'f', [CODE_INTELLIGENCE_MANIFEST.editArguments.replaceSymbolBody.path]: './src/a.ts', body: '' }, true);
    log.completed(millis(4), edit.insertAfterSymbol, { name_path: 'f', [CODE_INTELLIGENCE_MANIFEST.editArguments.insertAfterSymbol.path]: 'src/failed.ts', body: '' }, false);
    log.completed(millis(5), edit.replaceAcrossFiles, { [CODE_INTELLIGENCE_MANIFEST.editArguments.replaceAcrossFiles.path]: 'src/preview', [CODE_INTELLIGENCE_MANIFEST.editArguments.replaceAcrossFiles.preview]: true }, true);
    log.completed(millis(6), CODE_INTELLIGENCE_MANIFEST.tiers.read.fileSymbolOverview, { [path]: 'src/read.ts' }, true);
    log.completed(millis(7), `code_intelligence_${edit.safeDeleteSymbol}`, { name_path_pattern: 'g', [CODE_INTELLIGENCE_MANIFEST.editArguments.safeDeleteSymbol.path]: 'src/c.ts' }, true);
    expect(log.changedPaths()).toEqual(['docs/verification.md', 'src/a.ts', 'src/c.ts']);
    expect(cutOffReport({ taskId: 'bg_0000000c', limitS: 1200, stallS: 90, changedPaths: log.changedPaths(), isContinuation: true }).changes)
      .toBe('Workspace paths its file-writing calls changed, in the order first changed: docs/verification.md, src/a.ts, src/c.ts.');
  });

  it('workspacePath resolves lexically against the root', () => {
    expect(workspacePath(ROOT, 'a/b.ts')).toBe('a/b.ts');
    expect(workspacePath(ROOT, '/ws/a/b.ts')).toBe('a/b.ts');
    expect(workspacePath(ROOT, '..foo/x')).toBe('..foo/x');
    expect(workspacePath(ROOT, '../x')).toBeNull();
    expect(workspacePath(ROOT, '/ws')).toBeNull();
    expect(workspacePath(ROOT, '.')).toBeNull();
    expect(workspacePath(ROOT, '')).toBeNull();
  });
});

describe('PD-ORCH-004: the report\'s additions and the offer', () => {
  it('a child that is not a continuation gets the statement, its paths and the offer naming its task id', () => {
    const c = cutOffReport({ taskId: 'bg_0000000a', limitS: 1200, stallS: 90, changedPaths: ['src/a.ts', 'src/b.ts'], isContinuation: false });
    expect(c.statement).toBe('Cut off while making progress: this child completed a tool call within the final 90s before its 1200s limit expired.');
    expect(c.changed_paths).toEqual(['src/a.ts', 'src/b.ts']);
    expect(c.changes).toBe('Workspace paths its file-writing calls changed, in the order first changed: src/a.ts, src/b.ts.');
    expect(c.continuation_offer).toContain('continuation_of: "bg_0000000a"');
    expect(cutOffLines(c)).toEqual([c.statement, c.changes, c.continuation_offer]);
  });

  it('OQ-114 as ruled (R-071, PD-ORCH-004 revision 5): the offer tells the parent that a continuation starts with no memory, so it writes a complete brief', () => {
    const c = cutOffReport({ taskId: 'bg_0000000a', limitS: 1200, stallS: 90, changedPaths: ['src/a.ts'], isContinuation: false });
    expect(c.continuation_offer).toBe('Continuation offer: the remaining work may be delegated to a new child as a continuation of this one — call delegate with continuation_of: "bg_0000000a". The continuation starts with no memory of this child\'s work: it is given only the task you write, so write a complete brief — what was asked, what this child did and found, and what remains. A piece of work is continued once; a continuation is not offered one of its own.');
  });

  it('a continuation gets the statement and its paths and no offer; a child that changed nothing says so', () => {
    const c = cutOffReport({ taskId: 'bg_0000000b', limitS: 1200, stallS: 90, changedPaths: [], isContinuation: true });
    expect(c.changes).toBe('Its file-writing calls changed no workspace paths.');
    expect(c.continuation_offer).toBeNull();
    expect(cutOffLines(c)).toEqual([c.statement, c.changes]);
  });

  it('a report with no cut-off renders nothing', () => {
    expect(cutOffLines(undefined)).toEqual([]);
    expect(cutOffLines({})).toEqual([]);
  });
});

describe('PD-ORCH-004: admitting a continuation', () => {
  const row = (task_id: string, canonical_name: string): ChildRow => ({ task_id, canonical_name } as ChildRow);
  it('refuses a reference to no child of the caller, a child that made no offer, and a child already continued; admits otherwise', () => {
    expect(continuationRefusal('bg_00000001', undefined, false, undefined)).toMatch(/names no child task of yours/);
    expect(continuationRefusal('bg_00000001', row('bg_00000001', 'build'), false, undefined)).toMatch(/^Task 'build' \(bg_00000001\) made no continuation offer/);
    expect(continuationRefusal('bg_00000001', row('bg_00000001', 'build'), true, row('bg_00000002', 'build-more'))).toMatch(/was already continued by 'build-more' \(bg_00000002\); a piece of work is continued once/);
    expect(continuationRefusal('bg_00000001', row('bg_00000001', 'build'), true, undefined)).toBeNull();
  });
});
