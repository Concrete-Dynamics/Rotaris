import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage, ModelRequest, ToolSpec } from '@rotaris/model';
import { rebuild } from '@rotaris/engine';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileLedger, latestScriptedPlan, memoryLedger, scriptedClient, scriptedTodoItem } from './scripted-client.js';

/*
 * The scripted client is verification only; these tests pin the step it takes, which is what a driven proof scripts
 * against. PD-ORCH-005 resumes an agent from its own record, and the double must carry on from there rather than take
 * its script from the first step again (the repair of the-scripted-client-restarts-its-script-for-every-run.md).
 */
const TOOLS: readonly ToolSpec[] = ['glob', 'read_file', 'write_file', 'terminal'].map((name) => ({ name, description: name, parameters: {} }));
const CHILD_SYSTEM = 'You are the coder.';
const ORCHESTRATOR_SYSTEM = 'You are the orchestrator of this workspace.';

const text = (role: 'system' | 'user', t: string): ChatMessage => ({ role, content: [{ kind: 'text', text: t }] });
const step = (callId: string, name: string): ChatMessage[] => [
  { role: 'assistant', content: [{ kind: 'text', text: `Calling ${name}. ` }, { kind: 'tool-call', callId, name, args: '{}' }] },
  { role: 'tool', content: [{ kind: 'tool-result', callId, name, result: 'ok', isError: false }] },
];
const request = (messages: readonly ChatMessage[], signal: AbortSignal = new AbortController().signal): ModelRequest => ({
  model: { providerId: 'scripted', modelId: 'scripted', dialect: 'chat' }, messages, thinking: 'unset', signal,
  timeoutMs: 1_000, retries: 0, resolveCredential: async () => '', tools: TOOLS,
});
const settled = () => new Promise<undefined>((resolve) => { setImmediate(() => resolve(undefined)); });
/** The tool the call asked for, `answer` when it streamed a reply instead, or the failure it answered with. */
async function taken(clock: FakeClock, client: ReturnType<typeof scriptedClient>, messages: readonly ChatMessage[]): Promise<string> {
  const parts = client.stream(request(messages))[Symbol.asyncIterator]();
  for (;;) {
    const next = parts.next();
    let r = await Promise.race([next, settled()]);
    // The streamed reply paces its words on the clock port; the fake clock is moved on until the part arrives.
    while (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
    if (r.done === true) return 'answer';
    const part = r.value;
    if (!part.ok) return `failed:${part.error.headline}`;
    if (part.value.kind === 'tool-call') { await parts.return?.(); return part.value.name; }
    if (part.value.kind === 'text' && part.value.delta.startsWith('I ')) { await parts.return?.(); return 'answer'; }
  }
}

/** Every tool call one step streams, in order, with its arguments. */
async function calls(client: ReturnType<typeof scriptedClient>, messages: readonly ChatMessage[]): Promise<{ name: string; args: string }[]> {
  const out: { name: string; args: string }[] = [];
  for await (const part of client.stream(request(messages))) if (part.ok && part.value.kind === 'tool-call') out.push({ name: part.value.name, args: part.value.argsDelta });
  return out;
}

describe('scriptedClient — `reads4` (fin32, PD-ORCH-016; part-h-proof\'s raw-count fallback launches)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('`reads4:varied` reads four different files in one step; `reads4:same` reads one file four times', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'reads4:varied');
    const varied = await calls(scriptedClient(new FakeClock(), () => undefined), [text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]);
    expect(varied.map((c) => c.name)).toEqual(['read_file', 'read_file', 'read_file', 'read_file']);
    expect(new Set(varied.map((c) => c.args)).size).toBe(4);
    vi.stubEnv('ROTARIS_SCRIPT', 'reads4:same');
    const same = await calls(scriptedClient(new FakeClock(), () => undefined), [text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]);
    expect(same.map((c) => c.args)).toEqual(Array(4).fill(JSON.stringify({ path: 'README.md' })));
  });
});

describe('scriptedClient — the step a call takes', () => {
  let clock: FakeClock;
  beforeEach(() => { clock = new FakeClock(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  /*
   * OQ-213 (REQ-ORCH-029): the run refuses a coordinator's second work item until it has written a todo list of its own, so a
   * proof whose scripted coordinator delegates more than once opens with `plan` — one `todo` replace whose single item is
   * already complete, which the run counts as the list and REQ-ORCH-075 holds nothing open by.
   */
  it('`plan` writes a todo list of one completed item', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'plan,answer');
    const client = scriptedClient(clock, () => {});
    const parts = client.stream({ ...request([text('system', ORCHESTRATOR_SYSTEM), text('user', 'delegate twice')]), tools: [...TOOLS, { name: 'todo', description: 'todo', parameters: {} }] })[Symbol.asyncIterator]();
    let call: { name: string; argsDelta: string } | null = null;
    for (let r = await parts.next(); r.done !== true; r = await parts.next()) {
      if (r.value.ok && r.value.value.kind === 'tool-call') call = r.value.value;
    }
    expect(call?.name).toBe('todo');
    expect(JSON.parse(call!.argsDelta)).toEqual({ operation: 'replace', phases: [{ name: 'Scripted plan', tasks: [{ name: 'The scripted work', description: 'Delegated by the scripted coordinator.', state: 'COMPLETED' }] }] });
  });

  /*
   * PD-TOOLS-007 (`docs/defects/fixed/the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md`): the shape
   * the directive governs is a `write_file` that names a path and content and no operation, which `write` never sent.
   */
  it('`writeinfer` writes a file with a path and content and no operation; `write` names its operation', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'writeinfer');
    const inferred = await calls(scriptedClient(clock, () => {}), [text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]);
    expect(inferred.map((c) => c.name)).toEqual(['write_file']);
    expect(JSON.parse(inferred[0]!.args)).toEqual({ path: 'INFERRED.md', content: 'inferred-ok\n' });
    vi.stubEnv('ROTARIS_SCRIPT', 'write');
    const named = await calls(scriptedClient(clock, () => {}), [text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]);
    expect(JSON.parse(named[0]!.args)).toMatchObject({ operation: 'create' });
  });

  /*
   * Finding D8 of the final duress run at a68f121: the renderer threw React error 185 while two children streamed minutes of
   * reasoning. `think:<deltas>:<ms>` is the scripted producer of that stream — that many reasoning deltas, one every <ms> on
   * the clock port, then the answer — so a drive can put two long deliberations on screen at once.
   */
  it('`think:<deltas>:<ms>` streams that many reasoning deltas on the clock, then answers', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'think:3:500');
    const client = scriptedClient(clock, () => {});
    const parts = client.stream(request([text('system', CHILD_SYSTEM), text('user', 'TASK: think long')]))[Symbol.asyncIterator]();
    const kinds: string[] = [];
    for (;;) {
      const next = parts.next();
      let r = await Promise.race([next, settled()]);
      while (r === undefined) { clock.advance(500); r = await Promise.race([next, settled()]); }
      if (r.done === true) break;
      if (r.value.ok) kinds.push(r.value.value.kind);
    }
    expect(kinds).toEqual(['reasoning', 'reasoning', 'reasoning', 'text', 'usage', 'finish']);
  });

  /*
   * PD-ORCH-015 (OQ-225): `part-h-proof`'s plan-correction launch scripts a coordinator that answers beside a plan whose
   * report item is PENDING (`planopen`) and records it done when corrected (`plandone`).
   */
  it('`planopen` leaves the report item pending and `plandone` records it complete', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'planopen,plandone');
    const client = scriptedClient(clock, () => {});
    const states: string[][] = [];
    for (let step = 0; step < 2; step++) {
      const parts = client.stream({ ...request([text('system', ORCHESTRATOR_SYSTEM), text('user', 'do the work and report it')]), tools: [...TOOLS, { name: 'todo', description: 'todo', parameters: {} }] })[Symbol.asyncIterator]();
      for (let r = await parts.next(); r.done !== true; r = await parts.next()) {
        if (r.value.ok && r.value.value.kind === 'tool-call') {
          expect(r.value.value.name).toBe('todo');
          const args = JSON.parse(r.value.value.argsDelta) as { operation: string; phases: { tasks: { state: string }[] }[] };
          expect(args.operation).toBe('replace');
          states.push(args.phases.flatMap((p) => p.tasks.map((t) => t.state)));
        }
      }
    }
    expect(states).toEqual([['COMPLETED', 'PENDING'], ['COMPLETED', 'COMPLETED']]);
  });

  /*
   * PD-TOOLS-006 revision 3's `session_id` and PD-ORCH-005 clause 22 (`delegation-proof`'s follow-up launch): a
   * `delegate:<persona>:<name>:followup` step follows up the child the last tool result named, with a task of its own.
   */
  it('`delegate:<persona>:<name>:followup` follows up the last task id with a FOLLOW-UP task and no depends_on', async () => {
    // The record below holds one step of the root's, so the step this call takes is the script's second.
    vi.stubEnv('ROTARIS_SCRIPT', 'delegate:codebase-analyst:probe,delegate:codebase-analyst:probe:followup');
    const client = scriptedClient(clock, () => {});
    const delegating = [...TOOLS, { name: 'delegate', description: 'delegate', parameters: {} }];
    const reported: ChatMessage[] = [
      { role: 'assistant', content: [{ kind: 'text', text: 'Delegating. ' }, { kind: 'tool-call', callId: 'd1', name: 'delegate', args: '{}' }] },
      { role: 'tool', content: [{ kind: 'tool-result', callId: 'd1', name: 'delegate', result: 'Delegated. task_id: bg_0123abcd', isError: false }] },
    ];
    const parts = client.stream({ ...request([text('system', ORCHESTRATOR_SYSTEM), text('user', 'probe it'), ...reported]), tools: delegating })[Symbol.asyncIterator]();
    let call: { name: string; argsDelta: string } | null = null;
    for (let r = await parts.next(); r.done !== true; r = await parts.next()) if (r.value.ok && r.value.value.kind === 'tool-call') call = r.value.value;
    const args = JSON.parse(call!.argsDelta) as Record<string, unknown>;
    expect(args).toMatchObject({ persona: 'codebase-analyst', task_name: 'probe', session_id: 'bg_0123abcd' });
    expect(String(args['task'])).toMatch(/^FOLLOW-UP: probe\n/);
    expect(args['depends_on']).toBeUndefined();
  });

  /*
   * The capture a proof reads (`ROTARIS_CAPTURE_MODEL_REQUESTS`): the delegate tool's description, which carries a
   * `delegates_to` narrowing (OQ-229), and the call's first user message, which carries a continuation's handoff.
   */
  it('records the delegate tool\'s description and the first user message of each call', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'glob,glob');
    const seen: { delegateDescription: string | null; firstUser: string }[] = [];
    const client = scriptedClient(clock, () => {}, (r) => { seen.push({ delegateDescription: r.delegateDescription, firstUser: r.firstUser }); });
    await taken(clock, client, [text('system', ORCHESTRATOR_SYSTEM), text('user', 'Artifact: art_x — edited')]);
    expect(seen[0]).toEqual({ delegateDescription: null, firstUser: 'Artifact: art_x — edited' });
    const parts = client.stream({ ...request([text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]), tools: [...TOOLS, { name: 'delegate', description: 'Your delegates_to (codebase-analyst) narrows this list', parameters: {} }] })[Symbol.asyncIterator]();
    await parts.next();
    await parts.return?.();
    expect(seen[1]?.delegateDescription).toBe('Your delegates_to (codebase-analyst) narrows this list');
  });

  /*
   * PD-ORCH-009 revisions 1 and 2 (fin42): `part-h-proof`'s `answerless` launches script a root that ends its turn with neither
   * text nor a tool call, which the run asks once more for an answer, and `silent,report` one that answers when asked.
   */
  it('`silent` ends the call `stop` with neither text nor a tool call, and the next step answers', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'silent,report');
    const client = scriptedClient(clock, () => {});
    const kinds: string[] = [];
    let reason: string | null = null;
    for await (const part of client.stream(request([text('system', ORCHESTRATOR_SYSTEM), text('user', 'say nothing')]))) {
      if (!part.ok) throw new Error(part.error.headline);
      kinds.push(part.value.kind);
      if (part.value.kind === 'finish') reason = part.value.reason;
    }
    expect(kinds).toEqual(['usage', 'finish']);
    expect(reason).toBe('stop');
    expect(await taken(clock, client, [text('system', ORCHESTRATOR_SYSTEM), text('user', 'say nothing'), { role: 'assistant', content: [] }, text('user', 'answer now')])).toBe('answer');
  });

  /*
   * PD-TOOLS-006 revision 5 (OQ-221): the artifacts proof attaches artifacts to a scripted delegation, so a named
   * `delegate:<persona>:<name>` step merges ROTARIS_SCRIPT_DELEGATE_ARGS' entry for that name into its arguments.
   */
  it('`delegate:<persona>:<name>` merges ROTARIS_SCRIPT_DELEGATE_ARGS\' entry for that name, and a name without one is unchanged', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'delegate:coding-agent:build,delegate:tester:check');
    vi.stubEnv('ROTARIS_SCRIPT_DELEGATE_ARGS', JSON.stringify({ build: { attach_artifacts: ['long-one', 'short-one'] } }));
    const client = scriptedClient(clock, () => {});
    const delegating = [...TOOLS, { name: 'delegate', description: 'delegate', parameters: {} }];
    const callOf = async (messages: readonly ChatMessage[]) => {
      const parts = client.stream({ ...request(messages), tools: delegating })[Symbol.asyncIterator]();
      let call: { name: string; argsDelta: string } | null = null;
      for (let r = await parts.next(); r.done !== true; r = await parts.next()) if (r.value.ok && r.value.value.kind === 'tool-call') call = r.value.value;
      return JSON.parse(call!.argsDelta) as Record<string, unknown>;
    };
    const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'build it')];
    const first = await callOf(root);
    expect(first).toMatchObject({ persona: 'coding-agent', task_name: 'build', attach_artifacts: ['long-one', 'short-one'] });
    const second = await callOf([...root, ...step('c1', 'delegate')]);
    expect(second).toMatchObject({ persona: 'tester', task_name: 'check' });
    expect('attach_artifacts' in second).toBe(false);
  });

  /*
   * PD-ORCH-004 revisions 3 and 4: continuation-proof's later roots take up an offer they were told of — in an offers list (a
   * handoff, a first message) or in a cut-off child's report — and never one they named already or were never told.
   */
  it('`continue:<persona>:<name>` delegates with `continuation_of` set to the newest offer told and not yet taken; with none it answers', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'continue:coding-agent:again,continue:coding-agent:again2,continue:coding-agent:again3');
    const client = scriptedClient(clock, () => {});
    const delegating = [...TOOLS, { name: 'delegate', description: 'delegate', parameters: {} }];
    const callOf = async (messages: readonly ChatMessage[]) => {
      const parts = client.stream({ ...request(messages), tools: delegating })[Symbol.asyncIterator]();
      let call: { name: string; argsDelta: string } | null = null;
      for (;;) {
        const next = parts.next();
        let r = await Promise.race([next, settled()]);
        // A streamed answer paces its words on the clock port; the fake clock is moved on until the part arrives.
        while (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
        if (r.done === true) break;
        if (r.value.ok && r.value.value.kind === 'tool-call') call = r.value.value;
      }
      return call === null ? null : JSON.parse(call.argsDelta) as Record<string, unknown>;
    };
    const handoff = text('user', 'Latest user request:\ngo on\nOpen continuation offers (delegate with `continuation_of` set to the task id to take one up):\n- alpha (bg_0000000a)\n- beta (bg_0000000b)');
    const first = await callOf([text('system', ORCHESTRATOR_SYSTEM), handoff]);
    expect(first).toMatchObject({ persona: 'coding-agent', task_name: 'again', continuation_of: 'bg_0000000b' });
    const taken: ChatMessage = { role: 'assistant', content: [{ kind: 'tool-call', callId: 'c1-s1', name: 'delegate', args: JSON.stringify(first) }] };
    const second = await callOf([text('system', ORCHESTRATOR_SYSTEM), handoff, taken, { role: 'tool', content: [{ kind: 'tool-result', callId: 'c1-s1', name: 'delegate', result: 'task_id: bg_0000000c', isError: false }] }]);
    expect(second).toMatchObject({ continuation_of: 'bg_0000000a' });
    // A conversation told of no offer — a task id merely mentioned is not one (`offersToldIn`) — answers instead.
    expect(await callOf([text('system', ORCHESTRATOR_SYSTEM), text('user', 'bg_0000000d was mentioned')])).toBeNull();
  });

  /*
   * PD-TOOLS-006 revision 6 (OQ-220): a coordinator that keeps a list names the item each implementation delegation serves. The
   * scripted coordinator writes `plan:<n>` open items, names the next open one at each delegation, and `done` completes them.
   */
  it('`plan:<n>` writes n open items; each delegation after it names the next one; `done` completes each with an update', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'plan:2,delegate:coding-agent:one,delegate:coding-agent:two,delegate:codebase-analyst:three,done');
    vi.stubEnv('ROTARIS_SCRIPT_DELEGATE_ARGS', JSON.stringify({ three: { todo_item: '@1' } }));
    const client = scriptedClient(clock, () => {});
    const tools = [...TOOLS, { name: 'todo', description: 'todo', parameters: {} }, { name: 'delegate', description: 'delegate', parameters: {} }];
    const callOf = async (messages: readonly ChatMessage[]) => {
      const parts = client.stream({ ...request(messages), tools })[Symbol.asyncIterator]();
      let call: { name: string; argsDelta: string } | null = null;
      for (let r = await parts.next(); r.done !== true; r = await parts.next()) if (r.value.ok && r.value.value.kind === 'tool-call') call = r.value.value;
      return { name: call!.name, args: JSON.parse(call!.argsDelta) as Record<string, unknown> };
    };
    const answered = (callId: string, name: string, args: Record<string, unknown>, result: string): ChatMessage[] => [
      { role: 'assistant', content: [{ kind: 'tool-call', callId, name, args: JSON.stringify(args) }] },
      { role: 'tool', content: [{ kind: 'tool-result', callId, name, result, isError: false }] },
    ];
    let messages: ChatMessage[] = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'build two things')];
    const plan = await callOf(messages);
    expect(plan).toEqual({ name: 'todo', args: { operation: 'replace', phases: [{ name: 'Scripted plan', tasks: [1, 2].map((i) => ({ name: `Scripted item ${i}`, description: 'Delegated by the scripted coordinator.', state: 'PENDING' })) }] } });
    messages = [...messages, ...answered('c1', 'todo', plan.args, 'Replaced the todo list: 1 phase, 2 tasks.\nTodo state:\nPhase Scripted plan (0000aaaa)\n  [PENDING] Scripted item 1 (0000000a) — Delegated by the scripted coordinator.\n  [PENDING] Scripted item 2 (0000000b) — Delegated by the scripted coordinator.')];
    const one = await callOf(messages);
    expect(one.args['todo_item']).toBe('0000000a');
    messages = [...messages, ...answered('c2', 'delegate', one.args, "Task 'one': queued — Accepted.\ntask_id: bg_00000001")];
    const two = await callOf(messages);
    expect(two.args['todo_item']).toBe('0000000b');
    // A refused delegation takes no item: the next one names the same item again.
    expect(scriptedTodoItem(latestScriptedPlan([...messages, ...answered('c3', 'delegate', two.args, "Task 'two': rejected — held")]), undefined)).toBe('0000000b');
    messages = [...messages, ...answered('c3', 'delegate', two.args, "Task 'two': queued — Accepted.\ntask_id: bg_00000002")];
    const three = await callOf(messages);
    expect(three.args['todo_item']).toBe('0000000a');
    messages = [...messages, ...answered('c4', 'delegate', three.args, "Task 'three': queued — Accepted.\ntask_id: bg_00000003")];
    // PD-TOOLS-006 revision 7 (OQ-249): the delegations marked their items IN_PROGRESS, which a replace would restore
    // (REQ-TOOLS-146), so `done` completes each open item with its own update, in one step.
    const parts = client.stream({ ...request(messages), tools })[Symbol.asyncIterator]();
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    for (let r = await parts.next(); r.done !== true; r = await parts.next()) if (r.value.ok && r.value.value.kind === 'tool-call') calls.push({ name: r.value.value.name, args: JSON.parse(r.value.value.argsDelta) as Record<string, unknown> });
    expect(calls).toEqual(['0000000a', '0000000b'].map((id) => ({ name: 'todo', args: { operation: 'update', task_id: id, state: 'COMPLETED' } })));
    // An entry's null names no item, and no plan names none.
    expect(scriptedTodoItem(latestScriptedPlan(messages), null)).toBeUndefined();
    expect(scriptedTodoItem(null, undefined)).toBeUndefined();
  });

  /*
   * PD-TOOLS-008 revision 3 (OQ-255): `donereplace` closes the plan the way a model usually does, one `replace` re-sending the
   * latest list whole by its ids with every task COMPLETED — the case revision 7's first execution had moved `done` off.
   */
  it('`donereplace` re-sends the latest list by its ids with every task COMPLETED, in one replace', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'plan:2,donereplace');
    const client = scriptedClient(clock, () => {});
    const tools = [...TOOLS, { name: 'todo', description: 'todo', parameters: {} }];
    const plan = 'Todo state:\nPhase Scripted plan (0000aaaa)\n  [IN_PROGRESS] Scripted item 1 (0000000a) — Delegated by the scripted coordinator.\n  [COMPLETED] Scripted item 2 (0000000b)';
    const messages: ChatMessage[] = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'close it'),
      { role: 'assistant', content: [{ kind: 'tool-call', callId: 'c1', name: 'todo', args: '{}' }] },
      { role: 'tool', content: [{ kind: 'tool-result', callId: 'c1', name: 'todo', result: `Replaced the todo list: 1 phase, 2 tasks.\n${plan}`, isError: false }] }];
    const parts = client.stream({ ...request(messages), tools })[Symbol.asyncIterator]();
    const calls: { name: string; args: unknown }[] = [];
    for (let r = await parts.next(); r.done !== true; r = await parts.next()) if (r.value.ok && r.value.value.kind === 'tool-call') calls.push({ name: r.value.value.name, args: JSON.parse(r.value.value.argsDelta) });
    expect(calls).toEqual([{ name: 'todo', args: { operation: 'replace', phases: [{ id: '0000aaaa', name: 'Scripted plan', tasks: [{ id: '0000000a', name: 'Scripted item 1', state: 'COMPLETED' }, { id: '0000000b', name: 'Scripted item 2', state: 'COMPLETED' }] }] } }]);
  });

  /*
   * The repair of fixed/the-scripted-clients-wait-prefix-is-spliced-out-of-the-list-every-child-shares.md: every child
   * shares ROTARIS_CHILD_SCRIPT, so a completed wait may not remove anything from it. Three children started together,
   * each scripted `wait:1000,read,glob`, each read after the wait and then glob — where the shared list's splices handed
   * the second and third child the steps after the first's, and none of them a glob.
   */
  it('a fan-out\'s children each take their own steps after a wait prefix, not each other\'s', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'wait:1000,read,glob');
    const client = scriptedClient(clock, () => {});
    const roots = ['a', 'b', 'c'].map((name) => [text('system', CHILD_SYSTEM), text('user', `TASK: ${name}\nEXPECTED OUTCOME: done`)]);
    const first = await Promise.all(roots.map((root) => answered(clock, client, root)));
    expect(first.map(nameOf)).toEqual(['read_file', 'read_file', 'read_file']);
    const second = await Promise.all(roots.map((root, i) => answered(clock, client, [...root, first[i]!, result(first[i]!)])));
    expect(second.map(nameOf)).toEqual(['glob', 'glob', 'glob']);
    // A child started after the others had waited waits too: the shared list still begins with the wait.
    const late = [text('system', CHILD_SYSTEM), text('user', 'TASK: d\nEXPECTED OUTCOME: done')];
    expect(await interrupted(clock, client, late)).toBe('failed:aborted');
  });

  it('`fail:401:only=<provider>` refuses that provider\'s calls alone; a call to another provider answers (REQ-NOTIFY-070\'s fallback restart)', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'fail:401:only=scripted');
    const ask = async (providerId: string): Promise<string> => {
      const client = scriptedClient(clock, () => {});
      const parts = client.stream({ ...request([text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]), model: { providerId, modelId: 'm', dialect: 'chat' } })[Symbol.asyncIterator]();
      for (;;) {
        const next = parts.next();
        let r = await Promise.race([next, settled()]);
        while (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
        if (r.done === true) return 'answer';
        if (!r.value.ok) return `failed:${r.value.error.headline}`;
      }
    };
    expect(await ask('scripted')).toBe('failed:scripted authentication failure (HTTP 401)');
    expect(await ask('scripted-b')).toBe('answer');
  });

  it('REQ-NOTIFY-074 (verification only): a fault scoped `:only=` to providers answers there, and answers as `answer` elsewhere', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'fail:401:only=scripted+scripted-b,fail:401:only=scripted+scripted-b,fail:401:only=scripted+scripted-b');
    const client = scriptedClient(clock, () => {});
    const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'hello')];
    const on = async (providerId: string): Promise<string> => {
      const parts = client.stream({ ...request(root), model: { providerId, modelId: providerId, dialect: 'chat' } })[Symbol.asyncIterator]();
      const next = parts.next();
      let first = await Promise.race([next, settled()]);
      // An answer paces its words on the clock port; the fake clock is moved on until its first part arrives.
      while (first === undefined) { clock.advance(200); first = await Promise.race([next, settled()]); }
      await parts.return?.();
      return first.done === true ? 'done' : first.value.ok ? 'answered' : `failed:${first.value.error.headline}`;
    };
    expect(await on('scripted')).toBe('failed:scripted authentication failure (HTTP 401)');
    expect(await on('scripted-b')).toBe('failed:scripted authentication failure (HTTP 401)');
    expect(await on('openai')).toBe('answered');
  });

  it('REQ-NOTIFY-076 (verification only): a fault `:unless-key=` answers until the call carries that credential', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'fail:401:unless-key=fresh-key,fail:401:unless-key=fresh-key');
    const client = scriptedClient(clock, () => {});
    const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'hello')];
    const withKey = async (key: string): Promise<string> => {
      const parts = client.stream({ ...request(root), resolveCredential: async () => key })[Symbol.asyncIterator]();
      const next = parts.next();
      let first = await Promise.race([next, settled()]);
      while (first === undefined) { clock.advance(200); first = await Promise.race([next, settled()]); }
      await parts.return?.();
      return first.done === true ? 'done' : first.value.ok ? 'answered' : `failed:${first.value.error.headline}`;
    };
    expect(await withKey('stale-key')).toBe('failed:scripted authentication failure (HTTP 401)');
    expect(await withKey('fresh-key')).toBe('answered');
  });

  it('PD-ORCH-005: a fresh agent takes its script from the first step, one step per call', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,write,git');
    const client = scriptedClient(clock, () => {});
    const first = [text('system', CHILD_SYSTEM), text('user', 'TASK: writer\nEXPECTED OUTCOME: done')];
    expect(await taken(clock, client, first)).toBe('glob');
    expect(await taken(clock, client, [...first, ...step('c1', 'glob')])).toBe('write_file');
  });

  it('PD-ORCH-005: a child resumed in a new run takes the step after the ones its own record holds, not its first step again', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,write,git');
    // A new client is what a continue builds (one per run); the child's record carries its first step.
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', CHILD_SYSTEM), text('user', 'TASK: writer\nEXPECTED OUTCOME: done'), ...step('c1', 'glob')];
    expect(await taken(clock, resumed, record)).toBe('write_file');
    expect(await taken(clock, resumed, [...record, ...step('c2', 'write_file')])).toBe('terminal');
  });

  it('PD-ORCH-005: a resumed root carries on from its record too, and the steps it has not taken are still taken in order', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,read,glob');
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'pause me'), ...step('c1', 'read_file'), ...step('c2', 'read_file')];
    expect(await taken(clock, resumed, record)).toBe('glob');
  });

  it('PD-ORCH-005: a wait prefix and a failed call the record cannot show were consumed before the steps it does show', async () => {
    // `wait:` is a prefix of the step after it and `fail:503` answers with no message, so neither appears in the record;
    // the record's two steps are the two reads, and the resumed root's next step is the glob.
    vi.stubEnv('ROTARIS_SCRIPT', 'fail:503,read,wait:7000,read,glob');
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'steer then pause'), ...step('c1', 'read_file'), ...step('c2', 'read_file')];
    expect(await taken(clock, resumed, record)).toBe('glob');
  });

  it('PD-ORCH-005: a record longer than the script answers, as the end of the list always has', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read');
    const resumed = scriptedClient(clock, () => {});
    const record = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'done already'), ...step('c1', 'read_file')];
    expect(await taken(clock, resumed, record)).toBe('answer');
  });

  it('PD-ORCH-005: only a key\'s first call in a client is seeded from the record; later calls count on as before', async () => {
    // Two iterations in one run: the second root's record is fresh, and the counter carries on from the first root's steps.
    vi.stubEnv('ROTARIS_SCRIPT', 'read,glob,git');
    const client = scriptedClient(clock, () => {});
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    expect(await taken(clock, client, firstRoot)).toBe('read_file');
    expect(await taken(clock, client, [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')])).toBe('glob');
  });

  /*
   * The repair of fixed/the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md: the record a resumed agent
   * carries need not hold every step it took. Each client below plays the run up to the pause the way the product would
   * record it (`answered` turns a call into the assistant message `turn.ts` pushes), and a new client — what a continue
   * builds — is handed the record.
   */
  it('PD-ORCH-005: a root resumed in a later iteration of its run carries on from every iteration\'s steps, not only that iteration\'s', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,glob,readnotes,write,git');
    const unbroken = scriptedClient(clock, () => {});
    // Iteration 1: the root reads and globs, and the iteration closes.
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    const one = await answered(clock, unbroken, firstRoot);
    const two = await answered(clock, unbroken, [...firstRoot, one, result(one)]);
    expect([nameOf(one), nameOf(two)]).toEqual(['read_file', 'glob']);
    // Iteration 2: a fresh root, whose one step before the quit is the script's third.
    const secondRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')];
    const three = await answered(clock, unbroken, secondRoot);
    expect(nameOf(three)).toBe('read_file');
    // The continue resumes iteration 2's root: its record holds one step, and the root has taken three.
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, [...secondRoot, three, result(three)])).toBe('write_file');
  });

  it('PD-ORCH-005: a root whose later iteration holds only a streamed answer carries on after it too', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,answer,git');
    const unbroken = scriptedClient(clock, () => {});
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    expect(nameOf(await answered(clock, unbroken, firstRoot))).toBe('read_file');
    const secondRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')];
    const reply = await answered(clock, unbroken, secondRoot);
    expect(nameOf(reply)).toBe('answer');
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, [...secondRoot, reply, text('user', 'carry on')])).toBe('terminal');
  });

  it('PD-ORCH-005: a child whose record the compressing pass rewrote carries on from the steps it took, and keeps its key', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,read,readnotes,write,git');
    const unbroken = scriptedClient(clock, () => {});
    const task = text('user', 'TASK: writer\nEXPECTED OUTCOME: done');
    let record: ChatMessage[] = [text('system', CHILD_SYSTEM), task];
    for (let i = 0; i < 3; i += 1) { const m = await answered(clock, unbroken, record); record = [...record, m, result(m)]; }
    // The compressing pass condenses all three steps and keeps no turn (`preserve_recent_turns: 0`); the summary is the
    // scripted compressor's own answer, and `rebuild` is the product's reconstruction around it.
    const summary = await answered(clock, unbroken, [text('system', COMPRESSOR_SYSTEM), text('user', 'Condense the agent activity below.')]);
    const summaryText = summary.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const compressed = [text('system', CHILD_SYSTEM), ...rebuild(task, summaryText, [], [])];
    // The rebuilt record still opens with the TASK line, so the child is keyed as it was.
    expect(compressed[1]).toBe(task);
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, compressed)).toBe('write_file');
  });

  it('PD-ORCH-005: a compressed record that kept its latest turns reads them after the summary', async () => {
    vi.stubEnv('ROTARIS_CHILD_SCRIPT', 'glob,read,readnotes,write,git');
    const unbroken = scriptedClient(clock, () => {});
    const task = text('user', 'TASK: writer\nEXPECTED OUTCOME: done');
    let record: ChatMessage[] = [text('system', CHILD_SYSTEM), task];
    for (let i = 0; i < 3; i += 1) { const m = await answered(clock, unbroken, record); record = [...record, m, result(m)]; }
    const summary = await answered(clock, unbroken, [text('system', COMPRESSOR_SYSTEM), text('user', 'Condense the agent activity below.')]);
    const summaryText = summary.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    // The last step and its result are the one preserved turn; the summary stood for three steps and the turn is the third.
    const compressed = [text('system', CHILD_SYSTEM), ...rebuild(task, summaryText, [], record.slice(-2))];
    const resumed = scriptedClient(clock, () => {});
    expect(await taken(clock, resumed, compressed)).toBe('write_file');
  });

  /*
   * The repair of fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md: a call that
   * ends with no message leaves nothing in the record, so where the record is silent the client reads the ledger the
   * client before it kept — the agent's place, written when each call starts and cleared when it answers. The ledger is
   * shared between the two clients here as the file is between two launches in the run host.
   */
  it('PD-ORCH-005: a root resumed before its first reply in a later iteration carries on from the earlier iterations\' steps', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,glob,hang,write,git');
    const ledger = memoryLedger();
    const unbroken = scriptedClient(clock, () => {}, undefined, ledger);
    const firstRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')];
    const one = await answered(clock, unbroken, firstRoot);
    expect(nameOf(await answered(clock, unbroken, [...firstRoot, one, result(one)]))).toBe('glob');
    // Iteration 2: the root's first call is the hang, and the quit lands while it is in flight — its record holds only its task.
    const secondRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')];
    expect(await interrupted(clock, unbroken, secondRoot)).toBe('failed:aborted');
    const resumed = scriptedClient(clock, () => {}, undefined, ledger);
    expect(await taken(clock, resumed, secondRoot)).toBe('write_file');
  });

  it('PD-ORCH-005: a root resumed while a wait prefix held its first call carries on with the step after the wait', async () => {
    // An unbroken client's aborted wait consumes only itself; the step after it is the next call's.
    vi.stubEnv('ROTARIS_SCRIPT', 'read,wait:7000,glob,git');
    const ledger = memoryLedger();
    const unbroken = scriptedClient(clock, () => {}, undefined, ledger);
    expect(nameOf(await answered(clock, unbroken, [text('system', ORCHESTRATOR_SYSTEM), text('user', 'first task')]))).toBe('read_file');
    const secondRoot = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'second task')];
    expect(await interrupted(clock, unbroken, secondRoot)).toBe('failed:aborted');
    const resumed = scriptedClient(clock, () => {}, undefined, ledger);
    // The continue may deliver a message after the task; the record the entry was written over is still where it begins.
    expect(await taken(clock, resumed, [...secondRoot, text('user', 'carry on')])).toBe('glob');
  });

  it('PD-ORCH-005: a record whose last step answered with no message carries on past that step, not into it again', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,fail:429,glob');
    const ledger = memoryLedger();
    const unbroken = scriptedClient(clock, () => {}, undefined, ledger);
    const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'rate limit me')];
    const one = await answered(clock, unbroken, root);
    const record = [...root, one, result(one)];
    // The rate limit answers with no message; the quit lands in the wait before the retry.
    expect(await taken(clock, unbroken, record)).toBe('failed:scripted rate limit (HTTP 429)');
    const resumed = scriptedClient(clock, () => {}, undefined, ledger);
    expect(await taken(clock, resumed, record)).toBe('glob');
  });

  it('PD-ORCH-005: a step that answered clears its entry, so a fresh root with the same prompt still starts from the first step', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,glob');
    const ledger = memoryLedger();
    const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'same prompt')];
    expect(nameOf(await answered(clock, scriptedClient(clock, () => {}, undefined, ledger), root))).toBe('read_file');
    expect(await taken(clock, scriptedClient(clock, () => {}, undefined, ledger), root)).toBe('read_file');
  });

  it('PD-ORCH-005: an entry left over another conversation does not place a fresh agent', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'hang,read,glob');
    const ledger = memoryLedger();
    expect(await interrupted(clock, scriptedClient(clock, () => {}, undefined, ledger), [text('system', ORCHESTRATOR_SYSTEM), text('user', 'one prompt')])).toBe('failed:aborted');
    const fresh = scriptedClient(clock, () => {}, undefined, ledger);
    expect(await interrupted(clock, fresh, [text('system', ORCHESTRATOR_SYSTEM), text('user', 'another prompt')])).toBe('failed:aborted');
  });

  it('PD-ORCH-005: the file ledger reads back, in a new ledger over the same file, what the last one left', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'read,hang,glob');
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-standing-'));
    try {
      const file = join(dir, 'scripted-standing.json');
      const unbroken = scriptedClient(clock, () => {}, undefined, fileLedger(file, () => {}));
      const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'quit mid-call')];
      const one = await answered(clock, unbroken, root);
      const record = [...root, one, result(one)];
      expect(await interrupted(clock, unbroken, record)).toBe('failed:aborted');
      // A relaunch: a new run host, a new ledger over the file the last one wrote.
      const relaunched = scriptedClient(clock, () => {}, undefined, fileLedger(file, () => {}));
      expect(await taken(clock, relaunched, record)).toBe('glob');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const COMPRESSOR_SYSTEM = 'You condense an agent conversation so the agent can carry on with a shorter history.';

/** The tool a message called, or `answer`. */
function nameOf(message: ChatMessage): string {
  return message.content.find((p) => p.kind === 'tool-call')?.name ?? 'answer';
}
/** The tool result `turn.ts` pushes after a step that called a tool. */
function result(message: ChatMessage): ChatMessage {
  const call = message.content.find((p) => p.kind === 'tool-call');
  if (call?.kind !== 'tool-call') throw new Error('the step called no tool');
  return { role: 'tool', content: [{ kind: 'tool-result', callId: call.callId, name: call.name, result: 'ok', isError: false }] };
}
/** The whole call, as the assistant message `turn.ts` pushes for it: its text, then its tool calls. */
async function answered(clock: FakeClock, client: ReturnType<typeof scriptedClient>, messages: readonly ChatMessage[]): Promise<ChatMessage> {
  const parts = client.stream(request(messages))[Symbol.asyncIterator]();
  let said = '';
  const calls: { kind: 'tool-call'; callId: string; name: string; args: string }[] = [];
  for (;;) {
    const next = parts.next();
    let r = await Promise.race([next, settled()]);
    while (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
    if (r.done === true) break;
    const part = r.value;
    if (!part.ok) throw new Error(part.error.headline);
    if (part.value.kind === 'text') said += part.value.delta;
    if (part.value.kind === 'tool-call') calls.push({ kind: 'tool-call', callId: part.value.callId, name: part.value.name, args: part.value.argsDelta });
  }
  return { role: 'assistant', content: [...(said ? [{ kind: 'text' as const, text: said }] : []), ...calls] };
}
/** A call cut while it is in flight — the quit or a crash: the clock is moved on a little, then the caller aborts. */
async function interrupted(clock: FakeClock, client: ReturnType<typeof scriptedClient>, messages: readonly ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const parts = client.stream(request(messages, controller.signal))[Symbol.asyncIterator]();
  const next = parts.next();
  let r = await Promise.race([next, settled()]);
  if (r === undefined) { clock.advance(200); r = await Promise.race([next, settled()]); }
  if (r !== undefined) { await parts.return?.(); return r.done === true ? 'answer' : r.value.ok ? `took:${r.value.value.kind}` : `failed:${r.value.error.headline}`; }
  controller.abort();
  const after = await next;
  return after.done === true ? 'answer' : after.value.ok ? `took:${after.value.value.kind}` : `failed:${after.value.error.headline}`;
}

describe('scriptedClient — `tool:<key>` (fin42, N52; edits-proof)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const result = (callId: string, name: string, text: string): ChatMessage => ({ role: 'tool', content: [{ kind: 'tool-result', callId, name, result: text, isError: false }] });
  const editing = [...TOOLS, { name: 'haet_edit', description: 'haet_edit', parameters: {} }];

  it('calls the named tool with the arguments ROTARIS_SCRIPT_TOOL_ARGS gives its key', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'tool:insert');
    vi.stubEnv('ROTARIS_SCRIPT_TOOL_ARGS', JSON.stringify({ insert: { name: 'write_file', args: { operation: 'insert', path: 'a.js', insert_line: 1, content: '// x' } } }));
    const out = await calls(scriptedClient(new FakeClock(), () => undefined), [text('system', ORCHESTRATOR_SYSTEM), text('user', 'go')]);
    expect(out).toEqual([{ name: 'write_file', args: JSON.stringify({ operation: 'insert', path: 'a.js', insert_line: 1, content: '// x' }) }]);
  });

  it('sends `@content_hash` as the newest hash a tool result carried, and answers for a tool it does not hold', async () => {
    vi.stubEnv('ROTARIS_SCRIPT', 'tool:edit,tool:edit,tool:absent');
    vi.stubEnv('ROTARIS_SCRIPT_TOOL_ARGS', JSON.stringify({ edit: { name: 'haet_edit', args: { path: 'e.js', content_hash: '@content_hash', old_string: 'a', new_string: 'b' } }, absent: { name: 'git_commit', args: {} } }));
    const clock = new FakeClock();
    const client = scriptedClient(clock, () => undefined);
    const ask = async (messages: readonly ChatMessage[]) => {
      const out: { name: string; args: string }[] = [];
      for await (const part of client.stream({ ...request(messages), tools: editing })) if (part.ok && part.value.kind === 'tool-call') out.push({ name: part.value.name, args: part.value.argsDelta });
      return out;
    };
    const root = [text('system', ORCHESTRATOR_SYSTEM), text('user', 'go'), result('r0', 'haet_read', `e.js | lines 1-2 of 2 | content_hash: ${HASH_A}\n1: a`)];
    const first = await ask(root);
    expect(JSON.parse(first[0]!.args)).toMatchObject({ content_hash: HASH_A, old_string: 'a' });
    const after = [...root, { role: 'assistant' as const, content: [{ kind: 'tool-call' as const, callId: 'c1', name: 'haet_edit', args: '{}' }] }, result('c1', 'haet_edit', 'old_string was not found exactly in e.js.'), result('c2', 'haet_edit', `Replaced 1 line. content_hash: ${HASH_B}`)];
    const second = await ask(after);
    expect(JSON.parse(second[0]!.args)).toMatchObject({ content_hash: HASH_B });
    // `git_commit` is not in this listing: the step answers instead (the reply streams on the clock).
    expect(await taken(clock, client, [...after, ...step('c3', 'haet_edit')])).toBe('answer');
  });
});
