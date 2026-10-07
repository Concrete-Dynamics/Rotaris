import { describe, expect, it } from 'vitest';
import { argumentKeptWhole, cut, cutArguments } from './cut.js';

/** REQ-SESSION-194's cut, shared by the handoff, the offers list (PD-ORCH-004 revision 3) and the plan cycle's pending tasks (PD-ORCH-003 revision 2). */
describe('cut (REQ-SESSION-194)', () => {
  it('keeps a text within the cap, and cuts a longer one to the cap with the last three an ellipsis', () => {
    expect(cut('abcdef', 6)).toBe('abcdef');
    expect(cut('abcdefg', 6)).toBe('abc...');
  });

  it('never cuts between the two halves of a surrogate pair', () => {
    expect(cut(`ab\u{1F600}cdef`, 6)).toBe('ab...');
    expect(cut(`a\u{1F600}cdef`, 6)).toBe('a\u{1F600}...');
  });

  it('a cap of three or less keeps only the ellipsis', () => {
    expect(cut('abcdef', 3)).toBe('...');
    expect(cut('\u{1F600}abcdef', 3)).toBe('...');
  });
});

/** REQ-SESSION-136's error-path cut of a tool record's arguments, under REQ-SESSION-194 whole, as PD-SESSION-003 narrows both (OQ-209, ruled 2026-10-07). */
describe('cutArguments (REQ-SESSION-136, REQ-SESSION-194)', () => {
  it('returns arguments that fit as they are', () => {
    const args = { command: 'ls' };
    expect(cutArguments(args, 2_000)).toBe(args);
  });

  it('cuts the longest free-text value first and leaves shorter ones whole', () => {
    const out = cutArguments({ old_string: 'o'.repeat(60), new_string: 'n'.repeat(200), mode: 'replace' }, 120);
    expect(out['old_string']).toBe('o'.repeat(60));
    expect(out['new_string']).toMatch(/^n+\.\.\.$/u);
    expect(out['mode']).toBe('replace');
    expect(JSON.stringify(out).length).toBe(120);
  });

  it('counts an escaped character at its JSON length, so the text fits after one cut', () => {
    const out = cutArguments({ content: '\n'.repeat(300) }, 100);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(100);
    expect(out['content']).toMatch(/\.\.\.$/u);
  });

  it('never cuts what sits under a key naming a path, an identifier or a timestamp', () => {
    const out = cutArguments({ paths: ['/a'.repeat(30)], meta: { session_id: 's'.repeat(40) }, body: 'b'.repeat(300) }, 200);
    expect(out['paths']).toEqual(['/a'.repeat(30)]);
    expect(out['meta']).toEqual({ session_id: 's'.repeat(40) });
    expect(out['body']).toMatch(/^b+\.\.\.$/u);
  });

  it('reads the key by its last word, in snake case and camel case', () => {
    for (const k of ['path', 'file_path', 'filePath', 'base_path', 'task_ids', 'call_id', 'id_or_slug', 'content_hash', 'created_at', 'timestamp', 'url', 'tool_name', 'persona', 'write_scope', 'depends_on', 'continuation_of', 'supersedes', 'inherited_context', 'attach_artifacts'])
      expect([k, argumentKeptWhole(k)]).toEqual([k, true]);
    for (const k of ['content', 'command', 'body', 'message', 'old_string', 'description', 'title', 'pattern'])
      expect([k, argumentKeptWhole(k)]).toEqual([k, false]);
  });

  /*
   * PD-SESSION-003 (OQ-209, ruled 2026-10-07 under R-072): every argument key of every built-in tool, by tool, and how
   * the error-path cut treats its value — `whole` (a path, an identifier or a timestamp, by its key: never cut), `free`
   * (free text: cut longest first, marked) or `value` (a number or a boolean: never cut, whatever its key). A built-in
   * tool that gains a key holding identifiers, paths or timestamps under a name whose last word does not say so belongs in
   * WHOLE_KEYS (`cut.ts`), and here (the seams view, "A tool"). Until fin28 `delegate`'s `inherited_context` (sibling task
   * ids) and `attach_artifacts` (artifact ids or slugs, REQ-TOOLS-152) read as free text
   * (docs/defects/fixed/a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md).
   */
  it('classifies every argument key of every built-in tool (PD-SESSION-003)', () => {
    const table: Record<string, Record<string, 'whole' | 'free' | 'value'>> = {
      // delegation.ts
      delegate: { persona: 'whole', task_name: 'whole', task: 'free', depends_on: 'whole', inherited_context: 'whole', category: 'free', session_id: 'whole', run_in_background: 'value', attach_artifacts: 'whole', suppress_auto_context: 'value', write_scope: 'whole', continuation_of: 'whole' },
      background_output: { task_id: 'whole', detail_level: 'free' },
      wait_for_tasks: { task_ids: 'whole' },
      // todo.ts (`phases` holds `id`, `name`, `tasks`; `task` holds `id`, `name`, `title`, `description`, `state`)
      todo: { operation: 'free', phases: 'free', phase_id: 'whole', task_id: 'whole', name: 'whole', title: 'free', description: 'free', state: 'free', task: 'free', id: 'whole', tasks: 'free' },
      // files.ts
      read_file: { path: 'whole', file_path: 'whole', offset: 'value', limit: 'value', grep: 'free', grep_context: 'value' },
      haet_read: { path: 'whole', file_path: 'whole', offset: 'value', limit: 'value', grep: 'free', grep_context: 'value' },
      write_file: { operation: 'free', path: 'whole', file_path: 'whole', content: 'free', old_string: 'free', new_string: 'free', replace_all: 'value', insert_line: 'value' },
      haet_edit: { path: 'whole', file_path: 'whole', content_hash: 'whole', old_string: 'free', new_string: 'free', replace_all: 'value' },
      // search.ts
      grep: { pattern: 'free', paths: 'whole', path: 'whole', max_matches: 'value' },
      glob: { pattern: 'free', base_path: 'whole' },
      // artifacts.ts
      artifact_write: { slug: 'whole', title: 'free', body: 'free', tags: 'free', supersedes: 'whole' },
      artifact_read: { id_or_slug: 'whole', sections: 'free' },
      artifact_list: { kind: 'free', persona: 'whole', tags: 'free', limit: 'value', include_superseded: 'value' },
      // questions.ts (`steps` holds `id`, `title`, `description`, `options` of `label` and `description`, `allow_freeform`)
      ask_questions: { steps: 'free', id: 'whole', title: 'free', description: 'free', options: 'free', label: 'free', allow_freeform: 'value' },
      // git-read.ts
      git_read: { operation: 'free', ref: 'whole' },
      // fetch.ts
      fetch: { url: 'whole', max_lines: 'value', from_line: 'value', to_line: 'value', timeout: 'value' },
      // terminal/index.ts
      terminal: { command: 'free', is_input: 'value', timeout: 'value', reset: 'value', background: 'value', session_id: 'whole', session_action: 'free', signal: 'free', input_data: 'free' },
    };
    const read: string[] = [];
    const expected: string[] = [];
    for (const [tool, keys] of Object.entries(table)) {
      for (const [key, kind] of Object.entries(keys)) {
        if (kind === 'value') continue;
        read.push(`${tool}.${key}: ${argumentKeptWhole(key) ? 'whole' : 'free'}`);
        expected.push(`${tool}.${key}: ${kind}`);
      }
    }
    expect(read).toEqual(expected);
  });

  it('a failed delegate call keeps its sibling task ids and attached artifact ids whole and cuts its task to the marker (PD-SESSION-003)', () => {
    const inherited = Array.from({ length: 80 }, (_, i) => `bg_${String(i).padStart(8, '0')}`);
    const attached = Array.from({ length: 60 }, (_, i) => `art_${String(i).padStart(12, '0')}-${'s'.repeat(10)}`);
    const args = { persona: 'coding-agent', task_name: 'Port the parser', task: 't'.repeat(3_000), inherited_context: inherited, attach_artifacts: attached };
    // The id lists alone pass 2,000 characters, so read as free text they would have to be cut for the arguments to fit.
    expect(JSON.stringify({ ...args, task: '...' }).length).toBeGreaterThan(2_000);
    const out = cutArguments(args, 2_000);
    expect(out['inherited_context']).toEqual(inherited);
    expect(out['attach_artifacts']).toEqual(attached);
    expect(out['persona']).toBe('coding-agent');
    expect(out['task_name']).toBe('Port the parser');
    // PD-SESSION-003 (e): what is kept whole passes the cap on its own, so the free text is cut to the marker alone and the
    // stored arguments go over 2,000 characters.
    expect(out['task']).toBe('...');
    expect(JSON.stringify(out).length).toBe(JSON.stringify({ ...args, task: '...' }).length);
  });
});
