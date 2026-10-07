import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_NAMES, BUILT_IN_ROLE_TOOLS, ROLE_SPAWN_ALIASES } from '@rotaris/contracts';
import { expandDeclared } from '../registry.js';
import { delegateTool, grantFacets, renderDelegateCatalogue, type DelegateCatalogue, type DelegationPort } from './delegation.js';
import type { ToolContext } from './types.js';

/**
 * The built-in table's declarations as the catalogue would carry them for a child of an unrestricted caller: every role but
 * the coordinator-only orchestrator is granted what it declares (the run host's `resolveAgentGrant` is what decides it in
 * the product; `tools.test.ts` holds the two equal).
 */
const BUILT_IN_CATALOGUE: DelegateCatalogue = {
  personas: BUILT_IN_ROLE_NAMES.filter((n) => n !== 'orchestrator').map((name) => ({ name, tools: expandDeclared(BUILT_IN_ROLE_TOOLS[name]) })),
  aliases: Object.entries(ROLE_SPAWN_ALIASES).map(([alias, target]) => ({ alias, target })),
};

/** PD-ORCH-004: `delegate`'s `continuation_of` names the child continued, and reaches the engine's port unchanged. */
describe('delegate — continuation_of (PD-ORCH-004)', () => {
  function capture() {
    const seen: Parameters<DelegationPort['delegate']>[1][] = [];
    const port: DelegationPort = {
      delegate: async (_parent, req) => { seen.push(req); return { status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.' }; },
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
    };
    return { seen, tool: delegateTool(port, 'root:1', BUILT_IN_CATALOGUE) };
  }
  const ctx = {} as ToolContext;

  it('carries the named task id to the port, and omits the field when the call names none', async () => {
    const { seen, tool } = capture();
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'rest', task: 'TASK: continue', continuation_of: 'bg_00000001' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'fresh', task: 'TASK: other' }), ctx);
    expect(seen[0]!.continuationOf).toBe('bg_00000001');
    expect('continuationOf' in seen[1]!).toBe(false);
  });

  it('tells the model the argument exists', () => {
    expect(capture().tool.description).toContain('continuation_of');
  });

  it('OQ-114 as ruled (R-071, PD-ORCH-004 revision 5): tells the model a continuation starts with no memory, so its task is a complete brief', () => {
    expect(capture().tool.description).toContain('A continuation starts with no memory of the child it continues: write its task as a complete brief of what was asked, what that child did and found, and what remains.');
  });
});

/** REQ-TOOLS-152: `suppress_auto_context` omits the automatic sibling-artifact index; the call's flag reaches the engine's port. */
describe('delegate — suppress_auto_context (REQ-TOOLS-152)', () => {
  function capture() {
    const seen: Parameters<DelegationPort['delegate']>[1][] = [];
    const port: DelegationPort = {
      delegate: async (_parent, req) => { seen.push(req); return { status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.' }; },
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
    };
    return { seen, tool: delegateTool(port, 'root:1', BUILT_IN_CATALOGUE) };
  }
  const ctx = {} as ToolContext;

  it('REQ-TOOLS-152: a call that sets it carries it to the port; one that leaves it at its default (false) carries nothing', async () => {
    const { seen, tool } = capture();
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'quiet', task: 'TASK: x', suppress_auto_context: true }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'plain', task: 'TASK: y' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'off', task: 'TASK: z', suppress_auto_context: false }), ctx);
    expect(seen[0]!.suppressAutoContext).toBe(true);
    expect('suppressAutoContext' in seen[1]!).toBe(false);
    expect('suppressAutoContext' in seen[2]!).toBe(false);
  });
});

/**
 * PD-ORCH-005 clause 22 / PD-TOOLS-006 revision 3: `session_id` names a settled child of the caller, which the follow-up
 * resumes from its record with the call's `task` as its next user message. The tool carries the id to the engine's port.
 */
describe('delegate — session_id (REQ-TOOLS-152, PD-ORCH-005 clause 22)', () => {
  function capture() {
    const seen: Parameters<DelegationPort['delegate']>[1][] = [];
    const port: DelegationPort = {
      delegate: async (_parent, req) => { seen.push(req); return { status: 'queued', canonicalName: req.taskName, taskId: req.sessionId ?? 'bg_00000002', message: 'Accepted.' }; },
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
    };
    return { seen, tool: delegateTool(port, 'root:1', BUILT_IN_CATALOGUE) };
  }
  const ctx = {} as ToolContext;

  it('REQ-TOOLS-152: a call that names a session_id carries it to the port; one that names none carries nothing', async () => {
    const { seen, tool } = capture();
    const followUp = await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'build', task: 'TASK: and the tests?', session_id: 'bg_00000001' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'fresh', task: 'TASK: other' }), ctx);
    expect(seen[0]!.sessionId).toBe('bg_00000001');
    expect('sessionId' in seen[1]!).toBe(false);
    // The observation names the task id the follow-up resumed: the child's own.
    expect(followUp.text).toContain('task_id: bg_00000001');
  });

  it('tells the model what the argument does', () => {
    expect(capture().tool.description).toMatch(/session_id/);
  });
});

/*
 * PD-TOOLS-006 revision 4 (OQ-216, ruled 2026-10-07 under R-072): `delegate`'s description states, for the caller, what each
 * persona's tools let it do. It named the built-in personas only, and in both duress live runs of 2026-10-06 the coordinator
 * briefed `docs-writer` children, which hold no terminal, to run the tests themselves
 * (docs/defects/fixed/the-coordinator-is-not-told-which-personas-hold-a-terminal-or-a-file-tool.md).
 */
describe('delegate — what each persona can do (PD-TOOLS-006 revision 4)', () => {
  const port: DelegationPort = {
    delegate: async (_parent, req) => ({ status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.' }),
    backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
    waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
  };
  const description = (catalogue: DelegateCatalogue = BUILT_IN_CATALOGUE): string => delegateTool(port, 'root:1', catalogue).description;

  it.each<[string, string]>([
    ['docs-writer', 'docs-writer (reads workspace files, writes workspace files)'],
    ['tester', 'tester (reads workspace files, writes workspace files, runs commands)'],
    ['coding-agent', 'coding-agent (reads workspace files, writes workspace files, runs commands)'],
    ['refactorer', 'refactorer (reads workspace files, writes workspace files, runs commands)'],
    ['verifier', 'verifier (reads workspace files, runs commands)'],
    ['ui-verifier', 'ui-verifier (reads workspace files, runs commands)'],
    ['codebase-analyst', 'codebase-analyst (reads workspace files)'],
    ['librarian', 'librarian (reads workspace files)'],
    ['architect', 'architect (reads workspace files)'],
    ['planner', 'planner (reads workspace files)'],
    ['requirements-engineer', 'requirements-engineer (reads workspace files)'],
    ['gatekeeper', 'gatekeeper (reads workspace files)'],
  ])('the built-in table: %s', (_name, line) => {
    expect(description()).toContain(line);
  });

  it('names each alias with its target', () => {
    expect(description()).toContain('Aliases: coder (coding-agent), playwright (ui-verifier).');
  });

  it('says so of a persona whose tools declare none of the three facets, and counts no tool outside the registry', () => {
    expect(grantFacets(['todo', 'fetch', 'artifact_read', 'lookup', 'mcp__srv__edit'])).toEqual([]);
    const text = renderDelegateCatalogue({ personas: [{ name: 'scribe', tools: ['todo', 'lookup'] }], aliases: [] });
    expect(text).toContain('scribe (none of these: it neither reads nor writes workspace files nor runs commands)');
    expect(text).not.toContain('Aliases:');
  });

  it('follows the catalogue it is given — a configured persona, and a persona whose grant the controls narrowed', () => {
    const text = description({ personas: [{ name: 'docs-writer', tools: ['read_file', 'grep'] }, { name: 'release-manager', tools: ['git_read', 'git_commit', 'terminal'] }], aliases: [] });
    expect(text).toContain('docs-writer (reads workspace files);');
    expect(text).toContain('release-manager (reads workspace files, writes workspace files, runs commands).');
    // The static list it replaced is gone: a persona the catalogue does not hold is not named.
    expect(text).not.toContain('codebase-analyst');
    expect(text).not.toContain('aliases coder, playwright');
  });

  it('closes the catalogue with the instruction to ask a persona only for work its tools allow, and how to hand command output on', () => {
    const text = description();
    expect(text).toContain("(tool-server and plugin tools are not described)");
    expect(text).toContain('Ask a persona only for work its tools allow: a persona that does not run commands cannot run tests, builds or scripts, and one that does not write workspace files cannot change a file.');
    expect(text).toContain('Where a persona that runs no commands needs command output, delegate the command to a persona that runs commands and hand its result on with depends_on or inherited_context.');
  });

  it('keeps the sentences after the persona list word for word', () => {
    const text = description();
    expect(text).toContain('Write the task with the sections TASK, EXPECTED OUTCOME, MUST DO, MUST NOT DO, CONTEXT. Returns at once with a task_id; the child runs in the background unless run_in_background is false.');
    expect(text).toContain('When the child will write files, give write_scope: path globs relative to the workspace root (for example src/api/**); while the child runs, no other agent of this run may write into those paths with write_file or haet_edit.');
    expect(text).toContain("When a child's report makes a continuation offer, give continuation_of: that child's task_id, to delegate the remaining work as its continuation. A continuation starts with no memory of the child it continues: write its task as a complete brief of what was asked, what that child did and found, and what remains.");
    expect(text).toContain('To ask a child of yours that has ended something more, give session_id: its task_id — it resumes its own conversation with task as its next message and reports again; a child cut off by its time limit is continued with continuation_of instead.');
  });
});
