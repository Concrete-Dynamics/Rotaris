import { describe, expect, it } from 'vitest';
import { createStreamNormaliser, reasoningItemSeparator } from './reasoning.js';
import type { StreamPart } from './ports.js';

const run = (parts: readonly StreamPart[]): StreamPart[] => {
  const n = createStreamNormaliser();
  const out: StreamPart[] = [];
  for (const p of parts) out.push(...n.accept(p));
  out.push(...n.flush());
  return out;
};
const textOf = (parts: readonly StreamPart[]): string => parts.filter((p) => p.kind === 'text').map((p) => (p.kind === 'text' ? p.delta : '')).join('');
const reasoningOf = (parts: readonly StreamPart[]): string => parts.filter((p) => p.kind === 'reasoning').map((p) => (p.kind === 'reasoning' ? p.delta : '')).join('');

describe('REQ-CHAT-163 — the three shapes deliberation arrives in, and the whitespace rule', () => {
  it('shape (a): a dedicated reasoning field passes straight through to the reasoning channel', () => {
    const out = run([{ kind: 'reasoning', delta: 'thinking hard' }, { kind: 'text', delta: 'the answer' }]);
    expect(reasoningOf(out)).toBe('thinking hard');
    expect(textOf(out)).toBe('the answer');
  });

  it('shape (b): a thinking block inside the content never reaches the answer body', () => {
    const out = run([{ kind: 'text', delta: 'before <think>deliberating</think>after' }]);
    expect(textOf(out)).toBe('before after');
    expect(reasoningOf(out)).toBe('deliberating');
  });

  it('shape (b) across delta boundaries: an opening tag split down the middle is still recognised', () => {
    const out = run([
      { kind: 'text', delta: 'A<th' }, { kind: 'text', delta: 'ink>hidden' },
      { kind: 'text', delta: ' more</thi' }, { kind: 'text', delta: 'nk>B' },
    ]);
    expect(textOf(out)).toBe('AB');
    expect(reasoningOf(out)).toBe('hidden more');
  });

  it('a partial tag is HELD rather than leaked, and `flush` gives back what the stream ended mid-tag', () => {
    const n = createStreamNormaliser();
    const held = n.accept({ kind: 'text', delta: 'answer<thin' });
    expect(textOf(held)).toBe('answer');
    expect(textOf(n.flush())).toBe('<thin');
  });

  it('an unterminated thinking block stays reasoning to the end — the safe direction', () => {
    const out = run([{ kind: 'text', delta: 'visible<think>never closed' }]);
    expect(textOf(out)).toBe('visible');
    expect(reasoningOf(out)).toBe('never closed');
  });

  it('the whitespace rule: a whitespace-only delta is kept EXACTLY as received, never dropped or collapsed', () => {
    const deltas = ['# Heading', '\n', '\n', '   ', '\n\n', 'body'];
    const out = run(deltas.map((delta) => ({ kind: 'text', delta })));
    // REQ-CHAT-157: the finished message equals the concatenation of the deltas received, character for character.
    expect(textOf(out)).toBe(deltas.join(''));
    expect(out.filter((p) => p.kind === 'text').length).toBe(deltas.length);
  });

  it('a tool call is passed through untouched and never appears in the visible text', () => {
    const out = run([{ kind: 'text', delta: 'calling' }, { kind: 'tool-call', callId: 'c1', name: 'grep', argsDelta: '{"q":"<think>"}' }]);
    expect(textOf(out)).toBe('calling');
    expect(out.some((p) => p.kind === 'tool-call')).toBe(true);
  });

  it('shape (c): a new reasoning item id is separated from the previous one, and only then', () => {
    expect(reasoningItemSeparator(null, 'a')).toBe('');
    expect(reasoningItemSeparator('a', 'a')).toBe('');
    expect(reasoningItemSeparator('a', 'b')).toBe('\n\n');
    expect(reasoningItemSeparator('a', null)).toBe('');
  });

  it('`<thinking>` and `<reasoning>` are recognised beside `<think>`', () => {
    expect(reasoningOf(run([{ kind: 'text', delta: 'x<thinking>a</thinking>y' }]))).toBe('a');
    expect(reasoningOf(run([{ kind: 'text', delta: 'x<reasoning>b</reasoning>y' }]))).toBe('b');
  });
});
