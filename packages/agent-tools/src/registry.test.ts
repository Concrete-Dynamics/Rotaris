import { describe, expect, it } from 'vitest';
import { DECLARATIONS, directWorkBundle, READ_ONLY_CLASS } from './registry.js';

describe('REQ-ORCH-016: the direct-work bundle by capability', () => {
  it('holds todo, delegation, search, fetch, artifact reads and every tool that reads, writes or runs; never by a literal list', () => {
    const b = directWorkBundle();
    for (const n of ['todo', 'delegate', 'background_output', 'wait_for_tasks', 'grep', 'glob', 'fetch', 'artifact_read', 'artifact_list', 'read_file', 'write_file', 'haet', 'haet_edit', 'haet_read', 'terminal', 'git_commit', 'git_read']) expect(b).toContain(n);
    expect(b).not.toContain('ask_questions');
    expect(b).not.toContain('artifact_write');
  });
});

describe('REQ-TOOLS-001/007: git_read declares reads only and joins the read-only class (OQ-61)', () => {
  it('declares reading and neither writing nor running', () => {
    expect(DECLARATIONS['git_read']).toEqual({ readsWorkspaceFiles: true, writesWorkspaceFiles: false, runsCommands: false });
  });

  it('is a member of the read-only class', () => {
    expect(READ_ONLY_CLASS.has('git_read')).toBe(true);
  });
});
