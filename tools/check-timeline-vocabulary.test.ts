/**
 * REQ-ORCH-139's gate over the product's own source, and over fixtures for what it must tell apart: a timeline name in no
 * vocabulary fails wherever it is written (a writer call, a sink, the store's insert, main's request), a word of a
 * vocabulary passes, a name held by OQ-157 passes until nothing writes it, and a name the gate cannot read fails unless a
 * PASS_THROUGH entry says why. Acceptance finding A29: docs/defects/the-run-writes-timeline-events-outside-its-closed-vocabulary.md.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { AWAITING, checkProduct, FORBIDDEN, specVocabulary, timelineWritesIn, VOCABULARY } from './check-timeline-vocabulary.mjs';

const repo = join(import.meta.dirname, '..');

describe('check-timeline-vocabulary (REQ-ORCH-139)', () => {
  it('every timeline name the product writes is a word of a vocabulary or held by OQ-157, and every entry still excuses one', () => {
    const { problems, stale, drift } = checkProduct(repo);
    expect(problems).toEqual([]);
    expect(stale).toEqual([]);
    expect(drift).toEqual([]);
  });

  it('REQ-ORCH-139: VOCABULARY holds domain 01\'s list exactly as the specification states it, and nothing it holds is AWAITING', () => {
    const spec = specVocabulary(repo) as string[] | null;
    expect(spec).not.toBeNull();
    expect(spec).toEqual(expect.arrayContaining(['quota_fallback_model', 'fallback_model', 'llm_unresponsive', 'session.start', 'session.end']));
    const domain01 = Object.entries(VOCABULARY as Record<string, string>).filter(([, cite]) => cite === 'REQ-ORCH-139').map(([name]) => name);
    expect([...domain01].sort()).toEqual([...spec!].sort());
    expect(Object.keys(AWAITING as Record<string, unknown>).filter((name) => Object.hasOwn(VOCABULARY as object, name))).toEqual([]);
  });

  it('A29: the three fallback names no list has are written nowhere — the vocabulary\'s words replaced them', () => {
    for (const name of ['model_fallback', 'unresponsive_model_fallback', 'child_timeout_fallback']) {
      expect(Object.hasOwn(VOCABULARY as object, name)).toBe(false);
      expect(Object.hasOwn(AWAITING as object, name)).toBe(false);
    }
  });

  it('REQ-ORCH-139: each word another domain fixes is stated, in backticks, by the requirement VOCABULARY cites for it', () => {
    const spec = readdirSync(join(repo, 'docs', 'spec')).filter((f) => f.endsWith('.md')).flatMap((f) => readFileSync(join(repo, 'docs', 'spec', f), 'utf8').split('\n'));
    const unstated = Object.entries(VOCABULARY as Record<string, string>).filter(([, cite]) => cite !== 'REQ-ORCH-139').filter(([word, cite]) => {
      const line = spec.find((l) => l.startsWith(`**${cite}**`) || l.startsWith(`- **${cite}**`));
      return line === undefined || !line.includes(`\`${word}\``);
    });
    expect(unstated).toEqual([]);
  });

  it('PD-TOOLS-002: `permission_mode_downgraded` is withdrawn — FORBIDDEN, citing the directive, and neither a word nor AWAITING', () => {
    expect(FORBIDDEN).toEqual({ permission_mode_downgraded: 'PD-TOOLS-002' });
    expect(Object.hasOwn(VOCABULARY as object, 'permission_mode_downgraded')).toBe(false);
    expect(Object.hasOwn(AWAITING as object, 'permission_mode_downgraded')).toBe(false);
  });

  it('OQ-157: AWAITING can only shrink — its names are pinned here, so adding one is a deliberate edit of this test', () => {
    expect(Object.keys(AWAITING as Record<string, unknown>).sort()).toEqual([
      'approval_withdrawn', 'child_paused', 'child_resumed', 'context_compressed', 'context_selection', 'entry_model_switched',
      'entry_reasoning_switched', 'iteration_paused', 'iteration_resumed', 'loop_supervisor_activation', 'model_exhausted',
      'model_override', 'notice', 'pause_resolved', 'prompt_edited', 'prompt_queued', 'prompt_removed', 'prompt_triggered',
      'question_withdrawn', 'run_continuation_intent', 'run_pause_refused', 'run_pause_requested', 'run_paused_message_limit',
      'steering_injected', 'steering_not_delivered', 'steering_submitted', 'todo_edited', 'transcript_cleared',
    ]);
  });

  describe('over fixtures', () => {
    let root: string;
    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'timeline-vocabulary-'));
      mkdirSync(join(root, 'packages', 'engine', 'src'), { recursive: true });
      mkdirSync(join(root, 'apps', 'desktop', 'src', 'main'), { recursive: true });
      mkdirSync(join(root, 'docs', 'spec'), { recursive: true });
      writeFileSync(join(root, 'docs', 'spec', '01-run-orchestration.md'), '## Data & Formats\n\n### Timeline event vocabulary (session diagnostics)\n\n`iteration_start`, `fallback_model`.\n\n### Issue kinds\n\n`stall`.\n');
    });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    it('reads a name from each carrier, and a name passed as a variable as an expression', () => {
      const writes = timelineWritesIn([
        "w.appendTimeline('a_one', 'rotaris', 'm', {});",
        "w.appendTimelineEntry('a_two', 'rotaris', 'm', {});",
        "deps.sink.timeline('a_three', 'actor', 'm', {});",
        "dal.insertTimeline(sid, 1, at, 'a_four', 'user', 'm', '{}', id, 'info');",
        "this.queuedMove(id, move, 'a_five', 'message');",
        "req({ kind: 'timeline.append', name: 'a_six', actor: 'system' });",
        "w.appendTimeline(name, 'rotaris', 'm', {});",
        "dal.timeline(sid);",
      ].join('\n'), 'x.ts') as { name?: string; expression?: string }[];
      expect(writes.map((w) => w.name ?? `<${w.expression}>`)).toEqual(['a_one', 'a_two', 'a_three', 'a_four', 'a_five', 'a_six', '<name>']);
    });

    it('a name in no list fails; a word, an AWAITING name and a test file pass; stale entries and spec drift fail', () => {
      writeFileSync(join(root, 'packages', 'engine', 'src', 'a.ts'), [
        "declare const w: { appendTimeline(n: string, a: string, m: string, x: object): void };",
        "w.appendTimeline('fallback_model', 'rotaris', 'm', {});",
        "w.appendTimeline('held_word', 'rotaris', 'm', {});",
        "w.appendTimeline('model_fallback', 'rotaris', 'm', {});",
        "w.appendTimeline(someName, 'rotaris', 'm', {});",
      ].join('\n'));
      writeFileSync(join(root, 'packages', 'engine', 'src', 'a.test.ts'), "w.appendTimeline('test_only_word', 'rotaris', 'm', {});\n");
      writeFileSync(join(root, 'apps', 'desktop', 'src', 'main', 'index.ts'), "req({ kind: 'timeline.append', name: 'notice_word', actor: 'system' });\n");
      const vocabulary = { fallback_model: 'REQ-ORCH-139' };
      const awaiting = { held_word: { file: 'packages/engine/src/a.ts', fact: 'x' }, gone_word: { file: 'packages/engine/src/a.ts', fact: 'y' } };
      const passThrough = [{ file: 'packages/engine/src/b.ts', expression: 'name', reason: 'r' }];
      const { problems, stale, drift } = checkProduct(root, vocabulary, awaiting, passThrough) as { problems: string[]; stale: string[]; drift: string[] };
      expect(problems).toEqual([
        "packages/engine/src/a.ts:4: 'model_fallback' is in no timeline vocabulary (REQ-ORCH-139)",
        'packages/engine/src/a.ts:5: a timeline name passed as `someName`, which this gate cannot read — write the name, or add a PASS_THROUGH entry with its reason',
        "apps/desktop/src/main/index.ts:1: 'notice_word' is in no timeline vocabulary (REQ-ORCH-139)",
      ]);
      expect(stale).toEqual([
        "AWAITING 'gone_word' is written nowhere — remove it, and say so in OQ-157",
        'packages/engine/src/b.ts: PASS_THROUGH `name` matches nothing — remove it',
      ]);
      expect(drift).toEqual(["domain 01's vocabulary has 'iteration_start', which VOCABULARY lacks"]);
    });

    it('PD-TOOLS-002: a write of a FORBIDDEN name fails, citing the directive, even where the displaced requirement still states it', () => {
      writeFileSync(join(root, 'packages', 'engine', 'src', 'a.ts'), [
        "declare const sink: { timeline(n: string, a: string, m: string, x: object): void };",
        "sink.timeline('fallback_model', 'permissions', 'm', {});",
        "sink.timeline('permission_mode_downgraded', 'permissions', 'm', {});",
      ].join('\n'));
      const vocabulary = { iteration_start: 'REQ-ORCH-139', fallback_model: 'REQ-ORCH-139' };
      const { problems, stale } = checkProduct(root, vocabulary, {}, [], FORBIDDEN) as { problems: string[]; stale: string[] };
      expect(problems).toEqual(["packages/engine/src/a.ts:3: 'permission_mode_downgraded' is withdrawn by PD-TOOLS-002 — no timeline event of that name may be written"]);
      expect(stale).toEqual([]);
      const both = checkProduct(root, { ...vocabulary, permission_mode_downgraded: 'REQ-SANDBOX-104' }, {}, [], FORBIDDEN) as { problems: string[]; stale: string[] };
      expect(both.problems).toHaveLength(1);
      expect(both.stale).toEqual(["FORBIDDEN 'permission_mode_downgraded' (PD-TOOLS-002) is also a word or AWAITING — remove it there"]);
    });
  });
});
