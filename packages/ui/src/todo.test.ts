import { describe, expect, it } from 'vitest';
import { todoCountLabel } from './TodoPane.js';

describe('todo pane labels (REQ-CHAT-085, REQ-CHAT-168)', () => {
  it('uses grammatical singular and plural counts', () => {
    expect(todoCountLabel(0, 0)).toBe('0 of 0 tasks done');
    expect(todoCountLabel(1, 1)).toBe('1 of 1 task done');
    expect(todoCountLabel(1, 2)).toBe('1 of 2 tasks done');
  });
});
