import { describe, expect, it } from 'vitest';
import { DICTATION_CONFIG_DEFAULT } from '@rotaris/contracts';
import { readDictationSection } from './dictation.js';
import type { ProblemSink } from './field.js';

const read = (value: unknown) => {
  const sink: ProblemSink = { errors: [], warnings: [] };
  return { section: readDictationSection(value, sink), errors: sink.errors.map((e) => e.path), warnings: sink.warnings.map((w) => w.path) };
};

describe('OQ-457 — the dictation: section', () => {
  it('is off when nothing states it', () => {
    expect(read(undefined)).toEqual({ section: DICTATION_CONFIG_DEFAULT, errors: [], warnings: [] });
  });

  it('reads both ways of naming a model', () => {
    expect(read({ backend: 'local', local_model: 'large-v3-turbo', language: 'de' }).section).toMatchObject({ backend: 'local', local_model: 'large-v3-turbo', language: 'de' });
    expect(read({ backend: 'endpoint', base_url: 'http://127.0.0.1:8000/v1', model: 'whisper-1', provider: 'openai' }).section).toEqual({ ...DICTATION_CONFIG_DEFAULT, backend: 'endpoint', base_url: 'http://127.0.0.1:8000/v1', model: 'whisper-1', provider: 'openai' });
  });

  it('refuses a backend outside the vocabulary', () => {
    const { section, errors } = read({ backend: 'cloud' });
    expect(errors).toEqual(['dictation.backend']);
    expect(section.backend).toBe('off');
  });

  it.each(['../../evil', '/usr/bin/evil', 'a/b', 'a\\b', '..', '.hidden', '-flag', 'with space'])('refuses %s as a local model, which must be a bare name', (local_model) => {
    const { section, errors } = read({ local_model });
    expect(errors).toEqual(['dictation.local_model']);
    expect(section.local_model).toBe(DICTATION_CONFIG_DEFAULT.local_model);
  });

  it.each(['file:///etc/passwd', 'ftp://host/v1', 'not a url'])('refuses %s as a base URL', (base_url) => {
    expect(read({ base_url }).errors).toEqual(['dictation.base_url']);
  });

  it('refuses a language that is not a language tag, and warns on a key it does not know', () => {
    expect(read({ language: 'de; rm -rf' }).errors).toEqual(['dictation.language']);
    expect(read({ command: 'evil' }).warnings).toEqual(['dictation.command']);
  });
});
