import { describe, expect, it } from 'vitest';
import { captureRefusal, captureUnavailable, dictationControlView, insertTranscript, nextDictationPhase, type DictationEvent, type DictationPhase } from './dictation.js';

describe('OQ-456 — where a transcript lands', () => {
  it('goes at the caret, leaving what is around it', () => {
    expect(insertTranscript('hello  world', 6, 6, 'big')).toEqual({ value: 'hello big world', caret: 9 });
  });
  it('adds a space only where it would touch a neighbour', () => {
    expect(insertTranscript('hello', 5, 5, 'world')).toEqual({ value: 'hello world', caret: 11 });
    expect(insertTranscript('world', 0, 0, 'hello')).toEqual({ value: 'hello world', caret: 5 });
    expect(insertTranscript('line\n', 5, 5, 'next')).toEqual({ value: 'line\nnext', caret: 9 });
    expect(insertTranscript('', 0, 0, ' only ')).toEqual({ value: 'only', caret: 4 });
  });
  it('keeps a selection and goes after it', () => {
    expect(insertTranscript('keep this', 0, 4, 'x')).toEqual({ value: 'keep x this', caret: 6 });
  });
  it('changes nothing for a blank transcript', () => {
    expect(insertTranscript('as typed', 2, 2, '  ')).toEqual({ value: 'as typed', caret: 2 });
  });
  it('survives a caret past the end of a shorter text', () => {
    expect(insertTranscript('ab', 9, 9, 'c')).toEqual({ value: 'ab c', caret: 4 });
  });
});

describe('OQ-455 — the control', () => {
  const run = (events: readonly DictationEvent[], from: DictationPhase = 'idle') => events.reduce(nextDictationPhase, from);
  it('walks idle, recording, transcribing, idle', () => {
    expect(run(['press'])).toBe('starting');
    expect(run(['press', 'started'])).toBe('recording');
    expect(run(['press', 'started', 'captured'])).toBe('transcribing');
    expect(run(['press', 'started', 'captured', 'finished'])).toBe('idle');
  });
  it('starts nothing second: a press while starting or transcribing changes nothing', () => {
    expect(run(['press', 'press'])).toBe('starting');
    expect(run(['press'], 'transcribing')).toBe('transcribing');
  });
  it('returns to idle when the microphone refuses', () => {
    expect(run(['press', 'refused'])).toBe('idle');
  });
  it('states each phase in its name, its title and its announcement, and only recording can be pressed again', () => {
    expect(dictationControlView('idle', null)).toMatchObject({ name: 'Dictate', disabled: false, announcement: '' });
    expect(dictationControlView('recording', null)).toMatchObject({ name: 'Stop dictating', disabled: false, announcement: 'Recording.' });
    expect(dictationControlView('transcribing', null)).toMatchObject({ disabled: true, announcement: 'Transcribing.' });
    expect(dictationControlView('transcribing', null).title).toContain('keep typing');
  });
  it('publishes the refusal as its title, and lets a recording stop whatever arose meanwhile', () => {
    expect(dictationControlView('idle', 'Choose a model.')).toMatchObject({ disabled: true, title: 'Choose a model.' });
    expect(dictationControlView('recording', 'Choose a model.').disabled).toBe(false);
  });
});

describe('OQ-459 — what capture says when it cannot', () => {
  it('names a page that is not secure, specifically', () => {
    expect(captureUnavailable({ secureContext: false, mediaDevices: false, recorder: false })).toContain('secure page');
    expect(captureUnavailable({ secureContext: true, mediaDevices: false, recorder: true })).toContain('cannot record');
    expect(captureUnavailable({ secureContext: true, mediaDevices: true, recorder: true })).toBeNull();
  });
  it('says why by the exception, with a default for one it does not know', () => {
    expect(captureRefusal('NotAllowedError')).toContain('refused');
    expect(captureRefusal('NotFoundError')).toContain('No microphone');
    expect(captureRefusal('NotReadableError')).toContain('could not be read');
    expect(captureRefusal('Other')).toBe('The microphone could not be started.');
  });
});
