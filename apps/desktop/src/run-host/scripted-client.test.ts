import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage, ModelRequest, ToolSpec } from '@rotaris/model';
import { scriptedClient } from './scripted-client.js';

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
const request = (messages: readonly ChatMessage[]): ModelRequest => ({
  model: { providerId: 'scripted', modelId: 'scripted', dialect: 'chat' }, messages, thinking: 'unset', signal: new AbortController().signal,
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

describe('scriptedClient — the step a call takes', () => {
  let clock: FakeClock;
  beforeEach(() => { clock = new FakeClock(); });
  afterEach(() => { vi.unstubAllEnvs(); });

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
});
