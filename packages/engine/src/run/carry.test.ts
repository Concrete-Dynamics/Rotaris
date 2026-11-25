import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@rotaris/model';
import { carriedConversation } from './carry.js';

const text = (role: 'user' | 'assistant', body: string): ChatMessage => ({ role, content: [{ kind: 'text', text: body }] });
const call = (id: string): ChatMessage => ({ role: 'assistant', content: [{ kind: 'tool-call', callId: id, name: 'read_file', args: '{}' }] });
const result = (id: string): ChatMessage => ({ role: 'tool', content: [{ kind: 'tool-result', callId: id, name: 'read_file', result: 'contents', isError: false }] });

describe('PD-ORCH-022: the part of a recorded conversation that is carried', () => {
  it('is the whole conversation when it ends on the root\'s answer', () => {
    const messages = [text('user', 'do it'), call('c1'), result('c1'), text('assistant', 'done')];
    expect(carriedConversation(messages)).toEqual(messages);
  });

  it('ends at the last answer: a call a cancel left unanswered and a message the root never read are dropped', () => {
    const messages = [text('user', 'do it'), call('c1'), result('c1'), text('assistant', 'first answer'), text('user', 'a steer'), call('c2')];
    expect(carriedConversation(messages)).toEqual(messages.slice(0, 4));
  });

  it('drops a tool call the record holds no result for, and the assistant message it leaves empty', () => {
    const half: ChatMessage = { role: 'assistant', content: [{ kind: 'text', text: 'reading' }, { kind: 'tool-call', callId: 'c2', name: 'read_file', args: '{}' }] };
    const messages = [text('user', 'do it'), call('c0'), text('user', 'answer now'), call('c1'), result('c1'), half, text('assistant', 'done')];
    expect(carriedConversation(messages)).toEqual([text('user', 'do it'), text('user', 'answer now'), call('c1'), result('c1'), text('assistant', 'reading'), text('assistant', 'done')]);
  });

  it('is nothing where the root never answered', () => {
    expect(carriedConversation([text('user', 'do it'), call('c1'), result('c1')])).toEqual([]);
    expect(carriedConversation([])).toEqual([]);
  });
});
