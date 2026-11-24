import { describe, expect, it } from 'vitest';
import type { AgentBackend, ChatMessage, ModelRef, TurnInput, Usage } from '@rotaris/model';
import { ADVISOR_SYSTEM_PROMPT, advisorPrompt, consultAdvisor, createAdvisor, type AdvisorDeps } from './advisor.js';
import { meteredBackend } from './metered.js';

const strong: ModelRef = { providerId: 'p', modelId: 'strong', dialect: 'chat' };
const weak: ModelRef = { providerId: 'p', modelId: 'weak', dialect: 'chat' };
const usage = { input: 100, output: 20 } as unknown as Usage;
const messages: ChatMessage[] = [
  { role: 'user', content: [{ kind: 'text', text: 'Fix the parser.' }] },
  { role: 'assistant', content: [{ kind: 'text', text: 'I will rewrite it.' }] },
];

function backendOf(reply: (input: TurnInput) => { status: 'succeeded'; text: string } | { status: 'failed'; headline: string } | Error): { backend: AgentBackend; seen: TurnInput[] } {
  const seen: TurnInput[] = [];
  return {
    seen,
    backend: {
      ownsTheLoop: false,
      runTurn: async (input) => {
        seen.push(input);
        const r = reply(input);
        if (r instanceof Error) throw r;
        return (r.status === 'succeeded' ? { status: 'succeeded', text: r.text, usage } : { status: 'failed', text: '', usage, error: { code: 'unknown', headline: r.headline, transient: false } }) as never;
      },
    },
  };
}

const depsOf = (backend: AgentBackend, over: Partial<AdvisorDeps> = {}): AdvisorDeps => ({
  backend, setup: { model: strong, thinking: 'high', label: 'opus', maxUses: 3, timeoutMs: 60_000 }, credentialFor: () => async () => 'key', ...over,
});
const request = { messages, question: 'Is a rewrite the right call?', agent: 'coder-1', persona: 'coder' };

describe('the advisor consult (PD-TOOLS-022)', () => {
  it('makes one request with no tools, on the advisor\'s model, over the conversation and the question (clauses 2, 3)', async () => {
    const { backend, seen } = backendOf(() => ({ status: 'succeeded', text: '  Patch it; do not rewrite.  ' }));
    const out = await consultAdvisor(depsOf(backend), request, new AbortController().signal);
    expect(out).toEqual({ ok: true, advice: 'Patch it; do not rewrite.', model: 'opus' });
    expect(seen).toHaveLength(1);
    const input = seen[0]!;
    expect(input.tools).toEqual([]);
    expect(input.model).toEqual(strong);
    expect(input.persona).toBe('advisor');
    expect(input.systemPrompt).toBe(ADVISOR_SYSTEM_PROMPT);
    expect(input.retries).toBe(0);
    const text = (input.messages[0]!.content[0] as { text: string }).text;
    expect(text).toContain('user: Fix the parser.');
    expect(text).toContain('assistant: I will rewrite it.');
    expect(text).toContain('<question>\nIs a rewrite the right call?\n</question>');
    expect(text).toContain('coder-1');
  });

  it('a failed request, an empty answer and a throw are each a reason, never a throw', async () => {
    const signal = new AbortController().signal;
    expect(await consultAdvisor(depsOf(backendOf(() => ({ status: 'failed', headline: 'rate limited' })).backend), request, signal)).toEqual({ ok: false, reason: 'rate limited' });
    expect(await consultAdvisor(depsOf(backendOf(() => ({ status: 'succeeded', text: '   ' })).backend), request, signal)).toEqual({ ok: false, reason: 'the advisor\'s model returned no text' });
    expect(await consultAdvisor(depsOf(backendOf(() => new Error('socket closed')).backend), request, signal)).toEqual({ ok: false, reason: 'socket closed' });
  });

  it('a model held out of quota is not called (PD-MONITOR-007)', async () => {
    const { backend, seen } = backendOf(() => ({ status: 'succeeded', text: 'x' }));
    const out = await consultAdvisor(depsOf(backend, { helperModel: () => ({ ok: false, reason: 'p/strong is held out of quota for this session' }) }), request, new AbortController().signal);
    expect(out).toEqual({ ok: false, reason: 'the advisor\'s model p/strong is held out of quota for this session' });
    expect(seen).toEqual([]);
  });

  it('follows the session\'s override and names the model that answered', async () => {
    const { backend, seen } = backendOf(() => ({ status: 'succeeded', text: 'x' }));
    const out = await consultAdvisor(depsOf(backend, { helperModel: () => ({ ok: true, model: weak, thinking: 'low' as never, key: 'other' }) }), request, new AbortController().signal);
    expect(seen[0]!.model).toEqual(weak);
    expect(out).toEqual({ ok: true, advice: 'x', model: 'other' });
  });

  it('is counted once on the run through the metered backend (REQ-EVENTS-053)', async () => {
    const counted: { usage: Usage; model: ModelRef }[] = [];
    const { backend } = backendOf(() => ({ status: 'succeeded', text: 'x' }));
    const ops = createAdvisor(depsOf(meteredBackend(backend, (u, m) => counted.push({ usage: u, model: m }))), weak);
    await ops.consult(request, new AbortController().signal);
    expect(counted).toEqual([{ usage, model: strong }]);
    expect(ops.maxUses).toBe(3);
    expect(ops.entryModel).toEqual(weak);
  });

  it('a long conversation is given within the cap, its start and its most recent part kept', () => {
    const long: ChatMessage[] = [{ role: 'user', content: [{ kind: 'text', text: 'START' }] }, ...Array.from({ length: 50 }, (_, i) => ({ role: 'assistant' as const, content: [{ kind: 'text' as const, text: `step ${i} ${'x'.repeat(200)}` }] })), { role: 'assistant', content: [{ kind: 'text', text: 'LATEST' }] }];
    const text = advisorPrompt({ ...request, messages: long }, 2_000);
    expect(text).toContain('START');
    expect(text).toContain('LATEST');
    expect(text).toContain('characters omitted');
    expect(advisorPrompt({ ...request, messages: [] })).toContain('(the conversation holds nothing yet)');
  });
});
