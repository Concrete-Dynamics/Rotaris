import { describe, expect, it, vi } from 'vitest';
import { millis } from '@rotaris/kernel';
import { CODE_INTELLIGENCE_MANIFEST } from '@rotaris/config';
import type { ChildRow } from '@rotaris/store';
import type { EditTierNames } from './report.js';
import { CHILD_STALL_TIMEOUT_MS, childTimedOutMessage, continuationRefusal, cutOffLines, cutOffReport, ProgressLog, timedOutOf, workspacePath } from './cut-off.js';

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

  it('a code-intelligence EDIT tool its entry renamed changes its path (REQ-MCP-005, fin38)', () => {
    const path = CODE_INTELLIGENCE_MANIFEST.editArguments.replaceInFile.path;
    const log = new ProgressLog(ROOT, () => new Map([['edit_text', CODE_INTELLIGENCE_MANIFEST.tiers.edit.replaceInFile]]));
    log.completed(millis(1), 'edit_text', { [path]: 'docs/a.md', needle: 'a', repl: 'b', mode: 'literal' }, true);
    expect(log.changedPaths()).toEqual(['docs/a.md']);
  });

  it('another server\'s tool named like the EDIT tier changes no path once the child\'s grant is known (REQ-MCP-015, fin36)', () => {
    const edit = CODE_INTELLIGENCE_MANIFEST.tiers.edit;
    const path = CODE_INTELLIGENCE_MANIFEST.editArguments.replaceInFile.path;
    let tier: EditTierNames;
    const log = new ProgressLog(ROOT, () => tier);
    tier = new Map([['code_intelligence_' + edit.replaceInFile, 'code_intelligence_' + edit.replaceInFile]]);
    log.completed(millis(1), edit.replaceInFile, { [path]: 'notes/inbox.md', needle: 'a', repl: 'b', mode: 'literal' }, true);
    log.completed(millis(2), edit.replaceAcrossFiles, { needle: 'a', repl: 'b', mode: 'literal' }, true);
    log.completed(millis(3), `code_intelligence_${edit.replaceInFile}`, { [path]: 'docs/a.md', needle: 'a', repl: 'b', mode: 'literal' }, true);
    expect(log.changedPaths()).toEqual(['docs/a.md']);
    expect(log.unnamedBy()).toEqual([]);
    // Before the port's grant is known the name alone decides, as before.
    tier = undefined;
    log.completed(millis(4), edit.replaceInFile, { [path]: 'notes/later.md', needle: 'a', repl: 'b', mode: 'literal' }, true);
    expect(log.changedPaths()).toEqual(['docs/a.md', 'notes/later.md']);
  });

  /**
   * OQ-245 (XE1, 2026-10-13, R-072): a cross-file EDIT call changed the files the run host observed it change, whatever it
   * returned; with no observation it is said, and the report never reads "changed no workspace paths" over it.
   */
  it('OQ-245: a rename and a whole-project replacement list what they were observed to change, a directory never, a partial failure what it wrote', () => {
    const edit = CODE_INTELLIGENCE_MANIFEST.tiers.edit;
    const at = CODE_INTELLIGENCE_MANIFEST.editArguments;
    const log = new ProgressLog(ROOT);
    log.completed(millis(1), edit.renameSymbol, { name_path: 'total', [at.renameSymbol.path]: 'src/total.ts', new_name: 'sum' }, true, { observedPaths: ['src/a.ts', 'src/b.ts', 'src/total.ts'] });
    log.completed(millis(2), edit.replaceAcrossFiles, { needle: 'a', repl: 'b', mode: 'literal' }, true, { observedPaths: ['docs/api.md'] });
    log.completed(millis(3), edit.replaceAcrossFiles, { needle: 'c', repl: 'd', mode: 'literal', [at.replaceAcrossFiles.path]: 'lib' }, true, { observedPaths: ['lib/x.ts'] });
    log.completed(millis(4), edit.replaceAcrossFiles, { needle: 'e', repl: 'f', mode: 'literal' }, false, { observedPaths: ['lib/y.ts'] });
    log.completed(millis(5), edit.replaceAcrossFiles, { needle: 'g', repl: 'h', mode: 'literal', [at.replaceAcrossFiles.path]: 'lib', [at.replaceAcrossFiles.preview]: true }, true);
    expect(log.changedPaths()).toEqual(['src/a.ts', 'src/b.ts', 'src/total.ts', 'docs/api.md', 'lib/x.ts', 'lib/y.ts']);
    expect(log.changedPaths()).not.toContain('lib');
    expect(log.unnamedBy()).toEqual([]);
  });

  it('OQ-245: a cross-file call with no observation is said; "changed no workspace paths" is never written over it', () => {
    const edit = CODE_INTELLIGENCE_MANIFEST.tiers.edit;
    const at = CODE_INTELLIGENCE_MANIFEST.editArguments;
    const only = new ProgressLog(ROOT);
    only.completed(millis(1), edit.replaceAcrossFiles, { needle: 'a', repl: 'b', mode: 'literal' }, true);
    expect(only.changedPaths()).toEqual([]);
    expect(only.unnamedBy()).toEqual([edit.replaceAcrossFiles]);
    const alone = cutOffReport({ taskId: 'bg_0000000d', limitS: 1200, stallS: 90, changedPaths: only.changedPaths(), unnamedBy: only.unnamedBy(), isContinuation: true }).changes;
    expect(alone).toBe(`The record names no workspace path its file-writing calls changed, but a ${edit.replaceAcrossFiles} call may have changed files the record cannot name.`);
    expect(alone).not.toContain('changed no workspace paths');
    const mixed = new ProgressLog(ROOT);
    mixed.completed(millis(1), 'write_file', { operation: 'edit', path: 'README.md' }, true);
    // Cut off while under way, before the after-look: it ran, so it is said too, with its declaring file.
    mixed.completed(millis(2), edit.renameSymbol, { name_path: 'f', [at.renameSymbol.path]: 'src/f.ts', new_name: 'g' }, false, { ran: true });
    // Refused, never run: neither listed nor said.
    mixed.completed(millis(3), edit.replaceAcrossFiles, { needle: 'x', repl: 'y', mode: 'literal' }, false);
    expect(mixed.changedPaths()).toEqual(['README.md', 'src/f.ts']);
    expect(cutOffReport({ taskId: 'bg_0000000e', limitS: 1200, stallS: 90, changedPaths: mixed.changedPaths(), unnamedBy: mixed.unnamedBy(), isContinuation: true }).changes)
      .toBe(`Workspace paths its file-writing calls changed, in the order first changed: README.md, src/f.ts. Beyond these, a ${edit.renameSymbol} call may have changed files the record cannot name.`);
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

/**
 * PD-CONFIG-003 revision 3 (OQ-234): the agent surfaces read the limit a child ran under back from REQ-ORCH-088's error in
 * its stored report, so one formatter writes the form and one parser reads it
 * (docs/defects/fixed/a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md).
 */
describe('PD-CONFIG-003 revision 3: the timeout error, written once and read back', () => {
  const stored = (over: Record<string, unknown> = {}): string => JSON.stringify({ agent_name: 'build', role: 'coding-agent', status: 'failed', summary: 's', key_findings: [], last_response: '', final_response: '', ...over });
  const timeout = (limitS: number) => ({ errors: [{ type: 'timeout', message: childTimedOutMessage(limitS) }] });

  it('writes REQ-ORCH-088\'s fixed form', () => {
    expect(childTimedOutMessage(1200)).toBe('Child timed out after 1200s');
    expect(childTimedOutMessage(0.05)).toBe('Child timed out after 0.05s');
  });

  it('round-trips the limit, with and without PD-ORCH-004\'s cut-off statement', () => {
    expect(timedOutOf(stored(timeout(1200)))).toEqual({ limitSeconds: 1200, makingProgress: false });
    expect(timedOutOf(stored(timeout(2700)))).toEqual({ limitSeconds: 2700, makingProgress: false });
    expect(timedOutOf(stored(timeout(1250)))).toEqual({ limitSeconds: 1250, makingProgress: false });
    expect(timedOutOf(stored(timeout(0.05)))).toEqual({ limitSeconds: 0.05, makingProgress: false });
    const cutOff = cutOffReport({ taskId: 'bg_00000001', limitS: 1200, stallS: 90, changedPaths: ['a'], isContinuation: false });
    expect(timedOutOf(stored({ ...timeout(1200), cut_off: cutOff }))).toEqual({ limitSeconds: 1200, makingProgress: true });
  });

  // fin33's review: `toAgentRecord` reads every child at every projection (the 80 ms publish tick), so a timed-out child's
  // stored report was parsed again each time. One report is parsed once.
  it('parses one stored report once, however often a projection reads it', () => {
    const report = stored({ ...timeout(1234), summary: 'memo' });
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const first = timedOutOf(report);
      for (let i = 0; i < 5; i += 1) expect(timedOutOf(report)).toEqual(first);
      expect(parse).toHaveBeenCalledTimes(1);
    } finally { parse.mockRestore(); }
  });

  it('reads nothing from a report with no timeout error, or none at all', () => {
    expect(timedOutOf(null)).toBeNull();
    expect(timedOutOf(undefined)).toBeNull();
    expect(timedOutOf('not json Child timed out after 1200s')).toBeNull();
    expect(timedOutOf(stored({ status: 'succeeded', errors: [] }))).toBeNull();
    expect(timedOutOf(stored({ status: 'cancelled', errors: [{ type: 'cancelled', message: 'Cancelled by the user' }] }))).toBeNull();
    expect(timedOutOf(stored({ errors: [{ type: 'model', message: 'stream closed' }] }))).toBeNull();
    // The fallback retry's own note is not the error: a child that succeeded on the retry carries none.
    expect(timedOutOf(stored({ status: 'succeeded', errors: [], summary: 'Child build timed out after 1200s on a/b; retried once on the fallback model c/d (REQ-ORCH-088).' }))).toBeNull();
    // Another message under the timeout type is not REQ-ORCH-088's form.
    expect(timedOutOf(stored({ errors: [{ type: 'timeout', message: 'Child timed out after soon' }] }))).toBeNull();
    // Of two errors, the timeout one is read.
    expect(timedOutOf(stored({ errors: [{ type: 'model', message: 'stream closed' }, { type: 'timeout', message: childTimedOutMessage(60) }] }))).toEqual({ limitSeconds: 60, makingProgress: false });
  });
});
