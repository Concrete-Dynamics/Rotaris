import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BUILT_IN_ROLE_NAMES, BUILT_IN_ROLE_TOOLS, isDelegationTarget, ROLE_SPAWN_ALIASES } from '@rotaris/contracts';
import { expandDeclared } from '../registry.js';
import { attachmentWarnings, delegateTool, grantFacets, HAND_OFF_SENTENCE, handOffWarnings, renderDelegateCatalogue, REPORT_ARTIFACT_SENTENCE, TODO_ITEM_MARK_SENTENCE, TODO_ITEM_SENTENCE, WRITE_SCOPE_FIELD_SENTENCE, WRITE_SCOPE_SENTENCE, type AttachmentReport, type DelegateCatalogue, type DelegationPort, type HandOffReport } from './delegation.js';
import type { ToolContext } from './types.js';

/**
 * The built-in table's declarations as the catalogue would carry them for a child of an unrestricted caller: every role but
 * the coordinator-only orchestrator is granted what it declares (the run host's `resolveAgentGrant` is what decides it in
 * the product; `tools.test.ts` holds the two equal).
 */
const BUILT_IN_CATALOGUE: DelegateCatalogue = {
  // OQ-228: `gatekeeper` is not a delegation target (REQ-ORCH-126), so the catalogue never carries it.
  personas: BUILT_IN_ROLE_NAMES.filter((n) => n !== 'orchestrator' && isDelegationTarget(n)).map((name) => ({ name, tools: expandDeclared(BUILT_IN_ROLE_TOOLS[name]) })),
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
    // PD-TOOLS-006 revision 8 (OQ-250): the brief clause. In the duress run at a68f121 a brief offered `node --test` to a
    // docs-writer, which holds no terminal (call 114), and the child called a tool that does not exist (call 164).
    expect(text).toContain('Ask a persona only for work its tools allow, and never write in a brief that a command or tool its entry does not show is available to it: a persona that does not run commands cannot run tests, builds or scripts, and one that does not write workspace files cannot change a file.');
    expect(text).toContain('Where a persona that runs no commands needs command output, delegate the command to a persona that runs commands and hand its result on with depends_on or inherited_context.');
  });

  it('keeps the sentences after the persona list word for word', () => {
    const text = description();
    expect(text).toContain('Write the task with the sections TASK, EXPECTED OUTCOME, MUST DO, MUST NOT DO, CONTEXT. Returns at once with a task_id; the child runs in the background unless run_in_background is false.');
    // PD-TOOLS-006 revision 9 (OQ-257) replaced the write-scope sentence; its own case is below.
    expect(text).toContain("When a child's report makes a continuation offer, give continuation_of: that child's task_id, to delegate the remaining work as its continuation. A continuation starts with no memory of the child it continues: write its task as a complete brief of what was asked, what that child did and found, and what remains.");
    expect(text).toContain('To ask a child of yours that has ended something more, give session_id: its task_id — it resumes its own conversation with task as its next message and reports again; a child cut off by its time limit is continued with continuation_of instead.');
  });
});

/**
 * PD-TOOLS-006 revision 9 (OQ-256 and OQ-257, ruled 2026-10-13 under R-072): the write-scope sentence makes the persona the
 * condition of file work, the field carries its own description, the description says what each hand-off field carries, and
 * the observation names each hand-off answer cut under the budget.
 */
describe('delegate — PD-TOOLS-006 revision 9', () => {
  const port = (handOff?: HandOffReport): DelegationPort => ({
    delegate: async (_parent, req) => ({ status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.', ...(handOff ? { handOff } : {}) }),
    backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
    waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
  });
  const tool = (handOff?: HandOffReport) => delegateTool(port(handOff), 'root:1', BUILT_IN_CATALOGUE);
  const call = { persona: 'docs-writer', task_name: 'doc', task: 'TASK: write', depends_on: [], inherited_context: ['bg_0afe2a2a'], run_in_background: true, attach_artifacts: [], suppress_auto_context: false, write_scope: [] };

  it('the write-scope sentence ties file work to a persona whose entry writes workspace files, and says any other is refused', () => {
    expect(WRITE_SCOPE_SENTENCE).toBe('Work that writes files goes to a persona whose entry above writes workspace files; give that child write_scope: path globs relative to the workspace root (for example src/api/**); while the child runs, no other agent of this run may write into those paths with write_file or haet_edit. A write_scope given to any other persona is refused and nothing is started.');
    const text = tool().description;
    expect(text).toContain(WRITE_SCOPE_SENTENCE);
    expect(text).not.toContain('When the child will write files, give write_scope');
  });

  it('the offered schema gives write_scope its own description', () => {
    const schema = z.toJSONSchema(tool().schema, { io: 'input' }) as { properties: Record<string, { description?: string }> };
    expect(schema.properties['write_scope']?.description).toBe("The paths this child will write; only a persona whose entry in delegate's list writes workspace files may be given them.");
    expect(WRITE_SCOPE_FIELD_SENTENCE).toBe(schema.properties['write_scope']?.description);
  });

  it('neither write-scope text names a persona of the vocabulary: the facts are the catalogue\'s', () => {
    for (const name of [...BUILT_IN_ROLE_NAMES, ...Object.keys(ROLE_SPAWN_ALIASES)]) {
      expect(WRITE_SCOPE_SENTENCE).not.toMatch(new RegExp(`\\b${name}\\b`));
      expect(WRITE_SCOPE_FIELD_SENTENCE).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('the description says what each hand-off field carries, with the budget', () => {
    expect(HAND_OFF_SENTENCE).toBe('depends_on and inherited_context each carry the whole answer of every task they name, up to 100,000 characters per field (a longer answer is cut, and both you and the child are told); attach_artifacts carries artifact bodies.');
    expect(tool().description).toContain(`${WRITE_SCOPE_SENTENCE} ${HAND_OFF_SENTENCE} When a child's report`);
  });

  it('names each inherited answer cut and each forecast dependency cut, beside the attachment warning', async () => {
    const handOff: HandOffReport = { inherited: [{ taskId: 'bg_0afe2a2a', name: 'e1', given: 100_000, omitted: 24_330 }], dependsOn: [{ taskId: 'bg_00000009', name: 'f1', given: 4_000, omitted: 1 }], budget: 100_000 };
    expect(handOffWarnings(handOff)).toEqual([
      'The inherited answer of e1 (bg_0afe2a2a) is longer than the 100,000-character hand-off budget allows: the child is given 100000 characters of it and 24330 are omitted; the child is told, and nothing it can reach holds the rest.',
      'As the reports stand now, the answer of f1 (bg_00000009), which this child depends on, will reach it cut to 4000 characters under the 100,000-character hand-off budget, 1 omitted; the child is told.',
    ]);
    const r = await tool(handOff).execute(call, {} as ToolContext);
    expect(r.text).toBe(`Task 'doc': queued — Accepted. ${handOffWarnings(handOff).join(' ')}\ntask_id: bg_00000002`);
    expect((await tool().execute(call, {} as ToolContext)).text).toBe("Task 'doc': queued — Accepted.\ntask_id: bg_00000002");
  });
});

/**
 * PD-TOOLS-006 revision 10 (OQ-334, ruled 2026-10-15 under R-072): `delegate` says that the run keeps every ended child's report as a
 * `child_report` artifact, where the caller's run holds a store, and the catalogue names "publishes artifacts" on an entry whose
 * resolved grant holds `artifact_write`. Before it a coordinator briefed a codebase-analyst to publish an artifact it holds no tool
 * for, and the child invented `artifact_write` (finding F10, the default live run at 3c03287, d0c3a7f0 #5 and #10).
 */
describe('delegate — PD-TOOLS-006 revision 10 (OQ-334)', () => {
  const port: DelegationPort = {
    delegate: async (_parent, req) => ({ status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.' }),
    backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
    waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
  };

  it('(red) the report-artifact sentence follows the hand-off sentence verbatim where the run holds an artifact store, and names no persona', () => {
    expect(REPORT_ARTIFACT_SENTENCE).toBe('When a child ends, the run keeps its report as an artifact of kind child_report, which artifact_list shows and attach_artifacts hands on; ask a child for its findings in its report, and ask it to publish an artifact only where its entry says it publishes artifacts.');
    const text = delegateTool(port, 'root:1', BUILT_IN_CATALOGUE, { artifactStore: true }).description;
    expect(text).toContain(`${WRITE_SCOPE_SENTENCE} ${HAND_OFF_SENTENCE} ${REPORT_ARTIFACT_SENTENCE} When a child's report`);
    for (const name of [...BUILT_IN_ROLE_NAMES, ...Object.keys(ROLE_SPAWN_ALIASES)]) expect(REPORT_ARTIFACT_SENTENCE).not.toMatch(new RegExp(`\\b${name}\\b`));
    // A run with no artifact store keeps no report artifact, so its caller is not told of one.
    expect(delegateTool(port, 'root:1', BUILT_IN_CATALOGUE).description).not.toContain(REPORT_ARTIFACT_SENTENCE);
    expect(delegateTool(port, 'root:1', BUILT_IN_CATALOGUE, { artifactStore: false }).description).toContain(`${HAND_OFF_SENTENCE} When a child's report`);
  });

  it('(red) an entry whose resolved grant holds artifact_write reads "publishes artifacts"; the same entry without it does not', () => {
    const publishing = renderDelegateCatalogue({ personas: [{ name: 'release-manager', tools: ['read_file', 'artifact_read', 'artifact_list', 'artifact_write'] }, { name: 'herald', tools: ['artifact_write'] }], aliases: [] });
    expect(publishing).toContain('release-manager (reads workspace files, publishes artifacts);');
    // A grant whose only reach is publishing states that alone, not "none of these".
    expect(publishing).toContain('herald (publishes artifacts).');
    const withheld = renderDelegateCatalogue({ personas: [{ name: 'release-manager', tools: ['read_file', 'artifact_read', 'artifact_list'] }], aliases: [] });
    expect(withheld).toContain('release-manager (reads workspace files).');
    expect(withheld).not.toContain('publishes artifacts');
  });

  it('(OQ-212) no built-in persona\'s entry reads "publishes artifacts"', () => {
    const text = renderDelegateCatalogue(BUILT_IN_CATALOGUE);
    for (const p of BUILT_IN_CATALOGUE.personas) expect({ name: p.name, publishes: p.tools.includes('artifact_write') }).toEqual({ name: p.name, publishes: false });
    expect(text).not.toContain('publishes artifacts');
  });
});

/**
 * PD-TOOLS-006 revision 5 (OQ-221, ruled 2026-10-07 under R-072; REQ-TOOLS-152, REQ-TOOLS-153): the observation states what
 * the child is GIVEN of its attachments — never the references that resolved before the budget applied.
 */
describe('delegate — the attachment warning (PD-TOOLS-006 revision 5)', () => {
  const report = (over: Partial<AttachmentReport> = {}): AttachmentReport => ({ given: 0, elidedForSize: [], unresolved: [], unreadable: [], budget: 100_000, ...over });
  function observed(attachments: AttachmentReport) {
    const port: DelegationPort = {
      delegate: async (_parent, req) => ({ status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.', attachments }),
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
    };
    const tool = delegateTool(port, 'root:1', BUILT_IN_CATALOGUE);
    return tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'build', task: 'TASK: build', attach_artifacts: ['a'] }), {} as ToolContext);
  }

  it('states how many attachments the child is given whole', () => {
    expect(attachmentWarnings(report({ given: 2 }))).toEqual(['2 attached artifacts will be given to the child whole.']);
    expect(attachmentWarnings(report({ given: 1 }))).toEqual(['1 attached artifact will be given to the child whole.']);
    expect(attachmentWarnings(report({ given: 0, unresolved: ['ghost'] }))[0]).toBe('No attached artifact will be given to the child.');
  });

  it('names each id left out for size, cites the 100,000-character budget, and says the child is told and can read it', () => {
    expect(attachmentWarnings(report({ given: 1, elidedForSize: ['art_00000002', 'art_00000003'] }))[1]).toBe(
      '2 attached artifacts were left out for size, because each whole body would carry the 100,000-character attachment budget past its limit: art_00000002, art_00000003; the child is told and can fetch them with artifact_read.',
    );
    expect(attachmentWarnings(report({ elidedForSize: ['art_00000002'] }))[1]).toContain('1 attached artifact was left out for size, because its whole body would carry the 100,000-character');
  });

  it('names the references that could not be resolved and the ids whose document could not be read', () => {
    expect(attachmentWarnings(report({ given: 1, unresolved: ['ghost', 'gone'], unreadable: ['art_00000004'] }))).toEqual([
      '1 attached artifact will be given to the child whole.',
      '2 attachments could not be resolved: ghost, gone.',
      'The document of 1 attached artifact could not be read: art_00000004.',
    ]);
  });

  it('the observation carries the warning after the message, and no longer says the artifacts "were attached to its context"', async () => {
    const r = await observed(report({ given: 1, elidedForSize: ['art_00000002'] }));
    expect(r.text).toMatch(/^Task 'build': queued — Accepted\. 1 attached artifact will be given to the child whole\. 1 attached artifact was left out for size, .*: art_00000002; the child is told and can fetch it with artifact_read\.\ntask_id: bg_00000002$/);
    expect(r.text).not.toContain('attached to its context');
  });
});

/** PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under R-072): `todo_item` names the item of the caller's plan a delegation serves. */
describe('delegate — todo_item (PD-TOOLS-006 revision 6)', () => {
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

  it('carries the named id to the port trimmed, and omits the field when the call names none or an empty one', async () => {
    const { seen, tool } = capture();
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'a', task: 'TASK: a', todo_item: ' 0a1b2c3d ' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'b', task: 'TASK: b' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'c', task: 'TASK: c', todo_item: '' }), ctx);
    expect(seen[0]!.todoItem).toBe('0a1b2c3d');
    expect('todoItem' in seen[1]!).toBe(false);
    expect('todoItem' in seen[2]!).toBe(false);
  });

  it('the description says what todo_item names, when it is required, and to write the list in one step and delegate in the next', () => {
    const { tool } = capture();
    expect(tool.description).toContain(` ${TODO_ITEM_SENTENCE} `);
    expect(TODO_ITEM_SENTENCE).toBe("Give todo_item: the id of the item of your todo list this delegation serves, as the todo tool's last result shows it. Once you keep a todo list, every delegation to a persona that writes workspace files names an open item, and no two such delegations hold one item at once. Write the list in one step and delegate in the next: an item's id exists only once the todo call has returned.");
  });
});

/**
 * PD-TOOLS-006 revision 7 (OQ-249, ruled 2026-10-07 under R-072): an admitted delegation marks its PENDING item IN_PROGRESS in the
 * caller's plan, before any foreground wait, and the observation says so and carries the Todo state.
 */
describe('delegate — the admitted item is marked (PD-TOOLS-006 revision 7)', () => {
  const ctx = {} as ToolContext;
  function capture(result: Awaited<ReturnType<DelegationPort['delegate']>>, order: string[] = []) {
    const port: DelegationPort = {
      delegate: async () => result,
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => { order.push('wait'); return { immediate: true, requested: 1, text: 'done' }; },
    };
    const marks: string[] = [];
    const tool = delegateTool(port, 'root:1', BUILT_IN_CATALOGUE, { markItem: (item) => { marks.push(item); order.push('mark'); return { sentence: `Todo item tests (${item}) is now IN_PROGRESS.`, state: 'Todo state:\nPhase main (p)' }; } });
    return { tool, marks };
  }

  it('an admitted delegation carrying its item has it marked, and the observation states it after the message and appends the Todo state', async () => {
    const { tool, marks } = capture({ status: 'queued', canonicalName: 'tests', taskId: 'bg_00000002', message: 'Accepted.', todoItem: '0a1b2c3d' });
    const r = await tool.execute(tool.schema.parse({ persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: '0a1b2c3d' }), ctx);
    expect(marks).toEqual(['0a1b2c3d']);
    expect(r.text).toBe("Task 'tests': queued — Accepted. Todo item tests (0a1b2c3d) is now IN_PROGRESS.\ntask_id: bg_00000002\n\nTodo state:\nPhase main (p)");
  });

  it('a rejected delegation, and an admitted one with no item, mark nothing', async () => {
    const rejected = capture({ status: 'rejected', canonicalName: 'tests', message: 'no' });
    await rejected.tool.execute(rejected.tool.schema.parse({ persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: '0a1b2c3d' }), ctx);
    expect(rejected.marks).toEqual([]);
    const unnamed = capture({ status: 'queued', canonicalName: 'tests', taskId: 'bg_00000002', message: 'Accepted.' });
    const r = await unnamed.tool.execute(unnamed.tool.schema.parse({ persona: 'tester', task_name: 'tests', task: 'TASK: t' }), ctx);
    expect(unnamed.marks).toEqual([]);
    expect(r.text).not.toContain('Todo state');
  });

  it('a foreground delegation marks its item before it waits for the child', async () => {
    const order: string[] = [];
    const { tool } = capture({ status: 'queued', canonicalName: 'tests', taskId: 'bg_00000002', message: 'Accepted.', todoItem: '0a1b2c3d' }, order);
    await tool.execute(tool.schema.parse({ persona: 'tester', task_name: 'tests', task: 'TASK: t', todo_item: '0a1b2c3d', run_in_background: false }), ctx);
    expect(order).toEqual(['mark', 'wait']);
  });

  it('the description ends with the marking sentence', () => {
    const { tool } = capture({ status: 'rejected', canonicalName: 'x', message: 'x' });
    expect(tool.description.endsWith(` ${TODO_ITEM_MARK_SENTENCE}`)).toBe(true);
  });
});

/** OQ-229 (ruled 2026-10-07 under R-072): a caller whose `delegates_to` narrowed its catalogue is told so. */
describe('delegate — a narrowed catalogue (OQ-229, REQ-CONFIG-101)', () => {
  it('says the list is narrowed and that any other persona is refused, or that it leaves no persona; an unnarrowed list says neither', () => {
    const narrowed = renderDelegateCatalogue({ personas: [{ name: 'tester', tools: ['read_file', 'terminal'] }], aliases: [], narrowedBy: ['tester'] });
    expect(narrowed).toContain('tester (reads workspace files, runs commands). Your delegates_to (tester) narrows this list: a delegation to any other persona is refused. Ask a persona only');
    expect(renderDelegateCatalogue({ personas: [], aliases: [], narrowedBy: ['gatekeeper'] })).toBe('You can delegate to no persona. Your delegates_to (gatekeeper) leaves you no persona to delegate to: every delegation is refused.');
    expect(renderDelegateCatalogue(BUILT_IN_CATALOGUE)).not.toContain('delegates_to');
    expect(renderDelegateCatalogue(BUILT_IN_CATALOGUE)).not.toContain('gatekeeper');
  });
});
