import { describe, expect, it } from 'vitest';
import { advisorQuestionOf, advisorResultText, parseAdvisorResult } from './advisor.js';

describe('the advisor result text (PD-TOOLS-022 clause 7)', () => {
  it('round-trips an answered consult', () => {
    const text = advisorResultText({ model: 'anthropic/claude-opus', use: 2, of: 3, advice: '  Read the failing test first.\n\nThen fix the parser.  ' });
    expect(text.startsWith('Advisor (anthropic/claude-opus), consult 2 of 3:\n\n')).toBe(true);
    expect(parseAdvisorResult(text)).toEqual({ model: 'anthropic/claude-opus', use: 2, of: 3, advice: 'Read the failing test first.\n\nThen fix the parser.' });
  });
  it('keeps the head on one line whatever the label holds', () => {
    const text = advisorResultText({ model: 'weird (label)\nhere', use: 1, of: 1, advice: 'x' });
    expect(parseAdvisorResult(text)?.model).toBe('weird label here');
  });
  it('reads nothing from a refusal or another tool\'s result', () => {
    expect(parseAdvisorResult('The advisor was not consulted: every consult of this run is spent (3 of 3).')).toBeNull();
    expect(parseAdvisorResult('Advisor (m), consult 1 of 3:\n\n')).toBeNull();
    expect(parseAdvisorResult('')).toBeNull();
  });
  it('reads the question from recorded arguments', () => {
    expect(advisorQuestionOf('{"question":" Is this plan sound? "}')).toBe('Is this plan sound?');
    expect(advisorQuestionOf({ question: 'q' })).toBe('q');
    expect(advisorQuestionOf('not json')).toBe('');
    expect(advisorQuestionOf({})).toBe('');
  });
});
