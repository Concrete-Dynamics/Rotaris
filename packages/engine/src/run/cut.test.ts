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

/** REQ-SESSION-136's error-path cut of a tool record's arguments, under REQ-SESSION-194 whole (OQ-209 for what it cannot meet). */
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
    for (const k of ['path', 'file_path', 'filePath', 'base_path', 'task_ids', 'call_id', 'id_or_slug', 'content_hash', 'created_at', 'timestamp', 'url', 'tool_name', 'persona', 'write_scope', 'depends_on', 'continuation_of', 'supersedes'])
      expect([k, argumentKeptWhole(k)]).toEqual([k, true]);
    for (const k of ['content', 'command', 'body', 'message', 'old_string', 'description', 'title', 'pattern'])
      expect([k, argumentKeptWhole(k)]).toEqual([k, false]);
  });
});
