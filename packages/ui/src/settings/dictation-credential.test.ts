import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTATION_CONFIG_DEFAULT } from '@rotaris/contracts';
import { DictationCredentialField, DictationSettings, type DictationCredentialFieldProps } from './DictationSettings.js';

/**
 * PD-CONFIG-010: the dictation endpoint's bearer is typed into the field, stored outside every configuration file, and once
 * stored the field is empty and the value is reported masked — so the only acts it offers are replacement and removal, and
 * the stored value is never rendered in any state.
 */
const draw = (over: Partial<DictationCredentialFieldProps> = {}): string =>
  renderToStaticMarkup(createElement(DictationCredentialField, { masked: null, busy: false, message: null, onStore: () => {}, onClear: () => {}, ...over }));

describe('the dictation credential field — PD-CONFIG-010', () => {
  it('is a password field that never autocompletes, in every state', () => {
    for (const masked of [undefined, null, '***'] as const) {
      const html = draw({ masked });
      expect(html).toContain('type="password"');
      expect(html).toContain('autoComplete="off"');
      expect(html).not.toContain('type="text"');
    }
  });

  it('says it is reading until the first answer, and offers nothing to press', () => {
    const html = draw({ masked: undefined });
    expect(html).toContain('Reading the stored credential');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Delete the stored credential');
  });

  it('offers to store when nothing is stored, and says the value is never shown again', () => {
    const html = draw({ masked: null });
    expect(html).toContain('Store the credential');
    expect(html).toContain('Sent as the bearer');
    expect(html).toContain('never shown again');
    expect(html).not.toContain('Delete the stored credential');
  });

  it('offers replacement and removal once something is stored, and renders the mask and never a value', () => {
    const html = draw({ masked: '***' });
    expect(html).toContain('Replace the credential');
    expect(html).toContain('Delete the stored credential');
    expect(html).toContain('***');
    expect(html).toContain('never shows the stored value');
    expect(html).not.toContain('Store the credential');
  });

  it('shows a refusal or a confirmation in the field, as an alert', () => {
    const html = draw({ masked: null, message: 'Enter the bearer the endpoint expects; an empty value stores nothing.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Enter the bearer the endpoint expects');
  });

  it('stands inside the endpoint block, between the model and the language, and says so when it is absent', () => {
    const withField = renderToStaticMarkup(createElement(DictationSettings, { value: { ...DICTATION_CONFIG_DEFAULT, backend: 'endpoint', base_url: 'http://h/v1', model: 'm' }, onChange: () => {}, credential: createElement(DictationCredentialField, { masked: null, busy: false, message: null, onStore: () => {}, onClear: () => {} }) }));
    expect(withField.indexOf('dictation-model')).toBeLessThan(withField.indexOf('dictation-credential'));
    expect(withField.indexOf('dictation-credential')).toBeLessThan(withField.indexOf('dictation-language'));
    const without = renderToStaticMarkup(createElement(DictationSettings, { value: { ...DICTATION_CONFIG_DEFAULT, backend: 'endpoint', base_url: 'http://h/v1', model: 'm' }, onChange: () => {} }));
    expect(without).toContain('The credential field is not available in this window.');
  });

  it('draws no credential field at all while the backend is not an endpoint', () => {
    const html = renderToStaticMarkup(createElement(DictationSettings, { value: { ...DICTATION_CONFIG_DEFAULT, backend: 'local' }, onChange: () => {}, credential: createElement(DictationCredentialField, { masked: null, busy: false, message: null, onStore: () => {}, onClear: () => {} }) }));
    expect(html).not.toContain('dictation-credential');
  });
});
