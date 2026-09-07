import { describe, expect, it } from 'vitest';
import { stepsPhrase } from '@rotaris/contracts';
import { FREEFORM_PLACEHOLDER, hasAnswer, QUESTION_DELIVERY_FAILED } from './QuestionStepper.js';
import { APPROVAL_DELIVERY_FAILED } from './ApprovalDialog.js';

/**
 * Part AC — what the stepper SAYS and what counts as an answer, measured where a browser is not needed; what it
 * DRAWS and how it navigates is the `questions-proof` launch's to assert, on the pattern Part AA set.
 */
describe('REQ-CHAT-100 — what counts as an answer', () => {
  it('an option counts, real text counts, and whitespace-only text does not', () => {
    expect(hasAnswer(undefined)).toBe(false);
    expect(hasAnswer({ selected_option: null, freeform_text: null })).toBe(false);
    expect(hasAnswer({ selected_option: '', freeform_text: '' })).toBe(false);
    expect(hasAnswer({ selected_option: null, freeform_text: '   \n\t ' })).toBe(false);
    expect(hasAnswer({ selected_option: 'One file', freeform_text: null })).toBe(true);
    expect(hasAnswer({ selected_option: null, freeform_text: 'a note' })).toBe(true);
  });
});

describe('REQ-CHAT-102 / REQ-CHAT-103 — the two fixed sentences, which differ by one word each and are not interchangeable', () => {
  it('states each exactly as its requirement quotes it', () => {
    expect(QUESTION_DELIVERY_FAILED).toBe('Could not deliver answers. The waiting agent is no longer available.');
    expect(APPROVAL_DELIVERY_FAILED).toBe('Could not deliver the decision. The waiting agent is no longer available.');
    expect(QUESTION_DELIVERY_FAILED).not.toBe(APPROVAL_DELIVERY_FAILED);
    expect(FREEFORM_PLACEHOLDER).toBe('Or type your own answer…');
  });
});

describe('REQ-CHAT-168 — one grammar for the step count, shared by the trailer and the tool outcome', () => {
  it('reads correctly at zero, one and many', () => {
    expect(stepsPhrase(0)).toBe('0 steps');
    expect(stepsPhrase(1)).toBe('1 step');
    expect(stepsPhrase(2)).toBe('2 steps');
    expect(stepsPhrase(10)).toBe('10 steps');
  });
});
