import { describe, expect, it } from 'vitest';
import { sessionContentInLog, utf8ByteLength } from './log-content.js';

describe('PD-STARTUP-011 / REQ-STARTUP-134: session content in a log line is its source, kind and byte length', () => {
  it('names the kind, the source and the UTF-8 byte length, and never the text', () => {
    const text = 'the secret plan: rewrite main.ts — ünïcödé';
    const said = sessionContentInLog('model output', 'the intent classifier (gpt-x)', text);
    expect(said).toBe(`model output from the intent classifier (gpt-x), ${utf8ByteLength(text)} bytes, not quoted`);
    expect(said).not.toContain('secret plan');
  });

  it('counts bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('')).toBe(0);
  });
});
