import { describe, expect, it } from 'vitest';
import { directWorkBundle } from './registry.js';

describe('REQ-ORCH-016: the direct-work bundle by capability', () => {
  it('holds todo, delegation, search, fetch, artifact reads and every tool that reads, writes or runs; never by a literal list', () => {
    const b = directWorkBundle();
    for (const n of ['todo', 'delegate', 'background_output', 'wait_for_tasks', 'grep', 'glob', 'fetch', 'artifact_read', 'artifact_list', 'read_file', 'write_file', 'haet', 'haet_edit', 'haet_read', 'terminal', 'git_commit']) expect(b).toContain(n);
    expect(b).not.toContain('ask_questions');
    expect(b).not.toContain('artifact_write');
  });
});
