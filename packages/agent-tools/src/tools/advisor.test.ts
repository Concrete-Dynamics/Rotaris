import { describe, expect, it } from 'vitest';
import { parseAdvisorResult } from '@rotaris/contracts';
import { ADVISOR_DESCRIPTION, AdvisorUses, advisorTool, spentRefusal, type AdvisorAnswer, type AdvisorPort } from './advisor.js';
import type { ToolContext } from './types.js';

const ctx = { signal: new AbortController().signal } as unknown as ToolContext;

function portOf(answers: (AdvisorAnswer | Error)[], maxUses = 3): { port: AdvisorPort; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    port: {
      maxUses,
      consult: async (question) => {
        asked.push(question);
        const next = answers.shift() ?? { ok: true as const, advice: 'ok', model: 'p/m' };
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

describe('the advisor tool (PD-TOOLS-022)', () => {
  it('returns the advice with the model and the count (clauses 3, 6)', async () => {
    const { port, asked } = portOf([{ ok: true, advice: 'Split the function first.', model: 'anthropic/opus' }]);
    const r = await advisorTool(port).execute({ question: '  Is my plan sound?  ' }, ctx);
    expect(r.isError).toBe(false);
    expect(asked).toEqual(['Is my plan sound?']);
    expect(parseAdvisorResult(r.text)).toEqual({ model: 'anthropic/opus', use: 1, of: 3, advice: 'Split the function first.' });
  });

  it('refuses past the cap without asking (clause 6)', async () => {
    const { port, asked } = portOf([], 2);
    const tool = advisorTool(port);
    await tool.execute({ question: 'a' }, ctx);
    await tool.execute({ question: 'b' }, ctx);
    const third = await tool.execute({ question: 'c' }, ctx);
    expect(third.isError).toBe(true);
    expect(third.text).toBe(spentRefusal(2));
    expect(third.failureKind).toBe('advisor_uses_spent');
    expect(asked).toEqual(['a', 'b']);
  });

  it('a consult that fails or throws spends nothing', async () => {
    const { port } = portOf([{ ok: false, reason: 'the advisor\'s model is held out of quota' }, new Error('socket closed')], 1);
    const uses = new AdvisorUses(1);
    const tool = advisorTool(port, uses);
    const failed = await tool.execute({ question: 'a' }, ctx);
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('held out of quota');
    expect(failed.text).toContain('No consult was spent');
    const thrown = await tool.execute({ question: 'b' }, ctx);
    expect(thrown.text).toContain('socket closed');
    expect(uses.left).toBe(1);
    const answered = await tool.execute({ question: 'c' }, ctx);
    expect(parseAdvisorResult(answered.text)?.use).toBe(1);
    expect(uses.left).toBe(0);
  });

  it('a call in flight holds its place, so two at once cannot pass a cap of one', async () => {
    let release: (a: AdvisorAnswer) => void = () => undefined;
    const port: AdvisorPort = { maxUses: 1, consult: () => new Promise((resolve) => { release = resolve; }) };
    const tool = advisorTool(port);
    const first = tool.execute({ question: 'a' }, ctx);
    const second = await tool.execute({ question: 'b' }, ctx);
    expect(second.text).toBe(spentRefusal(1));
    release({ ok: true, advice: 'x', model: 'm' });
    expect((await first).isError).toBe(false);
  });

  it('a cap of zero offers nothing to ask', async () => {
    const { port, asked } = portOf([], 0);
    const r = await advisorTool(port).execute({ question: 'a' }, ctx);
    expect(r.isError).toBe(true);
    expect(asked).toEqual([]);
  });

  it('the description names the three moments (clause 9)', () => {
    expect(ADVISOR_DESCRIPTION).toContain('Before you commit to an approach');
    expect(ADVISOR_DESCRIPTION).toContain('When you are stuck');
    expect(ADVISOR_DESCRIPTION).toContain('Before you declare the task done');
  });
});
